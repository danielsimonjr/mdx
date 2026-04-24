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

- [ ] Repo rename `danielsimonjr/mdx` → `danielsimonjr/mdz` (GitHub preserves redirect)
- [ ] File extension `.mdx` → `.mdz` (keep `.mdx` as a read-only alias during transition)
- [ ] MIME type `application/vnd.mdx-container+zip` → `application/vnd.mdz-container+zip`
- [ ] All directory names: `/mdx/**` → `/mdz/**`
- [ ] All class/type names: `MDXDocument` → `MDZDocument`, `MDXManifest` → `MDZManifest`, etc.
- [ ] npm package name reservation (if published): `@mdz-format/core`, `@mdz-format/viewer`
- [ ] Domain: move spec to `mdz-format.org` (keep old domain redirecting)
- [ ] Spec title: "Markdown eXtended Container" → "Markdown Zipped Container"
- [ ] Update `CLAUDE.md`, `README.md`, `CHANGELOG.md`, all agent-facing docs
- [ ] Grep-pass: `grep -rIn 'mdx' .` — audit every remaining reference

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
- [ ] **CSL / bibliography support** — `references.json` in CSL-JSON format
      inside the archive; `::cite[key]` directive for in-text citations
      resolving against it; a `bibliography` block for the rendered list.
      Match Quarto / Pandoc conventions so existing `.bib` → `.csl-json`
      tooling works unchanged.
- [ ] **Figure, equation, table numbering + cross-references.** `::fig{id=f1}`,
      `::eq{id=e1}`, `::tab{id=t1}` as labelable blocks; `::ref[f1]` renders
      "Figure 1" auto-numbered by document order. Mirrors LaTeX `\label`/`\ref`
      semantics. Must ship in v2.1 before Phase 2 viewer release.
- [ ] **DOI minting integration** — documented workflow for Crossref (for
      journal papers) and DataCite (for Zenodo/OSF). Not a format feature; a
      publishing guide. Lives at `docs/for-authors/DOI.md`.
- [ ] **Peer-review annotation spec** — extend the existing W3C Web Annotation
      layer with reviewer-role + accept/reject/request-changes motivations,
      signed reviewer identity. Needed for the "peer-review round-trips"
      claim to be real.
- [ ] **SPDX licensing metadata** — manifest requires `document.license.spdx`
      field with SPDX identifier (`CC-BY-4.0`, `CC0-1.0`, `MIT`, etc.) for
      automated OA compliance checking. Update the v2.0 schema.
- [x] **`.ipynb` → MDZ migration path** — `mdz import-ipynb` ships as
      `cli/src/commands/import-ipynb.js`. Cells → `::cell`; outputs
      (stream/display_data/execute_result) → `::output` with
      documented
      MIME-bundle → `::output` mapping (text/plain, image/png, application/json,
      application/vnd.jupyter.widget-state+json → warning), metadata round-trip
      for `kernelspec` / `language_info`, cell-level execution_count
      preservation. This is the #1 adoption on-ramp.

**General-purpose deliverables:**

- [ ] `docs/POSITIONING.md` — one-page pitch for researchers
- [ ] `docs/COMPETITIVE.md` — rolling comparison against Quarto, Jupyter Book,
      Curvenote, Manubot, Stencila (see Posture block above)
- [ ] `docs/for-authors/SUBMITTING.md` — how to convert an existing ipynb+tex
      workflow to MDZ
- [ ] `docs/for-journals/EDITORIAL.md` — how a journal validates an MDZ
      submission against its profile
- [ ] `docs/for-reviewers/REPRODUCING.md` — how a reviewer re-executes cells
      and reads the provenance chain
- [ ] `spec/profiles/scientific-paper-v1.json` (already drafted) — tighten
      required sections (IMRaD), citation formats, DOI handling, data
      statement requirements
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
- [ ] Update `README.md` to lead with the scientific-paper use case.
- [ ] Add `STATUS: experimental research project (tooling is pro-grade; format
      is not production-stable)` banner to `README.md` until at least one real
      paper is published as MDZ at arXiv / Zenodo / OSF / a journal.

### 0.3 Extract enterprise features to extension profile

The v2.0 spec bundled too much. Core stays minimal; advanced features move out.

- [ ] Create `spec/profiles/mdz-advanced-v1.json` — a profile that requires
      JCS canonicalization, multi-sig chains, DIDs, revocation URLs, content-addressed
      aliases, and detailed provenance DAG.
