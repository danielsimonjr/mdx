/**
 * MDZ directive pre-processor.
 *
 * Transforms `::cell` / `::output` / `::fig` / `::eq` / `::tab` / `::ref` /
 * `::cite` / `::bibliography` directives into HTML that survives the
 * `render.ts` sanitizer. Runs BEFORE `marked.parse` so the resulting
 * markdown is a mix of plain markdown and HTML islands.
 *
 * Why two-pass:
 *   - Pass 1 collects every `::fig{id=}` / `::eq{id=}` / `::tab{id=}` and
 *     assigns a stable sequential number per kind (Figure 1, 2, 3 …;
 *     Equation 1, 2 …). Also collects every distinct `::cite[key]` so the
 *     downstream `::bibliography` block can render only the references
 *     actually cited (matching pandoc-citeproc's default behavior).
 *   - Pass 2 substitutes the directives. `::ref[id]` lookups need the full
 *     id-to-number map, which is why pass 1 has to finish first.
 *
 * Sanitizer interaction: every output token uses tags from
 * `render.ts::ALLOWED_TAGS` (figure, figcaption, div, span, cite, a,
 * section, ol, li) and attributes from `GLOBAL_ALLOWED_ATTRS` (id, class,
 * aria-*). No `data-*` attributes — those are not in the global allowlist
 * and would be stripped, so we use class names to convey metadata
 * downstream consumers (CSS, screen readers) can act on.
 *
 * Spec references:
 *   - `spec/grammar/mdz-directives.abnf` (block + inline grammar)
 *   - `spec/directives/references-csl.md` (citation + bibliography)
 *   - `spec/MDX_FORMAT_SPECIFICATION_v2.0.md` §11 (cells), §12 (includes)
 */

import { renderCslEntry, formatInlineCitation, type CslEntry } from "./references.js";
import { escapeHtml } from "./escape.js";

export type LabeledKind = "fig" | "eq" | "tab";

export interface DirectiveOptions {
  /** CSL-JSON references, keyed by `id`. Empty object disables citation
   *  rendering — citations render as the literal `[key]` marker.
   */
  references: Readonly<Record<string, CslEntry>>;
  /** Citation style for `::cite` rendering. Default: `chicago-author-date`. */
  citationStyle?: string;
}

interface FirstPassResult {
  /** id → human-readable label (e.g., "Figure 3"). */
  labels: Map<string, string>;
  /** Distinct citation keys in order of first appearance. */
  citationOrder: string[];
}

/** Per-kind label prefix. Defaults are English; see TODO at end of file. */
const LABEL_PREFIX: Record<LabeledKind, string> = {
  fig: "Figure",
  eq: "Equation",
  tab: "Table",
};

/**
 * Block-level matchers run on whole-line patterns. Each matches a
 * directive marker that opens or stands alone on its own line.
 *
 * **ASCII-only ids and citation keys (deliberate).** The patterns below
 * restrict to `[A-Za-z0-9_-]`, matching the ABNF grammar at
 * `spec/grammar/mdz-directives.abnf`. CSL-JSON ids in real-world
 * BibTeX-imported bibliographies sometimes contain non-ASCII characters
 * (e.g. `müller2020`, `张2021`). When such a directive is encountered,
 * the inline matcher fails to bind and the literal text passes through
 * to `marked.parse` — visible as plain text in the rendered output, not
 * silently dropped. This is intentional spec-conformant behavior; the
 * pass-through test in `directives.test.ts` pins it. Broadening the
 * charset to `\p{L}\p{N}` is a v2.2 grammar update, not a viewer bug.
 */
const FIG_LINE = /^::(fig|eq|tab)\{([^}]*)\}\s*$/;
const REF_INLINE = /::ref\[([A-Za-z][A-Za-z0-9_\-]*)\]/g;
const CITE_INLINE = /::cite\[([A-Za-z0-9_,\-\s]+)\](?:\{([^}]*)\})?/g;
const BIBLIOGRAPHY_LINE = /^::bibliography(?:\{([^}]*)\})?\s*$/;

/**
 * Run pass-1 collection over the source markdown.
 */
function collect(md: string): FirstPassResult {
  const labels = new Map<string, string>();
  const counters: Record<LabeledKind, number> = { fig: 0, eq: 0, tab: 0 };
  for (const line of md.split("\n")) {
    const m = FIG_LINE.exec(line);
    if (!m) continue;
    const kind = m[1] as LabeledKind;
    const id = parseId(m[2]);
    if (!id) continue;
    counters[kind] += 1;
    labels.set(id, `${LABEL_PREFIX[kind]} ${counters[kind]}`);
  }

  const citationOrder: string[] = [];
  const seen = new Set<string>();
  for (const match of md.matchAll(CITE_INLINE)) {
    for (const key of match[1].split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!seen.has(key)) {
        seen.add(key);
        citationOrder.push(key);
      }
    }
  }
  return { labels, citationOrder };
}

/**
 * Strict id charset. Matches the ABNF rule for directive ids:
 * leading letter, then ASCII letter / digit / `_` / `-`. Quoted
 * `id="…"` MUST satisfy this charset too — without the check, a
 * quoted form could carry spaces, colons, or `javascript:` text that
 * silently breaks `::ref[id]` resolution (which uses the strict form)
 * and produces malformed `<figure id>` / `aria-labelledby` attributes.
 */
const ID_CHARSET = /^[A-Za-z][A-Za-z0-9_\-]*$/;

/**
 * Extract `id="…"` (or `id=bareword`) from an attribute body.
 * Returns `null` when the id is missing OR fails the charset check.
 */
