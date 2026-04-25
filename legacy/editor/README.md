# MDX Editor

A lightweight, web-based WYSIWYG editor for MDX (Markdown eXtended Container) documents.

## Features

### Editing Modes
- **Visual Mode** - WYSIWYG editing with live formatting
- **Markdown Mode** - Edit raw markdown source
- **Split View** - Side-by-side markdown and preview

### Formatting
- Headings (H1, H2, H3)
- Bold, Italic, Underline, Strikethrough
- Inline code and code blocks
- Bullet and numbered lists
- Task lists (checkboxes)
- Blockquotes
- Tables
- Horizontal rules
- Links and images

### Asset Management
- Drag-and-drop file upload
- Support for images, video, audio, PDFs, data files, 3D models
- Visual asset browser in sidebar
- Insert assets directly into document

### Document Features
- Document metadata editor (title, description, author, version)
- Document outline navigation
- Word and character count
- Keyboard shortcuts (Ctrl+S, Ctrl+B, etc.)

## Usage

### Open in Browser
Simply open `index.html` in any modern web browser.

### Serve Locally
```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .
```

Then open `http://localhost:8000` in your browser.

### File Operations

| Action | Method |
|--------|--------|
| New Document | Click "New" or Ctrl+N |
| Open MDX | Click "Open" or Ctrl+O |
| Save MDX | Click "Save" or Ctrl+S |
| Settings | Click gear icon |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+S | Save document |
| Ctrl+O | Open document |
| Ctrl+N | New document |
| Ctrl+B | Bold |
| Ctrl+I | Italic |
| Ctrl+U | Underline |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |

## Technical Details

### Dependencies (loaded via CDN)
- JSZip - MDX archive handling
- Marked - Markdown parsing
- Highlight.js - Code syntax highlighting
- Turndown - HTML to Markdown conversion
- Font Awesome - Icons

### Browser Support
- Chrome 90+
- Firefox 90+
- Safari 14+
- Edge 90+

## License

MIT
