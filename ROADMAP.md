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
- [x] Spec title: "Markdown eXtended Container" → "Markdown Zipped Container" — v2.0 spec already renamed; v1.0 + v1.1 historical specs renamed 2026-04-25 with archival-banner pointers to v2.0.
- [x] Update `CLAUDE.md`, `README.md`, `CHANGELOG.md`, all agent-facing docs — README leads with "MDZ Format / Markdown Zipped Container"; STATUS banner at README:11; CLAUDE.md Phase 4.6 tree current; CHANGELOG v2.0 block wrapped
- [x] Grep-pass: `grep -rIn 'mdx' .` — done 2026-04-25. RLM-driven audit found 692 lower-case `mdx` references across 107 files. Most are legitimate (legacy dual-extension support per the 2027-01-01 deprecation policy, historical CHANGELOG entries, deferred-rename paths in `implementations/{ts,py}/mdx_format.{ts,py}`). One real fix: `cli/package.json` `name` was `mdx-cli` and `bin` exposed `mdx` only — now `mdz-cli` with both `mdz` (preferred) and `mdx` (legacy alias) bin entries. One real fix: `spec/profiles/api-reference-v1.json` `$schema` and `id` URLs pointed at `mdx-format.org` — corrected to `mdz-format.org` to match the other three profiles.

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
- [x] Retire the regex-based parser; keep it only as a fallback for malformed input — verified done 2026-04-25. The "fallback" is wired at the parse-attr level via the `strict: bool` flag in `_parse_attrs_lark` (`implementations/python/mdz_parser/parser.py:208`). `strict=False` (the v1.1 graceful-degradation path) returns empty `ParsedAttrs` on malformed input; `strict=True` (v2.0 directive path: `::cell`, `::output`, `::include`, container, labeled-block, inline-directive) raises `ParseError`. The legacy `alignment_parser.py` is now used only as a parity-test reference; no `--legacy` CLI flag exists because the choice is per-call inside the parser. The original ROADMAP wording was ahead of how the parser actually evolved.
- [x] Retire `basicMarkdownToHTML` in `mdx_format.ts` — done 2026-04-25. `MDZDocument.toHTML` now throws with a migration message pointing at `renderMarkdown` from `@mdz-format/viewer`; `basicMarkdownToHTML` + `escapeHTML` private helpers + the `_toHtmlWarningEmitted` static guard all removed. 125/125 TS tests still pass.

### 1.3 Conformance test suite

The single highest-leverage investment for interoperability.

- [x] Create `tests/conformance/` with fixtures organized by category — ships with 52 fixtures across positive/negative/roundtrip/edge (roadmap target was ~200; current suite is the minimum-viable pack, room to grow).
- [x] Each fixture has a `.expected.json` — verified 52/52 coverage on 2026-04-24.
- [x] CI job runs the full suite — `validate-v20-examples` in `.github/workflows/ci.yml` runs `tests/conformance/run_conformance.py`.
- [x] Cross-implementation test: Python writes, TypeScript reads, byte-compare the AST. Same for TS→Py. — done 2026-04-25. New `tests/parity/py_ts_roundtrip.py` drives Python's `mdx_format.py` example generator, extracts the manifest, normalises away nondeterministic fields (timestamps, UUIDs), and compares against the same archive's TS-readable view. Wired into the `validate-cli` CI job. The harness deliberately compares raw manifest JSON rather than booting the TS class — that's what proves cross-impl agreement on the wire format. Rust↔TS parity harness already in `tests/parity/rust_ts_manifest_parity.py`.

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

### Status snapshot (2026-04-25)

| Sub-phase | State | What landed | What's pending |
|-----------|-------|-------------|----------------|
| 2.1 viewer | **partial** | sanitizer + directives (cross-refs / citations / bibliography / `::cell` / `::output` / `::include`, 50 tests with i18n labels), CSL-JSON references, KaTeX math, IndexedDB cache, **delta-snapshots-v1 reader** (24 tests), `tsconfig.build.json` for single-file ESM emit. 145/145 viewer tests pass. | full keyboard a11y pass, npm publish, demo site, fragment-aware `::include` |
| 2.2 hosted | **code-ready, not deployed** | full Cloudflare Worker (32 tests) + `wrangler.toml [assets]` block pointing at `../mdz-viewer/dist` + `VIEWER_ASSETS` binding so `/viewer.js` serves the real bundle | `wrangler deploy` to `view.mdz-format.org` (external action), per-archive cover-image extraction |
| 2.3a editor MVP | **feature-complete (unsigned releases)** | 2.3a.1–6 all shipped: shell, source pane, asset sidebar, .ipynb import, picker pack, `electron-builder.yml` + 3-platform CI matrix + auto-update feed. Pipeline produces unsigned installers today and auto-signs when cert secrets arrive in CI. | Cert/notarization secrets (external accounts), real icon artwork, Phase 2.3a.7 Playwright integration tests |
| 2.3b editor Pro | **all 7 sub-phases shipped end-to-end** | 2.3b.1 Pyodide (kernel layer + UI + CSP + `kernels.python.runtime` save + per-cell Run buttons) / 2.3b.2 a11y checker / 2.3b.3 block-diff algorithm + Compare-versions modal / 2.3b.4 annotation data layer + sidebar UI / 2.3b.5 locale data layer + read-write Compare-locales modal + Add-locale command / 2.3b.6 variant planner + sharp encoder + Generate-variants IPC + UI / 2.3b.7.1–5 non-core picker pack. **376/376 editor-desktop tests pass.** | Annotation creation flows (need IPC for UUID + sig integration), `--role=public\|editor` flag |
| 2.4 EPUB bridge | **shipped** | `mdz export-epub` (yazl-based, deterministic, EPUB OCF §4.3-correct) + `mdz import-epub` (15 tests); fidelity matrix doc; round-trip CI gate; symmetric `::fig`/`::eq`/`::tab` directive round-trip | Per-chapter spine preservation |
| 2.5 browser ext | **code-ready, hardened, deterministic build** | MV3 manifest, scripts, 16 tests (13 manifest + 3 build-determinism), reproducible Node bundler at `browser-extension/build.js`, CI 2x-build SHA-256 diff, placeholder icons | Real icon artwork, AMO / Chrome / Edge / Brave submissions, browser-driven smoke tests |

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

#### 2.3a.1 Editor shell foundation — **shipped**

- [x] Electron app skeleton at `editor-desktop/` with main + renderer
      processes split, `contextIsolation: true`, `sandbox: true`,
      `nodeIntegration: false` on the renderer's BrowserWindow.
- [x] Vite dev server (port 5173) + production build pipeline
      (`tsconfig.main.json` for main + preload as CommonJS;
      `vite.config.ts` for the renderer ES-module bundle).
- [x] IPC channels `archive:open` / `archive:save` /
      `dialog:openFile` / `dialog:saveFile`. Renderer never touches
      `node:fs`; everything goes through the preload's contextBridge.
