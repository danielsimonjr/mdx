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
  /**
   * Archive-internal entries map for resolving `::include[target=…]`.
   * Keyed by archive-relative path (e.g. `methods.md`,
   * `chapters/01.md`). Bytes decoded as UTF-8. Omitted / empty
   * disables include resolution — `::include` directives render as
   * a labeled "include not resolved" Div, NOT silently dropped.
   */
  archiveEntries?: ReadonlyMap<string, Uint8Array>;
  /**
   * BCP-47 language tag used to localize labeled-directive prefixes
   * (`Figure 1` / `Figura 1` / `图 1` / …). Looked up against
   * `LABELS_BY_LANG`; falls back to the language's primary subtag
   * (`fr-CA` → `fr`), then to English. When unset / unknown, English
   * is used.
   */
  language?: string;
}

interface FirstPassResult {
  /** id → human-readable label (e.g., "Figure 3"). */
  labels: Map<string, string>;
  /** Distinct citation keys in order of first appearance. */
  citationOrder: string[];
}

/**
 * Per-kind label prefix, keyed by BCP-47 primary language subtag.
 * Selected against `DirectiveOptions.language`; the primary subtag
 * (everything before `-` / `_`) is used for the lookup, so
 * `en-US`, `en-GB`, `en` all resolve identically. Unknown languages
 * fall back to English.
 *
 * Coverage is intentionally pragmatic — the eight languages here
 * cover ~75% of academic publishing by paper count
 * (Web of Science 2023). Adding a language is a one-line PR.
 */
const LABELS_BY_LANG: Record<string, Record<LabeledKind, string>> = {
  en: { fig: "Figure", eq: "Equation", tab: "Table" },
  es: { fig: "Figura", eq: "Ecuación", tab: "Tabla" },
  fr: { fig: "Figure", eq: "Équation", tab: "Tableau" },
  de: { fig: "Abbildung", eq: "Gleichung", tab: "Tabelle" },
  it: { fig: "Figura", eq: "Equazione", tab: "Tabella" },
  pt: { fig: "Figura", eq: "Equação", tab: "Tabela" },
  ja: { fig: "図", eq: "式", tab: "表" },
  zh: { fig: "图", eq: "公式", tab: "表" },
};

const FALLBACK_LABELS = LABELS_BY_LANG.en;

/**
 * Resolve the label table for a given BCP-47 tag. Strips the
 * subtag suffix (`fr-CA` → `fr`); returns the English fallback
 * when the language is unknown or absent.
 */
export function resolveLabels(language: string | undefined): Record<LabeledKind, string> {
  if (!language) return FALLBACK_LABELS;
  const primary = language.split(/[-_]/)[0].toLowerCase();
  return LABELS_BY_LANG[primary] ?? FALLBACK_LABELS;
}

/**
 * Block-level matchers that span multiple lines. These run BEFORE
 * the line-by-line pass so a `::cell{...}` directive can swallow
 * its trailing fenced code block as a single unit.
 *
 * Pattern shape (per spec/grammar/mdz-directives.abnf):
 *   ::cell{<attrs>}
 *
 *   ```<lang>
 *   <source>
 *   ```
 *
 * The blank line between the marker and the fence is REQUIRED — the
 * spec uses it to disambiguate `::cell{...}` followed immediately by
 * a fence (which is a reader's mistake — the fence belongs to the
 * cell) from `::cell{...}` followed by prose (a stand-alone marker).
 *
 * `[\s\S]` rather than `.` so the body matches across newlines without
 * needing the `s` flag.
 */
