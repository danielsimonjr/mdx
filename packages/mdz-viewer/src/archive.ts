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
import { parseReferences, type CslEntry } from "./references.js";
import { defaultArchiveCache, type ArchiveCache } from "./archive-cache.js";

// ---------------------------------------------------------------------------
// ZIP-bomb + path-traversal defenses (threat-model T3 + T4)
// ---------------------------------------------------------------------------
//
// These limits are INTENTIONALLY conservative for the browser viewer.
// Bumping them requires a threat-model review — the size of an archive
// is attacker-controlled, and a 2 GB inflation on a shared viewer tab
// would make the browser unresponsive.

/** Maximum total inflated size across all archive entries. */
const MAX_TOTAL_INFLATED_BYTES = 500 * 1024 * 1024; // 500 MB

/** Threshold for logging a "large archive" warning. */
const WARN_INFLATED_BYTES = 50 * 1024 * 1024; // 50 MB

/** Maximum number of entries in the archive (ZIP-bomb shape #2). */
const MAX_ENTRY_COUNT = 10_000;

export interface LoadedArchive {
  manifest: Manifest;
  /**
   * Read-only map of archive-relative path -> inflated bytes.
   *
   * Typed `ReadonlyMap` to prevent callers from mutating the archive
   * after load (e.g., deleting manifest.json to corrupt a subsequent
   * re-render). The underlying Map is not deep-frozen — the Uint8Array
   * views can still be mutated by a determined caller, but doing so
   * requires an explicit `entries.get(path)` + byte write, which is
   * clearly intentional.
   */
  entries: ReadonlyMap<string, Uint8Array>;
  /** The primary markdown content for the active locale/variant. */
  content: string;
  /** All available locale tags declared in the manifest. */
  localeTags: string[];
  /** The locale tag actually used to resolve `content`. */
  activeLocale: string | null;
  /**
   * CSL-JSON references parsed from `references.json` at archive root,
   * keyed by entry `id`. Empty record when the archive carries no
   * `references.json` or it failed to parse — citation rendering falls
   * back to visible `[?key]` markers in that case.
   */
  references: Readonly<Record<string, CslEntry>>;
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
 * @param opts.cache Optional override for the IndexedDB-backed cache
 *        (Phase 2.1 perf win — second-load skips fetch + inflate).
 *        When `source` is a URL, the loader checks the cache first;
 *        on a miss it fetches and stores. Pass `null` to opt out of
 *        caching entirely.
 */
export async function loadArchive(
  source: ArrayBuffer | Uint8Array | Blob | string,
  opts: {
    preferredLocales?: readonly string[];
    cache?: ArchiveCache | null;
  } = {},
): Promise<LoadedArchive> {
  // Cache is consulted ONLY for URL sources — for ArrayBuffer / Blob
  // / Uint8Array the caller already has the bytes; caching them
  // would only help if THIS process re-loads the same Blob, which
  // doesn't happen in practice.
  const cache: ArchiveCache | null =
    opts.cache === undefined ? defaultArchiveCache() : opts.cache;
  let bytes: Uint8Array;
  let cacheKey: string | null = null;
  if (typeof source === "string" && cache) {
    cacheKey = source;
    const cached = await cache.get(cacheKey);
    if (cached) {
      bytes = cached;
    } else {
      bytes = await toBytes(source);
      // Fire-and-forget: caching is a perf optimization. Failures
      // (IDB quota, no IDB at all) are silently swallowed by the
      // cache impl itself.
      void cache.put(cacheKey, bytes);
    }
  } else {
    bytes = await toBytes(source);
  }
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
  // references.json is optional. When absent, citations render as
  // visible `[?key]` markers; this matches the
  // spec/directives/references-csl.md "visible miss" rule.
  const referencesBytes = entries.get("references.json");
  const references = referencesBytes ? parseReferences(referencesBytes) : {};

  return { manifest, entries, content, activeLocale, localeTags, references };
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
  let flat: Record<string, Uint8Array>;
  try {
    flat = unzipSync(bytes);
  } catch (e) {
    throw new ArchiveLoadError(
      `zip inflate failed: ${(e as Error).message}`,
      "This file isn't a valid ZIP archive.",
    );
  }

  // --- ZIP-bomb defense (T4) ---
  const names = Object.keys(flat);
  if (names.length > MAX_ENTRY_COUNT) {
    throw new ArchiveLoadError(
      `archive has ${names.length} entries, exceeds max ${MAX_ENTRY_COUNT}`,
      `This archive has too many entries (${names.length.toLocaleString()}) ` +
        `to be safely rendered.`,
    );
  }
  let totalBytes = 0;
  for (const data of Object.values(flat)) totalBytes += data.byteLength;
  if (totalBytes > MAX_TOTAL_INFLATED_BYTES) {
    throw new ArchiveLoadError(
      `archive inflates to ${totalBytes} bytes, exceeds max ${MAX_TOTAL_INFLATED_BYTES}`,
      `This archive is too large (${Math.round(totalBytes / 1024 / 1024)} MB ` +
        `after decompression) to load in the browser viewer.`,
    );
  }
  if (totalBytes > WARN_INFLATED_BYTES && typeof console !== "undefined") {
    console.warn(
      `[mdz-viewer] archive inflates to ${Math.round(totalBytes / 1024 / 1024)} MB — ` +
        `rendering may be slow on low-end devices.`,
    );
  }

  // --- Path-traversal defense (T3) ---
  const map = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(flat)) {
    const clean = sanitizeArchivePath(name);
    if (clean === null) {
      // Reject the whole archive rather than silently dropping a
      // malicious entry — if the author didn't intend this path, they
      // should fix the archive.
      throw new ArchiveLoadError(
        `archive entry has unsafe path: ${JSON.stringify(name)}`,
        `This archive contains a path that tries to escape its folder ` +
          `(${JSON.stringify(name)}).`,
      );
    }
    map.set(clean, data);
  }
  return map;
}

