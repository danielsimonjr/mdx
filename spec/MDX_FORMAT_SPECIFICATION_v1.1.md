# MDX Format Specification

## Version 1.1.0 — Draft

**Status**: Draft Specification  
**Media Type**: `application/vnd.mdx-container+zip`  
**File Extension**: `.mdx` (alternate: `.mdxc` to avoid conflict with MDX/JSX)  
**Magic Bytes**: Standard ZIP header (`PK\x03\x04`)

-----

## 1. Overview

MDX (Markdown eXtended Container) is an open document format that packages Markdown content with embedded media assets into a single, portable, self-contained archive. The format is designed to be universally readable, gracefully degradable, and capable of rich interactivity when processed by capable viewers.

### 1.1 Design Goals

1. **Universal Accessibility**: Any ZIP utility can extract the contents; any text editor can read the Markdown.
2. **Graceful Degradation**: Basic renderers show text and standard images; advanced viewers unlock full interactivity.
3. **Web Standards Alignment**: All embedded media types correspond to standard MIME types renderable in web browsers.
4. **Version Control Friendly**: Text-based manifest and Markdown content enable meaningful diffs.
5. **Extensibility**: Plugin architecture allows custom renderers and content types without breaking compatibility.
6. **Collaboration Support**: Built-in structures for annotations, comments, and version history.

### 1.2 Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

### 1.3 File Extension Note

The `.mdx` extension is also used by MDX (Markdown + JSX) for React-enhanced Markdown files. To avoid ambiguity:

- **Recommended**: Use `.mdx` when context is clear (file is a ZIP archive)
- **Alternative**: Use `.mdxc` (MDX Container) for explicit disambiguation
- **Detection**: Viewers SHOULD check for ZIP magic bytes (`PK\x03\x04`) to distinguish from text-based MDX/JSX files

### 1.4 Relationship to Existing Formats

| Format         | Strengths                         | MDX Advantage                                                 |
| -------------- | --------------------------------- | ------------------------------------------------------------- |
| DOCX           | Rich formatting, wide support     | Human-readable source, simpler structure, web-native media    |
| PDF            | Print fidelity, universal viewing | Editable source, smaller size, true interactivity             |
| 3D PDF         | Embedded 3D models                | Open format, modern 3D standards (glTF), no proprietary tools |
| HTML           | Web-native, interactive           | Self-contained, offline-capable, version-controlled           |
| Plain Markdown | Simple, readable                  | Bundled assets, rich metadata, collaboration features         |
| EPUB           | E-book standard                   | Simpler structure, better for documents vs. books             |

-----

## 2. Archive Structure

An MDX file is a standard ZIP archive (using DEFLATE compression) with the following canonical structure:

```
document.mdx (ZIP container)
│
├── manifest.json              # REQUIRED: Document metadata and content inventory
├── document.md                # REQUIRED: Primary Markdown content
│
├── assets/                    # REQUIRED (if assets exist): All embedded assets
│   ├── images/                # Raster and vector images
│   │   ├── figure-01.png
│   │   ├── diagram.svg
│   │   └── photo.webp
│   ├── video/                 # Video content
│   │   ├── demo.mp4
│   │   ├── demo.en.vtt        # Captions alongside video
│   │   └── tutorial.webm
│   ├── audio/                 # Audio content
│   │   ├── narration.mp3
│   │   └── narration.txt      # Transcript alongside audio
│   ├── models/                # 3D model content
│   │   ├── assembly.gltf
│   │   ├── assembly.bin       # glTF binary buffer
│   │   └── part.stl
│   ├── documents/             # Embedded documents
│   │   └── appendix.pdf
│   ├── data/                  # Structured data files
│   │   ├── measurements.csv
│   │   ├── config.json
│   │   └── results.parquet
│   ├── fonts/                 # Embedded fonts (WOFF2 preferred)
│   │   └── custom-font.woff2
│   └── other/                 # Uncategorized assets
│       └── archive.zip
│
├── styles/                    # Presentation customization
│   ├── theme.css              # Custom CSS styling
│   └── print.css              # Print-specific styles
│
├── scripts/                   # Interactive content (sandboxed)
│   └── visualization.js
│
├── history/                   # Version history (OPTIONAL)
│   ├── versions.json          # Version metadata
│   └── snapshots/             # Historical document states
│       ├── v1.0.0.md
│       └── v1.1.0.md
│
├── annotations/               # Collaborative annotations (OPTIONAL)
│   └── annotations.json
│
└── extensions/                # Plugin/extension data (OPTIONAL)
    └── [extension-id]/
        ├── extension.json     # Extension metadata
        └── ...
```

### 2.1 Required Components

Every valid MDX file MUST contain:

1. **`manifest.json`**: Document metadata and content inventory (MUST be at archive root)
2. **`document.md`**: Primary Markdown content (MUST be at archive root, or path specified in manifest)

### 2.2 Optional Components

The following are OPTIONAL but follow defined structures when present:

1. **`assets/`**: Contains all embedded media, organized by type
2. **`styles/`**: CSS files for rendering customization
3. **`scripts/`**: JavaScript for interactive features (sandboxed execution)
4. **`history/`**: Version history and snapshots
5. **`annotations/`**: Collaborative annotations and comments
6. **`extensions/`**: Third-party extension data

### 2.3 Path Conventions

