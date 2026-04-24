/**
 * Import command — converts a Jupyter Notebook (.ipynb) into an MDZ archive.
 *
 * Per ROADMAP Phase 2.4 this is the #1 adoption on-ramp: every researcher
 * with an analysis notebook can produce an MDZ submission without touching
 * the spec.
 *
 * Scope of this implementation:
 *   - Code cells → ::cell{language kernel execution_count} + fenced source
 *   - Stream outputs (stdout/stderr) → ::output{type="text"}
 *   - display_data / execute_result outputs with MIME bundles:
 *       * image/png, image/jpeg → extracted to assets/images/, ::output{type="image" src=...}
 *       * text/plain             → ::output{type="text"} inline
 *       * text/html              → ::output{type="html"} inline (sanitized by viewer)
 *       * application/json       → ::output{type="json"} inline
 *       * application/vnd.jupyter.widget-state+json → WARN + dropped (no MDZ equivalent)
 *   - Markdown cells → raw Markdown in document.md (preserves headings, lists, math)
 *   - Notebook metadata:
 *       * metadata.kernelspec           → interactivity.kernels[0]
 *       * metadata.language_info        → kernel.language + version
 *       * metadata.authors              → document.authors (if present)
 *       * metadata.title / filename     → document.title (filename fallback)
 *
 * Non-scope:
 *   - Raw cells (ipynb `raw` type) — kept as fenced code blocks with
 *     language="raw"; downstream viewers can decide what to do.
 *   - Widgets / comms — these require a running kernel and have no MDZ
 *     representation today. The archive carries a WARN in manifest.custom.
 *   - Notebook-level ToC / bookmarks — not part of the ipynb standard.
 *
 * Exit codes:
 *   0 — success
 *   1 — IO error (file not found, can't write output, etc.)
 *   2 — ipynb format error (invalid JSON, missing required fields)
 */


const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const chalk = require('chalk');
const ora = require('ora');

// Map of ipynb MIME types -> MDZ ::output type. Anything not on the list is
// either dropped with a warning or (for image/*) extracted to assets/.
const MIME_TO_OUTPUT_TYPE = {
    'text/plain': 'text',
    'text/html': 'html',
    'text/markdown': 'markdown',
    'text/latex': 'latex',
    'application/json': 'json',
};

// Dropped MIME types with per-type warning reasons — helps users understand
// why part of their output didn't survive the conversion.
const DROPPED_MIME_REASONS = {
    'application/vnd.jupyter.widget-state+json':
        'interactive widgets require a live kernel; MDZ cells embed cached output only',
    'application/vnd.jupyter.widget-view+json':
        'interactive widgets require a live kernel; MDZ cells embed cached output only',
    'application/javascript':
        'executable JS in outputs is dropped for security; viewer sandbox forbids script execution',
};

async function importIpynb(inputPath, options) {
    const spinner = ora('Reading notebook...').start();
    try {
        const absIn = path.resolve(inputPath);
        if (!fs.existsSync(absIn)) {
            spinner.fail(chalk.red(`File not found: ${absIn}`));
            process.exit(1);
        }

        const raw = fs.readFileSync(absIn, 'utf8');
        let nb;
        try {
            nb = JSON.parse(raw);
        } catch (e) {
            spinner.fail(chalk.red(`Not valid JSON: ${e.message}`));
            process.exit(2);
        }
        if (!nb.cells || !Array.isArray(nb.cells)) {
            spinner.fail(chalk.red('Not a valid .ipynb: missing cells array'));
            process.exit(2);
        }

        const outPath = path.resolve(
            options.output ||
                path.join(
                    path.dirname(absIn),
                    path.basename(absIn, '.ipynb') + '.mdz',
                ),
        );

        spinner.text = 'Converting cells...';
        const conversion = convertNotebook(nb, absIn);

        spinner.text = 'Writing archive...';
        writeArchive(outPath, conversion);

        spinner.succeed(chalk.green(`Wrote ${path.basename(outPath)}`));

        // Report conversion stats
        console.log();
        console.log(chalk.bold('Conversion summary:'));
        console.log(`  Code cells:      ${conversion.stats.codeCells}`);
        console.log(`  Markdown cells:  ${conversion.stats.markdownCells}`);
        console.log(`  Raw cells:       ${conversion.stats.rawCells}`);
        console.log(`  Image outputs:   ${conversion.stats.imageOutputs}`);
        console.log(`  Text outputs:    ${conversion.stats.textOutputs}`);
        if (conversion.warnings.length > 0) {
            console.log();
            console.log(chalk.yellow(`  Warnings (${conversion.warnings.length}):`));
            for (const w of conversion.warnings.slice(0, 10)) {
                console.log(chalk.yellow(`    - ${w}`));
            }
            if (conversion.warnings.length > 10) {
                console.log(
                    chalk.yellow(
                        `    ...and ${conversion.warnings.length - 10} more (see manifest.custom.import_warnings)`,
                    ),
                );
            }
        }
        console.log();
        console.log(`Next:  ${chalk.white('mdz view ' + path.relative(process.cwd(), outPath))}`);
    } catch (error) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        if (error.stack) console.error(error.stack);
        process.exit(1);
    }
}

