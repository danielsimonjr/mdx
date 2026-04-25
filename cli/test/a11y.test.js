/**
 * Tests for cli/src/lib/a11y.js — the JS port of the
 * accessibility rules. Pins this implementation against the same
 * inputs as the TS sibling (editor-desktop) and Python sibling
 * (tests/accessibility/run_accessibility.py) so the three stay in
 * lockstep.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');

const { checkMarkdown, buildReport } = require('../src/lib/a11y.js');
const validateCommand = require('../src/commands/validate.js');

test('image-alt: empty alt fires; non-empty alt does not', () => {
  const v = checkMarkdown('Some text\n\n![](img.png)\n\n![A diagram](other.png)');
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, 'image-alt');
  assert.equal(v[0].wcag, '1.1.1');
  assert.equal(v[0].line, 3);
});

test('heading-order: h1 → h3 fires; h1 → h2 → h3 does not', () => {
  const skipped = checkMarkdown('# A\n\n### C\n');
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].rule, 'heading-order');
  assert.equal(skipped[0].wcag, '2.4.10');

  const ordered = checkMarkdown('# A\n\n## B\n\n### C\n');
  assert.equal(ordered.length, 0);
});

test('link-name: vague labels fire (case-insensitive); informative ones do not', () => {
  const vague = checkMarkdown('See [Click here](https://example.com)');
  assert.equal(vague.length, 1);
  assert.equal(vague[0].rule, 'link-name');

  const ok = checkMarkdown('See the [accessibility report](https://example.com)');
  assert.equal(ok.length, 0);
});

test('link-name: image-link syntax does not falsely match link rule', () => {
  // ![alt](src) starts with a bang; the link regex would otherwise
  // match (alt)(src) and mis-fire. The implementation skips when the
  // preceding char is `!`.
  const v = checkMarkdown('![Click here](img.png)');
  // image-alt does not fire because alt text is "Click here" (non-empty),
  // and link-name does not fire because the leading `!` was detected.
  assert.equal(v.length, 0);
});

test('document-language: missing manifest.document.language fires once', () => {
  const v = checkMarkdown('# Heading', { document: {} });
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, 'document-language');
  assert.equal(v[0].line, 0);
});

test('document-language: present language does not fire', () => {
  const v = checkMarkdown('# Heading', { document: { language: 'en' } });
  assert.equal(v.length, 0);
});

test('buildReport: assembles the sidecar schema', () => {
  const scans = [
    { path: 'document.md', locale: null, content: '# H\n![](a.png)' },
    { path: 'document.fr.md', locale: 'fr', content: '# H\n[click here](u)' },
  ];
  const report = buildReport(scans, { document: { language: 'en' } });

  assert.equal(report.schema_version, '1.0');
  assert.equal(report.wcag_version, '2.2');
  assert.equal(report.tool, 'mdz validate --a11y-report');
  assert.equal(report.scanned.length, 2);

  // image-alt on primary; link-name on locale.
  const rules = report.violations.map((v) => v.rule).sort();
  assert.deepEqual(rules, ['image-alt', 'link-name']);
  assert.equal(report.summary.total, 2);
  assert.equal(report.summary.by_rule['image-alt'], 1);
  assert.equal(report.summary.by_rule['link-name'], 1);
  // Locale tagging.
  assert.equal(report.summary.by_locale['<primary>'], 1);
  assert.equal(report.summary.by_locale.fr, 1);
});

test('buildReport: language check runs only on primary scan', () => {
  // If both primary and locale ran the language rule, we'd get a
  // duplicate document-level finding. The buildReport guard prevents it.
  const scans = [
    { path: 'document.md', locale: null, content: '# H' },
    { path: 'document.fr.md', locale: 'fr', content: '# H' },
  ];
  const report = buildReport(scans, { document: {} });
  const langFindings = report.violations.filter((v) => v.rule === 'document-language');
  assert.equal(langFindings.length, 1);
});

test('CLI --a11y-report: end-to-end against an in-memory archive', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdz-a11y-'));
  const archivePath = path.join(tmp, 'sample.mdz');
  const sidecarPath = path.join(tmp, 'sample.a11y.json');

  // Pack a tiny MDZ in memory: manifest + document.md with one
  // image-alt violation + one locale variant with a vague link.
  const manifest = {
    mdx_version: '2.0.0',
    document: {
      id: '00000000-0000-4000-8000-000000000000',
      title: 'A11y test',
      created: '2026-01-01T00:00:00Z',
      modified: '2026-01-01T00:00:00Z',
    },
    content: { entry_point: 'document.md', locales: ['fr'] },
  };
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
  zip.addFile('document.md', Buffer.from('# Title\n\n![](nope.png)\n'));
  zip.addFile('document.fr.md', Buffer.from('# Titre\n\n[click here](https://x)\n'));
  zip.writeZip(archivePath);

  await validateCommand(archivePath, {
    a11yReport: sidecarPath,
    noExit: true,
    verbose: false,
  });

  assert.ok(fs.existsSync(sidecarPath), 'sidecar should be written');
  const report = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8'));

  // Schema-shape assertions.
  assert.equal(report.schema_version, '1.0');
  assert.equal(report.wcag_version, '2.2');
  assert.equal(report.scanned.length, 2);
  assert.equal(report.summary.total, 3);

  // Pin the rules: image-alt on primary, link-name on fr, plus
  // document-language since we didn't set it.
  const rules = report.violations.map((v) => v.rule).sort();
  assert.deepEqual(rules, ['document-language', 'image-alt', 'link-name']);

  fs.rmSync(tmp, { recursive: true, force: true });
});
