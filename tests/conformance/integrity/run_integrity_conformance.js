#!/usr/bin/env node
/**
 * Archive-level integrity conformance runner — Phase 3.2.
 *
 * Walks every fixture directory under
 * `tests/conformance/integrity/`, assembles each fixture's
 * descriptor into a real `.mdz` archive in a temp file, runs the
 * CLI's `mdz validate` against it, and asserts the validator
 * rejects the archive with the declared rule / message substring.
 *
 * Run from the repo root:
 *
 *     node tests/conformance/integrity/run_integrity_conformance.js
 *
 * Exit 0 on full pass; non-zero with a per-fixture failure summary
 * otherwise.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

// adm-zip lives at the workspace root (Phase 4.6.9 hoist); the
// previous reach into cli/node_modules has been retired.
const AdmZip = require('adm-zip');

const ROOT = __dirname;
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const VALIDATE_CMD = path.join(REPO_ROOT, 'cli', 'src', 'index.js');

function listFixtures() {
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(ROOT, name, 'descriptor.json')))
    .sort();
}

function buildArchive(descriptor, outPath) {
  const zip = new AdmZip();
  // Manifest first so the archive's first entry is consistent.
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(descriptor.manifest, null, 2), 'utf-8'));
  for (const [path, content] of Object.entries(descriptor.files || {})) {
    zip.addFile(path, Buffer.from(content, 'utf-8'));
  }
  zip.writeZip(outPath);
}

function runVerify(archivePath, subcommand) {
  // Run BOTH `validate` (structural) and `verify` (integrity +
  // signature chain) — the appropriate check depends on the
  // fixture's expected_error.rule. validate catches missing-required;
  // verify catches content_hash / asset_hash mismatch.
  const args = subcommand === 'validate'
    ? [VALIDATE_CMD, 'validate', archivePath, '--no-exit']
    : [VALIDATE_CMD, 'verify', archivePath, '--offline'];
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  try {
    stdout = execFileSync('node', args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    exitCode = e.status ?? 1;
    stdout = e.stdout?.toString() ?? '';
    stderr = e.stderr?.toString() ?? '';
  }
  return { stdout, stderr, exitCode };
}

const RULES_TO_VALIDATE = new Set([
  'missing_required_field',
]);

function pickSubcommand(rule) {
  return RULES_TO_VALIDATE.has(rule) ? 'validate' : 'verify';
}

function runFixture(name) {
  const dir = path.join(ROOT, name);
  const descriptor = JSON.parse(fs.readFileSync(path.join(dir, 'descriptor.json'), 'utf-8'));
  const archive = path.join(os.tmpdir(), `integrity-${name}-${crypto.randomBytes(4).toString('hex')}.mdz`);
  try {
    buildArchive(descriptor, archive);
    const expected = descriptor.expected_error;
    const subcommand = pickSubcommand(expected.rule);
    const result = runVerify(archive, subcommand);
    const haystack = (result.stdout + '\n' + result.stderr).toLowerCase();
    const needle = (expected.messageMatch || '').toLowerCase();

    // Validator should produce non-zero exit OR an error/issue line.
    const looksRejected = result.exitCode !== 0 || /error|invalid|fail|missing/i.test(result.stdout + result.stderr);
    if (!looksRejected) {
      return [`${name}: validator accepted a known-bad archive (exit ${result.exitCode})`];
    }
    if (needle && !haystack.includes(needle)) {
      return [
        `${name}: validator rejected as expected, but message lacks '${expected.messageMatch}'.`,
        `        stdout: ${result.stdout.trim().slice(0, 240)}`,
        `        stderr: ${result.stderr.trim().slice(0, 240)}`,
      ];
    }
    return [];
  } finally {
    try { fs.unlinkSync(archive); } catch { /* tempfile cleanup */ }
  }
}

function main() {
  const fixtures = listFixtures();
  if (fixtures.length === 0) {
    console.error(`no fixtures found in ${ROOT}`);
    process.exit(1);
  }
  const allErrors = [];
  let pass = 0;
  for (const name of fixtures) {
    const errors = runFixture(name);
    if (errors.length === 0) {
      console.log(`PASS  ${name}`);
      pass++;
    } else {
      console.log(`FAIL  ${name}`);
      for (const e of errors) console.log(`        ${e}`);
      allErrors.push(...errors);
    }
  }
  console.log(`\n${pass}/${fixtures.length} fixtures passed.`);
  process.exit(allErrors.length === 0 ? 0 : 1);
}

main();