function parseId(body: string): string | null {
  const quoted = /\bid\s*=\s*"([^"]+)"/.exec(body);
  if (quoted) return ID_CHARSET.test(quoted[1]) ? quoted[1] : null;
  const bare = /\bid\s*=\s*([A-Za-z][A-Za-z0-9_\-]*)/.exec(body);
  return bare ? bare[1] : null;
}

/**
 * Public API: transform MDZ directive markdown to HTML-flavored markdown.
 */
export function processDirectives(md: string, opts: DirectiveOptions): string {
  const { labels, citationOrder } = collect(md);
  const style = opts.citationStyle ?? "chicago-author-date";

  // Pass 2 — line-by-line transform. Block directives (`::fig{}`,
  // `::bibliography`) replace whole lines. Inline directives (`::ref`,
  // `::cite`) are global-replaced inside each line.
  const out: string[] = [];
  for (const line of md.split("\n")) {
    const figMatch = FIG_LINE.exec(line);
    if (figMatch) {
      out.push(renderLabeledOpener(figMatch[1] as LabeledKind, figMatch[2], labels));
      continue;
    }
    if (BIBLIOGRAPHY_LINE.test(line)) {
      out.push(renderBibliography(citationOrder, opts.references, style));
      continue;
    }
    let rewritten = line.replace(REF_INLINE, (_, id) => renderRef(id, labels));
    rewritten = rewritten.replace(CITE_INLINE, (_, keysCsv, _attrs) =>
      renderInlineCitations(keysCsv, opts.references, style),
    );
    out.push(rewritten);
  }
  return out.join("\n");
}

/**
 * Render the opening tag of a `::fig` / `::eq` / `::tab` block.
 *
 * The block CONTENT (the body of the figure / equation / table) is left
 * to subsequent markdown lines; the directive marker only sets up the
 * `<figure>` wrapper + `<figcaption>`. A closing `</figure>` is implicit
 * — markdown blocks cannot easily span the directive across multiple
 * paragraphs without raw-HTML wrappers, so v2.1 emits the wrapper and
 * relies on the next blank line to close. A future v2.2 could introduce
 * an explicit `:::` close form for nested cases.
 */
function renderLabeledOpener(
  kind: LabeledKind,
  attrBody: string,
  labels: Map<string, string>,
): string {
  const id = parseId(attrBody);
  if (!id) return `<!-- mdz-${kind}: missing id -->`;
  const label = labels.get(id) ?? `${LABEL_PREFIX[kind]} ?`;
  // Use semantic <figure> for fig; <div role="math"> for eq; <figure> with
  // a class for tab (real <table> would require the caller to embed one).
  if (kind === "eq") {
    return `<div id="${escapeHtml(id)}" class="mdz-eq" role="math" aria-label="${escapeHtml(label)}"><span class="mdz-label">${escapeHtml(label)}</span>`;
  }
  const cls = kind === "fig" ? "mdz-fig" : "mdz-tab";
  return `<figure id="${escapeHtml(id)}" class="${cls}" aria-labelledby="${escapeHtml(id)}-caption"><figcaption id="${escapeHtml(id)}-caption">${escapeHtml(label)}</figcaption>`;
}

/**
 * Render a `::ref[id]` inline reference. On miss, emit a visible marker
 * (the spec requires "visible miss is better than invisible miss" per
 * `spec/directives/references-csl.md`).
 */
function renderRef(id: string, labels: Map<string, string>): string {
  const label = labels.get(id);
  if (!label) {
    return `<span class="mdz-ref mdz-ref-missing" aria-label="missing reference ${escapeHtml(id)}">[?${escapeHtml(id)}]</span>`;
  }
  return `<a class="mdz-ref" href="#${escapeHtml(id)}">${escapeHtml(label)}</a>`;
}

/**
 * Render `::cite[key1,key2]` to inline citations.
 */
function renderInlineCitations(
  keysCsv: string,
  references: Readonly<Record<string, CslEntry>>,
  style: string,
): string {
  const keys = keysCsv.split(",").map((s) => s.trim()).filter(Boolean);
  const parts = keys.map((key) => {
    const entry = references[key];
    if (!entry) {
      return `<cite class="mdz-cite mdz-cite-missing" aria-label="missing citation ${escapeHtml(key)}">[?${escapeHtml(key)}]</cite>`;
    }
    const formatted = formatInlineCitation(entry, style);
    return `<cite class="mdz-cite"><a href="#cite-${escapeHtml(key)}">${escapeHtml(formatted)}</a></cite>`;
  });
  // Join multi-key citations with semicolons inside a single bracket pair,
  // matching chicago-author-date convention: (Smith 2020; Jones 2021).
  if (parts.length === 1) return parts[0];
  return `<span class="mdz-cite-group">(${parts.join("; ")})</span>`;
}

/**
 * Render the `::bibliography` block as an ordered list of formatted
 * references (only those actually cited, matching pandoc-citeproc's
 * default. Authors who want every reference shown can list them under a
 * separate "All references" heading).
 */
function renderBibliography(
  citationOrder: string[],
  references: Readonly<Record<string, CslEntry>>,
  style: string,
): string {
  const items: string[] = [];
  for (const key of citationOrder) {
    const entry = references[key];
    if (!entry) {
      items.push(
        `<li id="cite-${escapeHtml(key)}" class="mdz-bib-entry mdz-bib-missing">missing reference: ${escapeHtml(key)}</li>`,
      );
      continue;
    }
    const html = renderCslEntry(entry, style);
    items.push(
      `<li id="cite-${escapeHtml(key)}" class="mdz-bib-entry">${html}</li>`,
    );
  }
  if (items.length === 0) {
    return `<section class="mdz-bibliography mdz-bibliography-empty" aria-label="Bibliography (no citations found in document)"></section>`;
  }
  return `<section class="mdz-bibliography" aria-label="Bibliography"><ol class="mdz-bib-list">${items.join("")}</ol></section>`;
}

