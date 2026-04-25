# Changelog

All notable changes to the MDZ Format (formerly MDX Format) specification
and implementations.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — Phase 4.6.9: mdz snapshot export subcommand (2026-04-25)

Rounds out the `create|view|list` trio shipped in Phase 4.5.2
with `mdz snapshot export <archive> <version>`. Useful for
hand-off scenarios where the recipient needs a specific version
as a standalone `.md` file rather than navigating the delta
chain.

```bash
mdz snapshot export paper.mdz 1.2.0 -o paper-v1.2.0.md
mdz snapshot export paper.mdz 1.2.0 -o paper-v1.2.0.md --with-manifest
```

Implementation reuses the existing `reconstruct` helper that
`view` uses; the only differences are output target (file vs
stdout) and the optional `--with-manifest` flag.

`--with-manifest` writes a sibling `<outfile>.manifest.json`
that:

- Carries the archive's `mdx_version` + `document.id` through
- Suffixes `document.title` with `(<version>)` so the slice is
  identifiable
- Pins `document.modified` to the extraction timestamp
- Appends a `derived_from[]` entry with `{source, version}` for
  provenance

Smoke-tested end-to-end: seeded a fresh archive, ran
`snapshot create 1.0.0`, then `snapshot export 1.0.0 -o
exported.md --with-manifest`. Both files produced; the manifest
correctly traced the version origin.

### Verified — Phase 4.6.9: cell-source escape + Pyodide CSP scope audit (2026-04-25)

Two security-adjacent items closed by audit + targeted hardening.

**(1) `data-mdz-cell-source` escape round-trip.** Five new
vitest cases in
`packages/mdz-viewer/src/directives-security.test.ts` pin the
attribute escape round-trip end-to-end:

- five-char escape applied (`& < > " '`) inside the attribute
  value
- `</textarea><script>alert(1)</script>` payload survives
  `escapeHtml` → attribute → `DOMParser` → `dataset.mdzCellSource`
  byte-equal; no injected `<script>` tag
- U+2028 / U+2029 line separators preserved
- already-escaped `&amp;` sequences round-trip without
  double-encoding
- `</div><img onerror>` closer payload doesn't break the cell
  wrapper; the malicious `<img onerror>` doesn't appear as a
  real tag in the rendered HTML

The pipeline is correct. The escape happens in `escapeHtml` from
the centralised `html-escape.ts`, and dataset reads
auto-decode entities — so the round-trip is text-equal even when
the attribute carries entity-encoded markup.

**(2) Pyodide CSP scope audit.** Verified the
`cdn.jsdelivr.net` relaxation is correctly scoped:

- `script-src` ✓ — Pyodide loader JS
- `connect-src` ✓ — runtime fetch of WASM + package wheels
- `worker-src` (`blob:`) ✓ — Pyodide's web-worker
- `img-src` / `style-src` / `default-src` — NOT relaxed; the
  CDN cannot inject anything else

Tightened further while we were there: added `object-src 'none'`
(no Flash / `<embed>`), `base-uri 'self'` (no `<base href>`
hijack), `form-action 'self'` (no `<form>` exfiltration). The
existing `'unsafe-inline'` on `style-src` is preserved — needed
for the editor's inline-style scaffolding, not Pyodide-related,
and would need separate refactoring to remove (out of scope for
this audit).

A tighter per-path CDN constraint
(`cdn.jsdelivr.net/pyodide/v*/full/`) is what the loader
actually fetches, but per-path CSP isn't supported in the
meta-http-equiv form. The Phase 2.2 hosted Worker emits the
tighter form via response header where it can.

The CSP comment block in `index.html` now documents every
entry's rationale + the audit findings.

### Changed — Phase 4.6.9: drop continue-on-error on markdown lint (2026-04-25)

The `markdown-lint` CI job carried `continue-on-error: true` since
the original Phase 4.6 housekeeping pass — it caught violations
but never failed CI, so regressions slipped through silently.
Removed the shield. Two new config files make the strict-mode
transition tractable:

- `.markdownlint.json` — caps line-length at 120 cols (vs the
  default 80) with table/code/heading exemptions; cosmetic rules
  with widespread pre-existing violations (MD031, MD032, MD033,
  MD036, MD040, MD041, MD047, MD058, MD060, MD028, MD004) are
  turned off. The point is to catch *regressions* on the rules
  that matter (line-length, duplicate-headings, inline-html
  scope), not to retroactively reformat everything.
- `.markdownlintignore` — excludes `spec/`, `docs/`, `legacy/`,
  `node_modules/`, and `implementations/python/example-extracted/`
  from the lint. Spec docs use technical-prose long lines and
  custom table layouts that don't benefit from auto-wrapping;
  the `legacy/` tree is being deleted with Phase 0.1; the example
  output is generator-produced.

CI lint scope narrowed to the actively-maintained customer-facing
docs: `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`. `ROADMAP.md`
and `CLAUDE.md` excluded because their narrative-heavy
audit-history entries would force noisy reformat churn — the
ROADMAP's prose intentionally captures *why* something is the
way it is in long unwrapped paragraphs.

Three pre-existing README line-length violations fixed inline
(broken across paragraph-continuation lines). `npx
markdownlint-cli2 README.md CONTRIBUTING.md CHANGELOG.md` is
now zero-error; regressions on those three files will fail CI.

### Changed — Phase 4.6.9: retire pre-Phase-2.3 demos to legacy/ (2026-04-25)

Three pre-Phase-2 demo trees moved under `legacy/`:

- `editor/` (WYSIWYG single-file demo) → `legacy/editor/`
- `viewer/` (read-only viewer demo) → `legacy/viewer/`
- `chrome-extension/` (legacy Chrome-only ext) → `legacy/chrome-extension/`

All three are superseded by Phase 2 production code:

| Legacy | Replaced by |
|---|---|
| `legacy/editor/` | `editor-desktop/` Electron editor (Phase 2.3) |
| `legacy/viewer/` | `packages/mdz-viewer/` web component (2.1) + `packages/mdz-viewer-hosted/` Cloudflare Worker (2.2) |
| `legacy/chrome-extension/` | `browser-extension/` MV3 cross-browser ext (2.5) |

New `legacy/README.md` documents the migration table, explains
why the directories are kept (history preservation, doc
cross-references, implementation reference), and lays out
explicit rules: don't import from `legacy/`, don't add features
there, don't run CI against it. Final deletion scheduled with
Phase 0.1's `/mdx/**` → `/mdz/**` directory rename.

`CLAUDE.md`, `README.md`, and `docs/security/CSP.md`
cross-references updated to point at the new paths. Production
entry-point pointers added: `npm run dev -w
@mdz-format/editor-desktop` for the editor, `<mdz-viewer>` web
component for the viewer.

### Changed — Phase 4.6.9: hoist adm-zip to workspace root (2026-04-25)

Three cross-package test runners
(`browser-extension/build.js`,
`browser-extension/test/build.test.js`,
`tests/conformance/integrity/run_integrity_conformance.js`)
were `require('adm-zip')` by reaching directly into
`cli/node_modules/adm-zip` via `path.resolve(...)`. That
coupling broke whenever cli's lockfile or hoisting layout
changed.

Fix: `adm-zip` declared in the workspace root's
`devDependencies`. The three callers now plain
`require('adm-zip')` and Node's standard `node_modules` lookup
walks up to the root and resolves it. The cli package keeps its
own copy because the cli ships as a published binary that
shouldn't depend on dev tooling.

CI updated: `validate-browser-extension` job's
"Install adm-zip dependency for build" step (which used to
`cd cli && npm install`) is now a plain root install. The
`validate-cli` job adds the same root install before running
the integrity-fixtures runner. Build determinism preserved
(SHA-256 of the extension zip unchanged at `175d5fa8…`); 3/3
integrity fixtures still pass.

### Changed — Phase 4.6.9: sync-scroll lineHeight from computed style (2026-04-25)