/**
 * Convert a parsed ipynb object into { markdown, assets, manifest, stats, warnings }.
 * Pure function for testability — no filesystem side effects.
 */
function convertNotebook(nb, sourcePath) {
    const stats = {
        codeCells: 0,
        markdownCells: 0,
        rawCells: 0,
        imageOutputs: 0,
        textOutputs: 0,
    };
    const warnings = [];
    const assets = new Map(); // path -> Buffer
    const mdSections = [];

    const kernelspec = (nb.metadata && nb.metadata.kernelspec) || {};
    const languageInfo = (nb.metadata && nb.metadata.language_info) || {};
    const defaultLang = (languageInfo.name || kernelspec.language || '').toLowerCase();
    const kernelId = kernelspec.name || defaultLang || 'default';

    let imageCounter = 0;

    for (const cell of nb.cells) {
        if (cell.cell_type === 'markdown') {
            stats.markdownCells++;
            mdSections.push(getCellSource(cell));
        } else if (cell.cell_type === 'raw') {
            stats.rawCells++;
            const src = getCellSource(cell);
            mdSections.push('```raw\n' + src + '\n```');
        } else if (cell.cell_type === 'code') {
            stats.codeCells++;
            const cellMd = renderCodeCell(cell, {
                language: defaultLang,
                kernel: kernelId,
                onImage: (mimeType, bytes) => {
                    imageCounter++;
                    const ext = mimeType === 'image/png' ? '.png' : '.jpg';
                    const assetPath = `assets/images/cell-${imageCounter}${ext}`;
                    assets.set(assetPath, bytes);
                    stats.imageOutputs++;
                    return assetPath;
                },
                onText: () => {
                    stats.textOutputs++;
                },
                onWarning: (msg) => warnings.push(msg),
            });
            mdSections.push(cellMd);
        } else {
            warnings.push(`unknown cell_type: ${cell.cell_type} (skipped)`);
        }
    }

    const manifest = buildManifest(nb, {
        kernelspec,
        languageInfo,
        kernelId,
        sourcePath,
        warnings,
    });

    return {
        markdown: mdSections.join('\n\n'),
        assets,
        manifest,
        stats,
        warnings,
    };
}

function getCellSource(cell) {
    // ipynb source can be a string OR an array of strings (one per line).
    // Arrays typically include trailing \n on each line, so joining with ''
    // is correct — joining with '\n' would double-space.
    if (Array.isArray(cell.source)) return cell.source.join('');
    return cell.source || '';
}

function renderCodeCell(cell, ctx) {
    const src = getCellSource(cell);
    const lang = ctx.language || '';
    const kernel = ctx.kernel || '';
    const execCount = cell.execution_count;

    // Directive attrs — only include execution_count if the notebook actually
    // ran the cell (null/undefined means "not yet executed").
    const attrs = [`language="${lang}"`, `kernel="${kernel}"`];
    if (typeof execCount === 'number' && execCount >= 0) {
        attrs.push(`execution_count=${execCount}`);
    }

    const parts = [`::cell{${attrs.join(' ')}}`];
    parts.push('```' + lang);
    parts.push(src.replace(/\n+$/, ''));
    parts.push('```');

    for (const out of cell.outputs || []) {
        const rendered = renderOutput(out, ctx);
        if (rendered) {
            parts.push('');
            parts.push(rendered);
        }
    }

    return parts.join('\n');
}

// Jupyter output fields are often `string | string[]` where arrays contain
// one entry per line (each typically already trailing a \n). Joining with
// '' is correct; '\n' would double-space.
function joinMultiline(v) {
    return Array.isArray(v) ? v.join('') : (v || '');
}

function formatFencedOutput(type, body) {
    return `::output{type="${type}"}\n\`\`\`\n${String(body).replace(/\n+$/, '')}\n\`\`\``;
}

