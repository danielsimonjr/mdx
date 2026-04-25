/**
 * Tests for the sync-scroll mapping helpers (Phase 2.3b.5.2).
 *
 * Pure paragraph-index lookups + proportional fallback. The
 * CodeMirror-side scroll-event wiring is exercised by Phase 2.3a.7
 * Playwright once those land.
 */
import { describe, it, expect } from "vitest";
import {
  buildSyncScrollState,
  paragraphAtLine,
  mapLineLeftToRight,
  mapLineRightToLeft,
  proportionalMap,
  mapWithFallback,
  resolveLineHeightPx,
} from "../src/renderer/sync-scroll.js";

const EN = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n";
const ES = "Primer párrafo.\n\nSegundo párrafo.\n\nTercer párrafo.\n";

describe("paragraphAtLine", () => {
  const slices = buildSyncScrollState(EN, ES).leftSlices;

  it("finds the paragraph for a line inside it", () => {
    // Paragraphs start at lines 1, 3, 5; line 1 → index 0.
    expect(paragraphAtLine(slices, 1)).toBe(0);
    expect(paragraphAtLine(slices, 3)).toBe(1);
    expect(paragraphAtLine(slices, 5)).toBe(2);
  });

  it("clamps to last paragraph when scrolled past the end", () => {
    expect(paragraphAtLine(slices, 9999)).toBe(slices.length - 1);
  });

  it("returns -1 for empty input", () => {
    expect(paragraphAtLine([], 1)).toBe(-1);
  });
});

describe("mapLineLeftToRight", () => {
  it("maps paragraph-index-aligned lines directly", () => {
    const state = buildSyncScrollState(EN, ES);
    // Line 3 in EN is paragraph 1; mapped to ES paragraph 1 starts at line 3.
    expect(mapLineLeftToRight(state, 3)).toBe(3);
    expect(mapLineLeftToRight(state, 5)).toBe(5);
  });

  it("returns null when alignment has no match", () => {
    // Right side is empty.
    const state = buildSyncScrollState(EN, "");
    expect(mapLineLeftToRight(state, 1)).toBeNull();
  });

  it("returns null when source has no paragraphs", () => {
    const state = buildSyncScrollState("", ES);
    expect(mapLineLeftToRight(state, 1)).toBeNull();
  });

  it("returns null when one side is shorter and target index is null", () => {
    const longer = "p1.\n\np2.\n\np3.\n";
    const shorter = "only one.\n";
    const state = buildSyncScrollState(longer, shorter);
    // EN paragraph 2 (line 5) has no alignment match in ES.
    expect(mapLineLeftToRight(state, 5)).toBeNull();
  });
});

describe("mapLineRightToLeft", () => {
  it("is symmetric with mapLineLeftToRight on aligned content", () => {
    const state = buildSyncScrollState(EN, ES);
    expect(mapLineRightToLeft(state, 3)).toBe(3);
  });

  it("returns null when reverse alignment misses", () => {
    const state = buildSyncScrollState("", ES);
    expect(mapLineRightToLeft(state, 1)).toBeNull();
  });
});

describe("proportionalMap", () => {
  it("maps by relative position when paragraphs of different lengths exist", () => {
    const long = "a.\n\nb.\n\nc.\n\nd.\n\ne.\n";
    const short = "X.\n";
    const state = buildSyncScrollState(long, short);
    // Long has 5 paragraphs at lines 1, 3, 5, 7, 9 — last = 9.
    // Short has 1 paragraph at line 1.
    expect(proportionalMap(state, 1, "ltr")).toBe(1);
    expect(proportionalMap(state, 9, "ltr")).toBe(1);
    // Mid-document: ratio is 0.5; target lastLine=1 so still 1.
    expect(proportionalMap(state, 5, "ltr")).toBe(1);
  });

  it("clamps the ratio between 0 and 1", () => {
    const state = buildSyncScrollState(EN, ES);
    expect(proportionalMap(state, 0, "ltr")).toBe(1);
    expect(proportionalMap(state, 9999, "ltr")).toBeLessThanOrEqual(state.rightSlices[state.rightSlices.length - 1].startLine);
  });
});

