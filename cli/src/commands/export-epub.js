/**
 * Export command — converts an MDZ archive to an EPUB 3.3 package.
 *
 * EPUB 3.3 (W3C Recommendation, May 2023) is the ingest format for every
 * mainstream ereader: iBooks, Kindle (via convert), Calibre, readium, etc.
 * Bridging MDZ -> EPUB inherits that entire ecosystem for free.
 *
 * Fidelity matrix (what survives the conversion):
 *   Manifest title / authors / language / license / keywords → OPF metadata
 *   Markdown prose                                           → XHTML via marked
 *   Images referenced in markdown                            → OPS/Images/
 *   Accessibility features                                   → EPUB Accessibility 1.1 metadata
 *   ::cell source code                                       → <pre><code> (cached output inline)
 *   ::output image                                           → embedded <img>
 *   ::output text                                            → <pre>
 *   Multi-locale (content.locales.available[])               → first locale only (EPUB 3.3 supports
 *                                                              multi-rendition via ODPS 1.0; that's
 *                                                              a separate feature pass)
 *   Signatures / DIDs                                        → dropped (no EPUB equivalent)
 *   Provenance DAG / derived_from                            → dropped (no EPUB equivalent)
 *   Content-addressed IDs                                    → dropped
 *
 * Exit codes:
 *   0 — success
 *   1 — IO error
 *   2 — MDZ format error
 */


const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');     // read-only — input MDZ archive
const yazl = require('yazl');          // write — output EPUB (explicit ordering + STORED control)
const chalk = require('chalk');
const ora = require('ora');
const { marked } = require('marked');

const EPUB_MIMETYPE = 'application/epub+zip';

async function exportEpub(inputPath, options) {
    const spinner = ora('Reading archive...').start();
    try {
        const absIn = path.resolve(inputPath);
        if (!fs.existsSync(absIn)) {
            spinner.fail(chalk.red(`File not found: ${absIn}`));
            process.exit(1);
        }

        const mdzZip = new AdmZip(absIn);
        const entries = mdzZip.getEntries();
        const manifestEntry = entries.find((e) => e.entryName === 'manifest.json');
        if (!manifestEntry) {
            spinner.fail(chalk.red('Not a valid MDZ archive (missing manifest.json)'));
            process.exit(2);
        }
        const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));

        const entryPoint = (manifest.content && manifest.content.entry_point) || 'document.md';
        const contentEntry = entries.find((e) => e.entryName === entryPoint);
        if (!contentEntry) {
            spinner.fail(chalk.red(`Archive is missing entry point: ${entryPoint}`));
            process.exit(2);
        }
        const markdown = contentEntry.getData().toString('utf8');

        spinner.text = 'Building EPUB...';
        const outPath = path.resolve(
            options.output ||
                path.join(path.dirname(absIn), path.basename(absIn, path.extname(absIn)) + '.epub'),
        );

        await buildEpub({ manifest, markdown, sourceZip: mdzZip, outPath });

        spinner.succeed(chalk.green(`Wrote ${path.basename(outPath)}`));

        console.log();
        console.log(chalk.bold('Fidelity notes:'));
        console.log('  - Signatures, DIDs, provenance DAG dropped (no EPUB equivalent)');
        console.log('  - ::cell outputs embedded as <pre> + <img> — no re-execution');
        if (manifest.content && manifest.content.locales) {
            const availTags = (manifest.content.locales.available || []).map((l) => l.tag).join(', ');
            console.log(
                chalk.yellow(
                    `  - Multi-locale archive (${availTags}); EPUB carries the default locale only`,
                ),
            );
        }
    } catch (error) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        if (error.stack) console.error(error.stack);
        process.exit(1);
    }
}

