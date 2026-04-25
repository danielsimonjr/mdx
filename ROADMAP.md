# MDZ Roadmap

> **Status:** This project is being renamed from **MDX** to **MDZ** (Markdown Zipped).
> The current name collides with the React ecosystem's MDX (Markdown + JSX),
> which has a massive install base and dominates search results for "MDX file format."
> While deployed usage is effectively zero, it's the cheapest possible time to rename.

> **Posture:** MDZ is an **experimental research project** until at least one
> external organization publishes in the format. Every feature the editor and
> viewer ship targets "professional-grade UX" (polished, keyboard-first,
> accessible, fast) — the "experimental" label is about *format maturity*, not
> about tooling quality. Do not pitch the format as production-ready; do pitch
> the tooling as best-in-class.

> **Positioning:** MDZ is the **native file format for executable scientific
> papers.** It replaces the duct-tape stack of `.ipynb` + Overleaf + `.zip` of
> supplementary materials with one signed, content-addressed archive that
> renders in any browser, validates reproducibility, and preserves provenance.
> Every feature in this roadmap is evaluated against that niche.

> **Competitive landscape (named, not ignored).** We are not first. Competitors
> include **Quarto** (Posit-backed, used by Nature journals, CLI-first, best
> reproducibility story today), **Jupyter Book / MyST** (Executable Books
> project, strongest community, weakest signing/provenance), **Curvenote**
> (YC-backed, arXiv-partnered, closest to this niche, proprietary backend),
> **Manubot** (git-first academic writing, weak on interactivity), and
> **Stencila** (dormant but influential). MDZ differentiates on: one
> self-contained archive (vs. Quarto's build artifacts), signed provenance
> chain (vs. Jupyter Book), open format (vs. Curvenote), and ZIP-container
> portability (vs. everyone). Before Phase 2 ships anything, section
> `docs/COMPETITIVE.md` must exist and be kept current — if a competitor
> shipped what we're planning, we cut the feature.

This document consolidates the strategic review completed 2026-04-24 (including
independent review on the same date) into an actionable plan. It's organized in
dependency order — each phase unblocks the next except where marked "rolling."

---

## Guiding principles

1. **Executable scientific papers first.** Every feature is evaluated against
   the question "does this serve an author submitting a reproducible paper?"
2. **Narrow the scope.** Win the scientific-paper niche before broadening.
3. **Viewer-first.** A format without a great viewer has no users.
4. **Interoperability via conformance tests**, not hope.
5. **Formal grammar, not prose.** Two implementers should never silently disagree.
6. **Inherit, don't reinvent.** EPUB solved the container problem; bridge to it.
7. **Be honest about status.** Experimental until proven otherwise.

---

## Phase 0 — Rename and reposition (2–4 weeks)

The rename is a strict blocker for everything downstream. Every other milestone
assumes the new name is in place so we don't have to re-brand docs/URLs/tests twice.

### 0.1 Rename MDX → MDZ

- [ ] Repo rename `danielsimonjr/mdx` → `danielsimonjr/mdz` (GitHub preserves redirect) — **verified 2026-04-24: still at mdx.git**
- [x] File extension `.mdx` → `.mdz` (keep `.mdx` as a read-only alias during transition) — writers emit `.mdz`, readers accept both through 2027-01-01 per CLAUDE.md policy
- [x] MIME type `application/vnd.mdx-container+zip` → `application/vnd.mdz-container+zip` — both declared; readers accept both
- [ ] All directory names: `/mdx/**` → `/mdz/**` — **deferred:** CLAUDE.md Repository Structure notes repo root is still `mdx/` and source files still `mdx_format.{ts,py}`; churn cost too high for one PR, scheduled for Phase 1 parser-rebuild landing
- [x] All class/type names: `MDXDocument` → `MDZDocument`, `MDXManifest` → `MDZManifest`, etc. — 53 `MDZDocument`/`MDZManifest` references in `mdx_format.ts`; `MDX*` aliases retained through 2027-01-01
- [ ] npm package name reservation (if published): `@mdz-format/core`, `@mdz-format/viewer` — external action, not verified
- [ ] Domain: move spec to `mdz-format.org` (keep old domain redirecting) — external action
- [ ] Spec title: "Markdown eXtended Container" → "Markdown Zipped Container" — **verified 2026-04-24: spec/MDX_FORMAT_SPECIFICATION_v2.0.md line 1 still reads "MDX Format Specification"**
- [x] Update `CLAUDE.md`, `README.md`, `CHANGELOG.md`, all agent-facing docs — README leads with "MDZ Format / Markdown Zipped Container"; STATUS banner at README:11; CLAUDE.md Phase 4.6 tree current; CHANGELOG v2.0 block wrapped
- [ ] Grep-pass: `grep -rIn 'mdx' .` — audit every remaining reference — tracked in Phase 4.6.4; deliberately scoped to exclude the deferred-rename paths

**Migration policy for existing `.mdx` archives:** readers MUST accept either
extension and either MIME type through 2027-01-01, after which `.mdx` becomes
unsupported in writers but still parseable by readers.

### 0.2 Scope narrowing — executable scientific papers

**Who we serve:** researchers (grad students, postdocs, faculty, lab PIs)
submitting preprints to **arXiv, bioRxiv, chemRxiv, Zenodo, OSF, medRxiv**
(SSRN dropped — Elsevier-owned, PDF-centric, wrong fit for reproducibility)
who currently duct-tape together:

- `.tex` or `.docx` for the manuscript
- `.ipynb` for code and plots
- separate `.zip` of supplementary data
- an ORCID profile for identity
- a DOI minted post-hoc via Crossref / DataCite

MDZ collapses all of this into one signed, content-addressed, reproducible
archive. Every v2.0 feature maps to a concrete scientific-paper need:

| Feature | Scientific-paper use case |
|---------|--------------------------|
| `::cell` + kernels | Figures regenerate from source data; reviewers re-run analyses |
| Content-addressed IDs | Permanent citation hash, independent of URL |
| Multi-signature | Author + corresponding-author + reviewer + journal editorial board |
| DIDs | `did:web` resolving to an ORCID record or an institutional ROR page — no unregistered DID methods invented |
| Provenance (`derived_from`) | Preprint → revised → published version chain |
| Accessibility | WCAG 2.1 AA baseline (the level most OA journals reference); WCAG 2.2 AA opt-in |
| Multi-locale | Journals publishing in a local language + English |
| `::include` | Shared methods sections, reusable boilerplate across papers |
| Profiles (`scientific-paper-v1`) | Journals enforce structural requirements |
| History DAG | Peer-review round-trips; preprint-vs-published diffs |

**Scientific-paper deliverables this niche requires (added per review —
these are not optional for journal acceptance):**

- [x] **JATS-XML bridge** — `mdz export-jats` ships in Phase 2 as
      `cli/src/commands/export-jats.js`. Handles front matter (title,
      authors with did:web→ORCID, abstract, keywords, license), body
      (headings, paragraphs, lists, tables, code, images, inline math),
      back (CSL-JSON references), and supplementary-material linking
      back to the MDZ. The reverse direction `jats-to-mdz` remains
      planned. PubMed
      Central, Crossref deposit, and every mainstream journal ingest pipeline
      runs on JATS 1.3. Without this path, MDZ can be authored but cannot be
      published in any mainstream journal. Position this at Phase 2 priority
      alongside the EPUB bridge.
- [x] **CSL / bibliography support — spec + viewer impl ship.**
      `spec/directives/references-csl.md` defines the format;
      `packages/mdz-viewer/src/{directives,references}.ts` ship the
      runtime. Loads `references.json` from archive root (accepts both
      CSL-JSON array form AND id-keyed object form per Zotero
      convention). `::cite[key]` renders `(Author Year)` /
      `(Author1 & Author2 Year)` / `(Author1 et al. Year)` per
      chicago-author-date. Multi-key cites group with semicolons.
      `::bibliography` emits an ordered list of cited references in
      citation order (uncited refs omitted, matching pandoc-citeproc).
      Anonymous works render with title-leading. Missing keys surface
      as visible `[?key]` markers. `manifest.content.citation_style`
      typed at the viewer's manifest layer; unknown styles fall back
      to chicago-author-date with a console warning.
- [x] **Figure, equation, table numbering + cross-references** —
      grammar + parser + **viewer rendering** all ship. Viewer pipeline
      adds `packages/mdz-viewer/src/directives.ts` (two-pass id collect
      + substitution) + `references.ts` (minimal CSL chicago-author-date
      renderer). `::fig{id=}` / `::eq{id=}` / `::tab{id=}` auto-number
      sequentially per kind; `::ref[id]` resolves to the target's label
      ("Figure 1", "Equation 1", "Table 1"); missing refs render as
      visible `[?id]` markers (spec-compliant "visible miss"). 24
      directive tests + 10 references tests, 72/72 viewer tests pass,
      `tsc --noEmit` clean.
- [x] **DOI minting integration** — `docs/for-authors/DOI.md` ships with
      Zenodo / OSF / Crossref / arXiv workflows, versioned-DOI pattern,
      DataCite `relationType` PascalCase convention.
- [x] **Peer-review annotation spec** — `spec/directives/peer-review-annotations.md`
      (v2.1 draft) extends the v2.0 Web Annotation layer with `role`
      (author/reviewer/editor/reader) + four review-specific motivations
      + attributable-vs-pseudonymous identity trade-off.
- [x] **SPDX licensing metadata** — `spec/manifest-v2.schema.json:197-211`
      declares `license` as `string | {type, url}` with SPDX-identifier
      description; Rust binding mirrors via `License::Spdx(String) |
      Structured { kind, url }`. Python / TS generators emit the field
      on new archives. The separate `document.license.spdx` dedicated
      key was rejected as redundant — the SPDX id IS the string (or
      the `type` field), which is what OA-compliance tools key on.
- [x] **`.ipynb` → MDZ migration path** — `mdz import-ipynb` ships as
      `cli/src/commands/import-ipynb.js`. Cells → `::cell`; outputs
      (stream/display_data/execute_result) → `::output` with
      documented
      MIME-bundle → `::output` mapping (text/plain, image/png, application/json,
      application/vnd.jupyter.widget-state+json → warning), metadata round-trip
      for `kernelspec` / `language_info`, cell-level execution_count
      preservation. This is the #1 adoption on-ramp.

**General-purpose deliverables:**

- [x] `docs/POSITIONING.md` — ships
- [x] `docs/COMPETITIVE.md` — ships (rolling comparison vs Quarto, Jupyter Book, Curvenote, Manubot, Stencila)
- [x] `docs/for-authors/SUBMITTING.md` — ships
- [x] `docs/for-journals/EDITORIAL.md` — ships
- [x] `docs/for-reviewers/REPRODUCING.md` — ships
- [x] `spec/profiles/scientific-paper-v1.json` — ships (tightening against IMRaD / citation formats / DOI handling is a v2.1 iteration target)
- [ ] **Phase 0 exit criterion (revised):** previous version required an
      external editor to bless a format that doesn't exist yet — a deadlock.
      Revised gate:
      (a) one real paper converted end-to-end from ipynb+tex to MDZ that renders
          correctly in the viewer prototype;
      (b) one published comparison against Quarto and Curvenote showing concrete
          differentiators;
      (c) cold outreach to ≥20 journal editors / preprint server engineers
          documenting responses (even "no interest" is acceptable — the deliverable
          is the *data*, not the endorsement).
      Phase 1 can start the moment (a) ships; Phase 2 requires (b) + (c).
- [x] Update `README.md` to lead with the scientific-paper use case — leads with "MDZ Format / Markdown Zipped Container — executable scientific papers".
- [x] `STATUS: experimental research project` banner — present at `README.md:11` with the "tooling pro-grade; format not production-stable" framing.

### 0.3 Extract enterprise features to extension profile

The v2.0 spec bundled too much. Core stays minimal; advanced features move out.

- [x] Create `spec/profiles/mdz-advanced-v1.json` — ships (JCS, multi-sig, DIDs, revocation, content-hash aliases, provenance DAG).
- [x] Core spec keeps: v1.1 alignment + attributes, `::cell` + `::output` + `::include`, basic accessibility, simple signatures, basic i18n — spec body reflects this scoping.
- [x] Add conformance levels: **Core** (required) / **Advanced** (opt-in) — `mdz validate --profile <id>` enforces profile-level requirements. Built-ins: `mdz-core`, `mdz-advanced`, `scientific-paper-v1`, `api-reference-v1`. Profile-required manifest fields surface as Errors; recommended fields surface as Warnings; required extensions checked against `content.extensions[]`.

---

## Phase 1 — Formal foundations (6–8 weeks)

### 1.1 Write a formal grammar

The current prose spec is why two implementers can silently disagree on edge
cases (nested containers + backticks + quoted attrs, Unicode normalization,
etc.). Replace it.

- [x] Define the block-attribute + directive grammar in ABNF (RFC 5234 style) — ships at `spec/grammar/mdz-directives.abnf`.
- [x] Provide a PEG grammar — ships at `spec/grammar/mdz-directives.lark` (Lark PEG, not `.pegjs`; the filename deviates from the roadmap because the Python parser consumes it directly; functionally equivalent for porting to peg/ohm/tree-sitter).
- [x] Publish a tree-sitter grammar `tree-sitter-mdz` — alpha ships at `tree-sitter-mdz/grammar.js`.
- [x] Remove the prose grammar from the spec body; keep only ABNF + examples — verified 2026-04-24: zero `ABNF`/`EBNF`/grammar-section headings in `spec/MDX_FORMAT_SPECIFICATION_v2.0.md`, `_v1.1.md`, or the v1.0 spec. Directive examples are present (illustrative); the formal grammar lives only in `spec/grammar/mdz-directives.abnf` + `.lark`.

### 1.2 Rebuild the reference parser

Current `alignment_parser.py` is ~25 ad-hoc regexes. Replace with a proper AST parser.

- [x] New Python parser built on Lark (PEG) — ships at `implementations/python/mdz_parser/` (parser.py / ast.py / errors.py).
- [ ] New TypeScript parser built on Chevrotain (TypeScript-friendly PEG) — **verified absent 2026-04-24**: zero `chevrotain` references in `implementations/` or `spec/`. Tracked in Phase 4.6.4 with a recommended downgrade (keep the regex-based legacy parser in TS until Phase 2.3 editor needs a real one).
- [ ] Retire the regex-based parser; keep it only as a fallback for malformed input — Lark is the primary; `--legacy` fallback is unverified.
- [ ] Retire `basicMarkdownToHTML` in `mdx_format.ts` — **verified 2026-04-24**: function still present at `implementations/typescript/mdx_format.ts:3363`, now deprecated with a `console.warn` but not removed. Phase 4.6.4 documents this.

### 1.3 Conformance test suite

The single highest-leverage investment for interoperability.

- [x] Create `tests/conformance/` with fixtures organized by category — ships with 52 fixtures across positive/negative/roundtrip/edge (roadmap target was ~200; current suite is the minimum-viable pack, room to grow).
- [x] Each fixture has a `.expected.json` — verified 52/52 coverage on 2026-04-24.
- [x] CI job runs the full suite — `validate-v20-examples` in `.github/workflows/ci.yml` runs `tests/conformance/run_conformance.py`.
- [ ] Cross-implementation test: Python writes, TypeScript reads, byte-compare the AST. Same for TS→Py. — **Rust↔TS** parity harness shipped in Phase 4.6.2 (`tests/parity/rust_ts_manifest_parity.py`); the specific **Py↔TS** direction the roadmap calls for is still pending.

### 1.4 Fuzz + property-based testing

Previous version named `atheris` and `jazzer.js` — both effectively unmaintained
as of 2024 (Google archived atheris; Code Intelligence wound down jazzer.js).
Use actively-maintained tooling instead:

- [x] **Python:** `hypothesis` — ships at `tests/property/test_parser_properties.py`; CI runs it in the v2.0 job.
- [x] **TypeScript:** `fast-check` — ships at `implementations/typescript/mdx_format.property.test.ts`; CI runs it in the TypeScript Unit Tests job.
- [x] CI job property tests — CI runs property tests on every PR (v2.0 job has a dedicated step).
- [x] Corpus seeded from the conformance suite — `tests/property/test_parser_properties.py` loads every `.md` under `tests/conformance/{positive,edge,roundtrip}/` at module import (`CONFORMANCE_SEEDS`) and feeds them via `@example` to `test_parser_never_crashes_on_random_input`. Hypothesis starts from known-valid fixtures and mutates outward.

### 1.5 Content-addressing: evolve, don't restart

The v2.0 spec already ships `content_hash` with `sha256:` / `sha512:` / `blake3:`
algorithms and the `assets/by-hash/sha256/<hex>` alias path (spec §9.2, §9.3,
§10.3). Previous roadmap draft called this "half-done" — wrong, it's shipped.

The real questions for v3.0 (not v2.x):

- [x] `assets/by-hash/` byte-duplication decision — resolved in
      `docs/decisions/content-addressing-evolution.md` Q1: defer to v3.0;
      option (c) manifest-alias-table is the preferred evolution.
- [x] multihash + CIDv1 adoption decision — resolved in same doc Q2:
      rejected. Scientific-paper preservation stack (Zenodo / OSF / arXiv /
      BagIt / OAI-PMH) is not CID-aware.
- [x] Louder `checksum` → `content_hash` deprecation — ships: spec §9.3.1
      paragraph, `@deprecated` JSDoc tag on `MDXAssetEntry.checksum`,
      `warnings.warn(DeprecationWarning)` in Python `compute_checksum`,
      new `compute_content_hash()` as the silent replacement.

---

## Phase 2 — Adoption enablers (18–24 months, not 12–16 weeks)

The previous "12–16 weeks" target for this phase was wrong. A web component
viewer alone is a 3-month build; a hosted service another month; the editor
MVP (stripped down, see 2.3) is 4–6 months; EPUB bridge is 2 months; universal
extension is 2 months. Sequenced with realistic parallelism for a small team
(3–5 people): **18 months minimum, 24 months realistic.** With a solo
maintainer, double it.

**Sequencing within Phase 2 (dependency-ordered):**
1. 2.1 viewer (blocks 2.2, 2.3, 2.5)
2. 2.2 hosted rendering (blocks nothing but gates adoption growth)
3. 2.3a editor MVP (blocks 2.3b)
4. 2.4 EPUB bridge (independent, can run parallel)
5. 2.5 browser extension (depends on 2.1)
6. 2.3b editor Pro features (depends on 2.3a and real author feedback)

### Status snapshot (2026-04-24)

| Sub-phase | State | What landed | What's pending |
|-----------|-------|-------------|----------------|
| 2.1 viewer | **partial** | sanitizer (38 tests), directives (cross-refs / citations / bibliography / `::cell` / `::output` / `::include`, 46 tests), CSL-JSON references (10 tests), KaTeX math (13 tests), **IndexedDB cache** (10 tests). 117/117 viewer tests pass. | full keyboard a11y, npm publish, demo site, fragment-aware `::include` |
| 2.2 hosted | **code-ready, not deployed** | full Cloudflare Worker with strict CSP, content-hash cache pinning, OG / Twitter card meta, sanitized canonical URLs, 32 worker tests | `wrangler deploy` to view.mdz-format.org (external action), per-archive cover-image extraction |
| 2.3a editor MVP | **chunked, not started** | (none — see 2.3a.1 through 2.3a.6 below for the new chunking) | All sub-phases |
| 2.3b editor Pro | **chunked, not started** | (none — see 2.3b.1 through 2.3b.7 below) | All sub-phases |
| 2.4 EPUB bridge | **shipped** | `mdz export-epub` (existing) + `mdz import-epub` (new, 15 tests, fidelity matrix doc); round-trip CI gate | Symmetric `::fig` round-trip on the export side (tracked); per-chapter spine preservation |
| 2.5 browser ext | **code-ready, hardened** | MV3 manifest, content + service-worker + popup + viewer scripts, 13 manifest-validation tests, reproducible-build doc, placeholder icons | Real icon artwork, bundled `<mdz-viewer>`, AMO / Chrome Web Store / Edge / Brave submissions |

### 2.1 `<mdz-viewer>` web component — *the* highest-impact deliverable

Without a great viewer, no one authors MDZ.

**Realistic size budget** (previous "50KB gzipped" target was wrong — KaTeX
alone is ~75KB gzipped without fonts, JSZip is ~40KB gzipped, highlight.js
core is ~30KB gzipped):

- Core shell (parse + render markdown + layout + ARIA): **target ≤80KB gzipped**
- Math (KaTeX): lazy-loaded on first `$...$` or `::eq`, ~75KB gzipped
- Syntax highlighting: lazy-loaded on first fenced code block, ~30KB gzipped
- Archive loading (JSZip or fflate — prefer fflate, ~8KB gzipped): bundled
- **Total first paint for text-only documents: ≤90KB gzipped**
- **Total fully loaded with math+code+video: ≤250KB gzipped**

Deliverables:

- [ ] Framework-agnostic web component with shadow DOM isolation
- [x] Handles: CommonMark + GFM (via `marked`) + **math (KaTeX
      pre-marked transform, HTML output, ARIA-labeled wrappers)** +
      images + video + audio (existing) + alignment/attributes
      (existing) + alt-text + ARIA + **cross-references (`::ref`)** +
      **citations (`::cite`)** + **`::bibliography`** + **`::cell`**
      (with class-token language / kernel / execution_count metadata
      + ARIA description) + **`::output`** (text / stream / image
      forms; image emits sanitizer-resolvable `<img>`) +
      **`::include`** (archive-aware: archiveEntries threaded into
      `processDirectives`; recursive resolution with cycle detection
      + depth cap of 10; external URLs require `content_hash` per
      spec §12; missing targets render as visible-miss markers;
      fragment attribute flagged as unsupported in v0.1). 107 / 107
      viewer tests pass.
- [x] Offline-first: uses IndexedDB for archive caching —
      `packages/mdz-viewer/src/archive-cache.ts` ships with two
      backends: `IndexedDBArchiveCache` (browser) and
      `InMemoryArchiveCache` (Node / Worker / tests). Auto-selected
      via `defaultArchiveCache()`. URL-keyed (the URL acts as a
      synonym for the bytes for hash-pinned archives; for unpinned
      URLs a 1-hour default TTL keeps the cache correct against
      author updates). Quota / fetch failures degrade silently —
      cache is a perf optimization, not a correctness requirement.
      `loadArchive(url, { cache })` consumes it; pass `cache: null`
      to opt out. 10 vitest cases including a real fetch-stub
      round-trip that asserts second-load skips the network call.
- [ ] Accessible by default: full keyboard navigation, screen-reader tested,
      **WCAG 2.1 AA baseline** (raises to 2.2 AA opt-in — 2.1 is what OA journals
      currently reference)
- [ ] Published to npm as `@mdz-format/viewer` (assumes `@mdz-format` scope is
      reserved during Phase 0.1; if unavailable, fall back to `@mdz-core/viewer`)
- [ ] Demo site: drop an `.mdz` file into `viewer.mdz-format.org`, get rendering

### 2.2 Hosted render-any-MDZ service

- [ ] Deploy `view.mdz-format.org?url=<archive-url>` — code is
      production-ready at `packages/mdz-viewer-hosted/src/worker.ts`;
      external action (`wrangler deploy` + DNS) needed to go live.
- [x] Serverless rendering — Cloudflare Worker code ships with strict
      CSP (Trusted Types required, no `unsafe-eval`, `object-src
      'none'`), Permissions-Policy disabling FLoC + sensors,
      Referrer-Policy `strict-origin-when-cross-origin`, HTTPS-only
      archive URLs (control characters and dangerous schemes refused
      upfront), CORS preflight, /healthz endpoint, /robots.txt with
      embed disallow. 32 vitest cases cover routing + security
      headers + URL safety + cache behavior + OG meta sanitization.
- [x] CDN cache with content-hash keys — `cacheControlFor(url)` emits
      `max-age=31536000, immutable` when `?content_hash=` is present,
      `max-age=300, stale-while-revalidate=86400` otherwise. `Vary:
      Accept` on every HTML response so a future JSON variant doesn't
      collide.
- [x] Social-share preview meta — full OG / Twitter card meta on
      every page. Description varies for landing vs archive-rendering
      pages. `og:url` uses a sanitized canonical URL that drops
      refused-input query params (won't echo `javascript:` payloads
      into search-engine indexes / social preview snapshots).
      Per-archive cover-image extraction (preview-time fetch + parse
      manifest) is a Phase 2.2 follow-up.

Goal: anyone can put `.mdz` in GitHub and share a rendering link. Removes the
"no users because no viewer" chicken-and-egg.

### 2.3a Desktop editor MVP (4–6 months aggregate, broken into ~10 session-sized chunks)

The first editor ships only what's *required* to produce a publishable paper.
"Adobe Acrobat-class" is the long-term target (see 2.3b), not what v1.0 is.

**Chunking model.** The original "4–6 months" estimate is the *aggregate* — the
work itself splits cleanly into independent chunks that can land one or two per
session. Each numbered sub-phase below has explicit dependencies, an acceptance
test, and a scope that fits in a session-or-two of focused work. The
**MVP milestone** lands when 2.3a.1 through 2.3a.4 plus any one picker from
2.3a.5 ship — at that point a grad student can author a reproducible paper
end-to-end and export it to a journal as JATS-XML.

#### 2.3a.1 Editor shell foundation

- [ ] Electron app skeleton at `editor-desktop/` with main + renderer
      processes split, contextIsolation: true, sandbox: true on the
      renderer.
- [ ] Vite dev server + production build for the renderer.
- [ ] IPC channel for "open archive / save archive" (renderer asks
      main; main does the disk I/O so the sandboxed renderer never
      touches `node:fs` directly).
- [ ] `electron-updater` plumbing (NOT raw Squirrel.Windows —
      effectively unmaintained; `electron-updater` targets NSIS and
      Squirrel.Mac through one API).

  **Acceptance:** `npm run dev` opens an Electron window with a
  Vite-served React/Lit renderer, a "File → Open" menu that round-
  trips an `.mdz` through the main process, and an `electron-updater`
  no-op feed wired to a static-stub URL.

#### 2.3a.2 Source editor + live preview

- [ ] CodeMirror 6 in the renderer with the Markdown language pack
      and the project's spec-defined syntax extensions (`::cell`,
      `::include`, etc., highlighted via the `tree-sitter-mdz`
      grammar already shipped at Phase 1.1).
