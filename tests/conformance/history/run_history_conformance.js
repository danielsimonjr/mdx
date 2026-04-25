#!/usr/bin/env node
/**
 * delta-snapshots-v1 conformance runner.
 *
 * Walks every fixture directory under `tests/conformance/history/`
 * and exercises the CLI's `cli/src/lib/snapshots.js` against it.
 * The viewer's TypeScript impl ships its own unit suite that pins
 * the same algorithm — both implementations passing means the
 * spec's two reference impls agree.
 *
 * Run from the repo root:
 *
 *     node tests/conformance/history/run_history_conformance.js
 *
 * Exit 0 on full pass; exit 1 with a per-fixture failure summary
 * otherwise. CI consumes the exit code; humans read the per-fixture
 * lines for actionable diagnostics.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  parseIndex,
  resolveVersion,
  applyUnifiedDiff,
  SnapshotError,
} = require('../../../cli/src/lib/snapshots.js');

const ROOT = __dirname;

function listFixtures() {
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(ROOT, name, 'expected.json')))
    .sort();
}

function readText(p) {
  return fs.readFileSync(p, 'utf-8');
}

function reconstruct(fixtureDir, index, version) {
  const resolved = resolveVersion(index, version);
  let content = readText(path.join(fixtureDir, resolved.chain.base));
  for (const delta of resolved.applyOrder) {
    const patch = readText(path.join(fixtureDir, delta.patch));
    content = applyUnifiedDiff(content, patch, delta.version);
  }
  return content;
}

function runPositive(name, fixtureDir, expected) {
  const errors = [];
  let index;
  try {
    index = parseIndex(readText(path.join(fixtureDir, 'index.json')));
  } catch (e) {
    return [`${name}: parse failed unexpectedly: ${e.message}`];
  }
  for (const [version, expectedPath] of Object.entries(expected.reconstructions)) {
    let got;
    try {
      got = reconstruct(fixtureDir, index, version);
    } catch (e) {
      errors.push(`${name}: reconstruct(${version}) threw: ${e.message}`);
      continue;
    }
    const want = readText(path.join(fixtureDir, expectedPath));
    if (got !== want) {
      errors.push(
        `${name}: reconstruct(${version}) mismatched expected (${expectedPath}). ` +
          `Got ${got.length} bytes, want ${want.length}.`,
      );
    }
  }
  return errors;
}

function runNegative(name, fixtureDir, expected) {
  const phase = expected.phase || 'parse';
  const wantMatch = (expected.messageMatch || '').toLowerCase();
  let stage = 'parse';
  let index;
  try {
    index = parseIndex(readText(path.join(fixtureDir, 'index.json')));
  } catch (e) {
    if (phase === 'parse') {
      const msg = (e.message || '').toLowerCase();
      if (!msg.includes(wantMatch)) {
        return [`${name}: parse threw but message '${e.message}' lacks '${expected.messageMatch}'`];
      }
      if (!(e instanceof SnapshotError)) {
        return [`${name}: parse threw a non-SnapshotError (${e.constructor.name}): ${e.message}`];
      }
      return [];
    }
    return [`${name}: expected '${phase}' failure but parse failed first: ${e.message}`];
  }
  if (phase === 'parse') {
    return [`${name}: expected parse-phase failure (match '${expected.messageMatch}'), but parse succeeded`];
  }

  stage = phase;
  if (phase === 'resolve') {
    try {
      resolveVersion(index, expected.version);
      return [`${name}: expected resolve(${expected.version}) to throw matching '${expected.messageMatch}'`];
    } catch (e) {
      const msg = (e.message || '').toLowerCase();
      if (!msg.includes(wantMatch)) {
        return [`${name}: resolve threw but message '${e.message}' lacks '${expected.messageMatch}'`];
      }
      if (!(e instanceof SnapshotError)) {
        return [`${name}: resolve threw non-SnapshotError (${e.constructor.name}): ${e.message}`];
      }
      return [];
    }
  }
  if (phase === 'apply') {
    let resolved;
    try {
      resolved = resolveVersion(index, expected.version);
    } catch (e) {
      return [`${name}: expected apply-phase failure but resolve threw: ${e.message}`];
    }
    try {
      let content = readText(path.join(fixtureDir, resolved.chain.base));
      for (const d of resolved.applyOrder) {
        content = applyUnifiedDiff(content, readText(path.join(fixtureDir, d.patch)), d.version);
      }
      return [`${name}: expected apply(${expected.version}) to throw matching '${expected.messageMatch}'`];
    } catch (e) {
      const msg = (e.message || '').toLowerCase();
      if (!msg.includes(wantMatch)) {
        return [`${name}: apply threw but message '${e.message}' lacks '${expected.messageMatch}'`];
      }
      return [];
    }
  }
  return [`${name}: unknown phase '${phase}'`];
}

function main() {
  const fixtures = listFixtures();
  if (fixtures.length === 0) {
    console.error('no fixtures found in', ROOT);
    process.exit(1);
  }
  const allErrors = [];
  let pass = 0;
  for (const name of fixtures) {
    const fixtureDir = path.join(ROOT, name);
    const expected = JSON.parse(readText(path.join(fixtureDir, 'expected.json')));
    const errors = expected.kind === 'positive'
      ? runPositive(name, fixtureDir, expected)
      : runNegative(name, fixtureDir, expected);
    if (errors.length === 0) {
      console.log(`PASS  ${name} (${expected.kind})`);
      pass++;
    } else {
      console.log(`FAIL  ${name} (${expected.kind})`);
      for (const e of errors) console.log(`        ${e}`);
      allErrors.push(...errors);
    }
  }
  console.log(`\n${pass}/${fixtures.length} fixtures passed.`);
  process.exit(allErrors.length === 0 ? 0 : 1);
}

main();