function renderOutput(out, ctx) {
    if (out.output_type === 'stream') {
        ctx.onText();
        return formatFencedOutput('text', joinMultiline(out.text));
    }

    if (out.output_type === 'error') {
        // Render tracebacks as text output. Strip ANSI escape codes for
        // readability; downstream viewers can re-apply via highlight.
        const tb = (out.traceback || []).map(stripAnsi).join('\n');
        const ename = out.ename || '';
        const evalue = out.evalue || '';
        // If all three fields are effectively empty, the original
        // notebook had a malformed error output. Warn rather than emit
        // a cell ending in a cryptic "Error:" line.
        if (!ename && !evalue && !tb.trim()) {
            ctx.onWarning('cell has an error output with no ename/evalue/traceback — dropped');
            return null;
        }
        ctx.onText();
        const body = `${ename || 'Error'}: ${evalue}\n${tb}`.trim();
        return formatFencedOutput('text', body);
    }

    if (
        out.output_type === 'display_data' ||
        out.output_type === 'execute_result'
    ) {
        const data = out.data || {};
        // Preference order: image > html > markdown > latex > json > plain.
        // Same as JupyterLab — if a cell emits both html and plain, html wins.
        if (data['image/png'] || data['image/jpeg']) {
            const mime = data['image/png'] ? 'image/png' : 'image/jpeg';
            const bytes = Buffer.from(joinMultiline(data[mime]), 'base64');
            const assetPath = ctx.onImage(mime, bytes);
            return `::output{type="image" mime="${mime}" src="${assetPath}"}`;
        }
        for (const mime of ['text/html', 'text/markdown', 'text/latex', 'application/json']) {
            if (data[mime]) {
                ctx.onText();
                const type = MIME_TO_OUTPUT_TYPE[mime];
                const body = Array.isArray(data[mime]) ? data[mime].join('') : data[mime];
                const serialized =
                    typeof body === 'string' ? body : JSON.stringify(body, null, 2);
                return formatFencedOutput(type, serialized);
            }
        }
        if (data['text/plain']) {
            ctx.onText();
            return formatFencedOutput('text', joinMultiline(data['text/plain']));
        }
        // Dropped MIME types — warn per configured reason.
        for (const mime of Object.keys(data)) {
            const reason = DROPPED_MIME_REASONS[mime];
            ctx.onWarning(
                reason
                    ? `dropped ${mime}: ${reason}`
                    : `dropped unsupported MIME type in cell output: ${mime}`,
            );
        }
        return null;
    }

    ctx.onWarning(`unknown output_type: ${out.output_type} (skipped)`);
    return null;
}

function stripAnsi(s) {
    // Narrow regex — covers standard ANSI CSI sequences from Jupyter
    // tracebacks. Escape sequences in traceback text would render as
    // garbage in the viewer otherwise.
    return String(s).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

function buildManifest(nb, ctx) {
    const now = new Date().toISOString();
    const nbMeta = nb.metadata || {};
    const title =
        nbMeta.title ||
        (ctx.sourcePath ? path.basename(ctx.sourcePath, '.ipynb') : 'Imported Notebook');

    const authors = Array.isArray(nbMeta.authors)
        ? nbMeta.authors.map((a) =>
              typeof a === 'string' ? { name: a } : { name: a.name, email: a.email },
          )
        : undefined;

    const manifest = {
        mdx_version: '2.0.0',
        document: {
            id: crypto.randomUUID(),
            title: title,
            created: now,
            modified: now,
            version: '1.0.0',
            language: nbMeta.lang || 'en-US',
        },
        content: {
            entry_point: 'document.md',
            encoding: 'UTF-8',
            markdown_variant: 'CommonMark',
            extensions: ['tables', 'attributes', 'cell', 'include'],
        },
        interactivity: {
            kernels: [
                {
                    id: ctx.kernelId,
                    language: (ctx.languageInfo.name || ctx.kernelspec.language || 'unknown').toLowerCase(),
                    version: ctx.languageInfo.version || undefined,
                },
            ],
            fallback_behavior: 'show-cached-output',
        },
    };

    if (authors) manifest.document.authors = authors;

    // Stash conversion provenance in custom so reviewers know how the
    // archive was built.
    manifest.custom = {
        import_source: {
            kind: 'jupyter-notebook',
            path: ctx.sourcePath ? path.basename(ctx.sourcePath) : undefined,
            nbformat: nb.nbformat,
            nbformat_minor: nb.nbformat_minor,
            converted_at: now,
            tool: 'mdz import-ipynb',
        },
    };
    if (ctx.warnings.length > 0) {
        manifest.custom.import_warnings = ctx.warnings;
    }

    return manifest;
}

function writeArchive(outPath, conversion) {
    const zip = new AdmZip();
    // Normative ordering (v2.0 §10.2) — manifest.json first.
    zip.addFile(
        'manifest.json',
        Buffer.from(JSON.stringify(conversion.manifest, null, 2), 'utf8'),
    );
    zip.addFile('document.md', Buffer.from(conversion.markdown, 'utf8'));
    for (const [assetPath, bytes] of conversion.assets.entries()) {
        zip.addFile(assetPath, bytes);
    }
    zip.writeZip(outPath);
}

module.exports = importIpynb;
module.exports.convertNotebook = convertNotebook; // exposed for unit tests
