# MDZ Grammar

Normative grammar definitions for MDZ directives and block-attribute markers.

## Files

| File | Format | Audience |
|------|--------|----------|
| `mdz-directives.abnf` | RFC 5234 ABNF | Spec readers; normative |
| `mdz-directives.lark` | Lark PEG | Python reference parser (Phase 1) |
| `mdz-directives.pegjs` | PEG.js | TypeScript / JS parsers (Phase 1, optional) |

The **ABNF is the normative source**. If the Lark or PEG grammars diverge
from the ABNF, the ABNF wins and the derived grammars must be corrected.

## Why ABNF as the source of truth

1. **Familiar to spec writers.** RFC 5234 is ubiquitous in IETF specs; most
   technical readers have parsed ABNF before.
2. **Tooling-agnostic.** ABNF doesn't commit us to one parser-generator.
   Implementations in Python (Lark), JS (Chevrotain / PEG.js), Rust
   (pest / nom), C (yacc) can all derive from it.
3. **Self-documenting.** The constraints-not-expressible-in-ABNF comments
   at the bottom are part of the spec — anything a parser must enforce
   beyond syntax is listed explicitly.

## What the grammar covers

- Block-attribute markers (`{.class #id key="value"}`)
- Shorthand alignment (`{:.center}`)
- Container blocks (`:::name{attrs}` ... `:::`)
- Inline directives on own line (`::video[caption]{src=...}`)
- Computational cells (`::cell` + fenced source + `::output` blocks)
- Transclusion (`::include[target=...]`)
- Labelable blocks (`::fig`, `::eq`, `::tab` — v2.1)
- Cross-references (`::ref[id]`) and citations (`::cite[key]`) — v2.1
- Attribute-body grammar (classes, ids, quoted/unquoted key-value pairs)

## What it does NOT cover

- **CommonMark itself.** Headings, paragraphs, lists, fenced code, links,
  images, emphasis, etc. are delegated to the CommonMark specification
  (`spec.commonmark.org`). Real parsers layer this grammar on top of a
  CommonMark core.
- **Math delimiters.** Math is a separate extension (KaTeX / MathJax-style
  `$...$` and `$$...$$`). Not part of this grammar.
- **GFM tables.** Same — GFM extension, not MDZ-specific.
- **Front matter (YAML/TOML).** MDZ uses the manifest for metadata; front
  matter is not part of the format.

## Validator vs. parser

The grammar defines what a **parser** must accept. The **validator**
enforces additional semantic rules (from the v2.0 spec):

- `::cite[key]` keys must resolve against `references.json`
- `::ref[id]` ids must resolve to a labeled block somewhere in the archive
- Duplicate ids within a document → warning
- Profile-specific requirements (IMRaD sections, required metadata, etc.)

Conformance test suite covers both: `tests/conformance/positive/` tests
parser-accepts, `tests/conformance/negative/` tests parser-rejects, and
validator rules are covered separately in `tests/validator/` (Phase 1.3).

## Versioning

- **v1.1** grammar lives at `spec/MDX_FORMAT_SPECIFICATION_v1.1.md` §4.4 (prose).
  This directory is v2.0+.
- **v2.0** directives: `::cell`, `::output`, `::include`, locales, variants,
  profile, accessibility attrs, signatures, content-addressing.
- **v2.1** (in progress): `::cite`, `::ref`, `::fig`, `::eq`, `::tab`.

New grammar versions are strictly additive on the syntax side. Semantic
tightening (e.g., rejecting silently-accepted malformed output in v1.1) is
gated by the manifest's `mdx_version` field.

## Roundtrip property

For every AST the parser emits, there exists a serializer that produces a
document which parses back to the same AST (modulo whitespace
normalization). This is tested via property-based tests in
`tests/property/` using `hypothesis` (Python) and `fast-check` (TypeScript).

## References

- RFC 5234 — Augmented BNF for Syntax Specifications
- RFC 7405 — Case-Sensitive String Support in ABNF
- CommonMark 0.31 — https://spec.commonmark.org/0.31/
- W3C Web Annotation Data Model (for annotations; out of grammar scope)