The Compare-locales modal's sync-scroll handler previously
hardcoded `lineHeight = 1.5 * 13.6` to convert pixel scrollTop
into line numbers. That broke whenever the user changed their
default browser font size, the modal CSS evolved, or the right
pane's `<textarea>` rendered at a different size than the left
pane's `<pre>`-style div.

New exported helper in `sync-scroll.ts`:

```ts
resolveLineHeightPx(el: HTMLElement, fallback = 24): number
```

Reads `getComputedStyle(el).lineHeight` and handles all three
CSS forms the spec allows:

- `<length>px` — parsed directly.
- Unitless multiplier — multiplied by `getComputedStyle(el).fontSize`
  in pixels.
- `"normal"` keyword — fallback ratio of 1.2 × font-size (the
  browser default for most fonts).

When `getComputedStyle` is absent (Node test env), returns the
supplied fallback so callers get deterministic behaviour
regardless of host environment.

`index.ts` now reads each pane's line-height independently — the
right pane is a `<textarea>` with system-default sizing while
the left pane uses the editor's monospace stack, so they often
differ. Sync-scroll math now respects the actual rendered line
heights instead of pretending both panes match the same hardcoded
value.

5 new vitest cases pin every CSS branch (px / unitless /
normal), the missing-getComputedStyle fallback, and the
default-fallback path. Net editor-desktop tests: 382 → 387.

### Changed — Phase 4.6.9: centralise escapeHtml (2026-04-25)

Consolidates three duplicate `escapeHtml` implementations in the
editor renderer into one canonical
`editor-desktop/src/renderer/html-escape.ts`. `diff-render.ts`,
`annotations-render.ts`, and `index.ts` import it.

The consolidation closes a real gap: `index.ts`'s prior
`escapeHtmlSimple` only escaped `&`, `<`, `>` — it skipped `'`
and `"`. The locale text displayed in the Compare-locales modal
went into `<pre>`-style output so attribute injection wasn't
possible, but if a future refactor moved that text into an
attribute the gap would have surfaced as a real XSS vector.
Removing the variant + re-exporting the canonical name keeps
both call sites unchanged while strengthening the escape.

The canonical version handles `null`/`undefined` callers by
coercing to empty string — convenient for optional fields
without an `?? ""` at every call site.

6 new vitest cases pin the five-char escape, ampersand-first
ordering, null/undefined coercion, an XSS payload smoke test,
and the apostrophe-escape gap. Net editor-desktop tests:
376 → 382.

### Added — Phase 4.6.9: .editorconfig + .gitattributes (2026-04-25)

Top-level `.editorconfig` and `.gitattributes` pin the repo to
LF line endings + UTF-8. Closes the per-commit `LF will be
replaced by CRLF` warnings on Windows hosts that were burying
real diffs.

`.editorconfig`: `end_of_line = lf`, `charset = utf-8`,
`insert_final_newline = true`; `indent_size = 2` default with
`4` for Python + Rust and `tab` for Makefiles. Markdown keeps
trailing whitespace (the two-space line-break syntax depends on
it).

`.gitattributes`: `* text=auto eol=lf` so cross-platform clones
get the same bytes; explicit `binary` for image / archive /
font / 3D-model types; per-language `diff=` drivers for nicer
diffs; `package-lock.json` + `Cargo.lock` marked
`linguist-generated=true` so review tools collapse them.

A `git add --renormalize .` pass on existing tracked files
would normalise any lingering CRLF; deferred to a separate
commit since the resulting diff is large and better reviewed
on its own.

### Added — Phase 4.6.9: Status-snapshot freshness CI gate (2026-04-25)

`tests/roadmap/check_snapshot_freshness.py` complements the
cited-path gate. Parses the `### Status snapshot (YYYY-MM-DD)`
heading and compares against the latest commit timestamp on
`ROADMAP.md` (`git log -1 --format=%aI`). Default threshold 30
days; configurable via `--max-days`. Fails CI with a pointer to
update both the heading and the table contents.

The 30-day window is intentional — the snapshot is a manually-
maintained summary, and forcing a rewrite on every unrelated
commit would create noise. 30 days lets a maintainer batch-up
small status changes; anything older almost certainly means the
snapshot has drifted from reality (which is the bug this gate
catches).

Reference timestamp comes from `git log` when available, else
wall-clock — so CI uses the right signal (last commit on
ROADMAP.md) and local runs work without a git history. Wired
into the `validate-roadmap` CI job alongside the cited-path
check.

### Added — Phase 4.6.9: ROADMAP cited-path CI gate (2026-04-25)

`tests/roadmap/check_cited_paths.py` is a standing CI gate
that prevents future doc/code drift like the
`cli/test/import-ipynb.test.js` issue this session's cross-check
caught.

The script walks every `- [x]` ROADMAP entry, extracts each
backtick-quoted path-shaped string ending in a tracked extension
(`.ts`, `.tsx`, `.js`, `.py`, `.rs`, `.md`, `.json`, `.toml`,
`.yml`, `.yaml`, `.html`, `.plist`, `.abnf`, `.lark`), and asserts
each one either resolves directly on disk OR matches a basename
somewhere in the tree (citation-style tolerance — the ROADMAP
often cites `mdx_format.ts` without its full path).

The path-shape regex deliberately excludes whitespace and
backticks inside the match, so multi-line shell commands that
happen to end in a path-shaped suffix don't false-positive
(an earlier version of the regex hit `npx tsc … tsconfig.test.json`
as a "path" — fixed).

Wired into a new `validate-roadmap` CI job that runs first in
the workflow (before TypeScript / Rust / Python validations) so
drift is caught at the cheapest possible stage. 128 citations
checked, 0 drifted on the current ROADMAP.

### Changed — RLM cross-check: ROADMAP / CHANGELOG / CLAUDE.md sync (2026-04-25)

Used the RLM skill to compare doc claims against the actual
codebase, surface drift, and tighten the three top-level docs.

- **Status snapshot** in `ROADMAP.md` refreshed for 2026-04-25.
  Phase 2.3b row updated from "partial" → "all 7 sub-phases
  shipped end-to-end" reflecting today's per-cell Run buttons,
  read-write Compare-locales modal, diff-pane UI, annotation
  sidebar, and Generate-variants IPC. Phase 2.4 row notes the
  yazl-based deterministic export. Phase 2.5 row notes the
  deterministic Node bundler. Phase 2.1 row reflects the
  delta-snapshots-v1 reader + label i18n landing into the
  viewer; viewer test count 117 → 145.
- **Path drift fix** in ROADMAP: a citation for
  `cli/test/import-ipynb.test.js` was a hallucinated path —
  the actual ipynb-import test is
  `editor-desktop/test/ipynb-import.test.ts`. Corrected.
- **Duplicate-status fix** in ROADMAP: the writer-side `mdz
  snapshot create|view|list` CLI was listed as `[ ]` under
  Phase 2.3b.3 (a cross-reference that never got rolled up)
  even though the canonical entry under Phase 4.5 was already
  `[x]`. Marked the cross-reference `[x]` with a pointer to
  Phase 4.5.
- **`CLAUDE.md` repo overview** for `editor-desktop/` was a
  one-line stub claiming "Phase 2.3a.1 Electron editor shell"
  with only `archive-io.ts` listed. Replaced with an accurate
  18-module breakdown and current 376-case test count.

Cross-check methodology: loaded ROADMAP + CHANGELOG + every
source file into Python via the RLM workflow, extracted all
`[x]` cited paths (107 distinct), verified each against the
filesystem (only one false reference — the ipynb path drift),
extracted all `[ ]` keywords + grepped the codebase for
matching implementations (no false-opens — the open items are
genuinely open). Net delta: 159 → 160 `[x]`, 45 → 44 `[ ]`.

### Added — Phase 2.3b.5.3: read-write sibling-locale + Add-locale (2026-04-25)

The compare-locales modal is now read-write, plus there's a
new "+ Add locale" command for spawning a sibling locale.

