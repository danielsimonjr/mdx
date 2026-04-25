# MDZ Format

**Markdown Zipped Container** — an open file format for **executable
scientific papers**. One signed ZIP archive carries the manuscript,
executable code cells, data, figures, citations, multi-signature
provenance, and accessibility metadata.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Specification](https://img.shields.io/badge/Spec-v2.0.0--Draft-orange.svg)](spec/MDX_FORMAT_SPECIFICATION_v2.0.md)

> **STATUS: experimental research project.** The tooling targets
> professional-grade UX (polished, keyboard-first, accessible, fast). The
> *format itself* is not yet production-stable — breaking changes may land
> up to v3.0. Do not base production infrastructure on MDZ until at least
> one external organization has published in the format. See
> [ROADMAP.md](ROADMAP.md) for current phase and [docs/FUNDING.md](docs/FUNDING.md)
> for resourcing status.

> **Naming.** This project was renamed from **MDX** to **MDZ** on
> 2026-04-24 because "MDX" collides with the React ecosystem's Markdown+JSX
> format. The file extension `.mdx` and MIME type
> `application/vnd.mdx-container+zip` remain accepted by readers as legacy
> aliases through 2027-01-01. New archives should use `.mdz` and
> `application/vnd.mdz-container+zip`. **Both MIME types are proposed —
> neither is IANA-registered yet.** Registration is planned once the
> specification leaves draft status.

## What MDZ is for

MDZ replaces the duct-tape stack of `.ipynb` + Overleaf + supplementary
`.zip` + post-hoc DOI. See [docs/POSITIONING.md](docs/POSITIONING.md) for
the full pitch. In short: a grad student authors a reproducible paper, a
reviewer re-executes any cell in-browser, a journal validates the
submission against its profile and exports JATS-XML for production —
one archive carries all of it, cryptographically signed end to end.

This is a focused niche. MDZ is *not* a Google Docs replacement, not a
page-layout tool, not a general-purpose document format. See
[docs/POSITIONING.md](docs/POSITIONING.md) "What MDZ is NOT" for the
explicit boundaries, and [docs/COMPETITIVE.md](docs/COMPETITIVE.md) for
honest comparison against Quarto, Jupyter Book, Curvenote, Manubot, and
Stencila.

## Key capabilities

- **One archive, one hash.** Signed, content-addressed, offline-ready.
- **Executable cells** (`::cell`) with cached outputs — reviewers re-run
  what they doubt; the rest render from cache.
- **Multi-signature chains** (author → corresponding author → reviewer →
  editor) with W3C DID identity resolution via `did:web`.
- **Provenance DAG** — preprint → revisions → accepted version, all in
  one file.
- **Accessibility built-in** — WCAG 2.1 AA baseline declared in the
  manifest, not only in the rendered HTML.
- **Multi-locale content** — primary language + translations in one archive.
- **Profile-driven validation** — journals own their submission profile
  and reject non-conformant manuscripts programmatically.
- **Graceful degradation** — any ZIP tool extracts contents; any Markdown
  reader reads the prose; cells and outputs layer on top.

### What's New in v2.0 (still named `mdx_version` in manifests for compatibility)

Ten capability additions, each backward-compatible with v1.1:

1. **Internationalization** — multi-locale content bundling (§8)
2. **Content-addressed storage** — optional `assets/by-hash/` + `content_hash` (§9)
3. **Streaming-friendly archive ordering** — read text before media arrives (§10)
4. **Computational cells** — `::cell` directive with cached outputs (§11)
5. **Transclusion** — `::include` directive for cross-file and cross-document composition (§12)
6. **Document profiles** — machine-checkable structural requirements per document type (§13)
7. **Rich accessibility model** — long descriptions, AD tracks, sign-language, MathML fallbacks (§14)
8. **Provenance + fork graph** — multi-parent versions, derived-from chain, history DAG (§15)
9. **Multi-signature + DID identity** — `signatures[]` with roles and W3C DIDs (§16)
10. **Responsive variants** — per-asset `variants[]` and document-level `content.variants[]` (§17)

All v1.1 features (alignment, block attributes, container blocks, directive
containers) continue to work unchanged. See
[`spec/MDX_FORMAT_SPECIFICATION_v2.0.md`](spec/MDX_FORMAT_SPECIFICATION_v2.0.md)
for full details and
[`spec/MDX_FORMAT_SPECIFICATION_v1.1.md`](spec/MDX_FORMAT_SPECIFICATION_v1.1.md)
for the v1.1 baseline.

## File Structure

```
document.mdx (ZIP container)
├── manifest.json           # Document metadata and asset inventory
├── document.md             # Primary Markdown content
├── assets/                 # Embedded media
│   ├── images/            # PNG, JPEG, WebP, SVG, GIF
│   ├── video/             # MP4, WebM (+ VTT captions)
│   ├── audio/             # MP3, WAV, OGG
│   ├── models/            # glTF, GLB (3D models)
│   ├── documents/         # PDF and other documents
│   ├── data/              # CSV, JSON, Parquet
│   ├── fonts/             # WOFF2, TTF
│   └── other/             # Uncategorized assets
├── styles/                 # Custom CSS
├── scripts/                # Interactive content (sandboxed)
├── history/                # Version snapshots
└── annotations/            # W3C Web Annotations
```

## Quick Start

### Creating an MDX Document (Python)

```python
import zipfile
import json
import uuid
from datetime import datetime, timezone

# Create a minimal MDX document
with zipfile.ZipFile('my-document.mdx', 'w', zipfile.ZIP_DEFLATED) as mdx:
    # Add manifest
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    manifest = {
        "mdx_version": "2.0.0",
        "document": {
            "title": "My Document",
            "id": str(uuid.uuid4()),  # UUID v4 required
            "created": timestamp,
            "modified": timestamp
        },
        "content": {
            "entry_point": "document.md",
            "extensions": ["tables", "attributes", "alignment"]
        }
    }
    mdx.writestr('manifest.json', json.dumps(manifest, indent=2))

    # Add content
    mdx.writestr('document.md', '# Hello World\n\nThis is my MDX document.')
```

### Creating an MDX Document (TypeScript)

```typescript
import { MDXDocument } from './implementations/typescript/mdx_format';

const doc = MDXDocument.create("My Document", {
  author: { name: "Your Name", email: "you@example.com" }
});
doc.setContent("# Hello World\n\nThis is my MDX document.");
await doc.addImage(imageData, "figure.png", { altText: "A figure" });
const blob = await doc.save();
```

### Reading an MDX Document

```typescript
const doc = await MDXDocument.open(fileData);
console.log(doc.title);
console.log(doc.getContent());
```

## Repository Structure

```
mdx/
├── spec/                          # Specification documents
│   ├── MDX_FORMAT_SPECIFICATION.md
│   └── manifest.schema.json      # JSON Schema for validation
├── docs/                          # Developer documentation
│   ├── implementation-guide.md   # Implementation patterns
│   ├── tool-builder-guide.md     # Building utilities
│   └── format-internals.md       # Technical reference
├── implementations/               # Reference implementations
│   ├── typescript/               # TypeScript/JavaScript
│   │   └── mdx_format.ts
│   └── python/                   # Python
│       └── mdx_format.py
├── cli/                           # Command-line tool
│   ├── src/                      # CLI source code
│   └── dist/                     # Built executables
├── editor-desktop/                # Electron production editor (Phase 2.3)
├── packages/mdz-viewer/           # <mdz-viewer> web component (Phase 2.1)
├── packages/mdz-viewer-hosted/    # Cloudflare Worker for view.mdz-format.org (Phase 2.2)
├── browser-extension/             # MV3 cross-browser extension (Phase 2.5)
├── legacy/                        # pre-Phase-2 demos retained for reference
│   ├── editor/                    # WYSIWYG demo (replaced by editor-desktop/)
│   ├── viewer/                    # read-only viewer demo (replaced by packages/mdz-viewer/)
│   └── chrome-extension/          # Chrome-only ext (replaced by browser-extension/)
├── examples/                      # Example MDX documents
│   ├── example-document.mdx       # Basic example
│   ├── alignment-basic.mdx        # v1.1 alignment examples
│   ├── alignment-directives.mdx   # v1.1 alignment with directives
│   ├── alignment-complex.mdx      # v1.1 nested containers
│   └── technical-doc.mdx          # Real-world technical documentation
├── tests/                         # Conformance test files
│   └── alignment/                 # v1.1 alignment tests
└── .github/                       # GitHub templates & CI
```

## Specification

The complete specification is available at:
- **v2.0** (Current): [spec/MDX_FORMAT_SPECIFICATION_v2.0.md](spec/MDX_FORMAT_SPECIFICATION_v2.0.md)
- **v1.1** (Predecessor): [spec/MDX_FORMAT_SPECIFICATION_v1.1.md](spec/MDX_FORMAT_SPECIFICATION_v1.1.md)
- **v1.0**: [spec/MDX_FORMAT_SPECIFICATION.md](spec/MDX_FORMAT_SPECIFICATION.md)

**Current Version:** 2.0.0 (Draft)

**MIME Type:** `application/vnd.mdx-container+zip`

**File Extensions:** `.mdx` (primary), `.mdxc` (alternative, to avoid conflict with MDX/JSX)

**JSON Schema:**
[`spec/manifest-v2.schema.json`](spec/manifest-v2.schema.json) (v2.0),
[`spec/manifest.schema.json`](spec/manifest.schema.json) (v1.1 baseline,
still accepted)

## Comparison with Other Formats

| Format | MDX Advantage |
|--------|---------------|
| DOCX | Human-readable source, simpler structure, web-native media |
| PDF | Editable source, smaller size, true interactivity |
| 3D PDF | Open format, modern 3D standards (glTF), no proprietary tools |
| HTML | Self-contained, offline-capable, version-controlled |
| Plain Markdown | Bundled assets, rich metadata, collaboration features |
| EPUB | Simpler structure, better for documents vs. books |

## Extended Markdown Syntax

MDX supports CommonMark 0.31+ with extensions:

```markdown
<!-- Standard Markdown for images -->
![Alt text](assets/images/figure.png)

<!-- Extended directives for rich media -->
::video[Demo Video]{src="assets/video/demo.mp4" poster="assets/images/thumbnail.png" controls}
::audio[Narration]{src="assets/audio/narration.mp3" controls}
::model[3D Part]{src="assets/models/part.gltf" camera="front" controls}
::data[Results]{src="assets/data/results.csv" visualization="chart" type="bar"}

<!-- v1.1: Text alignment -->
{:.center}
This paragraph is centered.

## Centered Heading {:.center}

<!-- v1.1: Container blocks -->
::::{.align-center}
Multiple paragraphs can share the same alignment.

All content in this container is centered.
::::
```

## Tools

### Command-Line Interface (CLI)

A Node.js CLI tool for working with MDX files. Build a standalone executable or run directly with Node.

**Installation:**
```bash
cd cli
npm install
```

**Commands:**
```bash
# View - Open in browser with full rendering
mdx view document.mdx
mdx v document.mdx -p 8080    # Custom port

# Extract - Extract archive contents
mdx extract document.mdx
mdx x document.mdx ./output   # Custom output directory

# Info - Display document information
mdx info document.mdx
mdx i document.mdx -c         # Show content
mdx i document.mdx -a         # Show asset details

# Edit - Interactive terminal editor
mdx edit document.mdx

# Create - Create new document from template
mdx create
mdx c "My Document" -t article -o my-doc.mdx

# Validate - Check document structure
mdx validate document.mdx
mdx val document.mdx -v   # Verbose mode
```

**Build Executable:**
```bash
npm run build        # Windows x64
npm run build:all    # All platforms
```

See [cli/README.md](cli/README.md) for full documentation.

### Web Editor

A lightweight, browser-based WYSIWYG editor similar to Word. No installation required.

**Features:**
- **Visual Mode** - WYSIWYG editing with live formatting
- **Markdown Mode** - Edit raw markdown source
- **Split View** - Side-by-side markdown and preview
- Formatting toolbar (headings, bold, italic, lists, tables, etc.)
- Drag-and-drop asset management
- Document outline navigation
- Open/save MDX files directly
- Word and character count

**Usage:**
```bash
cd legacy/editor
python -m http.server 8080
# Open http://localhost:8080 in your browser
```

Or simply open `legacy/editor/index.html` in any modern browser.

See [legacy/editor/README.md](legacy/editor/README.md) for full documentation.

> **Note:** The Phase 2.3 production editor at `editor-desktop/` is the
> supported entry point for new work. The legacy single-file demo above
> is retained for reference; see `legacy/README.md`.

### Web Viewer

A read-only viewer for MDX documents. Open `legacy/viewer/index.html` in
a browser. The Phase 2.1 production viewer is at `packages/mdz-viewer/`
(the `<mdz-viewer>` web component).

**Features:**
- Drag-and-drop file loading
- Markdown rendering with syntax highlighting
- Asset preview and download
- Manifest inspection

### Chrome Extension

A native Chrome extension for viewing MDX files directly in the browser.

**Features:**
- View MDX documents without a web server
- Document outline navigation
- Export to HTML, Markdown, or JSON
- Syntax-highlighted code blocks

**Installation:**
```bash
cd chrome-extension
node setup.js              # Download dependencies
# Load unpacked extension via chrome://extensions
```

See [chrome-extension/README.md](chrome-extension/README.md) for setup instructions.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Reporting issues and requesting features
- Proposing specification changes
- Submitting implementations

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

MDX builds on established standards:
- [CommonMark](https://commonmark.org/) - Markdown specification
- [W3C Web Annotation](https://www.w3.org/TR/annotation-model/) - Annotation format
- [glTF](https://www.khronos.org/gltf/) - 3D model format
- [ZIP/DEFLATE](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) - Archive format
