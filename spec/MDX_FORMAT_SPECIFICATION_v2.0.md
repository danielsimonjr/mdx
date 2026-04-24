# MDX Format Specification

## Version 2.0.0 — Draft

**Status**: Draft Specification
**Media Type**: `application/vnd.mdx-container+zip`
**File Extension**: `.mdx` (alternate: `.mdxc`)
**Magic Bytes**: Standard ZIP header (`PK\x03\x04`)
**Supersedes**: [v1.1.0](MDX_FORMAT_SPECIFICATION_v1.1.md)

---

## 1. Overview

MDX (Markdown eXtended Container) is an open document format that packages
Markdown content with embedded media assets into a single, portable, self-
contained archive. The format is designed to be universally readable,
gracefully degradable, streamable, and capable of rich interactivity when
processed by capable viewers.

### 1.1 What's New in v2.0

v2.0 is a **backward-compatible** expansion that elevates MDX from
"Markdown + media in a ZIP" to a genuine universal document format. All
v1.1 documents are valid v2.0 documents; all new v2.0 fields are
OPTIONAL.

Ten capability additions, each specified in its own section:

1. **Internationalization** (§8) — multi-locale content bundling
2. **Content-addressed storage** (§9) — optional `assets/by-hash/` with dedup + verifiable immutability
3. **Streaming-friendly archive ordering** (§10) — normalized file order so viewers can read metadata and content before media
4. **Computational cells** (§11) — `::cell` directive with cached outputs + kernel specs
5. **Transclusion** (§12) — `::include` directive for cross-file and cross-document composition
6. **Document profiles** (§13) — typed documents with machine-checkable structural requirements
7. **Rich accessibility model** (§14) — long descriptions, audio-description tracks, sign-language tracks, MathML fallbacks, content warnings, reading level
8. **Provenance and fork graph** (§15) — multiple parent versions, derived-from chain, Git-like history DAG
9. **Multiple signatures + decentralized identity** (§16) — `signatures[]` with roles, DIDs, and signature chains
10. **Responsive asset variants + content negotiation** (§17) — per-asset `variants[]` and document-level `content.variants[]`

### 1.2 Design Goals (unchanged from v1.x)

1. **Universal Accessibility** — any ZIP utility can extract the contents; any text editor can read the Markdown.
2. **Graceful Degradation** — basic renderers show text and standard images; advanced viewers unlock full interactivity.
3. **Web Standards Alignment** — embedded media types correspond to standard MIME types renderable in web browsers.
4. **Version Control Friendly** — text-based manifest and Markdown content enable meaningful diffs.
5. **Extensibility** — plugin architecture allows custom renderers and content types without breaking compatibility.
6. **Collaboration Support** — built-in structures for annotations, comments, and version history.

### 1.3 New design goals added in v2.0

7. **International by default** — a single archive can carry content in multiple locales with fallback resolution.
8. **Streamable** — archive byte-order lets viewers render text before media arrives.
9. **Verifiable identity** — content-addressed option + multi-signature chain prove who authored what.
10. **Composable** — documents can transclude content from siblings or other documents.
11. **Accessible by default** — accessibility metadata is a first-class top-level concern, not a bolt-on.

### 1.4 Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in RFC 2119.

### 1.5 Relationship to Existing Formats

| Format         | Strengths                         | MDX v2.0 Advantage                                             |
| -------------- | --------------------------------- | -------------------------------------------------------------- |
| DOCX           | Rich formatting, wide support     | Human-readable source, multi-locale, accessible by default     |
| PDF            | Print fidelity, universal viewing | Editable source, streamable, true interactivity, forkable      |
| 3D PDF         | Embedded 3D models                | Open format, modern 3D standards (glTF), no proprietary tools  |
| HTML           | Web-native, interactive           | Self-contained, offline-capable, version-controlled, signed    |
| EPUB           | E-book standard, i18n, a11y       | Simpler structure, computational cells, content-addressed      |
| Jupyter `.ipynb` | Computational notebooks         | Multi-asset container, collaboration, accessibility built-in   |
| Plain Markdown | Simple, readable                  | Bundled assets, rich metadata, collaboration, profiles         |

---

## 2. Archive Structure

An MDX v2.0 file is a standard ZIP archive (DEFLATE or STORE per entry) with this canonical structure:

```
document.mdx (ZIP container)
│
├── manifest.json              # REQUIRED: Document metadata and content inventory
├── document.md                # REQUIRED (unless content.variants or content.locales used): Primary Markdown content
│
├── locales/                   # OPTIONAL (§8): Localized entry points per BCP 47 tag
│   ├── es/
│   │   └── document.md
│   └── ja/
│       └── document.md
│
├── variants/                  # OPTIONAL (§17): Document-level variants (short/long, technical/layperson)
│   ├── short/
│   │   └── document.md
│   └── technical/
│       └── document.md
│
├── assets/                    # OPTIONAL (if assets exist): All embedded assets
│   ├── images/                # Raster and vector images
│   ├── video/                 # Video files and captions/descriptions
│   ├── audio/                 # Audio files and transcripts
│   ├── models/                # 3D model content
│   ├── documents/             # Embedded documents
│   ├── data/                  # Structured data files
│   ├── fonts/                 # Embedded fonts
│   ├── other/                 # Uncategorized assets
│   └── by-hash/               # OPTIONAL (§9): Content-addressed storage
│       └── sha256/
│           └── <digest>[.<ext>]
│
├── styles/                    # OPTIONAL: Presentation customization
│
├── scripts/                   # OPTIONAL: Interactive content (sandboxed)
│
├── kernels/                   # OPTIONAL (§11): Computational-cell kernel specs
│   └── <kernel-id>.json
│
├── history/                   # OPTIONAL: Version history (§15 extends v1.1 history)
│   ├── versions.json
│   ├── graph.json             # OPTIONAL (§15): Fork/merge DAG
│   └── snapshots/
│
├── annotations/               # OPTIONAL: Collaborative annotations
│
├── profiles/                  # OPTIONAL (§13): Local profile caches
│   └── <profile-id>.json
│
└── extensions/                # OPTIONAL: Plugin/extension data
```

### 2.1 Required Components

