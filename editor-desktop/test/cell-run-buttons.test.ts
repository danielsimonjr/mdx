/**
 * Tests for the per-cell Run wiring (Phase 2.3b.1.3).
 *
 * Tests the pure splice helper. The DOM `attachCellRunButtons`
 * surface is exercised by Phase 2.3a.7 Playwright when those
 * land — happy-dom would suffice but adding it just for these
 * tests is heavier than we want.
 */
import { describe, it, expect } from "vitest";
import { spliceSingleCellOutput } from "../src/renderer/cell-run-buttons.js";

describe("spliceSingleCellOutput", () => {
  const md = [
    "# Doc",
    "",
    "::cell{language=python kernel=python3}",
    "",
    "```python",
    "x = 1",
    "print(x)",
    "```",
    "",
    "Trailing prose.",
    "",
  ].join("\n");

  it("inserts an ::output block after the matching cell's closing fence", () => {
    const out = spliceSingleCellOutput(md, "x = 1\nprint(x)", {
      status: "ok",
      stdout: "1\n",
      stderr: "",
      displayData: [],
      durationMs: 12,
    });
    // The new ::output block should appear after the cell's closing fence
    // but before "Trailing prose."
    expect(out).toContain("::output{type=stdout}");
    const fenceClose = out.indexOf("```\n");
    const outputIdx = out.indexOf("::output");
    const proseIdx = out.indexOf("Trailing prose");
    expect(fenceClose).toBeGreaterThan(0);
    expect(outputIdx).toBeGreaterThan(fenceClose);
    expect(proseIdx).toBeGreaterThan(outputIdx);
  });

  it("returns the source unchanged when the cell body isn't found", () => {
    const out = spliceSingleCellOutput(md, "y = nonexistent", {
      status: "ok", stdout: "", stderr: "", displayData: [], durationMs: 0,
    });
    expect(out).toBe(md);
  });

  it("emits stderr / error / display blocks per the standard formatter", () => {
    const out = spliceSingleCellOutput(md, "x = 1\nprint(x)", {
      status: "error",
      stdout: "before crash\n",
      stderr: "warn\n",
      displayData: [],
      errorMessage: "ZeroDivisionError: division by zero",
      durationMs: 5,
    });
    expect(out).toContain("::output{type=stdout}");
    expect(out).toContain("::output{type=stderr}");
    expect(out).toContain("::output{type=error}");
    expect(out).toContain("ZeroDivisionError");
  });
});