Three changes:

- **Right pane upgraded** from `<div>` to `<textarea>` with
  sync-scroll preserved. Edits stage into the in-memory
  `localeFileText` map; the document's modified indicator
  flips on so the user remembers to save.
- **"Save locale" button** in the modal commits the textarea
  edit into the same map.
- **"+ Add locale" button** prompts for a BCP-47 tag, calls
  `planAddLocale` from Phase 2.3b.5's data layer (which
  produces a deep-cloned manifest patched with the new locale
  + the conventional `document.<lang>.md` path), seeds the
  new locale's text from the primary draft, and updates the
  dropdown. Same locale tag declined politely if already
  present.

`saveFlow` extended to tunnel the staged locale bytes through
the IPC handler's `assets` tuple. The handler treats
`[path, bytes]` pairs as verbatim archive entries — fine for
asset paths, fine for `document.<lang>.md` siblings.

Full CodeMirror surface for the secondary pane remains
deferred — the textarea is editable enough for v1 translation
work without dragging in CodeMirror state-effects complexity.

376/376 editor-desktop tests still pass.

### Added — Phase 2.3b.1.3: per-cell Run buttons (2026-04-25)

The preview pane now shows a ▶ Run button on every Python
`::cell` block, in addition to the existing "Run Python cells"
toolbar that runs all of them. Authors who only want to re-run
the cell they just edited skip the wait on earlier cells.

Three pieces:

- **Renderer change** in `packages/mdz-viewer/src/directives.ts`:
  `renderCellBlock` now embeds the cell's source and language as
  `data-mdz-cell-source` / `data-mdz-cell-language` attributes on
  the rendered `.mdz-cell` div. The HTML escape is the same
  pre-existing one used for the inline `<code>` body, so the
  serialization is safe.
- **Editor wiring** in
  `editor-desktop/src/renderer/cell-run-buttons.ts`. Pure (with
  one DOM call):
  - `attachCellRunButtons(previewHost, opts)` walks for
    `[data-mdz-cell-language="python"]` elements, injects a
    single absolutely-positioned Run button into each, tagged
    with `data-mdz-run-attached` so re-renders don't duplicate.
  - `spliceSingleCellOutput(markdown, cellSource, result)` — a
    pure-string helper that finds the cell body in the source
    and splices an `::output` block after the matching closing
    fence. 3 vitest cases pin insertion ordering, no-match
    no-op, and every output-type branch.
- **EditorPane.onPreviewRendered hook** in `editor-pane.ts`.
  Fires after each preview render with the host element so
  `index.ts` can wire `attachCellRunButtons` against the same
  lazy-loaded Pyodide kernel the toolbar uses.

3 new vitest cases. Net editor-desktop tests: 373 → 376.

### Verified — Phase 1.2 + 3.1: audit cluster (2026-04-25)

Two ROADMAP entries closed by audit (no code change needed):

- **Phase 1.2 regex parser fallback** — verified the "keep
  regex parser as fallback" intent is achieved at the parse-attr
  level via the `strict: bool` flag in
  `implementations/python/mdz_parser/parser.py:208`'s
  `_parse_attrs_lark`. `strict=False` (v1.1 graceful-degradation
  path) returns empty `ParsedAttrs` on malformed input;
  `strict=True` (v2.0 directive path) raises `ParseError`. No
  `--legacy` CLI flag exists or is needed because the choice is
  per-call inside the parser. The original ROADMAP wording was
  ahead of how the parser actually evolved.
- **Phase 3.1 `::include` external-URL permissions** — verified
  the viewer's `directives.ts` refuses external URL includes
  without `content_hash` (renders `mdz-include-missing` with
  "requires content_hash" message) and emits an
  `mdz-include-pending` placeholder for URL+content_hash
  includes. Both branches covered by `directives.test.ts:420`
  and `:429`. Matches the spec's "external transclusion requires
  integrity declaration" rule.

### Changed — Phase 4.6.8: EPUB export adm-zip → yazl swap (2026-04-25)

`cli/src/commands/export-epub.js` no longer uses adm-zip for the
output EPUB. Replaced with `yazl.ZipFile`, which gives explicit
per-entry ordering (entries write in `addBuffer` call order) and
explicit `compress: false` for the mimetype entry. EPUB OCF §4.3
requires mimetype to be:

1. The first entry in the ZIP (yazl call order = write order)
2. STORED (compression method 0; `compress: false`)
3. Exactly `application/epub+zip`, no BOM, no trailing newline

The previous adm-zip workaround had two private helpers:

- `_addStoredEntry` flipped `entry.header.method = 0` after-the-
  fact (twice, because some adm-zip versions reset it on
  `setData`).
- `_forceFirstEntry` mutated adm-zip's undocumented internal
  `entryTable` to put mimetype at index 0. A no-op on some
  adm-zip versions, which would produce an epubcheck WARNING
  (not FATAL — but undesirable).

Both removed. The yazl swap is the proper fix the comment at
`export-epub.js:218` flagged as "Phase 3 cleanup" — now landed.

`buildEpub` is now `async` (yazl streams to disk asynchronously);
`exportEpub` awaits it. Reader path still uses adm-zip for the
input MDZ (read-only, sync, fine).

`yazl ^2.5.1` added to `cli/package.json` dependencies.

15/15 import-epub round-trip tests still pass — the
`round-trip: synthesized mdz → epub → mdz` test catches any
correctness regression directly.

### Added — Phase 4.6.8: Rust binding blake3 (2026-04-25)

Closes the `bindings/rust/src/lib.rs:804` "blake3 (spec'd but
deferred in this binding)" stub. The Rust binding now supports
all three v2.0 spec content-hash algorithms — `sha256`,
`sha512`, **and `blake3`**.

`Cargo.toml` adds `blake3 1.5` as an optional dep gated under
the `verify` feature alongside the existing `sha2` + `hex`,
with `default-features = false` so it stays no_std compatible
for downstreams that need it. Dev-deps mirror the same version
so integration tests can compute expected hashes.

`hash_bytes("blake3", bytes)` in `src/lib.rs` invokes
`blake3::hash(bytes)` and emits the 256-bit (32-byte) default
output as hex — same shape callers already handle for `sha256`
output.

The pre-existing
`verify_content_id_rejects_unsupported_blake3` integration test
was inverted (it had been pinning the deferred-error path):

- `verify_content_id_accepts_correct_blake3_hash` — computes
  the correct blake3 hash for the test fixture's stub
  `document.md`, asserts `verify_content_id()` succeeds.
- `verify_content_id_rejects_wrong_blake3_hash` — declares an
  all-zeros content_id, asserts the verifier hits
  `IntegrityError::Mismatch { kind: "content_id", … }`.

README updated to drop the "deferred" caveat.

### Added — Phase 4.6.8: Browser-extension deterministic bundler (2026-04-25)

Closes the `REPRODUCIBLE_BUILD.md:70` "bundler not wired" note.
The browser extension now ships through a deterministic Node
bundler producing byte-identical output across CI host OSes.

`browser-extension/build.js`:

- Walks `manifest.json` + the five packaged dirs (`background`,
  `content`, `popup`, `viewer`, `icons`).
- Excludes `test/` + host-specific metadata files (`.DS_Store`,
  `Thumbs.db`, `desktop.ini`).
- Sorts entries by archive path; pins every header timestamp to
  1980-01-01; fixes `external_attr` to `0644`.

The old `zip -X` recipe is host-portable in name but not in
practice — Windows `zip -X` still emits different
`external_attr` bytes than Linux `zip -X` because each reflects
source-filesystem permissions. The Node bundler produces
byte-identical output across all three CI host OSes. AMO
reviewers verify by SHA-256, so this matters.

3 new `test/build.test.js` cases pin the determinism invariant,
the exclusion list, and the required-directory list.
`validate-browser-extension` CI job builds twice and diffs the
SHAs.

### Added — Phase 4.6.8: EPUB import/export symmetric rule (2026-04-25)

