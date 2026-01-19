#!/usr/bin/env python3
"""
MDX v1.1 Example Document Creator
=================================

Creates example documents demonstrating v1.1 alignment and attribute features.
"""

import json
import zipfile
import hashlib
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict


def iso_timestamp() -> str:
    """Generate ISO 8601 timestamp."""
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def generate_uuid() -> str:
    """Generate UUID v4."""
    return str(uuid.uuid4())


def compute_checksum(data: bytes) -> str:
    """Compute SHA-256 checksum."""
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def create_mdx(output_path: Path, manifest: dict, content: str,
               assets: Dict[str, bytes] = None, styles: Dict[str, bytes] = None):
    """Create an MDX file from components."""
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('manifest.json', json.dumps(manifest, indent=2))
        zf.writestr('document.md', content)
        if assets:
            for path, data in assets.items():
                zf.writestr(path, data)
        if styles:
            for path, data in styles.items():
                zf.writestr(path, data)
    print(f"[OK] Created: {output_path}")


def create_alignment_basic():
    """Create alignment-basic.mdx with simple alignment examples."""

    content = '''# Alignment Basics

This document demonstrates the basic alignment features introduced in MDX v1.1.

## Default Alignment

By default, text is left-aligned. This paragraph uses the default alignment, which is suitable for most content.

## Left Alignment (Explicit)

{:.left}
This paragraph is explicitly left-aligned using the `{:.left}` shorthand notation. This is equivalent to using `{.align-left}`.

## Center Alignment

{:.center}
This paragraph is centered on the page using the `{:.center}` shorthand notation.

{:.center}
## Centered Heading

{:.center}
Headings can also be centered for titles and section headers.

## Right Alignment

{:.right}
This paragraph is right-aligned using `{:.right}`. Right alignment is often used for dates, signatures, or attributions.

{:.right}
*— The Author*

## Justified Text

{:.justify}
This paragraph uses justified alignment. In justified text, spacing between words is adjusted to create clean left and right edges. This is commonly used in formal documents, books, and publications where visual polish matters. The effect is most visible in longer paragraphs with multiple lines of text.

## Multiple Paragraphs

{:.center}
First centered paragraph.

{:.center}
Second centered paragraph.

{:.right}
Right-aligned paragraph.

Back to default left alignment.

## Alignment with Blockquotes

{:.center}
> This entire blockquote is centered.
> Multiple lines stay together as one centered block.

{:.right}
> This blockquote is right-aligned.
> Often used for attributions or pull quotes.

## Alignment with Lists

{:.center}
- First item
- Second item
- Third item

{:.right}
1. First numbered item
2. Second numbered item
3. Third numbered item

## Verbose Syntax

{.align-center}
This paragraph uses the verbose `.align-center` syntax instead of the shorthand.

{.align-right}
This uses `.align-right` verbose syntax.

---

*Document Version: 1.0.0 — MDX Format Specification v1.1*
'''

    timestamp = iso_timestamp()
    doc_id = generate_uuid()

    manifest = {
        "mdx_version": "1.1.0",
        "document": {
            "id": doc_id,
            "title": "Alignment Basics",
            "description": "Demonstrates basic alignment features in MDX v1.1",
            "authors": [{"name": "MDX Working Group", "role": "author"}],
            "created": timestamp,
            "modified": timestamp,
            "version": "1.0.0",
            "language": "en-US"
        },
        "content": {
            "entry_point": "document.md",
            "encoding": "UTF-8",
            "markdown_variant": "CommonMark",
            "extensions": ["tables", "attributes", "alignment"]
        },
        "styles": {
            "alignment_classes": {
                "align-left": "text-align: left;",
                "align-center": "text-align: center;",
                "align-right": "text-align: right;",
                "align-justify": "text-align: justify;"
            }
        },
        "rendering": {
            "attributes": {
                "enabled": True,
                "allow_inline_styles": False
            }
        }
    }

    output_path = Path(__file__).parent.parent.parent / 'examples' / 'alignment-basic.mdx'
    create_mdx(output_path, manifest, content)


