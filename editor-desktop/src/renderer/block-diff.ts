/**
 * Block-level markdown diff — Phase 2.3b.3.
 *
 * Treats paragraphs, headings, fenced code blocks, and directive
 * blocks (`::cell{...}` / `::fig{...}` / etc.) as atomic units. The
 * pipeline is:
 *   1. `tokenizeBlocks(source)` chunks raw markdown into Block records
 *      (one per logical block; blank lines are absorbed into separators).
 *   2. `diffBlocks(left, right)` runs a Myers-style LCS over the block
 *      hashes and emits an op stream — `equal`, `added`, `removed`,
 *      `modified` (where left+right blocks line up but their content
 *      differs).
 *   3. For `modified` blocks, callers can run `diffLines(left, right)`
 *      to get a line-level diff inside the block.
 *
 * The algorithm is pure and synchronous — it operates entirely on
 * strings, so it runs in node tests, the renderer, and the future
 * Phase 4.5 `delta-snapshots-v1` patch generator interchangeably.
 *
 * Round-trip with `delta-snapshots-v1` is deferred until the spec
 * itself ships (currently spec only); the block keys produced here
 * are designed to be stable enough that a snapshot patch can be
 * applied without a tree rebuild.
 */

export type BlockKind = "heading" | "paragraph" | "code" | "directive" | "list" | "quote" | "hr";

export interface Block {
  /** Coarse classification for UI rendering (header colour, icons). */
  kind: BlockKind;
  /** Raw markdown source of the block (including its trailing newline). */
  text: string;
  /** 1-based line number where the block starts in the original source. */
  startLine: number;
  /**
   * Stable identity key for diffing. For directives + headings we
   * hash the `id=` / heading-text rather than the full text, so a
   * small body edit shows as `modified` instead of `removed+added`.
   * For paragraphs and code blocks the key is the full text — those
   * have no natural identity.
   */
  key: string;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^(`{3,}|~{3,})/;
const DIRECTIVE_OPEN_RE = /^::([A-Za-z][A-Za-z0-9_-]*)/;
const CONTAINER_OPEN_RE = /^:::([A-Za-z][A-Za-z0-9_-]*)/;
const DIRECTIVE_ID_ATTR_RE = /\bid=([A-Za-z0-9_-]+)/;
const HR_RE = /^(-{3,}|_{3,}|\*{3,})\s*$/;
const LIST_RE = /^(\s*)([-*+]|\d+\.)\s+/;
const QUOTE_RE = /^>\s?/;

/**
 * Split markdown into block units. Blank lines act as block
 * separators; fenced code blocks consume everything between their
 * fences regardless of blank lines.
 */
export function tokenizeBlocks(source: string): Block[] {
  const lines = source.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    // Skip blank lines.
    if (lines[i].trim() === "") {
      i++;
      continue;
    }
    const startLine = i + 1;
    const line = lines[i];

    // Fenced code block.
    const fenceM = FENCE_RE.exec(line);
    if (fenceM) {
      const fence = fenceM[1];
      const buf: string[] = [line];
      i++;
      while (i < lines.length) {
        buf.push(lines[i]);
        if (lines[i].startsWith(fence)) {
          i++;
          break;
        }
        i++;
      }
      const text = buf.join("\n") + "\n";
      blocks.push({ kind: "code", text, startLine, key: text });
      continue;
    }

    // Heading (single line).
    const headingM = HEADING_RE.exec(line);
    if (headingM) {
      blocks.push({
        kind: "heading",
        text: line + "\n",
        startLine,
        key: `h${headingM[1].length}:${headingM[2].trim()}`,
      });
      i++;
      continue;
    }

    // Horizontal rule.
    if (HR_RE.test(line)) {
      blocks.push({ kind: "hr", text: line + "\n", startLine, key: "hr" });
      i++;
      continue;
    }

    // Container directive `:::name … :::` — must be checked before the
    // single-`::` directive open since `:::` would also match that
    // (the leading two colons consume, but the capture-group wants
    // a letter, so the single-`::` regex actually fails on `:::`).
    const containerM = CONTAINER_OPEN_RE.exec(line);
    if (containerM) {
      const buf: string[] = [line];
      i++;
      let depth = 1;
      while (i < lines.length && depth > 0) {
        const next = lines[i];
        buf.push(next);
        if (next.trim() === ":::") depth--;
        else if (CONTAINER_OPEN_RE.test(next)) depth++;
        i++;
      }
      const text = buf.join("\n") + "\n";
      const idAttr = DIRECTIVE_ID_ATTR_RE.exec(line);
      const key = idAttr ? `:::${containerM[1]}#${idAttr[1]}` : text;
      blocks.push({ kind: "directive", text, startLine, key });
      continue;
    }

