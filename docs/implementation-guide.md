# MDX Implementation Guide

This guide walks you through building an MDX reader/writer in any programming language.

## Prerequisites

You'll need:
- A ZIP library that supports DEFLATE compression
- A JSON parser
- A Markdown parser (for rendering; optional for extraction-only tools)

## Part 1: Reading MDX Files

### Step 1: Open the Archive

MDX files are standard ZIP archives. Open them with your language's ZIP library.

```python
# Python
import zipfile
with zipfile.ZipFile('document.mdx', 'r') as mdx:
    # ...
```

```typescript
// TypeScript (JSZip)
import JSZip from 'jszip';
const zip = await JSZip.loadAsync(arrayBuffer);
```

```go
// Go
import "archive/zip"
reader, err := zip.OpenReader("document.mdx")
```

### Step 2: Read the Manifest

The manifest is always at the archive root as `manifest.json`.

```python
manifest_data = mdx.read('manifest.json')
manifest = json.loads(manifest_data)
```

**Required manifest fields:**
```json
{
  "mdx_version": "1.0.0",
  "document": {
    "id": "uuid-here",
    "title": "Document Title",
    "created": "2026-01-10T12:00:00Z",
    "modified": "2026-01-10T12:00:00Z"
  },
  "content": {
    "entry_point": "document.md"
  }
}
```

**Validation rules:**
- `mdx_version` MUST be present and follow semver (e.g., "1.0.0")
- `document.id` MUST be a valid UUID (RFC 4122)
- `document.title` MUST be a non-empty string
- Timestamps MUST be ISO 8601 format with UTC timezone (Z suffix)
- `content.entry_point` defaults to "document.md" if not specified

### Step 3: Read the Content

```python
entry_point = manifest.get('content', {}).get('entry_point', 'document.md')
content = mdx.read(entry_point).decode('utf-8')
```

### Step 4: Resolve Asset References

Markdown content references assets with relative paths:

```markdown
![Diagram](assets/images/diagram.png)
```

Your reader should:
1. Parse the Markdown for asset references
2. Extract referenced assets from the ZIP
3. Either serve them (web) or write them to disk (CLI)

**Asset path patterns to handle:**
- `![alt](assets/images/file.png)` - Standard images
- `::video[title]{src="assets/video/file.mp4"}` - Extended directives
- `[link](assets/documents/file.pdf)` - Document links

### Step 5: Handle Extended Directives (Optional)

MDX extends CommonMark with custom directives:

| Directive | Purpose | Example |
|-----------|---------|---------|
| `::video` | Embedded video | `::video[Demo]{src="assets/video/demo.mp4"}` |
| `::audio` | Embedded audio | `::audio[Narration]{src="assets/audio/voice.mp3"}` |
| `::model` | 3D models | `::model[Part]{src="assets/models/part.gltf"}` |
| `::data` | Data visualization | `::data[Chart]{src="assets/data/stats.csv"}` |
| `::embed` | Embedded documents | `::embed[PDF]{src="assets/documents/file.pdf"}` |

Basic viewers can ignore these and show the bracketed text as a placeholder.

---

## Part 2: Writing MDX Files

### Step 1: Generate Document Metadata

```python
import uuid
from datetime import datetime, timezone

doc_id = str(uuid.uuid4())
timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
```

### Step 2: Build the Manifest

```python
manifest = {
    "mdx_version": "1.0.0",
    "document": {
        "id": doc_id,
        "title": "My Document",
        "created": timestamp,
        "modified": timestamp,
        "version": "1.0.0",
        "language": "en"
    },
    "content": {
        "entry_point": "document.md",
        "encoding": "UTF-8",
        "markdown_variant": "CommonMark"
    },
    "assets": {
        "images": [],
        "video": [],
        "audio": [],
        "models": [],
        "documents": [],
        "data": [],
        "fonts": [],
        "other": []
    }
}
```

### Step 3: Register Assets

Assets are organized by category. Add entries to the appropriate category array:

```python
image_asset = {
    "path": "assets/images/figure.png",
    "mime_type": "image/png",
    "size_bytes": 12345,
    "checksum": "sha256:abc123...",  # optional but recommended
    "alt_text": "A diagram showing the architecture",
    "width": 800,
    "height": 600
}
manifest["assets"]["images"].append(image_asset)
```

