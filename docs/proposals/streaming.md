# Proposal: Streaming / lazy-loading for large MDZ archives

**Status:** Draft (Phase 4.4 of ROADMAP.md). Pre-spec — gathering
feedback from implementers before the 500 MB in-memory ceiling becomes
a binding constraint on real use cases.

**Target audience:** viewer / editor implementers, preprint-server
operators, anyone ingesting MDZ archives larger than ~100 MB.

---

## The problem

MDZ v2.0 loads the entire archive into memory via `fflate.unzipSync`:

- Viewer: 500 MB hard ceiling (`MAX_TOTAL_INFLATED_BYTES` in
  `packages/mdz-viewer/src/archive.ts`).
- Rust binding: 500 MB hard ceiling (same constant in `bindings/rust`).
- Python reference: no ceiling, but the pattern is the same — unzip
  everything before touching the manifest.

This is fine for papers in the 100KB–50MB range. It breaks down for:

- Reproducible simulations with multi-GB datasets embedded as `assets/data/`.
- Papers with 4K-resolution figures or video-length experiments.
- Archival deposits that bundle every draft revision via `history/snapshots/`.

A 2 GB archive makes the browser viewer unresponsive; the Rust binding
refuses it; desktop editors without bounds fall over. The fix is to
read parts of the archive on demand.

## Goals

1. **O(1) time to first render** for the manuscript text regardless of
   total archive size. Readers should see the title + abstract +
   introduction before any data or media have downloaded.
2. **Incremental asset loading** — figures render when they come into
   viewport, not at archive-load time.
3. **No change to the archive format** — streaming is a *reader* concern.
   Archives produced before Phase 4 continue to work; archives produced
   after don't need a special flag.
4. **Graceful fallback** — readers that don't implement streaming keep
   using the full-inflation path. An archive MUST render in both modes.

## Non-goals

- **Partial writes** — authors still produce whole archives. Streaming is
  read-side only.
- **Mutable archives** — we do not propose appending to an open MDZ. If a
  reader needs updates, author a new version with `derived_from`.
- **Peer-to-peer / distributed storage** — IPFS / OCFL integration is
  Phase 4.5 if it happens at all.

---

## Design

### Range-request strategy (HTTP only)

For archives served over HTTPS, the ZIP format has a useful property:
the central directory (CD) lives at the end of the file, and its
entries include absolute byte offsets to each local file header.
Algorithm:

1. **GET** with `Range: bytes=-131072` (last 128 KB). This typically
   fetches the End of Central Directory Record (EOCD) plus the CD.
2. Parse the EOCD to locate CD start offset + CD length.
3. If the CD extends past the 128 KB window, issue a second Range
   request covering the CD.
4. Now the reader has every entry's name, size, compression method, and
   byte offset — without downloading any file contents.
5. Issue a targeted **Range** request for `manifest.json`. Parse it.
6. Issue a targeted Range request for `content.entry_point`. Render the
   manuscript.
7. For every `<img>` / `<video>` in the rendered markup, register an
   IntersectionObserver. When the element enters viewport, issue a
   Range request for the asset bytes, create a blob URL, assign to `src`.

Cost analysis for a 2 GB paper with a 50 KB manuscript and 100 figures
averaging 20 MB:

| Step | Bytes fetched |
|------|---------------|
| EOCD + CD | ~128 KB |
| manifest.json | ~10 KB |
| document.md | ~50 KB |
| First-viewport figures (5 of 100) | ~100 MB |
| **Total for interactive first paint** | **~100 MB** |
| vs. full-inflation path | 2 GB |

First paint is **20× faster**; the other 95 figures load on scroll.

### Prerequisites for range-request streaming

- Server MUST support HTTP Range requests (most CDNs do; S3, Cloudflare
  R2, GitHub releases all do).
- Archive MUST be stored uncompressed or with DEFLATE per-entry (which
  is the MDZ default). STORED per-entry files let us `Range` them
  directly; DEFLATE entries require inflating the fetched range, which
  fflate + a `decompressSync` call handles.
- Archive SHOULD have manifest.json as the first entry (already a §10.2
  normative ordering requirement).

### Local-file streaming (desktop editors / CLI)

For file-system-hosted archives, the same algorithm applies but with
`fs.createReadStream` + a seek-to-end pass. The ZIP library (yauzl for
Node, `zip` for Rust) handles this natively — they support
"random-access mode" where the library reads the CD first and returns
entry metadata without inflating anything.

Change required: the viewer's `Archive` / `LoadedArchive` types shift
from "eager Map of bytes" to "lazy entry reader". Concretely:

```ts
// Before (current)
export interface LoadedArchive {
  manifest: Manifest;
  entries: ReadonlyMap<string, Uint8Array>; // all inflated upfront
  content: string;
  ...
}

// After (proposed)
export interface LoadedArchive {
  manifest: Manifest;
  content: string; // manifest + entry_point eagerly loaded
  /** Promise-returning entry accessor — inflates on demand. */
  getEntry(path: string): Promise<Uint8Array | null>;
  /** List of paths (from CD parse, bytes not yet fetched). */
  entryPaths(): string[];
  ...
}
```

The synchronous `entries.get(path)` goes away; callers become async.
This is a breaking change for the 0.1.x viewer API — scheduled for the
0.2 release.

### Asset resolution under streaming

The web-component viewer's `resolveAsset` callback becomes async:

```ts
// Before
type ResolveAsset = (path: string) => string | null;

// After
type ResolveAsset = (path: string) => Promise<string | null>;
```

Image elements use a placeholder while the fetch is in flight:

```html
<img src="data:image/svg+xml;..." data-mdz-src="assets/images/fig.png" alt="Loading...">
```

An IntersectionObserver swaps `data-mdz-src` to the resolved blob URL
once the image is in viewport + the Range request completes.

---

## Content-addressed virtual filesystem (stretch)

Beyond pure HTTP range requests, a second layer would allow readers to
deduplicate assets across archives via content hash:

1. Each asset has a `content_hash` (already v2.0 §9.3 spec).
2. Viewer keeps a content-hash-keyed blob cache (IndexedDB).
3. On asset request, check cache first by hash; fetch only on miss.
4. Cross-archive sharing: if Paper A and Paper B both reference
   `assets/models/bert-base.gltf` with the same content_hash, a reader
   who already downloaded it for A gets B's figure instantly.

This is analogous to OCFL (Oxford Common File Layout, used by library
archival infrastructure) and similar to IPFS's content-addressed
storage model. Implementing it requires:

- Writer tools (CLI, SDK) guarantee that asset `content_hash` fields are
  computed correctly for every published archive.
- Cache persistence layer in the viewer (IndexedDB is the natural choice).
- Cache invalidation policy (straightforward — hash mismatch = stale).

Downside: privacy. A reader's cache state reveals which papers they've
previously viewed (same hashes → same papers). Phase 5 governance
discussion — for now, keep it local-only and out of any cross-origin
cache API.

---

## Migration plan

1. **0.1.x viewer (current):** in-memory with 500 MB ceiling. Ship.
2. **0.2 viewer (Phase 4.4):** introduce async `getEntry` API alongside
   the existing `entries` Map (marked deprecated). Both work. Lazy
   loading enabled by default over HTTPS; flag `eager: true` preserves
   old behavior for callers that depend on it.
3. **0.3 viewer:** remove the Map. All access goes through `getEntry`.
   Breaking change announced one minor version in advance per the
   backward-compat policy.
4. **1.0 viewer:** streaming is the default, eager is opt-in.

---

## Implementation risks

- **HTTP Range is not universal.** Some academic-institution proxies
  strip Range headers or force full-response caching. Viewer detects
  via a `HEAD` request's `Accept-Ranges: bytes` before committing to
  lazy mode; falls back to eager.
- **ZIP central directory position varies.** Archives built with
  comments at EOCD can push the CD arbitrarily far from the end. The
  128 KB prefetch may be insufficient. Readers issue a second Range
  request when the first doesn't find the EOCD signature
  (`0x06054b50`).
- **DEFLATE entries crossing range boundaries.** A compressed entry
  larger than ~100 MB requires multiple Range requests, and some ZIP
  libraries don't support incremental inflate. Readers may fall back to
  eager for any single entry >100 MB.
- **Asset-loading races.** IntersectionObserver → Range fetch is async;
  users scrolling fast may see image placeholders flash. Debounce with
  a 150 ms delay before issuing the fetch; good UX.

## Open questions

1. **Should signature verification work under streaming?** The
   manifest_checksum hashes the manifest bytes, which are loaded eagerly
   — so yes. The content_id hashes the entry_point bytes, also loaded
   eagerly — so yes. Per-asset content_hashes are verified on asset
   fetch, not archive load — which means a fetched-but-unverified asset
   could briefly render. Readers MUST attach a sentinel class like
   `mdz-asset-unverified` to images until their hash is checked.

2. **Cache poisoning across origins.** Same-origin cache is safe. A
   cross-origin cache (paper on site A references an asset already
   downloaded for paper on site B) opens an attack vector: site B could
   publish a paper whose hash collides with a legitimate site-A asset
   and substitute malicious content. Defense: bind cache to origin, OR
   require signatures on any cached asset (then the attack requires
   compromising a signer's key).

3. **Editor implications.** Editors need to write archives, which is
   much easier when the whole thing fits in memory. Streaming writes
   are out-of-scope for Phase 4.4; desktop editors will continue to
   impose their own (higher) memory ceiling.

---

## Relationship to other proposals

- **Phase 4.5 delta encoding**: orthogonal. Delta-encoded history
  snapshots save *archive size*; streaming saves *memory at load
  time*. Both can coexist.
- **Phase 3.1 CSP profile**: streaming fetches are same-origin (from the
  archive URL). No CSP changes needed.
- **Content-addressing (v2.0 §9)**: streaming depends on content-hash
  verification being deferred to asset-fetch time, not eager. This is
  already how the viewer 0.1 behaves.

## Request for feedback

Before writing this into the spec as a normative "readers SHOULD
support streaming for archives > N MB" clause:

- Which preprint servers would support HTTP Range for uploaded
  archives? (Zenodo: yes, confirmed via `curl -I`. arXiv `/e-print/`:
  mirror-dependent; most return `Accept-Ranges: none`. OSF: depends on
  the Waterbutler storage backend. Institutional repos: varies widely.
  Phase 4.3 corpus work will verify each server empirically.)
- Are there any archives in active use today that would break under
  streaming? (None known; the reference example is 6KB, a test corpus
  is the next step.)
- Is 100 MB a reasonable per-entry fallback-to-eager threshold? Or
  higher?

Please open an issue at `github.com/danielsimonjr/mdx` tagged
`proposal:streaming` with your answers.
