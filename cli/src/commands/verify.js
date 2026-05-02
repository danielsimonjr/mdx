/**
 * Verify command — cryptographic verification of an MDZ archive.
 *
 * Per ROADMAP Phase 3.1 this is the reference verifier for the MDZ v2.0
 * signature model. What it checks:
 *
 *   1. Archive structure: manifest.json is valid JSON, required fields
 *      present, mdx_version recognized.
 *   2. Integrity: manifest.security.integrity.manifest_checksum matches
 *      the SHA-256 of the manifest bytes, if declared.
 *   3. Signature chain (v2.0 §16):
 *      - At least one signature entry (if security.signatures declared).
 *      - Each entry i>0 has a prev_signature matching sha256(entry[i-1].signature).
 *      - Each entry's signer has a DID in the trust policy's allowlist
 *        (or is accepted as "untrusted" with a warning).
 *      - Each entry's signature value cryptographically verifies against
 *        the resolved public key using the declared algorithm.
 *   4. Legacy singular signature (v1.1): verified separately with RS256.
 *   5. Content-hash verification: if document.content_id is declared,
 *      SHA-256 of the entry_point file MUST match.
 *
 * Trust policy:
 *   - Default: warn on unknown signer DIDs, accept anyway (--trust-all).
 *   - --trust <keys.json>: only accept signers whose DID appears in the
 *     file. Every non-listed signature is an error.
 *   - --offline: skip DID resolution (signatures must be pre-verified by
 *     fetching the DID document out-of-band).
 *
 * Exit codes:
 *   0 — all checks pass AND archive carries cryptographically-verifiable
 *       signatures (or user passed --allow-unverified-signatures for an
 *       intentionally unsigned archive)
 *   1 — IO error
 *   2 — archive malformed (JSON parse failure, missing manifest)
 *   3 — signature / integrity verification failed; OR signatures are
 *       declared but cryptographic verification has not yet shipped
 *       (Phase 3.2 — refusing to lie about crypto status); OR archive is
 *       unsigned and `--allow-unverified-signatures` was not passed
 *
 * Non-scope in this starter:
 *   - Revocation URL fetching (listed in threat model T10 — Phase 3.2)
 *   - Actual cryptographic verification (Ed25519/RS256/ES256) — this
 *     implementation validates STRUCTURE of the signature chain; real
 *     crypto verification requires node's `crypto.verify` plus DID-
 *     document resolution, which is another 200 lines and warrants its
 *     own module. Until that lands, the verifier reports "structure OK,
 *     crypto-verify not yet implemented" — NOT "verified" — to avoid
 *     misleading users.
 */


const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const chalk = require('chalk');
const ora = require('ora');

async function verifyCommand(inputPath, options) {
    const spinner = ora('Reading archive...').start();
    try {
        const absIn = path.resolve(inputPath);
        if (!fs.existsSync(absIn)) {
            spinner.fail(chalk.red(`File not found: ${absIn}`));
            process.exit(1);
        }
        const zip = new AdmZip(absIn);
        const entries = zip.getEntries();
        const manifestEntry = entries.find((e) => e.entryName === 'manifest.json');
        if (!manifestEntry) {
            spinner.fail(chalk.red('Missing manifest.json — not a valid MDZ/MDX archive'));
            process.exit(2);
        }
        const manifestBytes = manifestEntry.getData();
        let manifest;
        try {
            manifest = JSON.parse(manifestBytes.toString('utf8'));
        } catch (e) {
            spinner.fail(chalk.red(`manifest.json parse error: ${e.message}`));
            process.exit(2);
        }

        spinner.stop();

        const trustPolicy = loadTrustPolicy(options.trust);
        const report = runChecks(manifest, manifestBytes, entries, trustPolicy, options);
        printReport(report);

        process.exit(decideExitCode(report, options));
    } catch (error) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        if (error.stack) console.error(error.stack);
        process.exit(1);
    }
}

