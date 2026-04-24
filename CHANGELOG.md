# Changelog

All notable changes to the MDZ Format (formerly MDX Format) specification
and implementations.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Renamed: MDX → MDZ (2026-04-24)

Project renamed from **MDX** (Markdown eXtended Container) to **MDZ** (Markdown
Zipped Container). Reason: the original "MDX" name collides with the React
ecosystem's Markdown+JSX format, which dominates search results and developer
mindshare for "MDX file format." While deployed usage of this project is
effectively zero, it's the cheapest possible time to rename.

**Backward compatibility:** readers MUST accept both extensions and both MIME
types through 2027-01-01:

- Extensions: `.mdz` (new, preferred) and `.mdx` (legacy, accepted on read)
- MIME types: `application/vnd.mdz-container+zip` (new) and
  `application/vnd.mdx-container+zip` (legacy)
- Class names: `MDZDocument`, `MDZManifest`, etc. with `MDX*` deprecated
  aliases exported from the TypeScript library
- Manifest field: `mdx_version` retained (not renamed) to avoid breaking every
  existing manifest; readers treat it as equivalent to a hypothetical
  `mdz_version` field

After 2027-01-01, writers SHOULD emit `.mdz` exclusively; readers will
continue accepting `.mdx` indefinitely for archival access.

### Repositioned: "executable scientific papers" as the core niche

Previously framed as a general-purpose document format. Scope narrowed to
serve researchers publishing to arXiv / bioRxiv / Zenodo / OSF and the OA
journals that ingest from them. Every feature in the spec is now evaluated
against that niche. See [`docs/POSITIONING.md`](docs/POSITIONING.md) and
[`ROADMAP.md`](ROADMAP.md).

### Added — Strategic documents (2026-04-24)

- `ROADMAP.md` — phased plan through end-2027 with explicit success metrics
- `docs/POSITIONING.md` — one-page pitch for researchers
- `docs/COMPETITIVE.md` — honest comparison vs Quarto / Jupyter Book /
  Curvenote / Manubot / Stencila with feature matrix
- `docs/FUNDING.md` — resourcing reality and funding options (open)
- `docs/PARTNERSHIPS.md` — outreach plan targeting arXiv / Zenodo / journals
- `docs/for-authors/SUBMITTING.md` — ipynb+tex → MDZ conversion guide
- `docs/for-journals/EDITORIAL.md` — validation + JATS-XML production path
- `docs/for-reviewers/REPRODUCING.md` — re-execute cells, verify provenance
- `spec/profiles/mdz-advanced-v1.json` — opt-in enterprise-grade profile
  (JCS canonicalization, multi-sig, DIDs, content-addressing)
- Tightened `spec/profiles/scientific-paper-v1.json` — added IMRaD + Data
  Availability section requirements, ORCID-resolvable author DID requirement,
  SPDX license requirement, CSL-JSON bibliography requirement, stricter
  accessibility baseline.

### Hardened — v2.0 implementations (from PR review, 2026-04-24)

Parser (`alignment_parser.py`) now fails loud instead of silent on:

- Unterminated fenced code blocks (was: silently absorb to EOF)
- Empty `::cell` source, empty `::include` target, empty `::output` body
- Missing `type=` on `::output` (was: default to "text")
- Non-integer `execution_count` (was: silent string coercion)

TypeScript type design:

- `SignerRole` is now `BuiltInSignerRole | CustomSignerRole` (branded) — drops
  the `| string` escape hatch that erased the union.
- `VersionEntry.parent_versions?: string[]` added for §15.4 fork/merge DAG.
- `cleanObject<T>` now uses `PlainObject<T>` conditional + runtime guard to
  exclude arrays/Maps/Sets/Dates.
- `MDZManifest.validate()` enforces invariants JSON Schema can't express:
  `locales.default` must be in `available[].tag`, no duplicate tags,
  `signature` XOR `signatures[]`, `prev_signature` required on chain
  entries 1+.
- `addSignature()` refuses chain-breaking insertions at call time.

Tests (+40 new):

- 6 parser error-path tests, 17 schema negative-rejection tests,
  v1.1→v2.0 loader compat tests, full v2.0 JSON roundtrip tests, v2.0
  MDZDocument integration tests through JSZip save+open.

