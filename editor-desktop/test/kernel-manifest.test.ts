/**
 * Tests for the manifest.kernels projection (Phase 2.3b.1.3).
 */
import { describe, it, expect } from "vitest";
import { mergeKernelDeclaration } from "../src/renderer/kernel-manifest.js";

describe("mergeKernelDeclaration", () => {
  it("adds python.runtime=pyodide to a manifest with no kernels slot", () => {
    const out = mergeKernelDeclaration({}, "0.26.4");
    expect(out).toEqual({
      python: { runtime: "pyodide", version: "0.26.4" },
    });
  });

  it("preserves existing non-Python kernel declarations", () => {
    const m = { kernels: { r: { runtime: "WebR", version: "0.4.0" } } };
    const out = mergeKernelDeclaration(m, "0.26.4");
    expect(out).toEqual({
      r: { runtime: "WebR", version: "0.4.0" },
      python: { runtime: "pyodide", version: "0.26.4" },
    });
  });

  it("overwrites a stale Python declaration with the current Pyodide version", () => {
    const m = {
      kernels: { python: { runtime: "pyodide", version: "0.24.0" } },
    };
    const out = mergeKernelDeclaration(m, "0.26.4");
    if (out.python && typeof out.python === "object" && "version" in out.python) {
      expect(out.python.version).toBe("0.26.4");
    }
  });

  it("uses the default version when the caller doesn't pin one", () => {
    const out = mergeKernelDeclaration({});
    expect(out.python).toBeDefined();
    if (out.python && typeof out.python === "object" && "version" in out.python) {
      expect(typeof out.python.version).toBe("string");
      expect(out.python.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("does not mutate the input manifest", () => {
    const m = { kernels: { python: { runtime: "pyodide", version: "0.20.0" } } };
    const before = JSON.stringify(m);
    mergeKernelDeclaration(m, "0.26.4");
    expect(JSON.stringify(m)).toBe(before);
  });

  it("ignores a malformed `kernels` field (non-object) and starts fresh", () => {
    const m = { kernels: "not an object" };
    const out = mergeKernelDeclaration(m, "0.26.4");
    expect(out).toEqual({ python: { runtime: "pyodide", version: "0.26.4" } });
  });
});