function loadTrustPolicy(trustPath) {
    if (!trustPath) return { trustAll: true, allowedDids: new Set() };
    const absTrust = path.resolve(trustPath);
    if (!fs.existsSync(absTrust)) {
        throw new Error(`Trust policy file not found: ${absTrust}`);
    }
    const parsed = JSON.parse(fs.readFileSync(absTrust, 'utf8'));
    const dids = new Set(
        Array.isArray(parsed.allowed_dids)
            ? parsed.allowed_dids
            : Array.isArray(parsed.dids)
              ? parsed.dids
              : [],
    );
    return { trustAll: false, allowedDids: dids };
}

function runChecks(manifest, manifestBytes, entries, trustPolicy, options) {
    const report = {
        passes: [],
        warnings: [],
        failures: [],
        // True when `security.signatures[]` is non-empty but the CLI has
        // not yet implemented cryptographic verification (Phase 3.2).
        // Surfaced separately from `failures` so tests of the structural
        // checks can still inspect the report cleanly; consumed by
        // `decideExitCode` to translate "structure looks fine but we
        // can't actually prove the bytes match" into a non-zero exit.
        cryptoVerifyPending: false,
        // True when the archive carries no signatures at all (neither
        // v2 chain nor legacy v1.1 singular). Default exit code in this
        // case is non-zero to prevent the caller from interpreting silence
        // as approval; pass `--allow-unverified-signatures` to opt in.
        unsigned: false,
    };

    checkStructure(manifest, report);
    checkIntegrity(manifest, manifestBytes, report);
    checkContentId(manifest, entries, report);
    checkAssetHashes(manifest, entries, report);
    checkSignatures(manifest, trustPolicy, options, report);

    return report;
}

/**
 * Map a verification report + CLI options to a process exit code.
 * Pure: no I/O, no side effects. Exposed for unit tests that exercise
 * the "no, you can't claim verification when there is none" rule
 * without spawning the full CLI.
 *
 * Order of checks reflects severity:
 *   1. Hard failures (`report.failures`) → 3
 *   2. Signatures declared but crypto-verify not yet implemented → 3
 *   3. Archive unsigned and the user did NOT opt in → 3
 *   4. Otherwise → 0
 */
function decideExitCode(report, options) {
    if (report.failures.length > 0) return 3;
    if (report.cryptoVerifyPending) return 3;
    if (report.unsigned && !options.allowUnverifiedSignatures) return 3;
    return 0;
}

function checkStructure(manifest, report) {
    if (!manifest.mdx_version) {
        report.failures.push('manifest missing required field: mdx_version');
    } else {
        report.passes.push(`mdx_version: ${manifest.mdx_version}`);
    }
    if (!manifest.document) {
        report.failures.push('manifest missing required field: document');
    } else if (!manifest.document.id) {
        report.failures.push('manifest.document missing required field: id');
    } else {
        report.passes.push(`document.id: ${manifest.document.id}`);
    }
}

function checkIntegrity(manifest, manifestBytes, report) {
    const declared =
        manifest.security && manifest.security.integrity && manifest.security.integrity.manifest_checksum;
    if (!declared) {
        report.warnings.push('integrity.manifest_checksum not declared (archive is unsigned at the manifest level)');
        return;
    }
    const match = /^([a-z0-9]+):([a-f0-9]+)$/i.exec(declared);
    if (!match) {
        report.failures.push(`integrity.manifest_checksum has invalid format: ${declared}`);
        return;
    }
    const algo = match[1].toLowerCase();
    const expected = match[2].toLowerCase();
    // Only verify algorithms we can actually compute. Previously unknown
    // algorithms silently fell back to SHA-256, which would accidentally
    // pass for a lookalike hash of the right length. Reject explicitly.
    const supportedAlgos = new Set(['sha256', 'sha512']);
    if (!supportedAlgos.has(algo)) {
        report.failures.push(
            `integrity.manifest_checksum uses unsupported algorithm: ${algo} ` +
                `(supported: sha256, sha512; blake3 is spec'd but not yet verified by this CLI)`,
        );
        return;
    }
    const hash = crypto.createHash(algo).update(manifestBytes).digest('hex');
    if (hash === expected) {
        report.passes.push(`integrity.manifest_checksum verifies (${algo})`);
    } else {
        report.failures.push(
            `integrity.manifest_checksum mismatch: declared ${expected.slice(0, 12)}…, computed ${hash.slice(0, 12)}…`,
        );
    }
}

