# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MDX (Markdown eXtended Container) is a draft specification for an open document format that packages Markdown content with embedded media into self-contained ZIP archives. The current version is v1.1.0 (draft), which adds text alignment and block attribute support.

## Repository Structure

```
mdx/
├── spec/                              # Specification documents
│   ├── MDX_FORMAT_SPECIFICATION.md   # v1.0 formal specification
│   ├── MDX_FORMAT_SPECIFICATION_v1.1.md  # v1.1 with alignment features
│   └── manifest.schema.json          # JSON Schema for manifest validation
├── implementations/                   # Reference implementations
│   ├── typescript/
│   │   └── mdx_format.ts             # TypeScript implementation (2,700+ lines)
│   └── python/
│       └── mdx_format.py             # Python implementation
├── cli/                               # Command-line tool (Node.js)
│   ├── src/
│   │   ├── index.js                  # CLI entry point
│   │   └── commands/                 # Command implementations
│   └── dist/                         # Built executables
├── editor/
│   └── index.html                    # Web-based WYSIWYG editor
├── viewer/
│   └── index.html                    # Web-based MDX viewer (read-only)
├── chrome-extension/                  # Chrome browser extension
│   └── manifest.json
├── examples/                          # Example MDX documents
│   ├── example-document.mdx          # Basic working example
│   ├── alignment-basic.mdx           # v1.1 basic alignment
│   ├── alignment-directives.mdx      # v1.1 alignment with media
│   ├── alignment-complex.mdx         # v1.1 nested containers
│   └── technical-doc.mdx             # v1.1 technical documentation
├── tests/
│   └── alignment/                    # v1.1 conformance tests
└── .github/                          # GitHub templates & CI
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
The GitHub Actions workflow (`ci.yml`) runs:
- TypeScript type checking
- Python syntax validation and example generation
- MDX structure validation (manifest.json, document.md present)
- JSON Schema validation of manifests
- CLI command tests (info, validate, extract)
- Markdown linting

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

**Key Classes:**
- `MDXDocument` - Main class for creating/reading MDX files
  - Factory methods: `create()`, `open()`, `openFile()`
  - Content: `setContent()`, `appendContent()`, `getContent()`
  - Assets: `addImage()`, `addVideo()`, `add3DModel()`, `addData()`, `getAsset()`
  - Export: `save()`, `saveAsArrayBuffer()`, `toHTML()`

- `MDXManifest` - Document metadata and configuration
  - Properties: `title`, `subtitle`, `version`, `language`, `created`, `modified`
  - Methods: `addAuthor()`, `addAsset()`, `validate()`

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
