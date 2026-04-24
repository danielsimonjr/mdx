# EPUB ↔ MDZ fidelity matrix

**Status:** Phase 2.4 reference, paired with `mdz export-epub` and
`mdz import-epub`. Lives in `docs/format-internals/` because it's a
tooling artifact, not a normative spec.

**Last reviewed:** 2026-04-24.

---

## Why this document exists

EPUB 3.3 and MDZ v2.0 have overlapping but non-identical scopes. EPUB
is a finished-publication format optimised for ereaders; MDZ is an
authoring + provenance + reproducibility format optimised for
scientific papers. A round-trip through both will lose information in
each direction. This document tells authors *which* information goes
missing and at what stage, so they can decide whether to use the
bridge or stay in one format.

The CLI commands reference this file at the end of their stdout (per
ROADMAP §2.4 "Publish this prominently").

---

## MDZ → EPUB (export side)

| MDZ feature | EPUB representation | Loss |
|-------------|---------------------|------|
| `manifest.document.title` | `<dc:title>` | None |
| `manifest.document.authors[].name` | `<dc:creator>` per author | DID / ORCID dropped |
| `manifest.document.language` | `<dc:language>` | None |
| `manifest.document.id` (UUID) | `<dc:identifier>` `urn:uuid:…` | None |
| `manifest.document.modified` | `<meta property="dcterms:modified">` | None |
| `manifest.document.license` | `<dc:rights>` | Structured `{type, url}` flattens to text |
| `manifest.document.keywords` | `<dc:subject>` per keyword | None |
| `manifest.document.accessibility.features` | `<meta property="schema:accessibilityFeature">` | None |
| Markdown body | XHTML via `marked` | Hard-wrap normalization, footnote rendering style |
| Images in `manifest.assets.images` | Copied to `OPS/Images/` + `<item>` in OPF manifest | None |
| `::cell` source code | `<pre><code>` | Cell metadata (kernel, execution_count) dropped |
| `::cell` cached `::output` text | `<pre>` after the source block | None for stream output |
| `::cell` cached `::output` image | `<img>` referencing the image asset | None |
| `::cell` execution semantics | **Dropped** — EPUB cannot execute | Reviewers cannot re-run |
| `::include` directive | Resolved at export time (best-effort) | External includes unsupported |
| `::fig` / `::eq` / `::tab` cross-refs | Not auto-numbered in EPUB output | Numbering deferred to reader |
| `::cite` / `::bibliography` | Pre-rendered to inline text | Live citation lookup lost |
| `content.locales.available[]` | First locale only | Multi-rendition (ODPS 1.0) is a separate feature pass |
| `security.signatures[]` | **Dropped** — EPUB has no equivalent | Provenance chain lost |
| `security.integrity.manifest_checksum` | **Dropped** | None recoverable |
| `document.content_id` | **Dropped** | Hash anchor lost |
| `document.derived_from` | **Dropped** | Provenance DAG lost |
| `history/` snapshots | **Dropped** | Version history lost |
| `annotations/` (W3C Web Annotation) | **Dropped** | Peer-review threads lost |
| Custom directives | XHTML pass-through (best-effort) | Round-trip not guaranteed |

**Bottom line for export:** an MDZ → EPUB conversion is a
**read-only-publication snapshot**. The cryptographic and provenance
layers are stripped. If you intend to ever re-import the EPUB,
checkpoint the MDZ first — the EPUB cannot reconstruct what's lost.

---

## EPUB → MDZ (import side)

