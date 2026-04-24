/**
 * Markdown rendering + safe HTML sanitization.
 *
 * Uses `marked` for CommonMark + GFM parsing (tables, task lists). The
 * output is passed through a conservative sanitizer that:
 *   - strips <script>, <iframe>, <object>, <embed>, <form>, event handlers
 *   - resolves archive-relative asset URLs to blob URLs via `resolveAsset`
 *   - preserves alignment classes and heading ids (v1.1 attribute syntax)
 *
 * The sanitizer is intentionally strict: untrusted MDZ archives MUST not
 * be able to execute script, exfiltrate data, or hijack the host page.
 * This is the Phase 3 CSP enforcement point at the viewer layer.
 */

import { marked, type Renderer } from "marked";

export interface RenderOptions {
  /**
   * Map an archive-relative asset path (e.g., "assets/images/fig.png")
   * to a blob URL or `null` if the asset isn't in the archive.
   */
  resolveAsset: (path: string) => string | null;
}

/**
 * HTML elements allowed in rendered output. Anything not on this list is
 * stripped (its children kept). Keep this list narrow — expansion is a
 * security decision, not a convenience.
 */
const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  "a", "abbr", "article", "aside", "b", "blockquote", "br", "caption",
  "cite", "code", "col", "colgroup", "dd", "del", "details", "dfn", "div",
  "dl", "dt", "em", "figcaption", "figure", "footer", "h1", "h2", "h3",
  "h4", "h5", "h6", "header", "hr", "i", "img", "ins", "kbd", "li",
  "main", "mark", "nav", "ol", "p", "picture", "pre", "q", "rp", "rt",
  "ruby", "s", "samp", "section", "small", "source", "span", "strong",
  "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead",
  "time", "tr", "u", "ul", "var", "wbr",
  // Media — allowed but with src attribute rewriting enforced below.
  "audio", "video", "track",
]);

/** Attributes allowed on any element. Event handlers (on*) always stripped. */
const GLOBAL_ALLOWED_ATTRS: ReadonlySet<string> = new Set([
  "id", "class", "title", "lang", "dir", "role", "tabindex",
  "aria-label", "aria-labelledby", "aria-describedby", "aria-hidden",
  "aria-live", "aria-atomic", "aria-busy", "aria-current", "aria-details",
  "aria-expanded", "aria-level", "aria-pressed", "aria-selected",
]);

/** Per-tag allowed attributes beyond the global set. */
const TAG_ALLOWED_ATTRS: Record<string, readonly string[]> = {
  a: ["href", "rel", "target", "download"],
  img: ["src", "srcset", "sizes", "alt", "width", "height", "loading", "decoding"],
  source: ["src", "srcset", "type", "media", "sizes"],
  picture: [],
  video: ["src", "poster", "controls", "loop", "muted", "preload", "width", "height"],
  audio: ["src", "controls", "loop", "muted", "preload"],
  track: ["src", "kind", "srclang", "label", "default"],
  th: ["colspan", "rowspan", "scope"],
  td: ["colspan", "rowspan", "headers"],
  ol: ["start", "reversed", "type"],
  li: ["value"],
  time: ["datetime"],
  details: ["open"],
  abbr: ["title"],
};

/**
 * Render MDZ markdown to sanitized HTML.
 */
export function renderMarkdown(
  md: string,
  opts: RenderOptions,
): string {
  // marked() is synchronous when `async: false` — but the types allow
  // Promise. Force sync via the synchronous API and coerce the return.
  const rawHtml = marked.parse(md, { async: false, gfm: true }) as string;
  return sanitizeHtml(rawHtml, opts);
}

// ---------------------------------------------------------------------------
// Sanitizer
// ---------------------------------------------------------------------------

/**
 * Sanitize HTML: parse via DOMParser, walk the tree, drop/allow each
 * node, rewrite asset URLs, return serialized HTML.
 *
 * Runs in the browser — the viewer explicitly targets browser + CF Worker
 * environments, both of which provide DOMParser (CF Worker via
 * `@cloudflare/workers-types` / `HTMLRewriter` can be swapped later if
 * this path becomes hot).
 */
