/**
 * Single-source HTML escape used by both `directives.ts` and
 * `references.ts`. Two near-identical copies in those files were
 * candidates for drift (someone hardens one, the other rots) — this
 * is the canonical implementation.
 *
 * Escapes the five HTML special characters. Does NOT escape Unicode
 * line-separator characters (U+2028, U+2029) — they're harmless inside
 * an HTML attribute value or text content; the JS-string escape concern
 * only applies if the output is embedded back into a `<script>` body,
 * which the viewer never does.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
