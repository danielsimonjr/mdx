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

/**
 * Testable core of the runCli command.
 *
 * Extracted so we can assert the security-relevant behavior without
 * booting the VS Code extension host:
 *   - execFn is called with an argv array (NEVER a shell string), so
 *     paths containing spaces, quotes, `;`, `&&`, `$()`, etc. cannot
 *     be re-interpreted as shell metacharacters.
 *   - concurrent invocations with the same (subcommand, filePath)
 *     short-circuit via the `inFlight` Map; the first call wins, the
 *     second returns early without spawning.
 *   - the inFlight entry is cleared on completion so subsequent calls
 *     work and the Map doesn't leak memory.
 *
 * deps: { execFn, showWarning, showError, out, inFlight }
 *   execFn(file, args, opts, callback) — shape of child_process.execFile
 *   showWarning(msg), showError(msg) — user-facing notifications
 *   out.show(true), out.appendLine(msg), out.append(chunk) — OUTPUT channel
 *   inFlight — a Map<string, ChildProcess> tracking running invocations
 *
 * Returns: the child handle on successful spawn, or null when skipped
 * (missing filePath or already in-flight).
 */
function runCliCore(deps, cli, subcommand, filePath) {
    const { execFn, showWarning, showError, out, inFlight } = deps;
    if (!filePath) {
        showWarning(`MDZ: ${subcommand} needs a file — right-click an archive in the Explorer.`);
        return null;
    }
    const key = `${subcommand}:${filePath}`;
    if (inFlight.has(key)) {
        showWarning(`MDZ: ${subcommand} is already running for this file.`);
        return null;
    }
    out.show(true);
    out.appendLine(`$ ${cli} ${subcommand} ${filePath}`);
    const child = execFn(cli, [subcommand, filePath], { shell: false }, (err, stdout, stderr) => {
        inFlight.delete(key);
        if (stdout) out.append(stdout);
        if (stderr) out.append(stderr);
        if (err) {
            const exitInfo = err.code ?? err.message;
            out.appendLine(`[exit ${exitInfo}]`);
            showError(`MDZ ${subcommand} failed (${exitInfo}) — see OUTPUT panel.`);
        } else {
            out.appendLine('[OK]');
        }
    });
    inFlight.set(key, child);
    return child;
}

module.exports = { PREVIEW_MAX_BYTES, escapeHtml, buildPreviewHtml, runCliCore };