function sanitizeHtml(html: string, opts: RenderOptions): string {
  if (typeof DOMParser === "undefined") {
    // Environment without DOMParser (e.g., bare Node test). Fall back to
    // a tag-stripping regex — not ideal but prevents script injection.
    // Real browser environments always take the DOMParser path above.
    return fallbackStripScripts(html);
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  walk(doc.body, opts);
  return doc.body.innerHTML;
}

function walk(node: Element, opts: RenderOptions): void {
  // Iterate over a snapshot — we may remove children during walk.
  const children = Array.from(node.children);
  for (const child of children) {
    const tag = child.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      // Drop the element but preserve its children by hoisting them up.
      const parent = child.parentNode;
      if (parent) {
        while (child.firstChild) parent.insertBefore(child.firstChild, child);
        parent.removeChild(child);
      }
      continue;
    }
    sanitizeAttributes(child, tag, opts);
    walk(child, opts);
  }
}

function sanitizeAttributes(
  el: Element,
  tag: string,
  opts: RenderOptions,
): void {
  const allowed = new Set<string>([
    ...GLOBAL_ALLOWED_ATTRS,
    ...(TAG_ALLOWED_ATTRS[tag] ?? []),
  ]);
  // Snapshot attrs — removeAttribute mutates the live list.
  const attrs = Array.from(el.attributes);
  for (const attr of attrs) {
    const name = attr.name.toLowerCase();
    if (name.startsWith("on")) {
      // Event handler — unconditional drop.
      el.removeAttribute(attr.name);
      continue;
    }
    if (!allowed.has(name)) {
      el.removeAttribute(attr.name);
      continue;
    }
    // URL attributes — rewrite to blob URL for archive-relative paths,
    // drop dangerous protocols (javascript:, data: with HTML, etc.).
    if (isUrlAttr(name)) {
      const rewritten = rewriteUrl(attr.value, opts);
      if (rewritten === null) el.removeAttribute(attr.name);
      else el.setAttribute(attr.name, rewritten);
    }
  }
  // For <a target="_blank">, force rel="noopener noreferrer" to prevent
  // tab-nabbing — a standard hardening step.
  if (tag === "a" && el.getAttribute("target") === "_blank") {
    const existing = (el.getAttribute("rel") ?? "").split(/\s+/);
    if (!existing.includes("noopener")) existing.push("noopener");
    if (!existing.includes("noreferrer")) existing.push("noreferrer");
    el.setAttribute("rel", existing.filter(Boolean).join(" "));
  }
}

function isUrlAttr(name: string): boolean {
  return (
    name === "href" ||
    name === "src" ||
    name === "poster" ||
    name === "srcset"
  );
}

/**
 * Rewrite a URL found in the markdown. Returns:
 *   - a blob URL for archive-relative paths that resolve
 *   - the original URL for absolute http(s) / mailto / tel URLs
 *   - null for disallowed schemes (javascript:, vbscript:, data:, file:)
 */
function rewriteUrl(
  url: string,
  opts: RenderOptions,
): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Disallow dangerous schemes outright. data: is permitted only for
  // image/* since many Markdown pipelines embed inline images that way,
  // but even that is debatable — we err on the safe side and strip.
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("data:")
  ) {
    return null;
  }

  // Absolute URL — pass through.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith("//")) {
    return trimmed;
  }
  // Fragment (same-page anchor) — pass through.
  if (trimmed.startsWith("#")) return trimmed;
  // mailto:, tel:, etc. — pass through specific safe opaque schemes.
  if (
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:") ||
    lower.startsWith("sms:")
  ) {
    return trimmed;
  }

  // srcset is a comma-separated list; rewrite each url piece.
  if (trimmed.includes(",") && /\s\d+[wx]/.test(trimmed)) {
    return trimmed
      .split(",")
      .map((piece) => {
        const [u, descriptor = ""] = piece.trim().split(/\s+/, 2);
        const rewritten = rewriteUrl(u, opts);
        return rewritten ? `${rewritten} ${descriptor}`.trim() : "";
      })
      .filter(Boolean)
      .join(", ");
  }

  // Archive-relative path — ask the caller to resolve.
  const blob = opts.resolveAsset(trimmed);
  return blob;
}

function fallbackStripScripts(html: string): string {
  // Used only in environments lacking DOMParser. Production viewer runs
  // in a browser; this is a defensive fallback for tests.
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}