Every valid MDX v2.0 file MUST contain:

1. **`manifest.json`** at the archive root.
2. **A primary content file**. Exactly one of the following MUST resolve:
   - `content.entry_point` (default `document.md`), OR
   - If `content.locales` is present: a locale-specific entry point per §8, OR
   - If `content.variants` is present: a variant-specific entry point per §17.

### 2.2 Optional Components

All other directories are OPTIONAL but follow defined structures when present.

### 2.3 Path Conventions (unchanged from v1.1)

- All internal paths MUST use forward slashes (`/`).
- Paths are relative to the archive root.
- Path components MUST NOT contain: `< > : " | ? *`.
- Path components MUST NOT end with spaces or dots.
- Path components SHOULD use lowercase with hyphens.
- Maximum path length: 255 characters.

### 2.4 Archive Ordering (§10 makes this normative)

In v2.0, the ZIP local-file-header order MUST place small-and-critical entries first so a streaming reader can render text before media arrives:

1. `manifest.json`
2. Primary content file(s) referenced by `content.entry_point` (and all locale/variant entry points if applicable)
3. `styles/*.css`
4. `annotations/annotations.json` (if present)
5. All other assets in **increasing `size_bytes` order**

See §10 for rationale and the progressive-fetch pattern.

---

## 3. Manifest Schema

The `manifest.json` file is the heart of an MDX document. Section 3.1 shows the full v2.0 schema with all OPTIONAL sections populated. Section 3.3 shows the minimal valid manifest, which is unchanged from v1.1.

### 3.1 Full v2.0 Schema (illustrative)

```json
{
  "$schema": "https://mdx-format.org/schemas/manifest-v2.schema.json",
  "mdx_version": "2.0.0",

  "document": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "content_id": "blake3:1a2b3c...",
    "title": "Document Title",
    "subtitle": "Optional Subtitle",
    "description": "Brief description of the document",
    "authors": [
      { "name": "Author Name", "email": "author@example.com", "did": "did:web:author.example.com" }
    ],
    "contributors": [],
    "created": "2026-04-24T12:00:00Z",
    "modified": "2026-04-24T14:30:00Z",
    "published": "2026-04-24T14:30:00Z",
    "version": "1.0.0",
    "language": "en-US",
    "license": { "type": "CC-BY-4.0", "url": "https://creativecommons.org/licenses/by/4.0/" },
    "copyright": "© 2026 Author Name",
    "keywords": ["documentation", "specification"],
    "category": "technical-documentation",
    "subject": "Software Specification",
    "cover_image": "assets/images/cover.png",

    "profile": "https://mdx-format.org/profiles/scientific-paper/v1",
    "derived_from": [
      { "id": "urn:mdx:doc:abc-123", "version": "2.1.0", "relation": "fork" }
    ],
    "accessibility": {
      "summary": "Text with captions and audio descriptions for all video.",
      "reading_level": "grade-11",
      "content_warnings": [],
      "features": ["captions", "audio-description", "long-description", "mathml"],
      "hazards": []
    }
  },

  "content": {
    "entry_point": "document.md",
    "encoding": "UTF-8",
    "markdown_variant": "CommonMark",
    "markdown_version": "0.31",
    "extensions": [
      "tables", "footnotes", "task-lists", "math", "strikethrough", "autolinks",
      "attributes", "alignment",
      "include", "cell", "locales", "variants"
    ],
    "additional_files": [
      { "path": "appendix.md", "title": "Appendix A" }
    ],
    "includes": [
      { "id": "boilerplate", "target": "mdx://urn:mdx:doc:shared-legal/document.md" }
    ],
    "locales": {
      "default": "en-US",
      "available": [
        { "tag": "en-US", "entry_point": "document.md", "title": "Document Title" },
        { "tag": "es-ES", "entry_point": "locales/es/document.md", "title": "Título del Documento" },
        { "tag": "ja-JP", "entry_point": "locales/ja/document.md", "title": "文書タイトル" }
      ],
      "fallback": ["en-US"]
    },
    "variants": [
      { "id": "short", "entry_point": "variants/short/document.md", "audience": "executive-summary" },
      { "id": "technical", "entry_point": "variants/technical/document.md", "audience": "specialist" }
    ]
  },

  "assets": {
    "images": [
      {
        "path": "assets/images/figure-01.png",
        "content_hash": "sha256:a3f2b8c9...",
        "mime_type": "image/png",
        "size_bytes": 245760,
        "width": 1920,
        "height": 1080,
        "alt_text": "System architecture diagram",
        "accessibility": {
          "long_description": "A layered architecture diagram showing three tiers...",
          "long_description_path": "assets/images/figure-01.description.md"
        },
        "variants": [
          { "path": "assets/images/figure-01@2x.png", "width": 3840, "height": 2160, "density": "2x" },
          { "path": "assets/images/figure-01.avif", "mime_type": "image/avif", "formats": ["avif"] },
          { "path": "assets/images/figure-01.webp", "mime_type": "image/webp", "formats": ["webp"] }
        ]
      }
    ],
    "video": [
      {
        "path": "assets/video/demo.mp4",
        "content_hash": "sha256:b4e3c9d0...",
        "mime_type": "video/mp4",
        "size_bytes": 15728640,
        "width": 1920,
        "height": 1080,
        "duration_seconds": 120.5,
        "captions": [
          { "path": "assets/video/demo.en.vtt", "language": "en", "label": "English", "kind": "subtitles", "default": true }
        ],
        "accessibility": {
          "audio_description_track": "assets/video/demo.en.ad.mp3",
          "sign_language_track": "assets/video/demo.en.asl.mp4",
          "extended_descriptions": "assets/video/demo.en.ext.vtt"
        }
      }
    ],
    "models": [],
    "documents": [],
    "data": [
      {
        "path": "assets/data/measurements.csv",
        "content_hash": "sha256:f8a9b0c1...",
        "mime_type": "text/csv",
        "size_bytes": 2048,
        "rows": 1500,
        "columns": 8,
        "has_header": true,
        "schema_ref": "assets/data/measurements.schema.json"
      }
    ],
    "fonts": [],
    "other": []
  },

  "styles": { "theme": "styles/theme.css" },
  "rendering": {
    "math_renderer": "katex",
    "table_of_contents": { "enabled": true, "depth": 3 }
  },

  "interactivity": {
    "scripts": [],
    "kernels": [
      { "id": "python3", "spec_path": "kernels/python3.json", "language": "python", "version": "3.11" }
    ],
    "required_capabilities": ["video"],
    "optional_capabilities": ["webgpu", "kernel:python3"],
    "fallback_behavior": "show-cached-output"
  },

  "collaboration": {
    "allow_annotations": true,
    "annotation_types": ["comment", "highlight", "suggestion", "question", "bookmark"]
  },

  "history": {
    "enabled": true,
    "versions_file": "history/versions.json",
    "graph_file": "history/graph.json",
    "snapshots_directory": "history/snapshots",
    "retention_policy": "all",
    "diff_format": "unified"
  },

  "security": {
    "integrity": { "algorithm": "sha256", "manifest_checksum": "sha256:..." },
    "signatures": [
      {
        "role": "author",
        "signer": { "name": "Author Name", "did": "did:web:author.example.com" },
        "algorithm": "Ed25519",
        "scope": "full-archive",
        "timestamp": "2026-04-24T14:30:00Z",
        "signature": "..."
      },
      {
        "role": "reviewer",
        "signer": { "name": "Peer Reviewer", "did": "did:key:z6Mk..." },
        "algorithm": "Ed25519",
        "scope": "manifest-only",
        "timestamp": "2026-04-24T16:00:00Z",
        "signature": "..."
      }
    ],
    "permissions": {
      "allow_external_links": true,
      "allow_external_images": false,
      "allow_scripts": true,
      "allow_kernels": false,
      "script_sandbox": "strict"
    }
  },

  "extensions": {},
  "custom": {}
}
```

