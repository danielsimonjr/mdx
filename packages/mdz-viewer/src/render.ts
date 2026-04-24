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
 *
 * The tag / attribute allowlists (`ALLOWED_TAGS`, `GLOBAL_ALLOWED_ATTRS`,
 * `TAG_ALLOWED_ATTRS`, `NEVER_ALLOWED_ATTRS`) are module-scope `const`s
 * and INTENTIONALLY NOT EXTENSIBLE from outside. Expanding the allowlist
 * is a security decision that requires a threat-model review + PR
 * discussion — file an issue with the requested tag / attribute and the
 * threat analysis if you need to change them.
 */

import { marked } from "marked";

// ---------------------------------------------------------------------------
// Trusted Types policy registration
// ---------------------------------------------------------------------------
//
// The viewer's CSP profile (docs/security/CSP.md) declares
// `require-trusted-types-for 'script'`. Without a matching policy
// registered, any assignment to `.innerHTML` fails and the viewer breaks.
// Register a single policy named "mdz-sanitizer" — inputs passing through
// it are guaranteed sanitized by this module.
//
// Registration is idempotent and guarded for environments without
// Trusted Types (most browsers outside Chromium and the test harness).

interface TrustedHTMLPolicy {
  createHTML(input: string): string;
}

let _trustedHtmlPolicy: TrustedHTMLPolicy | null = null;

function getTrustedHtmlPolicy(): TrustedHTMLPolicy | null {
  if (_trustedHtmlPolicy) return _trustedHtmlPolicy;
  const tt = (globalThis as unknown as { trustedTypes?: { createPolicy: (name: string, rules: { createHTML: (s: string) => string }) => TrustedHTMLPolicy } }).trustedTypes;
  if (!tt) return null;
  try {
    _trustedHtmlPolicy = tt.createPolicy("mdz-sanitizer", {
      // The identity function is safe here because this policy is only
      // reachable from the `renderMarkdown` sanitize path below — the
      // string reaching `createHTML` has already been through the
      // allowlist walk + URL rewriter.
      createHTML: (s: string) => s,
    });
    return _trustedHtmlPolicy;
  } catch {
    // A duplicate-name policy throws in some browsers if the host page
    // already registered "mdz-sanitizer" — degrade to the untyped path.
    return null;
  }
}

/**
 * Wrap a sanitized HTML string into a TrustedHTML when Trusted Types is
 * enforced. Returns the plain string otherwise (callers can assign to
 * innerHTML either way; TypeScript's type union covers both).
 */
export function toSanitizedHtml(html: string): string | TrustedHTML {
  const policy = getTrustedHtmlPolicy();
  return policy ? (policy.createHTML(html) as unknown as TrustedHTML) : html;
}

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

/**
 * Attributes that are NEVER allowed regardless of tag, even if a future
 * edit accidentally adds them to TAG_ALLOWED_ATTRS. Defense-in-depth
 * against the class of bugs where someone adds `iframe` back to
 * ALLOWED_TAGS and forgets that `srcdoc` lets iframes execute arbitrary
 * script-bearing HTML without ever resolving as a URL.
 */
const NEVER_ALLOWED_ATTRS: ReadonlySet<string> = new Set([
  "srcdoc",
  "innerhtml",
  "outerhtml",
  "data", // <object data="..."> can load script-bearing content
  "action", // <form action="...">
  "formaction", // <input formaction="...">
  "ping", // <a ping="..."> — tracking channel
  "background", // obsolete but still parsed
  "dynsrc",
  "lowsrc",
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
    // No DOMParser available — we refuse to emit HTML. Regex-based
    // "sanitization" is a well-known source of bypass bugs (slashes,
    // unusual whitespace, HTML entity escapes inside schemes) and would
    // give callers a dangerous false sense of safety.
    //
    // If a Node-side consumer actually needs to render MDZ to HTML, use
    // `jsdom` or `linkedom` in the call site to provide a DOMParser
    // polyfill before invoking this function.
    throw new Error(
      "mdz-viewer render: DOMParser is unavailable in this environment. " +
        "Install `linkedom` or `jsdom` and assign its DOMParser to globalThis " +
        "before calling renderMarkdown. Regex-based sanitization is not safe " +
        "for untrusted input.",
    );
  }
  // Wrap the fragment in a full HTML document so browsers and linkedom
  // agree on where `body` is. Browsers auto-wrap fragments in body;
  // linkedom does not, producing empty `doc.body` for bare fragments.
  const wrapped = `<!DOCTYPE html><html><head></head><body>${html}</body></html>`;
  const doc = new DOMParser().parseFromString(wrapped, "text/html");
  // Extract the body element robustly: browsers expose doc.body; linkedom
  // exposes it too but only when the input was wrapped (the case above).
  const body = doc.body ?? doc.querySelector?.("body");
  if (!body) {
    throw new Error(
      "mdz-viewer render: parsed document has no body element — DOMParser implementation is unsupported",
    );
  }
  walk(body, opts);
  return body.innerHTML;
}

/**
 * Tags whose CONTENTS are dropped (not hoisted) when the tag itself is
 * not on the allowlist. These are tags that typically contain foreign
 * content or script code where "preserve the children" would re-expose
 * the original attack surface (e.g., hoisting `<script>alert(1)</script>`
 * from inside `<svg>` into the parent keeps the script alive).
 */
const DROP_CONTENTS_TAGS: ReadonlySet<string> = new Set([
  "script",
  "style",
  "noscript",
  "svg",
  "math",
  "template",
  "iframe",
  "object",
  "embed",
  "applet",
]);

function walk(node: Element, opts: RenderOptions): void {
  // Iterate over a snapshot — we may remove children during walk.
  const children = Array.from(node.children);
  for (const child of children) {
    const tag = child.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      const parent = child.parentNode;
      if (!parent) continue;
      if (DROP_CONTENTS_TAGS.has(tag)) {
        // Drop element AND all descendants — "hoist children" on a
        // <script>/<svg>/etc. would re-expose the attack surface.
        parent.removeChild(child);
      } else {
        // Safe hoist: remove the element, keep its children. Recurse
        // into the hoisted children so disallowed descendants (e.g.,
        // <mi xlink:href="javascript:...">) are still handled.
        const hoisted: Node[] = [];
        while (child.firstChild) {
          hoisted.push(child.firstChild);
          parent.insertBefore(child.firstChild, child);
        }
        parent.removeChild(child);
        // Recurse on any element children we just promoted so they go
        // through the allowlist themselves.
        for (const n of hoisted) {
          if ((n as Element).tagName) walk(parent as Element, opts);
        }
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
    if (name.startsWith("on") || name.startsWith("xmlns")) {
      // Event handler or namespace declaration — unconditional drop.
      // xmlns is blocked because it enables SVG/MathML foreign content
      // which has its own script-capable attributes.
      el.removeAttribute(attr.name);
      continue;
    }
    if (NEVER_ALLOWED_ATTRS.has(name)) {
      // Defense-in-depth — even if a future edit to TAG_ALLOWED_ATTRS
      // added one of these, they never pass the sanitizer.
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

// Note: `fallbackStripScripts` was removed as of the Phase 3 security
// review. Regex-based HTML sanitization is not safe for untrusted input
// — any consumer that needs a Node-side renderer must provide a real
// DOM via `linkedom` or `jsdom`. The `sanitizeHtml` function above now
// throws a descriptive error when DOMParser is missing.
