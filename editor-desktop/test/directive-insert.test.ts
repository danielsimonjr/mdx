/**
 * Tests for the directive insertion engine.
 *
 * Each builder MUST:
 *  1. Place exactly one CURSOR_SENTINEL.
 *  2. Produce text that, when fed to processDirectives, yields valid HTML.
 *     (We don't render here — we keep these tests purely string-based and
 *     leave the round-trip assertion to the picker acceptance tests in
 *     Phase 2.3a.5.1+.)
 *  3. Park the cursor at a sensible interior offset (inside the body for
 *     "fill in the blank" cases, after the closing brace when the user
 *     supplied all attributes).
 */
import { describe, it, expect } from "vitest";
import {
  splitOnCursor,
  buildCell,
  buildInclude,
  buildFig,
  buildCite,
  CURSOR_SENTINEL,
} from "../src/renderer/directive-insert.js";

describe("splitOnCursor", () => {
  it("strips the sentinel and reports its index", () => {
    const out = splitOnCursor(`a${CURSOR_SENTINEL}b`);
    expect(out.text).toBe("ab");
    expect(out.cursorOffset).toBe(1);
  });

  it("throws when the sentinel is missing", () => {
    expect(() => splitOnCursor("no sentinel here")).toThrow(/CURSOR_SENTINEL/);
  });

  it("only consumes the first sentinel occurrence", () => {
    // Defensive: a builder that accidentally double-inserts would hit this.
    const out = splitOnCursor(`a${CURSOR_SENTINEL}b${CURSOR_SENTINEL}c`);
    expect(out.text).toBe(`ab${CURSOR_SENTINEL}c`);
    expect(out.cursorOffset).toBe(1);
  });
});

describe("buildCell", () => {
  it("emits a python+python3 cell parked inside the source fence", () => {
    const out = buildCell();
    expect(out.text).toContain("::cell{language=python kernel=python3}");
    expect(out.text).toContain("```python\n\n```");
    // Cursor lands on the empty line between the fences.
    expect(out.text.charAt(out.cursorOffset - 1)).toBe("\n");
    expect(out.text.charAt(out.cursorOffset)).toBe("\n");
  });

  it("respects an explicit language", () => {
    const out = buildCell({ language: "r" });
    expect(out.text).toContain("language=r kernel=r3");
    expect(out.text).toContain("```r\n");
  });

  it("respects an explicit kernel", () => {
    const out = buildCell({ language: "julia", kernel: "julia-1.10" });
    expect(out.text).toContain("language=julia kernel=julia-1.10");
  });

  it("includes execution_count when provided", () => {
    const out = buildCell({ executionCount: 7 });
    expect(out.text).toContain("execution_count=7");
  });

  it("parks cursor at language slot when cursorInSource=false", () => {
    const out = buildCell({ cursorInSource: false });
    // Cursor should be just after `language=` and before `python`.
    const before = out.text.slice(0, out.cursorOffset);
    expect(before.endsWith("language=")).toBe(true);
    expect(out.text.slice(out.cursorOffset).startsWith("python")).toBe(true);
  });
});

describe("buildInclude", () => {
  it("parks cursor at the target slot when target is empty", () => {
    const out = buildInclude();
    expect(out.text).toBe("::include[target=]\n");
    expect(out.text.slice(out.cursorOffset).startsWith("]")).toBe(true);
  });

  it("emits a fully-formed include and parks cursor after it", () => {
    const out = buildInclude({ target: "snippets/intro.md" });
    expect(out.text.startsWith("::include[target=snippets/intro.md]")).toBe(true);
    expect(out.cursorOffset).toBeGreaterThan(out.text.indexOf("]"));
  });

  it("includes the fragment when provided", () => {
    const out = buildInclude({ target: "x.md", fragment: "intro" });
    expect(out.text).toContain("target=x.md fragment=intro");
  });

  it("includes the content_hash brace when provided", () => {
    const out = buildInclude({ target: "x.md", contentHash: "sha256-abc" });
    expect(out.text).toContain('{content_hash="sha256-abc"}');
  });
});

describe("buildFig", () => {
  it("defaults to ::fig and parks cursor at the id slot", () => {
    const out = buildFig();
    expect(out.text.startsWith("::fig{id=}")).toBe(true);
    // Cursor is just after `id=` and before the closing brace.
    expect(out.text.slice(out.cursorOffset).startsWith("}")).toBe(true);
  });

  it("supports eq and tab kinds", () => {
    expect(buildFig({ kind: "eq" }).text.startsWith("::eq{")).toBe(true);
    expect(buildFig({ kind: "tab" }).text.startsWith("::tab{")).toBe(true);
  });

  it("emits a known id and parks cursor in the body paragraph", () => {
    const out = buildFig({ kind: "fig", id: "fig-overview" });
    expect(out.text).toContain("::fig{id=fig-overview}");
    // Body paragraph follows the directive — cursor must land inside it.
    const body = out.text.slice(out.cursorOffset);
    expect(body).toBe("\n");
  });
});

describe("buildCite", () => {
  it("parks cursor inside the bracket when no keys provided", () => {
    const out = buildCite();
    expect(out.text).toBe("::cite[]");
    expect(out.cursorOffset).toBe("::cite[".length);
  });

  it("emits comma-joined keys and parks cursor after the citation", () => {
    const out = buildCite({ keys: ["smith2020", "jones2019"] });
    expect(out.text).toBe("::cite[smith2020,jones2019]");
    expect(out.cursorOffset).toBe(out.text.length);
  });

  it("includes locator prefix and suffix when provided", () => {
    const out = buildCite({
      keys: ["smith2020"],
      locator: { prefix: "see", suffix: "p. 42" },
    });
    expect(out.text).toContain('::cite[smith2020]{prefix="see" suffix="p. 42"}');
  });

  it("omits the locator brace when both prefix and suffix are absent", () => {
    const out = buildCite({ keys: ["x"], locator: {} });
    expect(out.text).toBe("::cite[x]");
  });
});