Round-trip MDZ → EPUB → MDZ now preserves labeled-directive
identity. The prior comment in `import-epub.js:426` flagged the
asymmetry as lossy: import was emitting `::fig{id=X}` from
`<figure id="X">`, but export wasn't producing those `<figure>`
elements in the first place — so a re-imported EPUB lost the
directive identity the original MDZ carried.

Two changes:

- **Export side** (`cli/src/commands/export-epub.js`). New
  `preprocessLabeledDirectives(markdown)` runs before
  `marked.parse` and converts:
  - `::fig{id=X}` → `<figure class="mdz-fig" id="X">`
  - `::eq{id=X}` → `<div role="math" class="mdz-eq" id="X">`
  - `::tab{id=X}` → `<figure class="mdz-tab" id="X">`
  - `:::` closer → matching `</figure>` / `</div>`
- **Import side** (`cli/src/commands/import-epub.js`). Two new
  turndown rules (`mdz-labeled-figure`, `mdz-labeled-equation`)
  filter on the class hooks the export now emits and reverse
  the transform exactly. The id attribute survives the
  round-trip.

15/15 import-epub tests still pass — including the
`round-trip: synthesized mdz → epub → mdz preserves declared
values` test that catches asymmetry directly.

### Added — Phase 4.6.8: examples/scientific-paper/ (2026-04-25)

Concrete demo MDZ source-tree at
`examples/scientific-paper/source/` that authors can clone as a
starting template. Closes the Phase 0 deliverable that
`docs/for-authors/SUBMITTING.md:250` flagged as TBD.

The skeleton validates against the `scientific-paper-v1`
profile:

- IMRaD-structured `document.md` — Abstract, Introduction,
  Methods (with a Python `::cell` that re-computes the headline
  statistic at view time), Results (with `::fig` / `::eq` /
  `::tab` labeled directives + `::ref` cross-refs), Discussion,
  Acknowledgements, `::bibliography`.
- `manifest.json` declares the `scientific-paper-v1` profile,
  one author with `did:web` + ORCID, the four required manifest
  fields, and a placeholder `manifest_checksum` that a signing
  pass replaces.
- `references.json` is CSL-JSON with two entries — one
  self-referencing the spec, one illustrative external work.
- `assets/data/series.csv` is a 28-byte three-row dataset the
  example cell consumes.

Top-level `README.md` walks through bundling into a `.mdz` and
validating against the profile.

### Added — Phase 3.2: Archive-level integrity fixtures (2026-04-25)

`tests/conformance/integrity/` now hosts archive-level
integrity-fail fixtures that the existing parser-level negative
suite couldn't cover (parser tests run on raw `.md` strings; you
can't tamper with a manifest_checksum that doesn't exist yet).

Each fixture is a JSON descriptor (`descriptor.json`) declaring
the manifest, file contents, and expected error rule + message
substring. The runner
(`run_integrity_conformance.js`) assembles each descriptor into
a real `.mdz` ZIP in a temp file, hands it to either
`mdz validate` (for structural-shape failures) or `mdz verify`
(for integrity-hash failures) based on the declared rule, and
asserts the verifier rejects it with the declared message.

Three fixtures land in this commit:

- **`content-hash-mismatch`** — manifest declares
  `document.content_id` as all-zeros; the actual `document.md`
  bytes hash to something else. Verifier MUST reject — accepting
  defeats the integrity layer.
- **`manifest-checksum-mismatch`** —
  `security.integrity.manifest_checksum` is all-zeros. This is
  the integrity anchor signature verification chains against; a
  mismatch means tampering or a writer bug.
- **`manifest-missing-mdx-version`** — required field absent.
  Routed to `mdz validate` rather than `mdz verify` since the
  failure is structural.

Per-asset `content_hash` mismatch fixtures are deferred to a
follow-up that first extends the `verify` command's checking
beyond the manifest-level checksum.

Wired into the `validate-cli` GitHub Actions job alongside the
existing delta-snapshots conformance runner.

### Added — Phase 1.3: Py↔TS cross-impl parity harness (2026-04-25)

Closes the long-standing Phase 1.3 ROADMAP item. Companion to
the existing `rust_ts_manifest_parity.py`. New
`tests/parity/py_ts_roundtrip.py` drives the Python reference
generator (`implementations/python/mdx_format.py`'s
`create_example_mdx()`), extracts the produced archive's
manifest, normalises away spec-allowed nondeterministic fields
(timestamps, document UUIDs, content_id, generator-tool name),
and compares against the same archive's TS-readable manifest
view.

The harness deliberately compares the raw manifest JSON rather
than booting the TypeScript `MDZDocument` class — that's what
proves cross-impl agreement on the wire format, which is the
parity invariant that matters. Booting the TS class would test
the TS impl against itself.

Wired into the `validate-cli` GitHub Actions job. The Rust↔TS
parity harness shipped in Phase 4.6.2; with this one landing,
all three impls now have automated cross-checks against each
other on every CI run.

### Added — Phase 2.3b.1.3: Manifest kernels declaration on save (2026-04-25)

When the editor has loaded the Pyodide kernel during a session
(i.e. the user clicked "Run Python cells" at least once), the
saved archive's manifest now declares
`kernels.python.runtime: "pyodide"` plus the pinned Pyodide
version. This tells downstream readers / reviewers exactly which
interpreter constraints applied — Pyodide isn't CPython
(no compiled-wheel `pip install`, no TensorFlow / PyTorch).

New module `editor-desktop/src/renderer/kernel-manifest.ts`:

- `mergeKernelDeclaration(manifest, version?)` — pure projection
  that returns the merged `kernels` slot. Existing non-Python
  kernel declarations (R via WebR, Julia, etc.) are preserved
  verbatim; an existing Python declaration gets its version
  field updated to the current Pyodide release. Malformed
  `kernels` fields (non-object) are ignored — fresh slot.

`saveFlow` in the renderer now splices the merged kernels slot
into the manifest copy at write time, gated on the lazy-load
sentinel `pythonKernel != null`. Save failures still leave the
in-memory state untouched (the manifest copy is a deep-clone
projection).

6 new vitest cases pin every branch: add to empty,
preserve-other-kernels, overwrite-stale-version, default
version, no-input-mutation, malformed-`kernels`-input recovery.

Net editor-desktop tests: 367 → 373.

### Added — Phase 4.6.8: Directive label i18n (2026-04-25)

`packages/mdz-viewer/src/directives.ts` now localizes the
labeled-directive prefixes (`Figure 1` / `Figura 1` / `图 1`).
The previous `LABEL_PREFIX` table was English-only with a
"see TODO at end of file" note that the pre-RLM audit
surfaced.

- New `LABELS_BY_LANG` table covers 8 languages: en, es, fr,
  de, it, pt, ja, zh — picked from Web of Science 2023's
  ~75% paper-count coverage. Adding a language is a one-line
  PR.
- New exported `resolveLabels(language)` strips the BCP-47
  subtag (`fr-CA` → `fr`, `en-US` → `en`); falls back to
  English when the tag is null, empty, or unknown.
- `DirectiveOptions.language` threads the manifest's
  `document.language` through the pass-1 collector
  (`collect(md, labelTable)`) and the labeled-opener
  renderer (`renderLabeledOpener(..., labelTable)`).

4 new vitest cases pin the localization (en/es/ja/zh), the
unknown-language fallback, the primary-subtag handling, and
the null/empty-language fallback. 50/50 viewer directive
tests pass (was 46).

### Changed — Phase 4.6.4: Audit cluster (2026-04-25)

Three of the four 4.6.4 audit-cluster items closed:

- **`mdx → mdz` grep-pass** completed via the RLM-driven
  inventory: 692 lower-case `mdx` references across 107 files.
  Most were legitimate (legacy dual-extension support per the
  2027-01-01 deprecation policy, historical CHANGELOG entries,
  deferred-rename paths in `implementations/{ts,py}/mdx_format.{ts,py}`).
  Two stale-and-renameable hits got fixed:
  - `cli/package.json` `name` was `mdx-cli`; renamed to `mdz-cli`.
    `bin` exposed only `mdx`; now exposes both `mdz` (preferred)
    and `mdx` (legacy alias) so the CLI is invokable as either.
  - `spec/profiles/api-reference-v1.json` `$schema` and `id` URLs
    pointed at `mdx-format.org`; corrected to `mdz-format.org`
    so all four profile files agree.
- **Prose-grammar duplication audit:** verified clean — no fenced
  ABNF blocks outside `spec/grammar/mdz-directives.abnf` duplicate
  the directive grammar. Single source of truth confirmed.
- **Conformance Core vs Advanced split:** verified the
  `mdz-core-v1` (6 required fields, no required extensions, viewer
  capability level 0) and `mdz-advanced-v1` (8 required fields, 17
  validation rules, JCS canonicalization mandatory, signatures
  required, content-addressing required) profiles are real and
  non-overlapping. Advanced is explicitly a strict superset of
  Core; `scientific-paper-v1` and `api-reference-v1` are
  independent third-party-style profiles built atop Core.

The fourth item (Chevrotain claim) was already classified as
"keep regex parser, no Chevrotain rebuild" in earlier audit
notes; nothing further to do.

The Rust wasm32 `debug_assert!` ROADMAP entry from 4.6.1 was
also stale — verified the assert is in place at
`bindings/rust/src/lib.rs:502–506`. Marked done.

### Changed — Phase 4.6: Housekeeping batch (2026-04-25)

Five small open items closed:

- **Spec title rename completed.** `MDX_FORMAT_SPECIFICATION.md`
  (v1.0) and `MDX_FORMAT_SPECIFICATION_v1.1.md` now carry "MDZ
  Format Specification (v1.0/v1.1 — historical)" headings with an
  archival banner pointing forward to the v2.0 spec, matching the
  v2.0 file's heading. Through 2027-01-01 readers MUST still
  accept `.mdx` extensions per the existing dual-extension policy.
- **`basicMarkdownToHTML` retired.** The toy regex-based renderer
  in `implementations/typescript/mdx_format.ts` has been removed.
  `MDZDocument.toHTML` now throws with a migration message pointing
  at `renderMarkdown` from `@mdz-format/viewer`. The
  `_toHtmlWarningEmitted` static guard and the `escapeHTML` private
  helper that supported it are also gone. 125/125 TS tests still
  pass — no caller depended on the toy output.
- **CHANGELOG line-length wrap.** A pass over the file brought
  prose lines under 90 chars; remaining over-80 lines are
  intentional (URL-bearing, fenced code).
- **Cargo.lock** is still ungenerated — needs a build host with
  `cargo` available, which this environment doesn't have. Item
  remains externally blocked but is now scoped to a one-command
  follow-up (`cargo generate-lockfile && git add Cargo.lock`).

### Added — Phase 2.3b.5.2: Compare-locales modal + sync-scroll (2026-04-25)

The "Compare locales" toolbar button now opens a side-by-side
modal showing the current draft on the left and any sibling
locale on the right (picked via dropdown). Sync-scroll keeps the
two panes aligned at the paragraph level using the alignment
table from Phase 2.3b.5.

Two pieces:

- **Sync-scroll mapping** in
  `editor-desktop/src/renderer/sync-scroll.ts`:
  - `buildSyncScrollState(left, right)` — wraps
    `paragraphSlices` + `alignParagraphs` from the locales data
    layer.
  - `paragraphAtLine(slices, line)` — finds which paragraph a
    line falls inside; clamps to the last paragraph past EOF.
  - `mapLineLeftToRight` / `mapLineRightToLeft` — direct
    paragraph-index lookup, returns null when the alignment has
    no match.
  - `proportionalMap(state, line, direction)` — fallback that
    maps by relative document offset (line-count ratio); always
    returns a sensible target line.
  - `mapWithFallback(state, line, direction)` — tries direct
    mapping first, falls back to proportional.
- **Compare-locales modal in `index.ts`**:
  - `loadLocaleState(entries)` walks the open archive's locale
    files (per `enumerateLocales(manifest)`) into a
    `Map<language, text>`.
  - `openLocaleModal()` builds a `<dialog>` with the two
    read-only panes; `change`-on-dropdown rebuilds the alignment
    state and resets scroll positions; bidirectional scroll
    listeners use a `syncing` flag to suppress feedback loops.

The modal is read-only for this chunk — the full read-write
secondary CodeMirror pane (with stacked-pane layout in the
main editor) is gated on CodeMirror state-effects work that
deserves its own chunk (Phase 2.3b.5.3 follow-up). The
read-only view validates the alignment + sync-scroll plumbing
end-to-end and gives translators a useful comparison view today.

16 new vitest cases in `test/sync-scroll.test.ts` cover every
mapping branch (aligned, missing, empty, length-mismatch),
proportional fallback math (clamps, ratio bounds), and the
state-builder edge cases (empty inputs).

Net editor-desktop tests: 351 → 367.

### Added — Phase 2.3b.4.2: Annotation sidebar UI (2026-04-25)

The editor's right rail now has an Assets / Annotations tab pair.
The Annotations panel surfaces every entry from
`annotations/*.json` with role-coloured borders, decision-motivation
pills, threaded reply rendering, and trust badges per
`findTrustWarnings`.

Two pieces:

- **Pure thread → HTML renderer**
  (`editor-desktop/src/renderer/annotations-render.ts`):
  - `renderAnnotationThread(node, warnings)` — recursive thread
    renderer. One `<article class="annotation annotation-{role}">`
    per node; replies nested in `<div class="annotation-replies">`
    with an indented dashed gutter. Header has role pill,
    motivation pill (decision motivations get strong colour),
    creator name (falls back to DID, then `(anonymous)`), date
    (date-only — time of day adds noise without value), and
    trust pill.
  - `renderAnnotationSidebar(threads, warnings)` — top-level
    panel renderer with empty-state placeholder.
  - `summarizeAnnotations(threads)` — `"N annotations across M
    threads"` for the tab badge.
  - All untrusted text passes through `escapeHtml`; tests verify
    a `<script>` body renders as `&lt;script&gt;`.
- **Sidebar tab + state in `index.ts`**:
  - `loadAnnotationsState(entries)` walks the archive's
    `annotations/*.json` paths via the Phase 2.3b.4 data layer's
    `loadAnnotations`. Parse errors get logged but don't sink the
    panel.
  - Tab pair (Assets / Annotations) at the top of the right rail;
    role-aware ARIA (`role="tab"`, `aria-selected`,
    `aria-controls`).
  - `refreshAnnotationsPanel()` runs `findTrustWarnings` against
    an empty signed-creator set for now (Phase 3 signature
    integration replaces with the real signed-DID set from
    `security/signatures.json`); every annotation requiring a
    signature surfaces as a warning until that lands.

13 vitest cases in `test/annotations-render.test.ts` cover the
single-annotation render, reply nesting, HTML escaping,
decision-motivation classes, trust-pill mapping, anonymous /
DID-only creator fallbacks, sidebar empty-state, multi-thread
ordering, and the summary string.

Net editor-desktop tests: 338 → 351.

Still open (Phase 2.3b.4.3 follow-up): comment / reply / accept /
reject creation flows. Those need IPC for UUID generation +
signature integration (the latter is the not-yet-shipped piece).

### Added — Phase 2.3b.3.2: Diff-pane UI (2026-04-25)

The "Compare versions" toolbar button now opens a modal that
diffs the current buffer against any saved snapshot in the
archive's `history/snapshots/` chain. Two pieces:

- **Pure HTML renderer**
  (`editor-desktop/src/renderer/diff-render.ts`) —
  `renderBlockOps(ops)` returns a strict-CSP HTML string with
  stable class hooks: `block-equal`, `block-added`,
  `block-removed`, `block-modified`, plus `line-added` /
  `line-removed` / `line-equal` for the inline line-diff inside
  modified blocks. `renderDiffStats(ops)` returns the
  unified-stat header (`+12 / -3 / ~5 / =42`). All untrusted
  manuscript text passes through `escapeHtml` before
  interpolation; tests verify a `<script>` payload in the
  source emits literal `&lt;script&gt;`. Heading blocks render
  their friendly text label, labeled directives render
  `::fig (id=overview)`, others get `kind — line N`.
- **Compare-versions modal** in `index.ts`.
  `loadSnapshotState(entries)` parses
  `history/snapshots/index.json` and stages every base / delta
  text into a `Map<string, string>` on archive open;
  `openDiffModal()` builds a `<dialog>` with a snapshot dropdown,
  reconstructs the selected version via
  `reconstructVersionSync` (Phase 4.5 reader), runs `diffBlocks`
  + `tokenizeBlocks` (Phase 2.3b.3 algorithm), and renders the
  HTML via the diff renderer. Reconstruction failures (malformed
  patches, circular chains) surface in the modal body rather
  than crashing the dialog.

The diff CSS is colour-coded per common-diff convention (green
adds, red removes, yellow modified) with dark-mode counterparts.
Block-equal entries render at 55 % opacity so the eye lands on
changes first.

11 new vitest cases in `test/diff-render.test.ts` cover the HTML
output, escape pass, every op-class hook, friendly-label
rendering, and the empty-state placeholder.

Net editor-desktop tests: 327 → 338.

### Added — Phase 2.3b.1.2: Pyodide UI + CSP relaxation (2026-04-25)

The editor can now actually execute Python cells. Three pieces:

- **CSP relaxed** in
  `editor-desktop/src/renderer/index.html` to permit the
  `cdn.jsdelivr.net/pyodide` script + WASM load:
  `script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net`,
  `connect-src 'self' https://cdn.jsdelivr.net`, `worker-src 'self'
  blob:`. Pyodide is opt-in — the bundle only loads when the user
  clicks "Run Python cells" — so the relaxation is bounded; the
  rest of the renderer stays under the strict default CSP.
  `wasm-unsafe-eval` is required because Pyodide's
  `WebAssembly.compile` path counts as eval under CSP3.
- **Pure orchestration layer** in
  `editor-desktop/src/renderer/cell-runner.ts`:
  - `extractPythonCells(markdown)` — walks the document, picks up
    every `::cell{language=python}` plus its fenced source block.
    Tolerant of blank lines between directive and fence; skips
    cells whose `language` attribute isn't `python`.
  - `runCells(cells, kernel, defaults?)` — sequential execution
    so later cells see earlier cells' side effects (Jupyter REPL
    semantics). Stops on first `status: "error"`. Default 30 s
    timeout per spec; overridable.
  - `formatCellOutput(result)` — renders `KernelResult` →
    `::output{type=…}` blocks per spec. Output mapping: stdout /
    stderr / error / result (scalar last-expression) / display
    (with rich-MIME priority `text/html > image/svg+xml >
    image/png > image/jpeg > text/plain`). Inlines images as
    `data:` URIs so outputs render without an asset write. Uses
    4-backtick fences so triple-backticks inside output text
    can't break the block.
  - `insertOutputs(markdown, runs)` — right-to-left splice keeps
    earlier offsets valid as later inserts shift the buffer.
- **"Run Python cells" toolbar button** in `index.ts`. Lazy-loads
  the kernel on first click via `getPythonKernel()`; subsequent
  clicks reuse the same handle (module imports persist between
  runs). Surfaces the outcome in the title bar:
  `Ran N cells`, `Stopped at cell K: <reason>`,
  `Cell K timed out — interpreter may still be running`, or
  `No Python cells in document.`

22 new vitest cases in `test/cell-runner.test.ts` cover the
extractor (directive detection, language filter, fence pickup,
ordering, blank-line tolerance, offset accuracy), the runner
(sequential execution, stop-on-error, timeout defaulting), the
output formatter (every MIME branch, scalar-only result blocks,
rich-MIME priority), and the right-to-left splice invariant.

The Pyodide CDN load itself is browser-only and exercised by
Phase 2.3a.7 Playwright integration tests when those land. Tests
here use `FakePythonKernel` for deterministic playback.

Net editor-desktop tests: 305 → 327.

Still open (Phase 2.3b.1.3 follow-up): manifest
`kernels.python.runtime: "pyodide"` declaration on save;
per-cell Run buttons in the preview pane (vs the current
"Run all" toolbar).

### Added — Phase 2.3b.6.3: Generate-variants IPC + UI (2026-04-25)

Closes Phase 2.3b.6 fully. Three pieces wire the planner (Phase
2.3b.6) and encoder (Phase 2.3b.6.2) through to a working
end-to-end flow in the editor:

- **IPC channel `variants:encode`** in
  `editor-desktop/src/main/main.ts`. Receives
  `{sources: [path, bytes][], plan: VariantPlanEntry[]}`,
  reconstitutes the source map, calls the main-process encoder,
  returns the result. Sharp-not-installed surfaces as
  `{ok: false, reason: 'sharp-not-installed'}` straight through
  to the renderer.
- **`encodeVariants` on `window.editorApi`** — exposed via
  `preload.ts` with the corresponding type in
  `preload/types.ts` (`EncodeVariantsPayload` and
  `EncodeVariantsResultSerialized` mirror the renderer-side
  planner / encoder shapes for IPC serialization).
- **Renderer-side flow** in
  `editor-desktop/src/renderer/variant-flow.ts`:
  `runVariantFlow(store, encoder)` is pure orchestration with no
  DOM dependencies — testable in node by injecting a fake
  encoder callback. Path-based kind heuristic
  (`inferImageKind`): `icon-*` / `*-icon` → icon, `hero-*` →
  hero, `inline-*` → inline, everything else → figure. Filters
  already-staged variants out of the source list so re-runs are
  idempotent and `.webp` / `.avif` files-as-sources don't try to
  variant themselves.
- **"Generate variants" toolbar button** in the header.
  Disabled until an archive is open; flips to "Generating…"
  while in flight; status text in the title bar reports the
  outcome (`Generated N variants`, `All variants up to date`,
  `requires sharp`, etc.).

`AssetStore` gained three small additions to support this flow:

- `addAt(archivePath, bytes, mime)` — write at a precomputed
  path (encoder already decided the variant path).
- `get(path)` and `filter(pred)` — read-side helpers.
- `variantPathsFor(sourcePath)` — list existing variants for a
  source so the planner skips already-encoded combinations.

10 new vitest cases in `test/variant-flow.test.ts` cover the
kind heuristic, the plan-of-zero idempotent case,
sharp-not-installed propagation, the partial-failure path,
and the variant-source-self-filter. End-to-end verified by
running the renderer in a headless Electron with the fake
encoder injected via the `editorApi` shim.

Net editor-desktop tests: 292 → 305.

### Added — Phase 2.3a.6: Release engineering pipeline (2026-04-25)

The editor now has a complete three-platform release pipeline that
runs **today** (unsigned) and auto-signs the moment cert secrets land
in CI — no code change required when they arrive. Four pieces:

- **`electron-builder.yml`** — installer config covering macOS DMG +
  ZIP (universal: x64 + arm64), Windows NSIS + portable (x64 + arm64),
  and Linux AppImage + deb + rpm. All cert / notarization values are
  env-var placeholders (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
  `APPLE_TEAM_ID`, `CSC_LINK`, `CSC_KEY_PASSWORD`); the `publish` block
  points at the project's GitHub Releases.
- **`build-resources/entitlements.mac.plist`** — macOS hardened-runtime
  entitlements, with the minimum set notarization needs:
  `com.apple.security.cs.allow-jit` (Pyodide WASM compile),
  `network.client` (auto-update + Pyodide CDN),
  `files.user-selected.read-write` (open-archive dialog).
