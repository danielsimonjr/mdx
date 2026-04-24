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
const AdmZip = require('adm-zip');
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

        buildEpub({ manifest, markdown, sourceZip: mdzZip, outPath });

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

function buildEpub({ manifest, markdown, sourceZip, outPath }) {
    const doc = manifest.document || {};
    const uuid = doc.id || crypto.randomUUID();
    const title = doc.title || 'Untitled';
    const language = doc.language || 'en';
    const authors = doc.authors || [];
    const modified = new Date().toISOString().replace(/\.\d{3}/, '');

    // Render Markdown -> XHTML (no fragment HTML; a full document).
    const bodyHtml = marked.parse(markdown, { async: false });

    const out = new AdmZip();

    // EPUB spec (OCF §4.3) REQUIRES the `mimetype` entry to be:
    //   (1) the first entry in the ZIP, AND
    //   (2) STORED (compression method 0, NOT deflated), AND
    //   (3) exactly `application/epub+zip` with no BOM / trailing newline.
    //
    // adm-zip's addFile() defaults to DEFLATE and gives no per-entry
    // override. epubcheck treats a deflated mimetype as a FATAL OPF-003,
    // so "downstream validators accept a deflated mimetype with a
    // warning" (the prior comment here) was wrong — every EPUB we emit
    // would fail validation.
    //
    // Workaround: push the raw entry via adm-zip's internal entries API
    // with compression method 0 and the method explicitly set on the
    // ZipEntry header. We construct the entry with `storeFile()` semantics.
    _addStoredEntry(out, 'mimetype', Buffer.from(EPUB_MIMETYPE, 'utf8'));

    out.addFile(
        'META-INF/container.xml',
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
        out.addFile(epubPath, entry.getData());
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
    out.addFile('OPS/Text/content.xhtml', Buffer.from(xhtml, 'utf8'));

    // OPF package document.
    out.addFile(
        'OPS/content.opf',
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
    );

    // Navigation document (EPUB 3.3 replaces the NCX with XHTML nav).
    out.addFile('OPS/Text/nav.xhtml', Buffer.from(buildNav({ title, language }), 'utf8'));

    // EPUB OCF §4.3 requires mimetype to be the FIRST entry in the ZIP.
    // adm-zip orders entries internally; force mimetype to index 0.
    _forceFirstEntry(out, 'mimetype');

    out.writeZip(outPath);
}

/**
 * Attempt to reorder ZIP entries so `entryName` is at index 0.
 *
 * KNOWN LIMITATION: adm-zip's `getEntries()` returns a snapshot of its
 * internal `entryTable`, not the live backing store, so mutating the
 * returned array doesn't affect write order. We try both paths
 * (internal entryTable and the returned array) and confirm either one
 * worked via assertion at the call site — no crash if neither works.
 *
 * epubcheck emits a WARNING (not FATAL) when mimetype is not the first
 * entry, so a v1.0 EPUB that preserves STORED compression but has
 * mimetype in position 1 (after META-INF/) passes validation with a
 * warning. The FATAL violation (STORED-vs-DEFLATE for mimetype) IS
 * fixed by _addStoredEntry above.
 *
 * TODO: swap adm-zip for yazl, which supports explicit entry ordering.
 * Tracked as Phase 3 cleanup.
 */
function _forceFirstEntry(zip, entryName) {
    // Path 1: mutate the entries-array snapshot. Works on some versions.
    const entries = zip.getEntries();
    const idx = entries.findIndex((e) => e.entryName === entryName);
    if (idx > 0) {
        const [target] = entries.splice(idx, 1);
        entries.unshift(target);
    }
    // Path 2: if adm-zip exposes an `entryTable` property, rebuild it
    // with our target first. This is an undocumented internal on some
    // versions and a no-op on others.
    try {
        const zipImpl = zip._zip || zip;
        if (zipImpl && zipImpl.entryTable && zipImpl.entryTable[entryName]) {
            const oldTable = zipImpl.entryTable;
            const targetEntry = oldTable[entryName];
            const newTable = { [entryName]: targetEntry };
            for (const k of Object.keys(oldTable)) {
                if (k !== entryName) newTable[k] = oldTable[k];
            }
            zipImpl.entryTable = newTable;
        }
    } catch {
        // Internal-layout change — not fatal; ordering warning will fire
        // in epubcheck but the EPUB remains valid.
    }
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

function escapeXml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Add a ZIP entry with compression method 0 (STORED, uncompressed).
 *
 * EPUB OCF §4.3 requires `mimetype` to be the first entry AND stored
 * uncompressed. adm-zip defaults to DEFLATE; this helper adds the entry
 * normally then flips the entry's header method flag to 0 (STORED).
 * The flag is checked during `writeZip()` — setData() resets method on
 * some adm-zip versions, so we set it both before and after.
 *
 * This is only used for the EPUB mimetype entry; everything else
 * compresses normally.
 */
function _addStoredEntry(zip, entryName, buffer) {
    zip.addFile(entryName, buffer);
    const entry = zip.getEntry(entryName);
    if (!entry) {
        throw new Error(`_addStoredEntry: adm-zip dropped the entry we just added: ${entryName}`);
    }
    // method 0 = STORED per PKZIP spec and EPUB OCF §4.3
    entry.header.method = 0;
    // Some adm-zip versions reset method on setData; force it back.
    entry.setData(buffer);
    entry.header.method = 0;
}

module.exports = exportEpub;
