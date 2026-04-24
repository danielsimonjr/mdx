/**
 * MDZ archive loader — reads a ZIP blob / ArrayBuffer / URL into an in-memory
 * map of path -> Uint8Array. Uses `fflate` (8KB gzipped) instead of JSZip
 * (40KB+ gzipped) to fit the viewer's size budget.
 *
 * Accepts both .mdz (new) and .mdx (legacy) archives transparently — the
 * format is byte-identical; only the extension / MIME type differs.
 */

import { unzipSync } from "fflate";
import type { Manifest } from "./manifest-types.js";

export interface LoadedArchive {
  manifest: Manifest;
  entries: Map<string, Uint8Array>;
  /** The primary markdown content for the active locale/variant. */
  content: string;
  /** All available locale tags declared in the manifest. */
  localeTags: string[];
  /** The locale tag actually used to resolve `content`. */
  activeLocale: string | null;
}

/**
 * Thrown when an archive fails to parse or is missing required entries.
 * The viewer surfaces the `.userMessage` to end users; `.message` is the
 * technical detail for dev consoles.
 */
export class ArchiveLoadError extends Error {
  public readonly userMessage: string;
  constructor(technical: string, userMessage: string) {
    super(technical);
    this.name = "ArchiveLoadError";
    this.userMessage = userMessage;
  }
}

/**
 * Load an MDZ archive from any source the browser can turn into bytes.
 *
 * @param source ArrayBuffer | Uint8Array | Blob | string (URL)
 * @param opts.preferredLocales BCP 47 tags in preference order; the viewer
 *        resolves the first matching locale, else falls back per manifest.
 */
export async function loadArchive(
  source: ArrayBuffer | Uint8Array | Blob | string,
  opts: { preferredLocales?: readonly string[] } = {},
): Promise<LoadedArchive> {
  const bytes = await toBytes(source);
  const entries = inflateZip(bytes);

  const manifestBytes = entries.get("manifest.json");
  if (!manifestBytes) {
    throw new ArchiveLoadError(
      "archive is missing manifest.json",
      "This file is not a valid MDZ/MDX archive — manifest.json is missing.",
    );
  }
  const manifest = parseManifest(manifestBytes);
  const { content, activeLocale, localeTags } = resolveContent(
    manifest,
    entries,
    opts.preferredLocales ?? [],
  );

  return { manifest, entries, content, activeLocale, localeTags };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function toBytes(
  source: ArrayBuffer | Uint8Array | Blob | string,
): Promise<Uint8Array> {
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  if (typeof Blob !== "undefined" && source instanceof Blob) {
    return new Uint8Array(await source.arrayBuffer());
  }
  if (typeof source === "string") {
    const res = await fetch(source);
    if (!res.ok) {
      throw new ArchiveLoadError(
        `fetch ${source} -> ${res.status} ${res.statusText}`,
        `Couldn't download the archive (${res.status}).`,
      );
    }
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new ArchiveLoadError(
    `unsupported source type: ${typeof source}`,
    "Internal error: the viewer received an archive in a format it can't read.",
  );
}

function inflateZip(bytes: Uint8Array): Map<string, Uint8Array> {
  try {
    const flat = unzipSync(bytes);
    const map = new Map<string, Uint8Array>();
    for (const [name, data] of Object.entries(flat)) {
      map.set(name, data);
    }
    return map;
  } catch (e) {
    throw new ArchiveLoadError(
      `zip inflate failed: ${(e as Error).message}`,
      "This file isn't a valid ZIP archive.",
    );
  }
}

function parseManifest(bytes: Uint8Array): Manifest {
  const text = new TextDecoder("utf-8").decode(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new ArchiveLoadError(
      `manifest.json is not valid JSON: ${(e as Error).message}`,
      "The archive's manifest is corrupt (not valid JSON).",
    );
  }
  if (!isManifest(parsed)) {
    throw new ArchiveLoadError(
      "manifest.json is missing required fields (mdx_version, document, content)",
      "The archive's manifest is missing required fields.",
    );
  }
  return parsed;
}

function isManifest(v: unknown): v is Manifest {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.mdx_version === "string" &&
    typeof obj.document === "object" &&
    obj.document !== null &&
    typeof obj.content === "object" &&
    obj.content !== null
  );
}

function resolveContent(
  manifest: Manifest,
  entries: Map<string, Uint8Array>,
  preferred: readonly string[],
): { content: string; activeLocale: string | null; localeTags: string[] } {
  const locales = manifest.content.locales;
  const localeTags = locales?.available.map((l) => l.tag) ?? [];

  // Try preferred locales in order, then manifest fallback list, then default.
  let entryPoint = manifest.content.entry_point;
  let activeLocale: string | null = null;
  if (locales && locales.available.length > 0) {
    const tryTag = (tag: string): boolean => {
      const match = locales.available.find((a) => a.tag === tag);
      if (match) {
        entryPoint = match.entry_point;
        activeLocale = match.tag;
        return true;
      }
      return false;
    };
    const tried =
      preferred.some(tryTag) ||
      (locales.fallback ?? []).some(tryTag) ||
      tryTag(locales.default);
    if (!tried) {
      // Manifest declared locales but none resolved — fall back to the
      // top-level entry_point without an activeLocale marker.
      activeLocale = null;
    }
  }

  const contentBytes = entries.get(entryPoint);
  if (!contentBytes) {
    throw new ArchiveLoadError(
      `archive is missing content entry_point: ${entryPoint}`,
      `The archive references "${entryPoint}" but that file isn't in the ZIP.`,
    );
  }
  const content = new TextDecoder("utf-8").decode(contentBytes);
  return { content, activeLocale, localeTags };
}

/**
 * Get an asset as an object-URL Blob suitable for <img src>, <video src>,
 * etc. Caller is responsible for revoking via URL.revokeObjectURL when
 * the viewer disposes. Returns null if the path isn't in the archive.
 */
export function getAssetURL(
  archive: LoadedArchive,
  path: string,
): string | null {
  const bytes = archive.entries.get(path);
  if (!bytes) return null;
  const mime = lookupMime(archive, path);
  const blob = new Blob([bytes as BlobPart], { type: mime });
  return URL.createObjectURL(blob);
}

function lookupMime(archive: LoadedArchive, path: string): string {
  // Check the manifest's asset inventory first — authoritative MIME.
  const assets = archive.manifest.assets;
  if (assets) {
    for (const category of Object.values(assets)) {
      if (!Array.isArray(category)) continue;
      const hit = category.find((a) => a.path === path);
      if (hit?.mime_type) return hit.mime_type;
    }
  }
  // Fallback to extension-based guess for assets not in the inventory.
  return guessMimeFromPath(path);
}

const EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".csv": "text/csv",
  ".json": "application/json",
  ".pdf": "application/pdf",
};

function guessMimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  for (const ext of Object.keys(EXT_TO_MIME)) {
    if (lower.endsWith(ext)) return EXT_TO_MIME[ext];
  }
  return "application/octet-stream";
}