CI:

- Removed `|| echo "completed with warnings"` — schema validation failures
  now break CI instead of being swallowed.
- Added Python setup to `validate-json-schema` job to run
  `test_schema_negatives.py`.

CLI:

- `info.js` top-level catch now prints stack trace to stderr (was: swallowed
  root cause).

Comprehensive example now exercises previously-partial v2.0 features:

- `document.content_id` (content-addressed identifier)
- Second signature with `prev_signature` (chain demo)
- Per-asset `locales[]` alternatives for es-ES and ja-JP alt-text

### Added — v2.0.0 Draft

<!-- markdownlint-disable MD013 -->
MDX Format Specification v2.0.0 Draft at
`spec/MDX_FORMAT_SPECIFICATION_v2.0.md`, with matching JSON Schema at
`spec/manifest-v2.schema.json`. Fully backward-compatible with v1.1 —
all v1.1 manifests (with `mdx_version` updated to `2.0.0`) validate
as minimal v2.0 documents.

Ten capability additions:

1. **Internationalization** (§8) — `content.locales` multi-locale bundle
   with per-asset locale alternatives and deterministic fallback
   resolution.
2. **Content-addressed storage** (§9) — optional
   `assets/by-hash/<algo>/<digest>` layout, `content_hash` on every
   asset (supersedes `checksum`), `document.content_id` for verifiable
   content identity.
3. **Streaming-friendly archive ordering** (§10) — normative ZIP
   local-header order: manifest → entry points → styles → data →
   media by size. Enables progressive fetch over byte-range HTTP.
4. **Computational cells** (§11) — `::cell` directive with cached
   `::output` blocks, `interactivity.kernels[]` declaring kernel specs
   (Jupyter-compatible), capability Level 5 "Notebook" for execution.
5. **Transclusion** (§12) — `::include` directive for archive-internal
   and cross-document content composition, `content.includes[]`
   declarations, hash-pinned external includes, circular-reference
   detection.
6. **Document profiles** (§13) — `document.profile` URI pointing to
   structural requirements (required sections, required manifest
   fields, validation rules); two reference profiles:
   `scientific-paper/v1`, `api-reference/v1`.
7. **Rich accessibility model** (§14) — `document.accessibility`
   top-level with features/hazards/reading-level/API-compliance
   claims; per-asset `accessibility` with long descriptions, audio
   description tracks, sign-language tracks, MathML fallbacks,
   sonification, tactile alternatives.
8. **Provenance and fork graph** (§15) — `document.derived_from[]` for
   source chains, multi-parent versions via `parent_versions[]`,
   optional `history/graph.json` DAG for fork/merge history.
9. **Multi-signature + DID identity** (§16) — `security.signatures[]`
   array with roles (author/reviewer/publisher/notary), W3C DID-based
   signer identity, signature chains via `prev_signature`, JCS
   canonicalization.
10. **Responsive asset variants + content negotiation** (§17) —
    per-asset `variants[]` for resolution/format/media-condition
    alternatives, `content.variants[]` for document-level audience
    variants (short/long, technical/layperson).

Viewer capability levels extended to Level 5 (Notebook). Conformance
updated to require multi-locale support at Level ≥ 0 and
accessibility surfacing at Level ≥ 3.
<!-- markdownlint-enable MD013 -->

### Deprecated (retained for backward compat)

- Asset `checksum` — use `content_hash`.
- `security.signature` (singular) — use `security.signatures[]` (array).
- Version history `parent_version` (singular) — use `parent_versions[]` (array).

### Breaking changes

**None.** v2.0 is intentionally backward-compatible. A valid v1.1 manifest with `mdx_version` bumped to `2.0.0` is a valid v2.0 manifest.

### Previous — v1.1.0 Draft

- MDX Format Specification v1.1.0 Draft (`spec/MDX_FORMAT_SPECIFICATION_v1.1.md`)
  - Text alignment and block attribute system (Section 4.4)
  - Shorthand alignment notation (`{:.center}`, `{:.right}`, etc.)
  - Directive block container syntax (`:::`)
  - Attribute precedence rules (inline > block > container)
  - Alignment integration with existing directives
  - New capability Level 4 "Advanced" for alignment support
  - Inline styles security considerations (Section 7.5)