const CELL_BLOCK = /^::cell\{([^}]*)\}[ \t]*\r?\n\r?\n[ \t]*```([a-zA-Z0-9_-]*)[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*$/gm;
const OUTPUT_BLOCK_FENCED = /^::output\{([^}]*)\}[ \t]*\r?\n\r?\n[ \t]*```([a-zA-Z0-9_-]*)[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*$/gm;
/**
 * `::output{type=image src=path}` standalone form — no fenced body
 * because the output is a referenced asset, not inline text. Used for
 * cell outputs that produced an image (matplotlib `display_data`,
 * Jupyter image MIME bundle).
 */
const OUTPUT_IMAGE_LINE = /^::output\{((?:[^}]*\b(?:type)\s*=\s*["']?(?:image|figure))[^}]*)\}[ \t]*$/gm;

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
 * `::include[<bracket-attrs>]{<brace-attrs>}` directive — both attribute
 * containers are optional. The bracket form is the spec-canonical
 * `::include[target=path]`; the brace form carries integrity and
 * fragment hints that don't fit cleanly in the bracket attribute body
 * (`{content_hash="sha256:…"}`). Either container can supply `target`,
 * `fragment`, or `content_hash` — the renderer merges them with
 * brace-attrs taking precedence (matching the pandoc Lua filter).
 */
const INCLUDE_LINE = /^::include\[(.*?)\](?:\{([^}]*)\})?\s*$/;
/** Hard cap on `::include` recursion depth — same as the Phase 4.4
 *  streaming proposal's "deep transclusion is a smell" guideline. */
const MAX_INCLUDE_DEPTH = 10;

/**
 * Run pass-1 collection over the source markdown.
 */
function collect(md: string, labelTable: Record<LabeledKind, string> = FALLBACK_LABELS): FirstPassResult {
  const labels = new Map<string, string>();
  const counters: Record<LabeledKind, number> = { fig: 0, eq: 0, tab: 0 };
  for (const line of md.split("\n")) {
    const m = FIG_LINE.exec(line);
    if (!m) continue;
    const kind = m[1] as LabeledKind;
    const id = parseId(m[2]);
    if (!id) continue;
    counters[kind] += 1;
    labels.set(id, `${labelTable[kind]} ${counters[kind]}`);
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
 *
 * Two-stage pipeline:
 *   1. **Multi-line block substitutions.** `::cell{}` + fenced source
 *      and `::output{}` + fenced body are matched as multi-line regex
 *      patterns and replaced with HTML islands BEFORE the line walker
 *      runs. Image-output (`::output{type=image src=...}` standalone
 *      line) also lands here. These run first because they consume
 *      multiple lines of source as a unit.
 *   2. **Line-by-line transform.** Block-level whole-line directives
 *      (`::fig{}` / `::eq{}` / `::tab{}` / `::bibliography`) and
 *      inline directives (`::ref` / `::cite`) walked line-by-line.
 */
export function processDirectives(md: string, opts: DirectiveOptions): string {
  // Stage 0 — `::include` resolution. Done first so the assembled
  // document (after transclusion) is what subsequent stages see.
  // Cycle detection via the `seen` path set; depth-bounded by
  // MAX_INCLUDE_DEPTH so a malformed archive can't recurse forever.
  const resolved = resolveIncludes(md, opts.archiveEntries ?? new Map(), 0, new Set());

  // Resolve the localized label table for this document.
  const labelTable = resolveLabels(opts.language);

  // Re-run the id + citation collection on the post-include text so
  // labels/citations from included files are numbered correctly.
  const { labels, citationOrder } = collect(resolved, labelTable);
  const style = opts.citationStyle ?? "chicago-author-date";

  // Stage 1 — multi-line block substitutions for cells + outputs.
  let staged = resolved.replace(CELL_BLOCK, (_, attrs, lang, source) =>
    renderCellBlock(attrs, lang, source),
  );
  staged = staged.replace(OUTPUT_BLOCK_FENCED, (_, attrs, lang, body) =>
    renderOutputBlock(attrs, lang, body),
  );
  staged = staged.replace(OUTPUT_IMAGE_LINE, (_, attrs) =>
    renderOutputImage(attrs),
  );

  // Stage 2 — line-by-line. Block directives (`::fig{}`,
  // `::bibliography`) replace whole lines. Inline directives (`::ref`,
  // `::cite`) are global-replaced inside each line.
  const out: string[] = [];
  for (const line of staged.split("\n")) {
    const figMatch = FIG_LINE.exec(line);
    if (figMatch) {
      out.push(renderLabeledOpener(figMatch[1] as LabeledKind, figMatch[2], labels, labelTable));
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
  labelTable: Record<LabeledKind, string> = FALLBACK_LABELS,
): string {
  const id = parseId(attrBody);
  if (!id) return `<!-- mdz-${kind}: missing id -->`;
  const label = labels.get(id) ?? `${labelTable[kind]} ?`;
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

// ---------------------------------------------------------------------------
// ::include resolution
// ---------------------------------------------------------------------------

/**
 * Recursively resolve `::include[target=…]` directives by walking the
 * source line-by-line and substituting the included content inline.
 *
 * Spec-derived rules (`spec/MDX_FORMAT_SPECIFICATION_v2.0.md` §12):
 *   - Archive-internal targets (no `://` in the path) inline the
 *     entry's bytes as UTF-8 markdown.
 *   - External (URL) targets — http(s) — REQUIRE `content_hash` to
 *     pin the fetched bytes; viewers MUST refuse external includes
 *     without a hash. The viewer also doesn't fetch over the network
 *     here (sync render path); external includes ALWAYS surface as
 *     a "needs-runtime-fetch" placeholder.
 *   - Cycle detection: include path A → B → A is a hard error;
 *     surface a visible cycle marker rather than infinite recursion.
 *   - Depth cap: MAX_INCLUDE_DEPTH chains. Beyond that, surface a
 *     visible depth-exceeded marker.
 *   - Missing target: surface a `mdz-include-missing` marker (visible
 *     miss, never silent drop).
 *   - `fragment` attribute: spec-defined for selecting a section.
 *     v0.1 viewer does NOT honor it — the whole target inlines and a
 *     `mdz-include-fragment-unsupported` class is added so a fragment-
 *     aware future viewer can detect the regression.
 */
function resolveIncludes(
  md: string,
  entries: ReadonlyMap<string, Uint8Array>,
  depth: number,
  seen: Set<string>,
): string {
  const out: string[] = [];
  for (const line of md.split("\n")) {
    const m = INCLUDE_LINE.exec(line);
    if (!m) {
      out.push(line);
      continue;
    }
    const bracketBody = m[1] ?? "";
    const braceBody = m[2] ?? "";
    // Brace attrs win on conflict — content_hash + fragment usually
    // sit there per the spec example.
    const target =
      pickAttr(braceBody, "target") ??
      pickAttr(bracketBody, "target") ??
      pickAttr(braceBody, "path") ??
      pickAttr(bracketBody, "path");
    if (!target) {
      out.push(renderIncludeMiss("missing target", bracketBody));
      continue;
    }
    const fragment = pickAttr(braceBody, "fragment") ?? pickAttr(bracketBody, "fragment");
    const contentHash = pickAttr(braceBody, "content_hash") ?? pickAttr(bracketBody, "content_hash");

    // External (URL) includes — viewer cannot do a synchronous fetch
    // mid-render. Even if it could, content_hash pinning is required.
    // Surface a placeholder that a future async-include layer can
    // attach to.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) {
      if (!contentHash) {
        out.push(renderIncludeMiss(`external include "${target}" requires content_hash`, target));
        continue;
      }
      out.push(renderExternalIncludePlaceholder(target, contentHash));
      continue;
    }

    if (depth >= MAX_INCLUDE_DEPTH) {
      out.push(renderIncludeMiss(`include depth ${depth} exceeded MAX_INCLUDE_DEPTH=${MAX_INCLUDE_DEPTH}`, target));
      continue;
    }
    if (seen.has(target)) {
      out.push(renderIncludeMiss(`include cycle detected: ${[...seen, target].join(" → ")}`, target));
      continue;
    }
    const bytes = entries.get(target);
    if (!bytes) {
      out.push(renderIncludeMiss(`target "${target}" not found in archive`, target));
      continue;
    }
    const decoded = new TextDecoder("utf-8").decode(bytes);
    const nestedSeen = new Set(seen).add(target);
    const inlined = resolveIncludes(decoded, entries, depth + 1, nestedSeen);
    // Wrap in a Div so downstream CSS / a11y can detect transcluded
    // content. The fragment-unsupported class signals the v0.1 caveat.
    const fragClass = fragment ? " mdz-include-fragment-unsupported" : "";
    // No `data-target` — sanitizer doesn't allow data-* — but aria-label
    // names the target so screen readers + tooling can identify the
    // transclusion.
    out.push(`<div class="mdz-include${fragClass}" aria-label="included from ${escapeHtml(target)}">`);
    out.push(inlined);
    out.push(`</div>`);
  }
  return out.join("\n");
}

function renderIncludeMiss(reason: string, target: string): string {
  return `<div class="mdz-include mdz-include-missing" aria-label="include miss: ${escapeHtml(reason)}">[?include: ${escapeHtml(target)} — ${escapeHtml(reason)}]</div>`;
}

function renderExternalIncludePlaceholder(target: string, contentHash: string): string {
  // External includes need an async fetch the synchronous render path
  // can't perform. Emit a placeholder that a future hydration step
  // (or a build-time include resolver) can hook into.
  return `<div class="mdz-include mdz-include-external mdz-include-pending" aria-label="external include pending fetch from ${escapeHtml(target)}">[external include: ${escapeHtml(target)} pinned to ${escapeHtml(contentHash)}]</div>`;
}

// ---------------------------------------------------------------------------
// ::cell + ::output renderers
// ---------------------------------------------------------------------------

/**
 * Pull common attributes from a directive body. Matches the small
 * subset the renderer actually surfaces — id / language / kernel /
 * execution_count for cells, type / src / mime for outputs. Anything
 * else is silently ignored at this layer (not a bug — extension
 * attributes live in `manifest.custom` per spec).
 */
function pickAttr(body: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([\\w./:-]+))`, "i");
  const m = re.exec(body);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

/**
 * Build the class-token suffix that surfaces a directive attribute on
 * the rendered element. The sanitizer doesn't allow `data-*` so class
 * names carry the metadata downstream consumers (CSS, screen readers
 * via aria-label, future client-side cell-execution hooks) can read.
 *
 * Class tokens are `mdz-<directive>-<attr>-<value-slug>`; the slug is
 * a defensive subset of `[a-z0-9-]` so a malformed attribute value
 * cannot escape into other class tokens.
 */
function classToken(prefix: string, value: string | null): string {
  if (!value) return "";
  const slug = value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug ? ` ${prefix}-${slug}` : "";
}

/**
 * Render a `::cell{language=… kernel=… execution_count=N}` block.
 *
 * The current viewer (Phase 2.1) renders cells as syntax-highlightable
 * `<pre><code>` with class metadata. Actual cell execution
 * (re-running the source via Pyodide) lands in Phase 2.3b.1; the HTML
 * island below is the static surface those features will hook into.
 */
function renderCellBlock(attrBody: string, lang: string, source: string): string {
  const language = pickAttr(attrBody, "language") ?? pickAttr(attrBody, "lang") ?? lang ?? "";
  const kernel = pickAttr(attrBody, "kernel");
  const execCount = pickAttr(attrBody, "execution_count");
  const id = parseId(attrBody);

  const classes = [
    "mdz-cell",
    classToken("mdz-cell-lang", language).trim(),
    classToken("mdz-cell-kernel", kernel).trim(),
    classToken("mdz-cell-exec", execCount).trim(),
  ]
    .filter(Boolean)
    .join(" ");

  // Build a screen-reader-friendly description so a visually-rendered
  // cell is announced with its language / kernel / execution count.
  const ariaParts: string[] = [];
  if (language) ariaParts.push(`${language} cell`);
  if (kernel) ariaParts.push(`kernel ${kernel}`);
  if (execCount) ariaParts.push(`execution count ${execCount}`);
  const ariaLabel = ariaParts.join(", ") || "code cell";

  const idAttr = id ? ` id="${escapeHtml(id)}"` : "";
  const langClass = language ? ` class="language-${escapeHtml(language)}"` : "";
  // Embed the cell's source as a data attribute so the editor's
  // per-cell Run button (Phase 2.3b.1.3) can pull it out without
  // re-parsing the rendered HTML. `data-mdz-cell-language` mirrors
  // the language attribute for the same reason.
  const dataAttrs = [
    language ? ` data-mdz-cell-language="${escapeHtml(language)}"` : "",
    ` data-mdz-cell-source="${escapeHtml(source)}"`,
  ].join("");
  return `<div${idAttr} class="${classes}" aria-label="${escapeHtml(ariaLabel)}"${dataAttrs}><pre class="mdz-cell-source"><code${langClass}>${escapeHtml(source)}</code></pre></div>`;
}

/**
 * Render a fenced `::output{type=… mime=…}` block. The body is the
 * literal cell output text (stdout, repr, JSON, etc.); the type
 * attribute drives the class token so downstream CSS can render
 * stream output differently from JSON differently from error tracebacks.
 */
function renderOutputBlock(attrBody: string, _lang: string, body: string): string {
  const type = pickAttr(attrBody, "type") ?? "text";
  const mime = pickAttr(attrBody, "mime");
  const classes = [
    "mdz-output",
    classToken("mdz-output", type).trim(),
    classToken("mdz-output-mime", mime).trim(),
  ]
    .filter(Boolean)
    .join(" ");
  return `<div class="${classes}" aria-label="${escapeHtml(`output (${type})`)}"><pre class="mdz-output-body"><code>${escapeHtml(body)}</code></pre></div>`;
}

/**
 * Render `::output{type=image src=…}` standalone form. The image
 * itself comes from the archive's asset map; the renderer emits a
 * standard `<img>` whose src will be rewritten by the sanitizer's
 * `resolveAsset` pass against the archive entries.
 */
function renderOutputImage(attrBody: string): string {
  const src = pickAttr(attrBody, "src");
  if (!src) {
    return `<div class="mdz-output mdz-output-image mdz-output-empty" aria-label="output image (missing src)"></div>`;
  }
  const alt = pickAttr(attrBody, "alt") ?? "cell output image";
  const mime = pickAttr(attrBody, "mime") ?? "";
  return `<div class="mdz-output mdz-output-image${classToken("mdz-output-mime", mime)}"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"/></div>`;
}