| EPUB feature | MDZ representation | Loss |
|--------------|---------------------|------|
| `<dc:title>` | `manifest.document.title` | None |
| `<dc:creator>` | `manifest.document.authors[].name` | None for name-only; opf:role / opf:file-as dropped |
| `<dc:language>` | `manifest.document.language` | None |
| `<dc:identifier>` (UUID-shaped) | `manifest.document.id` | None |
| `<dc:identifier>` (DOI / ISBN / opaque) | Fresh UUID minted; original stashed in `custom.import_source.original_identifier` (planned) | Source identity preserved as metadata |
| `<dc:rights>` / `<dc:license>` | `manifest.document.license` | Structured `{type, url}` not reconstructed |
| `<dc:subject>` | `manifest.document.keywords` | None |
| `<meta property="dcterms:modified">` | `manifest.document.modified` | None |
| `<meta property="schema:accessibilityFeature">` | `manifest.document.accessibility.features[]` | None |
| Spine in reading order | Concatenated into single `document.md`, joined by `---` HR | Per-chapter file structure flattened |
| XHTML body | Markdown via `turndown` | HTML elements without markdown equivalents (`<aside>`, `<details>`, complex tables) round-trip via raw HTML — semantics preserved, source readability degrades |
| Images in OPF manifest | Copied to `assets/images/`, paths rewritten in markdown | None |
| `nav.xhtml` table of contents | **Dropped** — regenerable from headings | None recoverable |
| EPUB 2 NCX | **Dropped** — superseded by `nav.xhtml` per EPUB 3.3 | None recoverable |
| `<page-list>` / page-break locators | **Dropped** | Print-page references lost |
| SSML pronunciation hints | **Dropped** | TTS quality degrades |
| Region-of-interest / fixed-layout EPUB | **Dropped** | Layout reflows to MDZ default |
| MathML | Markdown raw HTML pass-through (turndown preserves it as `<math>`) | Renderer must support MathML |
| `epub:type` semantic markers | **Dropped** | Use MDZ directives instead |
| Encrypted resources | **REFUSED** — `mdz import-epub` exits 3 | Operator must decrypt first |

**Bottom line for import:** an EPUB → MDZ conversion is a
**best-effort ingest**. Use it to bootstrap an MDZ archive from a
prior publication; do NOT use it as a primary authoring path. The
`custom.import_source` block on the resulting manifest records the
provenance so downstream tooling can identify imported archives.

---

## Round-trip MDZ → EPUB → MDZ

The lossiest direction. Run only if you understand each loss column
above stacks:

1. The first export drops signatures / content_id / derived_from /
   history / annotations.
2. The re-import doesn't reconstruct any of those.
3. The result is a *new* MDZ archive that shares only the body text
   and a subset of metadata with the original. It is NOT bit-for-bit
   identical to the source.

If you need byte-stable round-tripping, your archives are not
candidates for an EPUB intermediary. Use `mdz export-jats` (Phase 2,
ships) for journal submission instead — JATS is closer to the MDZ
feature surface and the round-trip carries more weight.

---

## Round-trip EPUB → MDZ → EPUB

Less lossy than the inverse — both formats agree on prose + images
+ basic metadata. Losses come from:

1. The original EPUB's `nav.xhtml` is dropped on import (regenerable
   from MDZ headings on re-export, but not byte-identical).
2. Per-chapter file structure flattens into one `document.md` on
   import; on re-export the entire body becomes a single XHTML file
   in the spine. Readers that pre-paginate (Apple Books, Kindle)
   will treat it differently.
3. Page-list / SSML / fixed-layout features are dropped on import
   and cannot be reconstructed.

If your toolchain depends on per-chapter spine structure, this is the
right place to switch to a real EPUB editor (Sigil, Calibre).

---

## CI testing

`tests/integration/epub_roundtrip.test.js` runs both directions
against a comprehensive fixture and asserts the documented losses (no
more, no less). When new MDZ features are added that the EPUB bridge
should preserve, both the fidelity matrix entry and the test must
update together.

---

## Out of scope

- **EPUB 2 export.** Only EPUB 3.3 is emitted; legacy NCX-only EPUB 2
  output is not planned. Tools that need EPUB 2 can downgrade with
  Calibre.
- **Fixed-layout / multi-rendition.** ODPS 1.0 (multiple renditions
  in a single EPUB) is a separate spec extension; not on the roadmap.
- **DRM ingest.** `mdz import-epub` refuses encrypted EPUBs by
  design. MDZ is an open format — there is no path to honor DRM
  envelopes in the toolchain.