- v1.1 Example documents
  - `examples/alignment-basic.mdx` - Basic alignment demonstrations
  - `examples/alignment-directives.mdx` - Alignment with media directives
  - `examples/alignment-complex.mdx` - Nested containers and precedence
  - `examples/technical-doc.mdx` - Real-world technical documentation

- Alignment conformance test suite (`tests/alignment/`)
  - 10 test files covering all alignment scenarios
  - Tests for basic alignment, headings, lists, blockquotes
  - Tests for directive integration and container blocks
  - Tests for attribute precedence and conflict resolution
  - Tests for malformed syntax and backward compatibility

- JSON Schema v1.1 updates (`spec/manifest.schema.json`)
  - Added `attributes` and `alignment` to extensions enum
  - Added `alignment_classes` to styles configuration
  - Added `attributes` section to rendering configuration

- Python script to generate v1.1 examples (`implementations/python/create_v11_examples.py`)

- JSON Schema for manifest validation (`spec/manifest.schema.json`)
  - Full schema for all manifest fields and asset types
  - Category-specific asset metadata validation
  - Schema ID: `https://mdx-format.org/schemas/manifest.schema.json`

- CLI `validate` command for document validation
  - Validates ZIP structure and required files
  - Checks manifest schema compliance
  - Verifies asset inventory and checksums
  - Detects common issues (orphaned assets, path issues, etc.)
  - Returns exit code 1 on failure (CI/CD friendly)

- Command-line interface (CLI) tool
  - `view` command - Open MDX documents in browser with full rendering
  - `extract` command - Extract archive contents to folder
  - `info` command - Display document metadata, assets, and content
  - `edit` command - Interactive terminal editor for metadata and content
  - `create` command - Create new documents from templates (blank, article, report, presentation)
  - `validate` command - Validate document structure and manifest
  - Cross-platform executable builds via pkg

- CI/CD pipeline enhancements
  - CLI tool testing in GitHub Actions
  - JSON Schema validation job
  - Example document validation with CLI

- Web-based WYSIWYG editor
  - Visual mode with live WYSIWYG editing
  - Markdown mode for raw source editing
  - Split view with side-by-side markdown and preview
  - Formatting toolbar (headings, bold, italic, lists, tables, links, images)
  - Drag-and-drop asset management
  - Document outline navigation
  - Open/save MDX files directly in browser
  - Word and character count

- Claude Code configuration
  - `.claude/settings.json` with project settings and code style preferences
  - `.mcp.json` with MCP server configuration
  - Root `.gitignore` for common ignores

### Fixed

- Implementation guide: Corrected assets structure from array to object with category keys
- Implementation guide: Updated validation example to iterate over asset categories
- Implementation guide: Fixed reader/writer examples to use correct manifest structure
- TypeScript: Removed dead code (unused `div` variable in `escapeHTML` method)
- Specification: Updated Appendix A with actual JSON Schema reference
- SVG images now render correctly in editor (added MIME type detection)
- Python implementation no longer uses hardcoded paths
- TypeScript `tracking_enabled` field renamed to `enabled` to match spec
- TypeScript annotation enum values now match W3C motivations
- Removed stray markdown backticks from viewer HTML

## [1.0.0] - Draft

### Added

- Initial MDX Format Specification (v1.0.0 Draft)
  - Archive structure definition
  - Manifest JSON schema
  - Asset organization by category
  - Extended Markdown directives (video, audio, model, data, embed)
  - Version history support
  - W3C Web Annotation integration
  - Security considerations
  - Conformance levels (Minimal, Standard, Full)

- TypeScript reference implementation
  - `MDXDocument` class for creating/reading MDX files
  - `MDXManifest` class for metadata management
  - Asset management with automatic categorization
  - Version history and annotation support
  - HTML export capability

- Python reference implementation
  - Example MDX document generator
  - Complete demonstration of all format features

- Web-based MDX viewer
  - Drag-and-drop file loading
  - Markdown rendering with syntax highlighting
  - Asset browser and preview
  - Manifest inspection

- Example MDX document demonstrating all features
