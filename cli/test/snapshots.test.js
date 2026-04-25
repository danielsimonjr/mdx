/**
 * Tests for the CLI's delta-snapshots-v1 lib (Phase 4.5.2).
 *
 * Two responsibilities:
 *   1. Reader-side parity with the TS impl in
 *      `packages/mdz-viewer/src/snapshots.ts`. The CLI's port
 *      duplicates the algorithm intentionally — these tests
 *      pin the CLI version against the same inputs as the TS
 *      suite so they don't drift.
 *   2. Writer-side correctness: generated diffs round-trip through
 *      the applier (apply(generate(a→b), a) === b), and the
 *      add-delta-to-index helper preserves immutability.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  SnapshotError,
  parseIndex,
  resolveVersion,
  applyUnifiedDiff,
  generateUnifiedDiff,
  shouldStartNewChain,
  addDeltaToIndex,
} = require('../src/lib/snapshots.js');

const SIMPLE_INDEX = {
  schema_version: '1.0.0',
  extension: 'delta-snapshots-v1',
  chains: [
    {
      base: 'history/snapshots/base/v1.0.0.md',
      base_version: '1.0.0',
      deltas: [
        { version: '1.1.0', patch: 'history/snapshots/deltas/v1.1.0.patch', parent: '1.0.0' },
        { version: '1.2.0', patch: 'history/snapshots/deltas/v1.2.0.patch', parent: '1.1.0' },
      ],
    },
  ],
};

test('parseIndex accepts a valid index', () => {
  const idx = parseIndex(JSON.stringify(SIMPLE_INDEX));
  assert.equal(idx.extension, 'delta-snapshots-v1');
  assert.equal(idx.chains.length, 1);
});

test('parseIndex rejects malformed JSON', () => {
  assert.throws(() => parseIndex('{not json'), SnapshotError);
});

test('parseIndex rejects wrong extension', () => {
  const bad = JSON.stringify({ extension: 'delta-snapshots-v2', chains: [] });
  assert.throws(() => parseIndex(bad), /extension/);
});

test('parseIndex rejects duplicate delta versions', () => {
  const bad = JSON.stringify({
    extension: 'delta-snapshots-v1',
    chains: [{
      base: 'b.md',
      base_version: '1.0.0',
      deltas: [
        { version: '1.1.0', patch: 'a', parent: '1.0.0' },
        { version: '1.1.0', patch: 'b', parent: '1.0.0' },
      ],
    }],
  });
  assert.throws(() => parseIndex(bad), /duplicate/);
});

test('resolveVersion returns empty applyOrder for the base', () => {
  const r = resolveVersion(SIMPLE_INDEX, '1.0.0');
  assert.deepEqual(r.applyOrder, []);
});

test('resolveVersion returns full chain for a leaf', () => {
  const r = resolveVersion(SIMPLE_INDEX, '1.2.0');
  assert.deepEqual(r.applyOrder.map((d) => d.version), ['1.1.0', '1.2.0']);
});

test('resolveVersion throws on circular chains', () => {
  const idx = {
    schema_version: '1.0.0',
    extension: 'delta-snapshots-v1',
    chains: [{
      base: 'b.md',
      base_version: '1.0.0',
      deltas: [
        { version: 'A', patch: 'a', parent: 'B' },
        { version: 'B', patch: 'b', parent: 'A' },
      ],
    }],
  };
  assert.throws(() => resolveVersion(idx, 'A'), /circular/);
});

test('applyUnifiedDiff replaces a single line', () => {
  const source = 'alpha\nbeta\ngamma\n';
  const patch = '@@ -1,3 +1,3 @@\n alpha\n-beta\n+BETA\n gamma\n';
  assert.equal(applyUnifiedDiff(source, patch), 'alpha\nBETA\ngamma\n');
});

test('applyUnifiedDiff throws SnapshotError on context mismatch', () => {
  const source = 'alpha\nWRONG\ngamma\n';
  const patch = '@@ -1,3 +1,3 @@\n alpha\n-beta\n+BETA\n gamma\n';
  assert.throws(() => applyUnifiedDiff(source, patch), SnapshotError);
});

test('applyUnifiedDiff preserves no-trailing-newline state', () => {
  const source = 'alpha\nbeta';
  const patch = '@@ -1,2 +1,2 @@\n alpha\n-beta\n+BETA\n';
  assert.equal(applyUnifiedDiff(source, patch), 'alpha\nBETA');
});

// ---------------------------------------------------------------------------
// generateUnifiedDiff
// ---------------------------------------------------------------------------

test('generateUnifiedDiff produces an apply-able patch (single replacement)', () => {
  const a = 'alpha\nbeta\ngamma\n';
  const b = 'alpha\nBETA\ngamma\n';
  const patch = generateUnifiedDiff(a, b, 'v1.0.0.md', 'v1.1.0.md');
  assert.equal(applyUnifiedDiff(a, patch), b);
});

test('generateUnifiedDiff round-trips an insertion', () => {
  const a = 'a\nc\n';
  const b = 'a\nb\nc\n';
  const patch = generateUnifiedDiff(a, b, 'v1.0.0.md', 'v1.1.0.md');
  assert.equal(applyUnifiedDiff(a, patch), b);
});

test('generateUnifiedDiff round-trips a deletion', () => {
  const a = 'a\nb\nc\n';
  const b = 'a\nc\n';
  const patch = generateUnifiedDiff(a, b, 'v1.0.0.md', 'v1.1.0.md');
  assert.equal(applyUnifiedDiff(a, patch), b);
});

test('generateUnifiedDiff round-trips multiple distant changes', () => {
  const a = 'l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nl10\n';
  const b = 'l1\nL2\nl3\nl4\nl5\nl6\nl7\nl8\nL9\nl10\n';
  const patch = generateUnifiedDiff(a, b, 'a', 'b');
  assert.equal(applyUnifiedDiff(a, patch), b);
});

test('generateUnifiedDiff emits header-only patch when texts are identical', () => {
  const a = 'unchanged\n';
  const patch = generateUnifiedDiff(a, a, 'v1', 'v2');
  assert.equal(patch, '--- v1\n+++ v2\n');
  // Header-only patch applied to source returns source unchanged.
  assert.equal(applyUnifiedDiff(a, patch), a);
});

test('generateUnifiedDiff carries explicit version labels (no a/ b/ prefixes)', () => {
  const patch = generateUnifiedDiff('a\n', 'b\n', '1.0.0.md', '1.1.0.md');
  assert.match(patch, /^--- 1\.0\.0\.md\n\+\+\+ 1\.1\.0\.md\n/);
  assert.doesNotMatch(patch, /a\/|b\//);
});

test('generateUnifiedDiff round-trips with no trailing newline', () => {
  const a = 'alpha\nbeta';
  const b = 'alpha\nBETA';
  const patch = generateUnifiedDiff(a, b, 'a', 'b');
  assert.equal(applyUnifiedDiff(a, patch), b);
});

// ---------------------------------------------------------------------------
// shouldStartNewChain
// ---------------------------------------------------------------------------

test('shouldStartNewChain triggers above 20% threshold', () => {
  const parent = 'x'.repeat(1000);
  const bigPatch = 'x'.repeat(250); // 25%
  assert.equal(shouldStartNewChain(parent, bigPatch, 5), true);
});

test('shouldStartNewChain stays put under 20%', () => {
  const parent = 'x'.repeat(1000);
  const smallPatch = 'x'.repeat(100); // 10%
  assert.equal(shouldStartNewChain(parent, smallPatch, 5), false);
});

test('shouldStartNewChain triggers when chain depth is near the cap', () => {
  const parent = 'x'.repeat(1000);
  const tinyPatch = 'x';
  assert.equal(shouldStartNewChain(parent, tinyPatch, 49, 50), true);
});

// ---------------------------------------------------------------------------
// addDeltaToIndex
// ---------------------------------------------------------------------------

test('addDeltaToIndex appends to an existing chain', () => {
  const idx = JSON.parse(JSON.stringify(SIMPLE_INDEX));
  const next = addDeltaToIndex(idx, {
    version: '1.3.0',
    parent: '1.2.0',
    patchPath: 'history/snapshots/deltas/v1.3.0.patch',
    startNewChain: false,
  });
  assert.equal(next.chains[0].deltas.length, 3);
  assert.equal(next.chains[0].deltas[2].version, '1.3.0');
  // Input not mutated.
  assert.equal(idx.chains[0].deltas.length, 2);
});

test('addDeltaToIndex starts a new chain when requested', () => {
  const idx = JSON.parse(JSON.stringify(SIMPLE_INDEX));
  const next = addDeltaToIndex(idx, {
    version: '2.0.1',
    parent: '2.0.0',
    patchPath: 'history/snapshots/deltas/v2.0.1.patch',
    startNewChain: true,
    newBaseVersion: '2.0.0',
    newBasePath: 'history/snapshots/base/v2.0.0.md',
  });
  assert.equal(next.chains.length, 2);
  assert.equal(next.chains[1].base_version, '2.0.0');
  assert.equal(next.chains[1].deltas.length, 1);
});

test('addDeltaToIndex throws when parent is not in any chain and no new-base info', () => {
  const idx = JSON.parse(JSON.stringify(SIMPLE_INDEX));
  assert.throws(() => addDeltaToIndex(idx, {
    version: '5.0.0',
    parent: 'unknown',
    patchPath: 'p',
    startNewChain: false,
  }), /parent not in any chain/);
});
