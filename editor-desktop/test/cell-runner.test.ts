/**
 * Tests for the Python cell runner orchestration layer (Phase 2.3b.1.2).
 *
 * Covers the pure pieces:
 *   - extractPythonCells: directive detection, language filter,
 *     fenced-source pickup, cell ordering
 *   - runCells: sequential execution, stop-on-error, timeout
 *     defaulting
 *   - formatCellOutput: every output-type → ::output block mapping
 *   - insertOutputs: right-to-left splice keeping offsets valid
 */
import { describe, it, expect } from "vitest";
import {
  extractPythonCells,
  runCells,
  formatCellOutput,
  insertOutputs,
} from "../src/renderer/cell-runner.js";
import { FakePythonKernel, type KernelResult } from "../src/renderer/python-kernel.js";

const ok = (overrides: Partial<KernelResult> = {}): KernelResult => ({
  status: "ok",
  stdout: "",
  stderr: "",
  displayData: [],
  durationMs: 0,
  ...overrides,
});

const err = (msg: string): KernelResult => ({
  status: "error",
  stdout: "",
  stderr: "",
  displayData: [],
  errorMessage: msg,
  durationMs: 0,
});

describe("extractPythonCells", () => {
  it("returns no cells for empty markdown", () => {
    expect(extractPythonCells("")).toEqual([]);
    expect(extractPythonCells("# just prose\n")).toEqual([]);
  });

  it("extracts a single python cell", () => {
    const md = [
      "::cell{language=python kernel=python3}",
      "",
      "```python",
      "x = 1",
      "print(x)",
      "```",
      "",
    ].join("\n");
    const cells = extractPythonCells(md);
    expect(cells).toHaveLength(1);
    expect(cells[0].source).toBe("x = 1\nprint(x)");
    expect(cells[0].attributes).toMatchObject({ language: "python", kernel: "python3" });
  });

  it("ignores cells whose language isn't python", () => {
    const md = "::cell{language=r kernel=r3}\n```r\nx <- 1\n```\n";
    expect(extractPythonCells(md)).toEqual([]);
  });

  it("extracts cells in document order", () => {
    const md = [
      "::cell{language=python}",
      "```python",
      "a = 1",
      "```",
      "",
      "Some prose.",
      "",
      "::cell{language=python}",
      "```python",
      "b = 2",
      "```",
    ].join("\n");
    const cells = extractPythonCells(md);
    expect(cells).toHaveLength(2);
    expect(cells[0].source).toBe("a = 1");
    expect(cells[1].source).toBe("b = 2");
    expect(cells[0].index).toBe(0);
    expect(cells[1].index).toBe(1);
  });

  it("tolerates blank lines between directive and fence", () => {
    const md = "::cell{language=python}\n\n\n```python\nx = 1\n```\n";
    const cells = extractPythonCells(md);
    expect(cells).toHaveLength(1);
    expect(cells[0].source).toBe("x = 1");
  });

  it("computes insertAfterOffset pointing past the closing fence", () => {
    const md = "::cell{language=python}\n```python\nx=1\n```\nNEXT\n";
    const cells = extractPythonCells(md);
    expect(cells).toHaveLength(1);
    // Offset should land at the start of "NEXT\n".
    expect(md.slice(cells[0].insertAfterOffset)).toBe("NEXT\n");
  });
});

describe("runCells", () => {
  it("runs each cell sequentially and returns results in order", async () => {
    const kernel = new FakePythonKernel();
    kernel.setNextResult(ok({ stdout: "first\n" }));
    kernel.setNextResult(ok({ stdout: "second\n" }));
    const md = [
      "::cell{language=python}\n```python\na=1\n```",
      "::cell{language=python}\n```python\nb=2\n```",
    ].join("\n\n");
    const cells = extractPythonCells(md);
    const runs = await runCells(cells, kernel);
    expect(runs).toHaveLength(2);
    expect(runs[0].result.stdout).toBe("first\n");
    expect(runs[1].result.stdout).toBe("second\n");
    expect(kernel.history.map((h) => h.code)).toEqual(["a=1", "b=2"]);
  });

  it("stops on the first error", async () => {
    const kernel = new FakePythonKernel();
    kernel.setNextResult(ok({ stdout: "first\n" }));
    kernel.setNextResult(err("ZeroDivisionError"));
    kernel.setNextResult(ok({ stdout: "third — should not reach\n" }));
    const md = [
      "::cell{language=python}\n```python\na=1\n```",
      "::cell{language=python}\n```python\nb=1/0\n```",
      "::cell{language=python}\n```python\nc=3\n```",
    ].join("\n\n");
    const cells = extractPythonCells(md);
    const runs = await runCells(cells, kernel);
    expect(runs).toHaveLength(2);
    expect(runs[1].result.status).toBe("error");
    expect(kernel.history).toHaveLength(2);
  });

  it("threads default timeout into the run options", async () => {
    const kernel = new FakePythonKernel();
    const md = "::cell{language=python}\n```python\nx=1\n```";
    await runCells(extractPythonCells(md), kernel);
    expect(kernel.history[0].options).toMatchObject({ timeoutMs: 30_000 });
  });

  it("respects an overridden timeout default", async () => {
    const kernel = new FakePythonKernel();
    const md = "::cell{language=python}\n```python\nx=1\n```";
    await runCells(extractPythonCells(md), kernel, { timeoutMs: 5_000 });
    expect(kernel.history[0].options).toMatchObject({ timeoutMs: 5_000 });
  });

  it("returns an empty array for no cells", async () => {
    const kernel = new FakePythonKernel();
    expect(await runCells([], kernel)).toEqual([]);
  });
});