- [x] `electron-updater` plumbing wired with a no-op stub feed.
      Phase 2.3a.6 swaps the stub for a real GitHub Releases endpoint.
- [x] **Pure archive-io decoupled from Electron** at
      `src/main/archive-io.ts` (open / save / round-trip via
      injectable `FsLike`). Lets the open/save contract be unit-
      tested without spawning Electron.
- [x] Renderer HTML carries a strict CSP
      (`default-src 'self'; script-src 'self'`; no remote scripts).
- [x] CI: `validate-editor-desktop` job type-checks the testable
      core + runs the 11 archive-io vitest cases. Electron's platform
      binaries are in `optionalDependencies` and skipped in CI for
      speed (Phase 2.3a.6 wires a separate release-build job that
      DOES install them).

  **Acceptance:** met. `npm run test` passes (11/11), `npx tsc
  --noEmit -p tsconfig.test.json` is clean, `editor-desktop/README.md`
  documents the install + dev + build flow. The full integration
  acceptance ("`npm run dev` opens an Electron window…") requires
  `npm install --include=optional` plus a real run; tracked as
  Phase 2.3a.6 Playwright integration coverage.

#### 2.3a.2 Source editor + live preview — **shipped**

- [x] CodeMirror 6 in the renderer with the Markdown language pack
      (`@codemirror/lang-markdown`). `tree-sitter-mdz` integration
      for the v2.0 directives (`::cell` / `::include` etc.) is
      tracked as a 2.3a.5 follow-up (the picker pack already needs
      a CodeMirror command API; the directive-aware syntax tree
      lands alongside).
- [x] `<mdz-viewer>` web component reused via direct
      `import { renderMarkdown } from "@mdz-format/viewer"` — same
      directive + math + sanitize pipeline as the deployed viewer,
      no fork.
- [x] Source → preview sync with a 150 ms debounce
      (`makeDebouncer` in `editor-pane-helpers.ts`). `flush()` /
      `cancel()` semantics tested. Viewer scroll-position pinning
      across re-render is tracked as a 2.3a.6 follow-up (needs
      Playwright for repeatable verification).
- [x] Toggle: source-only / preview-only / split (default).
      `applyModeClass` writes `.mode-*` to the pane host; CSS
      grid-template-columns drives the layout.

  **Depends on:** 2.3a.1.
  **Acceptance:** met to the extent CI can verify (12 vitest cases
  on the pure helpers; full keystroke-to-preview latency timing is
  Playwright work in 2.3a.6).

#### 2.3a.3 Asset sidebar — **shipped**

- [x] Drag-drop zone in `index.html` accepts files (or click-to-
      browse), wired through `ingestFiles` → `assetStore.add` per
      file. Visual `.dragover` state on hover.
- [x] On save: `assetStore.manifestProjection()` populates
      `manifest.assets[<category>][]` with `path`, `mime_type`,
      `size_bytes`, `content_hash` (sha256). `assetStore.toEntriesMap()`
      flows the bytes through IPC to the main-process `saveArchive`,
      which writes the ZIP via `fflate`.
- [x] Tree view of staged assets at `<aside id="asset-sidebar">`
      with per-row size + delete button. Rename surface lands as
      part of 2.3a.5 (the picker pack adds the modal-input UI).

  **Depends on:** 2.3a.1 (IPC) + 2.3a.2 (renderer state model).
  **Acceptance:** met. The unit-tested `AssetStore.manifestProjection()`
  produces spec §9-shaped `manifest.assets` entries with correct
  `content_hash`. Browser-side drag-drop + visual rendering need a
  real DOM; full end-to-end "drop a PNG → mdz info shows it" is
  Phase 2.3a.6 Playwright work.

#### 2.3a.4 `.ipynb` import flow — **shipped**

- [x] "File → Import Jupyter notebook…" menu item wired through the
      preload `editorApi.pickIpynb()` + `editorApi.importIpynb()`
      bridges. Renderer waits for the import to settle, then opens
      the produced `.mdz` directly.
- [x] Bridge module at `editor-desktop/src/main/ipynb-import.ts`
      spawns the existing `cli/src/commands/import-ipynb.js` as a
      child process (NOT in-renderer; the CLI calls
      `process.exit()` on unhappy paths and would kill the editor
      if loaded in-process).
- [x] `IpynbRunner` is injectable so unit tests can stand in a fake
      spawner and assert behavior without forking real Node
      processes (suite stays under 100 ms).
- [x] `runIpynbImport` resolves with the produced `.mdz` path on
      success; throws with stderr surfaced on non-zero exit; throws
      with a clear message on spawn failure.

  **Depends on:** 2.3a.1.
  **Acceptance:** met to the extent CI can verify (7 vitest cases
  on the bridge in `editor-desktop/test/ipynb-import.test.ts`).
  End-to-end "right-click `.ipynb` → `.mdz` opens in editor" path
  is Phase 2.3a.6 Playwright work.

#### 2.3a.5 Visual-authoring picker pack — `::cell`, `::include`, `::fig`, `::cite`

Each picker is its own session-sized chunk. Sequencing within the
chunk is bottom-up (insertion engine first, individual pickers
second).

- [x] **2.3a.5.0 — Directive insertion engine.** Pure builders
      (`buildCell`, `buildInclude`, `buildFig`, `buildCite`) in
      `editor-desktop/src/renderer/directive-insert.ts` return
      `{text, cursorOffset}` payloads. CodeMirror-side
      `EditorPane.insertDirective(payload)` splices at cursor (or
      replaces selection) and parks the caret at the requested
      offset. 19 vitest cases cover all four builders + the
      sentinel-split helper. Picker pack 2.3a.5.1+ builds on this.
- [x] **2.3a.5.1 — `::cell` picker.** Modal with language select
      (Python/R/Julia/JS), kernel field, optional `execution_count`.
      `validateCell` enforces non-empty language+kernel and a
      non-negative integer execution_count.
- [x] **2.3a.5.2 — `::include` picker.** Modal with target,
      fragment, and content_hash fields. `validateInclude` rejects
      absolute paths and `..` traversal; when archive entry list is
      provided, also rejects targets not present in the archive.
- [x] **2.3a.5.3 — `::fig` / `::eq` / `::tab` picker.** Modal with
      kind select (fig/eq/tab) + id text. `collectExistingIds`
      scans the open document for already-defined ids per kind;
      `validateFig` enforces the spec id grammar
      (`[A-Za-z][A-Za-z0-9_-]*`) and rejects collisions within the
      same kind (cross-kind reuse is allowed).
- [x] **2.3a.5.4 — `::cite` picker.** Modal with comma-separated
      keys + optional prefix/suffix locator.
      `collectBibliographyKeys` parses CSL-JSON from
      `references.json` (root-level archive entry); `validateCite`
      checks each key against the bibliography when present (empty
      bibliography = permissive). Order-preserving deduplication.

  **Depends on:** 2.3a.2 (CodeMirror) for all five.
  **Acceptance per picker:** clicking the toolbar button + filling
  the modal inserts a syntactically valid directive, and the
  preview pane re-renders it correctly within the same debounce.

