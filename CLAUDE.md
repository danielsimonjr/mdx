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
├── viewer/
│   └── index.html                    # Web-based MDX viewer
├── examples/
│   └── example-document.mdx          # Working example
└── .github/                          # GitHub templates & CI
```

## Development Commands

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
- Open `viewer/index.html` in a browser to test MDX documents
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
