/**
 * Phase 2.3a.7.1 — build deterministic e2e fixture archives.
 *
 * Outputs:
 *   editor-desktop/e2e/fixtures/sample.mdz
 *
 * The archive packs a minimal but realistic MDZ:
 *   - manifest.json declaring mdx_version 2.0.0, two locales (en/fr),
 *     one image asset under `assets/images/`, and a delta-snapshots-v1
 *     extension entry.
 *   - document.md with one ::cell{language=python}, one ::fig, and a
 *     short prose body — exercises the directives the picker stubs
 *     will eventually drive.
 *   - document.fr.md as the localized counterpart.
 *   - assets/images/example.png — 1×1 transparent PNG (deterministic
 *     67-byte payload), referenced by the ::fig directive.
 *   - history/snapshots/index.json + base + one unified-diff delta —
 *     two snapshot versions (v1 + v2) so the Compare-versions stub
 *     has something to point at when 2.3a.7.2 unskips it.
 *
 * Determinism: fflate's zipSync writes entries in insertion order with
 * mtime=1980-01-01 (the ZIP epoch) by default, so re-running this
 * script produces a byte-identical archive. CI can therefore commit
 * sample.mdz directly without flakes from timestamp drift.
 *
 * Usage:
 *   node editor-desktop/e2e/fixtures/build-fixtures.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const enc = new TextEncoder();

// 1×1 transparent PNG. Hex was generated once with `pngcrush -brute` on
// a 1×1 RGBA black-zero-alpha; checked-in literal so the build script
// stays dependency-free.
const ONE_PX_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

const MANIFEST = {
  mdx_version: "2.0.0",
  document: {
    id: "00000000-0000-0000-0000-0000000fixed",
    title: "E2E Sample Archive",
    created: "2026-04-25T00:00:00Z",
    modified: "2026-04-25T00:00:00Z",
    language: "en",
    authors: [{ name: "Phase 2.3a.7.1 fixture", role: "author" }],
  },
  content: {
    entry_point: "document.md",
    locales: ["en", "fr"],
  },
  assets: {
    images: [
      {
        path: "assets/images/example.png",
        content_hash:
          // sha256 of ONE_PX_PNG above. Verified by the assertion at
          // the bottom of build() — keeps the fixture self-checking.
          "sha256:3bdba8cdd985df984cdb8dae9a5da9cb90dd1ada772c92cf813b88c8a6062b86",
      },
    ],
  },
};

const DOCUMENT_MD = `# E2E sample

This archive is the deterministic fixture for Phase 2.3a.7 Playwright
specs. It contains exactly one of every directive the e2e suite needs
to exercise: a code cell, a figure, a locale split, and a snapshot
chain.

::fig{id=example src=assets/images/example.png alt="A 1×1 transparent
pixel — placeholder for fixture stability"}

::cell{language=python id=hello}
print("hello from the fixture")
::end

The fixture is built deterministically by
\`editor-desktop/e2e/fixtures/build-fixtures.mjs\`; rerunning the
script must produce a byte-identical archive (fflate uses the ZIP
epoch for mtime).
`;

const DOCUMENT_FR_MD = `# Échantillon e2e

Variante française pour exercer le mode \`Compare-locales\`.

::fig{id=example src=assets/images/example.png alt="Un pixel
transparent 1×1"}

::cell{language=python id=hello}
print("bonjour")
::end
`;

// Two-snapshot chain: v1 base = original document.md, v2 delta adds a
// trailing line. Generated patches use the same `unified-diff` format
// that snapshots.js emits, so the e2e Compare-versions spec exercises
// the same code path production does.
const SNAPSHOTS_INDEX = {
  schema_version: "1.0.0",
  extension: "delta-snapshots-v1",
  chains: [
    {
      base: "history/snapshots/base/v1.md",
      base_version: "1",
      deltas: [
        {
          version: "2",
          parent: "1",
          patch: "history/snapshots/deltas/v2.patch",
        },
      ],
    },
  ],
};

const V2_DOCUMENT_MD = DOCUMENT_MD + "\n_Updated for snapshot v2._\n";

const V2_PATCH = `--- v1.md\n+++ v2.md\n@@ -16,3 +16,5 @@\n script; rerunning the\n script must produce a byte-identical archive (fflate uses the ZIP\n epoch for mtime).\n+\n+_Updated for snapshot v2._\n`;

function build() {
  // Self-check: the inlined content_hash must match the actual PNG
  // bytes. Catches drift if anyone hand-edits ONE_PX_PNG without
  // updating the manifest entry.
  const actualPngHash = "sha256:" + createHash("sha256").update(ONE_PX_PNG).digest("hex");
  const declaredPngHash = MANIFEST.assets.images[0].content_hash;
  if (actualPngHash !== declaredPngHash) {
    throw new Error(
      `PNG hash drift: ONE_PX_PNG hashes to ${actualPngHash} but the ` +
        `manifest declares ${declaredPngHash}. Update the manifest entry.`,
    );
  }

  const entries = {
    "manifest.json": enc.encode(JSON.stringify(MANIFEST, null, 2) + "\n"),
    "document.md": enc.encode(DOCUMENT_MD),
    "document.fr.md": enc.encode(DOCUMENT_FR_MD),
    "assets/images/example.png": ONE_PX_PNG,
    "history/snapshots/index.json": enc.encode(
      JSON.stringify(SNAPSHOTS_INDEX, null, 2) + "\n",
    ),
    "history/snapshots/base/v1.md": enc.encode(DOCUMENT_MD),
    "history/snapshots/deltas/v2.patch": enc.encode(V2_PATCH),
  };

  const zip = zipSync(entries, {
    // Stored (no compression) — keeps the output deterministic across
    // zlib versions; the 4 KB fixture doesn't benefit from compression
    // and STORED matches the EPUB OCF §4.3 mimetype-first rule used
    // elsewhere in the codebase, even though that rule doesn't apply
    // to MDZ specifically.
    level: 0,
  });

  const outPath = resolve(__dirname, "sample.mdz");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, zip);
  console.log(`✓ wrote ${outPath} (${zip.length} bytes)`);

  // Companion file so a Playwright spec can also exercise V2 of the
  // chain without re-zipping; reconstructing v2 from index.json + the
  // patch is what `mdz snapshot view` does, so the e2e compare-spec
  // doesn't need this — but having it pre-built keeps stub setup
  // trivial.
  const v2Path = resolve(__dirname, "sample.v2.md");
  writeFileSync(v2Path, V2_DOCUMENT_MD, "utf-8");
  console.log(`✓ wrote ${v2Path} (${V2_DOCUMENT_MD.length} bytes)`);
}

build();