- [ ] Core spec keeps: v1.1 alignment + attributes, `::cell` + `::output` + `::include`,
      basic accessibility, simple signatures, basic i18n.
- [ ] Add conformance levels: **Core** (required) / **Advanced** (opt-in).

---

## Phase 1 — Formal foundations (6–8 weeks)

### 1.1 Write a formal grammar

The current prose spec is why two implementers can silently disagree on edge
cases (nested containers + backticks + quoted attrs, Unicode normalization,
etc.). Replace it.

- [ ] Define the block-attribute + directive grammar in ABNF (RFC 5234 style) in `spec/grammar/mdz-directives.abnf`
- [ ] Provide a PEG grammar in `spec/grammar/mdz-directives.pegjs` for implementers
      targeting peg/ohm/tree-sitter
- [ ] Publish a tree-sitter grammar `tree-sitter-mdz` for editor integration
      (syntax highlighting, go-to-def across includes, etc.)
- [ ] Remove the prose grammar from the spec body; keep only ABNF + examples

### 1.2 Rebuild the reference parser

Current `alignment_parser.py` is ~25 ad-hoc regexes. Replace with a proper AST parser.

- [ ] New Python parser built on Lark (PEG) — generates AST matching grammar
- [ ] New TypeScript parser built on Chevrotain (TypeScript-friendly PEG)
- [ ] Retire the regex-based parser; keep it only as a fallback for malformed
      input where fail-fast would be too aggressive (opt-in with `--legacy`)
- [ ] Retire `basicMarkdownToHTML` in `mdx_format.ts` — it's a toy. Route all
      Markdown rendering through `marked` or `markdown-it` with an MDZ plugin.

### 1.3 Conformance test suite

The single highest-leverage investment for interoperability.

- [ ] Create `tests/conformance/` with ~200 fixtures organized by category:
  - `positive/` — MUST accept, with expected AST
  - `negative/` — MUST reject, with expected error class
  - `roundtrip/` — AST → serialize → parse → AST (byte-compare)
  - `edge/` — Unicode, RTL, surrogate pairs, whitespace-only, 4K lines, etc.
- [ ] Each fixture has a `.expected.json` declaring expected AST / error code / roundtrip-hash
- [ ] CI job: every reference implementation runs the full suite and publishes
      pass/fail; any implementation with <100% on Core blocks a spec release.
- [ ] Cross-implementation test: Python writes, TypeScript reads, byte-compare
      the AST. Same for TS→Py. This catches encoder/decoder divergence that
      per-impl tests miss.

### 1.4 Fuzz + property-based testing

Previous version named `atheris` and `jazzer.js` — both effectively unmaintained
as of 2024 (Google archived atheris; Code Intelligence wound down jazzer.js).
Use actively-maintained tooling instead:

- [ ] **Python:** `hypothesis` for property-based testing (well-maintained,
      ships hypothesis.strategies for Markdown-shaped input). `afl++` for
      coverage-guided fuzzing if we need that later.
- [ ] **TypeScript:** `fast-check` for property-based testing. No coverage-
      guided JS fuzzer is currently well-maintained; treat this as a known gap.
- [ ] CI job: property tests run every PR; 500 iterations per property.
      Failures block merge.
- [ ] Corpus seeded from the conformance suite.

### 1.5 Content-addressing: evolve, don't restart

The v2.0 spec already ships `content_hash` with `sha256:` / `sha512:` / `blake3:`
algorithms and the `assets/by-hash/sha256/<hex>` alias path (spec §9.2, §9.3,
§10.3). Previous roadmap draft called this "half-done" — wrong, it's shipped.

The real questions for v3.0 (not v2.x):

- [ ] Should `assets/by-hash/` avoid byte duplication? The current alias
      duplicates bytes. Options: (a) keep duplication (simple, ZIP-friendly),
      (b) require exactly-one-path per content-hash and use the `by-hash/`
      path as canonical (breaking change), (c) define a manifest-only alias
      table with no filesystem duplication.
- [ ] Should we adopt **multihash + CIDv1** for alignment with IPFS / OCFL?
      This is a v3.0 breaking change. Decision gate: does the scientific-paper
      niche care? Survey ≥10 Zenodo/OSF users; they use OAI-PMH and BagIt,
      neither of which is CID-native. Probable answer: no, defer indefinitely.
- [ ] Document that `content_hash` is the canonical field and `checksum` is
      deprecated (already done in v2.0 type defs; make it louder in the spec).

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
- [ ] Handles: CommonMark + GFM + math (KaTeX, lazy) + images + video + audio +
      `::cell` + `::output` + `::include` + alignment/attributes + alt-text + ARIA
      + cross-references (`::ref`) + citations (`::cite`)
