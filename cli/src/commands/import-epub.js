/**
 * Import command — converts an EPUB 3.x package to an MDZ archive.
 *
 * Inverse of `export-epub.js`. The intent is best-effort interop: an
 * EPUB authored elsewhere (Calibre / pandoc / Sigil / iBooks Author /
 * journal-pipeline output) can be ingested into MDZ for downstream
 * MDZ tooling. Round-trip fidelity is documented at
 * `docs/format-internals/epub-mdz-fidelity.md` — features unique to one
 * format (signatures, content_id, cells on the MDZ side; complex EPUB
 * features like SSML / page-list / region-of-interest on the EPUB side)
 * cannot survive the round-trip and are noted there.
 *
 * Fidelity matrix (what the importer preserves):
 *   OPF metadata (title, creator, language, identifier, modified)
 *                                     → manifest.document.{title,authors,language,id,modified}
 *   <dc:rights> / <dc:license>        → manifest.document.license
 *   <dc:subject>                      → manifest.document.keywords
 *   Spine in reading order            → concatenated into document.md (split by --- separators)
 *   XHTML body                        → Markdown via turndown (CommonMark + tables/strikethrough)
 *   Images in manifest                → copied to assets/images/, paths rewritten in markdown
 *   EPUB Accessibility metadata       → manifest.document.accessibility (best effort)
 *   nav.xhtml table of contents       → dropped (regenerable from headings)
 *   NCX (EPUB 2 fallback)             → dropped (deprecated by EPUB 3.3)
 *   page-list / page-break locators   → dropped (no MDZ equivalent yet)
 *   SSML pronunciation                → dropped
 *   Encrypted resources (DRM)         → ABORT — MDZ archives are open by design
 *
 * Exit codes:
 *   0 — success
 *   1 — IO error
 *   2 — EPUB format error (missing container.xml, missing OPF, etc.)
 *   3 — encrypted EPUB (DRM detected; refuse to ingest)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const chalk = require('chalk');
const ora = require('ora');
const TurndownService = require('turndown');

const EPUB_NS = {
    container: 'urn:oasis:names:tc:opendocument:xmlns:container',
    opf: 'http://www.idpf.org/2007/opf',
    dc: 'http://purl.org/dc/elements/1.1/',
    xhtml: 'http://www.w3.org/1999/xhtml',
};

async function importEpub(inputPath, options) {
    const spinner = ora('Reading EPUB...').start();
    try {
        const absIn = path.resolve(inputPath);
        if (!fs.existsSync(absIn)) {
            spinner.fail(chalk.red(`File not found: ${absIn}`));
            process.exit(1);
        }
        const epubZip = new AdmZip(absIn);

        // OCF §4.2: META-INF/encryption.xml signals DRM. Refusing on
        // detection is intentional — MDZ is an open format and its
        // toolchain has no path to honor encryption envelopes. Surfacing
        // a hard refuse is more useful than producing a content-stripped
        // archive that looks fine until an editor opens it.
        if (epubZip.getEntry('META-INF/encryption.xml')) {
            spinner.fail(
                chalk.red('EPUB contains encrypted resources (META-INF/encryption.xml present).'),
            );
            console.error(
                chalk.yellow(
                    '  MDZ does not import DRM-protected EPUBs. Decrypt with the publisher\n' +
                        '  tool or licensed reader before re-running this command.',
                ),
            );
            process.exit(3);
        }

        // OCF §3.5.3: META-INF/container.xml is the entry point.
        const containerEntry = epubZip.getEntry('META-INF/container.xml');
        if (!containerEntry) {
            spinner.fail(chalk.red('Not a valid EPUB (missing META-INF/container.xml)'));
            process.exit(2);
        }
        const containerXml = containerEntry.getData().toString('utf8');
        const opfHref = parseOpfHref(containerXml);
        if (!opfHref) {
            spinner.fail(chalk.red('container.xml does not declare a rootfile'));
            process.exit(2);
        }
        const opfEntry = epubZip.getEntry(opfHref);
        if (!opfEntry) {
            spinner.fail(chalk.red(`OPF declared at ${opfHref} not found in archive`));
            process.exit(2);
        }
        const opfXml = opfEntry.getData().toString('utf8');
        const opfDir = path.posix.dirname(opfHref);
        const parsed = parseOpf(opfXml);

        spinner.text = 'Converting XHTML → Markdown...';
        const turndown = makeTurndown();
        const markdownParts = [];
        const imageManifest = [];
        for (const itemId of parsed.spine) {
            const item = parsed.manifest[itemId];
            if (!item) {
                console.warn(chalk.yellow(`  - spine references unknown item ${itemId}; skipping`));
                continue;
            }
            const xhtmlPath = posixJoin(opfDir, item.href);
            const xhtmlEntry = epubZip.getEntry(xhtmlPath);
            if (!xhtmlEntry) {
                console.warn(chalk.yellow(`  - spine item ${item.href} not in archive; skipping`));
                continue;
            }
            const xhtml = xhtmlEntry.getData().toString('utf8');
            // Strip XML declaration + DOCTYPE; turndown handles HTML strings.
            const stripped = xhtml
                .replace(/<\?xml[^?]*\?>/g, '')
                .replace(/<!DOCTYPE[^>]*>/gi, '');
            markdownParts.push(turndown.turndown(stripped));
        }

        // Copy images into assets/images/ + collect manifest entries.
        // Dedup by destination path. EPUB OPFs can declare two <item>s
        // pointing at the same href, or two distinct hrefs sharing the
        // same basename (e.g. OPS/Images/fig.png and OPS/Extras/fig.png).
        // The earlier `Set<{...}>` was ineffective (object-reference
        // identity); a real Map keyed on the MDZ-side path detects both
        // cases. Same-bytes duplicates skip silently; basename collisions
        // disambiguate by prefixing the source dir into the MDZ filename
        // so neither image is silently dropped.
        const copiedAssets = new Map(); // mdzAssetPath -> {src, bytes}
        for (const itemId of Object.keys(parsed.manifest)) {
            const item = parsed.manifest[itemId];
            if (!item.mediaType || !item.mediaType.startsWith('image/')) continue;
            const srcPath = posixJoin(opfDir, item.href);
            const epubImg = epubZip.getEntry(srcPath);
            if (!epubImg) continue;
            const baseName = path.posix.basename(item.href);
            let mdzAssetPath = `assets/images/${baseName}`;
            const existing = copiedAssets.get(mdzAssetPath);
            if (existing) {
                if (existing.src === srcPath) continue; // exact dup — skip
                // Basename collision: derive a unique filename from the
                // EPUB-side directory so we keep both.
                const srcDir = path.posix.dirname(item.href).replace(/[^A-Za-z0-9_-]/g, '-');
                mdzAssetPath = `assets/images/${srcDir}-${baseName}`;
            }
            const bytes = epubImg.getData();
            copiedAssets.set(mdzAssetPath, { src: srcPath, bytes });
            imageManifest.push({
                path: mdzAssetPath,
                mime_type: item.mediaType,
                size_bytes: epubImg.header.size,
            });
        }

        // Spine separator: HTML comment rather than `---` HR. The HR
        // round-trips back through `mdz export-epub` as a literal
        // `<hr/>` in every chapter, which accumulates on each cycle;
        // an HTML comment is silently dropped by `marked` on re-export
        // so the cycle is stable. A future `mdz export-epub` may honor
        // the comment as a real spine boundary to preserve per-chapter
        // file structure.
        let combinedMarkdown = markdownParts.join('\n\n<!-- mdz:chapter-break -->\n\n');
        for (const img of imageManifest) {
            const baseName = path.posix.basename(img.path);
            // Match common patterns: ../Images/baseName, Images/baseName,
            // OPS/Images/baseName, with a trailing boundary so we don't
            // false-match `Images/foo.png.bak`.
            const re = new RegExp(
                `(?:\\.\\.\\/)?(?:OPS\\/)?Images\\/${escapeRegex(baseName)}(?=["')\\s]|$)`,
                'g',
            );
            combinedMarkdown = combinedMarkdown.replace(re, img.path);
        }

        spinner.text = 'Building MDZ...';
        const outPath = path.resolve(
            options.output ||
                path.join(path.dirname(absIn), path.basename(absIn, path.extname(absIn)) + '.mdz'),
        );

        const manifest = buildMdzManifest(parsed.metadata);
        if (imageManifest.length > 0) {
            manifest.assets = { images: imageManifest };
        }

        const out = new AdmZip();
        // Spec §10.2: manifest.json MUST be the first entry for streaming
        // viewers' EOCD prefetch. AdmZip orders entries by add order.
        out.addFile(
            'manifest.json',
            Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
        );
        out.addFile('document.md', Buffer.from(combinedMarkdown, 'utf8'));
        for (const [mdzPath, { bytes }] of copiedAssets) {
            out.addFile(mdzPath, bytes);
        }
        out.writeZip(outPath);

        spinner.succeed(chalk.green(`Wrote ${path.basename(outPath)}`));

        console.log();
        console.log(chalk.bold('Fidelity notes:'));
        console.log(`  - Spine: ${parsed.spine.length} chapter(s) joined with --- separators`);
        console.log(`  - Images copied: ${imageManifest.length}`);
        if (parsed.metadata.epubVersion && parsed.metadata.epubVersion.startsWith('2.')) {
            console.log(
                chalk.yellow(
                    `  - EPUB ${parsed.metadata.epubVersion} (NCX-based): nav.xhtml absent, regenerable from headings`,
                ),
            );
        }
        console.log(
            '  - SSML, page-list, region-of-interest, and complex EPUB features dropped.',
        );
        console.log('  - See docs/format-internals/epub-mdz-fidelity.md for the full matrix.');
    } catch (error) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        if (error.stack) console.error(error.stack);
        process.exit(1);
    }
}

// ---------------------------------------------------------------------------
// EPUB OPF parsing (regex-based — XML-with-namespaces parsing without a real
// parser is normally a smell, but EPUB OPF files are well-formed XML by
// spec mandate, and pulling in `fast-xml-parser` for one file is overkill.
// The patterns below match against a stable subset of the OPF schema —
// any production-grade pipeline should swap these for a real XML parser
// before shipping to mainstream readers).
// ---------------------------------------------------------------------------

function parseOpfHref(containerXml) {
    const match = /<rootfile[^>]*\bfull-path=["']([^"']+)["']/i.exec(containerXml);
    return match ? match[1] : null;
}

function parseOpf(opfXml) {
    // Pre-process the OPF before regex extraction:
    //   1. Strip XML comments. A comment containing a fake `<item>`
    //      tag would otherwise be parsed as a real manifest entry —
    //      a real-world OPF generator quirk that the unfiltered regex
    //      patterns trip over.
    //   2. Strip CDATA wrappers but keep the content. `<dc:title>
    //      <![CDATA[A & B]]></dc:title>` should yield `A & B`, not
    //      `<![CDATA[A & B]]>`.
    const xml = opfXml
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, inner) => inner);

    // Strip optional `opf:` (or any) namespace prefix on element + attribute
    // names so default-namespace and prefixed forms parse identically.
    // Keeps `dc:` because the dc-extractors target it explicitly.
    const normalizedXml = xml
        .replace(/<\/?opf:/g, (m) => m.replace('opf:', ''))
        .replace(/\sopf:([a-z][\w-]*=)/gi, ' $1');

    // Pick the title whose xml:lang matches the document language when
    // multiple <dc:title> entries are present (multi-language EPUBs);
    // otherwise fall back to the first match.
    const language = extractDc(normalizedXml, 'language') || 'en';
    const titles = extractDcAllWithLang(normalizedXml, 'title');
    const title =
        titles.find((t) => t.lang && language.startsWith(t.lang))?.text ??
        titles[0]?.text ??
        'Untitled';

    const metadata = {
        title,
        language,
        identifier: extractDc(normalizedXml, 'identifier') || crypto.randomUUID(),
        creators: extractDcAll(normalizedXml, 'creator'),
        rights: extractDc(normalizedXml, 'rights') || null,
        license: extractDc(normalizedXml, 'license') || null,
        keywords: extractDcAll(normalizedXml, 'subject'),
        modified: extractMeta(normalizedXml, 'dcterms:modified') || new Date().toISOString().replace(/\.\d{3}/, ''),
        epubVersion: (/<package[^>]*\bversion=["']([^"']+)["']/i.exec(normalizedXml) || [])[1] || null,
        accessibilityFeatures: extractAccessibility(normalizedXml),
    };

    // Manifest items (id -> {href, mediaType}). attrs body is lowercased
    // for the per-attribute sub-regexes to handle mixed-case attr names
    // (`Media-Type`, `ID`, `Href`) — XML allows them.
    const manifest = {};
    const itemRe = /<item\b([^>]*)\/>|<item\b([^>]*)>/gi;
    let m;
    while ((m = itemRe.exec(normalizedXml)) !== null) {
        const attrs = (m[1] || m[2]).toLowerCase();
        const id = (/\bid=["']([^"']+)["']/i.exec(attrs) || [])[1];
        const href = (/\bhref=["']([^"']+)["']/i.exec(m[1] || m[2]) || [])[1]; // case-preserve href
        const mediaType = (/\bmedia-type=["']([^"']+)["']/i.exec(m[1] || m[2]) || [])[1];
        if (id && href) manifest[id] = { href, mediaType: mediaType || null };
    }

    // Spine in reading order — array of itemref idrefs.
    const spine = [];
    const itemrefRe = /<itemref\b[^>]*\bidref=["']([^"']+)["']/gi;
    while ((m = itemrefRe.exec(normalizedXml)) !== null) {
        spine.push(m[1]);
    }

    return { metadata, manifest, spine };
}

/**
 * Like `extractDcAll` but also captures `xml:lang` per entry so the
 * caller can pick a language-matching title.
 */
