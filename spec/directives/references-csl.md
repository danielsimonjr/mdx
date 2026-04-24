# MDZ bibliography — CSL-JSON references

**Spec status:** v2.1 draft. Scheduled to land alongside `::cite` /
`::ref` cross-reference directives before the Phase 2 viewer ships.

**Audience:** implementers of MDZ readers, editors, and CLI tools that
resolve citations; authors looking for the canonical bibliography
format.

---

## Goal

Give MDZ archives a single, tool-neutral bibliography format that

- Drops into existing pandoc / Quarto / Zotero toolchains unchanged
  (those projects all use CSL-JSON).
- Round-trips losslessly with BibTeX via the `pandoc-citeproc` path.
- Supports both in-text `::cite[key]` rendering and a generated
  bibliography block.

## File location

Archives MAY carry a bibliography. If they do, it MUST live at:

```
references.json        # REQUIRED filename at archive root
```

The file is CSL-JSON v1.0.2 per <https://citationstyles.org/>. The
outer structure is a JSON array of entries; each entry carries an `id`
(citation key) plus CSL fields:

```json
[
  {
    "id": "patterson2020",
    "type": "article-journal",
    "title": "Variant calling pipelines for the 1000 Genomes Project",
    "author": [
      {"family": "Patterson", "given": "Nick"},
      {"family": "Ng", "given": "Ben"}
    ],
    "container-title": "Bioinformatics",
    "volume": "36",
    "issue": "4",
    "page": "1012-1019",
    "issued": {"date-parts": [[2020, 2, 14]]},
    "DOI": "10.1093/bioinformatics/btz812"
  }
]
```

## In-text citations — `::cite[...]`

Syntax (extends the v2.0 inline-directive grammar):

```
::cite[<key>]                 — single citation, key matches id in references.json
::cite[<key1>,<key2>]         — multiple keys
::cite[<key>]{prefix="see" suffix="p. 42"}   — with CSL locator fields
```

Rendering is style-dependent — the style is declared in the manifest:

```json
{
  "content": {
    "citation_style": "apa"
  }
}
```

Readers SHOULD support at least `apa`, `ieee`, `chicago-author-date`,
`vancouver`, and `nature`. The full CSL style list lives at
<https://github.com/citation-style-language/styles>. A reader that
does not recognise the declared style SHOULD render the citation key
verbatim (e.g. `[patterson2020]`) with a warning, rather than
failing or hallucinating a format.

If `citation_style` is absent, readers default to `chicago-author-date`
(the CSL ecosystem's implicit default).

## Bibliography block — `::bibliography`

A `::bibliography` block inserts the rendered reference list:

```markdown
## References

::bibliography
```

The block carries no body — the reader walks the document, collects
every `::cite` key, resolves against `references.json`, and renders
them in the order prescribed by the declared `citation_style` (author-
date styles emit alphabetical; numeric styles emit document order).

An author MAY force ordering:

```markdown
::bibliography{order=document}   — in order of first in-text citation
::bibliography{order=alphabetical}   — alphabetical by author
::bibliography{order=numeric}   — 1, 2, 3 in document order
```

## Validation

A conformant writer MUST:

1. Ensure every `::cite[key]` resolves to an entry in
   `references.json` (validate before saving; emit a clear error on
   orphan keys).
2. Emit a `references.json` that parses as valid CSL-JSON.

A conformant reader MUST:

1. Silently accept archives with no `references.json` (citations
   cannot be resolved; render as `[key]` with a warning).
2. Render unresolved citation keys as `[key]` rather than empty strings
   — an invisible miss is worse than a visible marker.
3. Report every unresolved key to the user (e.g. a console warning or
   a badge on the rendered citation).

## BibTeX round-trip

Authors often keep canonical bibliographies in `.bib`. The recommended
toolchain:

```bash
# One-shot .bib -> references.json via pandoc
pandoc --bibliography=refs.bib --to csljson -o references.json /dev/null

# Re-generate the .bib after editing
pandoc --from csljson --to bibtex references.json -o refs.bib
```

A future `mdz import-bib refs.bib` command will internalise this (not
yet implemented — tracked as Phase 1 parser-rebuild follow-up).

## Relationship to JATS export

`mdz export-jats` already consumes `references.json` and emits
`<ref-list>` elements per JATS 1.3. Citation-style declarations are
dropped on JATS export (JATS uses the journal's in-house style
post-ingest). `mdz export-epub` converts `::cite` calls to inline text
using the declared CSL style.

## What this spec does NOT cover

- **DOI resolution.** Citations reference keys inside the archive; the
  archive's DOI (if any) lives in `manifest.document.doi` (see
  `docs/for-authors/DOI.md`).
- **Inline reference managers.** MDZ is not a bibliography-management
  application; use Zotero / BibDesk / JabRef to maintain `.bib` or
  `references.json` and drop it into the archive.
- **Custom CSL styles.** Users can drop a custom `.csl` file into
  `styles/` and reference it via
  `content.citation_style: "custom:styles/my-style.csl"` — but the
  reader MUST refuse to load CSL styles from outside the archive
  (security + reproducibility).

## Open questions

1. **Inline CSL-JSON vs. separate file.** Some authors want the
   bibliography embedded in `manifest.json` rather than a sibling
   `references.json`. Pro: one file, no risk of de-sync. Con: bloats
   the manifest and couples bibliography edits to re-signing the
   manifest. Current proposal keeps `references.json` as a separate
   archive entry. Open for feedback.
2. **CSL-M extensions.** Some disciplines (law especially) use CSL-M
   rather than stock CSL. Proposal: v2.1 targets stock CSL only;
   revisit once a CSL-M-using journal expresses interest.

---

## Next steps

1. Land `::cite` / `::ref` / `::bibliography` in the formal grammar
   (`spec/grammar/mdz-directives.abnf`; they're already there, just
   verify block-level `::bibliography` is distinct from inline `::cite`).
2. Wire CSL rendering into `packages/mdz-viewer` via a small shim over
   `citeproc-js`.
3. Ship an `mdz import-bib` CLI subcommand (Phase 2 parser-rebuild
   follow-up).
4. Add conformance fixtures: positive (resolves), negative (orphan
   key, malformed CSL-JSON, unknown citation_style).