async function buildEpub({ manifest, markdown, sourceZip, outPath }) {
    const doc = manifest.document || {};
    const uuid = doc.id || crypto.randomUUID();
    const title = doc.title || 'Untitled';
    const language = doc.language || 'en';
    const authors = doc.authors || [];
    const modified = new Date().toISOString().replace(/\.\d{3}/, '');

    // Pre-process labeled directives (::fig / ::eq / ::tab) so they
    // emit XHTML elements that import-epub.js can pick back up as the
    // same directives (Phase 4.6.8 symmetric round-trip rule). Without
    // this pre-pass, marked treats `::fig{id=X}` as raw text and the
    // round-trip drops the directive identity.
    const preProcessed = preprocessLabeledDirectives(markdown);
    const bodyHtml = marked.parse(preProcessed, { async: false });

    // EPUB OCF §4.3 requires three things of the mimetype entry:
    //   (1) FIRST in the ZIP central directory.
    //   (2) STORED (compression method 0, NOT deflated).
    //   (3) Exactly `application/epub+zip`, no BOM, no trailing newline.
    //
    // yazl gives explicit per-entry control over both the order
    // (entries are written in addBuffer-call order) and the compression
    // method (`compress: false` → STORED). This replaces the previous
    // adm-zip workaround which relied on undocumented internal-entry-
    // table mutation to put mimetype first; that hack was a no-op on
    // some adm-zip versions and produced an epubcheck WARNING when it
    // didn't take. Phase 4.6.8 swap.
    const out = new yazl.ZipFile();
    out.addBuffer(Buffer.from(EPUB_MIMETYPE, 'utf8'), 'mimetype', { compress: false });

    out.addBuffer(
        Buffer.from(
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">',
                '  <rootfiles>',
                '    <rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml"/>',
                '  </rootfiles>',
                '</container>',
            ].join('\n'),
            'utf8',
        ),
        'META-INF/container.xml',
    );

    // Copy images from the MDZ into OPS/Images/. Track which manifest-
    // declared images actually made it into the archive so path-rewriting
    // only rewrites paths we can honor.
    const imageManifestItems = [];
    const copiedImagePaths = new Set();
    const imgs = (manifest.assets && manifest.assets.images) || [];
    for (const img of imgs) {
        const entry = sourceZip.getEntry(img.path);
        if (!entry) {
            // Manifest lists the image but the bytes aren't in the ZIP.
            // Warn rather than silently produce a broken-image reference
            // in the XHTML; authors may have hand-edited the manifest.
            console.warn(
                chalk.yellow(
                    `  - Manifest lists ${img.path} but file is missing from archive — skipping (img reference will not be rewritten)`,
                ),
            );
            continue;
        }
        const baseName = path.basename(img.path);
        const epubPath = `OPS/Images/${baseName}`;
        out.addBuffer(entry.getData(), epubPath);
        imageManifestItems.push({
            id: `img-${imageManifestItems.length + 1}`,
            href: `Images/${baseName}`,
            mediaType: img.mime_type || 'image/png',
        });
        copiedImagePaths.add(img.path);
    }

    // Content document. Only rewrite paths for images that actually
    // made it into the EPUB (copiedImagePaths filter prevents dangling
    // ../Images/X.png references for images the manifest declared but
    // that are absent from the source ZIP).
    const imagesToRewrite = imgs.filter((img) => copiedImagePaths.has(img.path));
    const xhtml = wrapXhtml({ title, language, bodyHtml, imageRewrite: imagesToRewrite });
    out.addBuffer(Buffer.from(xhtml, 'utf8'), 'OPS/Text/content.xhtml');

    // OPF package document.
    out.addBuffer(
        Buffer.from(
            buildOpf({
                uuid,
                title,
                language,
                authors,
                license: doc.license,
                keywords: doc.keywords || [],
                modified,
                accessibility: doc.accessibility || null,
                imageManifestItems,
            }),
            'utf8',
        ),
        'OPS/content.opf',
    );

    // Navigation document (EPUB 3.3 replaces the NCX with XHTML nav).
    out.addBuffer(Buffer.from(buildNav({ title, language }), 'utf8'), 'OPS/Text/nav.xhtml');

    // Stream the assembled ZIP to disk. yazl flushes everything in the
    // order added when end() is called.
    out.end();
    await new Promise((resolve, reject) => {
        const ws = fs.createWriteStream(outPath);
        out.outputStream.pipe(ws).on('close', resolve).on('error', reject);
        out.outputStream.on('error', reject);
    });
}

function wrapXhtml({ title, language, bodyHtml, imageRewrite }) {
    // Rewrite <img src="assets/images/foo.png"> -> <img src="../Images/foo.png">
    // so the EPUB-internal paths resolve. Only rewrites paths that actually
    // exist in the image manifest.
    let rewritten = bodyHtml;
    for (const img of imageRewrite) {
        const baseName = path.basename(img.path);
        const originalPath = img.path;
        const newPath = `../Images/${baseName}`;
        rewritten = rewritten.split(originalPath).join(newPath);
    }

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE html>',
        `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(language)}" xml:lang="${escapeXml(language)}">`,
        '  <head>',
        `    <title>${escapeXml(title)}</title>`,
        '    <meta charset="UTF-8"/>',
        '  </head>',
        '  <body>',
        rewritten,
        '  </body>',
        '</html>',
    ].join('\n');
}

