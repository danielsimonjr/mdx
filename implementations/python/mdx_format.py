#!/usr/bin/env python3
"""
MDX Example Document Creator (Corrected Version)
=================================================

This script creates a properly structured MDX document following the 
corrected specification where all assets are under the assets/ directory.

Key corrections from the original:
1. Assets are stored under assets/{category}/ not media/{category}/
2. Styles are stored under styles/ (separate from assets)
3. SVG files have correct .svg extensions (not .png)
4. Proper asset path validation in manifest
"""

import json
import zipfile
import hashlib
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional


def iso_timestamp() -> str:
    """Generate ISO 8601 timestamp."""
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def generate_uuid() -> str:
    """Generate UUID v4."""
    return str(uuid.uuid4())


def compute_checksum(data: bytes) -> str:
    """Compute SHA-256 checksum."""
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def create_example_mdx():
    """Create a comprehensive example MDX document with correct structure."""
    
    # ========================================================================
    # 1. Define the document content
    # ========================================================================
    
    content = '''# MDX Format Demonstration Document

## Introduction

Welcome to this demonstration of the **MDX (Markdown eXtended Container)** format. This document showcases the capabilities of MDX, including embedded media, interactive content, and collaboration features.

The MDX format combines the simplicity of Markdown with the power of a self-contained document archive. Everything in this document—images, data files, styles—is bundled into a single portable file.

## Core Concepts

### What is MDX?

MDX is an open document format built on three principles:

1. **Radical Openness** — The format is a standard ZIP archive. You can rename any `.mdx` file to `.zip` and extract its contents with any archive utility.

2. **Graceful Degradation** — A basic Markdown renderer shows the core document perfectly. Enhanced viewers unlock additional features.

3. **Web Standards Alignment** — All embedded media types correspond to standard web MIME types.

### Document Structure

An MDX document contains the following structure:

```
document.mdx
├── manifest.json       # Metadata and content inventory
├── document.md         # Primary Markdown content
├── assets/             # All embedded assets
│   ├── images/
│   ├── video/
│   ├── data/
│   └── models/
├── styles/             # CSS stylesheets
├── history/            # Version snapshots
└── annotations/        # Collaborative comments
```

## Embedded Media Examples

### Images

Standard Markdown image syntax works seamlessly:

![MDX Document Structure Diagram](assets/images/structure-diagram.svg)

The image above is embedded in the document and travels with it.

### Data Visualization

MDX can embed structured data:

::data[Quarterly Results]{src="assets/data/quarterly-results.csv" type="chart" chart-type="bar"}

For viewers that don't support charts, the raw CSV data is still accessible.

### 3D Models

Interactive 3D content uses the glTF format:

::model[Component Assembly]{src="assets/models/component.gltf" preview="assets/images/model-preview.svg" interactive}

## Code Examples

Syntax highlighting is supported:

```python
from mdx_format import MDXDocument

# Create a new document
doc = MDXDocument.create("My Document", author="Author Name")
doc.set_content("# Hello World")
doc.add_image("screenshot.png", alt_text="Screenshot")
doc.save("output.mdx")
```

```javascript
// JavaScript example
async function loadMDX(url) {
    const response = await fetch(url);
    const blob = await response.blob();
    return parseMDX(blob);
}
```

## Tables

Standard Markdown tables:

| Feature | Basic Viewer | Enhanced Viewer |
|---------|-------------|-----------------|
| Markdown | ✓ | ✓ |
| Images | ✓ | ✓ |
| Video | Link only | Playback |
| 3D Models | Preview | Interactive |
| Annotations | Hidden | Full support |

## Callouts

::::note{type="info"}
**Information**: MDX supports callout blocks for highlighting important content.
::::

::::note{type="warning"}
**Warning**: Always validate MDX documents before distribution.
::::

::::note{type="tip"}
**Tip**: Use the CLI tools to quickly create and inspect MDX files.
::::

## Text Alignment (v1.1)

MDX 1.1 introduces text alignment using block attributes:

{:.center}
This paragraph is centered using the shorthand `{:.center}` notation.

{:.right}
This paragraph is right-aligned using `{:.right}`.

::::{.align-center}
Container blocks can apply alignment to multiple elements.

All content within this container is centered.
::::

## Mathematical Content

LaTeX-style math is supported:

The quadratic formula is $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$.

Block equations:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

## Version History

This document includes version history tracking. Each version snapshot preserves the document state at that point in time.

## Collaboration Features

MDX supports collaborative annotations including comments, highlights, and suggestions. Annotations are stored separately from the main content.

## Conclusion

The MDX format represents an open approach to document packaging that prioritizes openness, portability, and progressive enhancement.

---

*Document Version: 1.0.0*  
*Last Updated: ''' + iso_timestamp()[:10] + '''*
'''

    # ========================================================================
    # 2. Create assets
    # ========================================================================
    
    assets: Dict[str, bytes] = {}
    
    # Structure diagram SVG
    structure_svg = '''<?xml version="1.0" encoding="UTF-8"?>
<svg width="600" height="300" xmlns="http://www.w3.org/2000/svg">
  <rect width="600" height="300" fill="#f8f9fa"/>
  <text x="300" y="30" text-anchor="middle" font-family="system-ui" font-size="18" font-weight="bold" fill="#333">
    MDX Document Structure
  </text>
  <rect x="50" y="60" width="500" height="220" rx="8" fill="#e9ecef" stroke="#adb5bd" stroke-width="2"/>
  <text x="70" y="85" font-family="monospace" font-size="14" fill="#495057">document.mdx</text>
  
  <rect x="70" y="100" width="140" height="45" rx="4" fill="#fff3cd" stroke="#ffc107"/>
  <text x="140" y="128" text-anchor="middle" font-family="monospace" font-size="11" fill="#856404">manifest.json</text>
  
  <rect x="230" y="100" width="140" height="45" rx="4" fill="#d4edda" stroke="#28a745"/>
  <text x="300" y="128" text-anchor="middle" font-family="monospace" font-size="11" fill="#155724">document.md</text>
  
  <rect x="390" y="100" width="140" height="45" rx="4" fill="#cce5ff" stroke="#007bff"/>
  <text x="460" y="128" text-anchor="middle" font-family="monospace" font-size="11" fill="#004085">assets/</text>
  
  <rect x="70" y="165" width="140" height="45" rx="4" fill="#e2d9f3" stroke="#6f42c1"/>
  <text x="140" y="193" text-anchor="middle" font-family="monospace" font-size="11" fill="#432874">styles/</text>
  
  <rect x="230" y="165" width="140" height="45" rx="4" fill="#f5c6cb" stroke="#dc3545"/>
  <text x="300" y="193" text-anchor="middle" font-family="monospace" font-size="11" fill="#721c24">history/</text>
  
  <rect x="390" y="165" width="140" height="45" rx="4" fill="#d1ecf1" stroke="#17a2b8"/>
  <text x="460" y="193" text-anchor="middle" font-family="monospace" font-size="11" fill="#0c5460">annotations/</text>
  
  <text x="70" y="250" font-family="system-ui" font-size="10" fill="#6c757d">
    Required: manifest.json, document.md | Optional: assets/, styles/, history/, annotations/
  </text>
</svg>'''
    assets['assets/images/structure-diagram.svg'] = structure_svg.encode('utf-8')
    
    # Model preview SVG
    model_preview_svg = '''<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="300" fill="#2d3436"/>
  <g stroke="#636e72" stroke-width="0.5" opacity="0.3">
    <line x1="0" y1="150" x2="400" y2="150"/>
    <line x1="200" y1="0" x2="200" y2="300"/>
  </g>
  <g fill="none" stroke="#74b9ff" stroke-width="2">
    <polygon points="150,175 250,175 250,100 150,100"/>
    <polygon points="175,150 275,150 275,75 175,75"/>
    <line x1="150" y1="100" x2="175" y2="75"/>
    <line x1="250" y1="100" x2="275" y2="75"/>
    <line x1="250" y1="175" x2="275" y2="150"/>
    <line x1="150" y1="175" x2="175" y2="150"/>
  </g>
  <text x="200" y="230" text-anchor="middle" font-family="system-ui" font-size="16" fill="#dfe6e9">
    3D Model Preview
  </text>
  <text x="200" y="255" text-anchor="middle" font-family="system-ui" font-size="11" fill="#636e72">
    Interactive in enhanced viewers
  </text>
</svg>'''
    assets['assets/images/model-preview.svg'] = model_preview_svg.encode('utf-8')
    
    # Sample CSV data
    csv_data = '''Quarter,Revenue,Expenses,Profit,Growth
Q1 2025,1250000,980000,270000,0.12
Q2 2025,1480000,1050000,430000,0.18
Q3 2025,1620000,1120000,500000,0.09
Q4 2025,1890000,1200000,690000,0.17'''
    assets['assets/data/quarterly-results.csv'] = csv_data.encode('utf-8')
    
    # Minimal glTF model
    gltf_data = json.dumps({
        "asset": {"version": "2.0", "generator": "MDX Example"},
        "scene": 0,
        "scenes": [{"name": "Scene", "nodes": [0]}],
        "nodes": [{"name": "Cube", "mesh": 0}],
        "meshes": [{"name": "Cube", "primitives": [{"attributes": {"POSITION": 0}}]}],
        "accessors": [{"bufferView": 0, "componentType": 5126, "count": 8, "type": "VEC3", 
                       "max": [1, 1, 1], "min": [-1, -1, -1]}],
        "bufferViews": [{"buffer": 0, "byteLength": 96}],
        "buffers": [{"byteLength": 96}]
    }, indent=2)
    assets['assets/models/component.gltf'] = gltf_data.encode('utf-8')
    
    # ========================================================================
    # 3. Create styles
    # ========================================================================
    
    theme_css = '''/* MDX Theme */
:root {
  --primary: #2563eb;
  --text: #1e293b;
  --bg: #ffffff;
  --surface: #f8fafc;
}

body {
  font-family: 'Inter', system-ui, sans-serif;
  line-height: 1.7;
  color: var(--text);
  background: var(--bg);
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

h1, h2, h3 { font-weight: 600; line-height: 1.3; }
h1 { font-size: 2.25rem; margin-top: 0; }
h2 { font-size: 1.75rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.5rem; }
h3 { font-size: 1.375rem; }

code {
  font-family: 'JetBrains Mono', monospace;
  background: var(--surface);
  padding: 0.2em 0.4em;
  border-radius: 4px;
}

pre {
  background: #1e293b;
  color: #e2e8f0;
  padding: 1.25rem;
  border-radius: 8px;
  overflow-x: auto;
}

pre code { background: transparent; padding: 0; }

img { max-width: 100%; border-radius: 8px; }

table { width: 100%; border-collapse: collapse; margin: 1.5em 0; }
th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e2e8f0; }
th { background: var(--surface); font-weight: 600; }

blockquote {
  border-left: 4px solid var(--primary);
  margin: 1.5em 0;
  padding: 0.75rem 1.25rem;
  background: var(--surface);
}

.note { padding: 1rem; border-radius: 8px; margin: 1.5em 0; border-left: 4px solid; }
.note-info { background: #eff6ff; border-color: #3b82f6; }
.note-warning { background: #fffbeb; border-color: #f59e0b; }
.note-tip { background: #f0fdf4; border-color: #22c55e; }

/* v1.1: Alignment classes */
.align-left { text-align: left; }
.align-center { text-align: center; }
.align-right { text-align: right; }
.align-justify { text-align: justify; }

@media print {
  body { font-size: 11pt; }
  pre { white-space: pre-wrap; }
}
'''
    styles: Dict[str, bytes] = {'styles/theme.css': theme_css.encode('utf-8')}
    
    # ========================================================================
    # 4. Build manifest
    # ========================================================================
    
    doc_id = generate_uuid()
    timestamp = iso_timestamp()
    
    manifest = {
        "mdx_version": "1.1.0",
        "document": {
            "id": doc_id,
            "title": "MDX Format Demonstration Document",
            "description": "A comprehensive demonstration of MDX format capabilities.",
            "authors": [
                {"name": "MDX Working Group", "email": "mdx@example.org", "role": "author"},
                {"name": "Technical Writer", "role": "contributor"}
            ],
            "created": timestamp,
            "modified": timestamp,
            "version": "1.0.0",
            "language": "en-US",
            "license": {"type": "CC-BY-4.0", "url": "https://creativecommons.org/licenses/by/4.0/"}
        },
        "content": {
            "entry_point": "document.md",
            "encoding": "UTF-8",
            "markdown_variant": "CommonMark",
            # v1.1: Added "attributes" and "alignment" extensions
            "extensions": ["tables", "footnotes", "task-lists", "math", "strikethrough", "attributes", "alignment"]
        },
        "assets": {
            "images": [
                {
                    "path": "assets/images/structure-diagram.svg",
                    "mime_type": "image/svg+xml",
                    "size_bytes": len(assets['assets/images/structure-diagram.svg']),
                    "checksum": compute_checksum(assets['assets/images/structure-diagram.svg']),
                    "alt_text": "MDX document structure diagram"
                },
                {
                    "path": "assets/images/model-preview.svg",
                    "mime_type": "image/svg+xml",
                    "size_bytes": len(assets['assets/images/model-preview.svg']),
                    "checksum": compute_checksum(assets['assets/images/model-preview.svg']),
                    "alt_text": "3D model preview"
                }
            ],
            "data": [
                {
                    "path": "assets/data/quarterly-results.csv",
                    "mime_type": "text/csv",
                    "size_bytes": len(assets['assets/data/quarterly-results.csv']),
                    "checksum": compute_checksum(assets['assets/data/quarterly-results.csv']),
                    "rows": 4,
                    "columns": 5,
                    "has_header": True
                }
            ],
            "models": [
                {
                    "path": "assets/models/component.gltf",
                    "mime_type": "model/gltf+json",
                    "size_bytes": len(assets['assets/models/component.gltf']),
                    "checksum": compute_checksum(assets['assets/models/component.gltf']),
                    "format_version": "2.0",
                    "preview": "assets/images/model-preview.svg"
                }
            ]
        },
        "styles": {
            "theme": "styles/theme.css",
            "syntax_highlighting": "github-dark",
            # v1.1: Alignment class definitions
            "alignment_classes": {
                "align-left": "text-align: left;",
                "align-center": "text-align: center;",
                "align-right": "text-align: right;",
                "align-justify": "text-align: justify;"
            }
        },
        "rendering": {
            "math_renderer": "katex",
            "table_of_contents": {"enabled": True, "depth": 3},
            # v1.1: Attributes configuration
            "attributes": {
                "enabled": True,
                "allow_inline_styles": True
            }
        },
        "collaboration": {
            "allow_annotations": True,
            "track_changes": True
        },
        "history": {
            "enabled": True,
            "versions_file": "history/versions.json",
            "snapshots_directory": "history/snapshots"
        }
    }
    
    # ========================================================================
    # 5. Build version history
    # ========================================================================
    
    versions = {
        "schema_version": "1.0.0",
        "current_version": "1.0.0",
        "versions": [
            {
                "version": "0.1.0",
                "timestamp": "2026-01-01T10:00:00Z",
                "author": {"name": "MDX Working Group", "email": "mdx@example.org"},
                "message": "Initial draft",
                "snapshot": {"type": "full", "path": "history/snapshots/v0.1.0.md"},
                "changes": {"summary": "Initial document creation", "added": ["document.md"]}
            },
            {
                "version": "1.0.0",
                "timestamp": timestamp,
                "author": {"name": "MDX Working Group", "email": "mdx@example.org"},
                "message": "Release version with complete documentation",
                "snapshot": {"type": "full", "path": "history/snapshots/v1.0.0.md"},
                "parent_version": "0.1.0",
                "changes": {
                    "summary": "Added assets, styling, and examples",
                    "added": list(assets.keys()) + list(styles.keys()),
                    "modified": ["document.md", "manifest.json"]
                },
                "tags": ["release"]
            }
        ]
    }
    
    # ========================================================================
    # 6. Build annotations
    # ========================================================================
    
    annotations = {
        "schema_version": "1.0.0",
        "@context": "http://www.w3.org/ns/anno.jsonld",
        "annotations": [
            {
                "id": f"urn:mdx:annotation:{generate_uuid()}",
                "type": "Annotation",
                "motivation": "commenting",
                "created": timestamp,
                "creator": {"type": "Person", "name": "Reviewer"},
                "target": {
                    "source": "document.md",
                    "selector": {
                        "type": "TextQuoteSelector",
                        "exact": "Radical Openness"
                    }
                },
                "body": {
                    "type": "TextualBody",
                    "value": "This principle is key to the format's success.",
                    "format": "text/plain"
                },
                "mdx:status": "open"
            },
            {
                "id": f"urn:mdx:annotation:{generate_uuid()}",
                "type": "Annotation",
                "motivation": "highlighting",
                "created": timestamp,
                "creator": {"type": "Person", "name": "Reader"},
                "target": {
                    "source": "document.md",
                    "selector": {
                        "type": "TextQuoteSelector",
                        "exact": "self-contained document archive"
                    }
                },
                "body": {
                    "type": "TextualBody",
                    "value": "Key concept!",
                    "format": "text/plain"
                },
                "mdx:status": "active"
            }
        ]
    }
    
    # ========================================================================
    # 7. Create the MDX file
    # ========================================================================
    
    output_path = Path(__file__).parent / 'example-document.mdx'
    
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Manifest first
        zf.writestr('manifest.json', json.dumps(manifest, indent=2))
        
        # Main content
        zf.writestr('document.md', content)
        
        # Assets
        for path, data in assets.items():
            zf.writestr(path, data)
        
        # Styles
        for path, data in styles.items():
            zf.writestr(path, data)
        
        # Version history
        zf.writestr('history/versions.json', json.dumps(versions, indent=2))
        zf.writestr('history/snapshots/v0.1.0.md', '# Initial Draft\n\nPlaceholder content.')
        zf.writestr('history/snapshots/v1.0.0.md', content)
        
        # Annotations
        zf.writestr('annotations/annotations.json', json.dumps(annotations, indent=2))
    
    print(f"[OK] Created: {output_path}")
    
    # ========================================================================
    # 8. Also extract to directory for inspection
    # ========================================================================
    
    extract_path = Path(__file__).parent / 'example-extracted'
    extract_path.mkdir(parents=True, exist_ok=True)
    
    with zipfile.ZipFile(output_path, 'r') as zf:
        zf.extractall(extract_path)
    
    print(f"[OK] Extracted to: {extract_path}")
    
    # Print summary
    print("\nDocument Summary:")
    print(f"  Title: {manifest['document']['title']}")
    print(f"  Version: {manifest['document']['version']}")
    print(f"  Assets: {sum(len(v) for v in manifest['assets'].values())}")
    print(f"  Versions: {len(versions['versions'])}")
    print(f"  Annotations: {len(annotations['annotations'])}")
    
    # Verify structure
    print("\nArchive contents:")
    with zipfile.ZipFile(output_path, 'r') as zf:
        for name in sorted(zf.namelist()):
            info = zf.getinfo(name)
            print(f"  {name} ({info.file_size} bytes)")


if __name__ == '__main__':
    create_example_mdx()
