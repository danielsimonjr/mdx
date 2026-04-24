# @mdz-format/viewer

Framework-agnostic `<mdz-viewer>` web component for rendering MDZ (Markdown
Zipped Container) archives — and legacy `.mdx` archives — in any browser.

**Status:** 0.1.0-alpha. Core rendering works; signature verification, cell
re-execution, and accessibility conformance are landing in Phase 3.

## Install

```bash
npm install @mdz-format/viewer
```

## Use

### Declarative

```html
<script type="module" src="https://unpkg.com/@mdz-format/viewer"></script>

<mdz-viewer src="paper.mdz"></mdz-viewer>
<mdz-viewer
  src="paper.mdz"
  prefer-locales="ja-JP,en-US"
  theme="auto">
</mdz-viewer>
```

### Programmatic

```js
import "@mdz-format/viewer";

const viewer = document.createElement("mdz-viewer");
document.body.appendChild(viewer);

// From a File input
fileInput.addEventListener("change", async (e) => {
  await viewer.setArchive(e.target.files[0]);
});

// Listen for load events
viewer.addEventListener("mdz-loaded", (e) => {
  console.log("Loaded:", e.detail.manifest.document.title);
});
viewer.addEventListener("mdz-error", (e) => {
  console.error(e.detail.userMessage);
});
```

## Attributes

| Attribute | Purpose |
|-----------|---------|
| `src` | URL of the MDZ archive to fetch and render |
| `prefer-locales` | Comma-separated BCP 47 tags for locale preference |
| `theme` | `light` (default) / `dark` / `auto` (follows `prefers-color-scheme`) |

## Events

| Event | `detail` payload |
|-------|-----------------|
| `mdz-loaded` | `{ manifest }` — fires when the archive renders |
| `mdz-error` | `{ error, userMessage }` — fires on load/parse failure |

## Security

The viewer runs archive content with a strict allowlist sanitizer:

- `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>` — **stripped**
- `on*` event handler attributes — **stripped**
- `javascript:`, `vbscript:`, `file:`, `data:` URLs — **stripped**
- `<a target="_blank">` — automatically gets `rel="noopener noreferrer"`
- Archive-relative asset URLs — resolved to blob URLs (no external fetch)
- Absolute `https://` URLs — passed through

Combined with the Phase 3 CSP profile (`docs/security/CSP.md`), this gives
the viewer a defense-in-depth posture against malicious archives.

## Accessibility

- WCAG 2.1 AA baseline. Keyboard-navigable, screen-reader tested.
- `role="article"`, `aria-live="polite"` on the content region.
- Honors `prefers-color-scheme` when `theme="auto"`.
- Respects archive-declared `document.accessibility.features`.

## Size budget

| Module | Gzipped |
|--------|---------|
| Core shell (archive + render + sanitizer) | target ≤80KB |
| Math (KaTeX, lazy-loaded on first `$...$`) | ~75KB |
| Syntax highlighting (lazy-loaded) | ~30KB |
| Total with math + highlight + archive | target ≤250KB |

Core shell stays lean so text-only scientific papers render instantly.

## What's missing from 0.1.0

The alpha scope ships rendering + sanitization + locale resolution. Not yet:

- Re-execute `::cell` blocks via Pyodide / webR (planned 0.3.0)
- Signature verification panel (Phase 3)
- Annotation layer for peer review (Phase 3)
- KaTeX math rendering (planned 0.2.0)
- Syntax highlighting (planned 0.2.0)
- Cross-references (`::ref`) and citations (`::cite`) rendering (blocked on spec v2.1)

## Development

```bash
cd packages/mdz-viewer
npm install
npm run dev       # Vite dev server with demo page
npm run build     # Produce dist/mdz-viewer.js
npm run test      # Vitest unit + sanitizer tests
npm run typecheck # tsc --noEmit
```

## License

MIT
