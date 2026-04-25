# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**This project was renamed from MDX to MDZ on 2026-04-24.** See `ROADMAP.md`
Phase 0 and `CHANGELOG.md` for rename details. Throughout this file, older
references to "MDX" may remain in paths, class names, and spec filenames
pending the Phase 0 code-rename sweep (task #46 in the TaskList).

MDZ (**Markdown Zipped Container**) is a draft specification for an open file
format for **executable scientific papers** — one signed ZIP archive carrying
the manuscript, executable code cells, data, figures, citations, and
cryptographic provenance chain. The narrowing to "executable scientific
papers" happened 2026-04-24 per `docs/POSITIONING.md`; previously the format
was pitched as general-purpose. Current spec version is v2.0.0 (draft).

Backward-compat policy: readers MUST accept both `.mdx` and `.mdz`
extensions and both MIME types (`application/vnd.mdx-container+zip` and
`application/vnd.mdz-container+zip`) through 2027-01-01. Writers should emit
`.mdz` for new archives.

## Repository Structure

Note on paths: the repo root directory is still `mdx/` and the TypeScript /
Python implementation files are still `mdx_format.ts` / `mdx_format.py`.
Renaming the files would churn every import statement in one PR; deferred
to the Phase 1 parser-rebuild landing. Class/type names inside those files
are now `MDZ*` with `MDX*` deprecated aliases.

```
mdx/                                    # (directory name deferred-rename)
├── spec/
│   ├── MDX_FORMAT_SPECIFICATION.md                 # v1.0 formal spec
│   ├── MDX_FORMAT_SPECIFICATION_v1.1.md            # v1.1 alignment
│   ├── MDX_FORMAT_SPECIFICATION_v2.0.md            # v2.0 draft (current)
│   ├── manifest.schema.json                        # v1.1 JSON Schema
│   ├── manifest-v2.schema.json                     # v2.0 JSON Schema
│   ├── grammar/                                    # Phase 1 formal grammar
│   │   ├── mdz-directives.abnf                     # RFC 5234 normative
│   │   ├── mdz-directives.lark                     # PEG for Python parser
│   │   └── README.md
│   └── profiles/
│       ├── scientific-paper-v1.json                # tightened v1.1
│       ├── api-reference-v1.json
│       └── mdz-advanced-v1.json                    # opt-in enterprise
├── implementations/
│   ├── typescript/
│   │   ├── mdx_format.ts                           # MDZDocument / MDZManifest
│   │   ├── mdx_format.test.ts                      # vitest units
│   │   ├── mdx_format.integration.test.ts          # v1.1 roundtrip
│   │   ├── mdx_format.v20.integration.test.ts      # v2.0 roundtrip
│   │   └── mdx_format.property.test.ts             # fast-check
│   └── python/
│       ├── mdx_format.py                           # generator example
│       ├── alignment_parser.py                     # legacy regex parser
│       ├── create_v20_example.py
│       └── mdz_parser/                             # Phase 1 Lark parser
│           ├── __init__.py
│           ├── parser.py
│           ├── ast.py
│           └── errors.py
├── cli/                                            # Node.js CLI
│   ├── src/
│   │   ├── index.js                                # program: mdz
│   │   └── commands/
│   │       ├── info.js / view.js / extract.js      # v1 basics
│   │       ├── edit.js / create.js / validate.js
│   │       ├── import-ipynb.js                     # Phase 2: Jupyter -> MDZ
│   │       ├── export-jats.js                      # Phase 2: MDZ -> JATS 1.3
│   │       ├── export-epub.js                      # Phase 2: MDZ -> EPUB 3.3
│   │       └── verify.js                           # Phase 3: signature chain
│   └── dist/
├── packages/                                       # Phase 2 npm packages
│   ├── mdz-viewer/                                 # <mdz-viewer> web component
│   │   └── src/ (archive.ts, render.ts,
│   │             mdz-viewer.ts, index.ts,
│   │             manifest-types.ts)
│   └── mdz-viewer-hosted/                          # Cloudflare Worker
│       └── src/worker.ts
├── editor-desktop/                                 # Phase 2.3a + 2.3b Electron editor (feature-complete)
│   ├── src/main/                                   # Electron main process
│   │   ├── archive-io.ts                          # pure open / save (FsLike-injected)
│   │   ├── ipynb-import.ts                        # .ipynb → .mdz bridge
│   │   ├── main.ts                                # Electron glue + IPC handlers
│   │   └── variant-encoder.ts                     # main-process sharp encoder (2.3b.6.2)
│   ├── src/preload/{preload,types}.ts              # contextBridge surface + EditorApi types
│   ├── src/renderer/                               # 18 modules, see source directory for full list
│   │   ├── index.{html,ts}                        # main entry
│   │   ├── editor-pane.ts                         # CodeMirror 6 + onPreviewRendered hook
│   │   ├── asset-store.ts, assets sidebar, drag-drop
│   │   ├── directive-{insert,pickers,modal}.ts    # picker pack (2.3a.5.1–4 + 2.3b.7.1–5)
│   │   ├── accessibility-checker.ts               # live WCAG scan (2.3b.2)
│   │   ├── block-diff.ts, diff-render.ts          # block-level diff + Compare-versions modal (2.3b.3)
│   │   ├── annotations.ts, annotations-render.ts  # peer-review data + sidebar UI (2.3b.4)
│   │   ├── locales.ts, sync-scroll.ts             # multi-locale data + Compare-locales modal (2.3b.5)
│   │   ├── variant-{planner,flow}.ts              # AVIF/WebP variant pipeline (2.3b.6)
│   │   ├── python-kernel.ts, cell-runner.ts       # Pyodide integration (2.3b.1)
│   │   ├── cell-run-buttons.ts                    # per-cell ▶ Run injection (2.3b.1.3)
│   │   └── kernel-manifest.ts                     # kernels.python.runtime save (2.3b.1.3)
│   ├── electron-builder.yml                        # 2.3a.6 release pipeline (env-var cert placeholders)
│   ├── build-resources/                            # entitlements + placeholder icons
│   ├── test/                                       # 19 test files, 376 cases
│   └── README.md
├── browser-extension/                              # Phase 2.5 WebExtensions
│   ├── manifest.json
│   ├── background/ content/ popup/ viewer/ icons/
├── legacy/                                         # Pre-Phase-2 demos retained for reference (not actively maintained)
│   ├── editor/index.html                          # WYSIWYG demo — replaced by editor-desktop/
│   ├── viewer/index.html                          # read-only demo — replaced by packages/mdz-viewer/
│   └── chrome-extension/                          # legacy Chrome-only ext — replaced by browser-extension/
├── tree-sitter-mdz/                                # alpha grammar
├── examples/
│   ├── example-document.mdx                        # v1.x basic
│   ├── alignment-*.mdx                             # v1.1 fixtures
│   ├── technical-doc.mdx
│   └── v2/
│       ├── comprehensive.mdx                       # v2.0 full feature demo
│       └── parser-fixtures/                        # directive fixtures
├── tests/
│   ├── alignment/                                  # v1.1 conformance
│   ├── conformance/                                # Phase 1, 52 fixtures
│   │   ├── positive/ negative/ roundtrip/ edge/
│   │   └── run_conformance.py
│   ├── property/test_parser_properties.py          # hypothesis
│   ├── v2.0/                                       # parser + schema + Lark
│   ├── cli/test_cli_dual_extension.py              # Phase 0: .mdz/.mdx parity
│   ├── parity/rust_ts_manifest_parity.py           # Phase 4.1 Rust↔TS harness
│   ├── python/test_deprecation.py                  # checksum → content_hash
│   └── accessibility/                              # Phase 3.3 scaffold
│       ├── fixtures/ (23 categories across 4 WCAG rule families)
│       └── run_accessibility.py
├── docs/                                           # strategic documents
│   ├── POSITIONING.md   COMPETITIVE.md
│   ├── FUNDING.md       PARTNERSHIPS.md
│   ├── for-authors/SUBMITTING.md
│   ├── for-journals/EDITORIAL.md
│   ├── for-reviewers/REPRODUCING.md
│   ├── proposals/                                  # Phase 4.4 design docs
│   │   └── streaming.md                            # HTTP-Range streaming
│   └── governance/                                 # Phase 5 CG scaffolding
│       ├── CHARTER.md                              # W3C CG charter draft
│       ├── RFC_PROCESS.md                          # change-management
│       ├── TRADEMARK.md                            # nominative-use policy
│       └── RELEASE_ENGINEERING.md                  # versioning + releases
├── bindings/                                       # Phase 4.1 host-lang bindings
│   └── rust/                                       # mdz crate (alpha)
│       ├── Cargo.toml   README.md
│       ├── src/lib.rs                              # Archive / Manifest / Role / License
│       ├── tests/archive_integration.rs            # integration tests
│       └── examples/parity_dump.rs                 # cross-impl parity helper
├── integrations/                                   # Phase 4.2 editor / tool hooks
│   ├── pandoc/
│   │   ├── mdz-filter.lua                          # LaTeX → MDZ pipeline
│   │   └── tests/                                  # golden-output fixtures
│   └── vscode/                                     # MDZ VS Code extension
│       ├── package.json
│       ├── src/extension.js  src/helpers.js        # pure helpers extracted for tests
│       ├── test/helpers.test.js                    # node:test unit tests
│       └── syntaxes/mdz.tmLanguage.json
├── tools/                                          # Phase 4.3 corpus tooling
│   └── corpus-fetcher/fetch_arxiv.py               # arXiv → MDZ benchmark
├── spec/
│   ├── extensions/delta-snapshots-v1.md            # git-style packfiles (Phase 4.5)
│   └── directives/                                 # Phase 2.1 directive specs
│       ├── references-csl.md                       # CSL-JSON bibliography
│       └── peer-review-annotations.md              # W3C Web Annotation extension
├── ROADMAP.md           # phased plan
├── CHANGELOG.md
├── CLAUDE.md            # (this file)
└── .github/
```

## Development Commands

### CLI Tool
```bash
# Install dependencies
cd cli
npm install

# Run commands directly
node src/index.js view document.mdx       # Open in browser
node src/index.js extract document.mdx    # Extract contents
node src/index.js info document.mdx       # Show metadata
node src/index.js edit document.mdx       # Interactive editor
node src/index.js create                  # Create new document
node src/index.js validate document.mdx   # Validate structure

# Build standalone executable
npm run build          # Windows x64
npm run build:all      # All platforms (outputs to dist/)
```

### Web Editor
```bash
cd editor
python -m http.server 8080
# Open http://localhost:8080 in browser
```

### Python
```bash
# Generate example MDX document
cd implementations/python
python mdx_format.py
```

### TypeScript
```bash
# Type check
tsc implementations/typescript/mdx_format.ts --noEmit --target es2020 --moduleResolution node --skipLibCheck

# Compile
tsc implementations/typescript/mdx_format.ts --target es2020 --module esnext
```

### Testing
- Use CLI: `node cli/src/index.js view examples/example-document.mdx`
- Run the production editor: `npm run dev -w @mdz-format/editor-desktop`
- Render an archive in the production viewer: import `@mdz-format/viewer`
  and pass the archive blob to `<mdz-viewer>` (see Phase 2.1 docs)
- Generate examples with Python script and verify structure
- Open `.mdx` files with any ZIP utility to inspect contents
- Pre-Phase-2 demos (`legacy/editor/`, `legacy/viewer/`,
  `legacy/chrome-extension/`) still open in any browser but are not
  the supported entry points for new work.

### CI Validation
The GitHub Actions workflow (`.github/workflows/ci.yml`) runs 16 jobs:
- Validate TypeScript (type-check via `tsc --noEmit`)
- TypeScript Unit Tests (vitest; includes fast-check property tests)
- Validate Python (py_compile + example generation)
- Validate Example Documents (v1.x structural checks)
- Validate v1.1 Examples (alignment fixtures + v1.1 parser conformance)
- Validate v2.0 Examples and Parser (includes Lark parity, 52-fixture
  conformance suite, hypothesis property tests)
- Validate JSON Schema (ajv-cli + schema negative-rejection tests)
- Validate CLI Tool (info/validate/extract against example-document.mdx)
- Phase 2/3 Tests (viewer sanitizer XSS + accessibility)
- Validate Rust Binding (Phase 4.1 — cargo build+test, default + no-default)
- Validate Pandoc Lua Filter (Phase 4.2 — smoke + fixture pack if present)
- Validate VS Code Extension (Phase 4.2 — JSON + syntax check)
- Validate Editor Desktop (Phase 2.3a.1 — type-check testable core + 11 archive-io tests; Electron deps are optional, skipped in CI)
- Validate Browser Extension (Phase 2.5 — manifest.json structural + JS syntax + reproducible-build doc)
- Validate Corpus Fetcher (Phase 4.3 — py_compile + import smoke)
- Lint Markdown (DavidAnson/markdownlint-cli2-action)

## Architecture

### MDX File Structure
```
document.mdx (ZIP container)
├── manifest.json           # REQUIRED: Document metadata & asset inventory
├── document.md             # REQUIRED: Primary Markdown content
├── assets/                 # OPTIONAL: Organized by type
│   ├── images/            # PNG, JPEG, WebP, SVG, GIF
│   ├── video/             # MP4, WebM
│   ├── audio/             # MP3, WAV, OGG
│   ├── models/            # glTF, GLB (3D models)
│   ├── documents/         # PDF
│   ├── data/              # CSV, JSON
│   └── fonts/             # WOFF2, TTF
├── styles/                 # OPTIONAL: CSS stylesheets
├── history/                # OPTIONAL: Version snapshots
├── annotations/            # OPTIONAL: W3C Web Annotation format
└── extensions/             # OPTIONAL: Plugin data
```

### TypeScript Implementation

**Key Classes** (renamed 2026-04-24; `MDX*` names retained as deprecated
aliases through 2027-01-01):

- `MDZDocument` (alias `MDXDocument`) — main class for creating/reading MDZ files
  - Factory methods: `create()`, `open()`, `openFile()`
  - Content: `setContent()`, `appendContent()`, `getContent()`
  - Assets: `addImage()`, `addVideo()`, `add3DModel()`, `addData()`, `getAsset()`
  - Export: `save()`, `saveAsArrayBuffer()`, `toHTML()` (deprecated — toy renderer)

- `MDZManifest` (alias `MDXManifest`) — document metadata and configuration
  - Properties: `title`, `subtitle`, `version`, `language`, `created`, `modified`
  - Methods: `addAuthor()`, `addAsset()`, `addLocale()`, `addInclude()`,
    `addVariant()`, `setProfile()`, `setAccessibility()`, `addDerivedFrom()`,
    `addSignature()`, `addKernel()`, `validate()`

**Constants:**
- Current: `MDZ_VERSION`, `MDZ_MIME_TYPE`, `MDZ_EXTENSION`
- Legacy preserved: `MDX_MIME_TYPE_LEGACY` (`application/vnd.mdx-container+zip`),
  `MDX_EXTENSION_LEGACY` (`.mdx`)
- Deprecated aliases: `MDX_VERSION` → `MDZ_VERSION`; `MDX_MIME_TYPE` →
  `MDX_MIME_TYPE_LEGACY` (NOT the new MIME); `MDX_EXTENSION` →
  `MDX_EXTENSION_LEGACY`. Pre-rename callers that compare MIME strings
  continue to match legacy archives.

**Enumerations:**
- `AssetCategory`: IMAGES, VIDEO, AUDIO, MODELS, DOCUMENTS, DATA, STYLES, SCRIPTS, FONTS, OTHER
- `AnnotationType`: COMMENT, HIGHLIGHT, SUGGESTION, QUESTION, BOOKMARK
- `SnapshotType`: FULL, DIFF, REFERENCE

**Dependencies:** JSZip (for ZIP manipulation), Web Crypto API (for hashing)

### Python Implementation

`create_example_mdx()` demonstrates the complete workflow:
1. Create Markdown content with extended directives
2. Generate assets (SVG, CSV, glTF)
3. Build manifest with comprehensive metadata
4. Create ZIP archive with DEFLATE compression
5. Verify output structure

Uses only standard library: `json`, `zipfile`, `hashlib`, `uuid`, `pathlib`

### CLI Tool

Node.js command-line tool using Commander.js and Inquirer.js.

**Commands:**
- `view <file>` - Opens MDX in browser with embedded viewer, starts local server
- `extract <file> [output]` - Extracts ZIP contents to folder
- `info <file>` - Displays metadata, assets, content in terminal
- `edit <file>` - Interactive terminal editor (inquirer-based)
- `create [title]` - Creates new MDX from templates (blank, article, report, presentation)
- `validate <file>` - Validates MDX structure and manifest against JSON Schema

**Dependencies:** commander, inquirer, adm-zip, marked, marked-terminal, chalk (v4.x for CommonJS), open, ora

**Build:** Uses `pkg` to create standalone executables for Windows/Mac/Linux

### Web Editor (legacy)

The single-file browser-based WYSIWYG demo lives at
`legacy/editor/index.html`. Replaced by the Phase 2.3 Electron
editor at `editor-desktop/`. See `legacy/README.md` for the
full migration table.

### Chrome Extension (legacy)

The Chrome-only extension at `legacy/chrome-extension/` predates
the Phase 2.5 cross-browser MV3 extension at `browser-extension/`.
See `legacy/README.md`.

## Key Standards

- **Markdown:** CommonMark 0.31+ with extensions (tables, footnotes, math, task lists)
- **Annotations:** W3C Web Annotation format
- **Versioning:** Semantic Versioning for document versions
- **Paths:** All internal paths use forward slashes, max 255 characters
- **Compression:** ZIP with DEFLATE

## Extended Markdown Directives

Beyond standard Markdown, MDX supports directives for:
- `::video[src]` - Embedded video
- `::audio[src]` - Embedded audio
- `::model[src]` - 3D models (glTF)
- `::embed[src]` - PDFs and documents
- `::data[src]` - Data visualization (CSV, JSON)
- `::figure`, `::note`, `::details`, `::toc` - Document structure

## v1.1 Alignment Features

MDX v1.1 adds text alignment and block attributes:

**Shorthand alignment:**
```markdown
{:.center}
This paragraph is centered.

{:.right}
This is right-aligned.
```

**Container blocks:**
```markdown
:::{.align-center}
All content in this container is centered.
:::
```

**Alignment classes:** `.align-left`, `.align-center`, `.align-right`, `.align-justify`

**Precedence:** inline attributes > block attributes > container attributes

## Design Principles

1. **Self-Contained** - Everything in a single ZIP, works offline
2. **Graceful Degradation** - Basic viewers show Markdown; enhanced viewers unlock media
3. **Universal Access** - Extract with any ZIP tool, edit Markdown with any editor
4. **Extensibility** - Plugin architecture, custom directives, custom metadata
