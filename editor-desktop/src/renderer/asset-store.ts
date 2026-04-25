/**
 * Pure asset-state model — tracks the open archive's assets and the
 * pending changes since the last save. Decoupled from the DOM and
 * the browser's crypto API so the categorisation, SHA-256, and
 * manifest-update logic can be unit-tested in vitest's Node env.
 *
 * The renderer wires this to drag-drop events + a tree-view UI;
 * `saveArchive` consumes the resulting entry map + manifest.
 */

/**
 * Asset categories the spec recognizes. Maps to
 * `manifest.assets[<category>][]` per spec §9.
 */
export type AssetCategory =
  | "images"
  | "video"
  | "audio"
  | "models"
  | "documents"
  | "data"
  | "fonts"
  | "other";

export interface AssetEntry {
  /** Archive-relative path, always `assets/<category>/<basename>`. */
  path: string;
  /** Inflated bytes. */
  bytes: Uint8Array;
  /** SHA-256 in spec format `sha256:<hex>`. */
  contentHash: string;
  /** MIME type guessed from the extension. */
  mimeType: string;
  /** Inflated size in bytes. */
  sizeBytes: number;
}

/**
 * Compute SHA-256 over `bytes` and return `sha256:<hex>` per
 * `spec/MDX_FORMAT_SPECIFICATION_v2.0.md` §9.3.
 */
export type Hasher = (bytes: Uint8Array) => Promise<string>;

const EXT_MIME_MAP: ReadonlyArray<[RegExp, string, AssetCategory]> = [
  [/\.png$/i, "image/png", "images"],
  [/\.(jpg|jpeg)$/i, "image/jpeg", "images"],
  [/\.webp$/i, "image/webp", "images"],
  [/\.avif$/i, "image/avif", "images"],
  [/\.svg$/i, "image/svg+xml", "images"],
  [/\.gif$/i, "image/gif", "images"],
  [/\.mp4$/i, "video/mp4", "video"],
  [/\.webm$/i, "video/webm", "video"],
  [/\.mp3$/i, "audio/mpeg", "audio"],
  [/\.ogg$/i, "audio/ogg", "audio"],
  [/\.wav$/i, "audio/wav", "audio"],
  [/\.(gltf|glb)$/i, "model/gltf-binary", "models"],
  [/\.pdf$/i, "application/pdf", "documents"],
  [/\.csv$/i, "text/csv", "data"],
  [/\.json$/i, "application/json", "data"],
  [/\.(woff2?|ttf|otf)$/i, "font/woff2", "fonts"],
];

/**
 * Pick a category + MIME type from a filename. Unknown extensions
 * fall through to `other` + `application/octet-stream` — no silent
 * "guess as image" path.
 */
export function classify(filename: string): { category: AssetCategory; mimeType: string } {
  for (const [re, mime, cat] of EXT_MIME_MAP) {
    if (re.test(filename)) return { category: cat, mimeType: mime };
  }
  return { category: "other", mimeType: "application/octet-stream" };
}

/**
 * Default Hasher built on the Web Crypto API. The renderer uses this;
 * tests inject a fake hasher to keep the suite synchronous.
 */
export const webCryptoHasher: Hasher = async (bytes) => {
  const buf = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return "sha256:" + bufferToHex(buf);
};

