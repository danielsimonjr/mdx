/**
 * Deterministic-build test for the browser extension (Phase 4.6.8).
 *
 * Runs the bundler twice in temp output paths and asserts the
 * resulting `.zip` files are byte-identical. AMO reviewers verify
 * by SHA-256, so non-determinism is a release blocker.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const { buildExtensionZip, sha256 } = require('../build.js');

function tempZipPath() {
    return path.join(os.tmpdir(), `ext-build-${crypto.randomBytes(4).toString('hex')}.zip`);
}

test('build produces deterministic output across two runs', () => {
    const a = tempZipPath();
    const b = tempZipPath();
    try {
        buildExtensionZip(a);
        buildExtensionZip(b);
        const hashA = sha256(a);
        const hashB = sha256(b);
        assert.equal(hashA, hashB, 'two builds should produce byte-identical output');
        // Sanity: also assert the content is non-empty.
        const sizeA = fs.statSync(a).size;
        assert.ok(sizeA > 1000, `zip suspiciously small: ${sizeA} bytes`);
    } finally {
        try { fs.unlinkSync(a); } catch {}
        try { fs.unlinkSync(b); } catch {}
    }
});

test('build excludes test/ directory and host-specific metadata files', () => {
    const out = tempZipPath();
    try {
        buildExtensionZip(out);
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(out);
        const names = zip.getEntries().map((e) => e.entryName);
        assert.ok(!names.some((n) => n.startsWith('test/')), 'test/ entries leaked into the zip');
        assert.ok(!names.some((n) => n.endsWith('.DS_Store')), '.DS_Store leaked');
        assert.ok(!names.some((n) => n.endsWith('Thumbs.db')), 'Thumbs.db leaked');
    } finally {
        try { fs.unlinkSync(out); } catch {}
    }
});

test('build includes manifest.json + every directory listed', () => {
    const out = tempZipPath();
    try {
        buildExtensionZip(out);
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(out);
        const names = zip.getEntries().map((e) => e.entryName);
        assert.ok(names.includes('manifest.json'), 'manifest.json missing');
        for (const dir of ['background', 'content', 'popup', 'viewer', 'icons']) {
            assert.ok(
                names.some((n) => n.startsWith(`${dir}/`)),
                `${dir}/ entries missing`,
            );
        }
    } finally {
        try { fs.unlinkSync(out); } catch {}
    }
});