def create_alignment_directives():
    """Create alignment-directives.mdx with alignment + media directives."""

    # Create sample assets
    video_placeholder_svg = '''<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="450" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="450" fill="#1a1a2e"/>
  <circle cx="400" cy="225" r="60" fill="none" stroke="#e94560" stroke-width="6"/>
  <polygon points="380,195 380,255 430,225" fill="#e94560"/>
  <text x="400" y="350" text-anchor="middle" font-family="system-ui" font-size="24" fill="#eee">
    Video Placeholder
  </text>
  <text x="400" y="385" text-anchor="middle" font-family="system-ui" font-size="14" fill="#888">
    Interactive in enhanced viewers
  </text>
</svg>'''

    model_preview_svg = '''<?xml version="1.0" encoding="UTF-8"?>
<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
  <rect width="600" height="400" fill="#2d3436"/>
  <g transform="translate(300,200)">
    <ellipse rx="120" ry="40" fill="none" stroke="#74b9ff" stroke-width="2" transform="rotate(-15)"/>
    <ellipse rx="80" ry="80" fill="none" stroke="#81ecec" stroke-width="2"/>
    <circle r="20" fill="#fd79a8"/>
  </g>
  <text x="300" y="350" text-anchor="middle" font-family="system-ui" font-size="18" fill="#dfe6e9">
    3D Model Preview
  </text>
</svg>'''

    chart_svg = '''<?xml version="1.0" encoding="UTF-8"?>
<svg width="500" height="300" xmlns="http://www.w3.org/2000/svg">
  <rect width="500" height="300" fill="#f8f9fa"/>
  <text x="250" y="30" text-anchor="middle" font-family="system-ui" font-size="16" font-weight="bold" fill="#333">
    Sales Data Visualization
  </text>
  <g transform="translate(50,50)">
    <rect x="20" y="100" width="60" height="100" fill="#4299e1"/>
    <rect x="120" y="60" width="60" height="140" fill="#48bb78"/>
    <rect x="220" y="40" width="60" height="160" fill="#ed8936"/>
    <rect x="320" y="20" width="60" height="180" fill="#9f7aea"/>
  </g>
  <text x="250" y="280" text-anchor="middle" font-family="system-ui" font-size="12" fill="#666">
    Q1 - Q4 2025
  </text>
</svg>'''

    assets = {
        'assets/images/video-poster.svg': video_placeholder_svg.encode('utf-8'),
        'assets/images/model-preview.svg': model_preview_svg.encode('utf-8'),
        'assets/images/chart-preview.svg': chart_svg.encode('utf-8')
    }

    csv_data = '''Quarter,Revenue,Growth
Q1,125000,12
Q2,148000,18
Q3,162000,9
Q4,189000,17'''
    assets['assets/data/sales.csv'] = csv_data.encode('utf-8')

    gltf_data = json.dumps({
        "asset": {"version": "2.0", "generator": "MDX Example"},
        "scene": 0,
        "scenes": [{"name": "Scene", "nodes": [0]}],
        "nodes": [{"name": "Object", "mesh": 0}],
        "meshes": [{"name": "Mesh", "primitives": [{"attributes": {"POSITION": 0}}]}],
        "accessors": [{"bufferView": 0, "componentType": 5126, "count": 4, "type": "VEC3"}],
        "bufferViews": [{"buffer": 0, "byteLength": 48}],
        "buffers": [{"byteLength": 48}]
    }, indent=2)
    assets['assets/models/object.gltf'] = gltf_data.encode('utf-8')

    content = '''# Alignment with Directives

This document demonstrates how alignment attributes integrate with MDX media directives.

## Centered Image

{:.center}
![Video Poster Placeholder](assets/images/video-poster.svg)

The image above is centered on the page using block-level alignment.

## Right-Aligned Model

{:.right}
::model[3D Component View]{src="assets/models/object.gltf" preview="assets/images/model-preview.svg" interactive camera-controls}

The 3D model viewer is right-aligned, useful for sidebar-style layouts.

## Inline Alignment in Directives

Alignment can also be specified directly within directive attributes:

{:.center}
![Tutorial Placeholder](assets/images/video-poster.svg)

::model[Assembly View]{src="assets/models/object.gltf" preview="assets/images/model-preview.svg" .align-right}

## Centered Data Visualization

{:.center}
::data[Quarterly Sales]{src="assets/data/sales.csv" type="chart" chart-type="bar" x="Quarter" y="Revenue"}

## Directive Block Containers

Using container syntax to group multiple directives with shared alignment:

:::{.align-center}
![First Demo Placeholder](assets/images/video-poster.svg)

![Second Demo Placeholder](assets/images/chart-preview.svg)

::data[Performance Metrics]{src="assets/data/sales.csv" type="chart" chart-type="line"}
:::

All directives in the container above share center alignment.

## Mixed Alignment in Containers

:::{.align-center}
This paragraph is centered by the container.

{:.right}
This paragraph overrides the container alignment with right-alignment.

Back to center alignment from the container.
:::

## Figure Captions

{:.center}
::figure[System Architecture]{src="assets/images/chart-preview.svg" caption="Figure 1: System Architecture Overview" credit="Created by Design Team"}

{:.right}
*Figure 1: Interactive architecture diagram*

## Notes with Alignment

{:.center}
:::note{type="info"}
**Centered Note**: This informational note is centered on the page.
:::

{:.right}
:::note{type="tip"}
**Right-aligned Tip**: Tips can be aligned for visual variety.
:::

---

*MDX Format Specification v1.1 — Alignment with Directives Example*
'''

    timestamp = iso_timestamp()
    doc_id = generate_uuid()

    manifest = {
        "mdx_version": "1.1.0",
        "document": {
            "id": doc_id,
            "title": "Alignment with Directives",
            "description": "Demonstrates alignment integration with MDX media directives",
            "authors": [{"name": "MDX Working Group", "role": "author"}],
            "created": timestamp,
            "modified": timestamp,
            "version": "1.0.0",
            "language": "en-US"
        },
        "content": {
            "entry_point": "document.md",
            "encoding": "UTF-8",
            "markdown_variant": "CommonMark",
            "extensions": ["tables", "attributes", "alignment"]
        },
        "assets": {
            "images": [
                {
                    "path": "assets/images/video-poster.svg",
                    "mime_type": "image/svg+xml",
                    "size_bytes": len(assets['assets/images/video-poster.svg']),
                    "checksum": compute_checksum(assets['assets/images/video-poster.svg']),
                    "alt_text": "Video placeholder"
                },
                {
                    "path": "assets/images/model-preview.svg",
                    "mime_type": "image/svg+xml",
                    "size_bytes": len(assets['assets/images/model-preview.svg']),
                    "checksum": compute_checksum(assets['assets/images/model-preview.svg']),
                    "alt_text": "3D model preview"
                },
                {
                    "path": "assets/images/chart-preview.svg",
                    "mime_type": "image/svg+xml",
                    "size_bytes": len(assets['assets/images/chart-preview.svg']),
                    "checksum": compute_checksum(assets['assets/images/chart-preview.svg']),
                    "alt_text": "Chart visualization"
                }
            ],
            "data": [
                {
                    "path": "assets/data/sales.csv",
                    "mime_type": "text/csv",
                    "size_bytes": len(assets['assets/data/sales.csv']),
                    "checksum": compute_checksum(assets['assets/data/sales.csv']),
                    "rows": 4,
                    "columns": 3,
                    "has_header": True
                }
            ],
            "models": [
                {
                    "path": "assets/models/object.gltf",
                    "mime_type": "model/gltf+json",
                    "size_bytes": len(assets['assets/models/object.gltf']),
                    "checksum": compute_checksum(assets['assets/models/object.gltf']),
                    "format_version": "2.0",
                    "preview": "assets/images/model-preview.svg"
                }
            ]
        },
        "styles": {
            "alignment_classes": {
                "align-left": "text-align: left;",
                "align-center": "text-align: center;",
                "align-right": "text-align: right;",
                "align-justify": "text-align: justify;"
            }
        },
        "rendering": {
            "attributes": {
                "enabled": True,
                "allow_inline_styles": True
            }
        }
    }

    output_path = Path(__file__).parent.parent.parent / 'examples' / 'alignment-directives.mdx'
    create_mdx(output_path, manifest, content, assets)


