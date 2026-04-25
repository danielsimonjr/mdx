/**
 * Pure cell-runner for Python `::cell` blocks — Phase 2.3b.1.2.
 *
 * Three responsibilities:
 *   1. `extractPythonCells(markdown)` — find every
 *      `::cell{language=python …}` followed by a fenced source
 *      block and return its body, line range, and original
 *      surrounding text.
 *   2. `runCells(cells, kernel)` — run each cell through a
 *      `PythonKernel` (passing the spec's 30 s default timeout).
 *      Cells run sequentially so later cells see earlier cells'
 *      side effects (matches Jupyter's REPL semantics).
 *   3. `formatCellOutput(result)` — render a `KernelResult` as a
 *      `::output{type=...}` block ready to splice into the
 *      document.
 *
 * Insertion is the renderer's responsibility — this module returns
 * the formatted `::output` block + the markdown range to insert
 * after, and the caller (editor pane) does the dispatch.
 */
import type { KernelResult, PythonKernel, RunOptions } from "./python-kernel.js";

const CELL_OPEN_RE = /^::cell\{([^}]*)\}/;
const FENCE_RE = /^```(\w*)/;

export interface PythonCell {
  /** 0-based index in the cell list — used to label outputs in UI. */
  index: number;
  /** Raw cell source (the fenced code block contents, no fences). */
  source: string;
  /** Line attribute from `::cell{...}` brace, raw key=value pairs. */
  attributes: Record<string, string>;
  /**
   * 1-based line number where the `::cell{...}` directive starts.
   * Used to label outputs and to compute insertion offset.
   */
  startLine: number;
  /** 1-based line number where the closing fence sits. */
  endLine: number;
  /** Character offset (in `markdown.split('\n').join('\n')`) of the line AFTER endLine. */
  insertAfterOffset: number;
}

/**
 * Walk markdown source and return every Python cell. A cell is a
 * `::cell{language=python …}` directive followed (with optional
 * blank lines) by a fenced code block. We're permissive — the
 * directive's `language` attribute is what matters; the fence's
 * info string is decorative.
 */
export function extractPythonCells(markdown: string): PythonCell[] {
  const lines = markdown.split(/\r?\n/);
  const cells: PythonCell[] = [];
  let cursorOffset = 0;
  // Track byte offset per line to compute insertAfterOffset cheaply.
  const lineOffsets: number[] = [0];
  for (let i = 0; i < lines.length; i++) {
    cursorOffset += lines[i].length + 1; // +1 for newline
    lineOffsets.push(cursorOffset);
  }
  let i = 0;
  while (i < lines.length) {
    const m = CELL_OPEN_RE.exec(lines[i]);
    if (!m) { i++; continue; }
    const attrs = parseAttrs(m[1]);
    if ((attrs.language ?? "").toLowerCase() !== "python") { i++; continue; }
    const startLine = i + 1;
    // Skip blank lines until we hit the fence.
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;
    if (j >= lines.length) break;
    const fenceMatch = FENCE_RE.exec(lines[j]);
    if (!fenceMatch) { i = j; continue; }
    const fence = lines[j].match(/^(`{3,}|~{3,})/)?.[1] ?? "```";
    const sourceStart = j + 1;
    let k = sourceStart;
    while (k < lines.length && !lines[k].startsWith(fence)) k++;
    if (k >= lines.length) break; // unterminated fence
    const source = lines.slice(sourceStart, k).join("\n");
    const endLine = k + 1;
    cells.push({
      index: cells.length,
      source,
      attributes: attrs,
      startLine,
      endLine,
      insertAfterOffset: lineOffsets[endLine] ?? markdown.length,
    });
    i = k + 1;
  }
  return cells;
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Permissive parser: `key=value` pairs separated by whitespace.
  // Quoted values keep their quotes (the picker emits them when
  // values contain whitespace, but for cell directives we only
  // care about safe-token values like `language=python`).
  const re = /(\w+)=(?:"([^"]*)"|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    out[m[1]] = m[2] ?? m[3] ?? "";
  }
  return out;
}

// ---------------------------------------------------------------------------
// Run + format
// ---------------------------------------------------------------------------

export interface CellRunResult {
  cell: PythonCell;
  result: KernelResult;
}