    // Single-line / leaf directive `::name…`. Terminates at next blank line.
    const directiveM = DIRECTIVE_OPEN_RE.exec(line);
    if (directiveM) {
      const buf: string[] = [line];
      i++;
      while (i < lines.length && lines[i].trim() !== "") {
        buf.push(lines[i]);
        i++;
      }
      const text = buf.join("\n") + "\n";
      const idAttr = DIRECTIVE_ID_ATTR_RE.exec(line);
      const key = idAttr ? `::${directiveM[1]}#${idAttr[1]}` : text;
      blocks.push({ kind: "directive", text, startLine, key });
      continue;
    }

    // List or blockquote — accumulate consecutive non-blank lines.
    const isList = LIST_RE.test(line);
    const isQuote = QUOTE_RE.test(line);
    if (isList || isQuote) {
      const buf: string[] = [line];
      i++;
      while (i < lines.length && lines[i].trim() !== "") {
        const next = lines[i];
        if ((isList && (LIST_RE.test(next) || /^\s+/.test(next))) ||
            (isQuote && QUOTE_RE.test(next))) {
          buf.push(next);
          i++;
        } else break;
      }
      const text = buf.join("\n") + "\n";
      blocks.push({ kind: isList ? "list" : "quote", text, startLine, key: text });
      continue;
    }

    // Paragraph — accumulate until blank line.
    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "") {
      buf.push(lines[i]);
      i++;
    }
    const text = buf.join("\n") + "\n";
    blocks.push({ kind: "paragraph", text, startLine, key: text });
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export type BlockOp =
  | { op: "equal"; left: Block; right: Block }
  | { op: "added"; right: Block }
  | { op: "removed"; left: Block }
  /** Same identity key but body differs — `left` and `right` are paired. */
  | { op: "modified"; left: Block; right: Block };

/**
 * Two-source LCS over block keys. Where a left and right block share
 * a key but their text differs (e.g. a heading whose body changed,
 * or a directive whose attributes were edited), the op is
 * `modified` rather than `removed`+`added` — UI can render a
 * line-level diff inside.
 */
export function diffBlocks(left: ReadonlyArray<Block>, right: ReadonlyArray<Block>): BlockOp[] {
  // Standard LCS table on keys.
  const m = left.length;
  const n = right.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      lcs[i][j] = left[i - 1].key === right[j - 1].key
        ? lcs[i - 1][j - 1] + 1
        : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    }
  }

  const ops: BlockOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (left[i - 1].key === right[j - 1].key) {
      const l = left[i - 1];
      const r = right[j - 1];
      ops.push(l.text === r.text ? { op: "equal", left: l, right: r } : { op: "modified", left: l, right: r });
      i--;
      j--;
    } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
      ops.push({ op: "removed", left: left[i - 1] });
      i--;
    } else {
      ops.push({ op: "added", right: right[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    ops.push({ op: "removed", left: left[i - 1] });
    i--;
  }
  while (j > 0) {
    ops.push({ op: "added", right: right[j - 1] });
    j--;
  }
  ops.reverse();
  return ops;
}

// ---------------------------------------------------------------------------
// Line-level diff (for `modified` blocks)
// ---------------------------------------------------------------------------

export type LineOp =
  | { op: "equal"; line: string }
  | { op: "added"; line: string }
  | { op: "removed"; line: string };

/** Plain LCS-based line diff. Fine for short blocks (1–50 lines). */
export function diffLines(leftText: string, rightText: string): LineOp[] {
  const a = leftText.split(/\r?\n/);
  const b = rightText.split(/\r?\n/);
  const m = a.length;
  const n = b.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      lcs[i][j] = a[i - 1] === b[j - 1] ? lcs[i - 1][j - 1] + 1 : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    }
  }
  const out: LineOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.push({ op: "equal", line: a[i - 1] });
      i--;
      j--;
    } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
      out.push({ op: "removed", line: a[i - 1] });
      i--;
    } else {
      out.push({ op: "added", line: b[j - 1] });
      j--;
    }
  }
  while (i > 0) out.push({ op: "removed", line: a[i - 1] }), i--;
  while (j > 0) out.push({ op: "added", line: b[j - 1] }), j--;
  out.reverse();
  return out;
}

// ---------------------------------------------------------------------------
// Summary helpers
// ---------------------------------------------------------------------------

export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
}

export function summarizeBlockDiff(ops: ReadonlyArray<BlockOp>): DiffSummary {
  const out = { added: 0, removed: 0, modified: 0, unchanged: 0 };
  for (const o of ops) {
    if (o.op === "added") out.added++;
    else if (o.op === "removed") out.removed++;
    else if (o.op === "modified") out.modified++;
    else out.unchanged++;
  }
  return out;
}
