# MDZ feature support matrix

**Phase 4.6.9 deliverable.** A single source of truth for "which
implementation supports which spec feature." Reviewers,
integrators, and downstream tool authors should consult this
document before assuming a behaviour.

> **Status:** auto-checked against `ROADMAP.md` `[x]` claims +
> source-citation gate (`tests/roadmap/check_cited_paths.py`),
> but the matrix itself is hand-maintained. Update this file in
> the same PR as the implementation change.

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Fully implemented + tested |
| 🟡 | Partial / behind a flag / known caveats |
| ❌ | Not implemented |
| — | Out of scope for this implementation |

Implementations covered:

| ID | Path | Role |
|---|---|---|
| **TS** | `implementations/typescript/mdx_format.ts` | Reference TypeScript writer + reader |
| **PY** | `implementations/python/mdx_format.py` | Reference Python writer + reader |
| **RS** | `bindings/rust/` | Rust binding (read + verify; no writer) |
| **VW** | `packages/mdz-viewer/` | `<mdz-viewer>` web component (read-only viewer) |
| **HV** | `packages/mdz-viewer-hosted/` | Cloudflare Worker hosting `<mdz-viewer>` |
| **CLI** | `cli/` | `mdz` command-line tool |
| **ED** | `editor-desktop/` | Electron editor (read + write) |
| **EXT** | `browser-extension/` | MV3 cross-browser extension |

## Manifest fields (spec §3)

| Field | Required | TS | PY | RS | VW | CLI | ED |
|---|---|---|---|---|---|---|---|
| `mdx_version` | MUST | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `document.id` | MUST | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `document.title` | MUST | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `document.created` | MUST | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `document.modified` | MUST | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `document.language` | SHOULD | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `document.authors[]` | SHOULD | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `document.license` | SHOULD | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `document.content_id` | optional | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `document.profiles[]` | optional | ✅ | ✅ | 🟡 read | ✅ | ✅ | ✅ |
| `document.derived_from[]` | optional | ✅ | ✅ | 🟡 read | ✅ | ✅ | ✅ |
| `content.entry_point` | MUST | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `content.locales` | optional | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `assets.<category>[]` | optional | ✅ | ✅ | 🟡 read | ✅ | ✅ | ✅ |
| `kernels.<lang>` | optional | ✅ | ✅ | 🟡 read | ✅ | ✅ | ✅ Pyodide |
| `security.signatures[]` | optional | ✅ | ✅ | ✅ verify | 🟡 surface only | ✅ | 🟡 read only |
| `security.integrity.manifest_checksum` | SHOULD | ✅ | ✅ | ✅ verify | ✅ verify | ✅ verify | ✅ |
| `assets.<category>[].content_hash` (per-asset) | SHOULD | ✅ writes | ✅ writes | ✅ verify | 🟡 surface | ✅ verify Phase 4.6.9 | ✅ writes |
| `history.snapshots` (delta-snapshots-v1) | optional | 🟡 read | 🟡 read | 🟡 read | ✅ read | ✅ read+write | ✅ read |

🟡 caveats:

- RS reads + types these fields but doesn't expose them through
  the type-safe API surface; they're available via `Manifest::extra`.
- VW surfaces signatures (renders trust badges) but doesn't
  cryptographically verify them in the browser.
- ED reads existing signatures but the comment/reply/accept
  creation flow that would emit new signatures is Phase 2.3b.4.3
  (deferred).

## Directives (spec §6 + `spec/grammar/mdz-directives.abnf`)

| Directive | TS | PY | VW | ED |
|---|---|---|---|---|
| `::cell{language=…}` | ✅ | ✅ | ✅ | ✅ + ▶ Run button |
| `::output{type=…}` | ✅ | ✅ | ✅ | ✅ |
| `::include[target=…]` | ✅ | ✅ | ✅ archive-aware | ✅ picker |
| `::include` external URL + `content_hash` | ✅ | ✅ | ✅ enforced | 🟡 picker UI |
| `::fig{id=…}` | ✅ | ✅ | ✅ + i18n labels | ✅ picker |
| `::eq{id=…}` | ✅ | ✅ | ✅ | ✅ picker |
| `::tab{id=…}` | ✅ | ✅ | ✅ | ✅ picker |
| `::ref[id]` cross-ref | ✅ | ✅ | ✅ | ✅ |
| `::cite[key]` | ✅ | ✅ | ✅ CSL-JSON | ✅ picker |
| `::bibliography` | ✅ | ✅ | ✅ | ✅ |
| `::video[src]` | ✅ | ✅ | ✅ | ✅ picker |
| `::audio[src]` | ✅ | ✅ | ✅ | ✅ picker |
| `::model[src]` (glTF/GLB) | ✅ | ✅ | ✅ | ✅ picker |
| `::embed[src]` (PDF) | ✅ | ✅ | ✅ | ✅ picker |
| `::data[src]` (CSV/JSON viz) | ✅ | ✅ | ✅ | ✅ picker |
| `::note`, `::details`, `::toc` | ✅ | ✅ | ✅ | — (manual) |
| `:::container{}` blocks | ✅ | ✅ | ✅ | — |