/**
 * Run every cell sequentially. Earlier cells' side effects are
 * visible to later cells (Jupyter REPL semantics). Stops on the
 * first cell with `status === "error"` to mirror notebook UX —
 * authors can re-run the failing cell and continue.
 */
export async function runCells(
  cells: ReadonlyArray<PythonCell>,
  kernel: PythonKernel,
  defaults: RunOptions = {},
): Promise<CellRunResult[]> {
  const out: CellRunResult[] = [];
  await kernel.ready();
  for (const cell of cells) {
    const options: RunOptions = {
      timeoutMs: defaults.timeoutMs ?? 30_000,
      ...defaults,
    };
    const result = await kernel.run(cell.source, options);
    out.push({ cell, result });
    if (result.status === "error") break;
  }
  return out;
}

/**
 * Render a kernel result as one or more `::output{type=...}` blocks
 * matching the spec. The output mapping is:
 *
 *   stdout  → `::output{type=stdout}` fenced text
 *   stderr  → `::output{type=stderr}` fenced text
 *   error   → `::output{type=error}`  fenced text
 *   result  → `::output{type=result}` fenced text (if scalar)
 *   display → `::output{type=display}` per MIME bundle
 *
 * We collapse adjacent stdout chunks into one block. Empty fields
 * are omitted.
 */
export function formatCellOutput(result: KernelResult): string {
  const blocks: string[] = [];
  if (result.stdout) blocks.push(textOutputBlock("stdout", result.stdout));
  if (result.stderr) blocks.push(textOutputBlock("stderr", result.stderr));
  if (result.errorMessage) blocks.push(textOutputBlock("error", result.errorMessage));
  if (result.status === "ok" && result.result !== undefined && result.result !== null) {
    const repr = formatResultValue(result.result);
    if (repr) blocks.push(textOutputBlock("result", repr));
  }
  for (const display of result.displayData) {
    // Prefer rich MIME types in the order the spec implies.
    const mimePriority = ["text/html", "image/svg+xml", "image/png", "image/jpeg", "text/plain"];
    let chosen: string | null = null;
    for (const mime of mimePriority) {
      if (mime in display.data) { chosen = mime; break; }
    }
    if (!chosen) chosen = Object.keys(display.data)[0] ?? null;
    if (!chosen) continue;
    blocks.push(displayBlock(chosen, display.data[chosen]));
  }
  return blocks.join("\n\n") + (blocks.length > 0 ? "\n" : "");
}

function textOutputBlock(type: string, text: string): string {
  // Use 4-backtick fence so a triple-backtick inside the output
  // (rare but possible — e.g. an error traceback containing a
  // markdown snippet) doesn't break the block.
  return `::output{type=${type}}\n\`\`\`\`\n${text.replace(/`{4,}/g, (m) => m.slice(0, 3))}\n\`\`\`\``;
}

function displayBlock(mime: string, payload: string): string {
  if (mime === "text/html") {
    return `::output{type=display mime=text/html}\n\`\`\`\`html\n${payload}\n\`\`\`\``;
  }
  if (mime.startsWith("image/")) {
    // Embed as data: URI inline so the output renders without an asset write.
    return `::output{type=display mime=${mime}}\n![${mime}](data:${mime};base64,${payload})`;
  }
  return `::output{type=display mime=${mime}}\n\`\`\`\`\n${payload}\n\`\`\`\``;
}

function formatResultValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Splice `::output` blocks into the markdown after each cell. The
 * caller hands us the run results; we return the patched markdown
 * with output blocks inserted at each cell's `insertAfterOffset`.
 *
 * Insertion is right-to-left so earlier offsets stay valid.
 */
export function insertOutputs(
  markdown: string,
  runs: ReadonlyArray<CellRunResult>,
): string {
  if (runs.length === 0) return markdown;
  const sorted = [...runs].sort((a, b) => b.cell.insertAfterOffset - a.cell.insertAfterOffset);
  let out = markdown;
  for (const r of sorted) {
    const formatted = formatCellOutput(r.result);
    if (!formatted) continue;
    const offset = Math.min(r.cell.insertAfterOffset, out.length);
    out = `${out.slice(0, offset)}\n${formatted}${out.slice(offset)}`;
  }
  return out;
}
