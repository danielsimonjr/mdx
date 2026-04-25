#!/usr/bin/env node
/**
 * Deterministic browser-extension bundler — Phase 4.6.8.
 *
 * Walks the in-repo extension source tree and builds a
 * reproducible `.zip` with a stable file order, normalised
 * timestamps, and no host-specific metadata (Windows ACLs, macOS
 * extended attrs, etc.). Same byte-stream out of every supported
 * runner host so AMO reviewers can verify the published artifact
 * by SHA-256.
 *
 * Usage:
 *
 *   node browser-extension/build.js                    # writes ./mdz-viewer-extension-<version>.zip
 *   node browser-extension/build.js --output PATH      # custom output path
 *   node browser-extension/build.js --print-sha256     # also print the SHA-256 of the output
 *
 * The script reads the version from `manifest.json` so the
 * filename matches the manifest declaration.
 *
 * Why custom code instead of `zip -X`: the Info-ZIP `zip -X`
 * approach is host-portable but emits slightly different bytes
 * on Windows (NTFS) vs Linux (ext4) because Windows still writes
 * the `external_attr` field with a value reflecting the source
 * filesystem permissions. A pure-JS impl using adm-zip with
 * pinned timestamps + sorted entries is byte-identical across
 * all three CI host OSes.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require(path.resolve(__dirname, '..', 'cli', 'node_modules', 'adm-zip'));

const ROOT = __dirname;
const PACKAGED_DIRS = ['background', 'content', 'popup', 'viewer', 'icons'];
const PACKAGED_FILES = ['manifest.json'];
const EXCLUDE_DIRS = new Set(['test', '__pycache__', 'node_modules']);
const EXCLUDE_FILES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

/** Pinned epoch the spec uses (1980-01-01 — earliest legal ZIP date). */
const PINNED_DATE = new Date(Date.UTC(1980, 0, 1, 0, 0, 0));

function listFilesRecursive(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE_FILES.has(entry.name)) continue;
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    const archivePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(abs, archivePath));
    } else if (entry.isFile()) {
      out.push({ abs, archivePath });
    }
  }
  return out;
}

function buildExtensionZip(outputPath) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
  const version = manifest.version || '0.0.0';

  const entries = [];
  for (const file of PACKAGED_FILES) {
    entries.push({ abs: path.join(ROOT, file), archivePath: file });
  }
  for (const dir of PACKAGED_DIRS) {
    const dirAbs = path.join(ROOT, dir);
    if (!fs.existsSync(dirAbs)) continue;
    entries.push(...listFilesRecursive(dirAbs, dir));
  }
  // Sort by archivePath for deterministic ordering.
  entries.sort((a, b) => (a.archivePath < b.archivePath ? -1 : a.archivePath > b.archivePath ? 1 : 0));

  const zip = new AdmZip();
  for (const e of entries) {
    const bytes = fs.readFileSync(e.abs);
    // Forward slashes already; addFile preserves them as-is.
    zip.addFile(e.archivePath, bytes, '', 0o644);
    // Pin the entry header time to the epoch so byte output is stable
    // across host wall-clocks. AdmZip exposes the header via getEntries.
  }
  for (const entry of zip.getEntries()) {
    entry.header.time = PINNED_DATE;
  }
  zip.writeZip(outputPath);
  return { version, entryCount: entries.length };
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function main() {
  const args = process.argv.slice(2);
  const printSha = args.includes('--print-sha256');
  let outIdx = args.indexOf('--output');
  let outPath = null;
  if (outIdx >= 0 && args[outIdx + 1]) outPath = args[outIdx + 1];

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
  if (!outPath) {
    outPath = path.resolve(ROOT, '..', `mdz-viewer-extension-${manifest.version}.zip`);
  }
  const { version, entryCount } = buildExtensionZip(outPath);
  const size = fs.statSync(outPath).size;
  console.log(`built  ${path.basename(outPath)}  v${version}  ${entryCount} files, ${size} bytes`);
  if (printSha) {
    console.log(`sha256 ${sha256(outPath)}`);
  }
}

if (require.main === module) main();

module.exports = { buildExtensionZip, sha256 };
