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

const { runChecks, decideExitCode, sigChainPrevHashV2 } = require('../src/commands/verify.js');

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

// Build a manifest carrying security.signatures — the common shape used by
// every chain/trust test below. `sigs` is a preconstructed array of
// signature objects to embed verbatim.
function mkManifestWithSigs(sigs) {
    return mkManifest({ security: { signatures: sigs } });
}

// Build a single signature entry with sane defaults. Callers override only
// the fields that matter to the assertion under test.
function sig(overrides = {}) {
    return {
        role: 'author',
        signer: { name: 'A', did: 'did:web:alice.example.com' },
        algorithm: 'Ed25519',
        signature: 'sig0',
        ...overrides,
    };
}

const defaultTrust = { trustAll: true, allowedDids: new Set() };
const noOpts = {};
const emptyManifest = Buffer.from('{}');

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
    const manifest = mkManifestWithSigs([sig()]);
    const report = runChecks(manifest, emptyManifest, [], defaultTrust, noOpts);
    assert.ok(
        !report.warnings.some((w) => w.includes('first entry')),
        'unexpected first-entry warning: ' + JSON.stringify(report.warnings),
    );
});

test('chain: first entry WITH prev_signature → warning', () => {
    const manifest = mkManifestWithSigs([sig({ prev_signature: 'sha256:abcd' })]);
    const report = runChecks(manifest, emptyManifest, [], defaultTrust, noOpts);
    assert.ok(report.warnings.some((w) => w.includes('chain root')));
});

// ---------------------------------------------------------------------------
// Signature chain — invariant 2: entries i>0 must have correct prev_signature
// ---------------------------------------------------------------------------

test('chain: entry 1 with correct prev_signature (v2 domain-separated) → passes', () => {
    const prevEntry = sig({ signature: 'base64-sig-a' });
    const expectedPrevHash = 'sha256:' + sigChainPrevHashV2(prevEntry);
    const manifest = mkManifestWithSigs([
        prevEntry,
        sig({
            role: 'reviewer',
            signer: { name: 'B', did: 'did:web:bob.example.com' },
            signature: 'base64-sig-b',
            prev_signature: expectedPrevHash,
        }),
    ]);
    const report = runChecks(manifest, emptyManifest, [], defaultTrust, noOpts);
    assert.ok(
        report.passes.some((p) => p.includes('chains correctly')),
        'expected chain-pass, got ' + JSON.stringify(report),
    );
});

test('chain: entry 1 with wrong prev_signature → fails', () => {
    const manifest = mkManifestWithSigs([
        sig({ signer: { name: 'A' } }),
        sig({
            role: 'reviewer',
            signer: { name: 'B' },
            signature: 'sig1',
            prev_signature: 'sha256:tampered',
        }),
    ]);
    const report = runChecks(manifest, emptyManifest, [], defaultTrust, noOpts);
    assert.ok(report.failures.some((f) => f.includes('does not match hash')));
});

test('chain: entry 1 MISSING prev_signature → fails', () => {
    const manifest = mkManifestWithSigs([
        sig({ signer: { name: 'A' } }),
        sig({ role: 'reviewer', signer: { name: 'B' }, signature: 'sig1' }),
    ]);
    const report = runChecks(manifest, emptyManifest, [], defaultTrust, noOpts);
    assert.ok(report.failures.some((f) => f.includes('missing prev_signature')));
});

// ---------------------------------------------------------------------------
// Signature chain — invariant 3: algorithm allowlist (blocks "none" attack)
// ---------------------------------------------------------------------------

test('chain: rejects "none" algorithm (classic JWT-style attack)', () => {
    const manifest = mkManifestWithSigs([sig({ algorithm: 'none', signature: '' })]);
    const report = runChecks(manifest, emptyManifest, [], defaultTrust, noOpts);
    assert.ok(
        report.failures.some((f) => f.includes('not in allowed set')),
        'expected algorithm-rejection, got ' + JSON.stringify(report.failures),
    );
});

test('chain: rejects HS256', () => {
    const manifest = mkManifestWithSigs([sig({ algorithm: 'HS256', signature: 'sig' })]);
    const report = runChecks(manifest, emptyManifest, [], defaultTrust, noOpts);
    assert.ok(report.failures.some((f) => f.includes('HS256')));
});

