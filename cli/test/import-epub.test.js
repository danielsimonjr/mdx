/**
 * Tests for `mdz import-epub` (Phase 2.4 reverse direction).
 *
 * Two layers:
 *   1. Unit tests on the pure helpers exposed via `_internal`:
 *      `parseOpfHref`, `parseOpf`, `buildMdzManifest`, `normalizeUuid`,
 *      `unescapeXml`. Fast; no I/O.
 *   2. Integration test that exercises the round-trip
 *      `mdz export-epub` → `mdz import-epub` against the shipped
 *      `examples/example-document.mdx`. Run as a child-process pair
 *      so the CLI surface is what's actually tested.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const importEpub = require('../src/commands/import-epub');
const { parseOpfHref, parseOpf, buildMdzManifest, normalizeUuid, unescapeXml } =
    importEpub._internal;

// ---------------------------------------------------------------------------
// parseOpfHref
// ---------------------------------------------------------------------------

test('parseOpfHref: extracts the rootfile path from container.xml', () => {
    const xml = `<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
    assert.strictEqual(parseOpfHref(xml), 'OPS/content.opf');
});

test('parseOpfHref: returns null when no rootfile is declared', () => {
    assert.strictEqual(parseOpfHref('<container></container>'), null);
});

// ---------------------------------------------------------------------------
// parseOpf
// ---------------------------------------------------------------------------

test('parseOpf: extracts metadata + manifest + spine in reading order', () => {
    const opf = `<?xml version="1.0"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Title</dc:title>
    <dc:creator>Alice Smith</dc:creator>
    <dc:creator>Bob Jones</dc:creator>
    <dc:language>en-US</dc:language>
    <dc:identifier>urn:uuid:12345678-1234-1234-1234-123456789abc</dc:identifier>
    <dc:subject>biology</dc:subject>
    <dc:subject>genomics</dc:subject>
    <meta property="dcterms:modified">2026-04-24T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="ch1" href="Text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="Text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="img1" href="Images/fig1.png" media-type="image/png"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`;
    const parsed = parseOpf(opf);
    assert.strictEqual(parsed.metadata.title, 'Test Title');
    assert.strictEqual(parsed.metadata.language, 'en-US');
    assert.strictEqual(parsed.metadata.identifier, 'urn:uuid:12345678-1234-1234-1234-123456789abc');
    assert.deepStrictEqual(parsed.metadata.creators, ['Alice Smith', 'Bob Jones']);
    assert.deepStrictEqual(parsed.metadata.keywords, ['biology', 'genomics']);
    assert.strictEqual(parsed.metadata.modified, '2026-04-24T00:00:00Z');
    assert.strictEqual(parsed.metadata.epubVersion, '3.0');
    assert.deepStrictEqual(parsed.spine, ['ch1', 'ch2']);
    assert.strictEqual(parsed.manifest.ch1.href, 'Text/ch1.xhtml');
    assert.strictEqual(parsed.manifest.img1.mediaType, 'image/png');
});

test('parseOpf: ignores fake elements inside XML comments', () => {
    // C2.5 from review: a comment containing <item ...> would otherwise
    // be parsed as a real manifest entry.
    const opf = `<package version="3.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>X</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <!-- <item id="ghost" href="ghost.xhtml" media-type="application/xhtml+xml"/> -->
    <item id="real" href="real.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="real"/></spine>
</package>`;
    const parsed = parseOpf(opf);
    assert.ok(!parsed.manifest.ghost, 'comment-only items must not appear in manifest');
    assert.ok(parsed.manifest.real, 'real items must still appear');
});

test('parseOpf: unwraps CDATA in metadata values', () => {
    const opf = `<package version="3.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title><![CDATA[A & B's research]]></dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest></manifest>
  <spine></spine>
</package>`;
    const parsed = parseOpf(opf);
    assert.strictEqual(parsed.metadata.title, "A & B's research");
});

test('parseOpf: picks language-matching title when multiple <dc:title> entries', () => {
    const opf = `<package version="3.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title xml:lang="en">English Title</dc:title>
    <dc:title xml:lang="ja">日本語タイトル</dc:title>
    <dc:language>ja-JP</dc:language>
  </metadata>
  <manifest></manifest>
  <spine></spine>
</package>`;
    const parsed = parseOpf(opf);
    assert.strictEqual(parsed.metadata.title, '日本語タイトル');
});

test('parseOpf: handles entity-encoded titles', () => {
    const opf = `<package version="3.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Smith &amp; Jones&apos; results</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest></manifest>
  <spine></spine>
</package>`;
    const parsed = parseOpf(opf);
    assert.strictEqual(parsed.metadata.title, "Smith & Jones' results");
});

// ---------------------------------------------------------------------------
// buildMdzManifest
// ---------------------------------------------------------------------------

test('buildMdzManifest: shapes a v2.0 manifest from OPF metadata', () => {
    const m = buildMdzManifest({
        title: 'X',
        language: 'en',
        identifier: 'urn:uuid:12345678-1234-1234-1234-123456789abc',
        creators: ['Alice'],
        rights: null,
        license: 'CC-BY-4.0',
        keywords: ['k1'],
        modified: '2026-01-01T00:00:00Z',
        epubVersion: '3.0',
        accessibilityFeatures: ['alternativeText'],
    });
    assert.strictEqual(m.mdx_version, '2.0.0');
    assert.strictEqual(m.document.title, 'X');
    assert.strictEqual(m.document.language, 'en');
    assert.strictEqual(m.document.id, '12345678-1234-1234-1234-123456789abc');
    assert.deepStrictEqual(m.document.authors, [{ name: 'Alice' }]);
    assert.deepStrictEqual(m.document.keywords, ['k1']);
    assert.strictEqual(m.document.license, 'CC-BY-4.0');
    assert.deepStrictEqual(m.document.accessibility, { features: ['alternativeText'] });
    assert.strictEqual(m.content.entry_point, 'document.md');
    assert.strictEqual(m.custom.import_source.kind, 'epub');
    assert.strictEqual(m.custom.import_source.epub_version, '3.0');
});

test('buildMdzManifest: prefers explicit license over rights when both present', () => {
    const m = buildMdzManifest({
        title: 'X', language: 'en', identifier: 'urn:uuid:11111111-2222-3333-4444-555555555555',
        creators: [], rights: 'All rights reserved', license: 'CC-BY-4.0',
        keywords: [], modified: '2026-01-01T00:00:00Z', epubVersion: '3.0',
        accessibilityFeatures: [],
    });
    assert.strictEqual(m.document.license, 'CC-BY-4.0');
});

// ---------------------------------------------------------------------------
// normalizeUuid
// ---------------------------------------------------------------------------

test('normalizeUuid: strips urn:uuid: prefix and lowercases', () => {
    assert.strictEqual(
        normalizeUuid('urn:uuid:ABCDEF12-3456-7890-ABCD-EF1234567890'),
        'abcdef12-3456-7890-abcd-ef1234567890',
    );
});

test('normalizeUuid: mints fresh UUID for non-UUID identifiers (DOI / ISBN)', () => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    assert.ok(uuidRe.test(normalizeUuid('10.5281/zenodo.1234567')));
    assert.ok(uuidRe.test(normalizeUuid('978-0-13-468599-1')));
    assert.ok(uuidRe.test(normalizeUuid('opaque-publisher-id-42')));
});

// ---------------------------------------------------------------------------
// unescapeXml
// ---------------------------------------------------------------------------

test('unescapeXml: handles the five core entities + numeric refs', () => {
    assert.strictEqual(
        unescapeXml('&lt;tag&gt; &amp; &quot;quoted&quot; &apos;single&apos; &#65;'),
        `<tag> & "quoted" 'single' A`,
    );
});

test('unescapeXml: order is amp-last so &amp;lt; stays as &lt;', () => {
    // Without the amp-last pass, a literal "&amp;lt;" would become "<".
    // The actual unescape order in unescapeXml replaces & last, so
    // &amp;lt; -> &lt; (correct: the source was an escaped &lt; literal).
    assert.strictEqual(unescapeXml('&amp;lt;'), '&lt;');
});

// ---------------------------------------------------------------------------
// Integration: mdz → epub → mdz round-trip
// ---------------------------------------------------------------------------

test('round-trip: synthesized mdz → epub → mdz preserves declared values', { timeout: 120000 }, () => {
    // Build a known-shape MDZ in-process so the assertions below pin
    // exact values rather than tracking whatever shape
    // examples/example-document.mdx happens to have.
    const cliPath = path.resolve(__dirname, '..', 'src', 'index.js');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdz-rt-'));
    const sourceMdz = path.join(tmpDir, 'src.mdz');
    const epubPath = path.join(tmpDir, 'mid.epub');
    const finalMdzPath = path.join(tmpDir, 'final.mdz');

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AdmZip = require('adm-zip');
    const inputManifest = {
        mdx_version: '2.0.0',
        document: {
            id: '11111111-2222-3333-4444-555555555555',
            title: 'Round-Trip Title',
            language: 'en-US',
            created: '2026-01-01T00:00:00Z',
            modified: '2026-01-01T00:00:00Z',
            authors: [{ name: 'Alice Author' }],
            keywords: ['rt-keyword'],
            license: 'CC-BY-4.0',
        },
        content: { entry_point: 'document.md', encoding: 'UTF-8', markdown_variant: 'CommonMark' },
    };
    const inputZip = new AdmZip();
    inputZip.addFile('manifest.json', Buffer.from(JSON.stringify(inputManifest, null, 2)));
    inputZip.addFile('document.md', Buffer.from('# Heading\n\nA paragraph.\n'));
    inputZip.writeZip(sourceMdz);

    execFileSync('node', [cliPath, 'export-epub', sourceMdz, '-o', epubPath], { stdio: 'pipe' });
    execFileSync('node', [cliPath, 'import-epub', epubPath, '-o', finalMdzPath], { stdio: 'pipe' });

    const finalManifest = JSON.parse(
        new AdmZip(finalMdzPath).getEntry('manifest.json').getData().toString('utf8'),
    );

    assert.strictEqual(finalManifest.document.title, 'Round-Trip Title');
    assert.strictEqual(finalManifest.document.language, 'en-US');
    assert.deepStrictEqual(finalManifest.document.authors, [{ name: 'Alice Author' }]);
    assert.deepStrictEqual(finalManifest.document.keywords, ['rt-keyword']);
    assert.strictEqual(finalManifest.document.license, 'CC-BY-4.0');
    assert.strictEqual(finalManifest.mdx_version, '2.0.0');
    assert.strictEqual(finalManifest.custom.import_source.kind, 'epub');

    // Body text survives turndown round-trip — heading + paragraph.
    const finalBody = new AdmZip(finalMdzPath).getEntry('document.md').getData().toString('utf8');
    assert.match(finalBody, /Heading/);
    assert.match(finalBody, /A paragraph\./);
});

// ---------------------------------------------------------------------------
// DRM detection
// ---------------------------------------------------------------------------

test('import-epub: refuses an EPUB with META-INF/encryption.xml', { timeout: 60000 }, () => {
    const cliPath = path.resolve(__dirname, '..', 'src', 'index.js');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdz-drm-'));
    const epubPath = path.join(tmpDir, 'drm.epub');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AdmZip = require('adm-zip');
    const z = new AdmZip();
    z.addFile('mimetype', Buffer.from('application/epub+zip'));
    z.addFile(
        'META-INF/container.xml',
        Buffer.from('<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    );
    z.addFile('META-INF/encryption.xml', Buffer.from('<encryption/>'));
    z.writeZip(epubPath);

    let exitCode = 0;
    try {
        execFileSync('node', [cliPath, 'import-epub', epubPath], { stdio: 'pipe' });
    } catch (e) {
        exitCode = e.status;
    }
    assert.strictEqual(exitCode, 3, 'DRM-protected EPUB must exit 3');
});
