/**
 * Minimal CSL-JSON renderer for the v2.1 viewer.
 *
 * This is NOT a full citation-style processor — it implements
 * `chicago-author-date` (the CSL ecosystem default) and falls back to
 * that style for any unrecognized `citation_style` declaration. A real
 * CSL implementation requires citeproc-js (~250KB minified, all locale
 * files included), which is out of scope for the viewer's size budget.
 *
 * If a paper requires a specific journal style (Vancouver, APA, IEEE),
 * the recommended workflow is to pre-render the bibliography with
 * pandoc-citeproc at build time and embed the rendered HTML in the
 * markdown directly. The directive renderer only handles
 * chicago-author-date in-process.
 *
 * Supported CSL fields (subset):
 *   - `id`            — citation key
 *   - `type`          — `article-journal` / `book` / `chapter` / `paper-conference` / `webpage` / `report` / `thesis`
 *   - `title`         — title of the work
 *   - `author`        — array of `{family, given}` objects (or `{literal}`)
 *   - `issued`        — `{date-parts: [[YYYY, MM, DD]]}` (only year used)
 *   - `container-title` — journal / book title for chapters
 *   - `volume`, `issue`, `page`
 *   - `publisher`, `publisher-place`
 *   - `URL`, `DOI`
 *
 * Out-of-spec fields are silently ignored (forward-compat).
 */

import { escapeHtml as escape } from "./escape.js";

export interface CslAuthor {
  family?: string;
  given?: string;
  literal?: string;
}

export interface CslDate {
  "date-parts"?: ReadonlyArray<ReadonlyArray<number>>;
  literal?: string;
  raw?: string;
}

export interface CslEntry {
  id: string;
  type?: string;
  title?: string;
  author?: ReadonlyArray<CslAuthor>;
  issued?: CslDate;
  "container-title"?: string;
  volume?: string | number;
  issue?: string | number;
  page?: string;
  publisher?: string;
  "publisher-place"?: string;
  URL?: string;
  DOI?: string;
}

/**
 * Format the inline citation marker for `::cite[key]`. For
 * chicago-author-date, this is the "(Smith 2020)" or "(Smith et al.
 * 2020)" form. The bracket pair is added by the caller — this returns
 * the bare `Smith 2020` portion so multi-key citations can be joined
 * with semicolons inside a single bracket pair.
 */
export function formatInlineCitation(entry: CslEntry, style: string): string {
  const _ = style; // chicago-author-date is the only implemented style; see module doc
  const surnames = surnameList(entry.author);
  const year = issuedYear(entry.issued);
  const bare =
    surnames.length === 0
      ? entry.title ?? entry.id
      : surnames.length <= 2
        ? surnames.join(" & ")
        : `${surnames[0]} et al.`;
  return year ? `${bare} ${year}` : bare;
}

/**
 * Format the full bibliography entry. Emits HTML (with sanitizer-allowed
 * tags only — see `directives.ts` notes).
 */
export function renderCslEntry(entry: CslEntry, style: string): string {
  const _ = style; // see module doc
  const parts: string[] = [];

  // Authors: "Family, G. M. and Family2, A."
  const authorBlock = formatAuthors(entry.author);
  if (authorBlock) parts.push(authorBlock);

  const year = issuedYear(entry.issued);
  if (year) parts.push(`(${year})`);

  if (entry.title) {
    // Title is article-italic for journal articles and chapters; book-italic for books;
    // both render with <em>. Quoted titles for articles per Chicago — but mid-quote
    // markup is more code than gain for v1; <em> is fine.
    parts.push(`<em>${escape(entry.title)}</em>`);
  }

  const container = entry["container-title"];
  if (container) {
    let cont = `<span class="mdz-bib-container">${escape(container)}</span>`;
    const vol = entry.volume != null ? String(entry.volume) : null;
    const iss = entry.issue != null ? String(entry.issue) : null;
    if (vol && iss) cont += ` ${escape(vol)}(${escape(iss)})`;
    else if (vol) cont += ` ${escape(vol)}`;
    if (entry.page) cont += `: ${escape(entry.page)}`;
    parts.push(cont);
  } else if (entry.page) {
    // No container but a page range — surface it for reports / theses.
    parts.push(escape(entry.page));
  }

  if (entry.publisher) {
    const place = entry["publisher-place"];
    parts.push(place ? `${escape(place)}: ${escape(entry.publisher)}` : escape(entry.publisher));
  }

  if (entry.DOI) {
    const doi = entry.DOI;
    parts.push(
      `<a class="mdz-bib-doi" href="https://doi.org/${escape(doi)}">https://doi.org/${escape(doi)}</a>`,
    );
  } else if (entry.URL) {
    parts.push(`<a class="mdz-bib-url" href="${escape(entry.URL)}">${escape(entry.URL)}</a>`);
  }

  return parts.join(". ") + ".";
}

