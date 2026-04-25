/**
 * Tests for the delta-snapshots-v1 reader (Phase 4.5).
 *
 * Per the spec's "Conformance" section, every error path must
 * surface a clear `SnapshotError` rather than silently returning
 * a partial document — these tests pin every branch.
 */
import { describe, it, expect } from "vitest";
import {
  parseIndex,
  resolveVersion,
  applyUnifiedDiff,
  reconstructVersionSync,
  SnapshotError,
  type SnapshotIndex,
} from "./snapshots.js";

const SIMPLE_INDEX_JSON = JSON.stringify({
  schema_version: "1.0.0",
  extension: "delta-snapshots-v1",
  chains: [
    {
      base: "history/snapshots/base/v1.0.0.md",
      base_version: "1.0.0",
      deltas: [
        { version: "1.1.0", patch: "history/snapshots/deltas/v1.1.0.patch", parent: "1.0.0" },
        { version: "1.2.0", patch: "history/snapshots/deltas/v1.2.0.patch", parent: "1.1.0" },
      ],
    },
  ],
});

describe("parseIndex", () => {
  it("accepts a valid index", () => {
    const idx = parseIndex(SIMPLE_INDEX_JSON);
    expect(idx.extension).toBe("delta-snapshots-v1");
    expect(idx.chains).toHaveLength(1);
    expect(idx.chains[0].deltas).toHaveLength(2);
  });

  it("rejects malformed JSON", () => {
    expect(() => parseIndex("{not json")).toThrow(SnapshotError);
  });

  it("rejects non-object root", () => {
    expect(() => parseIndex('"string"')).toThrow(SnapshotError);
  });

  it("rejects wrong extension declaration", () => {
    const bad = JSON.stringify({ extension: "delta-snapshots-v2", chains: [] });
    expect(() => parseIndex(bad)).toThrow(/extension/);
  });

  it("rejects empty chains array", () => {
    const bad = JSON.stringify({ extension: "delta-snapshots-v1", chains: [] });
    expect(() => parseIndex(bad)).toThrow(/at least one chain/);
  });

  it("rejects chain missing base", () => {
    const bad = JSON.stringify({
      extension: "delta-snapshots-v1",
      chains: [{ base_version: "1.0.0", deltas: [] }],
    });
    expect(() => parseIndex(bad)).toThrow(/base/);
  });

  it("rejects delta missing parent", () => {
    const bad = JSON.stringify({
      extension: "delta-snapshots-v1",
      chains: [{
        base: "b.md",
        base_version: "1.0.0",
        deltas: [{ version: "1.1.0", patch: "p" }],
      }],
    });
    expect(() => parseIndex(bad)).toThrow(/parent/);
  });

  it("rejects duplicate delta versions", () => {
    const bad = JSON.stringify({
      extension: "delta-snapshots-v1",
      chains: [{
        base: "b.md",
        base_version: "1.0.0",
        deltas: [
          { version: "1.1.0", patch: "a", parent: "1.0.0" },
          { version: "1.1.0", patch: "b", parent: "1.0.0" },
        ],
      }],
    });
    expect(() => parseIndex(bad)).toThrow(/duplicate/);
  });
});

describe("resolveVersion", () => {
  const idx = parseIndex(SIMPLE_INDEX_JSON);

  it("returns empty applyOrder for the base version", () => {
    const r = resolveVersion(idx, "1.0.0");
    expect(r.applyOrder).toEqual([]);
    expect(r.chain.base_version).toBe("1.0.0");
  });

  it("returns the chain in forward apply order for a leaf version", () => {
    const r = resolveVersion(idx, "1.2.0");
    expect(r.applyOrder.map((d) => d.version)).toEqual(["1.1.0", "1.2.0"]);
  });

  it("returns just one delta for an intermediate version", () => {
    const r = resolveVersion(idx, "1.1.0");
    expect(r.applyOrder.map((d) => d.version)).toEqual(["1.1.0"]);
  });

  it("throws when the requested version is not in any chain", () => {
    expect(() => resolveVersion(idx, "9.9.9")).toThrow(/not found/);
  });

  it("detects circular chains", () => {
    const circular: SnapshotIndex = {
      schema_version: "1.0.0",
      extension: "delta-snapshots-v1",
      chains: [{
        base: "b.md",
        base_version: "1.0.0",
        deltas: [
          { version: "A", patch: "a", parent: "B" },
          { version: "B", patch: "b", parent: "A" },
        ],
      }],
    };
    expect(() => resolveVersion(circular, "A")).toThrow(/circular/);
  });

  it("rejects chains exceeding maxChainDepth", () => {
    const deltas = Array.from({ length: 10 }, (_, i) => ({
      version: `1.${i + 1}.0`,
      patch: `p${i}`,
      parent: i === 0 ? "1.0.0" : `1.${i}.0`,
    }));
    const idx2: SnapshotIndex = {
      schema_version: "1.0.0",
      extension: "delta-snapshots-v1",
      chains: [{ base: "b.md", base_version: "1.0.0", deltas }],
    };
    expect(() => resolveVersion(idx2, "1.10.0", { maxChainDepth: 5 })).toThrow(/depth/);
  });
});