def create_alignment_complex():
    """Create alignment-complex.mdx with nested containers and precedence examples."""

    content = '''# Complex Alignment Patterns

This document demonstrates advanced alignment features including nesting, precedence, and combined attributes.

## Attribute Precedence

Alignment precedence follows: inline > block > container.

### Container Level (Lowest)

:::{.align-center}
All content in this container is centered by default.
:::

### Block Level (Medium)

:::{.align-center}
Container sets center alignment.

{:.right}
But this paragraph is right-aligned (block overrides container).

Back to centered from container.
:::

### Inline Level (Highest)

{:.center}
This paragraph has center alignment from block level.

The paragraph above demonstrates block-level alignment override.

## Nested Containers

:::{.align-center}
Outer container: centered content.

:::{.align-right}
Inner container: right-aligned content.

This is right-aligned by the inner container.

{:.left}
This overrides to left alignment.
:::

Back to centered content from outer container.
:::

## Multiple Classes and Attributes

{.align-center .highlight #important-section}
This centered paragraph has multiple CSS classes and an ID.

{.align-right style="max-width: 400px; margin-left: auto;"}
This right-aligned paragraph has inline styles (when allowed).

## Complex Directive Nesting

:::{.align-center}
This container centers all its children.

:::note{type="info"}
This note inherits center alignment from the container.

{:.right}
But this paragraph inside the note is right-aligned.
:::

:::details{summary="Expandable Section"}
{:.justify}
This justified text is inside a details block inside a centered container. The justify alignment takes precedence.
:::

{:.center}
This centered text is inside the container.
:::

## Alignment with Tables

{:.center}
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |

The table above is centered on the page.

{:.right}
| Right Aligned |
|---------------|
| Data row 1    |
| Data row 2    |

## Alignment Scope

Alignment attributes apply only to the immediately following element:

{:.center}
This is centered.

This returns to default left alignment (no attribute block).

{:.right}
This is right-aligned.

{:.center}
This is centered again.

## Empty Lines and Scope

{:.center}

Content after blank lines still receives the alignment.

## Conflict Resolution Examples

### Example 1: Container vs Block

:::{.align-right}
{:.center}
Block alignment wins over container.
:::

### Example 2: Block vs Inline

{:.center}
This text would be centered, but inline attributes could override it.

Block-level alignment is overridden by inline attributes.

### Example 3: Multiple Containers

:::{.align-left}
:::{.align-center}
:::{.align-right}
Innermost container wins (right-aligned).
:::
:::
:::

## Real-World Pattern: Centered Content Gallery

:::{.align-center}
## Gallery Section

**Gallery Item 1**

{:.right}
*Caption for Item 1*

**Gallery Item 2**

{:.right}
*Caption for Item 2*

**Gallery Item 3**

{:.right}
*Caption for Item 3*
:::

## Edge Cases

### Adjacent Attribute Blocks

{:.center}
{:.right}
When two attribute blocks appear, the last one wins.

### Attribute on Empty Content

{:.center}

Alignment on blank line applies to next content.

### Malformed Attributes (Graceful Handling)

{.incomplete
This should be treated as regular text, not an attribute block.

---

*MDX Format Specification v1.1 — Complex Alignment Patterns*
'''

    timestamp = iso_timestamp()
    doc_id = generate_uuid()

    manifest = {
        "mdx_version": "1.1.0",
        "document": {
            "id": doc_id,
            "title": "Complex Alignment Patterns",
            "description": "Advanced alignment examples with nesting and precedence",
            "authors": [{"name": "MDX Working Group", "role": "author"}],
            "created": timestamp,
            "modified": timestamp,
            "version": "1.0.0",
            "language": "en-US"
        },
        "content": {
            "entry_point": "document.md",
            "encoding": "UTF-8",
            "markdown_variant": "CommonMark",
            "extensions": ["tables", "attributes", "alignment"]
        },
        "styles": {
            "alignment_classes": {
                "align-left": "text-align: left;",
                "align-center": "text-align: center;",
                "align-right": "text-align: right;",
                "align-justify": "text-align: justify;"
            }
        },
        "rendering": {
            "attributes": {
                "enabled": True,
                "allow_inline_styles": True
            }
        }
    }

    output_path = Path(__file__).parent.parent.parent / 'examples' / 'alignment-complex.mdx'
    create_mdx(output_path, manifest, content)


