/**
 * Diff renderer — Phase 2.3b.3.2.
 *
 * Pure conversion from `BlockOp[]` / `LineOp[]` (from `block-diff.ts`)
 * to HTML strings the diff pane can drop straight into a container.
 *
 * The DOM-side modal lives in the renderer's index.ts; this module
 * is intentionally DOM-free so the conversion is testable in node.
 *
 * Output shape:
 *
 *   <section class="block-diff">
 *     <div class="block block-equal">
 *       <pre><code>… block text …</code></pre>
 *     </div>
 *     <div class="block block-modified">
 *       <h4>kind id (modified)</h4>
 *       <div class="line-diff">
 *         <div class="line line-equal"> a</div>
 *         <div class="line line-removed">-b</div>
 *         <div class="line line-added">+B</div>
 *       </div>
 *     </div>
 *     <div class="block block-removed"><pre><code>…</code></pre></div>
 *     <div class="block block-added"><pre><code>…</code></pre></div>
 *   </section>
 *
 * Block kinds are stable class suffixes; the modal's stylesheet
 * colors them green/red/yellow per common-diff convention.
 */
import { diffLines, type Block, type BlockOp } from "./block-diff.js";

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE[c]);
}

function blockHeader(block: Block): string {
  // Headings render their key as a friendly label; directives strip
  // the leading `::name#` prefix; everything else just gets the kind.
  if (block.kind === "heading") {
    const text = block.key.replace(/^h\d+:/, "");
    return `<h4 class="block-label">${escapeHtml(block.kind)} — ${escapeHtml(text)}</h4>`;
  }
  if (block.kind === "directive" && block.key.startsWith("::")) {
    return `<h4 class="block-label">${escapeHtml(block.key.split("#")[0])}${block.key.includes("#") ? ` (id=${escapeHtml(block.key.split("#")[1])})` : ""}</h4>`;
  }
  return `<h4 class="block-label">${escapeHtml(block.kind)} — line ${block.startLine}</h4>`;
}

function blockBody(block: Block): string {
  return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
}

function lineDiffHtml(left: string, right: string): string {
  const ops = diffLines(left, right);
  const rows: string[] = [];
  for (const o of ops) {
    const sigil = o.op === "equal" ? " " : o.op === "added" ? "+" : "-";
    const cls = `line line-${o.op}`;
    rows.push(`<div class="${cls}">${escapeHtml(sigil)}${escapeHtml(o.line)}</div>`);
  }
  return `<div class="line-diff">${rows.join("")}</div>`;
}

/** Render a single op as one HTML block. */
export function renderBlockOp(op: BlockOp): string {
  if (op.op === "equal") {
    return `<div class="block block-equal">${blockHeader(op.left)}${blockBody(op.left)}</div>`;
  }
  if (op.op === "removed") {
    return `<div class="block block-removed">${blockHeader(op.left)}${blockBody(op.left)}</div>`;
  }
  if (op.op === "added") {
    return `<div class="block block-added">${blockHeader(op.right)}${blockBody(op.right)}</div>`;
  }
  // modified
  return `<div class="block block-modified">${blockHeader(op.left)}${lineDiffHtml(op.left.text, op.right.text)}</div>`;
}

/** Render a full op stream as the diff pane's HTML. */
export function renderBlockOps(ops: ReadonlyArray<BlockOp>): string {
  if (ops.length === 0) {
    return `<section class="block-diff block-diff-empty"><p>No changes.</p></section>`;
  }
  const inner = ops.map(renderBlockOp).join("");
  return `<section class="block-diff">${inner}</section>`;
}

/**
 * Build the unified-stat header the modal puts above the diff —
 * "+12 / -3 / ~5 / =42" (added / removed / modified / unchanged).
 */
export function renderDiffStats(ops: ReadonlyArray<BlockOp>): string {
  const counts = { added: 0, removed: 0, modified: 0, equal: 0 };
  for (const o of ops) counts[o.op]++;
  return `<div class="diff-stats" aria-label="Diff statistics">+${counts.added} / -${counts.removed} / ~${counts.modified} / =${counts.equal}</div>`;
}