- All internal paths MUST use forward slashes (`/`) regardless of operating system
- Paths are relative to the archive root
- Path components MUST NOT contain: `< > : " | ? *` (Windows reserved characters)
- Path components MUST NOT end with spaces or dots
- Path components SHOULD use lowercase with hyphens for multi-word names
- Maximum path length: 255 characters (for cross-platform compatibility)

### 2.4 Asset Organization

Assets are organized by type under the `assets/` directory:

| Directory           | Contents                    | Common Extensions                           |
| ------------------- | --------------------------- | ------------------------------------------- |
| `assets/images/`    | Raster and vector images    | .png, .jpg, .jpeg, .gif, .webp, .svg, .avif |
| `assets/video/`     | Video files and captions    | .mp4, .webm, .ogg, .vtt                     |
| `assets/audio/`     | Audio files and transcripts | .mp3, .ogg, .wav, .flac, .m4a               |
| `assets/models/`    | 3D models                   | .gltf, .glb, .stl, .obj, .usdz              |
| `assets/documents/` | Embedded documents          | .pdf, .html                                 |
| `assets/data/`      | Structured data             | .csv, .json, .tsv, .parquet, .xlsx          |
| `assets/fonts/`     | Custom fonts                | .woff2, .woff, .ttf, .otf                   |
| `assets/other/`     | Uncategorized files         | (any)                                       |

-----

## 3. Manifest Schema

The `manifest.json` file is the heart of an MDX document, providing metadata, content inventory, and processing instructions.

