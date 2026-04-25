/**
 * Sync-scroll mapping for multi-locale side-by-side editing
 * (Phase 2.3b.5.2).
 *
 * Pure helpers that translate a scroll position in one locale's
 * markdown source into the equivalent position in a sibling locale,
 * using the paragraph-alignment table from `locales.ts`. The
 * DOM-side wiring lives in `index.ts`; this module is testable
 * without a browser.
 *
 * Mapping strategy:
 *   1. Find which paragraph the source's scroll-y intersects.
 *   2. Look up the paragraph index in the alignment table.
 *   3. Project to the target locale's same-position paragraph
 *      (or null when the alignment has no match — caller falls
 *      back to proportional scroll).
 *   4. Convert the target paragraph back to a scroll-y in the
 *      target's source.
 *
 * Edge cases the tests pin:
 *   - Empty source on either side
 *   - Scroll past the last paragraph (clamps to bottom)
 *   - Alignment mismatch (returns null so caller falls back)
 */
import type { ParagraphSlice } from "./locales.js";
import { paragraphSlices, alignParagraphs } from "./locales.js";

export interface SyncScrollState {
  leftSlices: ParagraphSlice[];
  rightSlices: ParagraphSlice[];
  /** Pairs by index; null indicates no corresponding paragraph. */
  alignment: Array<[number | null, number | null]>;
}

export function buildSyncScrollState(left: string, right: string): SyncScrollState {
  const leftSlices = paragraphSlices(left);
  const rightSlices = paragraphSlices(right);
  return {
    leftSlices,
    rightSlices,
    alignment: alignParagraphs(leftSlices, rightSlices),
  };
}

/**
 * Find the paragraph index that contains the given line number.
 * Returns -1 if the line is past the last paragraph (caller can
 * choose to clamp or return null).
 */
export function paragraphAtLine(slices: ReadonlyArray<ParagraphSlice>, line: number): number {
  for (let i = 0; i < slices.length; i++) {
    const start = slices[i].startLine;
    const end = i + 1 < slices.length ? slices[i + 1].startLine - 1 : Infinity;
    if (line >= start && line <= end) return i;
  }
  return slices.length > 0 ? slices.length - 1 : -1;
}

/**
 * Map a left-pane line number to the equivalent right-pane line.
 * Returns null when the alignment has no match for the source
 * paragraph; caller can fall back to proportional positioning.
 */
export function mapLineLeftToRight(state: SyncScrollState, leftLine: number): number | null {
  if (state.leftSlices.length === 0 || state.rightSlices.length === 0) return null;
  const leftIdx = paragraphAtLine(state.leftSlices, leftLine);
  if (leftIdx < 0) return null;
  // Find the alignment entry for this left paragraph.
  for (const [l, r] of state.alignment) {
    if (l === leftIdx) {
      if (r == null) return null;
      return state.rightSlices[r]?.startLine ?? null;
    }
  }
  return null;
}

/** Symmetric reverse mapping (used when the right pane is the scroll source). */
export function mapLineRightToLeft(state: SyncScrollState, rightLine: number): number | null {
  if (state.leftSlices.length === 0 || state.rightSlices.length === 0) return null;
  const rightIdx = paragraphAtLine(state.rightSlices, rightLine);
  if (rightIdx < 0) return null;
  for (const [l, r] of state.alignment) {
    if (r === rightIdx) {
      if (l == null) return null;
      return state.leftSlices[l]?.startLine ?? null;
    }
  }
  return null;
}

/**
 * Proportional fallback: when paragraph alignment misses, map by
 * relative document offset (line-count ratio). Always returns a
 * sensible line in the target.
 */
export function proportionalMap(
  state: SyncScrollState,
  sourceLine: number,
  direction: "ltr" | "rtl",
): number {
  const sourceLastLine = direction === "ltr"
    ? state.leftSlices[state.leftSlices.length - 1]?.startLine ?? 1
    : state.rightSlices[state.rightSlices.length - 1]?.startLine ?? 1;
  const targetLastLine = direction === "ltr"
    ? state.rightSlices[state.rightSlices.length - 1]?.startLine ?? 1
    : state.leftSlices[state.leftSlices.length - 1]?.startLine ?? 1;
  if (sourceLastLine <= 1) return 1;
  const ratio = Math.min(1, Math.max(0, (sourceLine - 1) / (sourceLastLine - 1)));
  return Math.round(1 + ratio * (targetLastLine - 1));
}

/**
 * Convenience wrapper combining direct mapping + proportional fallback.
 * Caller passes a scroll line; returns the best-effort target line.
 */
export function mapWithFallback(
  state: SyncScrollState,
  sourceLine: number,
  direction: "ltr" | "rtl",
): number {
  const direct = direction === "ltr"
    ? mapLineLeftToRight(state, sourceLine)
    : mapLineRightToLeft(state, sourceLine);
  if (direct != null) return direct;
  return proportionalMap(state, sourceLine, direction);
}

/**
 * Resolve a scrollable element's effective line height in pixels.
 * Reads `getComputedStyle(...).lineHeight`; handles the three forms
 * the spec allows:
 *   - `<length>px`         → parsed directly
 *   - `<number>` (unitless) → multiply by font-size in pixels
 *   - `"normal"`            → browser default ≈ 1.2 × font-size
 *
 * Replaces the prior hard-coded `1.5 * 13.6` magic number that
 * broke whenever the user changed their default browser font
 * size or the modal CSS evolved. Default fallback (1.5 × 16 px) is
 * the minimum the test environment guarantees.
 */
export function resolveLineHeightPx(el: HTMLElement, fallbackPx = 24): number {
  if (typeof getComputedStyle !== "function") return fallbackPx;
  try {
    const style = getComputedStyle(el);
    const fontPx = parseFloat(style.fontSize);
    const lh = style.lineHeight;
    if (!lh || lh === "normal") {
      return Number.isFinite(fontPx) ? fontPx * 1.2 : fallbackPx;
    }
    if (lh.endsWith("px")) {
      const v = parseFloat(lh);
      return Number.isFinite(v) ? v : fallbackPx;
    }
    // Unitless multiplier — see CSS spec.
    const mult = parseFloat(lh);
    if (Number.isFinite(mult) && Number.isFinite(fontPx)) return mult * fontPx;
    return fallbackPx;
  } catch {
    return fallbackPx;
  }
}
