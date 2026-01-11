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
│   ├── data/              # CSV, JSON, Parquet
│   └── fonts/             # WOFF2, TTF
├── styles/                 # Custom CSS
├── history/                # Version snapshots
└── annotations/            # W3C Web Annotations
```

## Quick Start

### Creating an MDX Document (Python)

```python
import zipfile
import json
from datetime import datetime, timezone

# Create a minimal MDX document
with zipfile.ZipFile('my-document.mdx', 'w', zipfile.ZIP_DEFLATED) as mdx:
    # Add manifest
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    manifest = {
        "mdx_version": "1.0.0",
        "document": {
            "title": "My Document",
            "id": "doc-001",
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

const doc = MDXDocument.create("My Document", { author: "Your Name" });
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
│   └── MDX_FORMAT_SPECIFICATION.md
├── implementations/               # Reference implementations
│   ├── typescript/               # TypeScript/JavaScript
│   │   └── mdx_format.ts
│   └── python/                   # Python
│       └── mdx_format.py
├── viewer/                        # Web-based MDX viewer
│   └── index.html
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

## Web Viewer

Open `viewer/index.html` in a browser to view MDX documents. The viewer supports:
- Drag-and-drop file loading
- Markdown rendering with syntax highlighting
- Asset preview and download
- Manifest inspection

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
