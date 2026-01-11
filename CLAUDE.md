# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MDX (Markdown eXtended Container) is a draft specification (v1.0.0) for an open document format that packages Markdown content with embedded media into self-contained ZIP archives.

## Repository Structure

```
mdx/
├── spec/                              # Specification documents
│   └── MDX_FORMAT_SPECIFICATION.md   # Complete formal specification
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
├── examples/
│   └── example-document.mdx          # Working example
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

**Dependencies:** commander, inquirer, jszip, marked, chalk, open

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

## Design Principles

1. **Self-Contained** - Everything in a single ZIP, works offline
2. **Graceful Degradation** - Basic viewers show Markdown; enhanced viewers unlock media
3. **Universal Access** - Extract with any ZIP tool, edit Markdown with any editor
4. **Extensibility** - Plugin architecture, custom directives, custom metadata
