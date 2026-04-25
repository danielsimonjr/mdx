/**
 * Per-cell Run buttons — Phase 2.3b.1.3.
 *
 * After every preview render the editor calls
 * `attachCellRunButtons(previewHost, opts)` to inject a "Run" button
 * next to each Python `::cell` block. Clicking it invokes the same
 * kernel the toolbar uses, runs the cell's source standalone, and
 * either prepends an `::output` block to the document or surfaces
 * the result in the title bar.
 *
 * The renderer side (Phase 2.1's `directives.ts`) embeds the cell's
 * source + language as `data-mdz-cell-*` attributes; this module
 * reads them, so we don't need to re-parse the rendered HTML.
 *
 * UI: each Python cell gets a single button absolutely-positioned in
 * the cell's top-right corner. The button is added once per render;
 * `attachCellRunButtons` is idempotent — re-calling on the same DOM
 * doesn't duplicate buttons (it tags processed cells with
 * `data-mdz-run-attached`).
 */
import type { PythonKernel } from "./python-kernel.js";
import { runCells, insertOutputs, type PythonCell } from "./cell-runner.js";

const ATTACHED_FLAG = "mdzRunAttached";
const PROCESSED_CLASS = "mdz-run-button";

export interface CellRunButtonsOptions {
  /** Get the python kernel — async because it lazy-loads on first use. */
  getKernel: () => Promise<PythonKernel>;
  /**
   * Called after a single cell finishes running. The handler is
   * responsible for splicing the result back into the source (e.g.
   * the editor's `pane.setContent` flow).
   */
  onCellRun: (cell: SyntheticCell, runResult: import("./python-kernel.js").KernelResult) => void;
  /** Reports flow-level status to the title bar. */
  onStatus?: (text: string) => void;
}

/**
 * A subset of `PythonCell` we can synthesize from a single rendered
 * cell DOM node. We don't have line offsets here (the rendered HTML
 * has lost them), so callers that need to splice an `::output` back
 * into the source must use string-search rather than offset-based
 * insertion.
 */
export interface SyntheticCell {
  source: string;
  language: string;
  /** Index among all Python cells in the preview (0-based). */
  index: number;
}

/**
 * Walk the preview host for `[data-mdz-cell-language="python"]`
 * elements and inject a Run button into each. Idempotent.
 */
export function attachCellRunButtons(
  previewHost: HTMLElement,
  opts: CellRunButtonsOptions,
): void {
  const cells = previewHost.querySelectorAll<HTMLElement>(
    '[data-mdz-cell-language="python"]',
  );
  let cellIndex = 0;
  for (const cell of Array.from(cells)) {
    if ((cell.dataset as Record<string, string | undefined>)[ATTACHED_FLAG] === "1") {
      cellIndex++;
      continue;
    }
    const source = cell.dataset.mdzCellSource;
    if (!source) {
      cellIndex++;
      continue;
    }
    const button = makeRunButton(cellIndex, source, opts);
    // Position the button: ensure the cell is `position: relative`
    // so the button absolutely-positions inside it. We don't fight
    // existing CSS — set inline style only when not already set.
    if (!cell.style.position) cell.style.position = "relative";
    cell.appendChild(button);
    (cell.dataset as Record<string, string>)[ATTACHED_FLAG] = "1";
    cellIndex++;
  }
}

function makeRunButton(
  index: number,
  source: string,
  opts: CellRunButtonsOptions,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = PROCESSED_CLASS;
  btn.textContent = "▶ Run";
  btn.title = "Run this Python cell";
  btn.setAttribute("aria-label", `Run cell ${index + 1}`);
  btn.style.cssText = [
    "position:absolute",
    "top:0.4rem",
    "right:0.4rem",
    "padding:0.2rem 0.55rem",
    "border:1px solid #1d4ed8",
    "border-radius:3px",
    "background:white",
    "color:#1d4ed8",
    "cursor:pointer",
    "font-size:0.75rem",
    "font-family:inherit",
  ].join(";");
  btn.addEventListener("click", () => {
    void runOne(index, source, btn, opts);
  });
  return btn;
}

async function runOne(
  index: number,
  source: string,
  btn: HTMLButtonElement,
  opts: CellRunButtonsOptions,
): Promise<void> {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Loading…";
  try {
    const kernel = await opts.getKernel();
    btn.textContent = "Running…";
    // Synthesize a `PythonCell` shell — `runCells` only reads
    // `.source` for the actual eval, but it expects the other
    // fields to be present (TS-typed).
    const synthetic: PythonCell = {
      index,
      source,
      attributes: { language: "python" },
      startLine: 1,
      endLine: 1,
      insertAfterOffset: 0,
    };
    const runs = await runCells([synthetic], kernel);
    const result = runs[0]?.result;
    if (!result) {
      opts.onStatus?.(`Cell ${index + 1}: kernel returned no result`);
      return;
    }
    opts.onCellRun({ source, language: "python", index }, result);
    if (result.status === "ok") {
      opts.onStatus?.(`Cell ${index + 1}: ok`);
    } else if (result.status === "timeout") {
      opts.onStatus?.(`Cell ${index + 1}: timed out`);
    } else {
      opts.onStatus?.(`Cell ${index + 1}: ${result.errorMessage?.split("\n")[0] ?? "error"}`);
    }
  } catch (e) {
    opts.onStatus?.(`Cell ${index + 1} failed: ${(e as Error).message}`);
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

/**
 * Splice a single cell's output into a markdown source string.
 * Caller hands the current source + the cell's source + the run
 * result; we return the patched source. Used by the editor to
 * write back after a per-cell Run.
 *
 * Strategy: find the literal `::cell{…python…}` directive line
 * whose fenced body matches `cellSource`, then `insertOutputs`
 * with a synthetic `PythonCell` that points at the right offset.
 */
export function spliceSingleCellOutput(
  markdown: string,
  cellSource: string,
  result: import("./python-kernel.js").KernelResult,
): string {
  // Find the closing fence that ends the matching cell. The
  // simplest reliable match: the cell's body is uniquely present
  // after a `::cell` directive line, so locate the body string +
  // walk forward to the closing fence.
  const bodyIdx = markdown.indexOf(cellSource);
  if (bodyIdx < 0) return markdown; // body not found — silently skip
  // Walk forward to the line ending the fenced block.
  let cursor = bodyIdx + cellSource.length;
  // Skip past the trailing newline after the body (if any).
  if (markdown.charAt(cursor) === "\n") cursor++;
  // Find and consume the closing fence line.
  const fenceEnd = markdown.indexOf("\n", cursor);
  const insertAfter = fenceEnd >= 0 ? fenceEnd + 1 : markdown.length;
  const synthetic: PythonCell = {
    index: 0,
    source: cellSource,
    attributes: { language: "python" },
    startLine: 1,
    endLine: 1,
    insertAfterOffset: insertAfter,
  };
  return insertOutputs(markdown, [{ cell: synthetic, result }]);
}