- [ ] Offline-first: uses IndexedDB for archive caching
- [ ] Accessible by default: full keyboard navigation, screen-reader tested,
      **WCAG 2.1 AA baseline** (raises to 2.2 AA opt-in — 2.1 is what OA journals
      currently reference)
- [ ] Published to npm as `@mdz-format/viewer` (assumes `@mdz-format` scope is
      reserved during Phase 0.1; if unavailable, fall back to `@mdz-core/viewer`)
- [ ] Demo site: drop an `.mdz` file into `viewer.mdz-format.org`, get rendering

### 2.2 Hosted render-any-MDZ service

- [ ] Deploy `view.mdz-format.org?url=<archive-url>` — free, no-auth, CORS-friendly
- [ ] Serverless rendering (Cloudflare Workers / Vercel Edge)
- [ ] Cache via CDN with content-hash keys (stable URLs for immutable archives)
- [ ] Generate social-share preview cards (OG image from first page / cover)

Goal: anyone can put `.mdz` in GitHub and share a rendering link. Removes the
"no users because no viewer" chicken-and-egg.

### 2.3a Desktop editor MVP (4–6 months)

The first editor ships only what's *required* to produce a publishable paper.
"Adobe Acrobat-class" is the long-term target (see 2.3b), not what v1.0 is.

- [ ] **Tech stack:** Electron + Vite + CodeMirror 6 + web-component viewer (reuse 2.1).
      Auto-update via `electron-updater` (not Squirrel.Windows directly — Squirrel.Windows
      is effectively unmaintained; `electron-updater` targets NSIS and Squirrel.Mac
      through one API).
- [ ] **Split-pane editor:** source Markdown + live rendering + asset sidebar
- [ ] **Visual authoring for core directives:** GUI pickers for `::cell`,
      `::include`, `::fig`, `::cite` (the scientific-paper four)
- [ ] **Import from .ipynb:** drag-drop an ipynb, get an MDZ shell with cells
      pre-populated. This is the on-ramp.
- [ ] **Asset management:** drag-drop, content-hash computation on save
- [ ] **Code-signed installers for Mac, Windows, Linux** (reuse signing infra
      from the MermaidJS desktop project)

**MVP milestone:** a grad student can author a reproducible paper end-to-end
and export it to a journal as JATS-XML. Nothing more. Ship and listen.

### 2.3b Editor Pro features (6–12 months after MVP, based on real feedback)

Only build these after the MVP has real users and we know what they want:

- [ ] Jupyter kernel execution via Pyodide (honest caveat: Pyodide is ~10MB
      download, supports most pure-Python and a large-but-not-complete set of
      C extensions; arbitrary `pip install` does NOT work for compiled wheels;
      numpy/scipy/matplotlib/pandas work, tensorflow/torch do not. Reviewers
      get "re-execute most cells" not "re-execute any cell")
- [ ] Accessibility checker: image alt text, heading order, color contrast,
      reading order — export WCAG 2.1 AA / 2.2 AA compliance report
- [ ] Diff view for versions: block-level granularity
- [ ] Peer-review annotation layer (W3C Web Annotation extension per Phase 0.2
      peer-review spec) — threaded discussion, accept/reject. **Note:** this is
      *asynchronous* annotation, not real-time collaboration; the non-goal holds.
- [ ] Multi-locale side-by-side editing
- [ ] AVIF/WebP variant generation
- [ ] Visual authoring for non-core directives (`::video`, `::audio`, `::model`,
      `::embed`, `::data`)

**Pro milestone:** feature parity with Quarto authoring + basic Jupyter editing.
*Not* parity with InDesign or Acrobat Pro. Those are not the competition.

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
- [ ] `epub-to-mdz` CLI: reverse direction, best-effort
  - OPF → MDZ manifest
  - XHTML → Markdown (via turndown)
  - Drops EPUB features MDZ doesn't express (page lists, complex SSML); warns.
- [ ] Fidelity matrix: which EPUB features round-trip, which lose data, which
      are converted approximately. Publish this prominently.
- [ ] CI job: roundtrip every example through `mdz → epub → mdz` and verify
      text + assets survive (accept documented fidelity gaps).

### 2.5 Browser extension — universal

Replace the Chrome-only extension with a universal one.

- [ ] WebExtensions API (works in Chrome/Edge/Firefox/Brave/Arc)
- [ ] Intercepts `application/vnd.mdz-container+zip` responses and renders inline
      using the `<mdz-viewer>` web component
