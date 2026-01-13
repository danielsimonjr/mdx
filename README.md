# MDX Format

**Markdown eXtended Container** - An open document format that packages Markdown content with embedded media into self-contained ZIP archives.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Specification](https://img.shields.io/badge/Spec-v1.0.0--Draft-orange.svg)](spec/MDX_FORMAT_SPECIFICATION.md)

## Overview

MDX is a portable document format designed to bundle Markdown content with images, videos, 3D models, data files, and other assets into a single, self-contained file. Think of it as "Markdown meets ZIP" - human-readable content with all dependencies included.

**Key Features:**
- **Universal Accessibility** - Any ZIP utility can extract contents; any text editor can read the Markdown
- **Graceful Degradation** - Basic viewers show text and images; advanced viewers unlock full interactivity
- **Web Standards Alignment** - Standard MIME types, CommonMark Markdown, W3C Web Annotations
- **Version Control Friendly** - Text-based manifest and Markdown enable meaningful diffs
- **Collaboration Ready** - Built-in support for annotations, comments, and version history

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
        "mdx_version": "1.0.0",
        "document": {
            "title": "My Document",
            "id": str(uuid.uuid4()),  # UUID v4 required
            "created": timestamp,
            "modified": timestamp
        },
        "content": {"entry_point": "document.md"}
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
├── editor/                        # Web-based WYSIWYG editor
│   └── index.html
├── viewer/                        # Web-based MDX viewer
│   └── index.html
├── chrome-extension/              # Chrome browser extension
│   └── manifest.json
├── examples/                      # Example MDX documents
│   └── example-document.mdx
└── .github/                       # GitHub templates & CI
```

## Specification

The complete specification is available at [spec/MDX_FORMAT_SPECIFICATION.md](spec/MDX_FORMAT_SPECIFICATION.md).

**Current Version:** 1.0.0 (Draft)

**MIME Type:** `application/vnd.mdx-container+zip`

**File Extensions:** `.mdx` (primary), `.mdxc` (alternative, to avoid conflict with MDX/JSX)

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
cd editor
python -m http.server 8080
# Open http://localhost:8080 in your browser
```

Or simply open `editor/index.html` in any modern browser.

See [editor/README.md](editor/README.md) for full documentation.

### Web Viewer

A read-only viewer for MDX documents. Open `viewer/index.html` in a browser.

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
