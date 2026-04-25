/**
 * delta-snapshots-v1 implementation for the CLI (Phase 4.5.2).
 *
 * Mirrors `packages/mdz-viewer/src/snapshots.ts` (CommonJS port for
 * the CLI) and adds the writer-side helpers the viewer doesn't
 * need:
 *
 *   - `generateUnifiedDiff(oldText, newText, oldLabel, newLabel)`
 *     — produce a `diff -U 3`-compatible patch from two markdown
 *     strings using a line LCS. The CLI calls this when creating a
 *     new snapshot.
 *   - `addSnapshotToIndex(index, { version, parent, patchPath })`
 *     — return a new index.json structure with the delta added at
 *     the appropriate chain (or starts a new chain when the spec's
 *     20%-of-parent threshold is exceeded).
 *
 * Reader-side logic (parseIndex, resolveVersion, applyUnifiedDiff,
 * reconstructVersion) is byte-identical with the TS source —
 * deliberate duplication so the CLI doesn't pull in an ESM
 * runtime. Both sides have their own test suite.
 */

'use strict';

const DEFAULT_MAX_CHAIN_DEPTH = 50;
/** Spec-mandated delta-vs-base threshold for starting a new chain. */
const NEW_CHAIN_THRESHOLD = 0.2;

class SnapshotError extends Error {
  constructor(message, version, patchLine) {
    super(message);
    this.name = 'SnapshotError';
    this.version = version;
    this.patchLine = patchLine;
  }
}

// ---------------------------------------------------------------------------
// index.json parsing (mirrors snapshots.ts:parseIndex)
// ---------------------------------------------------------------------------

