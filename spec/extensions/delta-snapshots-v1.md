# MDZ Extension: Delta-encoded history snapshots (v1.0-draft)

**Status:** Draft. Phase 4.5 of ROADMAP.md. Not part of the v2.0 core spec;
archives that use this extension MUST declare it in
`content.extensions[]` as `"delta-snapshots-v1"`.

**Audience:** authors of papers with many revisions; preprint servers
archiving the full history of a paper under one ID; anyone noticing
`history/snapshots/` ballooning.

---

## Problem

MDZ v2.0 §15 defines version history as a sequence of "full" snapshots
(entire content copied per version) or "diff" snapshots (unified diff
from a base version) or "reference" snapshots (pointer to external VCS).
In practice, authors almost always pick "full" — it's simplest to read
— and archives with more than a handful of versions accumulate many
nearly-identical copies of `document.md` in `history/snapshots/`.

For a paper that went through:

- Preprint v1.0.0
- Revision v1.1.0 after reviewer round 1
- Revision v1.2.0 after reviewer round 2
- Accepted v2.0.0
- Typeset v2.1.0

...the archive carries 5 copies of `document.md`. Each revision touches
maybe 5% of lines, so 95% of the storage is redundant.

## Goal

Define a packfile format for `history/snapshots/` that deduplicates
content across versions the way git does. Readers without the extension
continue to work — the classic `path` → full-snapshot mapping remains
the fallback.

## Non-goals

- Replacing the primary `document.md` with a delta. Deltas are confined
  to the `history/snapshots/` directory.
- Making snapshots writable by the viewer. This is an authoring concern;
  the CLI (or a future `mdz snapshot` command) builds the packfile.
- Git compatibility at the byte level. We borrow the idea, not the
  format — git's on-disk layout is optimized for its own assumptions
  (sliding window, 1 MB delta chains, zlib compression) that don't map
  cleanly to a ZIP-inside-ZIP.

---

## Design

### On-disk layout

Instead of:

```
history/
├── versions.json
└── snapshots/
    ├── v1.0.0.md
    ├── v1.1.0.md
    ├── v1.2.0.md
    ├── v2.0.0.md
    └── v2.1.0.md
```

the extension produces:

```
history/
├── versions.json
└── snapshots/
    ├── index.json          # per-version metadata: base version, patch path
    ├── base/
    │   └── v1.0.0.md       # one full snapshot per "base" (usually one)
    └── deltas/
        ├── v1.1.0.patch    # unified diff against base
        ├── v1.2.0.patch    # unified diff against v1.1.0
        ├── v2.0.0.patch    # unified diff against v1.2.0
        └── v2.1.0.patch    # unified diff against v2.0.0
```

Each `deltas/<version>.patch` is a **unified diff** (RFC 2822 / GNU diff
`-u` format) against the *previous* version in a chain. Chains start at
a `base/<version>.md` file — a snapshot stored verbatim. An author /
tool MAY create multiple bases (e.g., one per calendar year) to cap
worst-case patch-chain traversal.

### index.json

```json
{
  "schema_version": "1.0.0",
  "extension": "delta-snapshots-v1",
  "chains": [
    {
      "base": "base/v1.0.0.md",
      "base_version": "1.0.0",
      "deltas": [
        { "version": "1.1.0", "patch": "deltas/v1.1.0.patch", "parent": "1.0.0" },
        { "version": "1.2.0", "patch": "deltas/v1.2.0.patch", "parent": "1.1.0" },
        { "version": "2.0.0", "patch": "deltas/v2.0.0.patch", "parent": "1.2.0" },
        { "version": "2.1.0", "patch": "deltas/v2.1.0.patch", "parent": "2.0.0" }
      ]
    }
  ]
}
```

Fields:

- `chains[]` — one or more chains, each rooted at a `base`. Multiple
  chains allow snapshotting forks or keeping chain length bounded.
- `base_version` — must match an entry in `versions.json`'s `versions[]`.
- `deltas[].parent` — the version this patch applies TO. Must be either
  the chain's base or an earlier `version` in the same chain.

A reader reconstructs version V by:

1. Locate V in `index.json` → find the chain and the delta entry.
2. Walk backward from V to the chain's base, collecting patches.
3. Load `base/<chain.base>.md`.
4. Apply patches in forward order (base → ... → V).

### Patch format

Standard GNU unified diff with `-U 3` (three lines of context). Chosen
because:

- Human-readable (authors debugging version chains can read it).
- Deterministic (no timestamp fields; only the `---`/`+++` headers with
  path + version).
