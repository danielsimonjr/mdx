/**
 * MDZ VS Code extension — entry point.
 *
 * Provides six commands (preview, view, validate, import-ipynb,
 * export-jats, verify) that shell out to the `mdz` CLI. The preview
 * command renders the archive in a webview via the `<mdz-viewer>` web
 * component bundled from `packages/mdz-viewer/dist/`.
 *
 * Scope of this alpha:
 *   - Syntax highlighting via syntaxes/mdz.tmLanguage.json (grammar).
 *   - CLI pass-through commands (invoke mdz, show output in OUTPUT channel).
 *   - Webview preview of .mdz / .mdx files.
 *
 * Not yet:
 *   - IntelliSense for directive attributes (requires tree-sitter wiring).
 *   - Cross-reference / citation navigation across files (requires a
 *     workspace-wide index of ::fig/::eq/::tab ids).
 *   - Diagnostic surfacing from `mdz validate` into the Problems panel
 *     (requires a structured JSON output mode on the CLI, not yet
 *     implemented).
 */

'use strict';

const vscode = require('vscode');
const { execFile } = require('child_process');
const path = require('path');

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

// Tracks in-flight `mdz <sub> <path>` invocations so we don't interleave
// output from two concurrent runs in the OUTPUT channel.
const inFlight = new Map();

function activate(context) {
    const out = vscode.window.createOutputChannel('MDZ');

    context.subscriptions.push(
        vscode.commands.registerCommand('mdz.view', (uri) => viewArchive(uri, out)),
        vscode.commands.registerCommand('mdz.preview', () => previewDocument(context)),
        vscode.commands.registerCommand('mdz.validate', (uri) => runCli('validate', uri, out)),
        vscode.commands.registerCommand('mdz.importIpynb', () => importIpynb(out)),
        vscode.commands.registerCommand('mdz.exportJats', (uri) => runCli('export-jats', uri, out)),
        vscode.commands.registerCommand('mdz.verify', (uri) => runCli('verify', uri, out)),
    );
}

function deactivate() {
    // No-op: all subscriptions are disposed by the extension host.
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

function getCliPath() {
    return vscode.workspace.getConfiguration('mdz').get('cliPath') || 'mdz';
}

/** Run a `mdz <command> <file>` invocation; stream output to the OUTPUT panel. */
function runCli(subcommand, uri, out) {
    const filePath = resolveFileUri(uri);
    if (!filePath) {
        vscode.window.showWarningMessage(`MDZ: ${subcommand} needs a file — right-click an archive in the Explorer.`);
        return;
    }
    const key = `${subcommand}:${filePath}`;
    if (inFlight.has(key)) {
        vscode.window.showWarningMessage(`MDZ: ${subcommand} is already running for this file.`);
        return;
    }
    const cli = getCliPath();
    out.show(true);
    out.appendLine(`$ ${cli} ${subcommand} ${filePath}`);
    // execFile with an argv array — the file path is NEVER passed through a
    // shell, so paths containing spaces, quotes, `;`, `&&`, `$()`, etc. cannot
    // be re-interpreted as shell metacharacters.
    const child = execFile(cli, [subcommand, filePath], { shell: false }, (err, stdout, stderr) => {
        inFlight.delete(key);
        if (stdout) out.append(stdout);
        if (stderr) out.append(stderr);
        if (err) {
            const exitInfo = err.code ?? err.message;
            out.appendLine(`[exit ${exitInfo}]`);
            vscode.window.showErrorMessage(`MDZ ${subcommand} failed (${exitInfo}) — see OUTPUT panel.`);
        } else {
            out.appendLine('[OK]');
        }
    });
    inFlight.set(key, child);
}

function viewArchive(uri, out) {
    const filePath = resolveFileUri(uri);
    if (!filePath) {
        vscode.window.showWarningMessage('MDZ: right-click an .mdz file in the Explorer to open it.');
        return;
    }
    // The `mdz view` command starts a local server; defer to it rather
    // than reinventing a browser launcher. Fire-and-forget — no OUTPUT
    // streaming because the server is long-running.
    const cli = getCliPath();
    out.show(true);
    out.appendLine(`$ ${cli} view ${filePath}`);
    execFile(cli, ['view', filePath], { shell: false }, (err) => {
        if (err) {
            vscode.window.showErrorMessage(`MDZ view failed — is the CLI installed? (${err.message})`);
        }
    });
}

function previewDocument(context) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('MDZ preview: open a Markdown file first.');
        return;
    }
    const sourceUri = editor.document.uri.toString();
    const panel = vscode.window.createWebviewPanel(
        'mdz-preview',
        'MDZ Preview',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
        },
    );
    const theme = vscode.workspace.getConfiguration('mdz').get('viewer.theme') || 'auto';
    panel.webview.html = buildPreviewHtml(editor.document.getText(), theme);

    // Keep the preview in sync with edits — debounced to avoid thrash.
    // Re-resolve the source document by URI each tick so a closed-and-
    // reopened file still updates, and a closed source gracefully freezes.
    let timer;
    const subscription = vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== sourceUri) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
            const live = vscode.workspace.textDocuments.find(
                (d) => d.uri.toString() === sourceUri,
            );
            if (!live) return; // source was closed; freeze at last snapshot
            panel.webview.html = buildPreviewHtml(live.getText(), theme);
        }, 300);
    });
    panel.onDidDispose(() => {
        subscription.dispose();
        clearTimeout(timer);
    });
}

async function importIpynb(out) {
    const picked = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { 'Jupyter notebooks': ['ipynb'] },
        openLabel: 'Convert to MDZ',
    });
    if (!picked || picked.length === 0) return;
    const cli = getCliPath();
    const ipynbPath = picked[0].fsPath;
    out.show(true);
    out.appendLine(`$ ${cli} import-ipynb ${ipynbPath}`);
    execFile(cli, ['import-ipynb', ipynbPath], { shell: false }, (err, stdout, stderr) => {
        if (stdout) out.append(stdout);
        if (stderr) out.append(stderr);
        if (!err) {
            vscode.window.showInformationMessage('MDZ: notebook converted. Check the folder alongside the ipynb.');
        }
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveFileUri(uri) {
    if (uri && uri.fsPath) return uri.fsPath;
    const active = vscode.window.activeTextEditor;
    return active ? active.document.uri.fsPath : null;
}

// Cap preview payload — HTML-escaping a 100 MB markdown file produces >400 MB
// of DOM and hangs the webview. Truncate to 1 MB with a visible banner.
const PREVIEW_MAX_BYTES = 1_000_000;

function buildPreviewHtml(markdown, theme) {
    // Minimal preview: dumps markdown into a <pre> block with a note that
    // full rendering requires the bundled <mdz-viewer>. That bundle isn't
    // yet shipped with the extension (Phase 2.5 build pipeline is a
    // separate deliverable — see browser-extension/vendor/).
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

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

module.exports = { activate, deactivate };