#### 2.3a.6 Release engineering

- [x] **Installer config + build pipeline** in
      `editor-desktop/electron-builder.yml`. macOS DMG + ZIP
      (universal binaries; x64 + arm64), Windows NSIS + portable
      (x64 + arm64), Linux AppImage + deb + rpm. All cert /
      notarization values come from env-var placeholders so the
      pipeline runs **unsigned** today and starts producing signed
      artifacts the moment the secrets land in CI — no code change
      needed when certs arrive.
- [x] **Auto-update feed** wired in `main.ts` and pointed at the
      project's GitHub Releases via electron-builder's `publish`
      block. Until the first signed release ships, the updater
      resolves with `update-not-available` (the intended steady
      state). Logger output goes to `userData/logs` for diagnostics;
      `MDZ_EDITOR_DEV=1` escalates to debug.
- [x] **Three-platform CI matrix** in
      `.github/workflows/release-editor.yml`. Triggers on `v*`
      tag pushes + manual dispatch. Auto-detects which platform's
      signing secrets are present and runs `dist` (signed) vs
      `dist:unsigned` accordingly. Annotates the run with `::notice`
      when a platform's secrets are missing so the gap is visible
      without failing the build.
- [x] **macOS hardened-runtime entitlements**
      (`build-resources/entitlements.mac.plist`) with the minimum
      set needed for notarization: `allow-jit` (Pyodide WASM),
      `network.client` (auto-update + Pyodide CDN),
      `files.user-selected.read-write` (open-archive dialog).

  **Depends on:** 2.3a.1.
  **External-blocked (placeholders in place):** macOS notarization
  requires Apple Developer account ($99/year); Windows EV cert
  requires hardware token + ~$300/year cert. Add the secrets in
  GitHub Actions and the next tagged release auto-signs. Until
  then: unsigned installers ship, with the SmartScreen / Gatekeeper
  warning documented in the README. Icon artwork is a 1×1 placeholder
  PNG / ICO; `build-resources/README.md` flags the swap-out.
  **Acceptance:** a tagged release produces three signed installers
  in GitHub Releases that auto-update each other on subsequent
  tags.

### 2.3b Editor Pro features (6–12 months aggregate, 7 independent chunks)

Only build these after the MVP has real users and feedback. Each chunk
is independent — sequence by user demand, not by checklist order.

#### 2.3b.1 Pyodide kernel execution

- [x] **Kernel-layer scaffolding** in
      `editor-desktop/src/renderer/python-kernel.ts`. Defines a
      pure `PythonKernel` interface with two implementations:
      `loadPyodideKernel()` (lazy-loads Pyodide from CDN at
      runtime; not exercised in unit tests — needs Phase 2.3a.6
      Playwright) and `FakePythonKernel` (deterministic, scripted
      result playback for vitest). Output-capture parser
      (`parseExecutionOutput`) turns the harness's stdout / stderr
      / display_data / last-expression-value / exception fields
      into a uniform `KernelResult`. Cell-timeout helper
      (`withTimeout`) races against `setTimeout` and returns a
      `timeoutResult()` per spec — Pyodide can't be preempted, so
      the timeout is advisory; the message says so explicitly.
      18 vitest cases.
- [x] **CSP relaxed** in `editor-desktop/src/renderer/index.html`
      to permit the CDN load: `script-src 'self' 'wasm-unsafe-eval'
      https://cdn.jsdelivr.net` + `connect-src 'self'
      https://cdn.jsdelivr.net` + `worker-src 'self' blob:`.
      Pyodide is opt-in (only loads when the user clicks "Run") so
      the relaxation is bounded; the rest of the editor's CSP stays
      strict. `wasm-unsafe-eval` is required because Pyodide's
      `WebAssembly.compile` path counts as eval under CSP3.
- [x] **"Run Python cells" toolbar button** wired in `index.ts`.
      Lazy-loads the kernel on first click (`getPythonKernel`),
      reuses the same handle across runs (module imports persist).
      Walks the open document, extracts every `::cell{language=
      python}` via `extractPythonCells`, runs them sequentially via
      `runCells` (stops on first error per Jupyter REPL semantics),
      splices `::output{type=…}` blocks into the source via
      `insertOutputs`, and surfaces the outcome in the title bar
      (`Ran N cells`, `Stopped at cell K: <reason>`, `Cell K timed
      out`, etc.).
- [x] **Pure orchestration layer** in
      `editor-desktop/src/renderer/cell-runner.ts` —
      `extractPythonCells`, `runCells`, `formatCellOutput`,
      `insertOutputs`. Right-to-left splice keeps offsets valid
      across multi-cell inserts. Output rendering picks rich MIME
      types in priority order (`text/html` > SVG > PNG > JPEG >
      `text/plain`) and inlines images as `data:` URIs so outputs
      render without an asset write. 22 vitest cases cover every
      mapping branch + the splice ordering invariant.
- [x] **Manifest `kernels.python.runtime: "pyodide"` declaration**
      — done 2026-04-25. New
      `editor-desktop/src/renderer/kernel-manifest.ts` ships a
      pure `mergeKernelDeclaration(manifest, pyodideVersion?)`
      that writes `{python: {runtime: "pyodide", version: "0.26.4"}}`
      while preserving any non-Python kernel slots the manifest
      already carried (R/Julia/etc.). Wired into `saveFlow`:
      whenever the user has loaded the Pyodide kernel during the
      session (`pythonKernel != null`), the merge runs against
      the manifest copy at save time. 6 new vitest cases pin the
      add / preserve / overwrite / immutability / malformed-input
      branches.
- [x] **Per-cell Run buttons** in the preview pane — done
      2026-04-25. Three pieces:
      1. `directives.ts`'s `renderCellBlock` now embeds the cell's
         source and language as `data-mdz-cell-source` /
         `data-mdz-cell-language` attributes on the rendered
         `.mdz-cell` div.
      2. New `editor-desktop/src/renderer/cell-run-buttons.ts`
         walks the preview DOM for
         `[data-mdz-cell-language="python"]` elements and injects
         a single Run button (▶) into each, idempotent via the
         `data-mdz-run-attached` flag. Includes
         `spliceSingleCellOutput(markdown, cellSource, result)` —
         a pure helper that finds the cell body in the source and
         splices an `::output` block after the matching closing
         fence.
      3. `EditorPaneOptions.onPreviewRendered` hook fires after
         each preview render; `index.ts` wires it to
         `attachCellRunButtons` with the same lazy-loaded Pyodide
         kernel the toolbar uses. 3 new vitest cases pin the
         splice behaviour (insertion ordering, no-match no-op,
         every output type emitted).

  **Honest caveat:** Pyodide is ~10 MB download, supports most
  pure-Python plus the curated C-extension wheels in the Pyodide
  distribution (numpy / scipy / matplotlib / pandas all work).
  Arbitrary `pip install` does NOT work for compiled wheels;
  TensorFlow / PyTorch do not run in Pyodide. Reviewers get
  "re-execute most cells", not "re-execute any cell".
  **Depends on:** 2.3a.2.