### 3.1 Complete Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "mdx_version": "1.1.0",

  "document": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Document Title",
    "subtitle": "Optional Subtitle",
    "description": "Brief description of the document",
    "authors": [
      {
        "name": "Author Name",
        "email": "author@example.com",
        "url": "https://author.example.com",
        "role": "author",
        "organization": "Organization Name"
      }
    ],
    "contributors": [
      {
        "name": "Contributor Name",
        "role": "editor"
      }
    ],
    "created": "2026-01-10T12:00:00Z",
    "modified": "2026-01-10T14:30:00Z",
    "published": "2026-01-10T14:30:00Z",
    "version": "1.2.0",
    "language": "en-US",
    "license": {
      "type": "CC-BY-4.0",
      "url": "https://creativecommons.org/licenses/by/4.0/"
    },
    "copyright": "© 2026 Author Name",
    "keywords": ["documentation", "specification", "example"],
    "category": "technical-documentation",
    "subject": "Software Specification",
    "cover_image": "assets/images/cover.png"
  },

  "content": {
    "entry_point": "document.md",
    "encoding": "UTF-8",
    "markdown_variant": "CommonMark",
    "markdown_version": "0.31",
    "extensions": ["tables", "footnotes", "task-lists", "math", "strikethrough", "autolinks", "attributes", "alignment"],
    "additional_files": [
      {
        "path": "appendix.md",
        "title": "Appendix A"
      }
    ]
  },

  "assets": {
    "images": [
      {
        "path": "assets/images/figure-01.png",
        "mime_type": "image/png",
        "size_bytes": 245760,
        "checksum": "sha256:a3f2b8c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
        "width": 1920,
        "height": 1080,
        "alt_text": "System architecture diagram",
        "title": "Figure 1: System Architecture",
        "credit": "Created by Author Name"
      }
    ],
    "video": [
      {
        "path": "assets/video/demo.mp4",
        "mime_type": "video/mp4",
        "size_bytes": 15728640,
        "checksum": "sha256:b4e3c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8",
        "width": 1920,
        "height": 1080,
        "duration_seconds": 120.5,
        "frame_rate": 30,
        "codec": "H.264",
        "poster": "assets/images/demo-poster.png",
        "captions": [
          {
            "path": "assets/video/demo.en.vtt",
            "language": "en",
            "label": "English",
            "kind": "subtitles",
            "default": true
          },
          {
            "path": "assets/video/demo.es.vtt",
            "language": "es",
            "label": "Español",
            "kind": "subtitles"
          }
        ],
        "audio_tracks": [
          {
            "language": "en",
            "label": "English",
            "default": true
          }
        ]
      }
    ],
    "audio": [
      {
        "path": "assets/audio/narration.mp3",
        "mime_type": "audio/mpeg",
        "size_bytes": 4800000,
        "checksum": "sha256:c5f4d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9",
        "duration_seconds": 300.0,
        "sample_rate": 44100,
        "channels": 2,
        "bit_rate": 128000,
        "transcript": "assets/audio/narration.txt"
      }
    ],
    "models": [
      {
        "path": "assets/models/assembly.gltf",
        "mime_type": "model/gltf+json",
        "size_bytes": 1048576,
        "checksum": "sha256:d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7",
        "format_version": "2.0",
        "preview": "assets/images/assembly-preview.png",
        "binary_buffers": ["assets/models/assembly.bin"],
        "textures": ["assets/models/assembly-diffuse.png"],
        "animations": true,
        "vertex_count": 50000,
        "triangle_count": 25000
      }
    ],
    "documents": [
      {
        "path": "assets/documents/appendix.pdf",
        "mime_type": "application/pdf",
        "size_bytes": 524288,
        "checksum": "sha256:e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8",
        "pages": 12,
        "title": "Technical Appendix",
        "pdf_version": "1.7"
      }
    ],
    "data": [
      {
        "path": "assets/data/measurements.csv",
        "mime_type": "text/csv",
        "size_bytes": 2048,
        "checksum": "sha256:f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9",
        "rows": 1500,
        "columns": 8,
        "delimiter": ",",
        "has_header": true,
        "encoding": "UTF-8",
        "schema_ref": "assets/data/measurements.schema.json"
      }
    ],
    "fonts": [
      {
        "path": "assets/fonts/custom-font.woff2",
        "mime_type": "font/woff2",
        "size_bytes": 32768,
        "checksum": "sha256:a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
        "family": "Custom Font",
        "weight": 400,
        "style": "normal"
      }
    ],
    "other": [
      {
        "path": "assets/other/source-data.zip",
        "mime_type": "application/zip",
        "size_bytes": 1024000,
        "checksum": "sha256:b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1",
        "description": "Original source data archive"
      }
    ]
  },

  "styles": {
    "theme": "styles/theme.css",
    "print": "styles/print.css",
    "syntax_highlighting": "github-dark",
    "custom_properties": {
      "--primary-color": "#2563eb",
      "--font-family": "Inter, system-ui, sans-serif"
    },
    "alignment_classes": {
      "align-left": "text-align: left;",
      "align-center": "text-align: center;",
      "align-right": "text-align: right;",
      "align-justify": "text-align: justify;"
    }
  },

  "rendering": {
    "math_renderer": "katex",
    "math_delimiters": {
      "inline": ["$", "$"],
      "block": ["$$", "$$"]
    },
    "table_of_contents": {
      "enabled": true,
      "depth": 3,
      "ordered": false
    },
    "line_numbers": {
      "enabled": true,
      "start": 1
    },
    "footnotes": {
      "style": "end-of-document"
    },
    "attributes": {
      "enabled": true,
      "allow_inline_styles": true
    }
  },

  "interactivity": {
    "scripts": [
      {
        "path": "scripts/visualization.js",
        "type": "module",
        "integrity": "sha256-...",
        "sandbox": true,
        "permissions": ["canvas", "webgl"],
        "load": "lazy"
      }
    ],
    "required_capabilities": ["video", "webgl"],
    "optional_capabilities": ["webgpu"],
    "fallback_behavior": "show-static-preview"
  },

  "collaboration": {
    "allow_annotations": true,
    "annotation_types": ["comment", "highlight", "suggestion", "question", "bookmark"],
    "track_changes": true,
    "allow_replies": true
  },

  "history": {
    "enabled": true,
    "versions_file": "history/versions.json",
    "snapshots_directory": "history/snapshots",
    "retention_policy": "all",
    "diff_format": "unified"
  },

  "security": {
    "integrity": {
      "algorithm": "sha256",
      "manifest_checksum": "sha256:..."
    },
    "signature": {
      "signed_by": "author@example.com",
      "algorithm": "RS256",
      "certificate": "...",
      "signature": "..."
    },
    "permissions": {
      "allow_external_links": true,
      "allow_external_images": false,
      "allow_scripts": true,
      "script_sandbox": "strict"
    }
  },

  "extensions": {
    "citation-manager": {
      "version": "1.0.0",
      "config": {
        "style": "apa"
      }
    }
  },

  "custom": {
    "my-app-specific-data": {
      "project_id": "12345"
    }
  }
}
```

### 3.2 Required Fields

The following fields are REQUIRED in every manifest:

```json
{
  "mdx_version": "1.1.0",
  "document": {
    "id": "uuid-v4-string",
    "title": "Document Title",
    "created": "ISO-8601-timestamp",
    "modified": "ISO-8601-timestamp"
  },
  "content": {
    "entry_point": "document.md"
  }
}
```

### 3.3 Minimal Valid Manifest

```json
{
  "mdx_version": "1.1.0",
  "document": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "My Document",
    "created": "2026-01-10T12:00:00Z",
    "modified": "2026-01-10T12:00:00Z"
  },
  "content": {
    "entry_point": "document.md"
  }
}
```

### 3.4 Field Definitions

#### 3.4.1 Root Fields

| Field           | Type   | Required | Description                           |
| --------------- | ------ | -------- | ------------------------------------- |
| `mdx_version`   | string | YES      | Specification version (SemVer format) |
| `$schema`       | string | NO       | JSON Schema URL for validation        |
| `document`      | object | YES      | Document metadata                     |
| `content`       | object | YES      | Content configuration                 |
| `assets`        | object | NO       | Asset inventory                       |
| `styles`        | object | NO       | Styling configuration                 |
| `rendering`     | object | NO       | Rendering preferences                 |
| `interactivity` | object | NO       | Interactive features                  |
| `collaboration` | object | NO       | Collaboration settings                |
| `history`       | object | NO       | Version history settings              |
| `security`      | object | NO       | Security configuration                |
| `extensions`    | object | NO       | Extension configurations              |
| `custom`        | object | NO       | Application-specific data             |

#### 3.4.2 Document Fields

| Field          | Type          | Required | Description                             |
| -------------- | ------------- | -------- | --------------------------------------- |
| `id`           | string        | YES      | Unique identifier (UUID v4 recommended) |
| `title`        | string        | YES      | Document title                          |
| `subtitle`     | string        | NO       | Document subtitle                       |
| `description`  | string        | NO       | Brief description                       |
| `authors`      | array         | NO       | List of authors                         |
| `contributors` | array         | NO       | List of contributors                    |
| `created`      | string        | YES      | Creation timestamp (ISO 8601)           |
| `modified`     | string        | YES      | Last modification timestamp (ISO 8601)  |
| `published`    | string        | NO       | Publication timestamp (ISO 8601)        |
| `version`      | string        | NO       | Document version (SemVer recommended)   |
| `language`     | string        | NO       | Primary language (BCP 47 tag)           |
| `license`      | object/string | NO       | License information                     |
| `copyright`    | string        | NO       | Copyright notice                        |
| `keywords`     | array         | NO       | Keywords/tags                           |
| `category`     | string        | NO       | Document category                       |
| `subject`      | string        | NO       | Document subject                        |
| `cover_image`  | string        | NO       | Path to cover image                     |

-----

## 4. Markdown Content

### 4.1 Base Syntax

MDX documents use CommonMark 0.31+ as the base Markdown syntax. The following extensions are RECOMMENDED for broad compatibility:

1. **Tables** (GFM-style)
2. **Strikethrough** (`~~deleted~~`)
3. **Autolinks** (automatic URL linking)
4. **Task Lists** (`- [ ]` / `- [x]`)
5. **Footnotes** (`[^1]`)
6. **Math** (LaTeX syntax with `$...$` and `$$...$$`)
7. **Definition Lists**
8. **Attributes** (block-level formatting)
9. **Alignment** (text alignment directives)

The `content.extensions` manifest field declares which extensions the document uses.

### 4.2 Asset Linking Syntax

Assets are referenced using standard Markdown syntax with paths relative to the archive root:

#### 4.2.1 Images

```markdown
![Alt text describing the image](assets/images/figure-01.png)