### 3.2 Required Fields (unchanged from v1.1)

```json
{
  "mdx_version": "2.0.0",
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

### 3.3 Minimal Valid v2.0 Manifest

```json
{
  "mdx_version": "2.0.0",
  "document": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "My Document",
    "created": "2026-04-24T12:00:00Z",
    "modified": "2026-04-24T12:00:00Z"
  },
  "content": { "entry_point": "document.md" }
}
```

### 3.4 Backward Compatibility with v1.1

A valid v1.1 manifest with `mdx_version` updated to `"2.0.0"` is a valid v2.0 manifest. v2.0 viewers MUST accept `mdx_version` starting with `"1."` and treat such documents as v1.x.

Breaking changes: **none**. v2.0 adds fields; it does not modify or remove v1.1 fields. The `checksum` field on assets is retained as a deprecated alias for `content_hash`; viewers SHOULD accept either.

### 3.5 Field Definitions — Deltas from v1.1

This section lists only fields **added** in v2.0. For unchanged fields see v1.1 §3.4.

#### 3.5.1 Root Fields (additions)

| Field   | Type   | Section |
| ------- | ------ | ------- |
| *(none at root — additions are under existing sections)* | | |

#### 3.5.2 Document Fields (additions)

| Field             | Type         | Description                                                  |
| ----------------- | ------------ | ------------------------------------------------------------ |
| `content_id`      | string       | Content-addressed identifier of the document (see §9)        |
| `profile`         | URI string   | Profile URL defining document type requirements (see §13)    |
| `derived_from`    | array        | Source documents this was derived from (see §15)             |
| `accessibility`   | object       | Document-level accessibility metadata (see §14)              |

#### 3.5.3 Content Fields (additions)

| Field             | Type         | Description                                                  |
| ----------------- | ------------ | ------------------------------------------------------------ |
| `includes`        | array        | Transclusion targets the document depends on (see §12)       |
| `locales`         | object       | Multi-locale content bundle (see §8)                         |
| `variants`        | array        | Document-level variants for different audiences (see §17)    |

#### 3.5.4 Asset Fields (additions on every asset type)

| Field           | Type         | Description                                                    |
| --------------- | ------------ | -------------------------------------------------------------- |
| `content_hash`  | string       | Multihash-formatted content address (replaces/aliases `checksum`)|
| `accessibility` | object       | Per-asset accessibility metadata (see §14)                     |
| `variants`      | array        | Resolution/format alternatives for responsive delivery (§17)   |
| `locales`       | array        | Per-locale alternatives (e.g., translated alt-text, §8)        |

#### 3.5.5 Security Fields (changes)

- `signature` (singular) is DEPRECATED in favor of `signatures[]` (array).
  v2.0 viewers MUST accept either; v2.0 writers SHOULD emit `signatures[]`.
- New `signatures[].role`, `signatures[].signer.did`, `signatures[].scope`.

#### 3.5.6 History Fields (additions)

| Field        | Type   | Description                                          |
| ------------ | ------ | ---------------------------------------------------- |
| `graph_file` | string | Path to fork/merge DAG (see §15)                     |

#### 3.5.7 Interactivity Fields (additions)

| Field     | Type   | Description                                          |
| --------- | ------ | ---------------------------------------------------- |
| `kernels` | array  | Declared computational-cell kernels (see §11)        |

---

## 4. Markdown Content

### 4.1 Base Syntax (unchanged from v1.1)

MDX documents use CommonMark 0.31+ with recommended extensions: tables, strikethrough, autolinks, task lists, footnotes, math, definition lists, attributes, alignment (see v1.1 §4.4). v2.0 adds:

- **include** — transclusion directive (§12)
- **cell** — computational code cells (§11)
- **locales** — locale-aware Markdown content (§8)
- **variants** — audience-specific content variants (§17)

### 4.2 Asset Linking (unchanged from v1.1)

Images via `![alt](path)`; links via `[text](path)`; reference-style and extended directives all work as in v1.1. See v1.1 §4.2.

### 4.3 Standard Directives

v1.1 directives (`::video`, `::audio`, `::model`, `::embed`, `::data`, `::figure`, `::note`, `::details`, `::toc`) are **all retained**. v2.0 adds:

| Directive  | Purpose                    | Section |
| ---------- | -------------------------- | ------- |
| `::include`| Transclusion               | §12     |
| `::cell`   | Computational code cell    | §11     |

### 4.4 Block Attributes and Alignment (unchanged from v1.1)

All of §4.4 from v1.1 is retained verbatim: shorthand `{:.center}`, block attributes `{.class #id key="value"}`, container blocks `:::{.align-center}` (3+ colons), precedence rules (inline > block > container), graceful degradation.

### 4.5 Graceful Degradation (extended)

Beyond v1.1's rules, v2.0 degradations:

| Extended Syntax                  | Fallback Rendering                                                     |
| -------------------------------- | ---------------------------------------------------------------------- |
| `::include[target]`              | Link: "[Included: target]"                                             |
| `::cell{language=python}`        | Fenced code block (language tag preserved)                             |
| Locale-specific content          | Default locale's content                                               |
| Variants                         | First listed variant                                                   |
| Accessibility long-description   | Alt-text (always present for images)                                   |

---

## 5. Version History

Unchanged from v1.1 baseline; §15 extends with multi-parent versions and the fork graph.

---

## 6. Annotation System

Unchanged from v1.1. Annotations continue to use the W3C Web Annotation Data Model. v2.0 adds no new motivations; implementers MAY use custom motivations via the `@context` mechanism.

---

## 7. Security Considerations

Retains all v1.1 requirements. v2.0 adds:

- **Multi-signature chains** (§16) — `security.signatures[]`
- **DID-based signer identity** (§16) — `signer.did`
- **Content-addressed integrity** (§9) — `content_hash` supplements `checksum`
- **Kernel sandboxing** (§11) — same rules as script sandboxing apply to kernel execution
- **Transclusion trust** (§12) — transcluded content MUST be hash-pinned or marked untrusted

See §16 for full security model updates.

---

## 8. Internationalization (NEW in v2.0)

### 8.1 Overview

v2.0 supports multi-locale content bundling: a single archive can carry
content in multiple languages with language-aware asset alternatives
and deterministic locale-fallback resolution.

### 8.2 The `content.locales` Object

```json
"content": {
  "entry_point": "document.md",
  "locales": {
    "default": "en-US",
    "available": [
      { "tag": "en-US", "entry_point": "document.md", "title": "Document Title" },
      { "tag": "es-ES", "entry_point": "locales/es/document.md", "title": "Título del Documento" },
      { "tag": "ja-JP", "entry_point": "locales/ja/document.md", "title": "文書タイトル" }
    ],
    "fallback": ["en-US"]
  }
}
```

| Field       | Type    | Required | Description                                                     |
| ----------- | ------- | -------- | --------------------------------------------------------------- |
| `default`   | string  | YES      | BCP 47 tag of the default locale                                 |
| `available` | array   | YES      | One entry per supported locale                                   |
| `fallback`  | array   | NO       | Ordered fallback chain when no exact match found               |

Each entry in `available[]`:

| Field          | Type   | Required | Description                                         |
| -------------- | ------ | -------- | --------------------------------------------------- |
| `tag`          | string | YES      | BCP 47 language tag                                  |
| `entry_point`  | string | YES      | Path to that locale's `document.md`                  |
| `title`        | string | NO       | Localized document title                             |
| `cover_image`  | string | NO       | Localized cover image (may reuse default)            |

### 8.3 Asset Locale Alternatives

Any asset MAY carry a `locales[]` array with per-locale alternatives:

```json
{
  "path": "assets/images/chart.png",
  "locales": [
    { "tag": "en-US", "path": "assets/images/chart.png" },
    { "tag": "ja-JP", "path": "assets/images/chart.ja.png" }
  ]
}
```

Captions, transcripts, and audio description tracks follow the same
pattern via their existing `language` field.

### 8.4 Locale Resolution

A viewer MUST resolve the effective locale as:

1. User preference (if expressed)
2. First match in `available[]` against user's Accept-Language header / OS locale
3. Entries in `fallback[]` tried in order
4. `default`

### 8.5 Conformance

- Viewers at capability Level ≥ 0 MUST accept multi-locale documents and render at least the `default` locale.
- Viewers at Level ≥ 2 SHOULD respect user locale preference.
- Writers SHOULD include `default` in `fallback` for maximal compatibility.

---

## 9. Content-Addressed Storage (NEW in v2.0)

### 9.1 Overview

Assets MAY be stored under content-addressed paths (`assets/by-hash/<algo>/<digest>`) in addition to or instead of human-readable paths. This enables deduplication within a document, cryptographic content binding, and cross-document transclusion.

### 9.2 Layout

```
assets/
├── by-hash/
│   └── sha256/
│       ├── a3f2b8c9d4e5...          # Raw content-addressed files
│       └── b4e3c9d0e1f2....mp4      # Extension optional, advisory only
└── images/
    └── figure-01.png                 # Human path; manifest says "aliases: 'sha256:a3f2b8c9...'"
```

Human-readable paths and content-addressed paths MAY coexist; when both refer to the same bytes, they SHOULD be the same ZIP entry (via `assets/images/figure-01.png` → symbolic reference declared in manifest) or two entries that MUST be byte-identical (writer's choice).

### 9.3 `content_hash` on Assets

Every asset MAY carry a `content_hash` field:

```json
{
  "path": "assets/images/figure-01.png",
  "content_hash": "sha256:a3f2b8c9d4e5..."
}
```

Format: `<algo>:<hex-digest>`, same as the `checksum` field. `content_hash` is semantically equivalent to `checksum` and supersedes it. Writers SHOULD emit both for backward compatibility; readers MUST accept either.

### 9.4 `document.content_id`

A document MAY declare a content-level identifier:

```json
"document": {
  "content_id": "blake3:1a2b3c4d..."
}
```

`content_id` is the hash of the canonical manifest (manifest with
`security.signatures` and `document.content_id` themselves excluded)
combined with the concatenation of asset `content_hash` values in
ZIP-order. Viewers MAY recompute and verify.

### 9.5 Conformance

- OPTIONAL for writers.
- Viewers SHOULD support reading assets via `assets/by-hash/<algo>/<digest>` paths.
- Viewers that verify `content_hash` MUST warn on mismatch.

---

## 10. Streaming and Delivery (NEW in v2.0)

### 10.1 Overview

ZIP supports random access via its central directory, but practical streaming requires small-and-critical entries to appear first in the local-file-header order so a viewer can render text while media downloads.

### 10.2 Normative Ordering

Valid v2.0 writers MUST order ZIP local file headers as:

1. `manifest.json`
2. Primary entry point(s) referenced by `content.entry_point`, plus all locale + variant entry points
3. `styles/` contents (alphabetical)
4. `annotations/annotations.json` (if present)
5. Small assets (text-like): `assets/data/*`, `assets/fonts/*`
6. All other assets in increasing `size_bytes` order

### 10.3 Progressive Fetch Pattern

A client streaming a v2.0 archive over HTTP:

1. Issue a `Range: bytes=0-65535` request (64 KB), parse the partial ZIP directory, locate `manifest.json` + entry point.
2. If needed, issue a second range for the entry point file.
3. Begin rendering text.
4. Fetch remaining entries lazily as the user scrolls or assets are referenced.

Viewers MAY implement this; writers MUST produce archives in an order that makes this possible.

### 10.4 Conformance

- Writers MUST emit the normative ordering.
- Viewers MAY implement progressive fetch; those that do SHOULD declare it in capability negotiation.
- A document with out-of-order entries is still valid (it's still a valid ZIP) but does not conform to v2.0's streaming requirement.

---

## 11. Computational Cells (NEW in v2.0)

### 11.1 Overview

MDX v2.0 treats executable code with cached outputs as first-class
content via the `::cell` directive. This brings Jupyter-class notebook
capability into the MDX container while preserving the universal,
offline-viewable property: the **cached output** is always renderable;
re-execution is an optional enhancement.

### 11.2 Syntax

```markdown
::cell{language="python" kernel="python3" execution_count=1}
```python
import numpy as np
x = np.linspace(0, 2*np.pi, 100)
y = np.sin(x)
print(y.mean())
```

::output{type="text"}
```
-1.0710910196693217e-17
```
::output{type="image" mime="image/png" src="assets/images/cell-1-fig.png"}
```

The outer `::cell{}` declares the cell. A single triple-backtick code
block inside holds the source. Zero or more `::output{}` blocks hold
the cached outputs.

### 11.3 Cell Attributes

| Attribute          | Description                                               |
| ------------------ | --------------------------------------------------------- |
| `language`         | Source language (python, r, julia, sql, bash, etc.)       |
| `kernel`           | Kernel ID referenced in `interactivity.kernels[]`         |
| `execution_count`  | Monotonic per-kernel execution ordinal                    |
| `frozen`           | Boolean: if true, re-execution is DISALLOWED              |
| `hash`             | Hash of source — invalidates cached output if source changes |

### 11.4 Output Blocks

| Output Type  | `type` value | Description                                      |
| ------------ | ------------ | ------------------------------------------------ |
| Text         | `"text"`     | Plain text output (stdout, return value)         |
| Error        | `"error"`    | Traceback / error output                         |
| Image        | `"image"`    | Rendered image; use `src` and `mime`             |
| HTML         | `"html"`     | Rich HTML output (sanitized by viewer)           |
| JSON         | `"json"`     | Structured data output                           |
| MIME         | `"mime"`     | Any other MIME type                              |

Output content is either inline (text/html/json/error) or referenced
via `src` (image/mime).

### 11.5 Kernel Specs

`interactivity.kernels[]`:

```json
{
  "id": "python3",
  "spec_path": "kernels/python3.json",
  "language": "python",
  "version": "3.11",
  "requirements": ["numpy>=1.25", "matplotlib>=3.8"]
}
```

The file at `spec_path` follows the Jupyter kernelspec convention.

### 11.6 Conformance

- Viewers at capability Level ≤ 1 MUST render cached outputs and MUST NOT attempt execution.
- Viewers at Level ≥ 2 MAY execute cells if the document is signed and the user consents.
- Writers MUST include at least one cached output per cell (even an empty text output) to preserve graceful degradation.

---

## 12. Transclusion (NEW in v2.0)

### 12.1 Overview

v2.0 introduces the `::include` directive for embedding content from another file (within the same archive) or from a sibling MDX document (external).

### 12.2 Syntax

```markdown
<!-- Include a local file -->
::include[path="appendix.md"]

<!-- Include a fragment (heading-anchored) from a local file -->
::include[path="chapter-2.md" fragment="#section-3"]

<!-- Include from an external MDX document (hash-pinned) -->
::include[target="mdx://urn:mdx:doc:shared-legal-text#preamble"]{content_hash="sha256:abc..."}
```

### 12.3 Declaration in Manifest

Includes SHOULD be declared in `content.includes[]` so streaming
fetchers can preload:

```json
"content": {
  "includes": [
    { "id": "legal-preamble", "target": "mdx://urn:mdx:doc:shared-legal/document.md#preamble", "content_hash": "sha256:abc..." }
  ]
}
```

### 12.4 Resolution Rules

1. `path="..."` — relative to archive root. MUST resolve within the archive.
2. `target="mdx://<doc-id>[/<path>][#<fragment>]"` — external MDX document by ID.
3. `target="https://..."` — external URL. MUST be declared in `security.permissions.allow_external_includes` (default false).
4. Circular includes MUST be detected and rejected.
5. Maximum transclusion depth: 8 (viewers MAY lower this limit).

### 12.5 Fragment Selectors

`#<fragment>` targets use CommonMark heading slugs unless the document
declares a different fragment scheme in `rendering.fragment_scheme`.

### 12.6 Conformance

- Viewers at Level ≥ 0 MUST render `::include` fallback as `[Included: <target>]` link.
- Viewers at Level ≥ 2 MUST resolve internal includes; MAY resolve external includes subject to security policy.
- Writers MUST pin external includes with `content_hash` or declare them as untrusted.

---

## 13. Document Profiles (NEW in v2.0)

### 13.1 Overview

A **profile** declares machine-checkable structural requirements for a
specific document type (scientific paper, recipe, API reference,
contract, etc.). Profiles enable domain-specific validation beyond
"is this valid Markdown?"

### 13.2 Declaration

```json
"document": {
  "profile": "https://mdx-format.org/profiles/scientific-paper/v1"
}
```

### 13.3 Profile Document Format

A profile is itself a JSON document declaring:

```json
{
  "id": "https://mdx-format.org/profiles/scientific-paper/v1",
  "name": "Scientific Paper",
  "version": "1.0.0",
  "required_sections": [
    { "heading_pattern": "^Abstract$", "level": 1 },
    { "heading_pattern": "^Introduction$", "level": 1 },
    { "heading_pattern": "^Methods$", "level": 1 },
    { "heading_pattern": "^Results$", "level": 1 },
    { "heading_pattern": "^Discussion$", "level": 1 },
    { "heading_pattern": "^References$", "level": 1 }
  ],
  "required_manifest_fields": [
    "document.authors",
    "document.keywords",
    "document.license"
  ],
  "required_extensions": ["math", "footnotes"],
  "recommended_extensions": ["cell"],
  "validation_rules": [
    { "rule": "min_authors", "value": 1 },
    { "rule": "require_doi_in_keywords_or_custom", "value": true }
  ]
}
```

### 13.4 Reference Profiles (mdx-format.org/profiles/)

The v2.0 spec ships two reference profiles:

- `scientific-paper/v1` — abstract, introduction, methods, results, discussion, references
- `api-reference/v1` — overview, authentication, endpoints, errors, examples, rate-limits

Additional community profiles (recipe, contract, slide-deck, etc.) MAY be registered.

### 13.5 Conformance

- Profiles are OPTIONAL.
- Viewers that support profiles SHOULD validate documents against their declared profile and surface warnings.
- Writers SHOULD include a reference profile for discoverable document types.

---

## 14. Rich Accessibility Model (NEW in v2.0)

### 14.1 Overview

v1.1 supported only `alt_text` on images and `captions[]` on video. v2.0 elevates accessibility to a top-level concern with per-document and per-asset metadata mirroring EPUB 3 Accessibility guidelines.

### 14.2 Document-Level `document.accessibility`

```json
"document": {
  "accessibility": {
    "summary": "All video includes captions and audio descriptions. Images have long descriptions. Math equations include MathML fallbacks.",
    "reading_level": "grade-11",
    "content_warnings": ["medical-imagery", "loud-audio"],
    "features": [
      "captions",
      "audio-description",
      "sign-language",
      "long-description",
      "mathml",
      "structural-navigation"
    ],
    "hazards": [],
    "api_compliance": ["WCAG-2.2-AA"]
  }
}
```

Feature vocabulary aligns with [EPUB Accessibility 1.1](https://www.w3.org/TR/epub-a11y-11/).

### 14.3 Per-Asset `accessibility` Object

Each asset type MAY carry an `accessibility` object. Common fields:

| Field                     | Applies to     | Description                                              |
| ------------------------- | -------------- | -------------------------------------------------------- |
| `long_description`        | image, figure  | Inline extended description (Markdown)                    |
| `long_description_path`   | image, figure  | Path to external long-description Markdown file           |
| `audio_description_track` | video          | Path to audio description track (MP3/WebM)                |
| `sign_language_track`     | video          | Path to sign-language interpretation video                |
| `extended_descriptions`   | video          | Path to extended-description VTT                          |
| `transcript`              | audio, video   | Path to text transcript (already in v1.1)                 |
| `mathml`                  | math directive | Inline MathML representation of LaTeX/TeX                 |
| `sonification`            | data           | Path to audio representation of data (charts → sound)     |
| `tactile_alternative`     | image, model   | Path to tactile/braille description                       |

### 14.4 Math Accessibility

Math directives SHOULD include a MathML alternative:

```markdown
::math[tex="E = mc^2" mathml="<math><mi>E</mi><mo>=</mo>..."]
```

When MathML is absent, viewers MUST provide at least the source TeX as accessible text.

### 14.5 Conformance

- Writers targeting WCAG 2.2 AA MUST populate `document.accessibility.features` honestly.
- Viewers at Level ≥ 3 MUST surface accessibility metadata in their UI.
- Claims in `api_compliance` without matching feature declarations MAY be flagged as invalid by validators.

---

## 15. Provenance and Fork Graph (NEW in v2.0)

### 15.1 Overview

v1.1 version history is strictly linear (each version has one `parent_version`). v2.0 supports forks, merges, and upstream-derivation chains.

### 15.2 `document.derived_from[]`

```json
"document": {
  "derived_from": [
    { "id": "urn:mdx:doc:upstream-abc", "version": "2.1.0", "relation": "fork" },
    { "id": "urn:mdx:doc:other-branch-xyz", "version": "1.3.2", "relation": "merge-source" }
  ]
}
```

| `relation` value    | Meaning                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `fork`              | Independent divergence from an upstream                          |
| `merge-source`      | Merged in content from this source                               |
| `translation-of`    | Translation derived from the source document                     |
| `derivative-work`   | Substantially reworked from this source (legal/copyright scope)  |

### 15.3 Multi-Parent Versions in `versions.json`

v1.1's single `parent_version` is extended to `parent_versions` (array). Viewers MUST accept either.

```json
{
  "version": "2.0.0",
  "timestamp": "2026-04-24T14:30:00Z",
  "parent_versions": ["1.5.0", "1.5.0-feature-branch"],
  "message": "Merged feature branch"
}
```

### 15.4 Optional `history/graph.json`

A full DAG representation suitable for rendering fork/merge history:

```json
{
  "schema_version": "1.0.0",
  "nodes": [
    { "id": "v1.0.0", "version": "1.0.0", "timestamp": "..." },
    { "id": "v1.5.0-feature", "version": "1.5.0-feature-branch", "timestamp": "..." }
  ],
  "edges": [
    { "from": "v1.0.0", "to": "v1.5.0-feature", "type": "fork" },
    { "from": "v1.5.0-feature", "to": "v2.0.0", "type": "merge" }
  ]
}
```

### 15.5 Conformance

- Writers MAY use either `parent_version` (string, v1.1-compatible) or `parent_versions` (array, v2.0-preferred).
- Viewers MUST accept both.
- The `graph.json` file is OPTIONAL; when present, `history.graph_file` MUST point at it.

---

## 16. Multi-Signature + Decentralized Identity (NEW in v2.0)

### 16.1 Overview

v1.1's single `security.signature` is replaced with `security.signatures[]`, enabling multi-party attestation (author + reviewer + publisher + notary) and decentralized signer identity via W3C DIDs.

### 16.2 `security.signatures[]`

```json
"security": {
  "signatures": [
    {
      "role": "author",
      "signer": { "name": "Alice", "did": "did:web:alice.example.com", "key_id": "k1" },
      "algorithm": "Ed25519",
      "scope": "full-archive",
      "canonicalization": "jcs",
      "timestamp": "2026-04-24T14:30:00Z",
      "signature": "..."
    },
    {
      "role": "reviewer",
      "signer": { "name": "Bob", "did": "did:key:z6Mk..." },
      "algorithm": "Ed25519",
      "scope": "manifest-only",
      "canonicalization": "jcs",
      "timestamp": "2026-04-24T16:00:00Z",
      "signature": "..."
    }
  ]
}
```

| Field              | Description                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| `role`             | One of: `author`, `reviewer`, `editor`, `publisher`, `notary`, or custom URI |
| `signer`           | Identity object with `name` + OPTIONAL `did` / `email` / `url` / `key_id`    |
| `algorithm`        | `Ed25519` (preferred), `RS256`, `ES256`                                      |
| `scope`            | `manifest-only` \| `manifest-and-content` \| `full-archive`                  |
| `canonicalization` | `jcs` (JSON Canonicalization Scheme, RFC 8785) for manifest hashing         |
| `timestamp`        | ISO 8601 timestamp when signed                                              |
| `signature`        | Base64-encoded signature bytes                                              |
| `revocation_url`   | OPTIONAL: URL to check for revocation                                       |

### 16.3 Signature Chains

Signatures MAY depend on each other via `prev_signature` (hash of the prior signature entry). This creates a chain where the reviewer's signature covers the author's signature:

```json
{
  "role": "reviewer",
  "prev_signature": "sha256:<hash of author signature entry>"
}
```

### 16.4 DID Support

Signer identities MAY be DIDs (Decentralized Identifiers per W3C
DID-Core). Viewers MAY resolve DIDs to verify public keys via the
DID method's resolver.

### 16.5 Backward Compat

- `security.signature` (singular v1.1 field) is DEPRECATED but still accepted.
- Viewers encountering a v1.1 `signature` object SHOULD treat it as `signatures[0]` with `role: "author"` and `scope: "manifest-only"`.

### 16.6 Conformance

- Writers SHOULD emit `signatures[]` with at least `role` and `algorithm`.
- Viewers MUST verify signatures if they display a "signed" indicator.
- Viewers SHOULD display ALL signatures when multiple are present with their roles.

---

## 17. Responsive Variants + Content Negotiation (NEW in v2.0)

### 17.1 Overview

v2.0 introduces two forms of variant selection:

- **Asset variants** — per-asset alternatives for different resolutions, formats, or media conditions (think HTML `<picture>` / `srcset`).
- **Document variants** — entire alternative `document.md` files for different audiences (short vs. long, technical vs. layperson).

### 17.2 Asset Variants

Every asset MAY have a `variants[]` array:

```json
{
  "path": "assets/images/hero.png",
  "mime_type": "image/png",
  "variants": [
    {
      "path": "assets/images/hero@2x.png",
      "density": "2x",
      "width": 3840,
      "height": 2160
    },
    {
      "path": "assets/images/hero.avif",
      "mime_type": "image/avif",
      "formats": ["avif"],
      "size_bytes": 84000
    },
    {
      "path": "assets/images/hero-mobile.png",
      "media_conditions": "(max-width: 600px)",
      "width": 800
    }
  ]
}
```

Viewers select the best variant per:

1. Explicit user preference (e.g., "save data" mode)
2. `media_conditions` matching viewport
3. `formats` — prefer newer/smaller formats the viewer supports
4. `density` for display-density matching
5. Default asset `path` as fallback

### 17.3 Document Variants

`content.variants[]`:

```json
"content": {
  "variants": [
    { "id": "default", "entry_point": "document.md", "audience": "general" },
    { "id": "short", "entry_point": "variants/short/document.md", "audience": "executive-summary" },
    { "id": "technical", "entry_point": "variants/technical/document.md", "audience": "specialist" }
  ]
}
```

Viewers MAY present a chooser; default is the first entry or the one with `id: "default"`.

Variants MAY reference the same assets but with different Markdown. Think of them as different "cuts" of the same content.

### 17.4 Combining with Locales

A document MAY have BOTH variants and locales. The resolution order is:

1. Locale match first (§8.4)
2. Variant selection within the chosen locale
3. Asset-variant selection within the chosen document

### 17.5 Conformance

- Writers MAY provide variants. OPTIONAL.
- Viewers at Level ≥ 2 SHOULD respect `media_conditions` and `formats`.
- Viewers that do not support variants MUST fall back to the default asset path.

---

## 18. MIME Types and File Associations (unchanged from v1.1)

See v1.1 §8 for MIME types, file extensions, and embedded-MIME inventory. v2.0 adds no new embedded MIME types; `.mdx` and `.mdxc` remain the container extensions.

---

## 19. Viewer Implementation Guidelines

### 19.1 Capability Levels (updated for v2.0)

| Level | Name          | Capabilities                                                                                |
| ----- | ------------- | ------------------------------------------------------------------------------------------- |
| 0     | Basic         | Markdown rendering, standard images, default locale                                         |
| 1     | Media         | Level 0 + video/audio playback, PDF embedding, cached cell outputs                          |
| 2     | Interactive  | Level 1 + 3D models, data visualization, scripts, responsive variants, locale preference    |
| 3     | Collaborative | Level 2 + annotations, version history, real-time sync, accessibility surfacing             |
| 4     | Advanced      | Level 3 + alignment attributes, custom styling, transclusion, multi-signature verification  |
| 5     | Notebook      | Level 4 + kernel execution, live cell re-run, fork graph visualization                      |

### 19.2 Graceful Degradation (unchanged baseline from v1.1)

v1.1 rules retained. v2.0 additions:

- Unsupported locale → render default locale
- Unsupported variant → render first variant listed
- Unsupported `::include` → render as link
- Unsupported `::cell` → render source code as fenced code block with cached output inline
- Unsupported content-addressed path → fall back to human-readable path
- Multi-signature → show "signed by N parties" summary; click for details

### 19.3 Accessibility (extends v1.1 §9.3)

Viewers MUST:

1. Support screen readers (proper ARIA attributes)
2. Respect user font size preferences
3. Support keyboard navigation
4. Provide alternative text for all images
5. Support captions/transcripts for audio/video
6. **NEW**: Surface `document.accessibility.features` and `content_warnings`
7. **NEW**: Offer to render long descriptions when present
8. **NEW**: For `api_compliance` claims, verify the declared features are present

---

## 20. Conformance

### 20.1 Document Conformance

A conforming v2.0 MDX document MUST:

1. Be a valid ZIP archive.
2. Contain `manifest.json` at the root with all required fields (§3.2).
3. Contain the file(s) specified in `content.entry_point` (or per locale/variant resolution).
4. Use valid paths for all asset references.
5. Emit the normative archive ordering (§10.2).
6. Use valid v1.1-style attribute syntax for alignment (unchanged).

A conforming v2.0 MDX document SHOULD:

1. Include `content_hash` for all assets (in addition to or instead of `checksum`).
2. Include `document.accessibility.features` matching the actual content.
3. Declare all transclusion targets in `content.includes[]`.
4. Include a cached output for every `::cell` (graceful degradation).
5. Use `signatures[]` instead of deprecated `signature`.

### 20.2 Viewer Conformance

A conforming v2.0 viewer MUST:

1. Parse and validate `manifest.json` against the v2.0 schema.
2. Render CommonMark markdown including the v1.1 extensions.
3. Accept v1.1 documents (backward compat).
4. Provide graceful degradation for unsupported features.
5. Never execute scripts or cell kernels without explicit user consent.
6. Support at minimum the default locale.

A conforming v2.0 viewer SHOULD:

1. Respect user locale preference (§8.4).
2. Verify signatures when asked to display signed-status.
3. Display `document.accessibility` information.
4. Resolve internal transclusions (§12.4).
5. Fall back gracefully on unsupported asset variants.

### 20.3 Conformance Testing

Reference test documents for v2.0 features are under `tests/v2.0/`:

1. Multi-locale document — `tests/v2.0/locales-basic/`
2. Content-addressed assets — `tests/v2.0/content-addressed/`
3. Computational cells — `tests/v2.0/cells-python/`
4. Transclusion — `tests/v2.0/transclusion/`
5. Document profiles — `tests/v2.0/profile-scientific-paper/`
6. Accessibility-rich document — `tests/v2.0/accessibility-full/`
7. Multi-parent version history — `tests/v2.0/fork-graph/`
8. Multi-signature — `tests/v2.0/multi-sig/`
9. Responsive variants — `tests/v2.0/variants-responsive/`

Alignment fixture tests from v1.1 (`tests/alignment/`) MUST continue to pass against v2.0 viewers.

---

## 21. Migration Guide: v1.1 → v2.0

### 21.1 What works unchanged

- All v1.1 syntax (directives, alignment, block attributes, containers).
- The manifest schema: a v1.1 manifest with `mdx_version` updated to `"2.0.0"` is valid.
- All v1.1 CI checks, validators, and fixtures.

### 21.2 Recommended migrations

When updating a v1.1 document to v2.0:

1. Bump `mdx_version` to `"2.0.0"`.
2. Rename `security.signature` → `security.signatures[]` (wrap in array; move `signed_by` → `signer`).
3. Rename asset `checksum` → `content_hash` (keeping `checksum` as an alias if writers still emit both).
4. If documenting accessibility: populate `document.accessibility`.
5. If the document is a known type: declare `document.profile`.
6. If the archive is large: verify writer emits normative ordering (§10.2).

### 21.3 Breaking changes

**None.** v2.0 is intentionally backward-compatible. Future versions may deprecate v1.1 fields after a grace period.

---

## Appendix A: JSON Schema

The complete v2.0 JSON Schema for manifest validation is available at
[`manifest-v2.schema.json`](manifest-v2.schema.json). The v1.1 schema
remains available at [`manifest.schema.json`](manifest.schema.json).

## Appendix B: Examples

Reference implementations and example v2.0 documents are under
`examples/v2/` and `implementations/`.

## Appendix C: Changelog

### Version 2.0.0 (Draft)

- **Added** internationalization (§8): `content.locales` multi-locale bundle, per-asset locale alternatives, locale fallback resolution
- **Added** content-addressed storage (§9): `assets/by-hash/` layout, `content_hash` on assets, `document.content_id`
- **Added** streaming-friendly archive ordering (§10): normative ZIP order, progressive-fetch pattern
- **Added** computational cells (§11): `::cell` directive, `::output` blocks, `interactivity.kernels[]`
- **Added** transclusion (§12): `::include` directive, `content.includes[]`, hash-pinned external includes
- **Added** document profiles (§13): `document.profile` URI, reference profiles registry
- **Added** rich accessibility model (§14): `document.accessibility` top-level, per-asset accessibility objects, MathML fallbacks, audio/sign-language tracks
- **Added** provenance and fork graph (§15): `derived_from[]`, multi-parent versions, optional `graph.json`
- **Added** multi-signature + DID identity (§16): `security.signatures[]` array, signature chains, DID-based signer identity
- **Added** responsive variants (§17): asset `variants[]`, document `content.variants[]`, media-condition and format selection
- **Deprecated** asset `checksum` in favor of `content_hash` (both still accepted)
- **Deprecated** `security.signature` (singular) in favor of `security.signatures[]` (both still accepted)
- **Deprecated** single `parent_version` in favor of `parent_versions[]` array (both still accepted)
- **Updated** capability levels to include Level 5 (Notebook)
- **Updated** viewer conformance to require multi-locale support at Level ≥ 0

### Version 1.1.0 (Draft)

See [MDX_FORMAT_SPECIFICATION_v1.1.md](MDX_FORMAT_SPECIFICATION_v1.1.md).

---

## License

This specification is released under CC-BY-4.0 (Creative Commons
Attribution 4.0 International).
