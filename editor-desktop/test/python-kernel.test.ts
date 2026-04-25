/**
 * Tests for the pure pieces of the Pyodide kernel layer (Phase
 * 2.3b.1). The Pyodide bundle itself loads from CDN at runtime
 * and is exercised in Phase 2.3a.6 Playwright integration tests;
 * here we cover:
 *   - parseExecutionOutput: every branch of the harness contract
 *   - withTimeout: race semantics, cleanup
 *   - timeoutResult: shape
 *   - FakePythonKernel: scripted-result playback
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  parseExecutionOutput,
  withTimeout,
  timeoutResult,
  TimeoutError,
  FakePythonKernel,
  type RawExecutionRecord,
} from "../src/renderer/python-kernel.js";

describe("parseExecutionOutput", () => {
  it("returns ok with empty defaults for an empty record", () => {
    const r = parseExecutionOutput({});
    expect(r).toEqual({
      status: "ok",
      stdout: "",
      stderr: "",
      result: undefined,
      displayData: [],
      durationMs: 0,
    });
  });

  it("propagates stdout, stderr, result, duration", () => {
    const raw: RawExecutionRecord = {
      stdout: "hello\n",
      stderr: "warn\n",
      result: 42,
      duration_ms: 12.5,
    };
    const r = parseExecutionOutput(raw);
    expect(r.status).toBe("ok");
    expect(r.stdout).toBe("hello\n");
    expect(r.stderr).toBe("warn\n");
    expect(r.result).toBe(42);
    expect(r.durationMs).toBe(12.5);
  });

  it("marks status=error when raw.error is present and assembles a readable message", () => {
    const raw: RawExecutionRecord = {
      error: {
        name: "ZeroDivisionError",
        value: "division by zero",
        traceback: "Traceback (most recent call last):\n  …",
      },
      duration_ms: 3,
    };
    const r = parseExecutionOutput(raw);
    expect(r.status).toBe("error");
    expect(r.errorMessage).toContain("ZeroDivisionError");
    expect(r.errorMessage).toContain("division by zero");
    expect(r.errorMessage).toContain("Traceback");
  });

  it("collects display_data with string MIME values", () => {
    const raw: RawExecutionRecord = {
      display_data: [
        { data: { "text/html": "<b>x</b>", "text/plain": "x" } },
      ],
    };
    const r = parseExecutionOutput(raw);
    expect(r.displayData).toHaveLength(1);
    expect(r.displayData[0].data).toEqual({ "text/html": "<b>x</b>", "text/plain": "x" });
  });

  it("drops display entries with no string-typed payload", () => {
    const raw: RawExecutionRecord = {
      display_data: [
        { data: { "image/png": 123 as unknown as string } },  // wrong type
        { data: {} },
        null as unknown as { data?: Record<string, unknown> },
      ],
    };
    const r = parseExecutionOutput(raw);
    expect(r.displayData).toHaveLength(0);
  });

  it("preserves metadata when display data is valid", () => {
    const raw: RawExecutionRecord = {
      display_data: [
        { data: { "image/png": "base64data" }, metadata: { width: 640 } },
      ],
    };
    const r = parseExecutionOutput(raw);
    expect(r.displayData[0].metadata).toEqual({ width: 640 });
  });

  it("clamps negative duration to 0", () => {
    const r = parseExecutionOutput({ duration_ms: -5 });
    expect(r.durationMs).toBe(0);
  });
});

describe("withTimeout", () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it("resolves with the inner promise's value when it settles in time", async () => {
    const result = withTimeout(Promise.resolve("done"), 1000);
    await expect(result).resolves.toBe("done");
  });

  it("rejects with TimeoutError when the inner promise hangs", async () => {
    const hang = new Promise(() => { /* never resolves */ });
    const result = withTimeout(hang, 100);
    vi.advanceTimersByTime(101);
    await expect(result).rejects.toBeInstanceOf(TimeoutError);
  });

  it("propagates the inner promise's rejection unchanged", async () => {
    const fail = Promise.reject(new Error("boom"));
    await expect(withTimeout(fail, 1000)).rejects.toThrow("boom");
  });

  it("rejects with RangeError on non-positive timeout", async () => {
    await expect(withTimeout(Promise.resolve(1), 0)).rejects.toBeInstanceOf(RangeError);
    await expect(withTimeout(Promise.resolve(1), -5)).rejects.toBeInstanceOf(RangeError);
    await expect(withTimeout(Promise.resolve(1), Infinity)).rejects.toBeInstanceOf(RangeError);
  });
});

describe("timeoutResult", () => {
  it("produces a uniform timeout-status KernelResult", () => {
    const r = timeoutResult(5000);
    expect(r.status).toBe("timeout");
    expect(r.errorMessage).toContain("5000ms");
    expect(r.errorMessage).toContain("cannot be preempted");
    expect(r.durationMs).toBe(5000);
  });

  it("merges in partial fields when provided", () => {
    const r = timeoutResult(1000, { stdout: "partial output\n" });
    expect(r.stdout).toBe("partial output\n");
  });
});

describe("FakePythonKernel", () => {
  it("returns an empty success when nothing is queued", async () => {
    const k = new FakePythonKernel();
    const r = await k.run("print('hi')");
    expect(r.status).toBe("ok");
    expect(k.history).toEqual([{ code: "print('hi')", options: undefined }]);
  });

  it("plays queued results in FIFO order", async () => {
    const k = new FakePythonKernel();
    k.setNextResult({ status: "ok", stdout: "first\n", stderr: "", displayData: [], durationMs: 1 });
    k.setNextResult({ status: "ok", stdout: "second\n", stderr: "", displayData: [], durationMs: 2 });
    expect((await k.run("a")).stdout).toBe("first\n");
    expect((await k.run("b")).stdout).toBe("second\n");
  });

  it("threads RunOptions through the history", async () => {
    const k = new FakePythonKernel();
    await k.run("x", { timeoutMs: 1234 });
    expect(k.history[0].options).toEqual({ timeoutMs: 1234 });
  });

  it("re-throws scripted errors", async () => {
    const k = new FakePythonKernel();
    k.setNextError(new Error("kernel crashed"));
    await expect(k.run("x")).rejects.toThrow("kernel crashed");
  });

  it("setNextRaw passes through parseExecutionOutput", async () => {
    const k = new FakePythonKernel();
    k.setNextRaw({ stdout: "raw\n", error: { name: "ValueError", value: "bad" } });
    const r = await k.run("x");
    expect(r.status).toBe("error");
    expect(r.stdout).toBe("raw\n");
    expect(r.errorMessage).toContain("ValueError");
  });
});