function checkContentId(manifest, entries, report) {
    if (!manifest.document || !manifest.document.content_id) return;
    const entryPoint = (manifest.content && manifest.content.entry_point) || 'document.md';
    const contentEntry = entries.find((e) => e.entryName === entryPoint);
    if (!contentEntry) {
        report.failures.push(`content_id cannot be verified — entry_point ${entryPoint} missing`);
        return;
    }
    const result = verifyContentHash(manifest.document.content_id, contentEntry.getData());
    if (result.ok) {
        report.passes.push(`document.content_id verifies (${result.algo})`);
    } else {
        report.failures.push(result.message);
    }
}

/**
 * Walk every `manifest.assets[<category>][]` entry, hash each
 * declared asset's bytes, and compare against the manifest's
 * `content_hash` field. Phase 4.6.9: previously the verify
 * command only checked the top-level `manifest_checksum` and
 * `document.content_id`; per-asset hashes were declared in the
 * manifest but never enforced, which left a real attack surface
 * (substitute an asset, leave the manifest untouched, and the
 * verifier would still pass the document).
 *
 * Each assets[<category>][] entry that declares both `path` and
 * `content_hash` gets verified. Entries without `content_hash`
 * are skipped (the field is SHOULD, not MUST) — surfaced as a
 * warning so a maintainer notices unsigned assets. Missing files
 * fail loudly because the manifest's promise didn't hold.
 */
function checkAssetHashes(manifest, entries, report) {
    const assets = manifest.assets;
    if (!assets || typeof assets !== 'object') return;
    const entryByName = new Map();
    for (const e of entries) entryByName.set(e.entryName, e);

    let checked = 0;
    let warnings = 0;
    const failures = [];

    for (const [category, items] of Object.entries(assets)) {
        if (!Array.isArray(items)) continue;
        for (const item of items) {
            if (!item || typeof item !== 'object') continue;
            const path = item.path;
            const declared = item.content_hash;
            if (!path) continue;
            if (!declared) {
                warnings++;
                report.warnings.push(`asset ${category}/${path} missing content_hash (per spec §16, SHOULD declare)`);
                continue;
            }
            const entry = entryByName.get(path);
            if (!entry) {
                failures.push(`asset ${path} declared in manifest but file is missing from archive`);
                continue;
            }
            const result = verifyContentHash(declared, entry.getData());
            if (result.ok) {
                checked++;
            } else {
                failures.push(`asset ${path}: ${result.message}`);
            }
        }
    }

    if (checked > 0) {
        report.passes.push(`asset content_hash verifies (${checked} asset${checked === 1 ? '' : 's'})`);
    }
    for (const f of failures) report.failures.push(f);
}

function checkSignatures(manifest, trustPolicy, options, report) {
    const signatures = manifest.security && manifest.security.signatures;
    if (Array.isArray(signatures) && signatures.length > 0) {
        verifySignatureChain(signatures, trustPolicy, options, report);
        // Until Ed25519/RS256/ES256 verification ships (Phase 3.2), refuse
        // to imply success: the chain *structure* may be correct while the
        // signature *bytes* are forged or grafted. Flag the report so
        // `decideExitCode` translates this into a non-zero exit.
        report.cryptoVerifyPending = true;
        report.warnings.push(
            'Structural signature-chain verification only; cryptographic ' +
                'signature-value verification (Ed25519/RS256/ES256) is Phase 3.2 — ' +
                "this command does NOT yet prove the archive wasn't tampered with.",
        );
        return;
    }
    // Check legacy v1.1 singular signature
    const legacy = manifest.security && manifest.security.signature;
    if (legacy) {
        // Legacy singular signature is structurally present but, like the
        // v2 chain, is not yet cryptographically verified by this CLI.
        report.cryptoVerifyPending = true;
        report.warnings.push(
            'Archive uses legacy v1.1 security.signature (singular); full chain verification unavailable',
        );
        if (legacy.signed_by) {
            report.passes.push(`legacy signature signed_by: ${legacy.signed_by}`);
        }
    } else {
        // Archive is unsigned. Surface as a warning so the report stays
        // readable; gate the exit code on `--allow-unverified-signatures`
        // so a CI script that pipes `mdz verify` into `&&` cannot mistake
        // silence for approval.
        report.unsigned = true;
        report.warnings.push(
            'No signatures declared — archive is unsigned. Pass ' +
                '--allow-unverified-signatures to acknowledge this is intentional.',
        );
    }
}