![Alt text](assets/images/figure-01.png "Figure 1: System Architecture")

<!-- Reference-style (recommended for repeated images) -->
![Alt text][fig1]

[fig1]: assets/images/figure-01.png "Figure 1: System Architecture"
```

#### 4.2.2 Links to Assets

```markdown
[Download the data file](assets/data/measurements.csv)

[View the PDF appendix](assets/documents/appendix.pdf)
```

#### 4.2.3 Extended Directives

For rich media that benefits from additional parameters, MDX supports the CommonMark generic directive proposal syntax:

```markdown
<!-- Inline directive -->
:directive-name[content]{key="value"}

<!-- Leaf block directive -->
::directive-name[content]{key="value"}

<!-- Container block directive -->
:::directive-name{key="value"}
Block content here.
:::
```

### 4.3 Standard Directives

| Directive   | Purpose             | Attributes                                                                  |
| ----------- | ------------------- | --------------------------------------------------------------------------- |
| `::video`   | Video player        | `src`, `poster`, `controls`, `autoplay`, `loop`, `muted`, `width`, `height` |
| `::audio`   | Audio player        | `src`, `controls`, `autoplay`, `loop`                                       |
| `::model`   | 3D model viewer     | `src`, `preview`, `interactive`, `camera-controls`, `auto-rotate`           |
| `::embed`   | Document embed      | `src`, `page`, `width`, `height`                                            |
| `::data`    | Data visualization  | `src`, `type`, `chart-type`, `x`, `y`, `title`                              |
| `::figure`  | Captioned figure    | `id`, `caption`, `credit`                                                   |
| `::note`    | Callout/admonition  | `type` (info, warning, danger, tip, note)                                   |
| `::details` | Collapsible section | `summary`, `open`                                                           |
| `::toc`     | Table of contents   | `depth`, `ordered`                                                          |

#### 4.3.1 Directive Examples

```markdown
<!-- Video with poster and captions -->
::video[Product demonstration]{src="assets/video/demo.mp4" poster="assets/images/demo-poster.png" controls}

<!-- Audio with transcript link -->
::audio[Chapter narration]{src="assets/audio/narration.mp3" controls}
[View transcript](assets/audio/narration.txt)

<!-- Interactive 3D model -->
::model[Assembly View]{src="assets/models/assembly.gltf" preview="assets/images/assembly-preview.png" interactive camera-controls}

<!-- Embedded PDF at specific page -->
::embed[Technical Appendix]{src="assets/documents/appendix.pdf" page="3" height="600"}

<!-- Data visualization -->
::data[Quarterly Results]{src="assets/data/measurements.csv" type="chart" chart-type="bar" x="quarter" y="revenue" title="Revenue by Quarter"}

<!-- Admonitions -->
:::note{type="warning"}
**Important**: This operation cannot be undone.
:::

:::note{type="tip"}
You can use keyboard shortcuts for faster navigation.
:::