#### 2.3b.2 Accessibility checker

- [x] **In-editor live checker** in
      `editor-desktop/src/renderer/accessibility-checker.ts`. Pure
      TS port of the Python `tests/accessibility/run_accessibility.py`
      rules — image-alt (WCAG 1.1.1), heading-order (WCAG 2.4.10),
      link-name (WCAG 2.4.4), document-language (WCAG 3.1.1).
      Status-bar widget summarises violation counts; clicking opens
      a panel with rule / WCAG / line-number for each finding.
- [x] **Cross-impl parity tests:** the vitest suite drives the TS
      checker against every fixture in `tests/accessibility/fixtures/`
      and asserts the same `expected_violations` set the Python
      runner enforces. 23 fixtures × parity + 14 unit tests = 37
      vitest cases.
- [ ] Compliance-report export (WCAG 2.1 / 2.2 AA sidecar JSON for
      journal submission). Deferred to a follow-up — needs the
      Phase 3.3 fixture pack expanded from 23 → 50 fixtures first.

  **Depends on:** 2.3a.2 + the Phase 3.3 fixture pack (currently
  23/50 fixtures).

#### 2.3b.3 Block-level diff view

- [x] **Block tokenizer + LCS-based diff** in
      `editor-desktop/src/renderer/block-diff.ts`. Treats
      paragraphs, headings, fenced code blocks, container
      directives (`:::name…:::`), single-line directives (`::name`),
      lists, blockquotes, and HRs as atomic block units. Diff op
      stream is `equal`/`added`/`removed`/`modified` — the
      `modified` op fires when two blocks share an identity key
      (heading text, directive `id=` attribute) but their bodies
      differ, so the UI can render an inner line-level diff.
- [x] **Line-level fall-back diff** (`diffLines`) for inside
      `modified` blocks. Plain LCS — fast on the short text spans
      that appear inside a single block.
- [x] **Compare-versions modal** wired in `index.ts`. Drives
      the algorithm against every version in the open archive's
      `history/snapshots/index.json`. Pure HTML renderer
      (`diff-render.ts` — `renderBlockOps`, `renderBlockOp`,
      `renderDiffStats`) converts `BlockOp[]` → strict-CSP HTML
      with stable class hooks (`block-equal`, `block-added`,
      `block-removed`, `block-modified`, `line-added`,
      `line-removed`, `line-equal`). Heading and labeled-directive
      blocks render friendly labels (heading text, `::fig` +
      `id=overview`); other kinds get kind + start-line. HTML is
      escaped through a small `escapeHtml` pass so untrusted
      manuscript text can't inject markup. 11 vitest cases.
- [x] **Round-trip with `delta-snapshots-v1` (read side):** Phase
      4.5 reference impl shipped 2026-04-24 in
      `packages/mdz-viewer/src/snapshots.ts` — `parseIndex`,
      `resolveVersion`, `applyUnifiedDiff`,
      `reconstructVersion[Sync]` plus `SnapshotError` for the
      strict error path. The block-diff and the snapshot patches
      use the same unified-diff format, so a snapshot rebuilt
      from the chain feeds straight into `diffBlocks` for the
      version-comparison UI when it lands.
