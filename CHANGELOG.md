# Changelog

All notable changes to the MDZ Format (formerly MDX Format) specification
and implementations.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Renamed: MDX → MDZ (2026-04-24)

Project renamed from **MDX** (Markdown eXtended Container) to **MDZ** (Markdown
Zipped Container). Reason: the original "MDX" name collides with the React
ecosystem's Markdown+JSX format, which dominates search results and developer
mindshare for "MDX file format." While deployed usage of this project is
effectively zero, it's the cheapest possible time to rename.

**Backward compatibility:** readers MUST accept both extensions and both MIME
types through 2027-01-01:

- Extensions: `.mdz` (new, preferred) and `.mdx` (legacy, accepted on read)
- MIME types: `application/vnd.mdz-container+zip` (new) and
  `application/vnd.mdx-container+zip` (legacy)
- Class names: `MDZDocument`, `MDZManifest`, etc. with `MDX*` deprecated
  aliases exported from the TypeScript library
- Manifest field: `mdx_version` retained (not renamed) to avoid breaking every
  existing manifest; readers treat it as equivalent to a hypothetical
  `mdz_version` field

After 2027-01-01, writers SHOULD emit `.mdz` exclusively; readers will
continue accepting `.mdx` indefinitely for archival access.

### Repositioned: "executable scientific papers" as the core niche

Previously framed as a general-purpose document format. Scope narrowed to
serve researchers publishing to arXiv / bioRxiv / Zenodo / OSF and the OA
journals that ingest from them. Every feature in the spec is now evaluated
against that niche. See [`docs/POSITIONING.md`](docs/POSITIONING.md) and
[`ROADMAP.md`](ROADMAP.md).

### Added — Strategic documents (2026-04-24)

- `ROADMAP.md` — phased plan through end-2027 with explicit success metrics
- `docs/POSITIONING.md` — one-page pitch for researchers
- `docs/COMPETITIVE.md` — honest comparison vs Quarto / Jupyter Book /
  Curvenote / Manubot / Stencila with feature matrix
- `docs/FUNDING.md` — resourcing reality and funding options (open)
- `docs/PARTNERSHIPS.md` — outreach plan targeting arXiv / Zenodo / journals
- `docs/for-authors/SUBMITTING.md` — ipynb+tex → MDZ conversion guide
- `docs/for-journals/EDITORIAL.md` — validation + JATS-XML production path
- `docs/for-reviewers/REPRODUCING.md` — re-execute cells, verify provenance
- `spec/profiles/mdz-advanced-v1.json` — opt-in enterprise-grade profile
  (JCS canonicalization, multi-sig, DIDs, content-addressing)
- Tightened `spec/profiles/scientific-paper-v1.json` — added IMRaD + Data
  Availability section requirements, ORCID-resolvable author DID requirement,
  SPDX license requirement, CSL-JSON bibliography requirement, stricter
  accessibility baseline.

### Added — Phase 4 ecosystem + Phase 5 governance (2026-04-24)

- **Rust binding** at `bindings/rust/` (0.1.0-alpha): `Archive::open`,
  manifest deserialization, `verify_integrity` / `verify_content_id` /
  `verify_signature_chain`. Structured error enums (`ArchiveError`,
  `IntegrityError`), `Role` enum with spec §16.2 "custom URI"
  acceptance, `License` untagged enum. ZIP-bomb defense via bounded
  reader (measures actual inflated bytes, not central-directory metadata).
  `FeatureDisabled` runtime error keeps the API stable across feature
  sets. 13 integration tests.
- **Pandoc Lua filter** at `integrations/pandoc/mdz-filter.lua`: handles
  `::cell` / `::output` / `::include` / `::fig` / `::ref` / `::cite`
  directives. Quote-aware attribute parser. Empty-cell-marker emits a
  visible `mdz-cell-empty` placeholder. 4 golden-output fixtures with
  pinned-expected enforcement.
- **VS Code extension** at `integrations/vscode/`: 6 commands (preview /
  view / validate / import-ipynb / export-jats / verify) with
  shell-injection-safe `execFile` argv, in-flight invocation tracking,
  bounded preview HTML (1 MiB cap). Pure helpers extracted to
  `helpers.js`; 17 unit tests cover preview rendering + `runCliCore`.
- **arXiv corpus fetcher** at `tools/corpus-fetcher/fetch_arxiv.py`:
  TOS-compliant 3-second rate limit, permissive-license filter, HTTPS,
  Python 3.12 `tarfile.extractall(filter="data")` for path-traversal
  defense, crash-safe `finally`-block report writes, pandoc preflight,
  PDF-instead-of-tarball early detection.
- **Streaming proposal** at `docs/proposals/streaming.md`: HTTP-Range
  + EOCD-prefetch strategy with three open questions resolved
  (eager-manifest + deferred-asset hashing with `mdz-asset-unverified`
  sentinel; cross-origin cache MUST NOT; streaming writes deferred to
  Phase 5+).
- **Delta-snapshots extension** at `spec/extensions/delta-snapshots-v1.md`:
  git-style packfiles for `history/snapshots/` with three open questions
  resolved (markdown-only, no binary delta in v1; `index.json` MUST be
  covered by `scope: full-archive` signatures; plain-text + outer DEFLATE).
- **Governance scaffolding** under `docs/governance/`: `CHARTER.md` (W3C
  Community Group draft with canonical CCLA URL), `RFC_PROCESS.md`
  (change-management workflow), `TRADEMARK.md` (nominative-fair-use
  policy), `RELEASE_ENGINEERING.md` (versioning + reproducible-build
  posture).
- **Bibliography spec** at `spec/directives/references-csl.md`: CSL-JSON
  v1.0.2 references format, `::cite[key]` directive, `::bibliography`
  block, BibTeX round-trip via pandoc.
- **Peer-review annotations spec** at
  `spec/directives/peer-review-annotations.md`: extends v2.0 Web
  Annotation layer with `role` (author/reviewer/editor/reader) + four
  review-specific motivations + attributable-vs-pseudonymous identity
  trade-off.
- **Author-facing docs**: `docs/for-authors/DOI.md` (Zenodo / OSF /
  Crossref / arXiv DOI workflows with versioned-DOI patterns and
  DataCite `relationType` PascalCase convention).
- **Decision docs**: `docs/decisions/content-addressing-evolution.md`
  resolves the three Phase 1.5 questions (defer by-hash byte-dedup to
  v3.0 option (c); reject multihash/CIDv1; loud `checksum` deprecation
  now).
- **CI** grew from 9 to 14 jobs: validate-rust-binding (cargo build +
  test, default + no-default), validate-pandoc-filter (smoke + golden-
  output), validate-vscode-extension (JSON + syntax + 17 unit tests),
  validate-corpus-fetcher (py_compile + import smoke), parity harness
  (Rust ↔ TS), Phase 2/3 viewer-sanitizer + accessibility tests,
  property-test corpus seeded from the 52 conformance fixtures.

### Added — Phase 4.6 review-debt resolution (2026-04-24)

A 5-agent review pass (code-reviewer, test-analyzer, comment-analyzer,
silent-failure-hunter, type-design-analyzer) on the Phase 4 + 5 work
surfaced ~40 items. This batch resolves them.

Security:

- VS Code extension: `exec()` → `execFile()` + argv array across all
  three CLI call sites. Paths with shell metacharacters can no longer
  be reinterpreted.
- Rust `Archive::open`: bounded reader replaces `file.size()`-trusting
  buffer. A forged ZIP central-directory `size=1` header can no longer
  bypass the 500 MiB ceiling. `debug_assert!` guards the u64→usize
  initial-allocation cast for wasm32 / 32-bit targets.
- Rust `verify_signature_chain`: rejects `signatures[0].prev_signature`
  (chain-root invariant per spec §16).
- Corpus fetcher: HTTPS endpoints, missing-license rejection, PDF-
  detection, `filter="data"` tarfile extraction (CVE-2007-4559 / PEP 706).

Type design:

- Structured `ArchiveError` + `IntegrityError` enums replace
  String-wrapped variants. Callers can `match` on cause, not substring.
- `License` untagged enum (`Spdx(String) | Structured`) replaces
  `Option<serde_json::Value>`.