// ---------------------------------------------------------------------------
// CSL field plumbing
// ---------------------------------------------------------------------------

function surnameList(authors: CslEntry["author"]): string[] {
  if (!authors) return [];
  return authors.map((a) => a.family ?? a.literal ?? "").filter(Boolean);
}

function issuedYear(issued: CslDate | undefined): string | null {
  if (!issued) return null;
  const parts = issued["date-parts"];
  if (parts && parts.length > 0 && parts[0].length > 0) {
    const y = parts[0][0];
    // CSL-JSON typing says number, but real-world feeds ship strings —
    // accept both. Negative ints are BCE per the EDTF profile CSL uses.
    if (typeof y === "number" && Number.isFinite(y)) return String(y);
    if (typeof y === "string" && /^-?\d+$/.test(y)) return y;
  }
  // Literal / raw fallbacks: extract the first 1–4 digit run with an
  // optional leading minus. Matches modern years, pre-1500 manuscripts,
  // and BCE — wider than the prior `1[5-9]\d{2}|20\d{2}` regex which
  // silently dropped classics-era citations.
  const text = issued.literal ?? issued.raw;
  if (text) {
    const m = /\b(-?\d{1,4})\b/.exec(text);
    return m ? m[1] : null;
  }
  return null;
}

function formatAuthors(authors: CslEntry["author"]): string {
  if (!authors || authors.length === 0) return "";
  const formatted = authors.map((a) => {
    if (a.literal) return a.literal;
    if (a.family && a.given) {
      // Initialize given names: "Mary Jane" -> "M. J." per Chicago
      const initials = a.given
        .split(/\s+/)
        .filter(Boolean)
        .map((g) => g[0].toUpperCase() + ".")
        .join(" ");
      return `${a.family}, ${initials}`;
    }
    return a.family ?? a.given ?? "";
  });
  if (formatted.length === 1) return escape(formatted[0]);
  if (formatted.length === 2) return `${escape(formatted[0])} and ${escape(formatted[1])}`;
  return `${formatted.slice(0, -1).map(escape).join(", ")}, and ${escape(formatted[formatted.length - 1])}`;
}

/**
 * Parse `references.json` bytes into a key-indexed map. Accepts the
 * canonical CSL-JSON array form AND the id-keyed object form (which
 * tools like Zotero's CSL-JSON exporter and a common manual mistake
 * produce). Returns an empty record on malformed input, leaving
 * citation rendering to fall back to the `[?key]` missing-marker
 * pattern; warns to console so authors see the diagnostic.
 */
export function parseReferences(bytes: Uint8Array): Record<string, CslEntry> {
  if (!bytes || bytes.byteLength === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8").decode(bytes));
  } catch {
    if (typeof console !== "undefined") {
      console.warn("[mdz-viewer] references.json is not valid JSON; citations will render as missing markers");
    }
    return {};
  }
  const out: Record<string, CslEntry> = {};
  if (Array.isArray(parsed)) {
    for (const e of parsed) {
      if (e && typeof e === "object" && typeof (e as { id?: unknown }).id === "string") {
        out[(e as CslEntry).id] = e as CslEntry;
      }
    }
    return out;
  }
  if (parsed && typeof parsed === "object") {
    // Object form: keys are citation ids, values are entries (with or
    // without their own `id` field). We synthesize the `id` from the
    // outer key when absent so the rendered HTML has a stable anchor.
    for (const [key, e] of Object.entries(parsed as Record<string, unknown>)) {
      if (e && typeof e === "object") {
        const entry = e as CslEntry & { id?: string };
        out[key] = { ...entry, id: entry.id ?? key };
      }
    }
    return out;
  }
  if (typeof console !== "undefined") {
    console.warn(
      "[mdz-viewer] references.json must be a CSL-JSON array or an id-keyed object; citations will render as missing markers",
    );
  }
  return {};
}
