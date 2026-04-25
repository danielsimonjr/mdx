/**
 * Math rendering — KaTeX-based pre-marked transform.
 *
 * Detects `$inline$` and `$$display$$` LaTeX math in the source
 * markdown and replaces each instance with KaTeX-rendered HTML before
 * `marked.parse` runs. Math that fails to parse renders as a visible
 * `[?math: <error>]` marker (spec-compliant "visible miss"); KaTeX is
 * configured with `throwOnError: false` so a single bad span does not
 * fail the whole render.
 *
 * KaTeX output mode is `'html'` (NOT `'mathml'`). HTML mode produces
 * a tree of `<span>` elements with KaTeX class names — every tag is
 * already in the sanitizer's `ALLOWED_TAGS` allowlist, and KaTeX does
 * not emit script-capable foreign content. MathML mode would require
 * removing `math` from the sanitizer's `DROP_CONTENTS_TAGS` set, a
 * larger security review than this milestone needs.
 *
 * Bundle-cost note: KaTeX is ~75KB gzipped. The renderer is invoked
 * only when the math regex matches; documents without `$...$` pay a
 * regex scan but no KaTeX work. Browsers MUST also load KaTeX's CSS
 * (the symbol fonts) to render the equations correctly — host pages
 * are responsible for `<link rel="stylesheet" href="katex.min.css">`.
 * Without the CSS, equations render as fallback text, still readable.
 *
 * Spec reference: `spec/MDX_FORMAT_SPECIFICATION_v2.0.md` §5.1
 * (Markdown extensions including math).
 */

import katex from "katex";

import { escapeHtml } from "./escape.js";

/** Order matters: try `$$display$$` before single-`$` so we don't
 *  greedy-match `$$` as two adjacent inline spans. */
const DISPLAY_MATH = /\$\$([\s\S]+?)\$\$/g;
const INLINE_MATH = /(?<!\$)\$([^\n$]+?)\$(?!\$)/g;

/**
 * Pre-process LaTeX math in the source markdown. Runs after
 * `processDirectives` so directive-emitted text isn't math-processed,
 * and before `marked.parse` so the rendered HTML is treated as raw
 * HTML islands.
 */
export function processMath(md: string): string {
  // Fast path: no `$` at all means no math to process.
  if (!md.includes("$")) return md;

  let out = md.replace(DISPLAY_MATH, (_, tex) => renderDisplay(tex));
  out = out.replace(INLINE_MATH, (_, tex) => renderInline(tex));
  return out;
}

function renderInline(tex: string): string {
  return renderOne(tex, false);
}

function renderDisplay(tex: string): string {
  return renderOne(tex, true);
}

function renderOne(tex: string, displayMode: boolean): string {
  // Trim only outer whitespace — KaTeX is whitespace-sensitive inside.
  const source = tex.trim();
  if (!source) {
    // Empty `$$` / `$ $` — preserve original-ish marker so authors see it.
    return displayMode ? `<div class="katex-display katex-empty"></div>` : `<span class="katex-empty"></span>`;
  }
  try {
    const html = katex.renderToString(source, {
      displayMode,
      throwOnError: false,
      // Inline ARIA support: KaTeX emits `aria-hidden="true"` on the
      // visual layer + a `<span class="katex-html">` containing the
      // semantic structure. We add a wrapper span/div with an
      // aria-label of the literal TeX so screen readers fall back
      // gracefully when the host page hasn't loaded KaTeX CSS.
      output: "html",
      strict: "ignore",
    });
    const wrapperTag = displayMode ? "div" : "span";
    const wrapperClass = displayMode ? "mdz-math mdz-math-display" : "mdz-math mdz-math-inline";
    return `<${wrapperTag} class="${wrapperClass}" aria-label="${escapeHtml(source)}">${html}</${wrapperTag}>`;
  } catch (err) {
    // Belt-and-suspenders: throwOnError is false above, but a future
    // KaTeX change could surface other exceptions. Fall through to a
    // visible marker rather than dropping the math silently.
    const detail = err instanceof Error ? err.message : String(err);
    if (typeof console !== "undefined") {
      console.warn(`[mdz-viewer] math render failed: ${detail}`);
    }
    return renderError(source, detail, displayMode);
  }
}

function renderError(tex: string, message: string, displayMode: boolean): string {
  const tag = displayMode ? "div" : "span";
  return `<${tag} class="mdz-math mdz-math-error" aria-label="math error: ${escapeHtml(message)}">[?math: ${escapeHtml(tex)}]</${tag}>`;
}