test('chain: accepts all three standard algorithms', () => {
    for (const alg of ['Ed25519', 'RS256', 'ES256']) {
        const manifest = mkManifestWithSigs([
            sig({ signer: { name: 'A', did: 'did:web:x.y' }, algorithm: alg, signature: 'sig' }),
        ]);
        const report = runChecks(manifest, emptyManifest, [], defaultTrust, noOpts);
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
    const manifest = mkManifestWithSigs([
        sig({ signer: { name: 'A', did: 'did:web:trusted.example.com' }, signature: 'sig' }),
    ]);
    const trust = { trustAll: false, allowedDids: new Set(['did:web:trusted.example.com']) };
    const report = runChecks(manifest, emptyManifest, [], trust, noOpts);
    assert.ok(
        report.passes.some((p) => p.includes('is trusted')),
        'expected trusted-pass, got ' + JSON.stringify(report),
    );
});

test('trust: DID NOT in allowlist → fails', () => {
    const manifest = mkManifestWithSigs([
        sig({ signer: { name: 'A', did: 'did:web:untrusted.example.com' }, signature: 'sig' }),
    ]);
    const trust = { trustAll: false, allowedDids: new Set(['did:web:other.example.com']) };
    const report = runChecks(manifest, emptyManifest, [], trust, noOpts);
    assert.ok(
        report.failures.some((f) => f.includes('NOT in the trust policy')),
        'expected trust-failure, got ' + JSON.stringify(report.failures),
    );
});

test('trust: missing DID → warning (not failure)', () => {
    const manifest = mkManifestWithSigs([sig({ signer: { name: 'A' }, signature: 'sig' })]);
    const report = runChecks(manifest, emptyManifest, [], defaultTrust, noOpts);
    assert.ok(report.warnings.some((w) => w.includes('no DID')));
});

// ---------------------------------------------------------------------------
// Exit code semantics — Phase 3.2 hardening (#1 in 2026-05-01 audit)
// "mdz verify" must not exit 0 just because crypto-verify isn't shipped
// yet, and must not exit 0 on an unsigned archive without an explicit
// opt-in flag. CI pipelines piping the verifier into `&&` rely on this.
// ---------------------------------------------------------------------------

test('decideExitCode: hard failures → exit 3', () => {
    const report = { failures: ['boom'], cryptoVerifyPending: false, unsigned: false };
    assert.strictEqual(decideExitCode(report, {}), 3);
});

test('decideExitCode: signatures declared but crypto-verify pending → exit 3', () => {
    const report = { failures: [], cryptoVerifyPending: true, unsigned: false };
    assert.strictEqual(decideExitCode(report, {}), 3);
});

test('decideExitCode: unsigned without opt-in flag → exit 3', () => {
    const report = { failures: [], cryptoVerifyPending: false, unsigned: true };
    assert.strictEqual(decideExitCode(report, {}), 3);
});

test('decideExitCode: unsigned WITH --allow-unverified-signatures → exit 0', () => {
    const report = { failures: [], cryptoVerifyPending: false, unsigned: true };
    assert.strictEqual(decideExitCode(report, { allowUnverifiedSignatures: true }), 0);
});

test('decideExitCode: clean report → exit 0', () => {
    const report = { failures: [], cryptoVerifyPending: false, unsigned: false };
    assert.strictEqual(decideExitCode(report, {}), 0);
});

test('runChecks: archive without security flags as unsigned (not failure)', () => {
    const manifest = mkManifest();
    const report = runChecks(manifest, Buffer.from(JSON.stringify(manifest)), [], defaultTrust, noOpts);
    // Must not pollute `failures` (existing tests rely on this); the
    // unsigned signal lives on a dedicated flag instead.
    assert.strictEqual(report.failures.length, 0);
    assert.strictEqual(report.unsigned, true);
    assert.strictEqual(report.cryptoVerifyPending, false);
});

test('runChecks: archive with signatures sets cryptoVerifyPending', () => {
    const manifest = mkManifestWithSigs([sig()]);
    const report = runChecks(manifest, emptyManifest, [], defaultTrust, noOpts);
    assert.strictEqual(report.cryptoVerifyPending, true);
    assert.strictEqual(report.unsigned, false);
});

// ---------------------------------------------------------------------------
// Sig-chain v2 domain separation — Phase 3.2 hardening (#3 in 2026-05-01 audit)
// Hashing only the opaque signature bytes (v1) was graft-vulnerable: an
// attacker could lift a leaf signature off a different document and the
// chain would still link. v2 binds the hash to algorithm + signer.did +
// signature + timestamp, prefixed with a domain tag.
// ---------------------------------------------------------------------------

test('sigChainPrevHashV2: deterministic; same input → same hash', () => {
    const a = sig({ signature: 'sig-a', timestamp: '2026-01-01T00:00:00Z' });
    assert.strictEqual(sigChainPrevHashV2(a), sigChainPrevHashV2(a));
});

test('sigChainPrevHashV2: changing signer.did changes the hash', () => {
    const base = sig({ signature: 'sig', timestamp: '2026-01-01T00:00:00Z' });
    const lifted = { ...base, signer: { ...base.signer, did: 'did:web:attacker.example.com' } };
    assert.notStrictEqual(sigChainPrevHashV2(base), sigChainPrevHashV2(lifted));
});

test('sigChainPrevHashV2: changing algorithm changes the hash', () => {
    const a = sig({ signature: 'sig', algorithm: 'Ed25519' });
    const b = sig({ signature: 'sig', algorithm: 'RS256' });
    assert.notStrictEqual(sigChainPrevHashV2(a), sigChainPrevHashV2(b));
});

test('sigChainPrevHashV2: changing timestamp changes the hash', () => {
    const a = sig({ signature: 'sig', timestamp: '2026-01-01T00:00:00Z' });
    const b = sig({ signature: 'sig', timestamp: '2026-01-02T00:00:00Z' });
    assert.notStrictEqual(sigChainPrevHashV2(a), sigChainPrevHashV2(b));
});

test('sigChainPrevHashV2: domain tag means v2 hash != raw sha256(signature)', () => {
    const entry = sig({ signature: 'opaque-sig-bytes' });
    const v1Hash = sha256Hex(Buffer.from('opaque-sig-bytes', 'utf8'));
    assert.notStrictEqual(sigChainPrevHashV2(entry), v1Hash);
});

test('chain: graft attack — leaf signature lifted from another doc is rejected', () => {
    // Threat model: attacker takes signatures[0]'s `signature` value
    // from a victim document where the author's signer.did matches the
    // attacker's, and grafts it onto a NEW document with a different
    // signer.did. With the v1 construction (sha256 of signature bytes
    // alone) the chain hash would still match because only `signature`
    // bytes were hashed. The v2 construction binds in signer.did, so
    // a graft becomes detectable.
    const realPrev = sig({
        signature: 'genuine-sig-from-doc-A',
        signer: { name: 'Alice', did: 'did:web:alice.example.com' },
        timestamp: '2026-01-01T00:00:00Z',
    });
    // Attacker's "grafted prev" — same signature bytes, different signer.
    const graftedPrev = {
        ...realPrev,
        signer: { name: 'Mallory', did: 'did:web:mallory.example.com' },
    };
    // The attacker computes prev_signature from the v1 construction
    // (sha256 of bytes alone), which v2 deliberately rejects.
    const v1ChainHash = 'sha256:' + sha256Hex(Buffer.from(realPrev.signature, 'utf8'));
    const manifest = mkManifestWithSigs([
        graftedPrev,
        sig({
            role: 'reviewer',
            signer: { name: 'B', did: 'did:web:bob.example.com' },
            signature: 'leaf-sig',
            prev_signature: v1ChainHash, // attacker's graft attempt
        }),
    ]);
    const report = runChecks(manifest, emptyManifest, [], defaultTrust, noOpts);
    assert.ok(
        report.failures.some((f) => f.includes('does not match')),
        'graft attack must be rejected; got ' + JSON.stringify(report.failures),
    );
});

test('runChecks: legacy v1.1 singular signature also flags cryptoVerifyPending', () => {
    const manifest = mkManifest({
        security: { signature: { signed_by: 'did:web:legacy.example.com', value: 'base64-sig' } },
    });
    const report = runChecks(manifest, Buffer.from(JSON.stringify(manifest)), [], defaultTrust, noOpts);
    assert.strictEqual(report.cryptoVerifyPending, true);
});
