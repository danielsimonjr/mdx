# Changelog

All notable changes to the MDX Format specification and implementations will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Command-line interface (CLI) tool
  - `view` command - Open MDX documents in browser with full rendering
  - `extract` command - Extract archive contents to folder
  - `info` command - Display document metadata, assets, and content
  - `edit` command - Interactive terminal editor for metadata and content
  - `create` command - Create new documents from templates (blank, article, report, presentation)
  - Cross-platform executable builds via pkg

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