**Asset categories and their directories:**

| Category | Directory | Common MIME types |
|----------|-----------|-------------------|
| Images | `assets/images/` | image/png, image/jpeg, image/svg+xml, image/webp |
| Video | `assets/video/` | video/mp4, video/webm |
| Audio | `assets/audio/` | audio/mpeg, audio/ogg, audio/wav |
| 3D Models | `assets/models/` | model/gltf+json, model/gltf-binary |
| Documents | `assets/documents/` | application/pdf |
| Data | `assets/data/` | text/csv, application/json |
| Fonts | `assets/fonts/` | font/woff2, font/ttf |

### Step 4: Create the Archive

```python
import zipfile

with zipfile.ZipFile('output.mdx', 'w', zipfile.ZIP_DEFLATED) as mdx:
    # Add manifest
    mdx.writestr('manifest.json', json.dumps(manifest, indent=2))

    # Add content
    mdx.writestr('document.md', markdown_content)

    # Add assets
    for asset in assets:
        mdx.write(asset.local_path, asset.archive_path)
```

**Critical requirements:**
- Use DEFLATE compression (`ZIP_DEFLATED`)
- All internal paths use forward slashes (`/`), even on Windows
- `manifest.json` and `document.md` MUST be at the archive root
- Assets MUST be under their appropriate `assets/` subdirectory

---

## Part 3: Validation

### Required Validation Checks

```python
def validate_mdx(path):
    errors = []

    with zipfile.ZipFile(path, 'r') as mdx:
        # 1. Check required files exist
        names = mdx.namelist()
        if 'manifest.json' not in names:
            errors.append("Missing manifest.json")

        # 2. Parse and validate manifest
        try:
            manifest = json.loads(mdx.read('manifest.json'))
        except json.JSONDecodeError as e:
            errors.append(f"Invalid manifest JSON: {e}")
            return errors

        # 3. Check required fields
        if 'mdx_version' not in manifest:
            errors.append("Missing mdx_version")
        if 'document' not in manifest:
            errors.append("Missing document section")
        else:
            doc = manifest['document']
            if 'id' not in doc:
                errors.append("Missing document.id")
            if 'title' not in doc:
                errors.append("Missing document.title")

        # 4. Check entry point exists
        entry = manifest.get('content', {}).get('entry_point', 'document.md')
        if entry not in names:
            errors.append(f"Entry point '{entry}' not found")

        # 5. Check all registered assets exist
        assets = manifest.get('assets', {})
        for category, asset_list in assets.items():
            if isinstance(asset_list, list):
                for asset in asset_list:
                    if asset.get('path') and asset['path'] not in names:
                        errors.append(f"Asset '{asset['path']}' not found")

    return errors
```

### Warning-Level Checks

These aren't errors but should be flagged:

- Missing `document.version` (recommended for tracking)
- Missing `document.language` (helps with rendering)
- Assets without `alt_text` for images
- Large uncompressed assets (>10MB)
- Paths with backslashes (Windows artifacts)

---

## Part 4: Error Handling

### Graceful Degradation

Good MDX readers handle missing or malformed content gracefully:

| Situation | Recommended Behavior |
|-----------|---------------------|
| Missing optional manifest fields | Use sensible defaults |
| Unknown `mdx_version` | Warn but attempt to read |
| Unrecognized directive | Show directive text as placeholder |
| Missing asset file | Show placeholder, log warning |
| Corrupted asset | Skip asset, continue rendering |
| Invalid JSON in manifest | Fail with clear error message |

### Common Error Messages

```
MDX Error: Missing required file 'manifest.json'
MDX Error: Invalid manifest - missing 'document.title'
MDX Error: Entry point 'document.md' not found in archive
MDX Warning: Asset 'assets/images/fig1.png' referenced but not found
MDX Warning: Unknown mdx_version '2.0.0', attempting compatibility read
```

---

## Part 5: Advanced Features

### Annotations (Optional)

Annotations follow the W3C Web Annotation Data Model:

```json
{
  "annotations": [
    {
      "id": "anno-001",
      "type": "Annotation",
      "motivation": "commenting",
      "created": "2026-01-10T12:00:00Z",
      "creator": { "name": "Reviewer" },
      "target": {
        "selector": {
          "type": "TextQuoteSelector",
          "exact": "specific text to annotate"
        }
      },
      "body": {
        "type": "TextualBody",
        "value": "This needs clarification."
      }
    }
  ]
}
```

