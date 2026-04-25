/**
 * Tests for the block-level + line-level markdown diff.
 *
 * The block tokenizer is the heart of the algorithm — every error
 * branch (fenced code with embedded blanks, container directives
 * with nested directives, headings adjacent to paragraphs) needs
 * to land on the right block boundary, otherwise downstream LCS
 * over-aggregates.
 */
import { describe, it, expect } from "vitest";
import {
  tokenizeBlocks,
  diffBlocks,
  diffLines,
  summarizeBlockDiff,
} from "../src/renderer/block-diff.js";

describe("tokenizeBlocks", () => {
  it("splits paragraphs by blank lines", () => {
    const blocks = tokenizeBlocks("First paragraph.\n\nSecond paragraph.\n");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].kind).toBe("paragraph");
    expect(blocks[1].text).toContain("Second paragraph.");
  });

  it("returns no blocks for an empty source", () => {
    expect(tokenizeBlocks("")).toEqual([]);
    expect(tokenizeBlocks("\n\n\n")).toEqual([]);
  });

  it("treats single-line headings as their own block", () => {
    const blocks = tokenizeBlocks("# Title\n\nBody.\n");
    expect(blocks[0].kind).toBe("heading");
    expect(blocks[0].key).toBe("h1:Title");
    expect(blocks[1].kind).toBe("paragraph");
  });

  it("captures heading depth in the key", () => {
    expect(tokenizeBlocks("### Sub\n")[0].key).toBe("h3:Sub");
  });

  it("preserves blank lines inside a fenced code block", () => {
    const src = "```python\nimport sys\n\nprint('hi')\n```\n";
    const blocks = tokenizeBlocks(src);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("code");
    expect(blocks[0].text).toContain("import sys");
    expect(blocks[0].text).toContain("print('hi')");
  });

  it("uses directive id= as the diff key when present", () => {
    const blocks = tokenizeBlocks("::fig{id=overview}\nBody.\n");
    expect(blocks[0].kind).toBe("directive");
    expect(blocks[0].key).toBe("::fig#overview");
  });

  it("falls back to full text for directives without id=", () => {
    const blocks = tokenizeBlocks("::cell{language=python kernel=python3}\nBody.\n");
    expect(blocks[0].kind).toBe("directive");
    // Key is the full text (no stable identity to extract).
    expect(blocks[0].key).toBe(blocks[0].text);
  });

  it("collects container directives :::name…::: as one block", () => {
    const src = ":::note\nFirst paragraph.\n\nSecond.\n:::\n";
    const blocks = tokenizeBlocks(src);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("directive");
    expect(blocks[0].text).toContain("Second.");
  });

  it("treats horizontal rules as their own kind", () => {
    const blocks = tokenizeBlocks("Para.\n\n---\n\nNext.\n");
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "hr", "paragraph"]);
  });

  it("groups consecutive list lines into one list block", () => {
    const blocks = tokenizeBlocks("- a\n- b\n- c\n\nNext.\n");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].kind).toBe("list");
    expect(blocks[1].kind).toBe("paragraph");
  });

  it("groups consecutive blockquote lines", () => {
    const blocks = tokenizeBlocks("> a\n> b\n\nNext.\n");
    expect(blocks[0].kind).toBe("quote");
    expect(blocks[1].kind).toBe("paragraph");
  });

  it("reports startLine 1-indexed including blank-line offsets", () => {
    const blocks = tokenizeBlocks("\n\n# H\n\nBody.\n");
    expect(blocks[0].startLine).toBe(3);
    expect(blocks[1].startLine).toBe(5);
  });
});

describe("diffBlocks", () => {
  const tok = (s: string) => tokenizeBlocks(s);

  it("returns all-equal when sources match", () => {
    const ops = diffBlocks(tok("# A\n\nB.\n"), tok("# A\n\nB.\n"));
    expect(ops.every((o) => o.op === "equal")).toBe(true);
  });

  it("detects an added block at the end", () => {
    const ops = diffBlocks(tok("# A\n"), tok("# A\n\nNew.\n"));
    expect(ops.map((o) => o.op)).toEqual(["equal", "added"]);
  });

  it("detects a removed block at the start", () => {
    const ops = diffBlocks(tok("# A\n\nB.\n"), tok("B.\n"));
    expect(ops.map((o) => o.op)).toEqual(["removed", "equal"]);
  });

  it("emits `modified` when a heading body changes but level + text differ", () => {
    // Headings with different text get DIFFERENT keys (h1:A vs h1:B),
    // so this is removed+added, not modified — verify that.
    const ops = diffBlocks(tok("# A\n"), tok("# B\n"));
    const kinds = ops.map((o) => o.op);
    expect(kinds).toContain("removed");
    expect(kinds).toContain("added");
  });

  it("emits `modified` when a directive id stays but body changes", () => {
    const left = tok("::fig{id=overview}\nOld body.\n");
    const right = tok("::fig{id=overview}\nNew body.\n");
    const ops = diffBlocks(left, right);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe("modified");
  });

  it("handles a mid-document replacement", () => {
    const left = tok("# A\n\nFirst para.\n\n# C\n");
    const right = tok("# A\n\nNew para.\n\n# C\n");
    const ops = diffBlocks(left, right);
    const opNames = ops.map((o) => o.op);
    expect(opNames.filter((o) => o === "equal").length).toBe(2);
    // The paragraph changes from "First para." → "New para." — keys
    // are the full text, so this is removed+added.
    expect(opNames.filter((o) => o === "added" || o === "removed").length).toBe(2);
  });

  it("handles empty inputs on either side", () => {
    expect(diffBlocks([], tok("# A\n"))[0].op).toBe("added");
    expect(diffBlocks(tok("# A\n"), [])[0].op).toBe("removed");
  });
});

describe("diffLines", () => {
  it("returns all-equal when texts match", () => {
    const ops = diffLines("a\nb\nc", "a\nb\nc");
    expect(ops.every((o) => o.op === "equal")).toBe(true);
  });

  it("detects an inserted line", () => {
    const ops = diffLines("a\nc", "a\nb\nc");
    expect(ops.map((o) => `${o.op}:${o.line}`)).toEqual([
      "equal:a",
      "added:b",
      "equal:c",
    ]);
  });

  it("detects a removed line", () => {
    const ops = diffLines("a\nb\nc", "a\nc");
    expect(ops.map((o) => o.op)).toEqual(["equal", "removed", "equal"]);
  });

  it("handles complete replacement", () => {
    const ops = diffLines("a\nb", "x\ny");
    const lines = ops.map((o) => `${o.op}:${o.line}`);
    expect(lines).toContain("removed:a");
    expect(lines).toContain("added:y");
  });
});

describe("summarizeBlockDiff", () => {
  it("counts each op kind", () => {
    const left = tokenizeBlocks("# A\n\nP1.\n\n# C\n");
    const right = tokenizeBlocks("# A\n\nP2.\n\n# D\n");
    const summary = summarizeBlockDiff(diffBlocks(left, right));
    // # A is equal; P1 → P2 is removed+added; # C → # D is removed+added.
    expect(summary.unchanged).toBe(1);
    expect(summary.added).toBeGreaterThan(0);
    expect(summary.removed).toBeGreaterThan(0);
  });

  it("returns zeroes for empty op stream", () => {
    expect(summarizeBlockDiff([])).toEqual({ added: 0, removed: 0, modified: 0, unchanged: 0 });
  });
});