- [ ] Published to all 4 addon stores
- [ ] Firefox store requires reproducible build — set up the CI for this

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

- [ ] Define a **CSP profile** that viewers MUST apply to rendered MDZ content
      (default-src 'self'; script-src 'none' unless `permissions.allow_scripts`)
- [ ] `::include` with external URLs requires `permissions.allow_external_includes: true`
      AND `content_hash` pinning — viewers MUST refuse otherwise (already in spec,
      now also enforce in reference impls)
- [ ] Signature trust model documentation: how viewers discover signer keys
      (DID resolution, did:web, fallback to `certificate`), how revocation is
      checked, what happens on rotation
- [ ] Reference verifier implementation: `mdz verify archive.mdz --trust keys.json`
      returns cryptographic pass/fail for the full signature chain
- [ ] Threat model doc in `docs/security/THREAT_MODEL.md` — STRIDE table covering
      malicious archives, signature forgery, transclusion abuse, kernel escape

### 3.2 Subresource integrity enforcement

- [ ] Integrity field MUST be verified by conformant viewers; non-conformant
      viewers are flagged in the conformance suite.
- [ ] Add integrity-fail fixtures to `tests/conformance/negative/`.

### 3.3 Accessibility conformance suite

- [ ] 50 fixtures covering WCAG 2.2 AA success criteria
- [ ] Tools: axe-core + pa11y run against `<mdz-viewer>` rendering of each fixture
- [ ] Publish an accessibility conformance report with the v1.0 viewer release.

---

## Phase 4 — Ecosystem (rolling, Q2 2027+)

### 4.1 Language bindings beyond Python + TypeScript

Prioritize by where our niche lives:

- [ ] Rust (`mdz-rs`) — for Tauri desktop integrations, WASM viewer builds
- [ ] Swift — iOS reader
- [ ] Kotlin — Android reader
- [ ] Go — CLI tools, academic publishing backends

Each must pass the conformance suite to ship a 1.0.

### 4.2 Integration targets

- [ ] Pandoc filter (`pandoc --to mdz`, `pandoc --from mdz`) — auto-unlocks
      .docx / .tex / .odt / .rst conversion
- [ ] VS Code extension with live preview + directive IntelliSense (uses
      tree-sitter grammar from 1.1)
- [ ] Overleaf integration: upload MDZ to Overleaf, get a LaTeX mirror for
      journal submission workflows
- [ ] Zotero plugin: import MDZ archives with full provenance metadata
- [ ] arXiv submission bridge: accept MDZ, generate the PDF + HTML arXiv wants

### 4.3 Real-world corpus

- [ ] Convert 100 open-access arXiv papers to MDZ as a benchmark corpus
- [ ] Publish as a public dataset; use for parser stress-testing, viewer demos,
      and "look at all these papers that work" marketing
- [ ] Partner with Zenodo or OSF for archival hosting

### 4.4 Streaming / lazy loading

For large documents (embedded videos, high-res figures), full-ZIP-into-memory
is a real constraint.

- [ ] Research: OCFL-style content-addressed virtual filesystem layered on the ZIP
- [ ] Viewer update: fetch asset bytes on-demand via HTTP range requests
      (requires web server support; degrades gracefully)
- [ ] Editor update: don't load videos into memory until preview requested

### 4.5 Delta encoding for versions

Git-style packfiles for `history/snapshots/` — each version stores a delta
against its parent, not a full copy. Relevant once documents commonly have >20 versions.

---

## Phase 4.6 — Review-debt resolution (post-2026-04-24 audit)

Added after an honest self-enumeration of items the Phase 4+5 review
cycle skipped. Items are split by origin so credit + blame are clear.

### 4.6.1 Skipped review findings (code-review / silent-failure / type-design)

- [ ] **Rust `resolve_entry_point`** — error when `locales` is declared
      but the `default` tag is missing from `available[]`. Current code
      silently falls through to the top-level entry_point. Flagged by
      silent-failure-hunter.
- [ ] **Rust wasm32 32-bit `usize` cast** — document or `debug_assert!`
      the truncation in `Vec::with_capacity(file.size() as usize)`.
      Flagged by silent-failure-hunter.
- [ ] **Rust `SignatureEntry.role` enum** — replace `String` with a
      `Role` enum (author/reviewer/editor/publisher/notary/custom)
      + `TryFrom<String>` that runs the CUSTOM_SIGNER_ROLE_PATTERN
      from the v2.0 spec. Flagged by type-design-analyzer.
