/**
 * Persistent archive cache backed by IndexedDB (browser) with an
 * in-memory `Map` fallback for environments that don't ship one
 * (Cloudflare Worker, Node.js test runs).
 *
 * Why cache? The viewer's `loadArchive` path is fetch + ZIP inflate +
 * manifest parse. For a paper that a reader returns to (or a viewer
 * embedded multiple times on a page), repeating that work on every
 * render is wasteful. IndexedDB lets us skip the fetch entirely on
 * second visit — the inflated entries map fits in IDB cleanly because
 * Uint8Array is a structured-clone primitive.
 *
 * Why URL-keyed instead of content-hash-keyed? Two reasons:
 *   1. The reader has the URL before they have any of the archive's
 *      bytes; a content-hash key requires fetching first to compute it.
 *   2. The hosted-service Phase 2.2 already pins URLs whose
 *      `?content_hash=…` query carries the bytes hash — the URL acts
 *      as a synonym for the bytes for those cases.
 * For unpinned URLs (`?url=…` without a `content_hash` param), the
 * cache holds whatever the URL last served — a short TTL (default 1
 * hour) lets it stay correct when authors update the file in place.
 *
 * Eviction: not implemented in v0.1. IndexedDB has a per-origin quota
 * the browser enforces; on quota exhaustion `put()` rejects, the
 * caller ignores the rejection (cache is a perf optimization, not a
 * correctness requirement), and the next `get()` returns null. A
 * future LRU pass lives behind the `--with-cache-eviction` flag.
 */

const DB_NAME = "mdz-viewer-cache";
const STORE_NAME = "archives";
const DB_VERSION = 1;

/** Default TTL — entries older than this are treated as cache misses. */
const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

export interface CacheEntry {
  bytes: Uint8Array;
  /** Epoch milliseconds when the entry was written. */
  storedAt: number;
}

export interface ArchiveCache {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, bytes: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface CacheOptions {
  /** Override the default TTL. Pass `Infinity` to disable expiration. */
  maxAgeMs?: number;
}

// ---------------------------------------------------------------------------
// In-memory fallback (also used by tests)
// ---------------------------------------------------------------------------

/**
 * Map-backed cache. Used when IndexedDB isn't available (Worker,
 * Node test runs) and as a unit-testable surface for the eviction +
 * TTL logic without a real browser.
 */
export class InMemoryArchiveCache implements ArchiveCache {
  readonly #map = new Map<string, CacheEntry>();
  readonly #maxAgeMs: number;

  constructor(opts: CacheOptions = {}) {
    this.#maxAgeMs = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  }

  async get(key: string): Promise<Uint8Array | null> {
    const entry = this.#map.get(key);
    if (!entry) return null;
    if (Date.now() - entry.storedAt > this.#maxAgeMs) {
      this.#map.delete(key);
      return null;
    }
    return entry.bytes;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    this.#map.set(key, { bytes, storedAt: Date.now() });
  }

  async delete(key: string): Promise<void> {
    this.#map.delete(key);
  }

  async clear(): Promise<void> {
    this.#map.clear();
  }

  /** Test-only: peek at entry count without triggering TTL eviction. */
  size(): number {
    return this.#map.size;
  }
}

// ---------------------------------------------------------------------------
// IndexedDB implementation
// ---------------------------------------------------------------------------

/** Wrap an IDB request as a promise. The native API is callback-style. */
function promisifyRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IndexedDBArchiveCache implements ArchiveCache {
  readonly #maxAgeMs: number;
  #dbPromise: Promise<IDBDatabase> | null = null;

  constructor(opts: CacheOptions = {}) {
    this.#maxAgeMs = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  }

  /**
   * Lazy-open the IDB connection. Cached as a promise so concurrent
   * callers share the same connection rather than racing `open` calls
   * (which would each trigger `onupgradeneeded` paths on first run).
   */
  #db(): Promise<IDBDatabase> {
    if (this.#dbPromise) return this.#dbPromise;
    this.#dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.#dbPromise;
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const db = await this.#db();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const entry = (await promisifyRequest(store.get(key))) as CacheEntry | undefined;
      if (!entry) return null;
      if (Date.now() - entry.storedAt > this.#maxAgeMs) {
        // Stale — fire-and-forget delete and report miss.
        await this.delete(key).catch(() => undefined);
        return null;
      }
      return entry.bytes;
    } catch {
      // Cache failures are non-fatal — treat as miss.
      return null;
    }
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    try {
      const db = await this.#db();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const entry: CacheEntry = { bytes, storedAt: Date.now() };
      await promisifyRequest(store.put(entry, key));
    } catch {
      // Quota exceeded / IDB unavailable — silently drop. The caller
      // already has the bytes in memory; the cache is just for next time.
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const db = await this.#db();
      const tx = db.transaction(STORE_NAME, "readwrite");
      await promisifyRequest(tx.objectStore(STORE_NAME).delete(key));
    } catch {
      // No-op on failure.
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.#db();
      const tx = db.transaction(STORE_NAME, "readwrite");
      await promisifyRequest(tx.objectStore(STORE_NAME).clear());
    } catch {
      // No-op on failure.
    }
  }
}

// ---------------------------------------------------------------------------
// Auto-selection
// ---------------------------------------------------------------------------

/**
 * Pick the right cache implementation for the current environment.
 * Browsers get IndexedDB; everything else gets the in-memory fallback.
 *
 * Callers MAY pass an explicit instance via `loadArchive`'s `cache`
 * option — useful for tests, for opting OUT of caching (pass a
 * fresh `InMemoryArchiveCache` and discard), and for sharing a single
 * cache across viewers on the same page.
 */
export function defaultArchiveCache(opts: CacheOptions = {}): ArchiveCache {
  if (typeof indexedDB !== "undefined") {
    return new IndexedDBArchiveCache(opts);
  }
  return new InMemoryArchiveCache(opts);
}
