# MDX Format Internals

Deep technical reference for the MDX format structure. This document covers implementation details, edge cases, and advanced topics.

## Archive Format

### ZIP Structure

MDX uses standard ZIP (PKZIP) format with these requirements:

| Property | Requirement |
|----------|-------------|
| Compression | DEFLATE (method 8) |
| Magic bytes | `PK\x03\x04` (0x504B0304) |
| Encryption | Not supported |
| ZIP64 | Supported for files >4GB |
| Comments | Ignored by readers |

**Detecting MDX vs MDX/JSX:**

The `.mdx` extension is shared with MDX/JSX (Markdown + JSX). Distinguish by checking magic bytes:

```python
def is_mdx_container(file_path):
    with open(file_path, 'rb') as f:
        magic = f.read(4)
        return magic == b'PK\x03\x04'  # ZIP magic = MDX container
        # Text starting with import/export = MDX/JSX
```

### Path Encoding

All paths inside the archive:

- Use UTF-8 encoding
- Use forward slashes (`/`) as separators
- Are relative to archive root
- Have no leading slash
- Have maximum length of 255 characters

**Reserved characters** (must not appear in path components):
```
< > : " | ? * \
```

**Normalization rules:**
- No trailing dots or spaces in path components
- No double slashes (`//`)
- No parent references (`..`)
- Case-sensitive on all platforms

---

## Manifest Schema

### Complete Field Reference

```json
{
  "mdx_version": "1.0.0",

  "document": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Document Title",
    "subtitle": "Optional Subtitle",
    "description": "Brief description",
    "authors": [
      {
        "name": "Author Name",
        "email": "author@example.com",
        "url": "https://author.example.com",
        "role": "author",
        "organization": "Organization Name"
      }
    ],
    "contributors": [],
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
    "keywords": ["tag1", "tag2"],
    "category": "technical-documentation",
    "subject": "Software Specification",
    "cover_image": "assets/images/cover.png"
  },

  "content": {
    "entry_point": "document.md",
    "format": "commonmark",
    "extensions": ["tables", "footnotes", "strikethrough", "task_lists"],
    "word_count": 1500,
    "reading_time_minutes": 8
  },

  "assets": [
    {
      "path": "assets/images/figure.png",
      "type": "image/png",
      "size": 12345,
      "hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "metadata": {
        "alt_text": "Description",
        "width": 800,
        "height": 600
      }
    }
  ],

  "rendering": {
    "theme": "light",
    "custom_css": "styles/theme.css",
    "syntax_highlighting": "github",
    "math_renderer": "katex"
  },

  "history": {
    "tracking_enabled": true,
    "versions_file": "history/versions.json"
  },

  "annotations": {
    "enabled": true,
    "file": "annotations/annotations.json"
  },

  "extensions": {
    "custom-extension": {
      "version": "1.0.0",
      "config": {}
    }
  }
}
```

### Field Semantics

#### mdx_version

Semantic version of the MDX specification this document conforms to.

```
mdx_version: "1.0.0"
           │  │  │
           │  │  └─ Patch: backward-compatible bug fixes
           │  └─ Minor: backward-compatible additions
           └─ Major: breaking changes
```

**Compatibility rules:**
- Readers SHOULD attempt to read documents with higher minor/patch versions
- Readers MAY reject documents with higher major versions
- Writers MUST use the lowest version that supports all used features

#### document.id

RFC 4122 UUID identifying this document.

```
Format: xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx
        │             │    │
        │             │    └─ Variant (8, 9, A, or B)
        │             └─ Version (1-5)
        └─ Hex digits (lowercase)
```

**Generation:**
- Use version 4 (random) UUIDs for new documents
- Preserve ID when saving modified documents
- Generate new ID only when creating a derivative work

#### Timestamps

All timestamps use ISO 8601 format with UTC timezone:

```
2026-01-10T14:30:00Z
│          │        │
│          │        └─ UTC indicator (required)
│          └─ Time (HH:MM:SS)
└─ Date (YYYY-MM-DD)
```

**Precision:**
- Minimum: seconds (`2026-01-10T14:30:00Z`)
- Optional: milliseconds (`2026-01-10T14:30:00.123Z`)
- Maximum: microseconds (`2026-01-10T14:30:00.123456Z`)

#### document.language

BCP 47 language tag:

```
en          # English
en-US       # American English
zh-Hans     # Simplified Chinese
pt-BR       # Brazilian Portuguese
```

#### document.version

Semantic version for document content (distinct from `mdx_version`):

```
1.2.3
│ │ │
│ │ └─ Patch: typo fixes, minor corrections
│ └─ Minor: content additions, clarifications
└─ Major: significant restructuring, breaking changes
```

---

## Asset Registry