- [ ] **Rust `entry_paths` ordering docstring** — state that
      lexicographic ordering is stable (via `BTreeMap`) and matters
      for reproducible hashing. Flagged by type-design-analyzer.
- [ ] **Rust `manifest_bytes` invariant docstring** — document that
      the returned slice is byte-identical to the parsed input, and
      that any future lazy-parse optimization must preserve this
      invariant for `verify_integrity` correctness. Flagged by
      type-design-analyzer.
- [x] **Rust `FeatureDisabled` actually wired** (2026-04-24 follow-up
      commit): `verify_integrity` / `verify_content_id` /
      `verify_signature_chain` now have `#[cfg(not(feature = "verify"))]`
      early-return paths that return `Err(FeatureDisabled)`. Methods
      are always present regardless of feature set. Also: sha2/hex
      promoted to `optional = true` deps gated by the `verify` feature
      so a no-default build truly sheds them.
- [ ] **CHARTER.md CCLA exact name + link** — currently says "W3C
      Community Contributor License Agreement" without the canonical
      URL. Flagged by comment-analyzer (suggestion #13).

### 4.6.2 Skipped tests + coverage

- [ ] **Pandoc golden-output fixture pack** — currently the CI job
      smoke-tests "filter loads" only; no coverage of `::cell`,
      `::include`, `::fig`, `::cite` directive rewriting. Create
      `integrations/pandoc/tests/` with ≥3 fixtures + a diff runner.
- [ ] **VS Code extension functional tests** — CI currently runs
      `node --check` (syntax) and `JSON.parse` (manifest) only.
      Add `integrations/vscode/test/` covering `runCli` in-flight
      map, `buildPreviewHtml` truncation, `resolveFileUri` at unit
      level without booting the VS Code extension host.
- [ ] **Cross-implementation parity harness** — TypeScript writes a
      canonical archive, Rust reads it, emits parsed manifest as
      JSON, byte-compared against the TS-emitted manifest. Catches
      encoder/decoder divergence that per-impl tests miss. Named as
      "critical" by test-analyzer; unimplemented.
- [ ] **Rust integration tests — additional chain cases** — add
      positive case with correctly-hashed chain entries, negative
      tampered-hash case, negative missing-prev-signature case,
      blake3 unsupported-algorithm case, manifest_checksum mismatch
      case. Only root-level invariant is currently covered.

### 4.6.3 Skipped deprecations + spec follow-ups

- [ ] **`checksum` → `content_hash` louder deprecation:**
  - [ ] One full paragraph in `spec/MDX_FORMAT_SPECIFICATION_v2.0.md`
        §9.2 (not a parenthetical).
  - [ ] `@deprecated` JSDoc tag in `implementations/typescript/mdx_format.ts`
        with removal version (v3.0).
  - [ ] `DeprecationWarning` emitted at manifest load in
        `implementations/python/mdx_format.py` when a loaded manifest
        uses `checksum`.
- [ ] **Streaming proposal open questions** — Q1 signature verification
      under streaming, Q2 cross-origin cache poisoning, Q3 editor
      implications. Answer or explicitly mark as empirically-pending
      with the concrete blocker.
- [ ] **Delta-snapshots open questions** — Q1 binary assets, Q2
      cryptographic signing of `index.json` (phase 3.2 dependency),
      Q3 compression. Pick a side or document the gating decision.

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

- [ ] **A11y fixtures 5 → 50** — Phase 3.3 target is 50. Only 5
      stub categories exist. Expand to at least 20 in-session,
      spanning: color contrast, form labels, `aria-labelledby`,
      landmark roles, table headers, focus order, language tags,
      skip links. Remaining 30 deferred to Phase 3.3 completion.

### 4.6.6 CI hygiene

- [ ] **Dependabot 5 moderate vulnerabilities on master** — audit
      with `gh api repos/:owner/:repo/dependabot/alerts` and remediate
      or consciously accept.
- [ ] **Node 20 actions deprecation** — `actions/checkout@v4`,
      `actions/setup-node@v4`, `actions/setup-python@v5` must move
      to Node-24-compatible versions before 2026-09-16 runner
      removal.
- [ ] **`--locked` Cargo build** — currently commented out; commit
      `Cargo.lock` and re-enable so CI reproduces deterministically.
- [ ] **CHANGELOG.md line-length** — ~15 lines over 80 columns
      around L108–L120 (pre-existing violations). Wrap to satisfy
      markdownlint without `continue-on-error: true` swallowing
      them.

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
