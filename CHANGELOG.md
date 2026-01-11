# Changelog

All notable changes to the MDX Format specification and implementations will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