- [ ] `<mdz-viewer>` web component embedded in a split pane —
      direct reuse of `packages/mdz-viewer/`, no fork.
- [ ] Two-way sync: edits in CodeMirror flow to the viewer with a
      150 ms debounce; viewer scroll position pinned across re-render.
- [ ] Toggle: source-only / preview-only / split (default).

  **Depends on:** 2.3a.1.
  **Acceptance:** typing in the source pane re-renders the preview
  in <300 ms for a 50 KB document; scroll position survives the
  re-render.

#### 2.3a.3 Asset sidebar

- [ ] Drag-drop zone that accepts files and stages them into the
      open archive's in-memory entries map.
- [ ] On save: compute SHA-256 (Web Crypto API) for each new asset,
      populate `manifest.assets[type][].content_hash`, and emit the
      ZIP via `fflate` through the main-process IPC.
- [ ] Tree view of `assets/images`, `assets/data`, etc., with
      delete + rename.

  **Depends on:** 2.3a.1 (IPC) + 2.3a.2 (renderer state model).
  **Acceptance:** dropping a PNG into the sidebar produces a
  `manifest.assets.images[]` entry with a correct `content_hash`,
  visible in `mdz info` after save.

#### 2.3a.4 `.ipynb` import flow

- [ ] "File → Import → Jupyter notebook" menu item invokes the
      existing `cli/src/commands/import-ipynb.js` via main-process
      shell-out (NOT in-renderer because it spawns child processes
      for kernel inspection).