describe("applyUnifiedDiff", () => {
  it("applies a simple line replacement", () => {
    const source = "alpha\nbeta\ngamma\n";
    const patch =
      "--- v1\n+++ v2\n@@ -1,3 +1,3 @@\n alpha\n-beta\n+BETA\n gamma\n";
    expect(applyUnifiedDiff(source, patch)).toBe("alpha\nBETA\ngamma\n");
  });

  it("applies an insertion", () => {
    const source = "a\nc\n";
    const patch = "--- a\n+++ b\n@@ -1,2 +1,3 @@\n a\n+b\n c\n";
    expect(applyUnifiedDiff(source, patch)).toBe("a\nb\nc\n");
  });

  it("applies a deletion", () => {
    const source = "a\nb\nc\n";
    const patch = "--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-b\n c\n";
    expect(applyUnifiedDiff(source, patch)).toBe("a\nc\n");
  });

  it("preserves source without a trailing newline", () => {
    const source = "alpha\nbeta";
    const patch = "@@ -1,2 +1,2 @@\n alpha\n-beta\n+BETA\n";
    expect(applyUnifiedDiff(source, patch)).toBe("alpha\nBETA");
  });

  it("throws on context mismatch (returns no partial)", () => {
    const source = "alpha\nWRONG\ngamma\n";
    const patch =
      "@@ -1,3 +1,3 @@\n alpha\n-beta\n+BETA\n gamma\n";
    expect(() => applyUnifiedDiff(source, patch)).toThrow(SnapshotError);
  });

  it("threads version + line into the error", () => {
    const source = "wrong\n";
    const patch = "@@ -1,1 +1,1 @@\n right\n";
    try {
      applyUnifiedDiff(source, patch, "1.5.0");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(SnapshotError);
      expect((e as SnapshotError).version).toBe("1.5.0");
      expect((e as SnapshotError).patchLine).toBeGreaterThan(0);
    }
  });

  it("handles multi-hunk patches", () => {
    const source = "a\nb\nc\nd\ne\nf\ng\n";
    // First hunk modifies line 2; second modifies line 6.
    const patch =
      "@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n@@ -5,3 +5,3 @@\n e\n-f\n+F\n g\n";
    expect(applyUnifiedDiff(source, patch)).toBe("a\nB\nc\nd\ne\nF\ng\n");
  });
});

describe("reconstructVersionSync (end-to-end)", () => {
  it("rebuilds the leaf version from the base + patch chain", () => {
    const v100 = "alpha\nbeta\ngamma\n";
    const p110 =
      "--- v1.0.0.md\n+++ v1.1.0.md\n@@ -1,3 +1,3 @@\n alpha\n-beta\n+BETA\n gamma\n";
    const p120 =
      "--- v1.1.0.md\n+++ v1.2.0.md\n@@ -1,3 +1,3 @@\n alpha\n-BETA\n+B-E-T-A\n gamma\n";
    const idx = parseIndex(SIMPLE_INDEX_JSON);
    const entries = new Map<string, string>([
      ["history/snapshots/base/v1.0.0.md", v100],
      ["history/snapshots/deltas/v1.1.0.patch", p110],
      ["history/snapshots/deltas/v1.2.0.patch", p120],
    ]);
    expect(reconstructVersionSync(idx, "1.2.0", entries)).toBe("alpha\nB-E-T-A\ngamma\n");
    expect(reconstructVersionSync(idx, "1.1.0", entries)).toBe("alpha\nBETA\ngamma\n");
    expect(reconstructVersionSync(idx, "1.0.0", entries)).toBe(v100);
  });

  it("errors clearly when the base file is missing", () => {
    const idx = parseIndex(SIMPLE_INDEX_JSON);
    expect(() => reconstructVersionSync(idx, "1.0.0", new Map())).toThrow(/base file/);
  });

  it("errors clearly when a patch file is missing", () => {
    const idx = parseIndex(SIMPLE_INDEX_JSON);
    const entries = new Map<string, string>([
      ["history/snapshots/base/v1.0.0.md", "x\n"],
    ]);
    expect(() => reconstructVersionSync(idx, "1.1.0", entries)).toThrow(/patch/);
  });
});