def create_technical_doc():
    """Create technical-doc.mdx as a realistic technical document with alignment."""

    # Create assets
    arch_diagram_svg = '''<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="500" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="500" fill="#f8fafc"/>
  <text x="400" y="40" text-anchor="middle" font-family="system-ui" font-size="20" font-weight="bold" fill="#1e293b">
    System Architecture
  </text>

  <!-- Client Layer -->
  <rect x="50" y="80" width="700" height="80" rx="8" fill="#dbeafe" stroke="#3b82f6" stroke-width="2"/>
  <text x="400" y="110" text-anchor="middle" font-family="system-ui" font-size="14" font-weight="bold" fill="#1e40af">Client Layer</text>
  <text x="400" y="135" text-anchor="middle" font-family="monospace" font-size="11" fill="#3b82f6">Web Browser | Mobile App | CLI</text>

  <!-- API Gateway -->
  <rect x="250" y="190" width="300" height="50" rx="8" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/>
  <text x="400" y="220" text-anchor="middle" font-family="system-ui" font-size="13" font-weight="bold" fill="#b45309">API Gateway</text>

  <!-- Services -->
  <rect x="50" y="270" width="200" height="80" rx="8" fill="#d1fae5" stroke="#10b981" stroke-width="2"/>
  <text x="150" y="300" text-anchor="middle" font-family="system-ui" font-size="12" font-weight="bold" fill="#065f46">Auth Service</text>
  <text x="150" y="325" text-anchor="middle" font-family="monospace" font-size="10" fill="#10b981">OAuth 2.0 / JWT</text>

  <rect x="300" y="270" width="200" height="80" rx="8" fill="#d1fae5" stroke="#10b981" stroke-width="2"/>
  <text x="400" y="300" text-anchor="middle" font-family="system-ui" font-size="12" font-weight="bold" fill="#065f46">Document Service</text>
  <text x="400" y="325" text-anchor="middle" font-family="monospace" font-size="10" fill="#10b981">MDX Processing</text>

  <rect x="550" y="270" width="200" height="80" rx="8" fill="#d1fae5" stroke="#10b981" stroke-width="2"/>
  <text x="650" y="300" text-anchor="middle" font-family="system-ui" font-size="12" font-weight="bold" fill="#065f46">Storage Service</text>
  <text x="650" y="325" text-anchor="middle" font-family="monospace" font-size="10" fill="#10b981">S3 / MinIO</text>

  <!-- Database Layer -->
  <rect x="150" y="390" width="500" height="70" rx="8" fill="#fce7f3" stroke="#ec4899" stroke-width="2"/>
  <text x="400" y="420" text-anchor="middle" font-family="system-ui" font-size="13" font-weight="bold" fill="#9d174d">Data Layer</text>
  <text x="400" y="445" text-anchor="middle" font-family="monospace" font-size="10" fill="#ec4899">PostgreSQL | Redis | Elasticsearch</text>

  <!-- Arrows -->
  <line x1="400" y1="160" x2="400" y2="190" stroke="#64748b" stroke-width="2" marker-end="url(#arrow)"/>
  <line x1="150" y1="240" x2="150" y2="270" stroke="#64748b" stroke-width="2" marker-end="url(#arrow)"/>
  <line x1="400" y1="240" x2="400" y2="270" stroke="#64748b" stroke-width="2" marker-end="url(#arrow)"/>
  <line x1="650" y1="240" x2="650" y2="270" stroke="#64748b" stroke-width="2" marker-end="url(#arrow)"/>
  <line x1="400" y1="350" x2="400" y2="390" stroke="#64748b" stroke-width="2" marker-end="url(#arrow)"/>

  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/>
    </marker>
  </defs>
</svg>'''

    workflow_svg = '''<?xml version="1.0" encoding="UTF-8"?>
<svg width="700" height="200" xmlns="http://www.w3.org/2000/svg">
  <rect width="700" height="200" fill="#fafafa"/>

  <rect x="30" y="70" width="120" height="60" rx="8" fill="#e0e7ff" stroke="#6366f1" stroke-width="2"/>
  <text x="90" y="105" text-anchor="middle" font-family="system-ui" font-size="12" fill="#4338ca">Upload</text>

  <rect x="190" y="70" width="120" height="60" rx="8" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/>
  <text x="250" y="105" text-anchor="middle" font-family="system-ui" font-size="12" fill="#b45309">Validate</text>

  <rect x="350" y="70" width="120" height="60" rx="8" fill="#d1fae5" stroke="#10b981" stroke-width="2"/>
  <text x="410" y="105" text-anchor="middle" font-family="system-ui" font-size="12" fill="#065f46">Process</text>

  <rect x="510" y="70" width="120" height="60" rx="8" fill="#dbeafe" stroke="#3b82f6" stroke-width="2"/>
  <text x="570" y="105" text-anchor="middle" font-family="system-ui" font-size="12" fill="#1e40af">Store</text>

  <line x1="150" y1="100" x2="190" y2="100" stroke="#64748b" stroke-width="2" marker-end="url(#arr)"/>
  <line x1="310" y1="100" x2="350" y2="100" stroke="#64748b" stroke-width="2" marker-end="url(#arr)"/>
  <line x1="470" y1="100" x2="510" y2="100" stroke="#64748b" stroke-width="2" marker-end="url(#arr)"/>

  <text x="350" y="170" text-anchor="middle" font-family="system-ui" font-size="14" fill="#475569">Document Processing Workflow</text>

  <defs>
    <marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/>
    </marker>
  </defs>
</svg>'''

    assets = {
        'assets/images/architecture.svg': arch_diagram_svg.encode('utf-8'),
        'assets/images/workflow.svg': workflow_svg.encode('utf-8')
    }

    # API response times
    api_data = '''Endpoint,Method,Avg Response (ms),P95 (ms),P99 (ms)
/api/documents,GET,45,89,120
/api/documents,POST,125,245,380
/api/documents/:id,GET,32,65,95
/api/documents/:id,PUT,98,189,275
/api/documents/:id,DELETE,28,52,78
/api/search,POST,156,312,485'''
    assets['assets/data/api-performance.csv'] = api_data.encode('utf-8')

    theme_css = '''/* Technical Documentation Theme */
:root {
  --primary: #3b82f6;
  --text: #1e293b;
  --bg: #ffffff;
  --code-bg: #1e293b;
}

body {
  font-family: 'Inter', system-ui, sans-serif;
  line-height: 1.7;
  color: var(--text);
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
}

.align-left { text-align: left; }
.align-center { text-align: center; }
.align-right { text-align: right; }
.align-justify { text-align: justify; }

h1 { font-size: 2.5rem; border-bottom: 3px solid var(--primary); padding-bottom: 0.5rem; }
h2 { font-size: 1.75rem; color: var(--primary); margin-top: 2.5rem; }
h3 { font-size: 1.375rem; }

code { font-family: 'JetBrains Mono', monospace; background: #f1f5f9; padding: 0.2em 0.4em; border-radius: 4px; }
pre { background: var(--code-bg); color: #e2e8f0; padding: 1.25rem; border-radius: 8px; overflow-x: auto; }

table { width: 100%; border-collapse: collapse; margin: 1.5em 0; }
th, td { padding: 0.75rem; text-align: left; border: 1px solid #e2e8f0; }
th { background: #f8fafc; font-weight: 600; }

.note { padding: 1rem; border-radius: 8px; margin: 1.5em 0; border-left: 4px solid; }
.note-warning { background: #fffbeb; border-color: #f59e0b; }
.note-info { background: #eff6ff; border-color: #3b82f6; }
'''
    styles = {'styles/theme.css': theme_css.encode('utf-8')}

    content = '''# MDX Document Management System

{:.center}
## Technical Documentation

{:.center}
*Version 2.1.0 — API Reference and Architecture Guide*

---

## Introduction

{:.justify}
This technical documentation covers the MDX Document Management System (DMS), a scalable platform for creating, storing, and managing MDX format documents. The system provides a RESTful API for document operations, real-time collaboration features, and comprehensive search capabilities.

## System Architecture

{:.center}
![System Architecture](assets/images/architecture.svg)

{:.center}
*Figure 1: High-level system architecture showing the three-tier design*

### Architecture Overview

{:.justify}
The system follows a microservices architecture with three primary service layers. The API Gateway handles authentication, rate limiting, and request routing. Backend services are containerized using Docker and orchestrated via Kubernetes for horizontal scaling.

:::note{type="info"}
**Scalability Note**: Each service can scale independently based on load. The Document Service typically requires 3-5x more instances than other services during peak usage.
:::

## Document Processing Workflow

{:.center}
![Processing Workflow](assets/images/workflow.svg)

{:.center}
*Figure 2: Document processing pipeline*

### Workflow Stages

1. **Upload**: Client submits MDX file via multipart form upload
2. **Validate**: System validates ZIP structure and manifest.json
3. **Process**: Assets are extracted, indexed, and thumbnails generated
4. **Store**: Document and metadata persisted to storage layer

## API Reference

### Endpoints

{:.center}
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/documents` | GET | List all documents |
| `/api/documents` | POST | Create new document |
| `/api/documents/:id` | GET | Get document by ID |
| `/api/documents/:id` | PUT | Update document |
| `/api/documents/:id` | DELETE | Delete document |
| `/api/search` | POST | Search documents |

### Performance Metrics

{:.center}
::data[API Response Times]{src="assets/data/api-performance.csv" type="table"}

{:.right}
*Table 1: API endpoint performance metrics (measured over 30 days)*

### Authentication

All API requests require a valid JWT token in the Authorization header:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Example: Create Document

```bash
curl -X POST https://api.example.com/api/documents \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: multipart/form-data" \\
  -F "file=@document.mdx"
```

Response:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "My Document",
  "created": "2026-01-15T10:30:00Z",
  "status": "processing"
}
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | — | Redis connection string |
| `S3_BUCKET` | Yes | — | S3 bucket for document storage |
| `JWT_SECRET` | Yes | — | Secret for JWT signing |
| `MAX_FILE_SIZE` | No | 100MB | Maximum upload file size |

:::note{type="warning"}
**Security Warning**: Never commit secrets to version control. Use environment variables or a secrets manager.
:::

## Error Handling

### Error Response Format

All errors follow a consistent JSON structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid manifest.json structure",
    "details": {
      "field": "document.id",
      "reason": "Must be a valid UUID v4"
    }
  }
}
```

### Common Error Codes

{:.center}
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMITED` | 429 | Too many requests |

## Deployment

### Docker Compose (Development)

```yaml
version: '3.8'
services:
  api:
    image: mdx-dms:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://...
      - REDIS_URL=redis://redis:6379

  postgres:
    image: postgres:15
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
```

### Kubernetes (Production)

{:.justify}
For production deployments, use the Helm chart provided in the `/deploy/helm` directory. The chart supports horizontal pod autoscaling, ingress configuration, and secrets management via external-secrets-operator.

```bash
helm install mdx-dms ./deploy/helm \\
  --namespace mdx \\
  --values production-values.yaml
```

## Support

{:.center}
---

{:.center}
For technical support, contact: **support@example.com**

{:.center}
Documentation: **https://docs.example.com/mdx-dms**

{:.center}
GitHub: **https://github.com/example/mdx-dms**

{:.right}
*Last updated: 2026-01-15*
'''

    timestamp = iso_timestamp()
    doc_id = generate_uuid()

    manifest = {
        "mdx_version": "1.1.0",
        "document": {
            "id": doc_id,
            "title": "MDX Document Management System - Technical Documentation",
            "subtitle": "API Reference and Architecture Guide",
            "description": "Complete technical documentation for the MDX DMS platform",
            "authors": [
                {"name": "Engineering Team", "email": "engineering@example.com", "role": "author"},
                {"name": "Technical Writer", "role": "editor"}
            ],
            "created": timestamp,
            "modified": timestamp,
            "version": "2.1.0",
            "language": "en-US",
            "keywords": ["api", "documentation", "technical", "mdx", "architecture"]
        },
        "content": {
            "entry_point": "document.md",
            "encoding": "UTF-8",
            "markdown_variant": "CommonMark",
            "extensions": ["tables", "footnotes", "task-lists", "attributes", "alignment"]
        },
        "assets": {
            "images": [
                {
                    "path": "assets/images/architecture.svg",
                    "mime_type": "image/svg+xml",
                    "size_bytes": len(assets['assets/images/architecture.svg']),
                    "checksum": compute_checksum(assets['assets/images/architecture.svg']),
                    "alt_text": "System architecture diagram"
                },
                {
                    "path": "assets/images/workflow.svg",
                    "mime_type": "image/svg+xml",
                    "size_bytes": len(assets['assets/images/workflow.svg']),
                    "checksum": compute_checksum(assets['assets/images/workflow.svg']),
                    "alt_text": "Document processing workflow"
                }
            ],
            "data": [
                {
                    "path": "assets/data/api-performance.csv",
                    "mime_type": "text/csv",
                    "size_bytes": len(assets['assets/data/api-performance.csv']),
                    "checksum": compute_checksum(assets['assets/data/api-performance.csv']),
                    "rows": 6,
                    "columns": 5,
                    "has_header": True
                }
            ]
        },
        "styles": {
            "theme": "styles/theme.css",
            "syntax_highlighting": "github-dark",
            "alignment_classes": {
                "align-left": "text-align: left;",
                "align-center": "text-align: center;",
                "align-right": "text-align: right;",
                "align-justify": "text-align: justify;"
            }
        },
        "rendering": {
            "table_of_contents": {"enabled": True, "depth": 3},
            "attributes": {
                "enabled": True,
                "allow_inline_styles": False
            }
        }
    }

    output_path = Path(__file__).parent.parent.parent / 'examples' / 'technical-doc.mdx'
    create_mdx(output_path, manifest, content, assets, styles)


