/**
 * Pure archive I/O — open + save MDZ archives via injected `FsLike`
 * adapter. The Electron `main.ts` wires this against `node:fs/promises`;
 * tests wire it against an in-memory `Map<string, Uint8Array>`. The
 * decoupling lets the editor's open/save contracts be unit-tested
 * without spawning Electron's chrome.
 *
 * Mirrors the read-side surface the `<mdz-viewer>` web component
 * exposes (manifest + entries) but adds a save path that the viewer
 * doesn't need.
 */

import { unzipSync, zipSync } from "fflate";

/**
 * Minimal filesystem surface the open / save path needs. Three calls;
 * everything else is pure in-memory work.
 */
export interface FsLike {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export interface OpenedArchive {
  /** Source path (echoes the input — used by the renderer for window title). */
  path: string;
  /** Parsed `manifest.json`. */
  manifest: Record<string, unknown>;
  /** All archive entries as a path → bytes map. */
  entries: Map<string, Uint8Array>;
  /** UTF-8-decoded `document.md` (or whatever `content.entry_point` names). */
  content: string;
}

export interface SavePayload {
  manifest: Record<string, unknown>;
  /** Markdown body that becomes `document.md` (or `entry_point`) in the new archive. */
  content: string;
  /** Additional asset entries to include alongside the manifest + content. */
  assets?: ReadonlyMap<string, Uint8Array>;
}

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8");

/**
 * Open an MDZ archive at `path`. Returns parsed manifest + raw entry
 * map + decoded primary content. Throws on missing path, invalid ZIP,
 * missing manifest, or non-UTF-8 content.
 */
export async function openArchive(path: string, fs: FsLike): Promise<OpenedArchive> {
  if (!(await fs.exists(path))) {
    throw new ArchiveOpenError(`File not found: ${path}`);
  }
  const bytes = await fs.readFile(path);
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(bytes);
  } catch (e) {
    throw new ArchiveOpenError(
      `Not a valid ZIP archive (${(e as Error).message})`,
    );
  }
  const entries = new Map<string, Uint8Array>(Object.entries(raw));
  const manifestBytes = entries.get("manifest.json");
  if (!manifestBytes) {
    throw new ArchiveOpenError("Archive is missing manifest.json");
  }
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(dec.decode(manifestBytes)) as Record<string, unknown>;
  } catch (e) {
    throw new ArchiveOpenError(
      `manifest.json is not valid JSON: ${(e as Error).message}`,
    );
  }
  const entryPoint = readManifestEntryPoint(manifest);
  const contentBytes = entries.get(entryPoint);
  if (!contentBytes) {
    throw new ArchiveOpenError(
      `Archive is missing entry_point "${entryPoint}"`,
    );
  }
  return {
    path,
    manifest,
    entries,
    content: dec.decode(contentBytes),
  };
}

/**
 * Save a new MDZ archive to `path` from a manifest + content + asset
 * payload. Spec §10.2 mandates `manifest.json` is the FIRST entry in
 * the ZIP for streaming-friendly EOCD prefetch — `fflate` preserves
 * insertion order, so we add manifest first.
 */
export async function saveArchive(
  path: string,
  payload: SavePayload,
  fs: FsLike,
): Promise<void> {
  const entryPoint = readManifestEntryPoint(payload.manifest);
  const out: Record<string, Uint8Array> = {};
  // manifest.json first — spec §10.2 normative ordering.
  out["manifest.json"] = enc.encode(JSON.stringify(payload.manifest, null, 2));
  out[entryPoint] = enc.encode(payload.content);
  for (const [assetPath, bytes] of payload.assets ?? []) {
    if (assetPath === "manifest.json" || assetPath === entryPoint) {
      // Defensive: refuse to clobber the canonical entries via the
      // asset map. A caller misroute would otherwise silently
      // overwrite manifest.json with arbitrary bytes.
      throw new ArchiveSaveError(
        `Asset path "${assetPath}" collides with reserved canonical entry`,
      );
    }
    out[assetPath] = bytes;
  }
  const zipped = zipSync(out);
  await fs.writeFile(path, zipped);
}

function readManifestEntryPoint(manifest: Record<string, unknown>): string {
  const content = manifest.content as { entry_point?: unknown } | undefined;
  const ep = content?.entry_point;
  if (typeof ep === "string" && ep.length > 0) return ep;
  return "document.md"; // spec default
}

export class ArchiveOpenError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ArchiveOpenError";
  }
}

export class ArchiveSaveError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ArchiveSaveError";
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * In-memory `FsLike` for tests. Production code uses
 * `node:fs/promises` via a thin adapter in `main.ts`.
 */
export class MemoryFs implements FsLike {
  readonly #files = new Map<string, Uint8Array>();

  async readFile(path: string): Promise<Uint8Array> {
    const b = this.#files.get(path);
    if (!b) throw new Error(`MemoryFs: no such file: ${path}`);
    return b;
  }

  async writeFile(path: string, bytes: Uint8Array): Promise<void> {
    this.#files.set(path, bytes);
  }

  async exists(path: string): Promise<boolean> {
    return this.#files.has(path);
  }

  /** Test-only: peek bytes a previous writeFile stored. */
  peek(path: string): Uint8Array | undefined {
    return this.#files.get(path);
  }

  /** Test-only: prepopulate. */
  seed(path: string, bytes: Uint8Array): void {
    this.#files.set(path, bytes);
  }
}
