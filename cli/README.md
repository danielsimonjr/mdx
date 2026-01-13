# MDX CLI

Command-line tool for working with MDX (Markdown eXtended Container) files.

## Installation

```bash
cd cli
npm install
```

## Usage

```bash
# Show help
node src/index.js --help

# Or if installed globally
mdx --help
```

## Commands

### View - Open in Browser
```bash
mdx view document.mdx
mdx v document.mdx -p 8080  # Custom port
```
Opens the MDX document in a web browser with full rendering.

### Extract - Extract Contents
```bash
mdx extract document.mdx
mdx x document.mdx ./output -f  # Custom output, force overwrite
```
Extracts the MDX archive contents to a folder for inspection.

### Info - Display Information
```bash
mdx info document.mdx
mdx i document.mdx -c  # Show content
mdx i document.mdx -m  # Show manifest
mdx i document.mdx -a  # Show asset details
```
Displays document metadata, authors, assets, and features in the terminal.

### Edit - Interactive Editor
```bash
mdx edit document.mdx
mdx e document.mdx
```
Opens an interactive editor to modify:
- Document metadata (title, description, version)
- Authors
- Content
- Assets
- Settings and extensions

### Create - New Document
```bash
mdx create
mdx c "My Document" -t article -o my-doc.mdx
```
Creates a new MDX document with templates:
- `blank` - Empty document
- `article` - Blog post structure
- `report` - Business report
- `presentation` - Slide-style document

### Validate - Validate Structure
```bash
mdx validate document.mdx
mdx val document.mdx -v  # Verbose output
```
Validates the MDX document structure and manifest, checking for:
- Required files (manifest.json, entry point)
- Manifest schema compliance
- Asset inventory correctness
- Checksum verification
- Common issues (backslashes, orphaned assets, etc.)

Returns exit code 1 if validation fails (useful for CI/CD).

## Building Executable

```bash
npm run build          # Windows x64
npm run build:all      # All platforms
```

Creates standalone executables in `dist/` folder.

## License

MIT