def create_test_files():
    """Create conformance test files in tests/alignment/."""

    tests_dir = Path(__file__).parent.parent.parent / 'tests' / 'alignment'
    tests_dir.mkdir(parents=True, exist_ok=True)

    # Test 1: Basic alignment
    test1_content = '''{:.left}
Left aligned text.

{:.center}
Center aligned text.

{:.right}
Right aligned text.

{:.justify}
Justified text that should span the full width with adjusted word spacing.
'''
    (tests_dir / '01-basic-alignment.md').write_text(test1_content)

    # Test 2: Alignment with headings
    test2_content = '''{:.center}
# Centered Heading 1

{:.right}
## Right Aligned Heading 2

{:.center}
### Centered Heading 3
'''
    (tests_dir / '02-headings.md').write_text(test2_content)

    # Test 3: Alignment with lists
    test3_content = '''{:.center}
- Item 1
- Item 2
- Item 3

{:.right}
1. First
2. Second
3. Third
'''
    (tests_dir / '03-lists.md').write_text(test3_content)

    # Test 4: Alignment with blockquotes
    test4_content = '''{:.center}
> Centered blockquote
> with multiple lines.

{:.right}
> Right-aligned quote.
'''
    (tests_dir / '04-blockquotes.md').write_text(test4_content)

    # Test 5: Directive integration
    test5_content = '''{:.center}
::video[Demo]{src="demo.mp4" controls}

::model[3D View]{src="model.gltf" .align-right}
'''
    (tests_dir / '05-directives.md').write_text(test5_content)

    # Test 6: Container blocks
    test6_content = ''':::{.align-center}
All content centered.

Still centered.
:::

:::{.align-right}
Right aligned container.
:::
'''
    (tests_dir / '06-containers.md').write_text(test6_content)

    # Test 7: Precedence
    test7_content = ''':::{.align-center}
{:.right}
Block overrides container (should be right).
:::

{:.center}
::video[Demo]{src="demo.mp4" .align-left}
Inline overrides block (video should be left).
'''
    (tests_dir / '07-precedence.md').write_text(test7_content)

    # Test 8: Combined attributes
    test8_content = '''{.align-center .highlight #important}
Multiple attributes combined.

{.align-right style="color: red;"}
With inline style.
'''
    (tests_dir / '08-combined-attributes.md').write_text(test8_content)

    # Test 9: Malformed syntax
    test9_content = '''{.incomplete
This is not a valid attribute block.

{:.center}
This is valid and should be centered.

{missing-dot}
Missing dot prefix, should be treated as text.
'''
    (tests_dir / '09-malformed.md').write_text(test9_content)

    # Test 10: Backward compatibility
    test10_content = '''# Document Without Alignment

This document has no alignment attributes.

It should render with default left alignment.

- List item
- Another item

> Blockquote

All content uses default formatting.
'''
    (tests_dir / '10-backward-compat.md').write_text(test10_content)

    # Create README for tests
    readme = '''# Alignment Conformance Tests

This directory contains test files for MDX v1.1 alignment feature conformance.

## Test Files

| File | Description |
|------|-------------|
| `01-basic-alignment.md` | Basic left, center, right, justify alignment |
| `02-headings.md` | Alignment applied to headings |
| `03-lists.md` | Alignment applied to lists |
| `04-blockquotes.md` | Alignment applied to blockquotes |
| `05-directives.md` | Alignment with MDX directives |
| `06-containers.md` | Directive block containers |
| `07-precedence.md` | Attribute precedence rules |
| `08-combined-attributes.md` | Multiple attributes combined |
| `09-malformed.md` | Malformed syntax handling |
| `10-backward-compat.md` | Documents without alignment |

## Running Tests

These files are raw Markdown content for testing parsers. To create MDX
documents from them, wrap each in a valid MDX archive with appropriate
manifest.json.

## Expected Behavior

Conforming renderers should:

1. Apply alignment classes to block elements
2. Generate CSS classes (not inline styles) when possible
3. Handle precedence: inline > block > container
4. Ignore malformed attribute blocks gracefully
5. Render documents without alignment using default left alignment
'''
    (tests_dir / 'README.md').write_text(readme)

    print(f"[OK] Created test files in: {tests_dir}")


def main():
    """Create all v1.1 example documents and test files."""
    print("Creating MDX v1.1 example documents...\n")

    create_alignment_basic()
    create_alignment_directives()
    create_alignment_complex()
    create_technical_doc()
    create_test_files()

    print("\n[OK] All v1.1 examples created successfully!")


if __name__ == '__main__':
    main()
