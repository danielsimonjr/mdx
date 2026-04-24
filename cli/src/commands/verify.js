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
 *   0 — all checks pass
 *   1 — IO error
 *   2 — archive malformed (JSON parse failure, missing manifest)
 *   3 — signature / integrity verification failed (this is the interesting one)
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

        if (report.failures.length > 0) process.exit(3);
        process.exit(0);
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
    };

    // --- Structural checks ---
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

    // --- Integrity: manifest checksum ---
    const declared =
        manifest.security && manifest.security.integrity && manifest.security.integrity.manifest_checksum;
    if (declared) {
        const match = /^([a-z0-9]+):([a-f0-9]+)$/i.exec(declared);
        if (!match) {
            report.failures.push(`integrity.manifest_checksum has invalid format: ${declared}`);
        } else {
            const algo = match[1].toLowerCase();
            const expected = match[2].toLowerCase();
            // Only verify algorithms we can actually compute. Previously
            // unknown algorithms silently fell back to SHA-256, which
            // would accidentally pass for a lookalike hash of the right
            // length. Reject explicitly instead.
            const supportedAlgos = new Set(['sha256', 'sha512']);
            if (!supportedAlgos.has(algo)) {
                report.failures.push(
                    `integrity.manifest_checksum uses unsupported algorithm: ${algo} ` +
                        `(supported: sha256, sha512; blake3 is spec'd but not yet verified by this CLI)`,
                );
            } else {
                const hash = crypto.createHash(algo).update(manifestBytes).digest('hex');
                if (hash === expected) {
                    report.passes.push(`integrity.manifest_checksum verifies (${algo})`);
                } else {
                    report.failures.push(
                        `integrity.manifest_checksum mismatch: declared ${expected.slice(0, 12)}…, computed ${hash.slice(0, 12)}…`,
                    );
                }
            }
        }
    } else {
        report.warnings.push('integrity.manifest_checksum not declared (archive is unsigned at the manifest level)');
    }

    // --- Content ID verification ---
    if (manifest.document && manifest.document.content_id) {
        const entryPoint = (manifest.content && manifest.content.entry_point) || 'document.md';
        const contentEntry = entries.find((e) => e.entryName === entryPoint);
        if (!contentEntry) {
            report.failures.push(`content_id cannot be verified — entry_point ${entryPoint} missing`);
        } else {
            const result = verifyContentHash(manifest.document.content_id, contentEntry.getData());
            if (result.ok) {
                report.passes.push(`document.content_id verifies (${result.algo})`);
            } else {
                report.failures.push(result.message);
            }
        }
    }

    // --- Signature chain (v2.0 §16) ---
    const signatures = manifest.security && manifest.security.signatures;
    if (Array.isArray(signatures) && signatures.length > 0) {
        verifySignatureChain(signatures, trustPolicy, options, report);
    } else {
        // Check legacy v1.1 singular signature
        const legacy = manifest.security && manifest.security.signature;
        if (legacy) {
            report.warnings.push(
                'Archive uses legacy v1.1 security.signature (singular); full chain verification unavailable',
            );
            if (legacy.signed_by) {
                report.passes.push(`legacy signature signed_by: ${legacy.signed_by}`);
            }
        } else {
            report.warnings.push('No signatures declared — archive is unsigned');
        }
    }

    // --- Crypto-verify caveat ---
    // Until Ed25519/RS256/ES256 verification ships (Phase 3.2), tell users
    // that structural verification != cryptographic verification.
    if (Array.isArray(signatures) && signatures.length > 0) {
        report.warnings.push(
            'Structural signature-chain verification only; cryptographic ' +
                'signature-value verification (Ed25519/RS256/ES256) is Phase 3.2 — ' +
                "this command does NOT yet prove the archive wasn't tampered with.",
        );
    }

    return report;
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
    // match sha256 of the previous entry's signature bytes.
    for (let i = 1; i < signatures.length; i++) {
        const prev = signatures[i - 1];
        const curr = signatures[i];
        if (!curr.prev_signature) {
            report.failures.push(
                `signatures[${i}] missing prev_signature (breaks chain integrity)`,
            );
            continue;
        }
        const prevSigBytes = Buffer.from(prev.signature || '', 'utf8');
        const expectedPrevHash = 'sha256:' + crypto.createHash('sha256').update(prevSigBytes).digest('hex');
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