- Broadly supported (every language has a unified-diff applier).

Example `deltas/v1.1.0.patch`:

```diff
--- v1.0.0.md
+++ v1.1.0.md
@@ -42,7 +42,7 @@
 ## Methods
 
-We measured the effect using N=40 samples.
+We measured the effect using N=80 samples (expanded per reviewer 2).

 ### Data collection
```

The `---` / `+++` lines MUST carry the exact version strings (no `a/`
/ `b/` prefixes, no timestamps) so the applier can validate the chain.

### Constraints + errors

- **Max chain depth:** 50. Readers MAY reject chains deeper than 50
  unless they opt into longer chains explicitly. Deep chains multiply
  patch-apply time.
- **Patch conflicts:** an applier that fails to apply a delta cleanly
  (due to a malformed patch) MUST return an error identifying the
  version and patch line. Readers MUST NOT silently return a partially-
  applied document.
- **Missing parent:** if `deltas[].parent` references a version not in
  the chain, it's a validation error.
- **Circular chains:** Readers MUST detect and reject.

### Writer algorithm (reference)

When `mdz snapshot` (planned CLI subcommand) creates a new version:

1. Load the previous version by chain-walking.
2. Diff the new content against the previous version (`diff -U 3`).
3. If the diff is larger than 20% of the previous version, start a new
   base chain instead — the delta isn't paying off.
4. If the chain would exceed depth 50, start a new base.
5. Write the patch to `history/snapshots/deltas/<version>.patch`.
6. Update `index.json`.

### Reader backward compatibility

- Readers that don't know about `delta-snapshots-v1` see `history/snapshots/`
  populated with `base/`, `deltas/`, and `index.json`. They can't
  reconstruct versions — but they can still read the current version
  from `document.md` at archive root. Version *history* is unavailable,
  but the archive remains openable.
- Archives MAY include full snapshots AS WELL AS deltas during a
  transition period. `versions.json` entries point at either; readers
  pick whichever form they understand.

### Size estimate

For the 5-version paper above, assuming each revision touches ~5% of
~40 KB of markdown:

| Layout | Size |
|--------|------|
| All-full (v2.0 core) | 5 × 40 KB = 200 KB |
| Delta (v1 extension) | 1 × 40 KB + 4 × 2 KB ≈ 48 KB |
| **Savings** | **76%** |

For a paper with 30 revisions (unusual but not unheard of in long
review cycles), savings approach 95%.

---

## Conformance

A conformant reader that advertises support for `delta-snapshots-v1`:

1. MUST read `history/snapshots/index.json` and detect the extension.
2. MUST reconstruct any declared version by walking its chain.
3. MUST surface a clear error on malformed chains, circular chains, or
   unapplyable patches — not silently fall back.
4. MAY impose chain-depth limits (default 50, configurable).

A conformant writer producing `delta-snapshots-v1` archives:

1. MUST emit a valid `index.json` with every chain rooted at a base.
2. MUST ensure every delta applies cleanly to its declared parent at
   write time (verify by round-tripping).
3. SHOULD start a new chain when delta size exceeds 20% of the parent
   or when chain depth approaches 50.
4. MUST list `"delta-snapshots-v1"` in `manifest.content.extensions[]`.

## Open questions

1. **Binary assets in history.** Do we delta-encode large PNG/video
   assets that changed between versions? Binary diffs are much less
   effective than text diffs; probably not worth the complexity. Current
   proposal keeps binary assets in full, only deltas the markdown.
   Open for feedback.

2. **Should `index.json` be cryptographically signed alongside
   `manifest.json`?** The integrity-checksum scope in v2.0 §16 covers
   the manifest only. Tampering with `index.json` could let an attacker
   substitute a patch that reconstructs a different "v1.1.0" than what
   was originally published. Phase 3.2 signature work should include
   index.json in `scope: full-archive` coverage.

3. **Compression.** Deltas are stored as plain text; DEFLATE in the
   outer ZIP compresses them further. Deltas are already small — no
   case for a custom encoding.

## Next steps

1. Implement in the reference CLI (`mdz snapshot create|view|export`).
2. Add fixtures to `tests/conformance/history/` that exercise chain
   walks, invalid chains, circular chains.
3. Update `spec/manifest-v2.schema.json` with an optional
   `history.extension: "delta-snapshots-v1"` field.
4. Prove out with the arXiv corpus (Phase 4.3) — measure the actual
   distribution of revision sizes to validate the 20% threshold.