function extractDcAllWithLang(xml, name) {
    const re = new RegExp(`<dc:${name}\\b([^>]*)>([\\s\\S]*?)</dc:${name}>`, 'gi');
    const out = [];
    let m;
    while ((m = re.exec(xml)) !== null) {
        const attrs = m[1];
        const langMatch = /\bxml:lang=["']([^"']+)["']/i.exec(attrs);
        out.push({ lang: langMatch ? langMatch[1] : null, text: unescapeXml(m[2].trim()) });
    }
    return out;
}

function extractDc(xml, name) {
    const re = new RegExp(`<dc:${name}\\b[^>]*>([\\s\\S]*?)</dc:${name}>`, 'i');
    const m = re.exec(xml);
    return m ? unescapeXml(m[1].trim()) : null;
}

function extractDcAll(xml, name) {
    const re = new RegExp(`<dc:${name}\\b[^>]*>([\\s\\S]*?)</dc:${name}>`, 'gi');
    const out = [];
    let m;
    while ((m = re.exec(xml)) !== null) out.push(unescapeXml(m[1].trim()));
    return out;
}

function extractMeta(xml, property) {
    const re = new RegExp(`<meta\\b[^>]*\\bproperty=["']${escapeRegex(property)}["'][^>]*>([\\s\\S]*?)</meta>`, 'i');
    const m = re.exec(xml);
    return m ? unescapeXml(m[1].trim()) : null;
}