function parseIndex(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new SnapshotError(`index.json is not valid JSON: ${e.message}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new SnapshotError('index.json must be a JSON object');
  }
  if (parsed.extension !== 'delta-snapshots-v1') {
    throw new SnapshotError(`expected extension 'delta-snapshots-v1', got '${parsed.extension}'`);
  }
  if (!Array.isArray(parsed.chains) || parsed.chains.length === 0) {
    throw new SnapshotError('index.json must declare at least one chain');
  }
  return {
    schema_version: typeof parsed.schema_version === 'string' ? parsed.schema_version : '1.0.0',
    extension: 'delta-snapshots-v1',
    chains: parsed.chains.map(validateChain),
  };
}

function validateChain(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new SnapshotError('chain entry must be an object');
  }
  if (typeof raw.base !== 'string' || !raw.base) {
    throw new SnapshotError('chain.base is required');
  }
  if (typeof raw.base_version !== 'string' || !raw.base_version) {
    throw new SnapshotError('chain.base_version is required');
  }
  if (!Array.isArray(raw.deltas)) {
    throw new SnapshotError(`chain '${raw.base_version}': deltas must be an array`);
  }
  const seen = new Set([raw.base_version]);
  const deltas = [];
  for (const d of raw.deltas) {
    if (!d || typeof d !== 'object') {
      throw new SnapshotError(`chain '${raw.base_version}': delta entry must be an object`);
    }
    if (typeof d.version !== 'string' || !d.version) {
      throw new SnapshotError(`chain '${raw.base_version}': delta.version is required`);
    }
    if (typeof d.patch !== 'string' || !d.patch) {
      throw new SnapshotError(`chain '${raw.base_version}': delta.patch is required`);
    }
    if (typeof d.parent !== 'string' || !d.parent) {
      throw new SnapshotError(`chain '${raw.base_version}': delta.parent is required`);
    }
    if (seen.has(d.version)) {
      throw new SnapshotError(
        `chain '${raw.base_version}': duplicate delta version '${d.version}'`,
        d.version,
      );
    }
    deltas.push({ version: d.version, patch: d.patch, parent: d.parent });
    seen.add(d.version);
  }
  return { base: raw.base, base_version: raw.base_version, deltas };
}

// ---------------------------------------------------------------------------
// Chain resolution
// ---------------------------------------------------------------------------

function resolveVersion(index, version, options = {}) {
  const maxDepth = options.maxChainDepth || DEFAULT_MAX_CHAIN_DEPTH;
  for (const chain of index.chains) {
    if (chain.base_version === version) return { chain, applyOrder: [] };
    const byVersion = new Map();
    for (const d of chain.deltas) byVersion.set(d.version, d);
    if (!byVersion.has(version)) continue;
    const path = [];
    const seen = new Set();
    let current = version;
    while (current && current !== chain.base_version) {
      if (seen.has(current)) {
        throw new SnapshotError(`circular chain detected at version '${current}'`, current);
      }
      seen.add(current);
      const delta = byVersion.get(current);
      if (!delta) {
        throw new SnapshotError(
          `version '${current}' has no delta in chain '${chain.base_version}'`,
          current,
        );
      }
      path.push(delta);
      current = delta.parent;
      if (path.length > maxDepth) {
        throw new SnapshotError(`chain depth exceeds maximum of ${maxDepth}`, version);
      }
    }
    if (current !== chain.base_version) {
      throw new SnapshotError(
        `delta chain for '${version}' does not reach the base '${chain.base_version}'`,
        version,
      );
    }
    path.reverse();
    return { chain, applyOrder: path };
  }
  throw new SnapshotError(`version '${version}' not found in any chain`, version);
}

// ---------------------------------------------------------------------------
// Unified-diff applier (reader)
// ---------------------------------------------------------------------------

function applyUnifiedDiff(source, patch, version) {
  const sourceLines = source.split('\n');
  const trailingNewline = source.endsWith('\n');
  if (trailingNewline) sourceLines.pop();
  const patchLines = patch.split(/\r?\n/);
  const output = [];
  let cursor = 0;
  let pi = 0;
  while (pi < patchLines.length && (patchLines[pi].startsWith('---') || patchLines[pi].startsWith('+++'))) pi++;
  while (pi < patchLines.length) {
    const line = patchLines[pi];
    if (line === '' && pi === patchLines.length - 1) break;
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!m) { pi++; continue; }
    const oldStart = parseInt(m[1], 10);
    const oldCount = m[2] != null ? parseInt(m[2], 10) : 1;
    pi++;
    const targetCursor = oldStart - 1;
    if (targetCursor < cursor) {
      throw new SnapshotError(`hunk overlaps previous content at patch line ${pi}`, version, pi);
    }
    while (cursor < targetCursor) { output.push(sourceLines[cursor]); cursor++; }
    let consumed = 0;
    while (pi < patchLines.length) {
      const hl = patchLines[pi];
      if (hl.startsWith('@@')) break;
      if (hl.length === 0) {
        if (pi === patchLines.length - 1) { pi++; break; }
        if (consumed < oldCount) {
          if (sourceLines[cursor] !== '') {
            throw new SnapshotError(
              `context mismatch at source line ${cursor + 1} (expected blank)`, version, pi + 1);
          }
          output.push(''); cursor++; consumed++;
        }
        pi++; continue;
      }
      const sigil = hl.charAt(0);
      const content = hl.slice(1);
      if (sigil === ' ') {
        if (sourceLines[cursor] !== content) {
          throw new SnapshotError(
            `context mismatch at source line ${cursor + 1}: expected '${content}', got '${sourceLines[cursor]}'`,
            version, pi + 1);
        }
        output.push(content); cursor++; consumed++;
      } else if (sigil === '-') {
        if (sourceLines[cursor] !== content) {
          throw new SnapshotError(
            `removal mismatch at source line ${cursor + 1}: expected '${content}', got '${sourceLines[cursor]}'`,
            version, pi + 1);
        }
        cursor++; consumed++;
      } else if (sigil === '+') {
        output.push(content);
      } else if (sigil === '\\') {
        // ignore
      } else {
        throw new SnapshotError(`unrecognized patch line at ${pi + 1}: '${hl}'`, version, pi + 1);
      }
      pi++;
      if (consumed > oldCount) {
        throw new SnapshotError(
          `hunk consumed more source lines than declared (${consumed} > ${oldCount})`,
          version, pi);
      }
    }
  }
  while (cursor < sourceLines.length) { output.push(sourceLines[cursor]); cursor++; }
  let result = output.join('\n');
  if (trailingNewline) result += '\n';
  return result;
}

// ---------------------------------------------------------------------------
// Unified-diff generator (writer)
// ---------------------------------------------------------------------------

/**
 * Compute LCS between two line arrays — the classic DP table. Used
 * by `generateUnifiedDiff`. Returns an op stream
 * `{op: 'equal'|'add'|'del', line}`.
 */
function lineDiffOps(aLines, bLines) {
  const m = aLines.length;
  const n = bLines.length;
  const lcs = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      lcs[i][j] = aLines[i - 1] === bLines[j - 1]
        ? lcs[i - 1][j - 1] + 1
        : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    }
  }
  const ops = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (aLines[i - 1] === bLines[j - 1]) { ops.push({ op: 'equal', line: aLines[i - 1] }); i--; j--; }
    else if (lcs[i - 1][j] >= lcs[i][j - 1]) { ops.push({ op: 'del', line: aLines[i - 1] }); i--; }
    else { ops.push({ op: 'add', line: bLines[j - 1] }); j--; }
  }
  while (i > 0) { ops.push({ op: 'del', line: aLines[i - 1] }); i--; }
  while (j > 0) { ops.push({ op: 'add', line: bLines[j - 1] }); j--; }
  return ops.reverse();
}

/**
 * Produce a `diff -U <context>` unified diff between `oldText` and
 * `newText`. Always emits explicit `--- <oldLabel>` / `+++ <newLabel>`
 * headers (the spec mandates exact version strings, no `a/b/`
 * prefixes, no timestamps).
 *
 * Context lines: 3 by default (matching `diff -U 3`).
 */
function generateUnifiedDiff(oldText, newText, oldLabel, newLabel, contextLines = 3) {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const trailingA = oldText.endsWith('\n');
  const trailingB = newText.endsWith('\n');
  if (trailingA) a.pop();
  if (trailingB) b.pop();
  const ops = lineDiffOps(a, b);

  // If everything is equal, emit just the headers (zero-hunk patch).
  const hasChanges = ops.some((o) => o.op !== 'equal');
  if (!hasChanges) return `--- ${oldLabel}\n+++ ${newLabel}\n`;

  // Group ops into hunks. Two-pass approach so leading + trailing
  // context windows can't overlap and produce malformed patches:
  //   1. Find every change run (maximal sequence of non-equal ops).
  //   2. Pad each run with up to `contextLines` of equals on each
  //      side. Two padded runs whose gap of equals is less than
  //      `contextLines * 2` merge into one hunk; otherwise they
  //      stay separate.
  const changeRuns = [];
  let scan = 0;
  while (scan < ops.length) {
    if (ops[scan].op === 'equal') { scan++; continue; }
    const runStart = scan;
    while (scan < ops.length && ops[scan].op !== 'equal') scan++;
    changeRuns.push({ runStart, runEnd: scan });
  }
  const hunks = [];
  for (const run of changeRuns) {
    const start = Math.max(0, run.runStart - contextLines);
    const end = Math.min(ops.length, run.runEnd + contextLines);
    if (hunks.length > 0 && start <= hunks[hunks.length - 1].end) {
      // Merge: the new hunk's leading window overlaps the previous
      // hunk's trailing window. Extend the previous instead of
      // emitting a duplicate run.
      hunks[hunks.length - 1].end = end;
    } else {
      hunks.push({ start, end });
    }
  }

  // Build patch text.
  let patch = `--- ${oldLabel}\n+++ ${newLabel}\n`;
  for (const h of hunks) {
    // Compute old/new line ranges from the slice of ops in [h.start, h.end).
    let oldOffset = 0;
    let newOffset = 0;
    for (let k = 0; k < h.start; k++) {
      if (ops[k].op === 'equal' || ops[k].op === 'del') oldOffset++;
      if (ops[k].op === 'equal' || ops[k].op === 'add') newOffset++;
    }
    let oldCount = 0;
    let newCount = 0;
    const slice = ops.slice(h.start, h.end);
    for (const o of slice) {
      if (o.op === 'equal') { oldCount++; newCount++; }
      else if (o.op === 'del') oldCount++;
      else if (o.op === 'add') newCount++;
    }
    const oldStart = oldOffset + 1;
    const newStart = newOffset + 1;
    patch += `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n`;
    for (const o of slice) {
      if (o.op === 'equal') patch += ` ${o.line}\n`;
      else if (o.op === 'del') patch += `-${o.line}\n`;
      else patch += `+${o.line}\n`;
    }
  }
  return patch;
}

// ---------------------------------------------------------------------------
// Index mutation (writer)
// ---------------------------------------------------------------------------

/**
 * Decide whether a new delta should append to an existing chain or
 * start a fresh one. Per spec: start a new chain when the patch
 * exceeds 20% of the parent's size, OR when the chain depth
 * approaches the max (default 50).
 */
function shouldStartNewChain(parentText, patchText, chainDepth, maxDepth = DEFAULT_MAX_CHAIN_DEPTH) {
  if (chainDepth >= maxDepth - 1) return true;
  if (parentText.length === 0) return false;
  return patchText.length > parentText.length * NEW_CHAIN_THRESHOLD;
}

/**
 * Append a new delta entry to `index`, returning a NEW index
 * object (no input mutation). When `startNewChain` is true OR no
 * chain contains `parent`, a new chain rooted at `newBase` is
 * created.
 */
function addDeltaToIndex(index, opts) {
  const cloned = JSON.parse(JSON.stringify(index));
  const { version, parent, patchPath, startNewChain, newBaseVersion, newBasePath } = opts;
  if (!startNewChain) {
    // Find an existing chain that contains `parent`.
    for (const chain of cloned.chains) {
      if (chain.base_version === parent || chain.deltas.some((d) => d.version === parent)) {
        chain.deltas.push({ version, patch: patchPath, parent });
        return cloned;
      }
    }
  }
  if (!newBaseVersion || !newBasePath) {
    throw new SnapshotError(
      'cannot append: parent not in any chain and no new-base info provided',
      version,
    );
  }
  cloned.chains.push({
    base: newBasePath,
    base_version: newBaseVersion,
    deltas: [{ version, patch: patchPath, parent: newBaseVersion }],
  });
  return cloned;
}

module.exports = {
  SnapshotError,
  parseIndex,
  resolveVersion,
  applyUnifiedDiff,
  generateUnifiedDiff,
  shouldStartNewChain,
  addDeltaToIndex,
  DEFAULT_MAX_CHAIN_DEPTH,
  NEW_CHAIN_THRESHOLD,
};