Store in `annotations/annotations.json`.

### Version History (Optional)

```json
{
  "versions": [
    {
      "version": "1.0.0",
      "timestamp": "2026-01-01T00:00:00Z",
      "author": "Author Name",
      "message": "Initial version",
      "snapshot": "history/snapshots/v1.0.0.md",
      "type": "full"
    }
  ]
}
```

Store metadata in `history/versions.json`, snapshots in `history/snapshots/`.

### Extensions (Optional)

Third-party data goes under `extensions/{extension-id}/`:

```
extensions/
└── my-extension/
    ├── extension.json    # Extension metadata
    └── data.json         # Extension-specific data
```

---

## Complete Minimal Example

### Python Reader

```python
import zipfile
import json

def read_mdx(path):
    """Read an MDX file and return its contents."""
    with zipfile.ZipFile(path, 'r') as mdx:
        # Read manifest
        manifest = json.loads(mdx.read('manifest.json'))

        # Read content
        entry = manifest.get('content', {}).get('entry_point', 'document.md')
        content = mdx.read(entry).decode('utf-8')

        # Read assets from all categories
        assets = {}
        asset_inventory = manifest.get('assets', {})
        for category, asset_list in asset_inventory.items():
            if isinstance(asset_list, list):
                for asset in asset_list:
                    asset_path = asset.get('path')
                    if asset_path and asset_path in mdx.namelist():
                        assets[asset_path] = mdx.read(asset_path)

        return {
            'manifest': manifest,
            'content': content,
            'assets': assets
        }
```

### Python Writer

```python
import zipfile
import json
import uuid
from datetime import datetime, timezone

def write_mdx(path, title, content, assets=None):
    """Create a new MDX file."""
    assets = assets or []
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    manifest = {
        "mdx_version": "1.0.0",
        "document": {
            "id": str(uuid.uuid4()),
            "title": title,
            "created": timestamp,
            "modified": timestamp
        },
        "content": {
            "entry_point": "document.md"
        },
        "assets": {
            "images": [],
            "video": [],
            "audio": [],
            "models": [],
            "documents": [],
            "data": [],
            "fonts": [],
            "other": []
        }
    }

    # Map extensions to categories
    ext_to_category = {
        '.png': 'images', '.jpg': 'images', '.jpeg': 'images',
        '.gif': 'images', '.svg': 'images', '.webp': 'images',
        '.mp4': 'video', '.webm': 'video',
        '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio',
        '.gltf': 'models', '.glb': 'models',
        '.pdf': 'documents',
        '.csv': 'data', '.json': 'data'
    }

    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as mdx:
        # Add assets first (to calculate manifest entries)
        for local_path, archive_path, mime_type in assets:
            with open(local_path, 'rb') as f:
                data = f.read()
            mdx.writestr(archive_path, data)

            # Determine category from file extension
            ext = '.' + archive_path.rsplit('.', 1)[-1].lower() if '.' in archive_path else ''
            category = ext_to_category.get(ext, 'other')

            manifest["assets"][category].append({
                "path": archive_path,
                "mime_type": mime_type,
                "size_bytes": len(data)
            })

        # Add manifest and content
        mdx.writestr('manifest.json', json.dumps(manifest, indent=2))
        mdx.writestr('document.md', content)

# Usage
write_mdx(
    'output.mdx',
    'My Document',
    '# Hello\n\nThis is my document.\n\n![Figure](assets/images/fig.png)',
    [('local/fig.png', 'assets/images/fig.png', 'image/png')]
)
```

---

## Testing Checklist

Before releasing your implementation:

- [ ] Can read the example document in `examples/`
- [ ] Can create a document that the web editor opens correctly
- [ ] Handles missing optional fields without crashing
- [ ] Produces valid ZIP files (test with standard tools)
- [ ] Uses forward slashes in all paths
- [ ] Generates valid UUIDs and timestamps
- [ ] Calculates correct file sizes for assets
- [ ] Preserves binary asset data without corruption

## Reference

- [Full Specification](../spec/MDX_FORMAT_SPECIFICATION.md)
- [TypeScript Implementation](../implementations/typescript/mdx_format.ts)
- [Python Implementation](../implementations/python/mdx_format.py)