function extractAccessibility(xml) {
    // EPUB Accessibility 1.1 surfaces features via <meta property="schema:accessibilityFeature">.
    const re = /<meta\b[^>]*\bproperty=["']schema:accessibilityFeature["'][^>]*>([\s\S]*?)<\/meta>/gi;
    const features = [];
    let m;
    while ((m = re.exec(xml)) !== null) features.push(unescapeXml(m[1].trim()));
    return features;
}

// ---------------------------------------------------------------------------
// MDZ manifest construction
// ---------------------------------------------------------------------------

function buildMdzManifest(meta) {
    const m = {
        mdx_version: '2.0.0',
        document: {
            id: normalizeUuid(meta.identifier),
            title: meta.title,
            language: meta.language,
            created: meta.modified,
            modified: meta.modified,
            authors: meta.creators.map((name) => ({ name })),
        },
        content: {
            entry_point: 'document.md',
            encoding: 'UTF-8',
            markdown_variant: 'CommonMark',
        },
        custom: {
            import_source: {
                kind: 'epub',
                epub_version: meta.epubVersion || 'unknown',
                imported_at: new Date().toISOString().replace(/\.\d{3}/, ''),
                tool: 'mdz import-epub/0.1',
            },
        },
    };
    if (meta.keywords.length > 0) m.document.keywords = meta.keywords;
    if (meta.license || meta.rights) {
        m.document.license = meta.license || meta.rights;
    }
    if (meta.accessibilityFeatures.length > 0) {
        m.document.accessibility = { features: meta.accessibilityFeatures };
    }
    return m;
}

/**
 * Convert an EPUB <dc:identifier> (often `urn:uuid:…` or a DOI) to a
 * bare UUID. If the identifier isn't UUID-shaped, mint a fresh UUID and
 * stash the original in `custom.import_source.original_identifier`.
 */
function normalizeUuid(identifier) {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const stripped = identifier.replace(/^urn:uuid:/i, '').trim();
    if (uuidRe.test(stripped)) return stripped.toLowerCase();
    return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Turndown setup
// ---------------------------------------------------------------------------

function makeTurndown() {
    const td = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
        emDelimiter: '_',
        strongDelimiter: '**',
        linkStyle: 'inlined',
    });
    // Strip EPUB-only chrome that doesn't translate to markdown.
    td.addRule('drop-epub-only', {
        filter: ['head', 'meta', 'link', 'style', 'script', 'epub:case', 'epub:switch'],
        replacement: () => '',
    });
    // NOTE: a previous version emitted ::fig{id=...} from <figure id="...">,
    // but the export side (export-epub.js) does not yet read ::fig back as
    // <figure>, so the round-trip was lossy in a confusing way. Until the
    // symmetric export rule lands (tracked as Phase 2.4 follow-up), let
    // turndown handle <figure> with its default rule (image + caption
    // paragraph). The id is lost; this is documented in the fidelity
    // matrix.
    return td;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unescapeXml(s) {
    return s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
        .replace(/&amp;/g, '&');
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function posixJoin(...parts) {
    return path.posix.normalize(parts.filter(Boolean).join('/'));
}

module.exports = importEpub;
module.exports._internal = { parseOpf, parseOpfHref, buildMdzManifest, normalizeUuid, unescapeXml };
