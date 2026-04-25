/**
 * Tests for the archive cache layer.
 *
 * IndexedDB itself isn't available in the vitest Node runtime, so the
 * IndexedDBArchiveCache is exercised at the integration boundary by
 * loadArchive (which falls through to the in-memory cache). The unit
 * tests below target the in-memory implementation directly because:
 *   1. Both implementations share the same `ArchiveCache` interface.
 *   2. The IndexedDB version mostly delegates to a thin promise wrapper
 *      that's hard to fake without `fake-indexeddb` (extra dev-dep we
 *      avoid here).
 *   3. The TTL + miss-on-empty-key logic that has real branching lives
 *      in `InMemoryArchiveCache`.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  InMemoryArchiveCache,
  defaultArchiveCache,
  type ArchiveCache,
} from "./archive-cache.js";

beforeAll(async () => {
  // archive.ts pulls fflate which needs no DOM, but the integration
  // round-trip below uses linkedom for the sanitizer. Polyfill DOMParser
  // here too to avoid an order-of-test failure.
  if (typeof DOMParser === "undefined") {
    const { DOMParser: LinkeDOMParser } = await import("linkedom");
    (globalThis as unknown as { DOMParser: unknown }).DOMParser = LinkeDOMParser;
  }
});

const enc = new TextEncoder();

describe("InMemoryArchiveCache", () => {
  it("get-after-put returns the same bytes", async () => {
    const c = new InMemoryArchiveCache();
    const bytes = enc.encode("hello");
    await c.put("k", bytes);
    expect(await c.get("k")).toBe(bytes);
  });

  it("returns null for missing keys", async () => {
    const c = new InMemoryArchiveCache();
    expect(await c.get("not-there")).toBeNull();
  });

  it("evicts entries past maxAgeMs", async () => {
    const c = new InMemoryArchiveCache({ maxAgeMs: 5 });
    await c.put("k", enc.encode("x"));
    await new Promise((r) => setTimeout(r, 20));
    expect(await c.get("k")).toBeNull();
    // The eviction also drops the entry from the map.
    expect(c.size()).toBe(0);
  });

  it("delete removes a single key", async () => {
    const c = new InMemoryArchiveCache();
    await c.put("a", enc.encode("1"));
    await c.put("b", enc.encode("2"));
    await c.delete("a");
    expect(await c.get("a")).toBeNull();
    expect(await c.get("b")).not.toBeNull();
  });

  it("clear empties the whole cache", async () => {
    const c = new InMemoryArchiveCache();
    await c.put("a", enc.encode("1"));
    await c.put("b", enc.encode("2"));
    await c.clear();
    expect(c.size()).toBe(0);
  });

  it("Infinity maxAgeMs disables expiration", async () => {
    const c = new InMemoryArchiveCache({ maxAgeMs: Infinity });
    await c.put("k", enc.encode("x"));
    await new Promise((r) => setTimeout(r, 20));
    expect(await c.get("k")).not.toBeNull();
  });
});

describe("defaultArchiveCache environment selection", () => {
  it("returns an InMemoryArchiveCache when IndexedDB is absent (Node)", () => {
    // The vitest Node runtime doesn't ship IndexedDB; the auto-selector
    // falls through to InMemory.
    const c = defaultArchiveCache();
    expect(c).toBeInstanceOf(InMemoryArchiveCache);
  });
});

// ---------------------------------------------------------------------------
// Integration with loadArchive — second load skips the fetch
// ---------------------------------------------------------------------------

import { loadArchive } from "./archive.js";

/** Build a minimal valid MDZ archive in memory. */
async function buildMdzBytes(title = "Cache Test"): Promise<Uint8Array> {
  const { zipSync } = await import("fflate");
  const manifest = {
    mdx_version: "2.0.0",
    document: {
      id: "00000000-0000-0000-0000-000000000099",
      title,
      created: "2026-01-01T00:00:00Z",
      modified: "2026-01-01T00:00:00Z",
    },
    content: { entry_point: "document.md" },
  };
  return zipSync({
    "manifest.json": enc.encode(JSON.stringify(manifest)),
    "document.md": enc.encode("# Hello\n"),
  });
}

describe("loadArchive cache integration", () => {
  it("on second load by URL, the cache short-circuits the fetch", async () => {
    const bytes = await buildMdzBytes("CacheRT");
    const cache: ArchiveCache = new InMemoryArchiveCache();
    let fetchCount = 0;
    const originalFetch = globalThis.fetch;
    // Stub fetch — count invocations + return the prebuilt bytes.
    globalThis.fetch = (async (_url: RequestInfo | URL) => {
      fetchCount += 1;
      return new Response(bytes as BlobPart, {
        status: 200,
        headers: { "Content-Type": "application/zip" },
      });
    }) as typeof fetch;
    try {
      const url = "https://example.com/cache-test.mdz";
      const a = await loadArchive(url, { cache });
      const b = await loadArchive(url, { cache });
      expect(a.manifest.document.title).toBe("CacheRT");
      expect(b.manifest.document.title).toBe("CacheRT");
      expect(fetchCount).toBe(1); // second load served from cache
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("loadArchive with cache:null bypasses caching entirely", async () => {
    const bytes = await buildMdzBytes("NoCache");
    let fetchCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCount += 1;
      return new Response(bytes as BlobPart, { status: 200 });
    }) as typeof fetch;
    try {
      const url = "https://example.com/nocache.mdz";
      await loadArchive(url, { cache: null });
      await loadArchive(url, { cache: null });
      expect(fetchCount).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("ArrayBuffer / Uint8Array sources never hit the cache", async () => {
    // The cache is URL-keyed; passing raw bytes shouldn't even trigger
    // a cache lookup. Asserts no exceptions and a clean load.
    const bytes = await buildMdzBytes("RawBytes");
    const cache: ArchiveCache = new InMemoryArchiveCache();
    const a = await loadArchive(bytes, { cache });
    expect(a.manifest.document.title).toBe("RawBytes");
    // Caller never URL-loaded; cache stays empty.
    expect((cache as InMemoryArchiveCache).size()).toBe(0);
  });
});
