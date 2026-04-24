# MDZ Roadmap

> **Status:** This project is being renamed from **MDX** to **MDZ** (Markdown Zipped).
> The current name collides with the React ecosystem's MDX (Markdown + JSX),
> which has a massive install base and dominates search results for "MDX file format."
> While deployed usage is effectively zero, it's the cheapest possible time to rename.

> **Positioning:** MDZ is the **native file format for executable scientific
> papers.** It replaces the duct-tape stack of `.ipynb` + Overleaf + `.zip` of
> supplementary materials with one signed, content-addressed archive that
> renders in any browser, validates reproducibility, and preserves provenance.
> Every feature in this roadmap is evaluated against that niche.

This document consolidates the strategic review completed 2026-04-24 into an
actionable plan. It's organized in dependency order — each phase unblocks the next.

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
submitting preprints to arXiv / bioRxiv / chemRxiv / Zenodo / OSF / SSRN who
currently duct-tape together:

- `.tex` or `.docx` for the manuscript
- `.ipynb` for code and plots
- separate `.zip` of supplementary data
- an orcid.org profile for identity
- a DOI minted post-hoc

MDZ collapses all of this into one signed, content-addressed, reproducible
archive. Every v2.0 feature maps to a concrete scientific-paper need:

| Feature | Scientific-paper use case |
|---------|--------------------------|
| `::cell` + kernels | Figures regenerate from source data; reviewers re-run analyses |
| Content-addressed IDs | Permanent citation hash, independent of URL |
| Multi-signature | Author + corresponding-author + reviewer + journal editorial board |
| DIDs (did:orcid, did:ror) | Authors resolve to ORCID; institutions resolve to ROR |
| Provenance (`derived_from`) | Preprint → revised → published version chain |
| Accessibility | WCAG compliance that most journals now require |
| Multi-locale | Global-South journals publishing in local language + English |
| `::include` | Shared methods sections, reusable boilerplate across papers |
| Profiles (`scientific-paper-v1`) | Journals enforce structural requirements |
| History DAG | Peer-review round-trips; preprint-vs-published diffs |

**Deliverables unique to this vertical:**

- [ ] `docs/POSITIONING.md` — one-page pitch for researchers
- [ ] `docs/for-authors/SUBMITTING.md` — how to convert an existing ipynb+tex
      workflow to MDZ
- [ ] `docs/for-journals/EDITORIAL.md` — how a journal validates an MDZ
      submission against its profile
- [ ] `docs/for-reviewers/REPRODUCING.md` — how a reviewer re-executes cells
      and reads the provenance chain
- [ ] `spec/profiles/scientific-paper-v1.json` (already drafted) — tighten
      required sections (IMRaD), citation formats, DOI handling, data
      statement requirements
- [ ] **Partnership outreach (Phase 0 exit criterion):** one arXiv endorser
      or one journal editor has reviewed the positioning and said "yes, I'd
      experiment with this." No further phases start without this signal.
- [ ] Update `README.md` to lead with the scientific-paper use case.
- [ ] Add `STATUS: experimental research project` banner to `README.md` until
      at least one real paper is published as MDZ.

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

### 1.4 Fuzz testing

- [ ] Wire up `atheris` (Python) + `jazzer.js` (TypeScript) for coverage-guided fuzzing
      of the parser and archive loader.
- [ ] CI job: 5 minutes of fuzzing per parser per PR. Crashes block merge.
- [ ] Corpus seeded from the conformance suite.

### 1.5 Content-addressing: commit fully or remove

The current half-done `content_id` + `assets/by-hash/` is worse than nothing.

- [ ] Either adopt **multihash + CIDv1** format (aligns with IPFS ecosystem) and
      switch `assets/by-hash/` to content-addressed storage with deduplication
      (symlinks or tarball hardlinks within the ZIP via §10.3 extension)…
- [ ] …or remove content-addressing from Core entirely and defer to Advanced profile.
- [ ] Decision gate: does the scientific-paper niche care about content-addressing
      vs. just content-hashing? Survey 10 potential users.

---

## Phase 2 — Adoption enablers (12–16 weeks)

### 2.1 `<mdz-viewer>` web component — *the* highest-impact deliverable

Without a great viewer, no one authors MDZ. Target: **50KB gzipped, 95% directive
coverage, drop-in embed.**

- [ ] Framework-agnostic web component with shadow DOM isolation
- [ ] Handles: CommonMark + GFM + math (KaTeX) + images + video + audio +
      `::cell` + `::output` + `::include` + alignment/attributes + alt-text + ARIA
- [ ] Offline-first: uses IndexedDB for archive caching
- [ ] Accessible by default: full keyboard navigation, screen-reader tested,
      WCAG 2.2 AA out of the box
- [ ] Published to npm as `@mdz-format/viewer`, CDN-available
- [ ] Demo site: drop an `.mdz` file into `viewer.mdz-format.org`, get rendering

### 2.2 Hosted render-any-MDZ service

