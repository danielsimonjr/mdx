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
├── browser-extension/                              # Phase 2.5 WebExtensions
│   ├── manifest.json
│   ├── background/ content/ popup/ viewer/ icons/
├── editor/index.html                               # WYSIWYG demo (pre-Phase 2.3)
├── viewer/index.html                               # read-only demo (pre-Phase 2.1)
├── chrome-extension/                               # legacy Chrome-only ext
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
│   └── accessibility/                              # Phase 3.3 scaffold
│       ├── fixtures/ (5 starter categories)
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
│       └── src/lib.rs                              # Archive / Manifest types
├── integrations/                                   # Phase 4.2 editor / tool hooks
│   ├── pandoc/mdz-filter.lua                       # LaTeX → MDZ pipeline
│   └── vscode/                                     # MDZ VS Code extension
│       ├── package.json  src/extension.js
│       └── syntaxes/mdz.tmLanguage.json
├── tools/                                          # Phase 4.3 corpus tooling
│   └── corpus-fetcher/fetch_arxiv.py               # arXiv → MDZ benchmark
├── spec/extensions/                                # Phase 4.5 extension specs
│   └── delta-snapshots-v1.md                       # git-style packfiles
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
- Open `editor/index.html` to edit MDX documents with WYSIWYG interface
- Open `viewer/index.html` for read-only viewing
- Generate examples with Python script and verify structure
- Open `.mdx` files with any ZIP utility to inspect contents

### CI Validation
The GitHub Actions workflow (`.github/workflows/ci.yml`) runs 14 jobs:
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

### Web Editor

Single-file browser-based WYSIWYG editor (`editor/index.html`).

**Features:**
- Three view modes: Visual (WYSIWYG), Markdown (source), Split View
- Formatting toolbar with all standard formatting options
- Asset sidebar with drag-drop upload and file browser
- Document outline navigation (clickable headings)
- Direct open/save of MDX files via browser File API

**Dependencies (CDN):** JSZip, Marked, Highlight.js, Turndown, Font Awesome

**Key Functions:**
- `openDocument(file)` - Loads MDX, parses manifest, extracts assets
- `saveDocument()` - Converts HTML to Markdown, builds ZIP, downloads
- `updateAssetReferences()` - Replaces asset paths with blob URLs (with MIME types)
- `getMimeType(path)` - Returns correct MIME type for blob creation

### Chrome Extension

Native Chrome extension for viewing MDX files directly in the browser without a server.

**Setup:**
```bash
cd chrome-extension
node setup.js              # Download dependencies
# Load unpacked extension via chrome://extensions
```

**Features:** Document outline navigation, export to HTML/Markdown/JSON, syntax highlighting

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
