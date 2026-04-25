# MDX Viewer Chrome Extension

A Chrome extension for viewing MDX (Markdown eXtended Container) files directly in the browser.

## Features

- Open and view MDX documents
- Drag-and-drop file loading
- Document outline navigation
- Asset preview and download
- Export to HTML, Markdown, or JSON
- Syntax-highlighted code blocks
- Responsive design

## Setup

### 1. Install Dependencies

Run the setup script to download required libraries:

```bash
cd chrome-extension
node setup.js
```

This downloads:
- JSZip (ZIP handling)
- Marked (Markdown rendering)
- Highlight.js (Code highlighting)

### 2. Create Icons

Replace the placeholder icons in `/icons` with proper PNG files:

| File | Size | Purpose |
|------|------|---------|
| `icon-16.png` | 16×16 | Toolbar icon |
| `icon-48.png` | 48×48 | Extensions page |
| `icon-128.png` | 128×128 | Chrome Web Store |

You can create icons from the SVG logo or use any image editor.

### 3. Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `chrome-extension` folder
5. The MDX Viewer icon should appear in your toolbar

## Usage

### Opening Files

**Method 1: Popup**
1. Click the MDX Viewer icon in toolbar
2. Click "Open MDX Viewer" or "Open File..."

**Method 2: Drag & Drop**
1. Open the viewer page
2. Drag an MDX file onto the window

**Method 3: Keyboard**
- `Ctrl+O` (or `Cmd+O` on Mac) to open file dialog

### Viewing Documents

- **Outline**: Click headings in the left sidebar to jump to sections
- **Assets**: Click assets to preview; download button available in preview
- **Info**: Click the info button to view document metadata

### Exporting

Click the Export button to save as:
- **HTML**: Standalone webpage with embedded styles
- **Markdown**: Plain text markdown file
- **JSON**: Document manifest only

## File Structure

```
chrome-extension/
├── manifest.json      # Extension configuration
├── viewer.html        # Main viewer page
├── viewer.css         # Viewer styles
├── viewer.js          # Viewer logic
├── popup.html         # Toolbar popup
├── background.js      # Service worker
├── setup.js           # Setup script
├── lib/               # Bundled libraries
│   ├── jszip.min.js
│   ├── marked.min.js
│   ├── highlight.min.js
│   └── github.min.css
└── icons/             # Extension icons
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

## Development

### Testing Changes

1. Make changes to source files
2. Go to `chrome://extensions`
3. Click the refresh icon on the MDX Viewer card
4. Test changes in the viewer

### Debugging

- Open DevTools on the viewer page (`F12`)
- For background script: click "Service Worker" link in extensions page

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open file |
| `Escape` | Close modal |

## Supported File Types

- `.mdx` - MDX Container files
- `.mdxc` - MDX Container (alternate extension)

## Browser Compatibility

- Chrome 88+ (Manifest V3)
- Edge 88+ (Chromium-based)

## License

MIT License - Same as MDX Format project
