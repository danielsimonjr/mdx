# Decision: Content-addressing — keep or evolve?

**Status:** Scoping. This decision is non-urgent — the v2.0 shipped shape
is working. Revisit before v3.0 cuts a breaking change.

**Last reviewed:** 2026-04-24.

**ROADMAP reference:** Phase 1.5.

---

## Current state

MDZ v2.0 §9.2–§9.4 defines:

- `content_hash` field per asset — format `<algorithm>:<hex>` with
  `sha256 | sha512 | blake3` algorithms allowed.
- `assets/by-hash/sha256/<hex>` alias paths — bytes duplicated in the
  archive (once under the human-readable path, once under the content
  hash).
- `document.content_id` — hash of the entry-point bytes, used by the
  viewer for canonical linking.

Both the TypeScript and Python reference implementations emit this
shape. The Rust binding (Phase 4.1) verifies `content_hash` on demand.
The Node verifier (`cli/src/commands/verify.js`) exercises it.

## Open questions

### Q1. Should `assets/by-hash/` avoid byte duplication?

**The duplication today.** If `figures/plot.png` is 5 MB, the archive
carries 10 MB (once at `figures/plot.png`, once at
`assets/by-hash/sha256/abc…def.png`). The ZIP's DEFLATE compression
dedups *runs* inside a file, not across entries — so the archive size
roughly doubles for assets with a by-hash alias.

**Options.**

| Option | Size | Breaking? | Notes |
|--------|------|-----------|-------|
| (a) Keep duplication | Full | No | Simplest. Any ZIP tool sees both paths; readers that don't understand by-hash still render the document. |
| (b) Canonical by-hash, drop the named path | Half | **Yes — v3.0** | By-hash is the only path; the manifest maps human-readable names to hashes. Breaks every non-MDZ ZIP tool. |
| (c) Manifest alias table, no physical duplication | Half | Soft-break | Assets live under human-readable paths only; `manifest.assets[].content_hash_aliases` declares the hash(es) they're reachable as. Readers compute paths on the fly. |

**Trade-off axis.** Duplication costs 2x on archives with heavy by-hash
use, 0x on archives without. The scientific-paper corpus sees by-hash
usage in maybe 5–10% of archives (per Phase 4.3 arXiv benchmark,
pending). So 2x of a minority slice — absolute storage hit is small
for the population, annoying for the minority.

**Recommendation.** Defer to v3.0. If we break anything, break to option
(c) — it keeps the archive readable by every ZIP tool, uses the
manifest as the source of truth for aliasing, and is a smaller
surface change than option (b). Until then, document that authors
should skip `assets/by-hash/` for papers where archive size matters
more than cross-archive dedup.

### Q2. Should we adopt multihash + CIDv1 for IPFS / OCFL alignment?

**The pitch.** Adopting IPFS's multihash-prefixed CIDs (e.g.
`bafybeib…`) would let MDZ archives' content hashes flow directly into
IPFS pinning services and OCFL (Oxford Common File Layout) archival
deposits.

**The counter.** The scientific-paper corpus mostly uses:

- **Zenodo** — DataCite DOIs + SHA-256. Not CID-aware.
- **OSF** — DataCite DOIs + internal Waterbutler hashes. Not CID-aware.
- **arXiv** — internal indexing. Not CID-aware.
- **BagIt** (NIH, Library of Congress) — SHA-256 / SHA-512 manifests.
  Not CID-aware.
- **OAI-PMH** — metadata-only, no hashes.

We would be adopting a hash format that maps to nothing in the actual
preservation stack of the actual users. Complexity without payoff.

**Decision gate.** Ask 10 Zenodo / OSF / journal-production users:
"do you use IPFS?" If 3+ say yes, re-open. Until then, closed.

**Recommendation.** Do not adopt multihash / CIDv1. Keep SHA-256 /
SHA-512 / BLAKE3 as the canonical algorithms.

### Q3. Make the `checksum` → `content_hash` deprecation louder?

**State.** v2.0 type definitions already mark `checksum` as a
deprecated alias for `content_hash`. The spec document mentions it in
passing (§9.2).

**Recommendation.** Yes, make it louder. Add a prominent
deprecation notice in:

- `spec/MDX_FORMAT_SPECIFICATION_v2.0.md` §9.2 (one full paragraph,
  not a parenthetical).
- The TypeScript type declarations (`@deprecated` JSDoc tag with
  removal version: v3.0).
- The Python implementation (a `DeprecationWarning` when a loaded
  manifest uses `checksum`).

Removal target: v3.0, same window as any breaking change from Q1.

## Summary

1. **Q1 (by-hash duplication):** defer to v3.0; option (c) is the
   preferred evolution.
2. **Q2 (multihash / CIDv1):** reject; the niche does not use IPFS.
   Keep SHA-256 / SHA-512 / BLAKE3.
3. **Q3 (deprecation loudness):** act now — louder notice in spec,
   JSDoc, and Python runtime. Target v3.0 for removal.

No action needed on Q1 or Q2 until we cut a v3.0 RC. Q3 is a small
follow-up (documentation + a DeprecationWarning line) — open a ticket.
