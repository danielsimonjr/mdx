# MDX Development Guide

Welcome to the MDX (Markdown eXtended Container) development documentation. This guide covers everything you need to build software that works with MDX files.

## Who Is This For?

| Guide | Audience |
|-------|----------|
| [Implementation Guide](implementation-guide.md) | Developers creating MDX readers/writers in any language |
| [Tool Builder Guide](tool-builder-guide.md) | Developers building converters, validators, and utilities |
| [Format Internals](format-internals.md) | Deep technical reference for the MDX format structure |
| [Contributing](../CONTRIBUTING.md) | Contributors to the MDX specification and reference implementations |

## Quick Orientation

MDX is fundamentally simple: it's a **ZIP file** containing **Markdown** plus **assets**. Every implementation follows this pattern:

```
┌─────────────────────────────────────────────────────────────┐
│                     document.mdx (ZIP)                      │
├─────────────────────────────────────────────────────────────┤
│  manifest.json  ──→  Metadata, asset registry, settings    │
│  document.md    ──→  Primary content (CommonMark + ext)    │
│  assets/        ──→  Images, video, audio, 3D models, data │
└─────────────────────────────────────────────────────────────┘
```

## Minimum Viable Implementation

To read an MDX file, you need:
1. A ZIP library
2. A JSON parser
3. A Markdown renderer (optional for extraction-only tools)

To write an MDX file, you additionally need:
1. A way to generate UUIDs
2. Timestamp formatting (ISO 8601)

That's it. No special dependencies, no complex protocols.

## Implementation Maturity Levels

When building MDX support, consider these tiers:

### Level 1: Basic Reader
- Extract ZIP contents
- Parse manifest.json
- Read document.md
- Resolve asset paths

### Level 2: Full Reader
- Render Markdown with extensions
- Display embedded images
- Handle extended directives (video, audio, 3D)
- Show annotations

### Level 3: Editor
- Create new documents
- Modify content and metadata
- Add/remove assets
- Manage version history

### Level 4: Collaboration Platform
- Real-time annotation sync
- Conflict resolution
- Version branching/merging
- Extension system

## Reference Implementations

| Language | Location | Features |
|----------|----------|----------|
| TypeScript | `implementations/typescript/mdx_format.ts` | Full read/write, browser + Node.js |
| Python | `implementations/python/mdx_format.py` | Document generation, validation |

Both implementations are well-documented and serve as authoritative examples.

## Key Decisions

When implementing MDX support, you'll face these choices:

### ZIP Library
- **Requirement**: Must support DEFLATE compression
- **Browser**: JSZip, fflate, zip.js
- **Node.js**: adm-zip, yazl/yauzl, archiver
- **Python**: Built-in `zipfile` module
- **Go**: `archive/zip` standard library
- **Rust**: `zip` crate

### Markdown Parser
- **Requirement**: CommonMark 0.31+ compliance
- **Recommended extensions**: Tables, footnotes, task lists, strikethrough
- **Extended directives**: Custom handling for `::video`, `::audio`, `::model`, etc.

### Asset Handling
- **In-memory**: Load all assets into memory (simple, works for small docs)
- **Streaming**: Read assets on-demand (better for large documents)
- **Caching**: Cache extracted assets for repeated access

## Testing Your Implementation

### Validation Checklist

```
□ Can read manifest.json from ZIP root
□ Can read document.md (or custom entry_point)
□ Correctly resolves relative asset paths
□ Handles missing optional fields gracefully
□ Validates mdx_version field
□ Generates valid manifest when writing
□ Produces valid ZIP with DEFLATE compression
□ Uses forward slashes in all internal paths
□ Generates RFC 4122 UUIDs for document IDs
□ Formats timestamps as ISO 8601 UTC
```

### Test Files

Use `examples/example-document.mdx` as a reference test file. You can also:

1. Create test documents with the Python script
2. Open your output in the web editor to verify
3. Use any ZIP utility to inspect structure

## Getting Help

- **Specification questions**: See [spec/MDX_FORMAT_SPECIFICATION.md](../spec/MDX_FORMAT_SPECIFICATION.md)
- **Implementation bugs**: Check the TypeScript/Python reference implementations
- **Format proposals**: Open an issue with the `specification` label

## Next Steps

Choose your path:

- **Building a new implementation?** → [Implementation Guide](implementation-guide.md)
- **Building a tool or converter?** → [Tool Builder Guide](tool-builder-guide.md)
- **Need deep technical details?** → [Format Internals](format-internals.md)
- **Contributing to this repo?** → [Contributing Guide](../CONTRIBUTING.md)