- [ ] Imported MDZ opens in the editor immediately for further
      authoring.

  **Depends on:** 2.3a.1.
  **Acceptance:** a representative `.ipynb` from the
  `tools/corpus-fetcher` test corpus imports to a syntactically
  valid `.mdz` that opens in the editor without errors.

#### 2.3a.5 Visual-authoring picker pack — `::cell`, `::include`, `::fig`, `::cite`

Each picker is its own session-sized chunk. Sequencing within the
chunk is bottom-up (insertion engine first, individual pickers
second).

- [ ] **2.3a.5.0 — Directive insertion engine.** A small CodeMirror
      command API that places a directive at cursor with cursor
      positioned at the first attribute. Used by every picker below.
- [ ] **2.3a.5.1 — `::cell` picker.** Modal: language dropdown
      (Python / R / Julia / JS), kernel field, optional
      `execution_count`. Inserts a complete `::cell{...}` block plus
      a fenced code shell.
- [ ] **2.3a.5.2 — `::include` picker.** Modal: target (with
      autocomplete on the open archive's entry list), optional
      `fragment`, optional `content_hash`.
- [ ] **2.3a.5.3 — `::fig` / `::eq` / `::tab` picker.** Modal: kind
      (radio), id (with collision check against already-defined ids
      in the document), title.
- [ ] **2.3a.5.4 — `::cite` picker.** Modal: dropdown / search
      against `references.json` keys (when present), multi-select,
      optional locator (`prefix`, `suffix`).

  **Depends on:** 2.3a.2 (CodeMirror) for all five.
  **Acceptance per picker:** clicking the toolbar button + filling
  the modal inserts a syntactically valid directive, and the
  preview pane re-renders it correctly within the same debounce.

#### 2.3a.6 Release engineering

- [ ] Code-signed installers for macOS (notarized DMG), Windows
      (signed NSIS via `electron-updater` flow), Linux (AppImage +
      `.deb` + `.rpm`).
- [ ] Auto-update feed served from GitHub Releases.
- [ ] CI build matrix that produces all three platforms on every
      tagged release.

  **Depends on:** 2.3a.1.
  **External-blocked:** macOS notarization requires an Apple
  Developer account ($99/year); Windows EV cert signing requires
  hardware token + ~$300/year cert. Reuse signing infra from the
  MermaidJS desktop project.
  **Acceptance:** a tagged release produces three signed installers
  in GitHub Releases that auto-update each other on subsequent
  tags.

### 2.3b Editor Pro features (6–12 months aggregate, 7 independent chunks)

Only build these after the MVP has real users and feedback. Each chunk
is independent — sequence by user demand, not by checklist order.

#### 2.3b.1 Pyodide kernel execution

- [ ] In-renderer Pyodide bootstrap (lazy-loaded only when a user
      first runs a Python `::cell`).
- [ ] Output capture: stdout / display_data / execute_result →
      `::output` blocks with the correct `type`.
- [ ] Cell timeout (default 30 s, configurable) so a runaway cell
      doesn't lock the editor.

  **Honest caveat:** Pyodide is ~10 MB download, supports most
  pure-Python plus the curated C-extension wheels in the Pyodide
  distribution (numpy / scipy / matplotlib / pandas all work).
  Arbitrary `pip install` does NOT work for compiled wheels;
  TensorFlow / PyTorch do not run in Pyodide. Reviewers get
  "re-execute most cells", not "re-execute any cell".
  **Depends on:** 2.3a.2.

#### 2.3b.2 Accessibility checker

- [ ] In-editor pa11y-equivalent that runs the `tests/accessibility/`
      rule set against the rendered preview on save.
- [ ] Issues panel listing each violation with rule + WCAG
      reference + jump-to-source.
- [ ] Export WCAG 2.1 AA / 2.2 AA compliance report as a sidecar
      JSON for journal submission.

  **Depends on:** 2.3a.2 + the Phase 3.3 fixture pack (currently
  23/50 fixtures).

#### 2.3b.3 Block-level diff view

- [ ] Compare current draft against any version in
      `history/snapshots/`.
- [ ] Block-level diff (paragraph / heading / cell / output as
      atomic units) with line-level fall-back inside changed blocks.
- [ ] Round-trip with the Phase 4.5 `delta-snapshots-v1` extension
      so diffs and patches use the same algorithm.

  **Depends on:** 2.3a.2 + Phase 4.5 implementation (currently
  spec only).

#### 2.3b.4 Peer-review annotation layer

- [ ] Sidebar UI for the annotation tree (per
      `spec/directives/peer-review-annotations.md` — already
      shipped).
- [ ] Comment / reply / accept / reject flows that create / update
      `annotations/<uuid>.json` entries.
- [ ] Reviewer identity surfaced via the signed-DID model
      (`docs/security/SIGNATURE_TRUST.md`); `--role=public|editor`
      flag for confidential-comment visibility per spec.

  **Depends on:** 2.3a.2 + signature integration.
  **NOT a real-time collaboration feature.** Asynchronous threaded
  comments only — the no-real-time-collab non-goal still holds.

#### 2.3b.5 Multi-locale side-by-side editing

- [ ] Two CodeMirror editors stacked horizontally, each bound to
      one of `manifest.content.locales.available[]`.
- [ ] Sync-scroll between panes (paragraph-aligned).
- [ ] "Add locale" command that creates a new
      `document.<lang>.md` entry pre-populated from the current
      pane.

  **Depends on:** 2.3a.2.

#### 2.3b.6 AVIF / WebP variant generation

- [ ] On image add: spawn the main-process `sharp` (or
      `@squoosh/lib`) to produce AVIF + WebP siblings.
- [ ] Populate `manifest.assets.images[].variants[]` per spec
      §17.2.
- [ ] Configurable quality presets per image kind
      (figure / icon / hero).

  **Depends on:** 2.3a.3 (asset sidebar).

#### 2.3b.7 Non-core directive picker pack

- [ ] **2.3b.7.1 — `::video` picker** (src + poster + tracks).
- [ ] **2.3b.7.2 — `::audio` picker.**
- [ ] **2.3b.7.3 — `::model` picker** (glTF / GLB).
- [ ] **2.3b.7.4 — `::embed` picker** (PDF).
- [ ] **2.3b.7.5 — `::data` picker** (CSV/JSON viz config).

  **Depends on:** 2.3a.5.0 (insertion engine).

**Pro milestone:** feature parity with Quarto authoring + basic
Jupyter editing. *Not* parity with InDesign or Acrobat Pro. Those
are not the competition.

### 2.4 EPUB ↔ MDZ bridge

Inherit EPUB's ecosystem (Calibre, readium.js, iBooks, Kindle, every ereader)
for documents that don't need cells.

- [x] `mdz export-epub` CLI: translates MDZ archive to EPUB 3.3 package
  - Manifest → OPF
  - Markdown → XHTML (via marked/markdown-it)
  - Assets copied across
  - Document-level accessibility → EPUB Accessibility 1.1
  - Multi-locale → EPUB region-of-interest + `xml:lang` tags
  - `::cell` source → `<pre><code>` with `prism`-style highlighting (outputs
    baked in as alt content since EPUB can't execute)
- [x] `epub-to-mdz` CLI — `mdz import-epub` ships at
      `cli/src/commands/import-epub.js`. OPF parse with comment-strip,
      CDATA-unwrap, and multi-language title selection; spine walk in
      reading order; XHTML → Markdown via turndown; image dedup by
      destination path with basename-collision disambiguation; chapter
      breaks emitted as HTML comments (round-trip stable). Refuses
      DRM-protected EPUBs (exit code 3). 15 node:test cases including
      synthesized round-trip + DRM refusal.
- [x] Fidelity matrix at `docs/format-internals/epub-mdz-fidelity.md`
      with per-direction tables (export-side losses, import-side losses,
      round-trip stacking).
- [x] CI job — `validate-cli` runs `node --test test/import-epub.test.js`
      including the synthesized round-trip integration test (timeout
      120s for Windows-runner headroom).

### 2.5 Browser extension — universal

Replace the Chrome-only extension with a universal one.

- [x] WebExtensions API — `browser-extension/manifest.json` declares
      MV3 with `browser_specific_settings.gecko` for Firefox compat.
      Code ships at `browser-extension/{background,content,popup,viewer}/`.
      Service-worker background, content-script link detector, popup, viewer.
- [x] Intercepts via `declarativeNetRequest` + content-script link
      detection (covers both correct-MIME and `octet-stream` cases).
      The `<mdz-viewer>` web component integration is the next milestone
      (currently the extension's viewer page uses inline rendering).
- [ ] Published to all 4 addon stores — pending real icon artwork
      (currently 1×1 transparent PNG placeholders per
      `browser-extension/icons/README.md`) + bundled `<mdz-viewer>`.
- [x] Firefox reproducible-build instructions at
      `browser-extension/REPRODUCIBLE_BUILD.md`. CI runs `node --test
      browser-extension/test/manifest.test.js` (13 cases: MV3
      structure, permissions hygiene, CSP correctness, every
      referenced file exists, all .js passes `node --check`,
      popup.html refs resolve) + verifies the doc stays in sync.
      Full reproducible-build CI (zip + sha256 verification) lands
      when the bundler is wired in.

---

## Phase 3 — Security and conformance (starts *before* Phase 2 ships)

**Critical sequencing:** 3.1 (CSP profile + signature trust model + threat
model) is a **hard prerequisite for Phase 2.2 hosted rendering.** Launching
`view.mdz-format.org` with user-supplied archives and no CSP enforcement is
how we become the next vector for XSS / malicious include chains. Move 3.1
into the early weeks of Phase 2 scheduling even though it's numbered later.

### 3.1 Security model

Current state: attack surface identified (includes + kernels + scripts), no
enforcement. Fix this before any real adoption.

- [x] CSP profile — `docs/security/CSP.md` ships.
- [ ] `::include` external-URL permissions enforcement in reference impls — partial; spec requires it, runtime enforcement in viewer unverified.
- [x] Signature trust model docs (DID resolution / revocation / rotation) — `docs/security/SIGNATURE_TRUST.md` ships. Covers signer identity, key-discovery resolution chain (did:web / did:key / trust file / certificate fallback), trust-decision policies (default / strict / offline), revocation per DID method, key rotation patterns (forward chain / historical verification / co-signed rotation), and what viewers MUST surface to users.
- [x] Reference verifier `mdz verify archive.mdz` — ships at `cli/src/commands/verify.js` with structural chain + trust-file support (tests at `cli/test/verify.test.js`). Full cryptographic signature verification (Ed25519/RS256/ES256 over resolved DID keys) is still Phase 3.2 per both the Node and Rust verifier caveats.
- [x] Threat model doc at `docs/security/THREAT_MODEL.md` — ships.

### 3.2 Subresource integrity enforcement

- [x] Integrity field verification landed in the Node verifier + Rust binding (`verify_integrity`, `verify_content_id`). Conformance-suite-level viewer flagging is not yet implemented — the existing negative fixtures cover parser-level errors, not archive-level integrity mismatch. Archive-level integrity tests live in `cli/test/verify.test.js` and `bindings/rust/tests/archive_integration.rs` instead.
- [ ] Add integrity-fail fixtures to `tests/conformance/negative/` — still parser-level only. Archive-level integrity tests are covered in the `verify.test.js` + Rust integration suites (different fixture-harness format).

### 3.3 Accessibility conformance suite

- [ ] 50 fixtures covering WCAG 2.2 AA success criteria
- [ ] Tools: axe-core + pa11y run against `<mdz-viewer>` rendering of each fixture
- [ ] Publish an accessibility conformance report with the v1.0 viewer release.

---

## Phase 4 — Ecosystem (rolling, Q2 2027+)

### 4.1 Language bindings beyond Python + TypeScript

Prioritize by where our niche lives:

- [x] Rust (`mdz`) — ships at `bindings/rust/` (0.1.0-alpha). Archive open + integrity + signature-chain structural verification, 13 integration tests, CI-validated default + no-default feature builds.
- [ ] Swift — iOS reader
- [ ] Kotlin — Android reader
- [ ] Go — CLI tools, academic publishing backends

Each must pass the conformance suite to ship a 1.0.

### 4.2 Integration targets

- [x] Pandoc Lua filter — ships at `integrations/pandoc/mdz-filter.lua`. Handles `::cell`, `::output`, `::include`, `::fig`, `::ref`, `::cite`. Golden-output fixture pack + CI job. Does NOT include `pandoc --to mdz` / `--from mdz` custom-format registrations (those require native pandoc format registration, not a lua filter) — filter approach was chosen as lower-complexity.
- [x] VS Code extension — ships at `integrations/vscode/` (0.1.0-alpha). Commands: view / preview / validate / import-ipynb / export-jats / verify. Syntax highlighting via TextMate grammar. 17 unit tests cover the pure helpers + `runCliCore`. Directive IntelliSense via tree-sitter wiring is NOT yet implemented.
- [ ] Overleaf integration
- [ ] Zotero plugin
- [ ] arXiv submission bridge

### 4.3 Real-world corpus

- [ ] Convert 100 open-access arXiv papers to MDZ as a benchmark corpus — fetcher + converter ships at `tools/corpus-fetcher/fetch_arxiv.py` (TOS-compliant rate limiting, permissive-license filter, HTTPS, Python 3.12 `tarfile.extractall(filter="data")`). The 100-paper run itself is external work.
- [ ] Publish as a public dataset
- [ ] Partner with Zenodo or OSF for archival hosting

### 4.4 Streaming / lazy loading

For large documents (embedded videos, high-res figures), full-ZIP-into-memory
is a real constraint.

- [x] Research — `docs/proposals/streaming.md` ships with the HTTP-Range strategy, prerequisites, prior-art comparison, and resolutions to the three open questions (signature verification via eager-manifest + deferred-asset + `mdz-asset-unverified` sentinel; cache bound to origin MUST NOT; streaming writes out-of-scope until Phase 5+).
- [ ] Viewer update: fetch asset bytes on-demand via HTTP range requests — implementation pending.
- [ ] Editor update: lazy video load — editor not yet built.

### 4.5 Delta encoding for versions

Git-style packfiles for `history/snapshots/` — each version stores a delta
against its parent, not a full copy. Relevant once documents commonly have >20 versions.

---

## Phase 4.6 — Review-debt resolution (post-2026-04-24 audit)

Added after an honest self-enumeration of items the Phase 4+5 review
cycle skipped. Items are split by origin so credit + blame are clear.

### 4.6.1 Skipped review findings (code-review / silent-failure / type-design)

- [x] **Rust `resolve_entry_point`** — fixed: returns `Error::Manifest` when `locales.default` is missing from `available[]` (commit b498682).
- [ ] **Rust wasm32 32-bit `usize` cast** — the bounded-reader fix effectively neutralizes the risk (cap is `.min(1024 * 1024) as usize` which fits on all 32-bit targets), but the explicit `debug_assert!` for the theoretical case was not added.
- [x] **Rust `SignatureEntry.role` enum** — shipped as `Role` enum (`Author`/`Reviewer`/`Editor`/`Publisher`/`Notary`/`Custom(String)`) with `#[serde(try_from = "String")]` (commits 9ea73d1, b498682; widened to spec §16 "custom URI" semantics after type-design review).
- [x] **Rust `entry_paths` ordering docstring** — docstring now states stable lexicographic ordering via BTreeMap, explicitly tying it to reproducible content-hashing.
- [x] **Rust `manifest_bytes` invariant docstring** — documents the byte-identity invariant; correction on 04748bf clarified it refers to the inflated manifest entry, not the caller's input buffer.
- [x] **Rust `FeatureDisabled` actually wired** (2026-04-24 follow-up
      commit): `verify_integrity` / `verify_content_id` /
      `verify_signature_chain` now have `#[cfg(not(feature = "verify"))]`
      early-return paths that return `Err(FeatureDisabled)`. Methods
      are always present regardless of feature set. Also: sha2/hex
      promoted to `optional = true` deps gated by the `verify` feature
      so a no-default build truly sheds them.
- [x] **CHARTER.md CCLA exact name + link** — adds canonical W3C CG process URL + CLA URL (commit 086cd71).

### 4.6.2 Skipped tests + coverage

- [x] **Pandoc golden-output fixture pack** — 4 input fixtures + `run.sh` diff runner at `integrations/pandoc/tests/`; CI runs it unconditionally. Pinned expected output for `01-plain-paragraph`; required-pin enforcement rejects future fixtures that forget their pin. Runner distinguishes PANDOC-CRASH from empty-output.
- [x] **VS Code extension functional tests** — 17 node:test cases at `integrations/vscode/test/{helpers,runCliCore}.test.js` covering `buildPreviewHtml` (truncation, XSS via theme attribute, HTML escaping) and `runCliCore` (argv-not-shell, in-flight dedupe, err.code fallback, cleanup).
- [x] **Cross-implementation parity harness** — Rust↔TS direction shipped at `tests/parity/rust_ts_manifest_parity.py` + `bindings/rust/examples/parity_dump.rs`; CI runs it against `examples/example-document.mdx`. The Python↔TS direction called for in Phase 1.3 is still open.
- [x] **Rust integration tests — additional chain cases** — shipped at `bindings/rust/tests/archive_integration.rs`: valid multi-entry chain, tampered prev_hash, manifest_checksum mismatch, blake3 unsupported, locale strict-error, 5 closed Role variants, 5 custom Role forms, FeatureDisabled on all 3 methods.

### 4.6.3 Skipped deprecations + spec follow-ups

- [x] **`checksum` → `content_hash` louder deprecation:**
  - [x] Spec §9.3.1 paragraph — ships.
  - [x] `@deprecated` JSDoc on `MDXAssetEntry.checksum` — ships with removal version v3.0.
  - [x] `DeprecationWarning` from `compute_checksum` — ships (using stdlib `warnings.warn`; respects user filters). `compute_content_hash` is the silent replacement. The warning fires on the write path (when someone calls `compute_checksum`), not yet on the read path (loading a v2.0 manifest that declares `checksum` without `content_hash`) — a load-time warn is a separate follow-up.
- [x] **Streaming proposal open questions** — resolved in `docs/proposals/streaming.md`:
      Q1 eager-manifest-checksum + deferred-asset-hash + `mdz-asset-unverified` sentinel class;
      Q2 cross-origin cache is MUST NOT (bound to origin until Phase 3.2 signed-asset enforcement);
      Q3 streaming writes out-of-scope for Phase 4.4; editors keep configurable in-memory ceiling.
- [x] **Delta-snapshots open questions** — resolved in `spec/extensions/delta-snapshots-v1.md`:
      Q1 no binary delta in v1 (markdown only; bsdiff/VCDIFF-style would be a v2 extension);
      Q2 `index.json` MUST be covered by `scope: full-archive` signatures per Phase 3.2 (when that lands);
      Q3 plain-text patches + outer DEFLATE, no custom encoding.

### 4.6.4 Phase 0 / 1 items claimed done but unverified

- [ ] **Repository `.mdx` → `.mdz` audit** — the rename commit landed
      but I claimed ROADMAP completion without running the
      `grep -rIn 'mdx' .` pass called for in §0.1. Actually do it.
- [ ] **npm `@mdz-format` scope reservation** — not verified.
- [ ] **Spec prose-grammar removal** — verify nothing outside
      `spec/grammar/*.abnf` duplicates the directive grammar.
- [ ] **Chevrotain TypeScript parser** — audit 2026-04-24 found ZERO
      `chevrotain` references in `implementations/` or `spec/`. The
      Phase 1.2 ROADMAP item "New TypeScript parser built on Chevrotain"
      is NOT done. Action: either ship Chevrotain (estimated 2–4 weeks)
      or downgrade the spec to "Lark (Python) is the reference parser;
      TS consumers use the regex-based legacy parser until Phase 2.3".
      Preferred path: downgrade + revisit in Phase 2.3 when the editor
      build needs a real TS parser anyway.
- [x] **`.expected.json` per conformance fixture** — audit 2026-04-24:
      52 fixtures under `tests/conformance/{positive,negative,roundtrip,
      edge}` (the 53rd `.md` file under `tests/conformance/` is the
      `README.md` — a doc, not a fixture). All 52 fixtures paired with
      `.expected*.json`. 100% coverage. Resolved.
- [ ] **`basicMarkdownToHTML` retirement** — audit 2026-04-24 found the
      method still present at `implementations/typescript/mdx_format.ts:3363`.
      Currently guarded by a `toHTML()`-level `console.warn` (once per
      process) rather than deleted. The Phase 1.2 ROADMAP item expected
      full removal. Action: decide — keep the toy renderer as a
      deprecated-but-present helper through v3.0 (current state), OR
      fully remove and point callers at `@mdz-format/viewer`.
- [ ] **Conformance Core vs Advanced split** — Phase 0.3 claims the
      split is done. Verify `spec/profiles/mdz-advanced-v1.json`
      actually requires advanced features and that the parser
      differentiates.

### 4.6.5 Accessibility conformance expansion

- [ ] **A11y fixtures 5 → 50** — expanded 5 → 23 on d6859f0 (image-alt / heading-order / link-name / document-language across positive + negative + combined + edge-case fixtures). **Remaining 27 fixtures** require a real-browser runner (axe-core + playwright) for checks the current Python regex runner cannot perform — color contrast (WCAG 1.4.3), keyboard navigation (2.1.1), focus visible (2.4.7), ARIA correctness (4.1.2), form labels, landmark roles, table headers. Tracked as Phase 3.3 completion.

### 4.6.6 CI hygiene

- [ ] **Dependabot 5 moderate vulnerabilities on master** — package.json bumps landed on b498682 (vite `^5.4.19`, vitest `^2.1.9`, wrangler `^3.114.14`) to pull in patched esbuild / undici transitive deps. **Verified 2026-04-24 via `gh api dependabot/alerts`: 5 alerts still report "open"** (vite #7/#14, undici #10/#11, esbuild #8). Package-lock files are not committed, so Dependabot cannot re-scan until the next install cycle. Commitment accepted; listed as partial-done pending a lockfile or Dependabot re-evaluation.
- [x] **Node 20 actions deprecation** — resolved via
      `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` env var at workflow
      level (commits b498682/04748bf). Forces the Node-20 pinned
      actions to run on Node 24 instead. Stronger than the action-
      version-bump path: removes the underlying Node-20 condition
      rather than just silencing a warning. CI logs confirm the
      forced-runtime behavior.
- [ ] **`--locked` Cargo build** — still commented out. Committing `Cargo.lock` + re-enabling is tracked but not done; a lockfile commit needs coordination with the optional-dep `verify` feature so `cargo test --no-default-features` still resolves correctly.
- [ ] **CHANGELOG.md line-length** — v2.0 capability block wrapped + fenced with `markdownlint-disable MD013` on 086cd71. **Verified 2026-04-24: ~8 other lines remain over 80 columns** elsewhere in the file (including the shields.io rows in README which the lint job also flags). Not wrapped. `continue-on-error: true` still shields CI.

### 4.6.7 External / blocked items (not actionable in-session)

- [ ] **Phase 0 exit criterion** — one real paper end-to-end.
      Requires a real paper.
- [ ] **npm `@mdz-format` scope** — requires npm account action.
- [ ] **Journal outreach** — Phase 0.2.
- [ ] **W3C charter submission** — Phase 5.
- [ ] **Funding decisions** — Phase 0.

---

## Phase 5 — Governance (Q4 2027+)

Only after there's real adoption:

- [ ] W3C Community Group (lightweight) → W3C Working Group (heavyweight)
- [ ] Publish spec at `mdz-format.org/spec/` with per-version archive
- [ ] Formal change process: RFC repo, tagged releases, errata tracking
- [ ] Trademark the MDZ logo/wordmark if uptake warrants it

---

## Immediate next steps (this week / month)

If this roadmap is approved, the first concrete actions are:

1. **Decide the funding model** (`docs/FUNDING.md`) — this gates everything
   else because it determines Phase 2 scope. Can be decided in a week;
   execution (grant application, sponsor outreach) runs parallel to everything
   below.
2. **Write `docs/COMPETITIVE.md`** — honest comparison against Quarto, Jupyter
   Book, Curvenote, Manubot, Stencila. If this document can't clearly name
   MDZ's differentiators *today*, the roadmap is an expensive way to learn
   nothing — rewrite the positioning first.
3. **Merge rename PR** — touch every file, every URL, every type name; update
   CLAUDE.md from "Markdown eXtended Container" to "Markdown Zipped Container."
4. **Publish the revised `STATUS` banner** in README ("experimental research
   project; tooling is pro-grade; format is not production-stable").
5. **Ship the formal grammar draft** as `spec/grammar/mdz-directives.abnf`
   — plan ≤2 weeks of work, not "3 days" (the prior estimate assumed no
   iteration with the parser rebuild; realistically it co-evolves).
6. **Start on `<mdz-viewer>` skeleton** — this is a 3-month build for the
   core shell; math/highlight/video lazy-loaded over months 3–6.
7. **Survey ≥20 potential users** (arXiv/Zenodo/OSF regulars, journal
   production editors) on the scientific-paper positioning — validate the
   niche AND the JATS-XML requirement before building for it.
8. **Draft `spec/directives/cite-and-ref.md`** — cross-reference + citation
   directives must land in v2.1 before the Phase 2 viewer ships, or the
   viewer can't render real papers.

---

## Success metrics (end of 2027)

Concrete, falsifiable, biased toward the scientific-paper niche.
**Flagged [STRETCH]** = requires external party cooperation not yet secured;
count as a bonus, not a plan.

**Niche-specific (primary):**
- 10+ scientific papers published as MDZ at arXiv / bioRxiv / Zenodo / OSF
  (via the viewer + hosted rendering service — doesn't require native preprint
  server support)
- A reviewer has re-executed a `::cell` block in a submitted paper via the
  hosted viewer and confirmed a result — the reproducibility loop closes
- 3+ authors have used the desktop editor end-to-end to produce a submission
- `mdz-to-jats` round-trips for the 10+ published papers without data loss
- [STRETCH] 1+ peer-reviewed journal accepts MDZ as a submission format
- [STRETCH] 1+ preprint server (arXiv / Zenodo / OSF) natively renders MDZ
  uploads — arXiv and Zenodo engineering roadmaps are set 2 years out; this
  requires a champion inside the organization we do not yet have. Outreach
  plan lives at `docs/PARTNERSHIPS.md`.

**Ecosystem:**
- `<mdz-viewer>` on npm with >1,000 weekly downloads
- Conformance suite: 3+ independent implementations pass 100% of Core
- Desktop editor: 500+ active weekly users across Mac/Win/Linux
- Zero CVEs in the reference implementations (or all resolved within SLA)
- [STRETCH] W3C Community Group chartered (requires 5+ W3C member company
  endorsements; not on hand)

## Resourcing reality check

This roadmap implies roughly **3–5 FTE for 2 years** to land Phase 2 as
described:

- 1 FTE viewer/web-component engineer
- 1 FTE desktop editor engineer (Electron/CodeMirror)
- 0.5 FTE spec / grammar / conformance suite
- 0.5 FTE Python reference impl + JATS bridge
- 0.5 FTE devrel / outreach / docs
- 0.5–1.5 FTE security review, accessibility testing, CI

Absent a funding source (grant, sponsorship, adjacent product) this plan
**cannot execute as written with a solo maintainer** — expect 4–5x the
timeline. Before Phase 1 formally commits, decide:

- (a) Apply for NumFOCUS / Sloan / Mozilla open-source grants targeting
      scientific tooling. Quarto, Jupyter, and MyST all went this route.
- (b) Find an institutional sponsor (a university press, a funded OA journal,
      a nonprofit like CZI).
- (c) Run MDZ as a side project with ruthlessly smaller scope — in which
      case drop the editor from Phase 2 entirely; ship viewer + EPUB bridge
      + CLI only.

Track the funding-model decision at `docs/FUNDING.md`.

---

## What we're NOT doing

Explicit non-goals — listing these prevents scope creep. Each carries a precise
definition so it can't be silently re-invoked:

- **Real-time collaborative editing (CRDT).** MDZ is a file format, not a CRDT.
  Google Docs and HedgeDoc serve that need. The editor's annotation layer is
  *asynchronous* — threaded comments + accept/reject that ship as part of a
  saved archive — not live cursors / concurrent text streams. If we want the
  latter, it's a separate project layered on top.
- **Full-bleed WYSIWYG page layout (InDesign / Affinity Publisher).** The
  "Adobe Acrobat-class" framing applies to *UX polish and pro-grade install
  experience*, not to desktop publishing capability. MDZ documents reflow;
  they don't have a master-page / spread model. If a journal needs camera-ready
  typesetting, they run MDZ → LaTeX → PDF, not MDZ → InDesign.
- **DRM / rights management.** Signing proves authenticity, not access control.
- **Binary compatibility with DOCX / PDF.** Bridges only (see 2.4 for EPUB;
  JATS bridge is Phase 2). Not equivalence.
- **Generic workflow engine / Airflow replacement.** `::cell` runs individual
  code blocks with declared kernel + requirements. It does not orchestrate
  DAGs across documents, schedule reruns, or manage dependencies between
  papers. If a reader wants "run all cells in the correct order," the viewer
  does that one-shot; it does not integrate with Dagster / Prefect / Airflow.
- **Competing with Quarto on authoring breadth.** Quarto supports HTML / PDF /
  reveal.js / Word / dashboards / books / websites from one source. MDZ
  authoring targets *one output*: an MDZ archive. Convert later via bridges.

If someone proposes one of these, the answer is "separate project, or later phase."
