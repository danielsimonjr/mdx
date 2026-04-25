/**
 * Canonical HTML-escape for the renderer (Phase 4.6.9).
 *
 * Three modules previously kept their own copy of the same
 * five-character escape map (`diff-render.ts`, `annotations-render.ts`,
 * `index.ts`'s `escapeHtmlSimple`). They drifted in subtle ways —
 * `index.ts`'s variant skipped the apostrophe escape, which is
 * fine for innerHTML interpolation but wrong if a value ever ends
 * up inside an attribute. Consolidating here removes the
 * accidental capability gap.
 *
 * Use this for any user-controlled text that lands in:
 *   - innerHTML interpolation
 *   - attribute values inside a template-literal HTML string
 *   - textContent that's later wrapped in a tag
 *
 * Don't use it for:
 *   - URL components → use `encodeURIComponent`
 *   - JSON output → use `JSON.stringify`
 *   - DOM attribute APIs (`setAttribute`) — those escape automatically
 */

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const ESCAPE_RE = /[&<>"']/g;

/**
 * Escape the five HTML5-significant characters. Handles `null` /
 * `undefined` callers by coercing to empty string — convenient
 * when feeding optional fields straight into a template literal
 * without an explicit `?? ""` at every call site.
 */
export function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).replace(ESCAPE_RE, (c) => ESCAPE_MAP[c]);
}