/**
 * Sanitize an archive-relative path. Returns `null` if the path is
 * unsafe (`..` segment, absolute path, drive letter on Windows, NUL byte,
 * etc.); otherwise returns the canonicalized forward-slash path.
 *
 * Policy: reject rather than silently strip. Authors rarely intend
 * `../etc/passwd`; accepting it and stripping silently would mask a
 * real problem.
 */
function sanitizeArchivePath(name: string): string | null {
  if (!name) return null;
  if (name.includes("\0")) return null;
  // Normalize backslashes (Windows ZIPs sometimes have them).
  const norm = name.replace(/\\/g, "/");
  // Absolute path or drive letter — reject.
  if (norm.startsWith("/")) return null;
  if (/^[a-z]:/i.test(norm)) return null;
  const segments = norm.split("/");
  for (const seg of segments) {
    if (seg === "..") return null;
    // "." is harmless but cluttered — drop it in the canonical form.
  }
  return segments.filter((s) => s !== "" && s !== ".").join("/");
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
    // Distinguish "locale resolution exhausted (declared entry_point was
    // selected, it's not in the ZIP)" from "manifest points at a bogus
    // top-level entry_point". The former is an author / tooling bug
    // worth surfacing clearly.
    const isLocalePath =
      localeTags.length > 0 &&
      locales?.available.some((a) => a.entry_point === entryPoint);
    const technical = isLocalePath
      ? `locale ${activeLocale ?? "default"} points at entry_point "${entryPoint}" which is missing from the archive`
      : `archive is missing content entry_point: ${entryPoint}`;
    const userMessage = isLocalePath
      ? `The archive declares locale "${activeLocale ?? "default"}" (from ${localeTags.join(", ")}) but the file "${entryPoint}" isn't inside the ZIP.`
      : `The archive references "${entryPoint}" but that file isn't in the ZIP.`;
    throw new ArchiveLoadError(technical, userMessage);
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
  const hit = Object.entries(EXT_TO_MIME).find(([ext]) => lower.endsWith(ext));
  return hit ? hit[1] : "application/octet-stream";
}