describe("mapWithFallback", () => {
  it("uses direct mapping when available", () => {
    const state = buildSyncScrollState(EN, ES);
    expect(mapWithFallback(state, 3, "ltr")).toBe(3);
  });

  it("falls back to proportional when direct mapping is null", () => {
    const longer = "p1.\n\np2.\n\np3.\n";
    const shorter = "only one.\n";
    const state = buildSyncScrollState(longer, shorter);
    // Line 5 (paragraph 2) has no alignment match — fallback hits.
    const result = mapWithFallback(state, 5, "ltr");
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThanOrEqual(1);
  });
});

describe("buildSyncScrollState", () => {
  it("aligns matching-length sources index-for-index", () => {
    const state = buildSyncScrollState(EN, ES);
    expect(state.alignment).toEqual([[0, 0], [1, 1], [2, 2]]);
  });

  it("pads with nulls when right is shorter", () => {
    const state = buildSyncScrollState(EN, "single.\n");
    expect(state.alignment).toEqual([[0, 0], [1, null], [2, null]]);
  });

  it("returns empty state for empty sources", () => {
    const state = buildSyncScrollState("", "");
    expect(state.alignment).toEqual([]);
    expect(state.leftSlices).toEqual([]);
    expect(state.rightSlices).toEqual([]);
  });
});

describe("resolveLineHeightPx", () => {
  // The node test environment doesn't expose `getComputedStyle`,
  // so the function falls back to the documented default. Verify
  // every branch via a stub element + a global stub for the
  // computed-style API.

  type StyleStub = { fontSize?: string; lineHeight?: string };
  const makeEl = (style: StyleStub): HTMLElement => {
    return { __style: style } as unknown as HTMLElement;
  };

  const withGetComputedStyle = (
    impl: ((el: HTMLElement) => StyleStub) | null,
    fn: () => void,
  ): void => {
    const original = (globalThis as { getComputedStyle?: unknown }).getComputedStyle;
    if (impl == null) {
      delete (globalThis as { getComputedStyle?: unknown }).getComputedStyle;
    } else {
      (globalThis as { getComputedStyle?: unknown }).getComputedStyle = (el: HTMLElement) =>
        impl(el) as unknown as CSSStyleDeclaration;
    }
    try {
      fn();
    } finally {
      if (original === undefined) {
        delete (globalThis as { getComputedStyle?: unknown }).getComputedStyle;
      } else {
        (globalThis as { getComputedStyle?: unknown }).getComputedStyle = original;
      }
    }
  };

  it("returns the explicit pixel value when lineHeight ends in px", () => {
    withGetComputedStyle(
      (el) => (el as unknown as { __style: StyleStub }).__style,
      () => {
        const el = makeEl({ fontSize: "16px", lineHeight: "20px" });
        expect(resolveLineHeightPx(el)).toBe(20);
      },
    );
  });

  it("multiplies unitless multiplier by the font-size in px", () => {
    withGetComputedStyle(
      (el) => (el as unknown as { __style: StyleStub }).__style,
      () => {
        const el = makeEl({ fontSize: "16px", lineHeight: "1.5" });
        expect(resolveLineHeightPx(el)).toBe(24);
      },
    );
  });

  it("falls back to font-size × 1.2 for the `normal` keyword", () => {
    withGetComputedStyle(
      (el) => (el as unknown as { __style: StyleStub }).__style,
      () => {
        const el = makeEl({ fontSize: "10px", lineHeight: "normal" });
        expect(resolveLineHeightPx(el)).toBeCloseTo(12, 5);
      },
    );
  });

  it("returns the supplied fallback when getComputedStyle is absent", () => {
    withGetComputedStyle(null, () => {
      expect(resolveLineHeightPx(makeEl({}), 99)).toBe(99);
    });
  });

  it("returns the default 24-px fallback when nothing else parses", () => {
    withGetComputedStyle(
      () => ({}),
      () => {
        const el = makeEl({});
        expect(resolveLineHeightPx(el)).toBe(24);
      },
    );
  });
});
