# Changelog

All notable changes to the MDX Format specification and implementations will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- MDX Format Specification v1.1.0 Draft (`spec/MDX_FORMAT_SPECIFICATION_v1.1.md`)
  - Text alignment and block attribute system (Section 4.4)
  - Shorthand alignment notation (`{:.center}`, `{:.right}`, etc.)
  - Directive block container syntax (`:::`)
  - Attribute precedence rules (inline > block > container)
  - Alignment integration with existing directives
  - New capability Level 4 "Advanced" for alignment support
  - Inline styles security considerations (Section 7.5)

- v1.1 Example documents
  - `examples/alignment-basic.mdx` - Basic alignment demonstrations
  - `examples/alignment-directives.mdx` - Alignment with media directives
  - `examples/alignment-complex.mdx` - Nested containers and precedence
  - `examples/technical-doc.mdx` - Real-world technical documentation

- Alignment conformance test suite (`tests/alignment/`)
  - 10 test files covering all alignment scenarios
  - Tests for basic alignment, headings, lists, blockquotes
  - Tests for directive integration and container blocks
  - Tests for attribute precedence and conflict resolution
  - Tests for malformed syntax and backward compatibility

- JSON Schema v1.1 updates (`spec/manifest.schema.json`)
  - Added `attributes` and `alignment` to extensions enum
  - Added `alignment_classes` to styles configuration
  - Added `attributes` section to rendering configuration

- Python script to generate v1.1 examples (`implementations/python/create_v11_examples.py`)

- JSON Schema for manifest validation (`spec/manifest.schema.json`)
  - Full schema for all manifest fields and asset types
  - Category-specific asset metadata validation
  - Schema ID: `https://mdx-format.org/schemas/manifest.schema.json`

- CLI `validate` command for document validation
  - Validates ZIP structure and required files
  - Checks manifest schema compliance
  - Verifies asset inventory and checksums
  - Detects common issues (orphaned assets, path issues, etc.)
  - Returns exit code 1 on failure (CI/CD friendly)

- Command-line interface (CLI) tool
  - `view` command - Open MDX documents in browser with full rendering
  - `extract` command - Extract archive contents to folder
  - `info` command - Display document metadata, assets, and content
  - `edit` command - Interactive terminal editor for metadata and content
  - `create` command - Create new documents from templates (blank, article, report, presentation)
  - `validate` command - Validate document structure and manifest
  - Cross-platform executable builds via pkg

- CI/CD pipeline enhancements
  - CLI tool testing in GitHub Actions
  - JSON Schema validation job
  - Example document validation with CLI

- Web-based WYSIWYG editor
  - Visual mode with live WYSIWYG editing
  - Markdown mode for raw source editing
  - Split view with side-by-side markdown and preview
  - Formatting toolbar (headings, bold, italic, lists, tables, links, images)
  - Drag-and-drop asset management
  - Document outline navigation
  - Open/save MDX files directly in browser
  - Word and character count

- Claude Code configuration
  - `.claude/settings.json` with project settings and code style preferences
  - `.mcp.json` with MCP server configuration
  - Root `.gitignore` for common ignores

### Fixed

- Implementation guide: Corrected assets structure from array to object with category keys
- Implementation guide: Updated validation example to iterate over asset categories
- Implementation guide: Fixed reader/writer examples to use correct manifest structure
- TypeScript: Removed dead code (unused `div` variable in `escapeHTML` method)
- Specification: Updated Appendix A with actual JSON Schema reference
- SVG images now render correctly in editor (added MIME type detection)
- Python implementation no longer uses hardcoded paths
- TypeScript `tracking_enabled` field renamed to `enabled` to match spec
- TypeScript annotation enum values now match W3C motivations
- Removed stray markdown backticks from viewer HTML

## [1.0.0] - Draft

### Added

- Initial MDX Format Specification (v1.0.0 Draft)
  - Archive structure definition
  - Manifest JSON schema
  - Asset organization by category
  - Extended Markdown directives (video, audio, model, data, embed)
  - Version history support
  - W3C Web Annotation integration
  - Security considerations
  - Conformance levels (Minimal, Standard, Full)

- TypeScript reference implementation
  - `MDXDocument` class for creating/reading MDX files
  - `MDXManifest` class for metadata management
  - Asset management with automatic categorization
  - Version history and annotation support
  - HTML export capability

- Python reference implementation
  - Example MDX document generator
  - Complete demonstration of all format features

- Web-based MDX viewer
  - Drag-and-drop file loading
  - Markdown rendering with syntax highlighting
  - Asset browser and preview
  - Manifest inspection

- Example MDX document demonstrating all features
