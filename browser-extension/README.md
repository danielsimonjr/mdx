# MDZ Viewer — Browser Extension

Universal WebExtensions-compatible browser extension that renders MDZ and
legacy MDX archives inline. Works in Chrome, Edge, Firefox, Brave, and Arc
from a single build — targets Manifest V3.

**Status:** 0.1.0-alpha skeleton. Core detection + viewer wiring is in
place; the bundled `<mdz-viewer>` web-component file isn't yet copied into
`vendor/` (Phase 2.5 build step).

## Architecture

```
browser-extension/
├── manifest.json              MV3 manifest — 4-store-compatible
├── background/
│   └── service-worker.js      DNR rule registration; message bus
├── content/
│   └── archive-detector.js    Enhance .mdz/.mdx links on arbitrary pages
├── popup/
│   ├── popup.html             Toolbar popup: URL input + drop zone
│   └── popup.js
├── viewer/
│   ├── viewer.html            Full-tab archive renderer
│   ├── viewer.js              Loads the bundled web component
│   └── viewer.css
├── icons/                     16 / 48 / 128 PNG app icons
└── vendor/
    └── mdz-viewer.js          ← copied from packages/mdz-viewer at build time (TBD)
```

## Development

```bash
# Build the viewer package first — required by viewer/viewer.js
cd packages/mdz-viewer && npm run build

# Copy the built viewer into vendor/ (Phase 2.5 build script TBD)
cp packages/mdz-viewer/dist/mdz-viewer.js browser-extension/vendor/mdz-viewer.js

# Load the extension in Chrome/Edge/Brave/Arc:
#   chrome://extensions -> Developer mode -> Load unpacked -> browser-extension/
# Load in Firefox:
#   about:debugging -> This Firefox -> Load Temporary Add-on -> manifest.json
```

## Publishing (when ready)

- **Chrome Web Store:** requires $5 developer registration; signed ZIP upload
- **Firefox Add-ons (AMO):** free; requires reproducible build (see
  `browser_specific_settings.gecko.id`) and source-code submission
- **Edge Add-ons:** free; same package as Chrome
- **Brave:** uses the Chrome Web Store package directly — no separate submission
- **Arc:** uses the Chrome Web Store package directly

## Security

- Manifest V3 service worker — no persistent background page
- Declarative Net Request rules replace deprecated webRequest blocking
- CSP on extension pages: `default-src 'self'`
- Content script runs at `document_end` and only listens; no network access
- No remote code loading — viewer is bundled locally

## Permissions justification

| Permission | Why |
|------------|-----|
| `declarativeNetRequest` | Path-based (`.mdz`/`.mdx`) and MIME-based rules that redirect archive URLs to the built-in viewer page |
| `declarativeNetRequestWithHostAccess` | Required because the DNR rule applies to arbitrary origins (any page that serves `.mdz` or `.mdx`) |
| `<all_urls>` host permission | Content script enhances `<a href="*.mdz">` links on any page with an "Open" button; `chrome.tabs.create` from the popup also uses it. (We deliberately do NOT request `activeTab` or `storage` — neither is used by the 0.1 build.) |
