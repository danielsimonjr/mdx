/**
 * Pure thread → HTML renderer for the annotation sidebar
 * (Phase 2.3b.4.2). The DOM-side wiring lives in `index.ts`; this
 * module is testable without a browser.
 *
 * Output shape (one root node per thread):
 *
 *   <article class="annotation annotation-{role} {motivation-class}">
 *     <header>
 *       <span class="annotation-role">reviewer</span>
 *       <span class="annotation-creator">Reviewer 1</span>
 *       <time>2026-04-12</time>
 *       <span class="annotation-trust trust-warning">unsigned</span>
 *     </header>
 *     <blockquote class="annotation-quote">… target.selector.exact …</blockquote>
 *     <div class="annotation-body">… body.value …</div>
 *     <div class="annotation-replies">
 *       <article class="annotation annotation-author replying">…</article>
 *     </div>
 *   </article>
 *
 * Decision-motivation annotations (review-accept / review-reject /
 * review-request-changes) get a strong-coloured pill so editors and
 * authors can scan a thread for outcomes at a glance. The trust
 * pill comes from `findTrustWarnings`; severity controls colour.
 */
import type {
  Annotation,
  AnnotationThreadNode,
  TrustWarning,
} from "./annotations.js";
import { escapeHtml } from "./html-escape.js";

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  // Render the date portion only — the time of day adds visual
  // noise without much value in a review timeline. Falls back to
  // raw if parsing fails.
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m ? m[1] : iso;
}

function motivationLabel(motivation: string): string {
  switch (motivation) {
    case "review-accept": return "Accepted";
    case "review-reject": return "Rejected";
    case "review-request-changes": return "Changes requested";
    case "review-confidential-comment": return "Confidential";
    case "replying": return "Reply";
    case "questioning": return "Question";
    case "commenting": return "Comment";
    default: return motivation;
  }
}

function isDecision(motivation: string): boolean {
  return motivation === "review-accept" || motivation === "review-reject" || motivation === "review-request-changes";
}

function trustPill(annotation: Annotation, warnings: ReadonlyArray<TrustWarning>): string {
  const w = warnings.find((x) => x.annotationId === annotation.id);
  if (!w) {
    return `<span class="annotation-trust trust-ok" title="signed">signed</span>`;
  }
  const cls = w.severity === "error" ? "trust-error" : "trust-warning";
  return `<span class="annotation-trust ${cls}" title="${escapeHtml(w.reason)}">${escapeHtml(w.severity)}</span>`;
}

function renderHeader(annotation: Annotation, warnings: ReadonlyArray<TrustWarning>): string {
  const role = escapeHtml(annotation.role);
  const motivation = escapeHtml(annotation.motivation);
  const creator = annotation.creator?.name ?? annotation.creator?.id ?? "(anonymous)";
  const date = formatDate(annotation.created);
  const motivationCls = isDecision(annotation.motivation) ? `decision decision-${annotation.motivation}` : "";
  return [
    `<header class="annotation-header">`,
    `<span class="annotation-role role-${role}">${role}</span>`,
    motivationCls
      ? `<span class="annotation-motivation ${motivationCls}">${escapeHtml(motivationLabel(annotation.motivation))}</span>`
      : `<span class="annotation-motivation">${escapeHtml(motivationLabel(annotation.motivation))}</span>`,
    `<span class="annotation-creator">${escapeHtml(creator)}</span>`,
    date ? `<time datetime="${escapeHtml(annotation.created!)}">${escapeHtml(date)}</time>` : "",
    trustPill(annotation, warnings),
    `</header>`,
    // Hidden marker so motivationCls is preserved for tests / a11y.
    motivationCls ? `<!-- ${motivation} -->` : "",
  ].filter(Boolean).join("");
}

function renderBody(annotation: Annotation): string {
  const value = annotation.body?.value ?? "";
  const target = annotation.target;
  const quote = typeof target === "object" && target.selector?.exact
    ? `<blockquote class="annotation-quote">${escapeHtml(target.selector.exact)}</blockquote>`
    : "";
  return `${quote}<div class="annotation-body">${escapeHtml(value)}</div>`;
}

/** Render a single thread (one root + its replies) recursively. */
export function renderAnnotationThread(
  node: AnnotationThreadNode,
  warnings: ReadonlyArray<TrustWarning>,
): string {
  const a = node.annotation;
  const role = escapeHtml(a.role);
  const replies = node.replies.length > 0
    ? `<div class="annotation-replies">${node.replies.map((r) => renderAnnotationThread(r, warnings)).join("")}</div>`
    : "";
  return `<article class="annotation annotation-${role}" data-annotation-id="${escapeHtml(a.id)}">${renderHeader(a, warnings)}${renderBody(a)}${replies}</article>`;
}

/** Render every thread in the sidebar's main panel. */
export function renderAnnotationSidebar(
  threads: ReadonlyArray<AnnotationThreadNode>,
  warnings: ReadonlyArray<TrustWarning>,
): string {
  if (threads.length === 0) {
    return `<p class="annotation-empty">No annotations.</p>`;
  }
  return threads.map((t) => renderAnnotationThread(t, warnings)).join("");
}

/** Compact summary for the sidebar header. */
export function summarizeAnnotations(threads: ReadonlyArray<AnnotationThreadNode>): string {
  // Count total annotations including replies.
  const count = (n: AnnotationThreadNode): number =>
    1 + n.replies.reduce((s, r) => s + count(r), 0);
  const total = threads.reduce((s, t) => s + count(t), 0);
  if (total === 0) return "0 annotations";
  return `${total} annotation${total === 1 ? "" : "s"} across ${threads.length} thread${threads.length === 1 ? "" : "s"}`;
}
