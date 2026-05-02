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

/**
 * Render the trust badge for one annotation.
 *
 * Tri-state semantics — the renderer must NEVER display a green
 * "signed" pill until cryptographic verification has actually
 * succeeded, even if `findTrustWarnings` produced no entry for this
 * annotation (e.g., reader-role annotations get no warning by spec):
 *
 *   - `verified === true` AND no warning   → "signed" (green)
 *   - warning matches this annotation       → severity-coloured pill
 *   - else (default)                        → "unverified" (neutral)
 *
 * The `verified` argument MUST be set explicitly by the caller; until
 * Phase 2.3b.4.4 wires the signature data from
 * `security/signatures.json`, callers should pass `false` and the
 * sidebar will correctly show "unverified" instead of an unearned
 * "signed" badge. Defaulting to `false` here means a forgotten
 * argument fails closed, not open.
 */
function trustPill(
  annotation: Annotation,
  warnings: ReadonlyArray<TrustWarning>,
  verified: boolean,
): string {
  const w = warnings.find((x) => x.annotationId === annotation.id);
  if (w) {
    const cls = w.severity === "error" ? "trust-error" : "trust-warning";
    return `<span class="annotation-trust ${cls}" title="${escapeHtml(w.reason)}">${escapeHtml(w.severity)}</span>`;
  }
  if (verified) {
    return `<span class="annotation-trust trust-ok" title="signed">signed</span>`;
  }
  return `<span class="annotation-trust trust-unverified" title="signature not yet verified">unverified</span>`;
}

function renderHeader(
  annotation: Annotation,
  warnings: ReadonlyArray<TrustWarning>,
  verified: boolean,
): string {
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
    trustPill(annotation, warnings, verified),
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
/**
 * Render a single thread (one root + its replies) recursively.
 *
 * Action buttons (Phase 2.3b.4.3):
 *   - Every annotation gets a `data-annotation-action="reply"` button.
 *     The button is unstyled here; CSS in `index.html` decorates it.
 *     Clicks are caught by `index.ts` event-delegation on
 *     `annotationListEl`.
 *   - Replies (`motivation === "replying"`) don't get a Reply button —
 *     the spec keeps reply chains flat (one level deep) by convention.
 */
export function renderAnnotationThread(
  node: AnnotationThreadNode,
  warnings: ReadonlyArray<TrustWarning>,
  verified: boolean = false,
): string {
  const a = node.annotation;
  const role = escapeHtml(a.role);
  const isReply = a.motivation === "replying";
  const actions = isReply
    ? ""
    : `<div class="annotation-actions">` +
      `<button type="button" data-annotation-action="reply" aria-label="Reply to this annotation">Reply</button>` +
      `</div>`;
  const replies = node.replies.length > 0
    ? `<div class="annotation-replies">${node.replies.map((r) => renderAnnotationThread(r, warnings, verified)).join("")}</div>`
    : "";
  return `<article class="annotation annotation-${role}" data-annotation-id="${escapeHtml(a.id)}">${renderHeader(a, warnings, verified)}${renderBody(a)}${actions}${replies}</article>`;
}

/** Render every thread in the sidebar's main panel.
 *
 * `verified` defaults to `false` so the sidebar fails closed: until the
 * caller explicitly opts into "signatures have been cryptographically
 * verified" (Phase 2.3b.4.4 wiring), every annotation surfaces as
 * "unverified" rather than as a misleading "signed" pill. */
export function renderAnnotationSidebar(
  threads: ReadonlyArray<AnnotationThreadNode>,
  warnings: ReadonlyArray<TrustWarning>,
  verified: boolean = false,
): string {
  if (threads.length === 0) {
    return `<p class="annotation-empty">No annotations.</p>`;
  }
  return threads.map((t) => renderAnnotationThread(t, warnings, verified)).join("");
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