- **Auto-update feed wiring** in `main.ts` — replaces the no-op stub
  with a real `electron-updater` config: `autoDownload: false`,
  `autoInstallOnAppQuit: true`, debug logger when `MDZ_EDITOR_DEV=1`,
  graceful failure on cold-start with no connectivity. Until the first
  signed release ships, the updater resolves with `update-not-available`
  (intended steady state).
- **`.github/workflows/release-editor.yml`** — three-platform
  GitHub Actions matrix triggered on `v*` tag pushes and manual
  dispatch. Auto-detects which platform's signing secrets are present
  and runs `npm run dist` (signed) vs `npm run dist:unsigned`
  accordingly. Annotates the run with `::notice` when a platform's
  secrets are missing so the gap is visible without failing the build.
  Uploads installers as artifacts (DMG / ZIP / EXE / AppImage / deb /
  rpm + `latest-<platform>.yml` for the auto-updater) with 30-day
  retention.

Placeholder icons (1×1 transparent PNG / ICO) ship under
`build-resources/`; the README in that directory flags the swap-out
before signed release. electron-builder will fail loudly during a
real signed build if the artwork hasn't been replaced.

`sharp` joins `electron` and `electron-updater` in
`optionalDependencies`; the comment-optional-deps explainer in
`package.json` calls out the rationale (CI doesn't drag native binaries
into every test run).

What's externally blocked (with placeholders ready):

- **Apple Developer account** ($99/year) — populate `APPLE_ID` /
  `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` / `MAC_CSC_LINK` /
  `MAC_CSC_KEY_PASSWORD` secrets and the next tagged release auto-signs.
- **Windows EV cert** ($300/year + hardware token) — populate
  `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` secrets.
- **Real icon artwork** — replace the 1×1 placeholders in
  `build-resources/`.

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

### Added — Phase 2.3b.6.2: Main-process sharp encoder (2026-04-24)

`editor-desktop/src/main/variant-encoder.ts` ships the encoder
side of variant generation — the natural pair to today's planner
(2.3b.6). Lives in the main process because the renderer is
sandboxed and `sharp` is a native binding to libvips with
platform-specific binaries.

`sharp` is in `optionalDependencies` so CI doesn't drag libvips
into every test run. `loadSharp()` lazy-requires the module and
returns `null` when missing (catches both `MODULE_NOT_FOUND` and
the bindings.gyp / libvips load errors that show up on platforms
sharp's prebuilds don't cover). `encodeVariants` then resolves
with `{ ok: false, reason: 'sharp-not-installed' }` so the
editor can show a clear "install sharp to enable variant
generation" message rather than crash.

The encoder pipeline per entry:

```
sharp(sourceBytes)
  .resize({ width: maxWidth, withoutEnlargement: true })  // skipped if maxWidth null
  .<format>({ quality })                                   // webp or avif
  .toBuffer({ resolveWithObject: true })                   // bytes + width + height
```

`withoutEnlargement: true` ensures we never up-scale a small
source to the preset's `maxWidth` — that produces blurry output
with no quality benefit.

Per-entry failures are collected into `result.errors` rather
than thrown, so one corrupt source doesn't sink a multi-image
encode. Missing-source entries (renderer's plan references a
path not in the bytes map) are flagged the same way.

`manifestVariantsProjection(results, plan)` turns encoder output
into manifest §17.2 entries — sorted alphabetically by path for
stable content-hashing across saves.

10 vitest cases inject a stub `SharpModule` to exercise pipeline
assembly, the resize-skip case, error collection, missing-source
handling, manifest projection, and the not-installed gate. End-
to-end "does sharp actually produce a valid AVIF?" is a Phase
2.3a.6 Playwright responsibility.

Net editor-desktop tests: 282 → 292.

Still open (Phase 2.3b.6.3 follow-up): IPC wiring (renderer →
main plan handoff → writeback), "Generate variants" toolbar
button.

### Added — Phase 2.3b.1 (kernel layer): Pyodide integration scaffolding (2026-04-24)

`editor-desktop/src/renderer/python-kernel.ts` ships the
testable kernel layer that the in-editor "Run cell" UI will sit
on. Three pieces:

- **`PythonKernel` interface** — what the UI talks to. Two
  implementations:
  - `loadPyodideKernel(options?)` — browser-only; lazy-loads
    Pyodide from CDN via a script-tag injection (default
    `cdn.jsdelivr.net/pyodide/v0.26.4/full/`, overridable for
    air-gapped installs). Not exercised in unit tests — gated on
    Phase 2.3a.6 Playwright.
  - `FakePythonKernel` — deterministic in-memory kernel for
    vitest. `setNextResult` / `setNextRaw` / `setNextError`
    queue scripted return values; `history` exposes what the
    editor sent for assertion-by-test.
- **Output-capture parser** — `parseExecutionOutput(rawDict)`
  normalizes the harness's `{stdout, stderr, result,
  display_data, error, duration_ms}` into a uniform
  `KernelResult`. Drops malformed display entries silently
  (Pyodide's display pipeline is lossy on edge cases), assembles
  human-readable error messages from `name + value + traceback`,
  and clamps negative durations to 0.
- **Cell-timeout wrapper** — `withTimeout(promise, ms)` races
  against `setTimeout`; rejects with `TimeoutError` on expiry.
  `timeoutResult(ms)` builds a uniform timeout-status
  `KernelResult` with the message "Pyodide cannot be preempted;
  the interpreter may still be running" — the timeout is
  advisory and the wrapper documents this loudly so downstream
  code doesn't assume hard cancellation.

The Python harness (`PYODIDE_HARNESS`) lives as a string constant
in the same module — small Python wrapper that captures
stdout/stderr buffers, `display_data` from `IPython.display`, and
the last-expression value via an `ast.parse` + split-into-exec-and-
final-eval trick. Returns a JSON-serialisable dict that
`parseExecutionOutput` consumes.

18 vitest cases cover every parser branch (empty, full, error
shape, malformed display dropped, metadata preserved, negative
duration clamped), the timeout helper (resolve/reject/RangeError
on bad input), the timeout-result shape, and FakePythonKernel
playback. Net editor-desktop tests: 264 → 282.

Still open (Phase 2.3b.1.2 follow-up):

- CSP relaxation (`script-src https://cdn.jsdelivr.net` +
  `'wasm-unsafe-eval'`); kept off the default CSP until users hit
  "Run".
- "Run cell" button on `::cell{language=python}` blocks +
  `::output` insertion.
- Manifest `kernels.python.runtime: "pyodide"` declaration.

### Added — Phase 4.5.3: delta-snapshots-v1 conformance fixtures (2026-04-24)

`tests/conformance/history/` now ships archive-level fixtures
that exercise both implementations against the spec. Five
fixtures cover the spec's "Constraints + errors" matrix:

- `linear-chain` (positive) — base + 2 deltas; the happy path,
  asserting all three versions reconstruct byte-equal to the
  declared expected files.
- `branching-chains` (positive) — two chains in one index, each
  with its own base + delta; pins the multi-base support the spec
  allows for capping chain depth.
- `circular` (negative) — A→parent=B, B→parent=A; pins the spec's
  "Readers MUST detect and reject" rule.
- `missing-parent` (negative) — delta references a parent not in
  the chain; pins the spec's "validation error" requirement.
- `duplicate-version` (negative) — same `version` declared twice
  in one chain; pins parse-time deduplication.

`run_history_conformance.js` walks every fixture, classifies it
positive/negative based on `expected.json`, and runs the
appropriate assertions against the CLI's
`cli/src/lib/snapshots.js`. The TypeScript impl ships its own
24-case unit suite that pins the same algorithm; both
implementations passing the same expectations means the spec's
two reference impls agree.