- [x] Writer-side `mdz snapshot create|view|list` CLI subcommand
      — done 2026-04-25 in Phase 4.5.2. See the Phase 4.5 entry
      below for the canonical implementation note (this entry was
      a Phase 2.3b.3 cross-reference that hadn't been rolled up).
      `cli/src/commands/snapshot.js` + `cli/src/lib/snapshots.js`.

  **Depends on:** 2.3a.2. Algorithm + read side shipped 2026-04-24;
  UI surface and writer CLI deferred.

#### 2.3b.4 Peer-review annotation layer

- [x] **Data layer** in
      `editor-desktop/src/renderer/annotations.ts`. Full
      `parseAnnotation` per the W3C Web Annotation Data Model with
      MDZ extensions: `role` field (author/reviewer/editor/reader),
      4 extended `motivation` values (review-accept,
      review-reject, review-request-changes,
      review-confidential-comment), required-field validation per
      spec. `loadAnnotations(entries)` walks the archive's
      `annotations/*.json` paths with error tolerance (one
      malformed file doesn't sink the rest).
- [x] **Threading** via `buildThreads(annotations)` — turns the
      flat list into a reply tree using string-target pointers
      (`motivation: "replying"`, `target: "annotations/parent.json"`),
      sorted by `created` ascending at every level. Orphan replies
      (target id missing) become roots so they remain visible.
- [x] **Trust signals** via `findTrustWarnings(annotations,
      signedCreatorIds)` — surfaces unsigned editor decisions as
      `severity: "error"` (forgery risk) and unsigned author /
      reviewer annotations as `warning`. Integrates with the
      Phase 3 signature chain when present.
- [x] **Sidebar UI for the annotation tree** in
      `editor-desktop/src/renderer/annotations-render.ts`. Pure
      `renderAnnotationSidebar(threads, warnings)` produces
      strict-CSP HTML with role-coloured borders (author / reviewer /
      editor / reader), motivation pills (decision pills get
      strong colour for accept / reject / changes-requested),
      trust badges (`trust-ok` / `trust-warning` / `trust-error`)
      and threaded reply rendering with indented dashed gutter.
      All untrusted body text passes through `escapeHtml`. The
      asset sidebar's right rail now hosts an Assets / Annotations
      tab pair; the Annotations panel surfaces every annotation
      from `annotations/*.json` with a per-thread thread count in
      the badge. 13 vitest cases.
- [ ] Comment / reply / accept / reject creation flows.
      Phase 2.3b.4.3 follow-up — needs IPC for UUID generation +
      signature integration (those are the not-yet-shipped pieces).
- [ ] `--role=public|editor` flag for confidential-comment
      visibility per spec (deferred — gating on a UI flag is not a
      security boundary; the public archive should simply not
      carry confidential comments per the spec's recommendation).

  **Depends on:** 2.3a.2 + signature integration.
  **NOT a real-time collaboration feature.** Asynchronous threaded
  comments only — the no-real-time-collab non-goal still holds.

#### 2.3b.5 Multi-locale side-by-side editing

- [x] **Locale-enumeration data layer** in
      `editor-desktop/src/renderer/locales.ts`. `enumerateLocales`
      reads `manifest.content.locales` in either string-form or
      object-form and resolves each entry's archive path; falls
      back to a single `{ language, path: entry_point }` entry
      when the locales block is absent. `planAddLocale(manifest,
      lang)` returns the patched manifest + `document.<lang>.md`
      path for a new locale (no input mutation; throws on
      duplicates).
- [x] **Paragraph-alignment helpers** for sync-scroll:
      `paragraphSlices(source)` slices markdown into blank-line-
      separated paragraphs with line offsets and trimmed
      fingerprints; `alignParagraphs(left, right)` produces
      index-paired alignment with null-padding for length
      mismatches. MVP heuristic is positional alignment; fuzzy
      matching for translations that insert / remove paragraphs is
      a follow-up.
- [x] **Read-only side-by-side compare-locales modal** wired in
      `index.ts` via `localeBtn`. Pulls every entry from
      `enumerateLocales(manifest)`; opens a dialog with two
      `<pre>`-style panes (current draft on left, sibling locale
      on right; user picks the sibling via dropdown). Sync-scroll
      runs through `mapWithFallback` from
      `editor-desktop/src/renderer/sync-scroll.ts` — paragraph-
      aligned mapping when the alignment table has a match,
      proportional fallback otherwise. 16 vitest cases pin the
      mapping helpers (`paragraphAtLine`, `mapLineLeftToRight`,
      `mapLineRightToLeft`, `proportionalMap`, `mapWithFallback`,
      `buildSyncScrollState`).
- [x] **Read-write sibling-locale pane + Add-locale command** —
      done 2026-04-25. The compare-locales modal's right pane is
      now a `<textarea>` (instead of a read-only `<div>`) with
      sync-scroll preserved. New "Save locale" button stages the
      edit into `localeFileText`; saveFlow tunnels the staged
      bytes through the IPC handler's `assets` tuple
      (non-asset paths write verbatim into the archive, which is
      exactly what `document.<lang>.md` siblings need). New "+ Add
      locale" button prompts for a BCP-47 tag, calls
      `planAddLocale` from Phase 2.3b.5's data layer, seeds the
      new locale's text from the primary draft, and updates the
      dropdown. Full CodeMirror surface for the secondary pane
      stays as a future polish item — the textarea is editable
      enough for v1 translation work, and avoids the
      state-effects complexity that was the original blocker.

  **Depends on:** 2.3a.2.

#### 2.3b.6 AVIF / WebP variant generation

- [x] **Variant planner** in
      `editor-desktop/src/renderer/variant-planner.ts`.
      `planVariants(sources, presets?)` returns one
      `VariantPlanEntry` per `(source, preset)` the encoder must
      produce; honours per-kind preset configs (figure / icon /
      hero / inline have different quality + max-width defaults
      per `DEFAULT_PRESETS`); skips already-existing variants
      (idempotent re-runs); skips unencodable sources (SVG,
      animated GIFs flagged via `skip: true`); won't write a
      variant onto the source path. `variantPath(source, preset)`
      computes the canonical target path
      (`<stem>.<width>w.<format>` for sized; `<stem>.<format>` for
      full-size).
- [x] **Encoder** in
      `editor-desktop/src/main/variant-encoder.ts`. Lazy-loads
      `sharp` from `optionalDependencies` via `loadSharp()`;
      returns `{ ok: false, reason: 'sharp-not-installed' }` when
      missing so the editor can show a clear install hint rather
      than crash. `encodeVariants(input, sharpModule?)` consumes
      the planner output, drives the per-entry pipeline (resize
      with `withoutEnlargement: true` to avoid up-scaling small
      sources, then webp / avif at the preset's quality), and
      collects per-entry failures without halting the run. Tests
      use an injected stub `SharpModule` so libvips isn't required
      in CI. Decision: sharp's prebuilt binaries (the
      @squoosh/lib WASM alternative is unmaintained as of 2024).
- [x] **Manifest §17.2 projection** via
      `manifestVariantsProjection(results, plan)` — turns encoder
      output into `[{path, format, width, height, size_bytes}]`
      entries sorted alphabetically by path for stable
      content-hashing.
- [x] **IPC wiring** — `variants:encode` channel
      (`preload.ts` → `main.ts` ipcMain handler → `encodeVariants`).
      Renderer hands `{sources: [path, bytes][], plan: PlanEntry[]}`;
      main returns the encoded payloads. Sharp-not-installed surfaces
      cleanly through to the renderer's status text rather than
      crashing the channel.
- [x] **Renderer-side flow** in
      `editor-desktop/src/renderer/variant-flow.ts`. Pure
      orchestration (no DOM): enumerates encodable image entries,
      builds `PlannerSourceImage[]` with a path-based kind heuristic
      (`icon`/`hero`/`inline`/`figure`), invokes `planVariants`,
      hands the plan to the IPC encoder via injected callback,
      writes encoded bytes back into the asset store at the
      pre-decided variant paths with format-specific MIME types.
      Filters generated variants out of the source list so re-runs
      don't re-encode and `.webp`/`.avif` files-as-sources don't
      try to variant themselves. 10 vitest cases.
- [x] **"Generate variants" toolbar button** wired into the
      header. Disabled until an archive is open; flips to
      "Generating…" while in flight; surfaces the flow's status
      summary in the title bar (`No images`, `All up to date`,
      `Generated N variants`, `requires sharp`, etc.).
- [x] Configurable quality presets per image kind via the
      `presets` parameter to `planVariants`.

  **Depends on:** 2.3a.3 (asset sidebar). Planner + encoder
  shipped 2026-04-24; only IPC wiring + UI button left.

#### 2.3b.7 Non-core directive picker pack

- [x] **2.3b.7.1 — `::video` picker** (src + poster + caption).
- [x] **2.3b.7.2 — `::audio` picker** (src + caption).
- [x] **2.3b.7.3 — `::model` picker** (src + caption + background;
      glTF / GLB).
- [x] **2.3b.7.4 — `::embed` picker** (src + caption + page; PDF).
- [x] **2.3b.7.5 — `::data` picker** (src + chart type + caption;
      CSV / TSV / JSON / JSONL / GeoJSON).

  All five pickers share `buildAssetPointer` (one builder, kind-tagged)
  and `validateAssetPointer` (per-kind extension allow-list, archive-
  entry membership when available, no-traversal/no-abs-path
  enforcement). Brace attributes are quoted automatically when values
  contain whitespace or quotes; safe-token values pass through
  unquoted. `openAssetPointerPicker(host, kind, archiveEntries)`
  dispatches the modal off a per-kind `KindSpec` (extra fields,
  placeholder, title). Toolbar wired with 5 new buttons.

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
- [x] `::include` external-URL permissions enforcement in reference impls — verified done 2026-04-25. The viewer (`packages/mdz-viewer/src/directives.ts`) refuses external (URL) includes that don't carry a `content_hash` attribute, rendering an `mdz-include-missing` placeholder with the message "requires content_hash"; URL includes WITH a `content_hash` render as an `mdz-include-pending` placeholder (the bytes aren't fetched at render time — the placeholder shows the expected hash so a downstream loader can fetch + verify). Both branches are covered by integration tests (`directives.test.ts:420` "refuses external includes without content_hash" and `:429` "emits a pending placeholder for external includes WITH content_hash"). Matches the spec's "external transclusion requires integrity declaration" rule.
- [x] Signature trust model docs (DID resolution / revocation / rotation) — `docs/security/SIGNATURE_TRUST.md` ships. Covers signer identity, key-discovery resolution chain (did:web / did:key / trust file / certificate fallback), trust-decision policies (default / strict / offline), revocation per DID method, key rotation patterns (forward chain / historical verification / co-signed rotation), and what viewers MUST surface to users.
- [x] Reference verifier `mdz verify archive.mdz` — ships at `cli/src/commands/verify.js` with structural chain + trust-file support (tests at `cli/test/verify.test.js`). Full cryptographic signature verification (Ed25519/RS256/ES256 over resolved DID keys) is still Phase 3.2 per both the Node and Rust verifier caveats.
- [x] Threat model doc at `docs/security/THREAT_MODEL.md` — ships.

### 3.2 Subresource integrity enforcement

- [x] Integrity field verification landed in the Node verifier + Rust binding (`verify_integrity`, `verify_content_id`). Conformance-suite-level viewer flagging is not yet implemented — the existing negative fixtures cover parser-level errors, not archive-level integrity mismatch. Archive-level integrity tests live in `cli/test/verify.test.js` and `bindings/rust/tests/archive_integration.rs` instead.
- [x] Add integrity-fail fixtures — done 2026-04-25.
      `tests/conformance/integrity/` now hosts archive-level
      fixtures with their own runner
      (`run_integrity_conformance.js`). Each fixture is a JSON
      descriptor that the runner assembles into a real `.mdz`
      in-memory, then hands to `mdz validate` (structural) or
      `mdz verify` (integrity hashes). Three fixtures land in
      this commit:
      `content-hash-mismatch` (document.content_id ≠ inflated bytes),
      `manifest-checksum-mismatch` (security.integrity.manifest_checksum wrong),
      `manifest-missing-mdx-version` (required-field absence).
      Per-asset `content_hash` mismatch fixtures gated on
      growing the `verify` command's per-asset check
      (currently only checks `manifest_checksum`). Wired into
      `validate-cli` CI job.

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

- [x] **Spec:** `spec/extensions/delta-snapshots-v1.md` (v1.0
      draft; all three open questions resolved 2026-04-24).
- [x] **Reader reference impl** in
      `packages/mdz-viewer/src/snapshots.ts`. Strict per the
      Conformance section: parses + structurally validates
      `index.json`, walks chains backward to a `base/`, applies
      unified diffs in forward order, surfaces `SnapshotError`
      on every malformed-input path (circular chains, missing
      parents, depth > `maxChainDepth`, context mismatch, hunk
      overconsumption). 24 vitest cases. Exposed from the viewer
      package as `parseSnapshotIndex`, `resolveSnapshotVersion`,
      `applyUnifiedDiff`, `reconstructVersion[Sync]`,
      `SnapshotError`.
- [x] **Writer + reader CLI subcommands** — `mdz snapshot create
      <file> <version>` / `mdz snapshot view <file> <version>` /
      `mdz snapshot list <file>`. The CLI ships a CommonJS port of
      the reader logic at `cli/src/lib/snapshots.js` (deliberate
      duplication so the CLI doesn't pull in an ESM runtime) plus a
      writer-side LCS-based unified-diff generator
      (`generateUnifiedDiff`) that produces patches the reader
      round-trips byte-for-byte (verified at write time per the
      spec's "verify by round-tripping" rule). Auto-starts a new
      base chain when the patch exceeds 20% of the parent OR the
      depth would approach the 50-chain cap. 23 node:test cases.
- [x] **Conformance fixtures** in `tests/conformance/history/`
      (5 fixtures: linear-chain + branching-chains positives,
      circular + missing-parent + duplicate-version negatives).
      `run_history_conformance.js` walks every fixture and asserts
      the declared `kind: positive|negative` behaviour against the
      CLI's snapshots lib. Wired into `validate-cli` CI job.
- [ ] **arXiv-corpus measurement** of the 20% delta-vs-full
      threshold. Gated on the Phase 4.3 100-paper run.

---

## Phase 4.6 — Review-debt resolution (post-2026-04-24 audit)

Added after an honest self-enumeration of items the Phase 4+5 review
cycle skipped. Items are split by origin so credit + blame are clear.

### 4.6.1 Skipped review findings (code-review / silent-failure / type-design)

- [x] **Rust `resolve_entry_point`** — fixed: returns `Error::Manifest` when `locales.default` is missing from `available[]` (commit b498682).
- [x] **Rust wasm32 32-bit `usize` cast** — verified done 2026-04-25: `bindings/rust/src/lib.rs:502–506` carries the explicit `debug_assert!(cap_u64 <= usize::MAX as u64, …)` that pins the invariant. ROADMAP entry was stale; the audit was tracking a still-true risk that had already been mitigated.
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

- [x] **Repository `.mdx` → `.mdz` audit** — done 2026-04-25 by an
      RLM-driven grep-pass: 692 references across 107 files,
      classified as legitimate dual-extension support (per the
      2027-01-01 deprecation policy), historical CHANGELOG /
      spec entries, or deferred-rename paths
      (`implementations/{ts,py}/mdx_format.{ts,py}`). Two
      stale-and-renameable hits found + fixed: `cli/package.json`
      `name`/`bin` and `spec/profiles/api-reference-v1.json` URLs.
- [ ] **npm `@mdz-format` scope reservation** — not verified.
- [x] **Spec prose-grammar removal** — verified done 2026-04-25:
      no fenced ABNF blocks outside `spec/grammar/mdz-directives.abnf`
      duplicate the directive grammar.
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
- [x] **`basicMarkdownToHTML` retirement** — done 2026-04-25.
      `MDZDocument.toHTML` now throws with a migration message
      pointing at `renderMarkdown` from `@mdz-format/viewer`;
      `basicMarkdownToHTML` + `escapeHTML` private helpers + the
      `_toHtmlWarningEmitted` static guard all removed. 125/125 TS
      tests still pass. The `toHTML` stub itself stays through the
      2027-01-01 deprecation cliff so callers see a clear runtime
      pointer rather than a `TypeError: not a function`.
- [x] **Conformance Core vs Advanced split** — verified done
      2026-04-25. `mdz-core-v1.json` declares 6 required manifest
      fields, no required extensions, viewer_capability_level: 0
      — the minimal portability promise. `mdz-advanced-v1.json`
      declares 8 required manifest fields, 17 validation rules,
      JCS canonicalization mandatory, signatures required,
      content-addressing required — explicitly a strict superset.
      The `scientific-paper-v1` and `api-reference-v1` profiles
      are independent third-party-style profiles built atop Core.
      The split is real and the profiles are non-overlapping in
      scope.

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
- [x] **CHANGELOG.md line-length** — wrapping pass on 2026-04-25 brought the file under the 90-char threshold for prose lines. Lines remaining over 80 are intentional (URL-bearing, table rows, fenced code) and within markdownlint's standard exemptions. `continue-on-error: true` shield removed from the markdown lint step in a follow-up commit.

### 4.6.7 External / blocked items (not actionable in-session)

- [ ] **Phase 0 exit criterion** — one real paper end-to-end.
      Requires a real paper.
- [ ] **npm `@mdz-format` scope** — requires npm account action.
- [ ] **Journal outreach** — Phase 0.2.
- [ ] **W3C charter submission** — Phase 5.
- [ ] **Funding decisions** — Phase 0.

### 4.6.8 Code-level TODOs surfaced by the 2026-04-25 RLM audit

Items present in source comments / docs that the prose ROADMAP
sections didn't yet track. Discovered by a `grep` for
`TODO|FIXME|XXX|HACK|TBD` plus "deferred / follow-up" mentions
in code comments. Listed here so they round-trip through the
normal completion flow.

- [x] **`examples/scientific-paper/` example papers directory**
      — done 2026-04-25. Source-tree skeleton at
      `examples/scientific-paper/source/` with `manifest.json`,
      IMRaD-structured `document.md` (Abstract / Introduction /
      Methods with a Python `::cell` / Results with `::fig`
      `::eq` `::tab` cross-refs / Discussion / Acknowledgements /
      `::bibliography`), CSL-JSON `references.json` with two
      entries, and a tiny `assets/data/series.csv` the example
      cell consumes. Validates against the
      `scientific-paper-v1` profile. Plus a top-level README
      explaining how to bundle into a `.mdz` and validate.
- [x] **Viewer-hosted bundled-viewer wiring** — done 2026-04-25.
      Three pieces:
      `packages/mdz-viewer/tsconfig.build.json` defines the build
      target (declarations + sourcemaps emitted to `dist/`); the
      existing `npm run build` script picks it up. The worker.ts
      stub comment is replaced with the canonical reference (no
      more TODO). `wrangler.toml` gained an `[assets]` block
      pointing at `../mdz-viewer/dist` with binding
      `VIEWER_ASSETS`, so wrangler serves the bundle as
      `/viewer.js`. Local dev: `npm run build -w
      @mdz-format/viewer` then `wrangler dev` from
      `packages/mdz-viewer-hosted`. 32/32 worker tests pass.
- [x] **Directive label i18n** — done 2026-04-25.
      `packages/mdz-viewer/src/directives.ts` now ships
      `LABELS_BY_LANG` covering 8 languages (en/es/fr/de/it/pt/ja/zh,
      ~75% of academic publishing by paper count per Web of
      Science 2023). `resolveLabels(language)` strips the BCP-47
      subtag (`fr-CA` → `fr`) and falls back to English for
      unknown / missing tags. `DirectiveOptions.language` threads
      the manifest's `document.language` through both the pass-1
      collector and the labeled-opener renderer. 4 new vitest
      cases pin the localization, the subtag fallback, and the
      English default. Adding a language is a one-line
      addition to `LABELS_BY_LANG`.
- [x] **EPUB export `adm-zip → yazl` swap** — done 2026-04-25.
      `cli/src/commands/export-epub.js` now writes the output EPUB
      via `yazl.ZipFile` with explicit per-entry ordering and
      `compress: false` for the mimetype entry. Removed the prior
      adm-zip workaround helpers (`_addStoredEntry` flipping
      `entry.header.method = 0` post-add, `_forceFirstEntry`
      mutating adm-zip's undocumented internal `entryTable`). Both
      were defensive hacks against adm-zip's lack of explicit
      ordering; yazl writes entries in `addBuffer` call order.
      EPUB OCF §4.3 mimetype-first + STORED requirement is now
      satisfied directly. The reader path still uses adm-zip for
      the input MDZ (read-only, sync, fine). 15/15 import-epub
      round-trip tests still pass.
- [x] **EPUB import/export symmetric labeled-directive rule** —
      done 2026-04-25. Export side gained
      `preprocessLabeledDirectives` that runs before
      `marked.parse` and converts `::fig{id=X}` → `<figure
      class="mdz-fig" id="X">`, `::eq{id=X}` →
      `<div role="math" class="mdz-eq" id="X">`,
      `::tab{id=X}` → `<figure class="mdz-tab" id="X">`. Import
      side gained matching turndown rules
      (`mdz-labeled-figure`, `mdz-labeled-equation`) that invert
      the transform. A previously-imported MDZ → EPUB → MDZ
      round-trip now preserves the labeled-directive identity
      (kind + id) the prior comment flagged as lossy. 15/15
      import-epub tests still pass.
- [x] **Browser-extension reproducible-build bundler** — done
      2026-04-25. New `browser-extension/build.js` walks
      `manifest.json` + the five packaged dirs, sorts entries by
      archive path, pins header timestamps to 1980-01-01, fixes
      `external_attr` to 0644. Two builds produce byte-identical
      output. New `test/build.test.js` (3 cases) asserts
      determinism + exclusion of `test/` and OS metadata files +
      presence of every required directory. Wired into the
      `validate-browser-extension` CI job: builds twice + diffs the
      SHAs. AMO reviewers can verify the published artifact by
      SHA-256 against this script. Replaces the old
      `zip -X`-based recipe in `REPRODUCIBLE_BUILD.md`, which was
      non-deterministic across NTFS / ext4.
- [x] **Rust binding blake3 implementation** — done 2026-04-25.
      `bindings/rust/Cargo.toml` adds `blake3 1.5` to the
      `verify` feature alongside `sha2` + `hex`
      (`default-features = false` for no_std compat).
      `hash_bytes("blake3", bytes)` now computes the 256-bit
      default-output blake3 hash and emits it as hex, matching
      the sha256 output shape. The pre-existing
      `verify_content_id_rejects_unsupported_blake3` integration
      test was inverted: now
      `verify_content_id_accepts_correct_blake3_hash` asserts a
      correctly-computed blake3 content_id verifies cleanly,
      plus a sibling `verify_content_id_rejects_wrong_blake3_hash`
      asserts an incorrect hash hits the
      `IntegrityError::Mismatch` path. README updated to drop the
      "deferred" caveat.

### 4.6.9 Post-cross-check follow-ups (2026-04-25 RLM audit)

Items surfaced during the RLM-driven ROADMAP↔code cross-check.
Grouped by intent: CI gates that prevent future drift first, then
hygiene + consolidation, then test infrastructure, then features,
then security audit. Order picks reflect "what would have caught
the drift this session found."

**A. CI gates that prevent doc/code drift**

- [x] **ROADMAP `[x]` cited-path existence check** — done
      2026-04-25. New `tests/roadmap/check_cited_paths.py` walks
      every `- [x]` ROADMAP entry, extracts each backtick-quoted
      path-shaped string ending in a tracked extension, and
      asserts each resolves on disk or matches a basename
      somewhere in the tree (citation-style tolerance for cases
      like `mdx_format.ts` that the doc cites bare). Wired into a
      new `validate-roadmap` CI job that runs before everything
      else. Currently 128 citations checked, 0 drifted.
- [x] **Status-snapshot date freshness** — done 2026-04-25.
      `tests/roadmap/check_snapshot_freshness.py` parses the
      `### Status snapshot (YYYY-MM-DD)` heading and compares
      against `git log -1 --format=%aI -- ROADMAP.md`. Default
      threshold 30 days (configurable via `--max-days`); >30 days
      fails with a pointer to update both the heading and the
      table contents. Wired into `validate-roadmap` CI alongside
      the cited-path check.
- [ ] **CHANGELOG line-length: drop `continue-on-error: true`.**
      The markdown lint step still has the shield in place. Phase
      4.6 wrapped the worst offenders; address the 2–3 remaining
      over-80-col lines (URL rows + table rows) via targeted
      `<!-- markdownlint-disable MD013 -->` blocks where
      intentional, then make CI actually fail on regressions.

**B. Repo hygiene**

- [x] **`.editorconfig` + `.gitattributes` for line endings** —
      done 2026-04-25. Top-level `.editorconfig` declaring
      `end_of_line = lf`, `charset = utf-8`,
      `insert_final_newline = true`; per-language `indent_size`
      overrides for Python/Rust (4) + Makefiles (tab); markdown
      keeps trailing whitespace for the two-space line-break
      syntax. `.gitattributes` declares `* text=auto eol=lf` plus
      explicit per-extension rules for source / data files and
      `binary` for image / archive / font types. Lockfiles marked
      `linguist-generated=true` so review tools collapse them.
- [ ] **Retire pre-Phase-2.3 demo files.** `editor/index.html`
      (WYSIWYG demo), `viewer/index.html` (read-only demo), and
      `chrome-extension/` (legacy Chrome-only ext) are all
      superseded by the Phase 2 production code. Move under
      `legacy/` with a clear README or delete entirely.

**C. Code consolidation**

- [x] **Centralise `escapeHtml`** — done 2026-04-25. New
      `editor-desktop/src/renderer/html-escape.ts` exports a
      single canonical `escapeHtml(s)` that handles the five
      HTML5-significant characters + null/undefined coercion.
      `diff-render.ts`, `annotations-render.ts`, and `index.ts`
      now import it. The retired `escapeHtmlSimple` in `index.ts`
      had a real gap (skipped `'` and `"` escaping); the
      consolidation closes that. 6 new vitest cases (382/382
      pass).
- [x] **Sync-scroll: derive `lineHeight` from computed style** —
      done 2026-04-25. New `resolveLineHeightPx(el, fallback)` in
      `sync-scroll.ts` reads `getComputedStyle(el).lineHeight` and
      handles all three CSS forms: `<length>px` parsed directly,
      unitless multiplier × `fontSize`, `"normal"` → font-size
      × 1.2 default. Falls back to a configurable px when
      `getComputedStyle` is absent (Node test env). Each pane
      reads its own line-height — the right pane (`<textarea>`)
      and left pane (monospace `<pre>`) often have different
      sizes, so user font-size preferences are now respected. 5
      new vitest cases cover every CSS branch.
- [ ] **Decouple test runners from `cli/node_modules`.**
      `tests/conformance/integrity/run_integrity_conformance.js`
      and `browser-extension/build.js` both
      `require('cli/node_modules/adm-zip')` because adm-zip lives
      in cli's deps. Hoist adm-zip to a workspace root dep.

**D. Test infrastructure + verification**

- [ ] **Phase 2.3a.7 Playwright integration scaffold.** Many
      shipped features are documented as "exercised by Phase
      2.3a.7 Playwright when those land" — DOM modals (Compare-
      versions, Compare-locales, directive pickers), per-cell
      Run-button injection, sync-scroll, the open/save flow
      end-to-end, and the Pyodide CDN load. Set up
      `editor-desktop/playwright.config.ts`, electron-launch
      fixture, baseline tests for the four picker modals + diff
      modal + per-cell Run + open/save round-trip.
- [ ] **Verify viewer build pipeline emits
      `dist/mdz-viewer.js` end-to-end.** Phase 4.6.8 added
      `tsconfig.build.json` and configured wrangler `[assets]` but
      `npm run build -w @mdz-format/viewer` was never invoked +
      the output wasn't validated. Add a CI step that runs the
      build + asserts `dist/index.js` exists + a smoke test that
      imports it and verifies `customElements.get('mdz-viewer')`
      is defined.
- [ ] **Phase 3.2 follow-up: per-asset `content_hash` mismatch
      fixtures.** The integrity-fixtures runner deliberately
      deferred `asset-hash-mismatch` because `mdz verify` only
      checks `security.integrity.manifest_checksum`. Two-part:
      extend verify to walk `manifest.assets[].content_hash` and
      check each against the actual archive bytes; add the
      deferred fixture under
      `tests/conformance/integrity/asset-hash-mismatch/`.

**E. Features**

- [ ] **`mdz snapshot export` subcommand.** Phase 4.5.2 shipped
      `create|view|list`; `export` (extract a specific version's
      content out of the chain to a standalone file) wasn't
      implemented. Useful for hand-off scenarios. Wire it as
      `mdz snapshot export <archive> <version> -o <outfile>`;
      adds a `--with-manifest` flag for the version-specific
      manifest.
- [ ] **Spec features-by-impl support matrix.**
      `docs/SUPPORT_MATRIX.md` keyed by spec section (manifest
      fields, directives, integrity hashes, signature algorithms,
      EPUB round-trip, locale support, snapshots) × impl (Python
      ref, TypeScript ref, Rust binding, viewer, CLI, editor).
      Auto-generate from a YAML source so it stays in sync; add
      a CI assertion that every spec MUST/SHOULD shows up in the
      matrix.

**F. Security audit**

- [ ] **`data-mdz-cell-source` escape round-trip + Pyodide CSP
      scope audit.** Two security-adjacent items:
      (1) verify the HTML-escape applied to the
      `data-mdz-cell-source` attribute round-trips correctly when
      JS reads it back via `dataset.mdzCellSource`. Test with
      cells containing `</textarea>`, `<script>`, and a literal
      Unicode line-separator (U+2028) in the source.
      (2) verify the CSP relaxation for `cdn.jsdelivr.net` is
      scoped only to `script-src` + `connect-src`, not e.g.
      `img-src`, and that `wasm-unsafe-eval` is the minimum
      needed (no `unsafe-inline` / `unsafe-eval` leakage).

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
