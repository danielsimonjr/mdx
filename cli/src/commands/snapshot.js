/**
 * `mdz snapshot` — manage delta-encoded version history
 * (Phase 4.5.2 / spec: `spec/extensions/delta-snapshots-v1.md`).
 *
 * Subcommands:
 *   - `view <file> <version>`  Reconstruct and print version
 *                              `<version>` from the archive's
 *                              delta chain.
 *   - `create <file> --version <v> [--parent <p>] [--message <m>]`
 *                              Add a new snapshot. Reads the
 *                              archive's current `document.md`,
 *                              compares against `--parent`'s
 *                              reconstructed content, writes the
 *                              unified-diff patch + updates
 *                              `index.json`.
 *   - `list <file>`            List all versions in the archive's
 *                              chains.
 *
 * The archive is rewritten in-place using AdmZip — same pattern as
 * `mdz edit`. Read-only commands (view, list) don't touch disk.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const AdmZip = require('adm-zip');
const {
  parseIndex,
  resolveVersion,
  applyUnifiedDiff,
  generateUnifiedDiff,
  shouldStartNewChain,
  addDeltaToIndex,
  SnapshotError,
} = require('../lib/snapshots.js');

const INDEX_PATH = 'history/snapshots/index.json';

function loadArchive(file) {
  const filePath = path.resolve(file);
  if (!fs.existsSync(filePath)) {
    console.error(chalk.red(`File not found: ${filePath}`));
    process.exit(1);
  }
  return { filePath, zip: new AdmZip(filePath) };
}

function readEntryText(zip, entryPath) {
  const entry = zip.getEntry(entryPath);
  if (!entry) return null;
  return entry.getData().toString('utf-8');
}

function loadIndex(zip) {
  const raw = readEntryText(zip, INDEX_PATH);
  if (!raw) return null;
  return parseIndex(raw);
}

function reconstruct(zip, index, version) {
  const resolved = resolveVersion(index, version);
  let content = readEntryText(zip, resolved.chain.base);
  if (content == null) {
    throw new SnapshotError(`base file '${resolved.chain.base}' not found in archive`, version);
  }
  for (const delta of resolved.applyOrder) {
    const patch = readEntryText(zip, delta.patch);
    if (patch == null) {
      throw new SnapshotError(`patch '${delta.patch}' not found in archive`, delta.version);
    }
    content = applyUnifiedDiff(content, patch, delta.version);
  }
  return content;
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

function viewSubcommand(file, version) {
  const { zip } = loadArchive(file);
  const index = loadIndex(zip);
  if (!index) {
    console.error(chalk.red('Archive does not declare delta-snapshots-v1; no history/snapshots/index.json found.'));
    process.exit(1);
  }
  try {
    const content = reconstruct(zip, index, version);
    process.stdout.write(content);
  } catch (e) {
    if (e instanceof SnapshotError) {
      console.error(chalk.red(`snapshot error (version ${e.version || '?'}): ${e.message}`));
      process.exit(1);
    }
    throw e;
  }
}

function listSubcommand(file) {
  const { zip } = loadArchive(file);
  const index = loadIndex(zip);
  if (!index) {
    console.error(chalk.yellow('Archive does not declare delta-snapshots-v1.'));
    process.exit(0);
  }
  for (const chain of index.chains) {
    console.log(chalk.cyan(`Chain rooted at ${chain.base_version} (${chain.base})`));
    console.log(`  ${chalk.gray('●')} ${chain.base_version} ${chalk.gray('(base)')}`);
    let parent = chain.base_version;
    for (const d of chain.deltas) {
      const arrow = d.parent === parent ? '└─' : `└─[from ${d.parent}]`;
      console.log(`  ${arrow} ${d.version} ${chalk.gray(d.patch)}`);
      parent = d.version;
    }
  }
}

function createSubcommand(file, options) {
  const newVersion = options.version;
  if (!newVersion) {
    console.error(chalk.red('--version is required (the version label this snapshot will receive)'));
    process.exit(1);
  }
  const { filePath, zip } = loadArchive(file);
  const index = loadIndex(zip);
  const docContent = readEntryText(zip, 'document.md');
  if (docContent == null) {
    console.error(chalk.red("archive missing 'document.md' — nothing to snapshot"));
    process.exit(1);
  }

  // First snapshot ever in this archive: seed a base chain.
  if (!index) {
    const basePath = `history/snapshots/base/v${newVersion}.md`;
    const newIndex = {
      schema_version: '1.0.0',
      extension: 'delta-snapshots-v1',
      chains: [{ base: basePath, base_version: newVersion, deltas: [] }],
    };
    zip.addFile(basePath, Buffer.from(docContent, 'utf-8'));
    zip.addFile(INDEX_PATH, Buffer.from(JSON.stringify(newIndex, null, 2), 'utf-8'));
    zip.writeZip(filePath);
    console.log(chalk.green(`✓ seeded base chain at ${newVersion} → ${basePath}`));
    return;
  }

  // Subsequent snapshot: reconstruct parent and diff against current document.
  const parentVersion = options.parent || pickLatestVersion(index);
  let parentContent;
  try {
    parentContent = reconstruct(zip, index, parentVersion);
  } catch (e) {
    console.error(chalk.red(`cannot reconstruct parent '${parentVersion}': ${e.message}`));
    process.exit(1);
  }

  const patchPath = `history/snapshots/deltas/v${newVersion}.patch`;
  const oldLabel = `v${parentVersion}.md`;
  const newLabel = `v${newVersion}.md`;
  const patch = generateUnifiedDiff(parentContent, docContent, oldLabel, newLabel);

  // Spec: round-trip the patch before writing it.
  const roundTripped = applyUnifiedDiff(parentContent, patch, newVersion);
  if (roundTripped !== docContent) {
    console.error(chalk.red(
      `internal error: generated patch does not round-trip (parent=${parentVersion}, new=${newVersion}). Aborting.`,
    ));
    process.exit(1);
  }

  // Decide chain placement.
  const chainOfParent = findChainOf(index, parentVersion);
  const depth = chainOfParent ? chainOfParent.deltas.length : 0;
  const startNew = shouldStartNewChain(parentContent, patch, depth);
  let updatedIndex;
  if (startNew) {
    const newBasePath = `history/snapshots/base/v${parentVersion}.md`;
    zip.addFile(newBasePath, Buffer.from(parentContent, 'utf-8'));
    updatedIndex = addDeltaToIndex(index, {
      version: newVersion,
      parent: parentVersion,
      patchPath,
      startNewChain: true,
      newBaseVersion: parentVersion,
      newBasePath,
    });
  } else {
    updatedIndex = addDeltaToIndex(index, {
      version: newVersion,
      parent: parentVersion,
      patchPath,
      startNewChain: false,
    });
  }

  zip.addFile(patchPath, Buffer.from(patch, 'utf-8'));
  // Re-write index — AdmZip's addFile replaces if present.
  zip.deleteFile(INDEX_PATH);
  zip.addFile(INDEX_PATH, Buffer.from(JSON.stringify(updatedIndex, null, 2), 'utf-8'));
  zip.writeZip(filePath);

  const verdict = startNew ? chalk.yellow('new chain') : chalk.green('appended');
  console.log(`✓ snapshot ${newVersion} ${verdict} (parent ${parentVersion}; patch ${patch.length} B)`);
  if (options.message) console.log(chalk.gray(`  ${options.message}`));
}

function findChainOf(index, version) {
  for (const chain of index.chains) {
    if (chain.base_version === version) return chain;
    if (chain.deltas.some((d) => d.version === version)) return chain;
  }
  return null;
}

function pickLatestVersion(index) {
  // Use the last delta of the last chain — appropriate default for
  // typical linear history. Authors with branching chains can
  // override via --parent.
  const lastChain = index.chains[index.chains.length - 1];
  if (lastChain.deltas.length === 0) return lastChain.base_version;
  return lastChain.deltas[lastChain.deltas.length - 1].version;
}

module.exports = {
  viewSubcommand,
  listSubcommand,
  createSubcommand,
};