<!-- Collapsible details -->
:::details{summary="Click to expand implementation details"}
The implementation uses a hash map for O(1) lookup...
:::
```

### 4.4 Text Alignment and Block Attributes

MDX supports explicit text alignment and block-level attributes to provide precise control over document layout while maintaining source readability.

#### 4.4.1 Overview

Block attributes modify the presentation of block-level elements (paragraphs, headings, lists, directives) without affecting their semantic meaning. Attributes are specified using curly-brace syntax and can appear in two forms:

1. **Block-level attributes**: Standalone lines that apply to the immediately following block element
2. **Inline attributes**: Attributes embedded directly within directive syntax
3. **Container attributes**: Applied to directive block containers that wrap multiple elements

#### 4.4.2 Block-Level Attribute Syntax

Block-level attributes appear on their own line immediately before the content they modify. The basic syntax is:

```markdown
{.class-name}
Content to be modified.
```

Multiple attributes can be combined:

```markdown
{.class-name #element-id style="property: value;"}
Content with multiple attributes.
```

#### 4.4.3 Alignment Classes

The following standard alignment classes are defined:

| Class            | Alignment | CSS Equivalent         |
| ---------------- | --------- | ---------------------- |
| `.align-left`    | Left      | `text-align: left;`    |
| `.align-center`  | Center    | `text-align: center;`  |
| `.align-right`   | Right     | `text-align: right;`   |
| `.align-justify` | Justify   | `text-align: justify;` |

Shorthand notation is supported for alignment classes:

| Shorthand     | Expands To       |
| ------------- | ---------------- |
| `{:.left}`    | `.align-left`    |
| `{:.center}`  | `.align-center`  |
| `{:.right}`   | `.align-right`   |
| `{:.justify}` | `.align-justify` |

#### 4.4.4 Basic Alignment Examples

```markdown
<!-- Standard left alignment (default, explicit) -->
{:.left}
This paragraph is explicitly left-aligned.

<!-- Center alignment -->
{:.center}
This paragraph is centered on the page.

<!-- Right alignment -->
{:.right}
This paragraph is right-aligned.

<!-- Justified text -->
{:.justify}
This longer paragraph demonstrates justified text alignment. In justified alignment, the renderer adjusts spacing between words to create clean left and right edges. This is commonly used in formal documents and publications where visual polish matters.
```

#### 4.4.5 Alignment with Headings

Alignment attributes apply to headings at all levels:

```markdown
{:.center}
# Main Document Title

{:.right}
## Subtitle or Section Heading

{:.center}
### Subsection Title
```

#### 4.4.6 Alignment with Lists

When applied to lists, alignment affects the entire list structure:

```markdown
{:.center}
- First item
- Second item
- Third item

{:.right}
1. First numbered item
2. Second numbered item
3. Third numbered item
```

#### 4.4.7 Alignment with Blockquotes

Blockquotes can be aligned as complete block elements:

```markdown
{:.center}
> This entire blockquote is centered on the page.
> Multiple lines stay together as one centered block.

{:.right}
> This blockquote is right-aligned.
> Often used for attributions or pull quotes.
```

#### 4.4.8 Integration with Directives

Alignment attributes integrate seamlessly with MDX directives in three ways:

**Method 1: Block-level attributes before directives**

```markdown
{:.center}
::video[Product Demo]{src="assets/video/demo.mp4" controls}
```

The video player container is centered on the page.

**Method 2: Inline attributes within directives**

```markdown
::video[Product Demo]{src="assets/video/demo.mp4" controls .align-center}

::model[3D Visualization]{src="assets/models/part.gltf" camera="front" .align-right}
```

The alignment class is extracted from the directive attributes and applied to the container element.

**Method 3: Directive block containers**

```markdown
:::{.align-center}
::video[First Demo]{src="assets/video/demo1.mp4" controls}

::video[Second Demo]{src="assets/video/demo2.mp4" controls}

::audio[Audio Commentary]{src="assets/audio/commentary.mp3" controls}
:::
```

All directives within the container block share the center alignment. This pattern is efficient for creating media galleries or grouped content.

#### 4.4.9 Directive Block Containers

Container blocks use triple-colon syntax to group multiple elements with shared formatting:

```markdown
:::directive-name{attributes}
Content block 1

Content block 2

Content block 3
:::
```

The container applies its attributes to all contained elements unless overridden by more specific attributes on individual elements.

**Nesting behavior:**

```markdown
:::{.align-center}
This paragraph is centered by the outer container.

{:.align-right}
This paragraph is right-aligned, overriding the container.

This paragraph returns to center alignment from the container.
:::
```

**Complex nesting:**

```markdown
:::{.align-center}
Outer container: centered content.

:::{.align-right}
Inner container: right-aligned content within centered container.
:::

Back to centered content from outer container.
:::
```

#### 4.4.10 Combined Attributes

Alignment can be combined with other attributes for precise control:

```markdown
{.align-center .important #key-message}
This centered paragraph also has additional CSS classes and an ID attribute.

{.align-right style="max-width: 600px; margin-left: auto;"}
This right-aligned paragraph includes custom inline styles.
```

#### 4.4.11 Attribute Scope and Application

**Scope rules:**

1. Block-level attributes apply to the immediately following block element
2. Blank lines between the attribute and content are ignored
3. Attributes persist only for that single block element
4. Container attributes apply to all contained blocks unless overridden

**Application order:**

1. Container attributes (lowest precedence)
2. Block-level attributes (medium precedence)
3. Inline directive attributes (highest precedence)

**Conflict resolution:**

When multiple alignment attributes could apply to the same element, the most specific attribute wins:

```markdown
:::{.align-center}
{:.align-right}
This paragraph is right-aligned (block attribute overrides container).
:::
```

```markdown
{:.center}
::video[Demo]{src="path" .align-right}
This video is right-aligned (inline attribute overrides block attribute).
```

#### 4.4.12 Rendering Requirements

Conforming MDX renderers MUST:

1. Parse attribute blocks that appear on standalone lines before block elements
2. Apply alignment classes by generating appropriate CSS or equivalent formatting
3. Support the four standard alignment classes (left, center, right, justify)
4. Support both verbose (`.align-center`) and shorthand (`{:.center}`) notation
5. Implement proper precedence rules when multiple attributes could apply
6. Preserve unrecognized attributes for custom rendering extensions

Conforming MDX renderers SHOULD:

1. Generate semantic HTML with alignment via CSS classes rather than deprecated HTML attributes
2. Provide default CSS definitions for standard alignment classes
3. Allow custom CSS to override default alignment styles
4. Support multiple space-separated attributes in a single attribute block
5. Validate attribute syntax and warn on malformed attributes
6. Apply alignment to directive containers appropriately

#### 4.4.13 CSS Output

When rendering to HTML, alignment attributes generate CSS classes:

**Input:**

```markdown
{:.center}
Centered paragraph.
```

**Output:**

```html
<p class="align-center">Centered paragraph.</p>
```

**Default CSS (provided by renderer):**

```css
.align-left {
  text-align: left;
}

.align-center {
  text-align: center;
}

.align-right {
  text-align: right;
}

.align-justify {
  text-align: justify;
}
```

#### 4.4.14 Complete Example

```markdown
# Technical Documentation

This introduction uses default left alignment.

{:.center}
## Feature Overview

:::{.align-center}
The following demonstration videos show key features of the system.

::video[Installation Process]{src="assets/video/install.mp4" controls width="800"}

::video[Configuration Guide]{src="assets/video/config.mp4" controls width="800"}
:::

### System Requirements

{:.justify}
Before proceeding with installation, ensure your system meets the minimum requirements. The software requires at least 4GB of RAM, 10GB of available disk space, and a modern graphics processor supporting OpenGL 4.5 or later. Operating system support includes Windows 10 and later, macOS 11 and later, and most modern Linux distributions.

{:.center}
::model[System Architecture]{src="assets/models/architecture.gltf" camera="isometric" controls width="700" height="500"}

{:.right}
*Figure 1: Interactive 3D system architecture model*

### Troubleshooting

Common issues and solutions are listed below.

{:.center}
- Network connectivity errors
- Display rendering problems
- Audio output configuration

{:.right}
For additional support, contact our technical team.
```

#### 4.4.15 Backward Compatibility

Documents without alignment attributes remain fully valid and render with default left alignment. The alignment attribute syntax is purely additive and does not affect the interpretation of existing MDX documents.

Renderers that do not support alignment attributes SHOULD either:

1. Ignore attribute blocks and render content with default alignment
2. Treat attribute blocks as comments and omit them from output
3. Display attribute blocks as literal text (least preferred)

### 4.5 Graceful Degradation

Renderers that don't support extended directives or attributes SHOULD display content as follows:

| Extended Syntax                           | Fallback Rendering                                               |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `::video[Title]{src="..."}`               | Link: "[Video: Title](src)"                                      |
| `::audio[Title]{src="..."}`               | Link: "[Audio: Title](src)"                                      |
| `::model[Title]{src="..." preview="..."}` | Image with caption: "![Title](preview) [Download 3D Model](src)" |
| `::data[Title]{src="..."}`                | Link: "[Data: Title](src)"                                       |
| `::note[Content]{type="warning"}`         | Blockquote: "> ⚠️ **Warning**: Content"                          |
| `:::details{summary="..."}`               | Bold summary followed by content                                 |
| `{:.center}`                              | Ignored (content renders with default alignment)                 |
| `:::{.align-center}`                      | Directive markers ignored, content renders normally              |

-----

## 5. Version History

### 5.1 Overview

MDX supports built-in version history, enabling document evolution tracking without external version control systems.

### 5.2 versions.json Schema

```json
{
  "schema_version": "1.0.0",
  "current_version": "1.2.0",
  "versions": [
    {
      "version": "1.0.0",
      "timestamp": "2026-01-01T10:00:00Z",
      "author": {
        "name": "Author Name",
        "email": "author@example.com"
      },
      "message": "Initial release",
      "snapshot": {
        "type": "full",
        "path": "history/snapshots/v1.0.0.md",
        "manifest_path": "history/snapshots/v1.0.0.manifest.json"
      },
      "parent_version": null,
      "changes": {
        "summary": "Initial document creation",
        "added": ["document.md", "assets/images/figure-01.png"],
        "modified": [],
        "removed": []
      },
      "tags": ["release"]
    },
    {
      "version": "1.1.0",
      "timestamp": "2026-01-05T14:30:00Z",
      "author": {
        "name": "Author Name",
        "email": "author@example.com"
      },
      "message": "Added video tutorial and expanded section 3",
      "snapshot": {
        "type": "diff",
        "path": "history/snapshots/v1.1.0.diff",
        "base_version": "1.0.0"
      },
      "parent_version": "1.0.0",
      "changes": {
        "summary": "Added multimedia content",
        "added": ["assets/video/demo.mp4", "assets/video/demo.en.vtt"],
        "modified": ["document.md"],
        "removed": []
      }
    }
  ]
}
```

### 5.3 Semantic Versioning

MDX documents SHOULD follow semantic versioning (SemVer):

- **MAJOR** (1.x.x → 2.0.0): Breaking changes, significant restructuring, removal of major sections
- **MINOR** (1.1.x → 1.2.0): New sections, new media, substantial additions
- **PATCH** (1.1.1 → 1.1.2): Typo fixes, minor corrections, metadata updates

### 5.4 Snapshot Types

| Type        | Description                               | Use Case                        |
| ----------- | ----------------------------------------- | ------------------------------- |
| `full`      | Complete copy of document.md and manifest | Initial version, major releases |
| `diff`      | Unified diff from base version            | Minor changes, space-efficient  |
| `reference` | Pointer to external VCS                   | Integration with git, etc.      |

-----

## 6. Annotation System

### 6.1 Overview

MDX supports collaborative annotations using a schema compatible with the W3C Web Annotation Data Model.

### 6.2 annotations.json Schema

```json
{
  "schema_version": "1.0.0",
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "annotations": [
    {
      "id": "urn:mdx:annotation:550e8400-e29b-41d4-a716-446655440000",
      "type": "Annotation",
      "motivation": "commenting",
      "created": "2026-01-10T15:00:00Z",
      "modified": "2026-01-10T15:30:00Z",
      "creator": {
        "type": "Person",
        "name": "Reviewer Name",
        "email": "reviewer@example.com"
      },
      "target": {
        "source": "document.md",
        "selector": {
          "type": "TextQuoteSelector",
          "exact": "The key insight here is that",
          "prefix": "understanding. ",
          "suffix": " simplicity enables"
        }
      },
      "body": {
        "type": "TextualBody",
        "value": "This point deserves more emphasis. Consider adding an example.",
        "format": "text/plain"
      },
      "mdx:status": "open",
      "mdx:replies": [
        {
          "id": "urn:mdx:annotation:reply:661f9511-fa9c-42e5-b817-557766551111",
          "created": "2026-01-10T16:30:00Z",
          "creator": {
            "type": "Person",
            "name": "Author Name"
          },
          "body": {
            "type": "TextualBody",
            "value": "Good point! I'll add an example in the next revision."
          }
        }
      ]
    }
  ]
}
```

### 6.3 Annotation Types

| Type (motivation)      | MDX Status Values           | Description           |
| ---------------------- | --------------------------- | --------------------- |
| `commenting`           | open, resolved, wontfix     | General discussion    |
| `highlighting`         | active, archived            | Mark important text   |
| `editing` (suggesting) | pending, accepted, rejected | Proposed edit         |
| `questioning`          | open, answered              | Request clarification |
| `bookmarking`          | active, archived            | Personal marker       |

### 6.4 Selector Types

| Selector               | Description                      | Example Use         |
| ---------------------- | -------------------------------- | ------------------- |
| `TextQuoteSelector`    | Match by exact text with context | Most common, robust |
| `TextPositionSelector` | Match by character offsets       | Precise but fragile |
| `FragmentSelector`     | Match by document fragment       | Headings, sections  |
| `XPathSelector`        | Match by XPath expression        | Structured content  |

-----

## 7. Security Considerations

### 7.1 Script Sandboxing

When `interactivity.scripts` are present, viewers MUST:

1. Execute scripts in a sandboxed environment (e.g., iframe with `sandbox` attribute)
2. Grant ONLY permissions explicitly declared in the manifest
3. Block access to: user filesystem, unrestricted network, parent document DOM, cookies/storage of parent origin
4. Implement Content Security Policy (CSP) headers

### 7.2 Content Integrity

For integrity verification:

1. All assets SHOULD include `checksum` fields in the manifest
2. Viewers SHOULD verify checksums on load
3. Viewers MUST warn users if checksums fail
4. Viewers MUST refuse to execute scripts with failed checksums

Checksum format: `algorithm:hex-digest` (e.g., `sha256:a3f2b8c9...`)

### 7.3 External Resources

By default, MDX documents are self-contained. External resource loading:

1. MUST be declared in `security.permissions`
2. Viewers SHOULD prompt users before loading external resources
3. Documents SHOULD provide fallback content for offline viewing
4. External scripts MUST NOT be executed unless explicitly allowed

### 7.4 Digital Signatures

For authenticated documents:

1. `security.signature` contains the signature data
2. Signature covers the manifest (excluding the signature field itself)
3. Viewers MAY verify signatures and display verification status
4. Invalid signatures SHOULD be prominently warned

### 7.5 Inline Styles Security

When `rendering.attributes.allow_inline_styles` is enabled:

1. Viewers SHOULD sanitize inline CSS to prevent injection attacks
2. Dangerous CSS properties (e.g., `behavior`, `expression`) MUST be stripped
3. External resource references in CSS (e.g., `url()`) SHOULD be blocked unless allowed by security policy
4. Viewers MAY implement a whitelist of allowed CSS properties

-----

## 8. MIME Types and File Associations

### 8.1 Container MIME Type

Primary: `application/vnd.mdx-container+zip`  
Alternate: `application/x-mdx`

### 8.2 File Extensions

Primary: `.mdx`  
Alternate: `.mdxc` (MDX Container, to disambiguate from MDX/JSX)

### 8.3 Supported Embedded MIME Types

| Category       | MIME Types                                                                            |
| -------------- | ------------------------------------------------------------------------------------- |
| Images         | image/png, image/jpeg, image/gif, image/webp, image/svg+xml, image/avif               |
| Video          | video/mp4, video/webm, video/ogg                                                      |
| Video Captions | text/vtt                                                                              |
| Audio          | audio/mpeg, audio/ogg, audio/wav, audio/webm, audio/flac, audio/mp4                   |
| 3D Models      | model/gltf+json, model/gltf-binary, model/stl, model/obj, model/vnd.usdz+zip          |
| Documents      | application/pdf, text/html                                                            |
| Data           | text/csv, application/json, text/tab-separated-values, application/vnd.apache.parquet |
| Spreadsheets   | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet                     |
| Fonts          | font/woff2, font/woff, font/ttf, font/otf                                             |
| Styles         | text/css                                                                              |
| Scripts        | text/javascript, application/javascript                                               |

-----

## 9. Viewer Implementation Guidelines

### 9.1 Capability Levels

| Level | Name          | Capabilities                                           |
| ----- | ------------- | ------------------------------------------------------ |
| 0     | Basic         | Markdown rendering, standard images                    |
| 1     | Media         | Level 0 + video/audio playback, PDF embedding          |
| 2     | Interactive   | Level 1 + 3D models, data visualization, scripts       |
| 3     | Collaborative | Level 2 + annotations, version history, real-time sync |
| 4     | Advanced      | Level 3 + alignment attributes, custom styling         |

### 9.2 Graceful Degradation

Viewers MUST:

1. Always display core Markdown content, even if assets fail to load
2. Show static previews for unsupported interactive content
3. Provide download links for any asset type
4. Indicate clearly when content is degraded
5. Render content with default left alignment when alignment attributes are not supported

Viewers SHOULD:

1. Detect capabilities before attempting to render
2. Cache capability detection results
3. Provide progressive enhancement as capabilities are confirmed
4. Ignore unrecognized attribute blocks without errors

### 9.3 Accessibility

Viewers SHOULD:

1. Support screen readers (proper ARIA attributes)
2. Respect user font size preferences
3. Support keyboard navigation
4. Provide alternative text for all images (from `alt_text` in manifest)
5. Support captions/transcripts for audio/video
6. Ensure alignment does not interfere with text reflow or responsive design
7. Maintain proper reading order regardless of visual alignment

### 9.4 Alignment Rendering

When rendering alignment attributes, viewers SHOULD:

1. Generate CSS classes for alignment rather than inline styles (when possible)
2. Provide default CSS definitions for standard alignment classes
3. Allow these defaults to be overridden by custom stylesheets
4. Apply alignment to container elements for directives
5. Respect the precedence hierarchy (inline > block > container)
6. Handle nested directive blocks correctly
7. Preserve alignment through responsive breakpoints appropriately

-----

## 10. Conformance

### 10.1 Document Conformance

A conforming MDX document MUST:

1. Be a valid ZIP archive
2. Contain `manifest.json` at the root with all required fields
3. Contain the file specified in `content.entry_point`
4. Use valid paths for all asset references
5. Include accurate `size_bytes` for all assets (if specified)
6. Use valid attribute syntax for alignment (if present)
7. Declare alignment extension in `content.extensions` (if used)

A conforming MDX document SHOULD:

1. Include checksums for all assets
2. Use lowercase paths with hyphens
3. Include meaningful `alt_text` for images
4. Specify `markdown_variant` and `extensions`
5. Use semantic alignment (center important elements, not arbitrary content)
6. Combine alignment attributes meaningfully with other formatting

### 10.2 Viewer Conformance

A conforming MDX viewer MUST:

1. Parse and validate `manifest.json`
2. Render CommonMark markdown
3. Display images referenced in standard markdown syntax
4. Provide graceful degradation for unsupported features
5. Never execute scripts without explicit user consent (or manifest permission)
6. Parse attribute blocks that appear before block elements
7. Recognize standard alignment classes (even if not rendering them)

A conforming MDX viewer SHOULD:

1. Render alignment attributes via CSS classes
2. Support both verbose and shorthand alignment notation
3. Implement proper attribute precedence rules
4. Handle nested directive blocks correctly
5. Provide default CSS for alignment classes
6. Allow custom CSS to override alignment styles
7. Validate and warn on malformed attributes

### 10.3 Conformance Testing

Reference test documents for alignment features are available in the specification repository under `tests/alignment/`. These include:

1. Basic alignment (left, center, right, justify)
2. Alignment with headings, lists, blockquotes
3. Alignment with directives (video, audio, model, data)
4. Block-level vs. inline vs. container attributes
5. Attribute precedence and conflict resolution
6. Nested directive blocks
7. Combined attributes (alignment + classes + IDs + styles)
8. Malformed attribute syntax
9. Backward compatibility (documents without alignment)

-----

## Appendix A: JSON Schema

The complete JSON Schema for manifest.json validation is available at [`manifest.schema.json`](manifest.schema.json).

**Schema ID**: `https://mdx-format.org/schemas/manifest.schema.json`

**Usage**: Manifest files may reference the schema for validation:

```json
{
  "$schema": "https://mdx-format.org/schemas/manifest.schema.json",
  "mdx_version": "1.1.0",
  ...
}
```

The schema validates:

- Required fields (`mdx_version`, `document`, `content`)
- Document metadata (UUID format, ISO 8601 timestamps, SemVer versions)
- Asset inventory structure with category-specific metadata
- Configuration options for styles, rendering, collaboration, and history
- Alignment class definitions and rendering preferences

## Appendix B: Examples

Reference implementations and example documents are available in this repository under the `implementations/` and `examples/` directories.

### Example Documents with Alignment

- `examples/alignment-basic.mdx`: Simple alignment examples
- `examples/alignment-directives.mdx`: Alignment with media directives
- `examples/alignment-complex.mdx`: Nested containers and precedence
- `examples/technical-doc.mdx`: Real-world technical documentation with alignment

## Appendix C: Changelog

### Version 1.1.0 (Draft)

- Added text alignment and block attribute system (Section 4.4)
- Added shorthand alignment notation ({:.center})
- Added directive block container syntax (:::)
- Added attribute precedence rules
- Added alignment integration with existing directives
- Updated manifest schema to include alignment configuration
- Updated conformance requirements for alignment support
- Added alignment to recommended extensions list
- Bumped specification version to 1.1.0

### Version 1.0.0 (Draft)

- Initial specification draft
- Defined core structure, manifest schema, and content format
- Specified version history and annotation systems
- Established security model and viewer guidelines

-----

## License

This specification is released under CC-BY-4.0 (Creative Commons Attribution 4.0 International).

-----

*MDX Format Specification v1.1.0 — Maintained by the MDX Community*