function bufferToHex(buf: ArrayBuffer): string {
  const view = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < view.length; i++) {
    hex += view[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Format a byte count as a short human-readable string (3 KB / 4.2 MB).
 * Used by the tree-view UI; isolated for testing.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes >= 10240 ? 0 : 1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

/**
 * Mutable asset store — owns the entries map across add / remove /
 * rename plus a manifest-projection method that drops the right
 * entries into `manifest.assets[<category>][]` shape per spec §9.
 *
 * The store does NOT update the underlying manifest in place. Callers
 * read `manifestProjection()` at save time and merge it into their
 * working copy of the manifest. This keeps the store stateless w.r.t.
 * the rest of the open session — the open/save flow owns the
 * authoritative manifest.
 */
export class AssetStore {
  readonly #entries = new Map<string, AssetEntry>();
  readonly #hasher: Hasher;

  constructor(hasher: Hasher = webCryptoHasher) {
    this.#hasher = hasher;
  }

  /**
   * Stage a file. `filename` is the original on-disk basename;
   * the resulting archive path is `assets/<category>/<filename>`.
   * Hashes the bytes and emits a normalized AssetEntry.
   *
   * If a previously-staged entry exists at the same archive path,
   * it's replaced (last-write-wins). Returns the new entry.
   */
  async add(filename: string, bytes: Uint8Array): Promise<AssetEntry> {
    const { category, mimeType } = classify(filename);
    const baseName = stripPath(filename);
    const path = `assets/${category}/${baseName}`;
    const contentHash = await this.#hasher(bytes);
    const entry: AssetEntry = {
      path,
      bytes,
      contentHash,
      mimeType,
      sizeBytes: bytes.byteLength,
    };
    this.#entries.set(path, entry);
    return entry;
  }

  /**
   * Stage an entry at a precomputed archive path (skips
   * categorization). Used for variant generation: the encoder
   * already decided the path (`assets/images/x.1600w.webp`) and
   * we just need to write it back into the store with the right
   * MIME + content hash.
   */
  async addAt(archivePath: string, bytes: Uint8Array, mimeType: string): Promise<AssetEntry> {
    const contentHash = await this.#hasher(bytes);
    const entry: AssetEntry = {
      path: archivePath,
      bytes,
      contentHash,
      mimeType,
      sizeBytes: bytes.byteLength,
    };
    this.#entries.set(archivePath, entry);
    return entry;
  }

  /** Look up an entry by archive path. */
  get(path: string): AssetEntry | undefined {
    return this.#entries.get(path);
  }

  /** Filter entries by predicate (read-only). */
  filter(pred: (entry: AssetEntry) => boolean): AssetEntry[] {
    return Array.from(this.#entries.values()).filter(pred);
  }

  /** Existing variant paths an image source already has (used for idempotent encoding). */
  variantPathsFor(sourcePath: string): string[] {
    const dot = sourcePath.lastIndexOf(".");
    const stem = dot >= 0 ? sourcePath.slice(0, dot) : sourcePath;
    const out: string[] = [];
    for (const path of this.#entries.keys()) {
      if (path === sourcePath) continue;
      // Match `<stem>.<width>w.<format>` or `<stem>.<format>`
      if (path === `${stem}.webp` || path === `${stem}.avif`) out.push(path);
      else if (/^.+\.\d+w\.(webp|avif)$/.test(path) && path.startsWith(`${stem}.`)) out.push(path);
    }
    return out;
  }

  /** Remove an entry by path. Returns true when something was deleted. */
  remove(path: string): boolean {
    return this.#entries.delete(path);
  }

  /**
   * Rename an entry's basename (the category stays the same — moving
   * across categories isn't a rename, it's a delete + add).
   * Returns the new entry or null if the source path was missing or
   * the target already exists.
   */
  rename(path: string, newBasename: string): AssetEntry | null {
    const existing = this.#entries.get(path);
    if (!existing) return null;
    const dir = path.substring(0, path.lastIndexOf("/"));
    const newPath = `${dir}/${stripPath(newBasename)}`;
    if (newPath === path) return existing;
    if (this.#entries.has(newPath)) return null;
    const updated: AssetEntry = { ...existing, path: newPath };
    this.#entries.delete(path);
    this.#entries.set(newPath, updated);
    return updated;
  }

  /** Read-only view of the current entries. */
  list(): readonly AssetEntry[] {
    return Array.from(this.#entries.values());
  }

  /** Number of staged entries. */
  size(): number {
    return this.#entries.size;
  }

  /**
   * Build a `manifest.assets` projection per spec §9:
   * `{ [category]: [{ path, mime_type, size_bytes, content_hash }] }`.
   * Empty categories are omitted.
   */
  manifestProjection(): Record<string, Array<{
    path: string;
    mime_type: string;
    size_bytes: number;
    content_hash: string;
  }>> {
    const out: Record<string, Array<{
      path: string;
      mime_type: string;
      size_bytes: number;
      content_hash: string;
    }>> = {};
    for (const e of this.#entries.values()) {
      const cat = categoryFromPath(e.path);
      if (!out[cat]) out[cat] = [];
      out[cat].push({
        path: e.path,
        mime_type: e.mimeType,
        size_bytes: e.sizeBytes,
        content_hash: e.contentHash,
      });
    }
    // Sort each category alphabetically for stable manifest output —
    // keeps content-hash diffs minimal across saves.
    for (const arr of Object.values(out)) {
      arr.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    }
    return out;
  }

  /**
   * Flatten the staged entries into a `Map<string, Uint8Array>`
   * suitable for `saveArchive`'s `assets` parameter.
   */
  toEntriesMap(): Map<string, Uint8Array> {
    const m = new Map<string, Uint8Array>();
    for (const e of this.#entries.values()) m.set(e.path, e.bytes);
    return m;
  }

  /**
   * Bulk-load entries from a previously-loaded archive's entry map.
   * The hasher is invoked for each so re-saves can carry forward
   * existing content_hashes correctly (the manifest the archive
   * shipped with may be stale or missing hashes).
   */
  async loadFromArchive(entries: ReadonlyMap<string, Uint8Array>): Promise<void> {
    this.#entries.clear();
    for (const [path, bytes] of entries) {
      if (!path.startsWith("assets/")) continue;
      const baseName = stripPath(path);
      const { mimeType } = classify(baseName);
      const contentHash = await this.#hasher(bytes);
      this.#entries.set(path, {
        path,
        bytes,
        contentHash,
        mimeType,
        sizeBytes: bytes.byteLength,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function stripPath(name: string): string {
  // Defense against "../../etc/passwd" and similar — strip everything
  // up to the last slash or backslash; the asset store only ever
  // emits `assets/<cat>/<basename>` paths.
  const slash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
  return slash >= 0 ? name.slice(slash + 1) : name;
}

function categoryFromPath(path: string): string {
  // path = "assets/<cat>/<basename>"; pull the second segment.
  const parts = path.split("/");
  return parts[1] ?? "other";
}