/**
 * Compute the v2 sig-chain prev_signature hash input — the
 * domain-separated, canonically-encoded previous entry. Returns the
 * lowercase hex SHA-256 (without the `sha256:` algorithm prefix).
 *
 * Domain tag (`mdz-sig-chain-v2|`) ensures that even if the body bytes
 * collide with bytes used by some unrelated protocol, the hash inputs
 * cannot be confused. The prefixed colon separator avoids ambiguity
 * with the algorithm-prefix syntax used elsewhere in the manifest.
 *
 * Canonical JSON: keys sorted lexicographically, no whitespace, UTF-8.
 * The minimal JCS subset is sufficient because the four fields
 * (`algorithm`, `created`, `signature`, `signer_did`) are all simple
 * strings — no nested objects, numbers, or unicode normalisation
 * concerns. Missing fields encode as the empty string so a partially-
 * populated entry still has a deterministic chain anchor (and the
 * verifier surfaces the missing-field as a separate warning).
 */
function sigChainPrevHashV2(prev) {
    const canon = {
        algorithm: typeof prev.algorithm === 'string' ? prev.algorithm : '',
        signature: typeof prev.signature === 'string' ? prev.signature : '',
        signer_did: prev.signer && typeof prev.signer.did === 'string' ? prev.signer.did : '',
        timestamp: typeof prev.timestamp === 'string' ? prev.timestamp : '',
    };
    // Lexicographic key order — JSON.stringify with a pre-sorted key
    // list gives the canonical encoding without pulling in a JCS library.
    // The four fields are all simple strings so JCS's other
    // canonicalization rules (number-formatting, unicode normalization)
    // do not apply.
    const canonicalJson = JSON.stringify(canon, [
        'algorithm',
        'signature',
        'signer_did',
        'timestamp',
    ]);
    const input = Buffer.concat([
        Buffer.from('mdz-sig-chain-v2|', 'utf8'),
        Buffer.from(canonicalJson, 'utf8'),
    ]);
    return crypto.createHash('sha256').update(input).digest('hex');
}

function verifyContentHash(declared, contentBytes) {
    const match = /^([a-z0-9]+):([a-f0-9]+)$/i.exec(declared);
    if (!match) {
        return { ok: false, message: `document.content_id has invalid format: ${declared}` };
    }
    const algoToken = match[1].toLowerCase();
    const expected = match[2].toLowerCase();
    let algo;
    if (algoToken === 'sha256') algo = 'sha256';
    else if (algoToken === 'sha512') algo = 'sha512';
    else if (algoToken === 'blake3')
        return {
            ok: false,
            message: 'blake3 content_id verification not implemented in Node-crypto; run mdz verify under a runtime with blake3 support',
        };
    else return { ok: false, message: `unsupported content_id algorithm: ${algoToken}` };
    const computed = crypto.createHash(algo).update(contentBytes).digest('hex');
    if (computed === expected) return { ok: true, algo: algoToken };
    return {
        ok: false,
        message: `document.content_id mismatch: declared ${expected.slice(0, 12)}…, computed ${computed.slice(0, 12)}…`,
    };
}