A real bug surfaced while regenerating the fixture patches:
`generateUnifiedDiff` was emitting `+` lines BEFORE `-` lines
within a substitution hunk (the LCS backtrack visited del first
when tied, which after reversal put add first). Functionally
correct (the applier processes in order, doesn't care), but
violates unified-diff convention and reads weirdly. Fix: prefer
the add branch on tied LCS values during backtrack so the
reversed output puts `-` before `+` per convention.

Wired into the `validate-cli` GitHub Actions job alongside the
existing `verify` and `import-epub` test runs. CI now exercises
the snapshot algorithm at three levels: TS unit suite (24
cases), CLI lib unit suite (23 cases), and archive-level
fixtures (5 fixtures across 3 phases).

### Added — Phase 4.5.2 (writer + CLI): mdz snapshot subcommands (2026-04-24)

Three new CLI subcommands round out Phase 4.5:

- `mdz snapshot create <file> <version>` — adds a new snapshot of
  the archive's `document.md`. First snapshot ever seeds a base
  chain; subsequent snapshots reconstruct the parent (defaults to
  the latest version in the last chain; override with `--parent`),
  diff against the current document, write the patch, and
  update `index.json`. Round-trip verification is on by default
  per the spec's "verify by round-tripping" writer rule — the
  command aborts before writing if the generated patch doesn't
  re-apply to byte-identical output.
- `mdz snapshot view <file> <version>` — reconstructs and prints
  any version from the chain.
- `mdz snapshot list <file>` — prints all chains and their
  versions in tree form.

Implementation lives in `cli/src/lib/snapshots.js` — a CommonJS
port of `packages/mdz-viewer/src/snapshots.ts` plus the
writer-only helpers:

- `generateUnifiedDiff(oldText, newText, oldLabel, newLabel)` —
  LCS-based unified-diff generator. Two-pass hunk grouping (find
  change runs first, pad with context, then merge overlapping
  windows) so adjacent hunks can't produce overlapping line ranges.
- `shouldStartNewChain(parentText, patchText, depth)` — implements
  the spec's "20% of parent" threshold and the
  "approaching depth 50" trigger.
- `addDeltaToIndex(index, opts)` — immutable index mutation
  (deep-cloned input, no surprise side effects).

A real bug surfaced while writing the round-trip tests: my
first-pass hunk grouping extended trailing context by
`contextLines * 2` and could overshoot into the next change's
leading window, producing two hunks whose line ranges overlapped.
The applier rejected those (correctly — overlapping hunks would
double-emit lines). Fix: split the grouping into "find runs" then
"pad and merge if windows overlap," matching how `diffutils`
actually behaves.

23 new node:test cases — every parse error branch (mirrored from
the TS suite for parity), `shouldStartNewChain` thresholds,
`addDeltaToIndex` immutability, and seven `generateUnifiedDiff`
round-trip cases (single-line replace, insert, delete,
multi-distant-changes, identical-input header-only patch, no-
trailing-newline preservation, and explicit-label headers with no
`a/`/`b/` prefixes per spec).

Net CLI tests: 31 → 54 (the suite now includes
`test/snapshots.test.js` alongside `test/verify.test.js` and
`test/import-epub.test.js`).

End-to-end smoke test verified: seeding a fresh archive →
creating a 1.1.0 delta → reconstructing both 1.0.0 and 1.1.0
returns the original and the modified content, respectively.

### Added — Phase 4.5 (reader): delta-snapshots-v1 reference impl (2026-04-24)

Closes the spec → impl gap that blocked Phase 2.3b.3's
round-trip claim. New module
`packages/mdz-viewer/src/snapshots.ts` ships the reader side of
`spec/extensions/delta-snapshots-v1.md`:

- `parseIndex(raw)` — JSON-parses + structurally validates
  `history/snapshots/index.json`, rejecting wrong extension
  declarations, missing `base` / `base_version` / `parent` fields,
  duplicate delta versions, and empty chains arrays.
- `resolveVersion(index, version, options?)` — locates the chain
  containing `version` and walks backward from it to the base,
  emitting the patch list in forward apply order. Detects circular
  chains (via per-walk `seen` set), missing parents, and chain
  depth above `maxChainDepth` (default 50 per spec).
- `applyUnifiedDiff(source, patch, version?)` — applies a single
  GNU unified-diff patch (the subset `diff -U 3` produces). Driven
  by patch content rather than source-line consumption — trailing
  `+` additions after the last `-`/` ` line in a hunk are correctly
  emitted. Throws `SnapshotError` with the patch line number on
  context mismatch; readers MUST NOT silently return a
  partially-applied document per spec.
- `reconstructVersion` (async) and `reconstructVersionSync` (map-
  backed) — top-level reconstruction. Async variant takes an
  `EntryReader` so the same code runs against JSZip-loaded
  archives, in-memory test fixtures, or the editor's loaded entry
  map.
- `SnapshotError` — strict-error type carrying `version` and
  optional `patchLine` so callers can render targeted diagnostics.

24 vitest cases — every parse error branch, every chain-walk
error path (missing chain, missing version-in-chain, circular,
depth limit), every diff-applier op (insert / delete / replace /
multi-hunk / no-trailing-newline preservation), and three
end-to-end reconstructVersion scenarios.

A real bug surfaced while writing the diff applier tests: my
first-pass loop gated on `consumed < oldCount`, which exited
before processing trailing `+` additions in a hunk. Switched to
patch-content-driven termination (`@@` or end-of-patch), bringing
the algorithm in line with how every other unified-diff applier
behaves.

The block-diff (Phase 2.3b.3) and the snapshot patches use the
same unified-diff format, so a snapshot rebuilt from the chain
feeds straight into `diffBlocks` for the version-comparison UI
when it lands.

What's still open in Phase 4.5: the writer-side `mdz snapshot
create|view|export` CLI subcommand, archive-level conformance
fixtures, and the arXiv-corpus measurement of the 20%
delta-vs-full threshold (gated on the 100-paper run).

Net `@mdz-format/viewer` tests: 117 → 141.

### Added — Phase 2.3b.6 (planner): Image-variant generation planner (2026-04-24)

`editor-desktop/src/renderer/variant-planner.ts` ships the
planning side of AVIF/WebP variant generation. The actual encoder
needs sharp/libvips (a native binary) and the renderer is
sandboxed, so encoding will live in the main process; the planner
is pure and decides *what* to encode without doing the encoding.

Three exports:

- `planVariants(sources, presets?)` — returns one
  `VariantPlanEntry` per `(source, preset)` pair the encoder must
  produce. Handles four skip cases: explicit `skip: true` flag,
  unencodable MIME types (`image/svg+xml`, etc.), already-present
  variants in the archive (idempotent re-runs), and
  self-referential targets (a webp source that would write itself).
- `variantPath(source, preset)` — canonical target path computation:
  `<stem>.<maxWidth>w.<format>` for size-bound variants;
  `<stem>.<format>` for full-size. Width tag goes between basename
  and extension so `*.webp` globs still match.
- `summarizePlan(plan)` — `{ webp, avif }` counts for a status-bar
  widget.

`DEFAULT_PRESETS` ships per-kind presets for figure (webp 1600w +
avif 1600w at q85/q65), icon (webp 256w q90), hero (webp 2400w +
avif 2400w at q80/q60), and inline (webp 1200w q85). Custom
preset overrides via the second `planVariants` argument.

13 vitest cases — every skip branch, custom preset override,
multi-source / multi-kind expansion, and the variantPath edge
cases (no extension, full-size, sized).

Encoder execution + manifest `variants[]` population deferred to
Phase 2.3b.6.2 follow-up; that's gated on the platform-binary
decision (sharp prebuilts vs. WASM-only @squoosh).

Net editor-desktop tests: 251 → 264.

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

### Changed — ROADMAP: Phase 2.3 editor chunked into sub-phases (2026-04-24)

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

**None.** v2.0 is intentionally backward-compatible. A valid v1.1
manifest with `mdx_version` bumped to `2.0.0` is a valid v2.0
manifest.

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

- Python script to generate v1.1 examples
  (`implementations/python/create_v11_examples.py`)

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
  - `create` command - Create new documents from templates
    (blank, article, report, presentation)
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