### Asset Entry Structure

```json
{
  "path": "assets/images/photo.jpg",
  "type": "image/jpeg",
  "size": 245678,
  "hash": "sha256:abc123...",
  "metadata": {
    "alt_text": "A scenic mountain view",
    "width": 1920,
    "height": 1080,
    "caption": "Photo taken at Mount Example",
    "credit": "Photographer Name"
  }
}
```

### MIME Type Reference

| Category | Extension | MIME Type |
|----------|-----------|-----------|
| **Images** | .png | image/png |
| | .jpg, .jpeg | image/jpeg |
| | .gif | image/gif |
| | .webp | image/webp |
| | .svg | image/svg+xml |
| | .avif | image/avif |
| **Video** | .mp4 | video/mp4 |
| | .webm | video/webm |
| | .ogg | video/ogg |
| **Audio** | .mp3 | audio/mpeg |
| | .ogg | audio/ogg |
| | .wav | audio/wav |
| | .flac | audio/flac |
| **3D Models** | .gltf | model/gltf+json |
| | .glb | model/gltf-binary |
| | .stl | model/stl |
| | .obj | model/obj |
| **Documents** | .pdf | application/pdf |
| **Data** | .csv | text/csv |
| | .json | application/json |
| | .parquet | application/vnd.apache.parquet |
| **Fonts** | .woff2 | font/woff2 |
| | .woff | font/woff |
| | .ttf | font/ttf |
| | .otf | font/otf |

### Hash Format

```
algorithm:hex_digest

sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
│      │
│      └─ 64 hex characters (256 bits)
└─ Algorithm identifier
```

**Supported algorithms:**
- `sha256` (recommended)
- `sha384`
- `sha512`
- `md5` (legacy, not recommended)

---

## Extended Markdown Syntax

### Directive Format

MDX extends CommonMark with generic directives (proposed CommonMark extension):

```
::directive[inline content]{key="value" key2="value2"}

:::directive{key="value"}
Block content here
:::
```

### Standard Directives

#### Video

```markdown
::video[Video Title]{src="assets/video/demo.mp4" poster="assets/images/thumb.png" controls autoplay muted loop}
```

| Attribute | Required | Description |
|-----------|----------|-------------|
| src | Yes | Path to video file |
| poster | No | Thumbnail image path |
| controls | No | Show playback controls |
| autoplay | No | Start playing automatically |
| muted | No | Mute audio |
| loop | No | Loop playback |
| width | No | Display width |
| height | No | Display height |

#### Audio

```markdown
::audio[Audio Title]{src="assets/audio/narration.mp3" controls}
```

#### 3D Model

```markdown
::model[Model Title]{src="assets/models/part.gltf" camera="front" controls ar}
```

| Attribute | Description |
|-----------|-------------|
| camera | Initial camera position: front, back, top, bottom, left, right, isometric |
| controls | Enable orbit controls |
| ar | Enable AR view (mobile) |
| autorotate | Auto-rotate model |
| environment | Environment map for reflections |

#### Data Visualization

```markdown
::data[Chart Title]{src="assets/data/stats.csv" type="bar" x="category" y="value"}
```

| Attribute | Description |
|-----------|-------------|
| type | Chart type: bar, line, pie, scatter, table |
| x | Column for X axis |
| y | Column for Y axis |
| color | Column for color coding |
| label | Column for labels |

#### Embedded Document

```markdown
::embed[PDF Title]{src="assets/documents/appendix.pdf" page="1"}
```

---

## Annotations Format

### W3C Web Annotation Model

Annotations follow the [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/):

```json
{
  "annotations": [
    {
      "@context": "http://www.w3.org/ns/anno.jsonld",
      "id": "urn:uuid:annotation-id",
      "type": "Annotation",
      "motivation": "commenting",
      "created": "2026-01-10T12:00:00Z",
      "modified": "2026-01-10T14:00:00Z",
      "creator": {
        "id": "urn:uuid:user-id",
        "type": "Person",
        "name": "Reviewer Name",
        "email": "reviewer@example.com"
      },
      "target": {
        "source": "document.md",
        "selector": {
          "type": "TextQuoteSelector",
          "exact": "text being annotated",
          "prefix": "context before ",
          "suffix": " context after"
        }
      },
      "body": {
        "type": "TextualBody",
        "value": "This is the annotation comment.",
        "format": "text/plain"
      }
    }
  ]
}
```

### Selector Types

#### TextQuoteSelector

Matches text by content:

```json
{
  "type": "TextQuoteSelector",
  "exact": "matched text",
  "prefix": "10-30 chars before",
  "suffix": "10-30 chars after"
}
```

#### TextPositionSelector

Matches by character offset:

```json
{
  "type": "TextPositionSelector",
  "start": 100,
  "end": 150
}
```

#### FragmentSelector

Matches by fragment identifier:

```json
{
  "type": "FragmentSelector",
  "value": "section-3",
  "conformsTo": "http://tools.ietf.org/rfc/rfc3236"
}
```

### Motivation Values

| Motivation | Use Case |
|------------|----------|
| `commenting` | General discussion |
| `highlighting` | Visual emphasis without comment |
| `editing` | Suggested change |
| `questioning` | Request for clarification |
| `bookmarking` | Personal marker |
| `describing` | Descriptive note |
| `classifying` | Categorization/tagging |
| `linking` | Cross-reference |

---

## Version History

### versions.json Structure

```json
{
  "versions": [
    {
      "version": "1.0.0",
      "timestamp": "2026-01-01T00:00:00Z",
      "author": {
        "name": "Author Name",
        "email": "author@example.com"
      },
      "message": "Initial release",
      "snapshot": "history/snapshots/v1.0.0.md",
      "type": "full",
      "parent": null
    },
    {
      "version": "1.1.0",
      "timestamp": "2026-01-05T00:00:00Z",
      "author": {
        "name": "Author Name"
      },
      "message": "Added new section",
      "snapshot": "history/snapshots/v1.1.0.diff",
      "type": "diff",
      "parent": "1.0.0"
    }
  ],
  "current": "1.1.0",
  "branching": {
    "enabled": false
  }
}
```

### Snapshot Types

| Type | Description | Storage |
|------|-------------|---------|
| `full` | Complete document state | Full markdown file |
| `diff` | Changes from parent | Unified diff format |
| `reference` | Points to external version | URL or document ID |

---

## Extension System

### Extension Directory Structure

```
extensions/
└── my-extension/
    ├── extension.json
    ├── data/
    │   └── custom-data.json
    └── assets/
        └── extension-asset.png
```

### extension.json

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "Adds custom functionality",
  "author": "Extension Author",
  "homepage": "https://example.com/extension",
  "requires": {
    "mdx_version": ">=1.0.0"
  },
  "provides": {
    "directives": ["custom-directive"],
    "metadata": ["custom-field"]
  },
  "config": {
    "option1": "default-value"
  }
}
```

### Extension Isolation

Extensions:
- MUST only write to their own directory
- MUST NOT modify core document files
- SHOULD be removable without breaking the document
- MAY add custom directives (prefixed with extension ID)

---

## Security Considerations

### Content Security

| Threat | Mitigation |
|--------|------------|
| Path traversal | Validate all paths, reject `..` |
| ZIP bombs | Limit extraction size and ratio |
| Script injection | Sandbox JavaScript execution |
| XXE attacks | Disable external entity resolution |
| Malicious fonts | Validate font files before use |

### Validation Checklist

```python
def security_check(mdx_path):
    with zipfile.ZipFile(mdx_path, 'r') as mdx:
        for info in mdx.infolist():
            # Path traversal
            if '..' in info.filename or info.filename.startswith('/'):
                raise SecurityError(f"Invalid path: {info.filename}")

            # ZIP bomb (compression ratio)
            if info.compress_size > 0:
                ratio = info.file_size / info.compress_size
                if ratio > 100:
                    raise SecurityError(f"Suspicious compression ratio: {ratio}")

            # Absolute paths
            if os.path.isabs(info.filename):
                raise SecurityError(f"Absolute path: {info.filename}")
```

### Script Sandboxing

If executing `scripts/` content:

1. Use iframe sandbox with minimal permissions
2. Disable network access
3. Limit DOM access to document content
4. Set execution timeout
5. Disable eval() and Function()

---

## Compatibility Notes

### Cross-Platform

| Issue | Solution |
|-------|----------|
| Line endings | Use LF (`\n`) in all text files |
| Path separators | Always use forward slash (`/`) |
| Case sensitivity | Treat paths as case-sensitive |
| Character encoding | UTF-8 without BOM |
| Timestamps | UTC timezone (Z suffix) |

### Graceful Degradation

Readers encountering unknown content should:

1. **Unknown `mdx_version`**: Warn and attempt to read
2. **Unknown directives**: Display inline content as text
3. **Missing assets**: Show placeholder, continue rendering
4. **Unknown metadata fields**: Ignore and preserve
5. **Unknown extensions**: Ignore extension directory

---

## Reference

- [MDX Format Specification](../spec/MDX_FORMAT_SPECIFICATION.md) - Authoritative reference
- [Implementation Guide](implementation-guide.md) - Building readers/writers
- [W3C Web Annotation](https://www.w3.org/TR/annotation-model/) - Annotation format
- [CommonMark](https://commonmark.org/) - Markdown specification