- `Role` enum with `#[serde(try_from = "String")]` enforces spec §16.2
  custom-URI acceptance at parse time.
- `WARN_INFLATED_BYTES` constant exposed for caller-side `tracing`
  integration.

Tests:

- Rust: 13 integration tests (open / locale resolution / chain root +
  multi-entry valid + tampered + missing / checksum mismatch / blake3
  unsupported / locale strict-error / Role 5 closed variants + 5 custom
  forms + empty / FeatureDisabled on all 3 methods).
- VS Code: 17 node:test cases across `helpers.test.js` and
  `runCliCore.test.js` (escapeHtml, buildPreviewHtml truncation, theme
  XSS escape, argv-not-shell, in-flight dedupe, completion cleanup,
  err.code fallback).
- Python: `test_deprecation.py` pins the `compute_checksum` warning
  contract (fires on every call under `simplefilter("always")`;
  `compute_content_hash` is silent).
- Pandoc: 4 input fixtures + diff runner; `01-plain-paragraph.expected.md`
  pinned. Required-pin enforcement rejects future fixtures missing
  their pin. Runner distinguishes PANDOC-CRASH from empty-output.
- A11y fixtures expanded 5 → 23 across image-alt / heading-order /
  link-name / document-language with ok / fail / combined / edge cases.

Deprecations + spec polish:

- `checksum` → `content_hash` louder deprecation: spec §9.3.1 paragraph,
  `@deprecated` JSDoc on `MDXAssetEntry.checksum` with v3.0 removal
  target, `DeprecationWarning` from Python `compute_checksum` (uses
  stdlib `warnings.warn`; respects user filters — earlier once-flag
  implementation was wrong and was removed). New `compute_content_hash`
  is the silent v2 replacement.
- Spec title rename: "MDX Format Specification" → "MDZ Format
  Specification (Markdown Zipped Container)" (body usage clarified as
  synonymous; full body rename deferred to v2.1).
- v2.0 spec §9.3.1: full deprecation paragraph.
- streaming.md / delta-snapshots-v1.md: open-questions resolved.

Process:

- `ROADMAP.md` Phase 4.6 section enumerates all review findings with
  per-item status (done / deferred / external-blocked) and verification
  citations. 5 → 58 items marked `[x]` after honest tool-verified audit.

CI hygiene:

- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` env var resolves the
  Node 20 deprecation warning ahead of the 2026-09-16 runner cutover.
- vite `^5.4.19`, vitest `^2.1.9`, wrangler `^3.114.14` package.json
  bumps to address esbuild + undici + vite Dependabot alerts (5
  alerts; awaits committed lockfile for re-scan).

### Added — Phase 2.3b.5 (data layer): Multi-locale helpers (2026-04-24)

`editor-desktop/src/renderer/locales.ts` ships the data layer
behind multi-locale side-by-side editing. Two responsibilities:

**Manifest enumeration.** `enumerateLocales(manifest)` reads
`manifest.content.locales.available[]` in either form the spec
allows — string-form (`["en-US", "es-ES"]`) or object-form
(`[{ language, path }]`) — and produces `{ language, path,
primary }` records. The primary locale's path falls through to
`manifest.content.entry_point` (typically `document.md`); secondary
locales default to `document.<lang>.md`. When no `primary` is
tagged, the first entry wins for UI default but each locale keeps
its conventional path. Falls back to a single-entry list when
the locales block is absent.

**Add-locale planning.** `planAddLocale(manifest, language)`
returns the patched manifest (deep-cloned — no input mutation)
plus the new `document.<language>.md` path the caller should
write. Throws on duplicates. Creates the `locales` block if the
manifest didn't have one.

**Paragraph alignment.** `paragraphSlices(source)` slices markdown
into blank-line-separated paragraph spans with 1-based start lines,
byte lengths, and trimmed fingerprints (the future fuzzy matcher
will key on these). `alignParagraphs(left, right)` returns
index-paired alignments with null-padding for length mismatches.
MVP heuristic is positional alignment; fuzzy matching (Levenshtein
on fingerprints, for translations that insert / remove paragraphs)
is a follow-up.

19 vitest cases — five enumeration branches, four planAddLocale
edge cases, four paragraphSlices, and three alignParagraphs
scenarios.

UI (two stacked CodeMirror panes, sync-scroll handler, "Add
locale" command) deferred to Phase 2.3b.5.2 follow-up. Net
editor-desktop tests: 232 → 251.

### Added — Phase 2.3b.4 (data layer): Peer-review annotations (2026-04-24)

`editor-desktop/src/renderer/annotations.ts` ships the data side
of the peer-review annotation layer
(`spec/directives/peer-review-annotations.md`). Three layers:

**Parsing.** `parseAnnotation(raw, path)` validates against the
W3C Web Annotation Data Model + MDZ's spec extensions:

- `role` field (`author` | `reviewer` | `editor` | `reader`)
- 13 W3C `motivation` values + 4 MDZ extended values
  (`review-accept`, `review-reject`, `review-request-changes`,
  `review-confidential-comment`)
- Required-field enforcement (`type === "Annotation"`,
  `role`, `motivation`, `target`)
- Tolerant of either object-form `target` (selector into the
  manuscript) or string-form `target` (reply pointing at parent
  annotation id)

`loadAnnotations(entries)` walks an archive's entry map, parses
every `annotations/*.json`, and collects malformed-file errors
without throwing — a single bad annotation file doesn't sink the
load.

**Threading.** `buildThreads(annotations)` turns the flat list
into a reply tree by following `motivation: "replying"` +
`target: "annotations/parent.json"` pointers. Sorted by `created`
ascending at every level; annotations missing `created` sort
last; orphan replies (target id doesn't resolve) become roots so
they stay visible.

**Trust signals.** `findTrustWarnings(annotations,
signedCreatorIds)` enforces the spec's signature requirements:

- Unsigned editor decisions (`role: "editor"` +
  `motivation: "review-*"`) → `severity: "error"` (forgery risk;
  spec mandates the warning)
- Unsigned author + reviewer annotations →
  `severity: "warning"` (low trust)
- All clean when `creator.id` is in `signedCreatorIds`

Integrates with the Phase 3 signature chain when
`security/signatures.json` is present; falls back to "warn
everything" when signature data is absent.

23 vitest cases — every parse error branch, archive-walk
behavior, threading edge cases (orphans, undated, deep nesting),
and the four trust-signal classes. Net editor-desktop tests:
209 → 232.

UI sidebar (collapsible thread render, comment / reply / decision
flows) deferred to Phase 2.3b.4.2 follow-up.

### Added — Phase 2.3b.3 (algorithm): Block-level + line-level diff (2026-04-24)

`editor-desktop/src/renderer/block-diff.ts` ships the diff
algorithm that the Phase 2.3b.3 diff-pane UI will sit on. Three
exports:

- `tokenizeBlocks(source)` — splits markdown into atomic blocks:
  paragraphs, headings, fenced code blocks, container directives
  (`:::name…:::`), single-line directives (`::name`), lists,
  blockquotes, and horizontal rules. Each block has a stable
  identity `key` — heading depth + text for headings, directive
  name + `id=` for labeled directives, full text for everything
  else.
- `diffBlocks(left, right)` — LCS over block keys; emits an op
  stream of `equal`/`added`/`removed`/`modified`. The `modified`
  op fires when two blocks share an identity key but their bodies
  differ (e.g. a `::fig{id=overview}` whose body was rewritten),
  so the UI can render a per-block inner diff.
- `diffLines(leftText, rightText)` — plain LCS line diff for the
  inside of `modified` blocks.

The container-directive tokenizer found a real bug while writing
the tests: the `:::name` opener doesn't match the single-`::`
directive regex (the capture group requires a letter immediately
after `::`, but `:::name` starts with three colons), so the
tokenizer needed a separate `CONTAINER_OPEN_RE` pass that runs
before the leaf-directive check. Container nesting is tracked by
depth-counting `:::` opens vs. closes so inner directives don't
prematurely close the outer container.

UI integration (the actual diff pane that compares the open
buffer against `history/snapshots/`) is deferred to a Phase
2.3b.3.2 follow-up. The algorithm + 25 vitest cases + a stable
block-key scheme are shipped; the round-trip with the Phase 4.5
`delta-snapshots-v1` extension stays blocked on Phase 4.5
shipping (currently spec-only).

Net editor-desktop tests: 184 → 209.

### Added — Phase 2.3b.7.1–5: Non-core directive picker pack (2026-04-24)

Five new toolbar buttons round out the editor's directive support:
`::video`, `::audio`, `::model`, `::embed`, `::data`. All five
share one builder (`buildAssetPointer(kind, opts)`) and one
validator (`validateAssetPointer(kind, state, archiveEntries)`)
because the spec shape is identical: `::<kind>[src=<path>]{<attrs>}`.

Per-kind extension allow-lists prevent obvious misuses up front:

- `::video` accepts `.mp4`, `.webm`, `.mov`, `.m4v`
- `::audio` accepts `.mp3`, `.wav`, `.ogg`, `.oga`, `.m4a`, `.flac`
- `::model` accepts `.gltf`, `.glb`
- `::embed` accepts `.pdf`
- `::data` accepts `.csv`, `.tsv`, `.json`, `.jsonl`, `.geojson`

Pointing `::video` at a `.png` is rejected with a clear error that
lists the valid extensions.

The brace-attribute formatter (`formatBrace` in directive-insert.ts)
is shared across all kinds and quotes values containing whitespace
or quotes (`caption="Quarterly revenue"`) while letting safe tokens
pass through unquoted (`poster=assets/images/p.jpg`). Embedded
double quotes in attribute values are backslash-escaped.

Modal dispatch is centralised: `openAssetPointerPicker(host, kind,
entries)` reads a per-kind `KindSpec` (title, placeholder, extra
fields) so toolbar wiring stays uniform — adding a new asset-pointer
kind is one new entry in `KIND_SPECS` and one new toolbar button.

34 new vitest cases (11 builder + 23 validator including a 13-row
extension-matrix `it.each`). Net editor-desktop tests: 150 → 184.

Phase 2.3b.7 picker pack now complete; the editor surfaces every
asset-pointer directive in the v2.0 spec via dedicated UI.

### Added — Phase 2.3b.2: In-editor accessibility checker (2026-04-24)

The editor's status bar now shows a live WCAG 2.2 AA structural
scan of the open document; clicking the status text opens a panel
listing each violation with rule, WCAG reference, line number,
and human-readable message.

Implementation: `editor-desktop/src/renderer/accessibility-checker.ts`
is a pure TS port of the Python rule set at
`tests/accessibility/run_accessibility.py`. Both implementations
catch the same four rules:

- `image-alt` (WCAG 1.1.1) — `![](src)` with empty alt
- `heading-order` (WCAG 2.4.10) — h1 → h3 (skipped levels)
- `link-name` (WCAG 2.4.4) — vague link text
  ("click here", "here", "more", etc.)
- `document-language` (WCAG 3.1.1) — manifest.document.language
  unset

What this does NOT catch (requires a real browser): color
contrast, keyboard nav, focus visible, ARIA correctness. Phase 3.3
brings a Playwright + axe-core runner for those.

37 vitest cases — 14 individual rule tests plus 23 cross-impl
parity tests that drive the TS checker against every fixture in
`tests/accessibility/fixtures/` and assert the same
`expected_violations` set the Python runner produces. Lockstep with
the Python runner is now a CI invariant; either implementation
diverging will fail one of the parity tests.

The compliance-report export (WCAG sidecar JSON for journal
submission) is deferred until the Phase 3.3 fixture pack expands
from 23 → 50 fixtures.

Net editor-desktop tests: 113 → 150.

### Added — Phase 2.3a.5.1–4: Directive picker pack (2026-04-24)

The editor's header toolbar now has four picker buttons —
`::cell`, `::include`, `::fig`, `::cite` — each opening a modal
that collects the directive's parameters, validates them, and
splices a syntactically-valid directive at the cursor via
`EditorPane.insertDirective` (Phase 2.3a.5.0). Buttons are
disabled until an archive is open.

Architecture: a pure validation layer in
`editor-desktop/src/renderer/directive-pickers.ts` handles
form-state → InsertionPayload conversion (testable in vitest's
node env), and a thin DOM wrapper in `directive-modal.ts` provides
the `<dialog>`-based UI (browser-only). Validators enforce:

- **`::cell`**: non-empty language + kernel; non-negative integer
  execution count when provided.
- **`::include`**: target required, no leading slash, no `..`
  traversal; when archive entries are provided, target must exist
  in the archive.
- **`::fig` / `::eq` / `::tab`**: id matches
  `[A-Za-z][A-Za-z0-9_-]*` and isn't already used by another
  directive of the same kind. Cross-kind reuse is allowed (so
  `::fig{id=overview}` and `::eq{id=overview}` can coexist).
  `collectExistingIds` regex-scans the open document.
- **`::cite`**: ≥1 key; when `references.json` is present in the
  archive root and parseable as CSL-JSON, each key must match an
  item id (empty / malformed bibliography = permissive). Keys are
  deduplicated while preserving order.

32 vitest cases for the validation layer — every error branch and
the bibliography parser's three malformed-input fallbacks. All
113 editor-desktop tests pass (113 = 81 prior + 32 new).

The picker pack completes Phase 2.3a.5 and brings the editor MVP
to feature-complete except for code-signed installers (Phase
2.3a.6 — partly external dependencies).

### Added — Phase 2.3a.5.0: Directive insertion engine (2026-04-24)

Foundation layer for the picker pack (2.3a.5.1–4) and the Pro-tier
non-core pickers (2.3b.7). New module
`editor-desktop/src/renderer/directive-insert.ts` exports four pure
builders — `buildCell`, `buildInclude`, `buildFig`, `buildCite` —
each returning `{text, cursorOffset}` payloads ready to splice into
CodeMirror's document. The cursor offset addresses are computed via
a `CURSOR_SENTINEL`-and-strip pass, so the templates remain
readable strings rather than offset arithmetic.

`EditorPane.insertDirective(payload)` is the CodeMirror-side
wrapper: it dispatches a single `view.dispatch` change that
replaces the current selection (or splices at cursor when empty)
with `payload.text` and parks the caret at
`selection.from + payload.cursorOffset`. View focus is restored so
the user can keep typing without a mouse round-trip.

19 vitest cases cover every builder option permutation and
sentinel-handling edge case. Test-driven: the suite caught a real
bug — `buildCite({locator: {}})` was emitting `::cite[x]{}` (an
empty attribute brace) because the locator-presence check accepted
truthy empty objects. Fix: count populated locator parts before
emitting the brace.

Picker UIs in 2.3a.5.1–4 now have a tested foundation to build on;
each picker only has to translate modal-form state into one of the
four builder option objects.

### Added — Phase 2.3a.3: Asset sidebar (2026-04-24)

The editor's right rail now hosts an asset tree with drag-drop
intake, per-asset SHA-256 hashing, and on-save population of
`manifest.assets[<category>][]`.

- **`AssetStore` class** at `editor-desktop/src/renderer/asset-store.ts`
  — pure model with injectable `Hasher`. The renderer wires
  `webCryptoHasher` (SHA-256 via `crypto.subtle.digest`); tests
  inject a deterministic `bytes-length → hex` fake so the suite
  stays synchronous.
- **Path safety**: `add(filename, bytes)` strips path traversal
  (`../etc/passwd.png` → `passwd.png`) and Windows backslashes
  (`C:\foo\fig.png` → `fig.png`) before normalising to
  `assets/<category>/<basename>`. The store NEVER emits a path
  containing `..`.
- **Rename refuses silent clobber**: `rename(path, newBasename)`
  returns `null` if the target already exists rather than
  overwriting. Same-name rename is a no-op.
- **Manifest projection**: `manifestProjection()` groups entries
  by category and emits spec §9-shaped objects (`path`,
  `mime_type`, `size_bytes`, `content_hash`). Entries within each
  category are alphabetically sorted for stable manifest diffs
  across saves.
- **Round-trip**: `loadFromArchive(entries)` ingests an opened
  archive's `assets/...` paths, recomputes content hashes (the
  shipped manifest may have stale or absent hashes), and seeds
  the store so subsequent saves carry forward correctly.
- **HTML / CSS**: new `<aside id="asset-sidebar">` with drop-zone,
  per-asset list, delete button. Body grid changes to
  `1fr 220px` so the sidebar parks alongside the source/preview
  panes without competing for vertical space.
- **IPC adjustments**: `archive:save` now accepts `assets` as an
  array of `[path, Uint8Array]` tuples (Map → array conversion
  needed because IPC structured-clone does flatten Maps unevenly).
  Main-process handler restores to `Map` before calling
  `saveArchive`.

Tests at `test/asset-store.test.ts` (32 vitest cases): classify by
extension (case-insensitive), formatSize boundaries, add /
remove / rename happy paths + edge cases (path traversal, Windows
slashes, last-write-wins, missing source, target collision,
identical-name no-op), manifestProjection grouping + sort
stability + empty-category omission, toEntriesMap shape,
loadFromArchive imports `assets/...` paths only.

Total editor-desktop tests: **62** (11 archive-io + 12 editor-pane
+ 7 ipynb-import + 32 asset-store). All pass; tsc --noEmit -p
tsconfig.test.json clean.

### Added — Phase 2.3a.4: .ipynb import wiring (2026-04-24)

The editor's File menu gains "Import Jupyter notebook…", routing
through the existing `cli/src/commands/import-ipynb.js` converter
shipped in Phase 2.4.

- **Subprocess-isolated bridge** at `editor-desktop/src/main/ipynb-
  import.ts`. The CLI calls `process.exit()` on unhappy paths;
  loading it in-process would kill the editor. Bridge spawns it
  via `node:child_process` instead.
- **Injectable `IpynbRunner`** so unit tests can stand in a fake
  spawner and assert behavior without forking real Node
  processes. The suite stays under 100 ms; the production
  `defaultRunner` is the only path that touches `child_process`.
- **`runIpynbImport(ipynbPath)`** returns the produced `.mdz` path
  on success; throws with stderr surfaced on non-zero exit; throws
  with a clear "failed to spawn" message on ENOENT.
- **Renderer flow** (`importIpynbFlow` in `index.ts`): pick `.ipynb`
  → call `editorApi.importIpynb` → on success, immediately
  `openFromPath` the resulting `.mdz` so the user lands in an
  editable session without an extra click. Errors render in the
  title area (toast UI lands with the picker pack in 2.3a.5).
- **`EditorApi`** gains `pickIpynb()` + `importIpynb()` plus an
  `import-ipynb` menu event channel.

Tests at `test/ipynb-import.test.ts` (7 vitest cases): expected
output path computation; CLI path resolution from a compiled main
URL; success-path resolution; non-zero exit with stderr surfaced;
spawn-error rejection; argv passed verbatim to the runner.

`resolveCliPath` test uses `pathToFileURL(process.cwd() + …)`
instead of a hand-rolled `file:///repo/…` literal — the latter
throws on Windows because Node's WHATWG-URL parser requires
absolute paths to start with a drive letter.

Total editor-desktop tests: **30** (11 archive-io + 12 editor-pane
+ 7 ipynb-import). All pass; tsc --noEmit -p tsconfig.test.json
clean.

### Added — Phase 2.3a.2: Source editor + live preview (2026-04-24)

The editor shell from 2.3a.1 gains a real editing surface. CodeMirror
6 on the left, live `<mdz-viewer>`-style preview on the right,
mode-toggle for source-only / preview-only / split.

- **CodeMirror 6** integration via `@codemirror/{state,view,
  commands,language,lang-markdown}`. Markdown language pack
  highlights the prose; `::cell` / `::include` / etc. land as raw
  text for now (tree-sitter-mdz integration tracked as 2.3a.5
  follow-up alongside the picker pack's CodeMirror command API).
  History (undo/redo) + default keymap + Cmd/Ctrl+S save binding.
- **Preview pane** reuses `import { renderMarkdown } from
  "@mdz-format/viewer"`. The full directive + math + sanitize
  pipeline runs on every render, so what the editor previews is
  what the deployed viewer produces.
- **150 ms debounced render** via `makeDebouncer` (separately
  testable). `flush()` / `cancel()` semantics let `setContent`
  bypass the debounce when a programmatic update fires; `Save`
  / `Open` callouts cancel pending renders so old previews don't
  clobber freshly-loaded content.
- **Mode toggle** (`source` / `preview` / `split`) writes a
  `.mode-*` class to the pane host. CSS `grid-template-columns`
  drives the layout — no JS show/hide gymnastics, no scroll
  thrash. Active mode reflected on the toolbar via
  `aria-pressed`.
- **Save flow**: Cmd/Ctrl+S OR menu OR toolbar button calls the
  IPC bridge with the manifest + new content. Modified-indicator
  (●) clears on successful save. Save errors surface in the
  title area (full toast UI lands when the picker pack does in
  2.3a.5).
- **Pure helpers extracted** to `editor-pane-helpers.ts` so
  `makeDebouncer` / `applyModeClass` / `modeClassName` can be
  unit-tested in vitest's Node env without dragging in
  `<mdz-viewer>` (which extends `HTMLElement` at module load
  and breaks Node-only tests).

Tests at `test/editor-pane.test.ts`: 12 vitest cases. Cover
debounce schedule + flush + cancel + last-call-wins coalescing,
mode-class idempotency + multi-stale-class cleanup, mode-name
mapping. Total editor-desktop tests: **23** (11 archive-io + 12
editor-pane). All pass; tsc --noEmit -p tsconfig.test.json
clean.

CodeMirror's measurement layer needs a real browser DOM, so the
keystroke-to-preview latency timing + scroll-position pinning are
Phase 2.3a.6 Playwright coverage. The 23 vitest cases pin every
piece of logic that doesn't need a browser.

### Added — Phase 2.3a.1: Editor shell foundation (2026-04-24)

The desktop editor's Electron skeleton ships at `editor-desktop/`,
unblocking the rest of Phase 2.3a (source editor, asset sidebar,
ipynb import, picker pack, release engineering).

- **Pure archive-io layer** at `src/main/archive-io.ts` — `openArchive`
  + `saveArchive` accept an injected `FsLike` adapter so the open /
  save contract is unit-testable against an in-memory fake without
  spawning Electron's chrome. Production wires `node:fs/promises`;
  tests wire `MemoryFs`.
- **Electron main process** at `src/main/main.ts`. Sandboxed renderer
  (`sandbox: true`, `contextIsolation: true`, `nodeIntegration:
  false`); IPC handlers for `archive:open` / `archive:save` /
  `dialog:openFile` / `dialog:saveFile`; application menu (File →
  Open / Save / Save As / Quit) with accelerators; `electron-
  updater` wired with a no-op stub feed.
- **Preload bridge** at `src/preload/preload.ts` — minimal
  `contextBridge` surface (`window.editorApi`) auditing each method
  the renderer can call into main. New methods require a security
  review.
- **Renderer** at `src/renderer/{index.html,index.ts}` — minimal
  "open MDZ, show title + content" UI with a strict CSP
  (`default-src 'self'; script-src 'self'`; no remote scripts). The
  CodeMirror source pane + `<mdz-viewer>` preview replace the
  current `<pre>` in 2.3a.2.
- **Build pipeline**:
  - `tsconfig.main.json` compiles main + preload to CommonJS
    (Electron's main-process loader expects it).
  - `tsconfig.test.json` excludes Electron-dependent files so CI can
    type-check the testable core without installing Electron.
  - `vite.config.ts` for the renderer dev server (port 5173) +
    production bundle.
  - `vitest.config.ts` separately because vite's root is the
    renderer subdir but tests need the package root.
- **Optional Electron deps**: `electron` + `electron-updater` are in
  `optionalDependencies` so CI skips ~200 MB of platform binaries.
  Local devs run `npm install --include=optional`. Phase 2.3a.6
  release-engineering will wire a separate workflow that DOES
  install them.

Tests at `test/archive-io.test.ts`: 11 vitest cases. Cover the
happy path, missing file, non-ZIP bytes, missing manifest, invalid
JSON, missing entry_point, custom entry_point honoring, save +
round-trip, asset path collision refusal, and spec §10.2 manifest-
first ZIP ordering. CI: new `validate-editor-desktop` job runs
type-check + tests. Job count: 15 → 16.

### Added — Phase 2.1 viewer: IndexedDB archive cache (2026-04-24)

`<mdz-viewer>` now caches loaded archives by URL so a return visit
or a re-render skips the fetch + ZIP-inflate path entirely. Closes
the "Offline-first: uses IndexedDB for archive caching" Phase 2.1
deliverable.

- **Two backends** in `packages/mdz-viewer/src/archive-cache.ts`:
  `IndexedDBArchiveCache` for browsers, `InMemoryArchiveCache` for
  Cloudflare Workers / Node test runs / explicit-opt-out callers.
  Same `ArchiveCache` interface; the auto-selector
  `defaultArchiveCache()` picks based on whether
  `typeof indexedDB !== "undefined"`.
- **URL-keyed storage** — for hash-pinned archives served by the
  Phase 2.2 hosted Worker (`?content_hash=…`), the URL is already a
  synonym for the bytes. For unpinned URLs a 1-hour default TTL
  keeps the cache correct against author updates; pass `Infinity`
  to disable expiration entirely.
- **Quota / IndexedDB failures degrade silently** — caching is a
  perf optimization, not a correctness requirement. A `put()` that
  hits the browser's per-origin quota silently drops; the next
  `get()` returns `null` and the load goes through fetch normally.
- **`loadArchive(url, { cache })`** is the integration point.
  Default behavior auto-selects; pass an explicit
  `InMemoryArchiveCache()` to opt into in-process caching only;
  pass `cache: null` to opt out entirely; pass a shared instance to
  share cache state across multiple viewers on the same page.

Tests: 10 new vitest cases at `archive-cache.test.ts`. Cover put +
get round-trip, miss on absent key, TTL expiration, delete + clear,
`Infinity` TTL disabling expiration, environment auto-selection
(Node falls back to InMemory), and a real fetch-stub integration
test that proves second `loadArchive(url)` skips the network. Total
viewer tests now: **117** (38 sanitizer + 46 directives + 13 math +
10 references + 10 cache). All pass; tsc --noEmit clean.

### Added — Phase 2.1 viewer: `::include` archive-aware resolution (2026-04-24)

`::include[target=path]` directives now resolve against the open
archive's entries map, completing the directive set required for
realistic scientific-paper rendering.

- **Archive-internal targets** (no `://` in the path) inline the
  entry's bytes as UTF-8 markdown. The inlined content participates
  in the rest of the directive pipeline — `::fig` ids declared in an
  included file are visible to `::ref` resolutions in the outer
  document, citations from included sections appear in the outer
  bibliography.
- **Recursive resolution** with a `Set<string>` cycle detector: an
  include chain `a.md → b.md → a.md` surfaces a visible
  `mdz-include-missing` marker naming the cycle path
  (`a.md → b.md → a.md`), never infinite recursion.
- **Depth cap** of `MAX_INCLUDE_DEPTH = 10`. Beyond that, a
  visible depth-exceeded marker.
- **External (URL) includes** REQUIRE `content_hash` per spec §12 —
  unhashed external includes refused outright. With a hash, the
  viewer emits an `mdz-include-pending` placeholder (the synchronous
  render path can't fetch over the network; a future async-include
  hydration layer can attach to the placeholder).
- **Missing targets** render as visible
  `[?include: target.md — not found in archive]` markers per the
  spec's "visible miss is better than silent" rule.
- **`fragment` attribute** is parsed but NOT honored in v0.1; the
  viewer adds an `mdz-include-fragment-unsupported` class so a
  fragment-aware future viewer can detect the regression.

Pipeline placement: include resolution is now Stage 0 of
`processDirectives` (before cells / outputs / labels / cites /
bibliography). Re-runs `collect()` on the post-include text so
labels and citations from transcluded files participate in numbering.

Wiring: `RenderOptions.archiveEntries` is the new threading point;
`mdz-viewer.ts` passes the loaded archive's `entries` map through.
Callers without a real archive (test harnesses, build-time
prerenderers) can pass an empty `Map`; includes degrade to visible-
miss markers.

Tests: 11 new directive cases (46 total in the suite). Cover
internal happy path + nested recursion + cycle detection +
depth-cap + missing target + missing target attribute + external
without hash + external with hash placeholder + fragment unsupported
flag + cross-doc id resolution (included `::fig` participates in
outer `::ref`) + end-to-end through marked + sanitizer. Total
viewer tests now: **107** (38 sanitizer + 46 directives + 13 math +
10 references). All pass; tsc --noEmit clean.

### Added — Phase 2.1 viewer: `::cell` + `::output` rendering (2026-04-24)

`<mdz-viewer>` now renders code cells and their outputs as
sanitizer-safe HTML islands. Realizes the cell-display surface real
papers need; static rendering only — actual cell execution
(re-running source via Pyodide) is Phase 2.3b.1.

- **`::cell{language=… kernel=… execution_count=N}`** + fenced
  source pair compiles to
  `<div class="mdz-cell mdz-cell-lang-X mdz-cell-kernel-Y
  mdz-cell-exec-N"><pre><code class="language-X">…</code></pre>
  </div>`. Class-token metadata (no `data-*` — the sanitizer
  doesn't allow them) so downstream CSS / future cell-execution
  hooks can read the cell's identity. Source is HTML-escaped; an
  injection like `<script>alert(1)</script>` inside cell source
  surfaces as visible text.
- **Falls back to fenced-block lang** when the directive omits
  `language=` (covers archives where authors lean on the fence
  syntax for hint).
- **ARIA description** synthesized from language / kernel /
  exec-count so a screen reader announces "python cell, kernel
  python3, execution count 1" rather than just "code block".
- **Quoted-id charset enforcement** — same strict rule applied to
  `::fig` extends to `::cell{id="…"}` (a malformed quoted id is
  silently dropped from output rather than emitted as
  `<div id="bad space">`).
- **`::output{type=…}`** + fenced body renders as
  `<div class="mdz-output mdz-output-text">` (or whatever `type`
  is), MIME tag carried as `mdz-output-mime-…` class. Image-form
  `::output{type=image src=… alt=…}` (standalone line, no fence)
  emits `<img>` with the src forwarded to the sanitizer's
  `resolveAsset` rewriter.
- **Empty image marker** — `::output{type=image}` with no `src`
  surfaces as a visible `mdz-output-empty` placeholder rather than
  a broken-image icon.

Pipeline placement: the new multi-line block-substitution stage
runs BEFORE the existing line-by-line directive walk inside
`processDirectives`. Multi-line patterns (`::cell{}\n\n```X\n…\n```\n`)
have to consume multiple lines as a unit; the line walker can't
see them otherwise. Image-form `::output` is matched as a single
whole-line pattern.

Tests: 11 new directive tests (35 total in the suite). Coverage
includes structural HTML shape, escape behavior (`<script>` in cell
source comes through as `&lt;script&gt;`), ARIA labels, id
preservation + charset enforcement, language fallback, image
output happy path + empty case, regression guard that prose
followed by a fenced block does NOT get consumed as a phantom
cell. Total viewer tests now: **96** (38 sanitizer + 35 directives
+ 13 math + 10 references). All pass; tsc --noEmit clean.

### Changed — ROADMAP: Phase 2.3 editor work chunked into session-sized sub-phases (2026-04-24)

The original Phase 2.3a (Desktop editor MVP, 4–6 months) and Phase
2.3b (Editor Pro features, 6–12 months) were each one bullet list of
6–7 items. Each item was itself a multi-week build. The result: any
attempt to "make progress on 2.3a" was open-ended and difficult to
sequence.

The work hasn't changed; the structure has. Phase 2.3a is now six
numbered sub-phases (2.3a.1 through 2.3a.6) with explicit
dependencies and acceptance tests, each scoped for one or two focused
sessions. Phase 2.3b is seven independent sub-phases (2.3b.1 through
2.3b.7), sequenceable by user demand rather than checklist order.
The 2.3a.5 picker pack and 2.3b.7 non-core picker pack each split
internally into per-directive chunks (one picker = one session).

The aggregate timing estimates (4–6 months for MVP, 6–12 for Pro)
are unchanged. The chunking model lets work happen incrementally
rather than as one monolithic build.

ROADMAP also gained a **status snapshot table** at the top of Phase
2 listing each sub-phase's state (shipped / code-ready / chunked-
not-started / partial), what landed, and what's pending — so a
reader can see Phase 2's current posture at a glance instead of
walking the entire section. The table reflects the work shipped
this cycle:

- **2.1 viewer** — 85/85 tests pass; cross-refs + citations +
  bibliography + KaTeX math all live in `packages/mdz-viewer/src/`.
- **2.2 hosted** — code-ready and test-covered (32 worker tests);
  deployment to view.mdz-format.org is the only blocker.
- **2.4 EPUB bridge** — fully shipped, both directions, with a
  fidelity matrix doc and round-trip CI gate.
- **2.5 browser extension** — hardened (13 manifest tests + AMO
  reproducible-build doc); pending real icons + AMO submission.
- **2.3a / 2.3b** — chunked, ready to pick up one chunk at a time.

### Added — Phase 2.2 hosted service polish (2026-04-24)

The Cloudflare Worker fronting `view.mdz-format.org` (code at
`packages/mdz-viewer-hosted/src/worker.ts`) gains:

- **Content-hash cache pinning**: `cacheControlFor(url)` returns
  `max-age=31536000, immutable` when the request URL carries
  `?content_hash=…` (the URL itself encodes the bytes; the response
  cannot go stale). Without the param, falls back to
  `max-age=300, stale-while-revalidate=86400`. Cuts CDN cost for
  papers that pin their content_hash in citation URLs.
- **OG / Twitter card meta** on every page: `og:type`, `og:title`,
  `og:description`, `og:site_name`, `og:url`, `twitter:card`,
  `twitter:title`, `twitter:description`. Description varies for
  landing vs archive-rendering pages. A paste into Slack / Twitter
  / LinkedIn now produces a useful preview snippet.
- **Sanitized canonical URLs** — `og:url` and `<link rel="canonical">`
  use a sanitized canonical that drops refused-input query params,
  so a malicious `?url=javascript:…` link never echoes into
  search-engine indexes or social preview snapshots.
- **`Vary: Accept` header** on every HTML response so a future JSON
  variant of the same URL doesn't share a cache slot with the HTML.
- **Test coverage** — `packages/mdz-viewer-hosted/src/worker.test.ts`
  with 32 vitest cases. Targets the Worker's `fetch` handler
  directly via `globalThis.Request` / `Response` (no Miniflare
  needed). Covers: helper functions (isSafeUrl, escapeHtml,
  cacheControlFor), HTTP routing (/, /embed.html, /robots.txt,
  /healthz, 404), method handling (OPTIONS preflight, POST
  rejection), security headers (CSP, COOP, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy, Vary), URL safety
  (javascript:/data:/file:/vbscript:/about: + control chars
  rejected), cache headers (short TTL vs immutable), OG meta tag
  presence + escape behavior.
- **CI**: `Phase 2/3 Tests` job runs the new vitest suite under the
  hosted-worker package alongside the existing typecheck.

Deployment to `view.mdz-format.org` itself is an external action
(`wrangler deploy` + DNS); the code is production-ready and
test-covered, just not yet live.

### Added — Phase 2.5 browser-extension hardening (2026-04-24)

The browser extension's manifest + scripts now have CI validation
covering everything that can be verified without a real browser
runtime.

- `browser-extension/test/manifest.test.js` — 13 node:test cases:
  MV3 structure (manifest_version, version SemVer shape,
  service_worker as ES module, gecko id format), permissions
  hygiene (no scripting/cookies/webNavigation/tabs/history/
  bookmarks creep without an explicit threat-model update;
  host_permissions stays at `<all_urls>`), CSP (no `unsafe-eval`,
  no `wasm-unsafe-eval`, script-src `'self'` only, object-src
  `'none'`), every referenced file exists on disk, every JS file
  passes `node --check`, popup.html references resolve.
- `browser-extension/icons/` — 1×1 transparent PNG placeholders
  for the manifest-required 16/48/128 sizes, with a README that
  spells out "replace before AMO submission".
- `browser-extension/REPRODUCIBLE_BUILD.md` — Mozilla AMO–facing
  reproducible-build instructions for both the current pre-bundle
  state (plain zip) and the future bundled state (Node version
  pin + lockfile + nvmrc + sha256 verification).
- `.github/workflows/ci.yml` — new `validate-browser-extension`
  job. CI count grew 14 → 15.

The full Firefox AMO submission flow needs (a) real icons and
(b) a bundled `<mdz-viewer>` integration; both are tracked in
ROADMAP §2.5.

### Added — Phase 2.1 viewer: KaTeX math rendering (2026-04-24)

LaTeX math now renders in `<mdz-viewer>` via a KaTeX pre-marked
transform.

- **Inline `$...$` and display `$$...$$`** detected with regex; the
  display pattern matches first to prevent greedy-matching `$$` as
  two adjacent inline spans. Standalone `$` characters (currency,
  prose) are left untouched — the inline pattern requires content
  between two `$` on the same line.
- **KaTeX HTML output mode** (NOT MathML). The output is a tree of
  `<span>` elements with KaTeX class names; every tag is already in
  the sanitizer's `ALLOWED_TAGS`. MathML mode would require
  unwinding the sanitizer's `DROP_CONTENTS_TAGS` posture for
  `<math>`, a separate threat-model exercise.
- **ARIA labels** preserve the original TeX source on each math
  wrapper so screen readers (and any host page that hasn't loaded
  KaTeX's CSS) get a meaningful announcement.
- **Failure mode**: `throwOnError: false` plus a belt-and-suspenders
  outer try/catch turns malformed TeX into a visible
  `[?math: <source>]` marker rather than dropping the math
  silently. KaTeX's own error span is kept so authors see the
  parser's diagnostic too.
- **Pipeline placement**: directives → math → marked → sanitize.
  Math runs after directives so directive-emitted ARIA labels
  don't trip the math regex; before marked so KaTeX's HTML
  islands pass through to `marked.parse` unchanged.
- **Bundle cost**: KaTeX is ~75 KB gzipped — added as a top-level
  dep in `packages/mdz-viewer/package.json`. The fast-path
  `if (!md.includes("$")) return md;` skips the regex scan for
  documents with no math at all.
- **CSS responsibility**: host pages MUST `<link>` KaTeX's
  stylesheet (`katex.min.css`) for proper symbol-font rendering.
  Equations remain readable as fallback text without the CSS.

Tests (`packages/mdz-viewer/src/math.test.ts`): 13 vitest cases
covering fast-path, inline + display rendering, ARIA labels,
greedy-match prevention, empty-marker output, malformed-TeX
fallback, lone-`$` non-matching, multi-span lines, sanitizer
compatibility (only `<span>` and `<div>` survive), end-to-end via
`renderMarkdown`, XSS resistance against `\href{javascript:…}`,
co-existence with `::eq`/`::ref` directives.

Total viewer tests now: **85** (38 sanitizer + 24 directives + 10
references + 13 math). All pass; `tsc --noEmit` clean.

### Added — Phase 2.4 EPUB bridge: reverse direction (2026-04-24)

`mdz import-epub` ships at `cli/src/commands/import-epub.js`,
completing the round-trip with the v0 export side. Best-effort
ingest from EPUB 3.x packages authored elsewhere (Calibre / pandoc /
Sigil / iBooks Author / journal pipelines):

- **OPF parsing** with three real-world hardenings caught in review:
  comment stripping (a `<!-- <item id="x"/> -->` would have been
  parsed as a real manifest entry), CDATA unwrap (so `<dc:title>
  <![CDATA[A & B]]></dc:title>` yields `A & B`, not the literal
  CDATA wrapper), and multi-language title selection (picks the
  `<dc:title xml:lang="X">` whose lang matches `<dc:language>`,
  falling back to first).
- **Namespace-prefix tolerance**: `<opf:item>` / `<opf:href>` and
  default-namespace `<item>` parse identically.
- **Mixed-case attributes**: `Media-Type`, `ID`, `Href` resolve
  consistently (XML allows them).
- **Spine walk in reading order**, joined into a single
  `document.md` with HTML-comment chapter breaks
  (`<!-- mdz:chapter-break -->`). Comments survive subsequent
  re-export through marked → XHTML cleanly, so cycle stability is
  preserved (the prior `---` HR separator accumulated `<hr/>` on
  each round-trip).
- **Image dedup by destination path** — a real `Map<destPath, …>`,
  not the broken `Set<{...}>` (object-reference identity) flagged
  in review. Same-bytes duplicates skip silently; basename
  collisions (two distinct hrefs sharing a basename) disambiguate
  by prefixing the EPUB-side directory into the MDZ filename so
  neither is lost.
- **Path rewriting** with trailing-boundary lookahead so
  `Images/foo.png` rewrites cleanly without false-matching
  `Images/foo.png.bak`.
- **DRM detection** — `META-INF/encryption.xml` triggers exit 3
  with a user-facing message. MDZ is open by design; importing
  encrypted EPUBs is refused, not silently stripped.
- **Manifest synthesis** preserves DataCite-conformant identifiers,
  language, license (prefers explicit `<dc:license>` over
  `<dc:rights>`), keywords, EPUB Accessibility 1.1 features.
  Non-UUID `<dc:identifier>` (DOI / ISBN / opaque) mints a fresh
  UUID. `custom.import_source` records provenance
  (`{kind: "epub", epub_version, imported_at, tool}`).

Documentation:

- `docs/format-internals/epub-mdz-fidelity.md` — full fidelity
  matrix with per-direction tables. Documents what survives
  cleanly, what's converted approximately, what's dropped, and
  what stacks across MDZ → EPUB → MDZ vs EPUB → MDZ → EPUB cycles.

Tests (15 node:test cases at `cli/test/import-epub.test.js`):

- OPF parsing helpers: rootfile extraction, metadata + manifest +
  spine, entity-encoded titles, CDATA unwrap, language-matching
  title, comment stripping.
- Manifest synthesis: shape, license preference, UUID
  normalization (urn:uuid: stripping + DOI/ISBN/opaque fallback).
- XML escape contract.
- Synthesized in-process round-trip (mdz → epub → mdz)
  preserving title / language / authors / keywords / license /
  body text. 120s timeout for Windows-runner safety.
- DRM refusal exits 3.

CI: `validate-cli` job runs the new test file; `cli/package.json`
adds `turndown ^7.2.0`.

### Added — Phase 2.1 viewer: cross-references + citations + bibliography (2026-04-24)

The `<mdz-viewer>` web component now renders the v2.1 directives
required for real scientific papers:

- **Labeled blocks** — `::fig{id=…}`, `::eq{id=…}`, `::tab{id=…}` open
  a `<figure>` / `<div role="math">` / `<figure class="mdz-tab">`
  wrapper with `<figcaption>` carrying an auto-assigned label
  ("Figure 1", "Equation 1", "Table 1"). Numbering is per-kind; ids
  must satisfy the strict ABNF charset (`[A-Za-z][A-Za-z0-9_-]*`)
  in both quoted and bare forms (the in-process review caught a
  quoted-id charset bypass — fixed before merge).
- **Cross-references** — `::ref[id]` resolves to a link with the
  target's label as text. Missing ids render as a visible
  `[?id]` marker with `class="mdz-ref-missing"` (spec-compliant
  "visible miss" per `spec/directives/references-csl.md`).
- **Inline citations** — `::cite[key]` renders the
  chicago-author-date inline form: `(Smith 2020)` /
  `(Smith & Jones 2021)` / `(Smith et al. 2022)`. Multi-key cites
  `::cite[a,b]` group with semicolons inside a single bracket pair.
  Anonymous works (no `author` field) fall back to title-leading.
- **Bibliography** — `::bibliography` block emits an ordered list of
  cited references in citation order. Uncited entries are omitted
  (pandoc-citeproc default). Empty-marker fallback when no `::cite`
  appears in the document.
- **References format** — archives MAY ship `references.json` at
  archive root. The viewer's parser accepts both the canonical
  CSL-JSON array form AND the id-keyed object form (Zotero exporter
  convention). Malformed JSON / unsupported root types degrade to
  empty + a console warn; citations render as visible misses.
- **Citation style** — declared at `manifest.content.citation_style`
  (now typed in `manifest-types.ts`). Currently only
  `chicago-author-date` is implemented in-process; unknown styles
  fall back with a console warn. Authors who need a specific journal
  style should pre-render with pandoc-citeproc and embed the
  rendered HTML.
- **CSL date handling** — `issuedYear` accepts numeric AND string
  year forms (CSL-JSON typing says number, real-world feeds ship
  strings) and pre-1500 / BCE years for classics-era citations.
- **Sanitizer interaction** — directives.ts emits HTML using only
  tags + attributes already in the sanitizer allowlist (`figure`,
  `figcaption`, `cite`, `a`, `section`, `ol`, `li`, `div role=math`
  + global `id` / `class` / `aria-*`). Every interpolation goes
  through a shared `escapeHtml` (factored from two earlier copies).
  No `data-*` attributes (would require sanitizer + threat-model
  expansion). XSS-via-citation-key test asserts no live `<script>`
  or attribute-position event handlers can survive.
- **Tests** — 72 vitest cases pass: 38 sanitizer (existing), 24
  directives (new), 10 references (new). Covers labeled-block
  numbering, cross-ref resolution + miss, single / multi-author /
  multi-key citations, anonymous works, bibliography ordering,
  empty bibliography, end-to-end through marked + sanitizer,
  XSS injection via cite path, parseReferences both formats and
  malformed inputs, issuedYear edge cases.

### Added — Phase 2 enablers (2026-04-24)

- **`mdz validate --profile <id-or-path>`** enforces conformance against
  a profile (`mdz-core`, `mdz-advanced`, `scientific-paper-v1`,
  `api-reference-v1`, or a path to a profile JSON). Required manifest
  fields surface as ERROR; recommended fields as WARNING; required
  extensions checked against `content.extensions[]`. New
  `spec/profiles/mdz-core-v1.json` ships the genuine Core baseline
  (Core is a strict subset of Advanced; aliasing them was an in-process
  review catch).
- **Property-test corpus seeding**: `tests/property/test_parser_properties.py`
  loads every fixture under `tests/conformance/{positive,edge,roundtrip}/`
  at import and feeds them via hypothesis `@example` to
  `test_parser_never_crashes_on_random_input`. Hypothesis starts from
  known-valid inputs and mutates outward.
- **Signature-trust documentation** at `docs/security/SIGNATURE_TRUST.md`:
  DID resolution chain (did:web / did:key / trust file / certificate
  fallback), trust policies (default / strict / offline), revocation per
  DID method, key-rotation patterns (forward chain / historical
  verification / co-signed rotation), what conformant viewers MUST
  surface to users.

### Hardened — v2.0 implementations (from PR review, 2026-04-24)

Parser (`alignment_parser.py`) now fails loud instead of silent on:

- Unterminated fenced code blocks (was: silently absorb to EOF)
- Empty `::cell` source, empty `::include` target, empty `::output` body
- Missing `type=` on `::output` (was: default to "text")
- Non-integer `execution_count` (was: silent string coercion)

TypeScript type design:

- `SignerRole` is now `BuiltInSignerRole | CustomSignerRole` (branded) — drops
  the `| string` escape hatch that erased the union.
- `VersionEntry.parent_versions?: string[]` added for §15.4 fork/merge DAG.
- `cleanObject<T>` now uses `PlainObject<T>` conditional + runtime guard to
  exclude arrays/Maps/Sets/Dates.
- `MDZManifest.validate()` enforces invariants JSON Schema can't express:
  `locales.default` must be in `available[].tag`, no duplicate tags,
  `signature` XOR `signatures[]`, `prev_signature` required on chain
  entries 1+.
- `addSignature()` refuses chain-breaking insertions at call time.

Tests (+40 new):

- 6 parser error-path tests, 17 schema negative-rejection tests,
  v1.1→v2.0 loader compat tests, full v2.0 JSON roundtrip tests, v2.0
  MDZDocument integration tests through JSZip save+open.

CI:

- Removed `|| echo "completed with warnings"` — schema validation failures
  now break CI instead of being swallowed.
- Added Python setup to `validate-json-schema` job to run
  `test_schema_negatives.py`.

CLI:

- `info.js` top-level catch now prints stack trace to stderr (was: swallowed
  root cause).

Comprehensive example now exercises previously-partial v2.0 features:

- `document.content_id` (content-addressed identifier)
- Second signature with `prev_signature` (chain demo)
- Per-asset `locales[]` alternatives for es-ES and ja-JP alt-text

### Added — v2.0.0 Draft

<!-- markdownlint-disable MD013 -->
MDX Format Specification v2.0.0 Draft at
`spec/MDX_FORMAT_SPECIFICATION_v2.0.md`, with matching JSON Schema at
`spec/manifest-v2.schema.json`. Fully backward-compatible with v1.1 —
all v1.1 manifests (with `mdx_version` updated to `2.0.0`) validate
as minimal v2.0 documents.

Ten capability additions:

1. **Internationalization** (§8) — `content.locales` multi-locale bundle
   with per-asset locale alternatives and deterministic fallback
   resolution.
2. **Content-addressed storage** (§9) — optional
   `assets/by-hash/<algo>/<digest>` layout, `content_hash` on every
   asset (supersedes `checksum`), `document.content_id` for verifiable
   content identity.
3. **Streaming-friendly archive ordering** (§10) — normative ZIP
   local-header order: manifest → entry points → styles → data →
   media by size. Enables progressive fetch over byte-range HTTP.
4. **Computational cells** (§11) — `::cell` directive with cached
   `::output` blocks, `interactivity.kernels[]` declaring kernel specs
   (Jupyter-compatible), capability Level 5 "Notebook" for execution.
5. **Transclusion** (§12) — `::include` directive for archive-internal
   and cross-document content composition, `content.includes[]`
   declarations, hash-pinned external includes, circular-reference
   detection.
6. **Document profiles** (§13) — `document.profile` URI pointing to
   structural requirements (required sections, required manifest
   fields, validation rules); two reference profiles:
   `scientific-paper/v1`, `api-reference/v1`.
7. **Rich accessibility model** (§14) — `document.accessibility`
   top-level with features/hazards/reading-level/API-compliance
   claims; per-asset `accessibility` with long descriptions, audio
   description tracks, sign-language tracks, MathML fallbacks,
   sonification, tactile alternatives.
8. **Provenance and fork graph** (§15) — `document.derived_from[]` for
   source chains, multi-parent versions via `parent_versions[]`,
   optional `history/graph.json` DAG for fork/merge history.
9. **Multi-signature + DID identity** (§16) — `security.signatures[]`
   array with roles (author/reviewer/publisher/notary), W3C DID-based
   signer identity, signature chains via `prev_signature`, JCS
   canonicalization.
10. **Responsive asset variants + content negotiation** (§17) —
    per-asset `variants[]` for resolution/format/media-condition
    alternatives, `content.variants[]` for document-level audience
    variants (short/long, technical/layperson).

Viewer capability levels extended to Level 5 (Notebook). Conformance
updated to require multi-locale support at Level ≥ 0 and
accessibility surfacing at Level ≥ 3.
<!-- markdownlint-enable MD013 -->

### Deprecated (retained for backward compat)

- Asset `checksum` — use `content_hash`.
- `security.signature` (singular) — use `security.signatures[]` (array).
- Version history `parent_version` (singular) — use `parent_versions[]` (array).

### Breaking changes

**None.** v2.0 is intentionally backward-compatible. A valid v1.1 manifest with `mdx_version` bumped to `2.0.0` is a valid v2.0 manifest.

### Previous — v1.1.0 Draft

- MDX Format Specification v1.1.0 Draft (`spec/MDX_FORMAT_SPECIFICATION_v1.1.md`)
  - Text alignment and block attribute system (Section 4.4)
  - Shorthand alignment notation (`{:.center}`, `{:.right}`, etc.)
  - Directive block container syntax (`:::`)
  - Attribute precedence rules (inline > block > container)
  - Alignment integration with existing directives
  - New capability Level 4 "Advanced" for alignment support
  - Inline styles security considerations (Section 7.5)

- v1.1 Example documents
  - `examples/alignment-basic.mdx` - Basic alignment demonstrations
  - `examples/alignment-directives.mdx` - Alignment with media directives
  - `examples/alignment-complex.mdx` - Nested containers and precedence
  - `examples/technical-doc.mdx` - Real-world technical documentation

- Alignment conformance test suite (`tests/alignment/`)
  - 10 test files covering all alignment scenarios
  - Tests for basic alignment, headings, lists, blockquotes
  - Tests for directive integration and container blocks
  - Tests for attribute precedence and conflict resolution
  - Tests for malformed syntax and backward compatibility

- JSON Schema v1.1 updates (`spec/manifest.schema.json`)
  - Added `attributes` and `alignment` to extensions enum
  - Added `alignment_classes` to styles configuration
  - Added `attributes` section to rendering configuration

- Python script to generate v1.1 examples (`implementations/python/create_v11_examples.py`)

- JSON Schema for manifest validation (`spec/manifest.schema.json`)
  - Full schema for all manifest fields and asset types
  - Category-specific asset metadata validation
  - Schema ID: `https://mdx-format.org/schemas/manifest.schema.json`

- CLI `validate` command for document validation
  - Validates ZIP structure and required files
  - Checks manifest schema compliance
  - Verifies asset inventory and checksums
  - Detects common issues (orphaned assets, path issues, etc.)
  - Returns exit code 1 on failure (CI/CD friendly)

- Command-line interface (CLI) tool
  - `view` command - Open MDX documents in browser with full rendering
  - `extract` command - Extract archive contents to folder
  - `info` command - Display document metadata, assets, and content
  - `edit` command - Interactive terminal editor for metadata and content
  - `create` command - Create new documents from templates (blank, article, report, presentation)
  - `validate` command - Validate document structure and manifest
  - Cross-platform executable builds via pkg

- CI/CD pipeline enhancements
  - CLI tool testing in GitHub Actions
  - JSON Schema validation job
  - Example document validation with CLI

- Web-based WYSIWYG editor
  - Visual mode with live WYSIWYG editing
  - Markdown mode for raw source editing
  - Split view with side-by-side markdown and preview
  - Formatting toolbar (headings, bold, italic, lists, tables, links, images)
  - Drag-and-drop asset management
  - Document outline navigation
  - Open/save MDX files directly in browser
  - Word and character count

- Claude Code configuration
  - `.claude/settings.json` with project settings and code style preferences
  - `.mcp.json` with MCP server configuration
  - Root `.gitignore` for common ignores

### Fixed

- Implementation guide: Corrected assets structure from array to object with category keys
- Implementation guide: Updated validation example to iterate over asset categories
- Implementation guide: Fixed reader/writer examples to use correct manifest structure
- TypeScript: Removed dead code (unused `div` variable in `escapeHTML` method)
- Specification: Updated Appendix A with actual JSON Schema reference
- SVG images now render correctly in editor (added MIME type detection)
- Python implementation no longer uses hardcoded paths
- TypeScript `tracking_enabled` field renamed to `enabled` to match spec
- TypeScript annotation enum values now match W3C motivations
- Removed stray markdown backticks from viewer HTML

## [1.0.0] - Draft

### Added

- Initial MDX Format Specification (v1.0.0 Draft)
  - Archive structure definition
  - Manifest JSON schema
  - Asset organization by category
  - Extended Markdown directives (video, audio, model, data, embed)
  - Version history support
  - W3C Web Annotation integration
  - Security considerations
  - Conformance levels (Minimal, Standard, Full)

- TypeScript reference implementation
  - `MDXDocument` class for creating/reading MDX files
  - `MDXManifest` class for metadata management
  - Asset management with automatic categorization
  - Version history and annotation support
  - HTML export capability

- Python reference implementation
  - Example MDX document generator
  - Complete demonstration of all format features

- Web-based MDX viewer
  - Drag-and-drop file loading
  - Markdown rendering with syntax highlighting
  - Asset browser and preview
  - Manifest inspection

- Example MDX document demonstrating all features
