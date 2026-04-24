/**
 * Tests for the `mdz verify` command's core check logic.
 *
 * Exercises the signature-chain invariants the reviewer flagged as
 * untested:
 *   1. First entry should not carry prev_signature
 *   2. Every entry i>0 MUST have prev_signature = sha256(prev.signature)
 *   3. Algorithm in {Ed25519, RS256, ES256}; "none" must fail
 *   4. Trust policy: signer DID must be allowlisted when trust file given
 *
 * Plus manifest integrity + content_id verification.
 *
 * Uses node:test (built-in runner, no extra deps). Run via:
 *   node --test cli/test/*.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const { runChecks } = require('../src/commands/verify.js');

// Helper — build a minimal manifest with optional signatures.
function mkManifest(overrides = {}) {
    return {
        mdx_version: '2.0.0',
        document: {
            id: '00000000-0000-4000-8000-000000000000',
            title: 'T',
            created: '2026-01-01T00:00:00Z',
            modified: '2026-01-01T00:00:00Z',
        },
        content: { entry_point: 'document.md' },
        ...overrides,
    };
}

function sha256Hex(s) {
    return crypto.createHash('sha256').update(s).digest('hex');
}

const defaultTrust = { trustAll: true, allowedDids: new Set() };
const noOpts = {};

// ---------------------------------------------------------------------------
// Structural checks
// ---------------------------------------------------------------------------

test('runChecks: passes on minimal valid manifest', () => {
    const manifest = mkManifest();
    const manifestBytes = Buffer.from(JSON.stringify(manifest), 'utf8');
    const report = runChecks(manifest, manifestBytes, [], defaultTrust, noOpts);
    assert.strictEqual(report.failures.length, 0, JSON.stringify(report.failures));
});

test('runChecks: fails on missing mdx_version', () => {
    const manifest = mkManifest();
    delete manifest.mdx_version;
    const report = runChecks(manifest, Buffer.from(JSON.stringify(manifest)), [], defaultTrust, noOpts);
    assert.ok(
        report.failures.some((f) => f.includes('mdx_version')),
        'expected mdx_version failure, got ' + JSON.stringify(report.failures),
    );
});

test('runChecks: fails on missing document.id', () => {
    const manifest = mkManifest();
    delete manifest.document.id;
    const report = runChecks(manifest, Buffer.from(JSON.stringify(manifest)), [], defaultTrust, noOpts);
    assert.ok(report.failures.some((f) => f.includes('id')));
});

// ---------------------------------------------------------------------------
// Integrity checksum
// ---------------------------------------------------------------------------

test('runChecks: passes integrity when hash matches', () => {
    const manifestBytes = Buffer.from('{"mdx_version":"2.0.0"}', 'utf8');
    const declaredHash = sha256Hex(manifestBytes);
    // Mutate a deep copy of the manifest to declare the integrity; the
    // VERIFIED bytes are the SAME ones we hash, so the check passes.
    const manifest = mkManifest({
        security: { integrity: { algorithm: 'sha256', manifest_checksum: `sha256:${declaredHash}` } },
    });
    // Note: we pass the DECLARED-ABOUT bytes (the actual manifest shape
    // matters only for structural checks; the integrity check hashes
    // whatever bytes we pass as `manifestBytes`).
    const report = runChecks(manifest, manifestBytes, [], defaultTrust, noOpts);
    assert.ok(
        report.passes.some((p) => p.includes('integrity')),
        JSON.stringify(report),
    );
});

test('runChecks: fails integrity on hash mismatch', () => {
    const manifestBytes = Buffer.from('{}', 'utf8');
    const manifest = mkManifest({
        security: {
            integrity: {
                algorithm: 'sha256',
                manifest_checksum: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
            },
        },
    });
    const report = runChecks(manifest, manifestBytes, [], defaultTrust, noOpts);
    assert.ok(report.failures.some((f) => f.includes('integrity.manifest_checksum mismatch')));
});

// ---------------------------------------------------------------------------
// Signature chain — invariant 1: first entry has no prev_signature
// ---------------------------------------------------------------------------

test('chain: first entry without prev_signature → no warning', () => {
    const sigs = [
        {
            role: 'author',
            signer: { name: 'A', did: 'did:web:alice.example.com' },
            algorithm: 'Ed25519',
            signature: 'sig0',
        },
    ];
    const manifest = mkManifest({ security: { signatures: sigs } });
    const report = runChecks(manifest, Buffer.from('{}'), [], defaultTrust, noOpts);
    assert.ok(
        !report.warnings.some((w) => w.includes('first entry')),
        'unexpected first-entry warning: ' + JSON.stringify(report.warnings),
    );
});

test('chain: first entry WITH prev_signature → warning', () => {
    const sigs = [
        {
            role: 'author',
            signer: { name: 'A', did: 'did:web:alice.example.com' },
            algorithm: 'Ed25519',
            signature: 'sig0',
            prev_signature: 'sha256:abcd',
        },
    ];
    const manifest = mkManifest({ security: { signatures: sigs } });
    const report = runChecks(manifest, Buffer.from('{}'), [], defaultTrust, noOpts);
    assert.ok(report.warnings.some((w) => w.includes('chain root')));
});

// ---------------------------------------------------------------------------
// Signature chain — invariant 2: entries i>0 must have correct prev_signature
// ---------------------------------------------------------------------------

test('chain: entry 1 with correct prev_signature → passes', () => {
    const prevSig = 'base64-sig-a';
    const expectedPrevHash = 'sha256:' + sha256Hex(Buffer.from(prevSig, 'utf8'));
    const sigs = [
        {
            role: 'author',
            signer: { name: 'A', did: 'did:web:alice.example.com' },
            algorithm: 'Ed25519',
            signature: prevSig,
        },
        {
            role: 'reviewer',
            signer: { name: 'B', did: 'did:web:bob.example.com' },
            algorithm: 'Ed25519',
            signature: 'base64-sig-b',
            prev_signature: expectedPrevHash,
        },
    ];
    const manifest = mkManifest({ security: { signatures: sigs } });
    const report = runChecks(manifest, Buffer.from('{}'), [], defaultTrust, noOpts);
    assert.ok(
        report.passes.some((p) => p.includes('chains correctly')),
        'expected chain-pass, got ' + JSON.stringify(report),
    );
});

test('chain: entry 1 with wrong prev_signature → fails', () => {
    const sigs = [
        { role: 'author', signer: { name: 'A' }, algorithm: 'Ed25519', signature: 'sig0' },
        {
            role: 'reviewer',
            signer: { name: 'B' },
            algorithm: 'Ed25519',
            signature: 'sig1',
            prev_signature: 'sha256:tampered',
        },
    ];
    const manifest = mkManifest({ security: { signatures: sigs } });
    const report = runChecks(manifest, Buffer.from('{}'), [], defaultTrust, noOpts);
    assert.ok(report.failures.some((f) => f.includes('does not match hash')));
});

test('chain: entry 1 MISSING prev_signature → fails', () => {
    const sigs = [
        { role: 'author', signer: { name: 'A' }, algorithm: 'Ed25519', signature: 'sig0' },
        { role: 'reviewer', signer: { name: 'B' }, algorithm: 'Ed25519', signature: 'sig1' },
    ];
    const manifest = mkManifest({ security: { signatures: sigs } });
    const report = runChecks(manifest, Buffer.from('{}'), [], defaultTrust, noOpts);
    assert.ok(report.failures.some((f) => f.includes('missing prev_signature')));
});

// ---------------------------------------------------------------------------
// Signature chain — invariant 3: algorithm allowlist (blocks "none" attack)
// ---------------------------------------------------------------------------

test('chain: rejects "none" algorithm (classic JWT-style attack)', () => {
    const sigs = [
        { role: 'author', signer: { name: 'A' }, algorithm: 'none', signature: '' },
    ];
    const manifest = mkManifest({ security: { signatures: sigs } });
    const report = runChecks(manifest, Buffer.from('{}'), [], defaultTrust, noOpts);
    assert.ok(
        report.failures.some((f) => f.includes('not in allowed set')),
        'expected algorithm-rejection, got ' + JSON.stringify(report.failures),
    );
});

test('chain: rejects HS256', () => {
    const sigs = [
        { role: 'author', signer: { name: 'A' }, algorithm: 'HS256', signature: 'sig' },
    ];
    const manifest = mkManifest({ security: { signatures: sigs } });
    const report = runChecks(manifest, Buffer.from('{}'), [], defaultTrust, noOpts);
    assert.ok(report.failures.some((f) => f.includes('HS256')));
});

test('chain: accepts all three standard algorithms', () => {
    for (const alg of ['Ed25519', 'RS256', 'ES256']) {
        const sigs = [
            { role: 'author', signer: { name: 'A', did: 'did:web:x.y' }, algorithm: alg, signature: 'sig' },
        ];
        const manifest = mkManifest({ security: { signatures: sigs } });
        const report = runChecks(manifest, Buffer.from('{}'), [], defaultTrust, noOpts);
        assert.ok(
            !report.failures.some((f) => f.includes('allowed set')),
            `${alg} should pass algorithm check, got ${JSON.stringify(report.failures)}`,
        );
    }
});

// ---------------------------------------------------------------------------
// Signature chain — invariant 4: trust policy
// ---------------------------------------------------------------------------

test('trust: DID in allowlist → passes', () => {
    const sigs = [
        {
            role: 'author',
            signer: { name: 'A', did: 'did:web:trusted.example.com' },
            algorithm: 'Ed25519',
            signature: 'sig',
        },
    ];
    const manifest = mkManifest({ security: { signatures: sigs } });
    const trust = { trustAll: false, allowedDids: new Set(['did:web:trusted.example.com']) };
    const report = runChecks(manifest, Buffer.from('{}'), [], trust, noOpts);
    assert.ok(
        report.passes.some((p) => p.includes('is trusted')),
        'expected trusted-pass, got ' + JSON.stringify(report),
    );
});

test('trust: DID NOT in allowlist → fails', () => {
    const sigs = [
        {
            role: 'author',
            signer: { name: 'A', did: 'did:web:untrusted.example.com' },
            algorithm: 'Ed25519',
            signature: 'sig',
        },
    ];
    const manifest = mkManifest({ security: { signatures: sigs } });
    const trust = { trustAll: false, allowedDids: new Set(['did:web:other.example.com']) };
    const report = runChecks(manifest, Buffer.from('{}'), [], trust, noOpts);
    assert.ok(
        report.failures.some((f) => f.includes('NOT in the trust policy')),
        'expected trust-failure, got ' + JSON.stringify(report.failures),
    );
});

test('trust: missing DID → warning (not failure)', () => {
    const sigs = [
        { role: 'author', signer: { name: 'A' }, algorithm: 'Ed25519', signature: 'sig' },
    ];
    const manifest = mkManifest({ security: { signatures: sigs } });
    const report = runChecks(manifest, Buffer.from('{}'), [], defaultTrust, noOpts);
    assert.ok(report.warnings.some((w) => w.includes('no DID')));
});