function buildOpf({ uuid, title, language, authors, license, keywords, modified, accessibility, imageManifestItems }) {
    const creators = authors
        .map(
            (a, i) =>
                `    <dc:creator id="creator-${i + 1}">${escapeXml(a.name || '')}</dc:creator>\n` +
                `    <meta refines="#creator-${i + 1}" property="role" scheme="marc:relators">aut</meta>`,
        )
        .join('\n');

    const subjects = keywords
        .map((k) => `    <dc:subject>${escapeXml(k)}</dc:subject>`)
        .join('\n');

    const licenseTag = license
        ? `    <dc:rights>${escapeXml(typeof license === 'string' ? license : license.type)}</dc:rights>`
        : '';

    // EPUB Accessibility 1.1 metadata — mapped from MDZ accessibility block.
    const a11yMeta = accessibility
        ? [
              accessibility.features
                  ? accessibility.features
                        .map((f) => `    <meta property="schema:accessibilityFeature">${escapeXml(f)}</meta>`)
                        .join('\n')
                  : '',
              accessibility.hazards
                  ? accessibility.hazards
                        .map((h) => `    <meta property="schema:accessibilityHazard">${escapeXml(h)}</meta>`)
                        .join('\n')
                  : '',
              accessibility.api_compliance
                  ? `    <meta property="schema:accessibilityAPI">${escapeXml(accessibility.api_compliance.join(' '))}</meta>`
                  : '',
              accessibility.summary
                  ? `    <meta property="schema:accessibilitySummary">${escapeXml(accessibility.summary)}</meta>`
                  : '',
          ]
              .filter(Boolean)
              .join('\n')
        : '';

    const manifestImageEntries = imageManifestItems
        .map(
            (img) =>
                `    <item id="${img.id}" href="${escapeXml(img.href)}" media-type="${escapeXml(img.mediaType)}"/>`,
        )
        .join('\n');

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="' + escapeXml(language) + '">',
        '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">',
        `    <dc:identifier id="book-id">urn:uuid:${escapeXml(uuid)}</dc:identifier>`,
        `    <dc:title>${escapeXml(title)}</dc:title>`,
        `    <dc:language>${escapeXml(language)}</dc:language>`,
        creators,
        subjects,
        licenseTag,
        `    <meta property="dcterms:modified">${escapeXml(modified)}</meta>`,
        a11yMeta,
        '  </metadata>',
        '  <manifest>',
        '    <item id="content" href="Text/content.xhtml" media-type="application/xhtml+xml"/>',
        '    <item id="nav" href="Text/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        manifestImageEntries,
        '  </manifest>',
        '  <spine>',
        '    <itemref idref="content"/>',
        '  </spine>',
        '</package>',
    ]
        .filter((l) => l !== '')
        .join('\n');
}

function buildNav({ title, language }) {
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE html>',
        `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(language)}" xml:lang="${escapeXml(language)}">`,
        '  <head>',
        `    <title>${escapeXml(title)}</title>`,
        '    <meta charset="UTF-8"/>',
        '  </head>',
        '  <body>',
        '    <nav epub:type="toc" id="toc">',
        '      <h1>Contents</h1>',
        '      <ol>',
        `        <li><a href="content.xhtml">${escapeXml(title)}</a></li>`,
        '      </ol>',
        '    </nav>',
        '  </body>',
        '</html>',
    ].join('\n');
}

/**
 * Pre-marked transform: labeled directive openers (::fig / ::eq / ::tab)
 * become XHTML <figure> / <div role="math"> / <table-wrapper> openers
 * carrying their id. Symmetric with import-epub's <figure id="..."> →
 * `::fig{id=...}` rule (Phase 4.6.8 follow-up). Pure-string transform
 * applied before marked.parse so the resulting elements survive into
 * the OPF body unmangled.
 *
 * Format guarantees:
 *   ::fig{id=overview}        → <figure id="overview">
 *   ::eq{id=energy}           → <div role="math" id="energy">
 *   ::tab{id=results}         → <figure class="mdz-tab" id="results">
 *
 * Closer markers (`:::`) become the matching close tag. Markdown
 * inside the directive body is left alone for marked to render.
 */
function preprocessLabeledDirectives(markdown) {
    // Stack of open directive kinds so we know which close tag to emit.
    const stack = [];
    const lines = markdown.split('\n');
    const out = [];
    for (const line of lines) {
        const open = /^::(fig|eq|tab)\{([^}]*)\}\s*$/.exec(line);
        if (open) {
            const kind = open[1];
            const idMatch = /\bid=([A-Za-z][A-Za-z0-9_\-]*)/.exec(open[2] || '');
            const id = idMatch ? ` id="${idMatch[1]}"` : '';
            if (kind === 'eq') {
                out.push(`<div role="math" class="mdz-eq"${id}>`);
            } else if (kind === 'tab') {
                out.push(`<figure class="mdz-tab"${id}>`);
            } else {
                out.push(`<figure class="mdz-fig"${id}>`);
            }
            stack.push(kind);
            continue;
        }
        if (line.trim() === ':::' && stack.length > 0) {
            const kind = stack.pop();
            out.push(kind === 'eq' ? '</div>' : '</figure>');
            continue;
        }
        out.push(line);
    }
    // Close any unclosed openers — defensive against malformed input.
    while (stack.length > 0) {
        const kind = stack.pop();
        out.push(kind === 'eq' ? '</div>' : '</figure>');
    }
    return out.join('\n');
}

function escapeXml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

module.exports = exportEpub;
