/**
 * Pure helpers extracted from extension.js so they can be unit-tested
 * without booting the VS Code extension host (which requires a real
 * `vscode` module the test runner can't provide).
 */

'use strict';

// Cap preview payload — HTML-escaping a 100 MB markdown file produces >400 MB
// of DOM and hangs the webview. Truncate to 1 MB with a visible banner.
const PREVIEW_MAX_BYTES = 1_000_000;

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function buildPreviewHtml(markdown, theme) {
    const originalLen = markdown.length;
    const truncated = originalLen > PREVIEW_MAX_BYTES;
    const body = truncated ? markdown.slice(0, PREVIEW_MAX_BYTES) : markdown;
    const esc = escapeHtml(body);
    const truncationNote = truncated
        ? `<div class="banner" style="background:#fee2e2;border-left-color:#dc2626;">
            Preview truncated: showing first ${Math.round(PREVIEW_MAX_BYTES / 1024)} KB of ${Math.round(originalLen / 1024)} KB.
            Use <code>mdz view</code> for full rendering.
          </div>`
        : '';
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>MDZ Preview</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 1rem; line-height: 1.5; }
    pre { background: #f5f5f5; padding: 1rem; overflow-x: auto; border-radius: 4px; }
    .banner { background: #fffbe6; border-left: 4px solid #f59e0b;
              padding: 0.5rem 1rem; margin-bottom: 1rem; font-size: 0.9em; }
    [data-theme="dark"] body, body[data-theme="auto"] {
      background: #111; color: #eee;
    }
    [data-theme="dark"] pre { background: #1f1f1f; }
  </style>
</head>
<body data-theme="${escapeHtml(theme)}">
  <div class="banner">
    MDZ preview is a raw-Markdown view in this alpha; full rendering via the
    &lt;mdz-viewer&gt; web component ships with the first stable release.
  </div>
  ${truncationNote}
  <pre>${esc}</pre>
</body>
</html>`;
}

module.exports = { PREVIEW_MAX_BYTES, escapeHtml, buildPreviewHtml };
