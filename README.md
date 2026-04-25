# MDZ Format

**Markdown Zipped Container** — an open file format for **executable
scientific papers**. One signed ZIP archive carries the manuscript,
executable code cells, data, figures, citations, multi-signature
provenance, and accessibility metadata.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Specification](https://img.shields.io/badge/Spec-v2.0.0--Draft-orange.svg)](spec/MDX_FORMAT_SPECIFICATION_v2.0.md)

> **STATUS: experimental research project.** The tooling targets
> professional-grade UX (polished, keyboard-first, accessible, fast). The
> *format itself* is not yet production-stable — breaking changes may land
> up to v3.0. Do not base production infrastructure on MDZ until at least
> one external organization has published in the format. See
> [ROADMAP.md](ROADMAP.md) for current phase and [docs/FUNDING.md](docs/FUNDING.md)
> for resourcing status.

> **Naming.** This project was renamed from **MDX** to **MDZ** on
> 2026-04-24 because "MDX" collides with the React ecosystem's Markdown+JSX
> format. The file extension `.mdx` and MIME type
> `application/vnd.mdx-container+zip` remain accepted by readers as legacy
> aliases through 2027-01-01. New archives should use `.mdz` and
> `application/vnd.mdz-container+zip`. **Both MIME types are proposed —
> neither is IANA-registered yet.** Registration is planned once the
> specification leaves draft status.

## What MDZ is for

MDZ replaces the duct-tape stack of `.ipynb` + Overleaf + supplementary
`.zip` + post-hoc DOI. See [docs/POSITIONING.md](docs/POSITIONING.md) for
the full pitch. In short: a grad student authors a reproducible paper, a
reviewer re-executes any cell in-browser, a journal validates the
submission against its profile and exports JATS-XML for production —
one archive carries all of it, cryptographically signed end to end.

This is a focused niche. MDZ is *not* a Google Docs replacement, not a
page-layout tool, not a general-purpose document format. See
[docs/POSITIONING.md](docs/POSITIONING.md) "What MDZ is NOT" for the
explicit boundaries, and [docs/COMPETITIVE.md](docs/COMPETITIVE.md) for
honest comparison against Quarto, Jupyter Book, Curvenote, Manubot, and
Stencila.

## Key capabilities

- **One archive, one hash.** Signed, content-addressed, offline-ready.
- **Executable cells** (`::cell`) with cached outputs — reviewers re-run
  what they doubt; the rest render from cache.
- **Multi-signature chains** (author → corresponding author → reviewer →
  editor) with W3C DID identity resolution via `did:web`.
- **Provenance DAG** — preprint → revisions → accepted version, all in
  one file.
- **Accessibility built-in** — WCAG 2.1 AA baseline declared in the
  manifest, not only in the rendered HTML.
- **Multi-locale content** — primary language + translations in one archive.
- **Profile-driven validation** — journals own their submission profile
  and reject non-conformant manuscripts programmatically.
- **Graceful degradation** — any ZIP tool extracts contents; any Markdown
  reader reads the prose; cells and outputs layer on top.

### What's New in v2.0 (still named `mdx_version` in manifests for compatibility)

Ten capability additions, each backward-compatible with v1.1:

1. **Internationalization** — multi-locale content bundling (§8)
2. **Content-addressed storage** — optional `assets/by-hash/` + `content_hash` (§9)
3. **Streaming-friendly archive ordering** — read text before media arrives (§10)
4. **Computational cells** — `::cell` directive with cached outputs (§11)
5. **Transclusion** — `::include` directive for cross-file and cross-document composition (§12)
6. **Document profiles** — machine-checkable structural requirements per document type (§13)
7. **Rich accessibility model** — long descriptions, AD tracks, sign-language, MathML fallbacks (§14)
8. **Provenance + fork graph** — multi-parent versions, derived-from chain, history DAG (§15)
9. **Multi-signature + DID identity** — `signatures[]` with roles and W3C DIDs (§16)
10. **Responsive variants** — per-asset `variants[]` and document-level `content.variants[]` (§17)

All v1.1 features (alignment, block attributes, container blocks, directive
containers) continue to work unchanged. See
[`spec/MDX_FORMAT_SPECIFICATION_v2.0.md`](spec/MDX_FORMAT_SPECIFICATION_v2.0.md)
for full details and
[`spec/MDX_FORMAT_SPECIFICATION_v1.1.md`](spec/MDX_FORMAT_SPECIFICATION_v1.1.md)
for the v1.1 baseline.

## File Structure

```
document.mdx (ZIP container)
├── manifest.json           # Document metadata and asset inventory
├── document.md             # Primary Markdown content
├── assets/                 # Embedded media
│   ├── images/            # PNG, JPEG, WebP, SVG, GIF
│   ├── video/             # MP4, WebM (+ VTT captions)
│   ├── audio/             # MP3, WAV, OGG
│   ├── models/            # glTF, GLB (3D models)
│   ├── documents/         # PDF and other documents
│   ├── data/              # CSV, JSON, Parquet
│   ├── fonts/             # WOFF2, TTF
│   └── other/             # Uncategorized assets
├── styles/                 # Custom CSS
├── scripts/                # Interactive content (sandboxed)
├── history/                # Version snapshots
└── annotations/            # W3C Web Annotations
```

## Quick Start

### Creating an MDZ Document (Python)

```python
import zipfile, json, uuid
from datetime import datetime, timezone

timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
manifest = {
    "mdx_version": "2.0.0",
    "document": {
        "id": str(uuid.uuid4()),     # UUID v4 required
        "title": "My Document",
        "created": timestamp,
        "modified": timestamp,
        "language": "en",
    },
    "content": {"entry_point": "document.md"},
}

with zipfile.ZipFile('my-document.mdz', 'w', zipfile.ZIP_DEFLATED) as out:
    # Spec §10.2: manifest.json MUST be the first entry.
    out.writestr('manifest.json', json.dumps(manifest, indent=2))
    out.writestr('document.md', '# Hello World\n\nThis is my MDZ document.')
```

### Creating an MDZ Document (TypeScript)

```typescript
import { MDZDocument } from './implementations/typescript/mdx_format';

const doc = MDZDocument.create("My Document", {
  author: { name: "Your Name", email: "you@example.com" }
});
doc.setContent("# Hello World\n\nThis is my MDZ document.");
await doc.addImage(imageData, "figure.png", { altText: "A figure" });
const blob = await doc.save();      // produces .mdz bytes
```

> The TypeScript class is `MDZDocument`; `MDXDocument` is a
> deprecated alias retained through 2027-01-01 for legacy callers.

### Reading an MDZ Document

```typescript
const doc = await MDZDocument.open(fileData);   // accepts .mdz or .mdx
console.log(doc.title);
console.log(doc.getContent());
```

## Repository Structure

```
mdx/                                # repo root (directory rename to mdz/ deferred — see CLAUDE.md)
├── spec/                          # Specification + grammar + profiles + extensions
├── docs/                          # POSITIONING / FUNDING / SUPPORT_MATRIX / governance / proposals
├── implementations/               # TypeScript + Python reference impls
├── cli/                           # `mdz` / `mdx` Node.js command-line tool
├── packages/                      # mdz-viewer web component + mdz-viewer-hosted worker
├── editor-desktop/                # Phase 2.3 Electron editor + Phase 2.3a.7 e2e suite
├── browser-extension/             # Phase 2.5 cross-browser MV3 extension
├── bindings/rust/                 # Phase 4.1 Rust binding (read + verify)
├── integrations/                  # Phase 4.2 Pandoc + VS Code hooks
├── tools/corpus-fetcher/          # Phase 4.3 arXiv corpus tooling
├── tree-sitter-mdz/               # alpha grammar
├── examples/                      # v1, v1.1, v2 example archives
├── tests/                         # conformance + parity + accessibility + roadmap-gates
├── legacy/                        # pre-Phase-2 demos retained for reference (do not import)
└── .github/                       # CI workflows, issue templates
```

For the full annotated tree (including renderer modules,
sub-package layouts, and the v1.x/v2.0 source files inside
`implementations/`), see [CLAUDE.md](CLAUDE.md). For
"which implementation supports which feature," see
[docs/SUPPORT_MATRIX.md](docs/SUPPORT_MATRIX.md).

## Specification

The complete specification is available at:
- **v2.0** (Current): [spec/MDX_FORMAT_SPECIFICATION_v2.0.md](spec/MDX_FORMAT_SPECIFICATION_v2.0.md)
- **v1.1** (Predecessor): [spec/MDX_FORMAT_SPECIFICATION_v1.1.md](spec/MDX_FORMAT_SPECIFICATION_v1.1.md)
- **v1.0**: [spec/MDX_FORMAT_SPECIFICATION.md](spec/MDX_FORMAT_SPECIFICATION.md)

**Current Version:** 2.0.0 (Draft)

**File Extensions:** `.mdz` (primary, write new archives with this);
`.mdx` is accepted by readers as a legacy alias through 2027-01-01.

**MIME Types:** `application/vnd.mdz-container+zip` (primary);
`application/vnd.mdx-container+zip` (legacy alias, same window).
Both are proposed — neither is IANA-registered yet.

**JSON Schema:**
[`spec/manifest-v2.schema.json`](spec/manifest-v2.schema.json) (v2.0),
[`spec/manifest.schema.json`](spec/manifest.schema.json) (v1.1 baseline,
still accepted by readers).

**Profiles** (spec §7):
[`spec/profiles/mdz-advanced-v1.json`](spec/profiles/mdz-advanced-v1.json) (strict superset),
[`spec/profiles/scientific-paper-v1.json`](spec/profiles/scientific-paper-v1.json) (IMRaD + CSL-JSON + DID/ORCID),
[`spec/profiles/api-reference-v1.json`](spec/profiles/api-reference-v1.json) (semver doc + Endpoints section).
Validate with `mdz validate <file> --profile <id>`.

## Comparison with Other Formats

| Format | MDZ Advantage |
|--------|---------------|
| DOCX | Human-readable source, simpler structure, web-native media |
| PDF | Editable source, smaller size, true interactivity |
| 3D PDF | Open format, modern 3D standards (glTF), no proprietary tools |
| HTML | Self-contained, offline-capable, version-controlled |
| Plain Markdown | Bundled assets, rich metadata, collaboration features |
| EPUB | Simpler structure, better for documents vs. books — and round-trips both ways via `mdz export-epub` / `mdz import-epub` |
| `.ipynb` | Bundled non-notebook assets, signed provenance, locale variants — and imports notebooks via `mdz import-ipynb` |

## Extended Markdown Syntax

MDX supports CommonMark 0.31+ with extensions:

```markdown
<!-- Standard Markdown for images -->
![Alt text](assets/images/figure.png)

<!-- Extended directives for rich media -->
::video[Demo Video]{src="assets/video/demo.mp4" poster="assets/images/thumbnail.png" controls}
::audio[Narration]{src="assets/audio/narration.mp3" controls}
::model[3D Part]{src="assets/models/part.gltf" camera="front" controls}
::data[Results]{src="assets/data/results.csv" visualization="chart" type="bar"}

<!-- v1.1: Text alignment -->
{:.center}
This paragraph is centered.

## Centered Heading {:.center}

<!-- v1.1: Container blocks -->
::::{.align-center}
Multiple paragraphs can share the same alignment.

All content in this container is centered.
::::
```

## Tools

### Command-Line Interface (CLI)

A Node.js CLI tool for working with MDX files. Build a standalone executable or run directly with Node.

**Installation:**
```bash
cd cli
npm install
```

**Commands** (the binary ships as both `mdz` and `mdx` for the
2027-01-01 backward-compat window — examples lead with `mdz`):

```bash
# View — open in browser with full rendering
mdz view document.mdz
mdz v document.mdz -p 8080         # Custom port

# Extract — extract archive contents
mdz extract document.mdz
mdz x document.mdz ./output

# Info — display document metadata
mdz info document.mdz
mdz i document.mdz -c              # Show content
mdz i document.mdz -a              # Show asset details

# Edit — interactive terminal editor
mdz edit document.mdz

# Create — new document from template
mdz create
mdz c "My Document" -t article -o my-doc.mdz

# Validate — structural + manifest checks
mdz validate document.mdz
mdz validate document.mdz --profile mdz-advanced
mdz validate document.mdz --a11y-report   # Phase 3.3: WCAG sidecar JSON

# Verify — signature chain + integrity hashes (Phase 3.2)
mdz verify document.mdz
mdz verify document.mdz --offline --trust trust.json

# Import / export — Phase 2.4 EPUB + Jupyter bridges
mdz import-ipynb notebook.ipynb            # → notebook.mdz
mdz import-epub book.epub                  # → book.mdz
mdz export-epub document.mdz -o out.epub
mdz export-jats document.mdz -o out.xml

# Snapshot — Phase 4.5 + 4.6.9 delta-snapshots-v1
mdz snapshot list document.mdz
mdz snapshot view document.mdz 2.0.0
mdz snapshot create document.mdz --version 2.1.0 --parent 2.0.0 -m "abstract revision"
mdz snapshot export document.mdz 2.0.0 -o snapshot-2.0.0.md --with-manifest
```

**Build Executable:**
```bash
npm run build        # Windows x64
npm run build:all    # All platforms
```

See [cli/README.md](cli/README.md) for full documentation.

### Desktop editor (Phase 2.3, supported)

The production editor lives at `editor-desktop/` — Electron 31 +
Vite + CodeMirror 6 + a live `<mdz-viewer>` preview pane. Ships
394 vitest cases across 21 test files; signed installers for
macOS / Windows / Linux are produced by the Phase 2.3a.6 release
pipeline once code-signing secrets are wired in CI.

```bash
cd editor-desktop
npm install --include=optional   # ~200 MB Electron platform binary
npm run dev                      # vite + electron, live reload
npm run build                    # tsc + vite build → dist/
```

Phase 2.3b features land on top: Pyodide kernels with per-cell
▶ Run buttons, accessibility checker (WCAG live scan), block-level
diff with Compare-versions modal, peer-review annotation sidebar
with reply creation (Phase 2.3b.4.3), Compare-locales side-by-side
view with sync-scroll, AVIF/WebP variant pipeline, 9-directive
picker pack. Launch with `--role=public` to hide editorial
deliberation per the peer-review spec.

See [editor-desktop/README.md](editor-desktop/README.md).

### Web component viewer (Phase 2.1, supported)

`<mdz-viewer>` at `packages/mdz-viewer/` — framework-agnostic
custom element that renders any MDZ archive in the browser.
Ships sanitized markdown, citations, KaTeX math, IndexedDB
caching, and a delta-snapshots-v1 reader. Hosted at
`view.mdz-format.org` (deploy pending) via the
`packages/mdz-viewer-hosted/` Cloudflare Worker.

### Browser extension (Phase 2.5, code-ready)

MV3 cross-browser (Chrome / Firefox / Edge / Brave) extension at
`browser-extension/`. Detects MDZ archives in tabs and renders
them inline. Reproducible-build CI gate compares two sequential
zips byte-for-byte. Real icon artwork + addon-store submissions
are external-action items.

### Legacy demos (pre-Phase-2, reference only)

The single-file WYSIWYG demo (`legacy/editor/index.html`),
read-only HTML viewer (`legacy/viewer/index.html`), and original
Chrome-only extension (`legacy/chrome-extension/`) are preserved
under `legacy/` for reference. They are not actively maintained;
new work should use the supported tools above. See
[legacy/README.md](legacy/README.md) for the migration table.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Reporting issues and requesting features
- Proposing specification changes
- Submitting implementations

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

MDX builds on established standards:
- [CommonMark](https://commonmark.org/) - Markdown specification
- [W3C Web Annotation](https://www.w3.org/TR/annotation-model/) - Annotation format
- [glTF](https://www.khronos.org/gltf/) - 3D model format
- [ZIP/DEFLATE](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) - Archive format