- [ ] Deploy `view.mdz-format.org?url=<archive-url>` — free, no-auth, CORS-friendly
- [ ] Serverless rendering (Cloudflare Workers / Vercel Edge)
- [ ] Cache via CDN with content-hash keys (stable URLs for immutable archives)
- [ ] Generate social-share preview cards (OG image from first page / cover)

Goal: anyone can put `.mdz` in GitHub and share a rendering link. Removes the
"no users because no viewer" chicken-and-egg.

### 2.3 World-class desktop editor (Adobe Acrobat-class)

The authoring experience needs to be better than Word for our niche. Model on
Acrobat's PDF Pro: heavy-weight desktop app, polished, pro-grade.

- [ ] **Tech stack:** Electron + Vite + CodeMirror 6 + web-component viewer (reuse 2.1)
- [ ] **Split-pane editor:** source Markdown + live rendering + asset sidebar +
      outline nav + annotations panel
- [ ] **Visual authoring for directives:** GUI pickers for `::video`, `::cell`,
      `::include` (no manual attribute typing required)
- [ ] **Jupyter kernel integration:** run `::cell` blocks in-editor via JupyterLite
      (WASM kernels, no Python install needed)
- [ ] **Asset management:** drag-drop, auto-resize, AVIF/WebP variant generation,
      content-hash computation on save
- [ ] **Accessibility checker:** tab-inspect image alt text, heading order,
      color contrast, reading order — export WCAG 2.2 AA compliance report
- [ ] **Diff view for versions:** git-style side-by-side, block-level granularity
- [ ] **Annotation layer:** W3C Web Annotation-compatible, comment threads,
      track-changes, accept/reject
- [ ] **Multi-locale side-by-side editing:** edit en-US and es-ES panes simultaneously,
      flag untranslated sections
- [ ] **Code-signed installers for Mac, Windows, Linux** (reuse signing infra from
      MermaidJS desktop project)
- [ ] **Auto-update via Squirrel** (same infra)

**Milestone:** v1.0 ships with feature parity to Typora + Jupyter + basic PDF tools.

### 2.4 EPUB ↔ MDZ bridge

Inherit EPUB's ecosystem (Calibre, readium.js, iBooks, Kindle, every ereader)
for documents that don't need cells.

- [ ] `mdz-to-epub` CLI: translates MDZ archive to EPUB 3.3 package
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

## Phase 3 — Security and conformance (ongoing, starts Phase 2)

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

## Phase 5 — Governance (Q4 2027+)

Only after there's real adoption:

- [ ] W3C Community Group (lightweight) → W3C Working Group (heavyweight)
- [ ] Publish spec at `mdz-format.org/spec/` with per-version archive
- [ ] Formal change process: RFC repo, tagged releases, errata tracking
- [ ] Trademark the MDZ logo/wordmark if uptake warrants it

---

## Immediate next steps (this week)

If this roadmap is approved, the first concrete actions are:

1. **Merge rename PR.** Touch every file, every URL, every type name.
2. **Publish `STATUS: experimental` banner** in README.
3. **Start on `<mdz-viewer>` skeleton** — this is a 3-month build, earlier it
   starts the sooner everything downstream unblocks.
4. **Survey 10 potential users** (arXiv/Zenodo regulars) on the scientific-paper
   positioning — validate the niche before building for it.
5. **Ship the formal grammar** as `spec/grammar/mdz-directives.abnf` — ~3 days
   of focused work.

---

## Success metrics (end of 2027)

Concrete, falsifiable, biased toward the scientific-paper niche:

**Niche-specific (primary):**
- 10+ scientific papers published as MDZ at arXiv / bioRxiv / Zenodo / OSF
- 1+ peer-reviewed journal accepts MDZ as a submission format
- 1+ preprint server (arXiv / Zenodo / OSF) natively renders MDZ uploads
- A reviewer has re-executed a `::cell` block in a submitted paper and
  confirmed a result — the reproducibility loop closes for the first time
- 3+ authors have used the desktop editor end-to-end to produce a submission

**Ecosystem:**
- `<mdz-viewer>` on npm with >1,000 weekly downloads
- Conformance suite: 3+ independent implementations pass 100% of Core
- Desktop editor: 500+ active weekly users across Mac/Win/Linux
- W3C Community Group chartered
- Zero CVEs in the reference implementations (or all resolved within SLA)

---

## What we're NOT doing

Explicit non-goals — listing these prevents scope creep:

- **Real-time collaboration.** MDZ is a file format, not a CRDT. Google Docs
  and HedgeDoc serve that need. Add CRDT layer in a separate project if needed.
- **Full WYSIWYG at Adobe InDesign level.** Desktop editor targets "great for
  Markdown + structure," not pixel-perfect layout.
- **DRM / rights management.** Signing is for authenticity, not access control.
- **Binary compatibility with DOCX / PDF.** Bridges only, not equivalence.
- **Generic workflow engine.** `::cell` runs code; it doesn't orchestrate Airflow.

If someone proposes one of these, the answer is "separate project, or later phase."