function verifySignatureChain(signatures, trustPolicy, options, report) {
    // Invariant 1: entry 0 should NOT have a prev_signature (it's the root).
    if (signatures[0].prev_signature) {
        report.warnings.push(
            'signatures[0] has prev_signature set; the first entry should be the chain root (no prev).',
        );
    }

    // Invariant 2: every entry i>0 must have prev_signature and it must
    // match the domain-separated hash of the previous entry's identifying
    // fields (spec §16.3, v2 chain construction). Hashing only the opaque
    // signature bytes — the v1 construction — was vulnerable to a graft
    // attack: an attacker could lift entry[i-1]'s signature off a
    // different document and the chain would still link. v2 binds the
    // hash to the prior entry's algorithm + signer.did + signature +
    // created and prefixes the input with a domain tag so the same bytes
    // can never be reused as a prev-image of a different protocol step.
    for (let i = 1; i < signatures.length; i++) {
        const prev = signatures[i - 1];
        const curr = signatures[i];
        if (!curr.prev_signature) {
            report.failures.push(
                `signatures[${i}] missing prev_signature (breaks chain integrity)`,
            );
            continue;
        }
        const expectedPrevHash = 'sha256:' + sigChainPrevHashV2(prev);
        if (curr.prev_signature === expectedPrevHash) {
            report.passes.push(`signatures[${i}].prev_signature chains correctly`);
        } else {
            report.failures.push(
                `signatures[${i}].prev_signature does not match hash of signatures[${i - 1}]`,
            );
        }
    }

    // Invariant 3: algorithm in the allowed set (Ed25519, RS256, ES256).
    const allowedAlgs = new Set(['Ed25519', 'RS256', 'ES256']);
    for (let i = 0; i < signatures.length; i++) {
        const s = signatures[i];
        if (!allowedAlgs.has(s.algorithm)) {
            const algDisplay = s.algorithm ? JSON.stringify(s.algorithm) : '(missing)';
            report.failures.push(
                `signatures[${i}].algorithm ${algDisplay} not in allowed set (Ed25519, RS256, ES256)`,
            );
        }
    }

    // Invariant 4: trust policy — every signer's DID should be in the
    // allowlist (unless --trust-all / no trust file was provided).
    for (let i = 0; i < signatures.length; i++) {
        const s = signatures[i];
        const did = s.signer && s.signer.did;
        if (!did) {
            report.warnings.push(`signatures[${i}] signer has no DID — identity unverifiable`);
            continue;
        }
        if (trustPolicy.trustAll) {
            report.warnings.push(`signatures[${i}] signer ${did} is not on any trust list (--trust-all)`);
        } else if (!trustPolicy.allowedDids.has(did)) {
            report.failures.push(`signatures[${i}] signer ${did} is NOT in the trust policy`);
        } else {
            report.passes.push(`signatures[${i}] signer ${did} is trusted`);
        }
    }
}

function printReport(report) {
    const total = report.passes.length + report.warnings.length + report.failures.length;
    console.log();
    console.log(chalk.bold('Verification report'));
    console.log(chalk.gray('─'.repeat(60)));
    for (const p of report.passes) console.log(chalk.green('  ✓ ') + p);
    for (const w of report.warnings) console.log(chalk.yellow('  ⚠ ') + w);
    for (const f of report.failures) console.log(chalk.red('  ✗ ') + f);
    console.log(chalk.gray('─'.repeat(60)));
    console.log(
        `  ${chalk.green(report.passes.length + ' pass')}, ` +
            `${chalk.yellow(report.warnings.length + ' warn')}, ` +
            `${chalk.red(report.failures.length + ' fail')} ` +
            `(${total} checks)`,
    );
    if (report.failures.length > 0) {
        console.log();
        console.log(chalk.red.bold('  VERIFICATION FAILED'));
    } else if (report.warnings.length > 0) {
        console.log();
        console.log(chalk.yellow('  Structural checks OK; review warnings above.'));
    } else {
        console.log();
        console.log(chalk.green.bold('  Structural verification passed.'));
    }
}

module.exports = verifyCommand;
module.exports.runChecks = runChecks; // exposed for unit tests
module.exports.decideExitCode = decideExitCode; // exposed for unit tests
module.exports.sigChainPrevHashV2 = sigChainPrevHashV2; // exposed for unit tests + parity