## Integrity hash algorithms (spec §16)

| Algorithm | TS | PY | RS | VW | CLI | ED |
|---|---|---|---|---|---|---|
| `sha256` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `sha512` | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ |
| `blake3` | ✅ | ✅ | ✅ Phase 4.6.8 | ❌ | ❌ | ❌ |

🟡 VW: sha512 implemented but the front-end Web Crypto API
prefers sha256 for performance; sha512 only triggers when the
manifest declares it explicitly.

## EPUB round-trip (spec §12 / Phase 2.4)

| Direction | CLI | Notes |
|---|---|---|
| MDZ → EPUB (`mdz export-epub`) | ✅ | yazl-based, EPUB OCF §4.3-correct (mimetype first + STORED), preserves `::fig`/`::eq`/`::tab` directive identity |
| EPUB → MDZ (`mdz import-epub`) | ✅ | turndown-based, symmetric with export side; refuses DRM-encrypted EPUBs (`META-INF/encryption.xml`) |
| Round-trip MDZ → EPUB → MDZ | ✅ | 15 vitest cases; preserves declared values + labeled-directive identity |

## Locale support (spec §6.4 + 9)

| Feature | TS | PY | VW | ED |
|---|---|---|---|---|
| `manifest.content.locales[]` enumeration | ✅ | ✅ | ✅ | ✅ |
| Multiple locale files (`document.<lang>.md`) | ✅ | ✅ | ✅ | ✅ |
| BCP-47 subtag fallback | — | — | ✅ | ✅ |
| Localized labeled-directive prefixes | — | — | ✅ 8 langs | ✅ |
| Side-by-side compare-locales UI | — | — | — | ✅ read-write |
| `Add locale` command | — | — | — | ✅ |
| Sync-scroll between locales | — | — | — | ✅ paragraph-aligned |

## Snapshots (`delta-snapshots-v1` extension, Phase 4.5)

| Operation | TS | PY | RS | VW | CLI | ED |
|---|---|---|---|---|---|---|
| Parse `index.json` | — | — | — | ✅ | ✅ | ✅ |
| Reconstruct version (chain walk + apply) | — | — | — | ✅ | ✅ | ✅ |
| `mdz snapshot create` | — | — | — | — | ✅ | — |
| `mdz snapshot view` | — | — | — | — | ✅ | — |
| `mdz snapshot list` | — | — | — | — | ✅ | — |
| `mdz snapshot export` | — | — | — | — | ✅ Phase 4.6.9 | — |
| Compare-versions diff UI | — | — | — | — | — | ✅ |
| Conformance fixtures | — | — | — | — | ✅ 5 fixtures | — |

## Profiles (spec §7)

| Profile | Validator | Notes |
|---|---|---|
| `mdz-core-v1` | TS, CLI `validate --profile` | 6 required fields, no required extensions |
| `mdz-advanced-v1` | TS, CLI | Strict superset: 8 required fields, 17 validation rules, JCS canonicalisation, signatures required |
| `scientific-paper-v1` | TS, CLI | IMRaD structure + CSL-JSON bibliography + DID/ORCID authorship |
| `api-reference-v1` | TS, CLI | Required Endpoints section, semver `document.version`, code-language tags |

Example archive at `examples/scientific-paper/source/`
demonstrates the `scientific-paper-v1` profile.

## Cross-impl parity tests

| Direction | Harness | Status |
|---|---|---|
| TS ↔ Rust manifest | `tests/parity/rust_ts_manifest_parity.py` | ✅ Phase 4.6.2 |
| Python ↔ TS manifest | `tests/parity/py_ts_roundtrip.py` | ✅ Phase 1.3 |
| Python ↔ Rust manifest | — | ❌ Transitive via TS↔Rust + Py↔TS; direct harness deferred |

## How to update this matrix

1. Code change lands in a Phase X.Y or Phase 4.6.N entry.
2. Same PR updates the corresponding row in this file.
3. CI's `validate-roadmap` job catches `[x]` cited-path drift;
   the matrix isn't auto-checked but the underlying ROADMAP
   entries are. A future Phase 4.6.10 may introduce a YAML-
   driven generator that emits this matrix from a single
   source — for now, hand-maintenance is the contract.