describe("formatCellOutput", () => {
  it("emits a stdout block when stdout is non-empty", () => {
    const out = formatCellOutput(ok({ stdout: "hello\n" }));
    expect(out).toContain("::output{type=stdout}");
    expect(out).toContain("hello");
  });

  it("emits a stderr block separately from stdout", () => {
    const out = formatCellOutput(ok({ stdout: "ok\n", stderr: "warn\n" }));
    expect(out).toContain("::output{type=stdout}");
    expect(out).toContain("::output{type=stderr}");
  });

  it("emits an error block on status=error", () => {
    const out = formatCellOutput(err("ValueError: bad"));
    expect(out).toContain("::output{type=error}");
    expect(out).toContain("ValueError: bad");
  });

  it("emits a result block for scalar last-expression values", () => {
    expect(formatCellOutput(ok({ result: 42 }))).toContain("::output{type=result}");
    expect(formatCellOutput(ok({ result: "hi" }))).toContain("::output{type=result}");
    expect(formatCellOutput(ok({ result: true }))).toContain("::output{type=result}");
  });

  it("does not emit a result block when result is undefined or null", () => {
    expect(formatCellOutput(ok({ result: undefined }))).not.toContain("type=result");
    expect(formatCellOutput(ok({ result: null }))).not.toContain("type=result");
  });

  it("renders text/html display data with html fence info", () => {
    const out = formatCellOutput(ok({
      displayData: [{ data: { "text/html": "<b>x</b>", "text/plain": "x" } }],
    }));
    expect(out).toContain("type=display");
    expect(out).toContain("text/html");
    expect(out).toContain("<b>x</b>");
  });

  it("inlines images as data: URIs", () => {
    const out = formatCellOutput(ok({
      displayData: [{ data: { "image/png": "iVBORw0KGgo=" } }],
    }));
    expect(out).toContain("data:image/png;base64,iVBORw0KGgo=");
  });

  it("emits empty output when nothing to show", () => {
    expect(formatCellOutput(ok())).toBe("");
  });
});

describe("insertOutputs", () => {
  it("returns markdown unchanged when no runs", () => {
    const md = "# x\n";
    expect(insertOutputs(md, [])).toBe(md);
  });

  it("inserts an output block after each cell", () => {
    const md = "::cell{language=python}\n```python\nx=1\n```\nNEXT\n";
    const cells = extractPythonCells(md);
    const result = insertOutputs(md, [{ cell: cells[0], result: ok({ stdout: "hi\n" }) }]);
    expect(result).toContain("::output{type=stdout}");
    expect(result.indexOf("::output")).toBeGreaterThan(result.indexOf("```\n"));
    expect(result).toContain("NEXT");
  });

  it("inserts multiple outputs right-to-left so offsets stay valid", () => {
    const md = [
      "::cell{language=python}\n```python\na=1\n```",
      "::cell{language=python}\n```python\nb=2\n```",
    ].join("\n\n") + "\n";
    const cells = extractPythonCells(md);
    const runs = [
      { cell: cells[0], result: ok({ stdout: "first\n" }) },
      { cell: cells[1], result: ok({ stdout: "second\n" }) },
    ];
    const result = insertOutputs(md, runs);
    // Both blocks present.
    const firstIdx = result.indexOf("first");
    const secondIdx = result.indexOf("second");
    expect(firstIdx).toBeGreaterThan(0);
    expect(secondIdx).toBeGreaterThan(firstIdx);
  });
});
