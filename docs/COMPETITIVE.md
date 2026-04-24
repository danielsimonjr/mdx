# Competitive Landscape

MDZ is not first. This document names the real competitors for "executable
scientific paper" tooling, states what they do well, and identifies MDZ's
specific differentiators. **If a competitor already ships what we're planning,
we cut the feature.**

Maintained on a rolling basis. Last updated: 2026-04-24. Competitor feature
claims reflect public documentation and project activity as of that date;
subject to drift — verify before relying on any specific claim for external
comparison.

---

## The incumbents

### Quarto
**Who:** Posit (formerly RStudio), commercially backed.
**What it is:** CLI tool that takes `.qmd` (Markdown + YAML + code) and
produces HTML / PDF / docx / reveal.js / books / websites.
**Strengths:**
- Best-in-class reproducibility story — deep integration with R, Python, Julia.
- Huge template library; journal-ready templates (Nature, PLOS, etc.).
- Nature Publishing Group uses it for some titles.
- Excellent citation / cross-reference / figure-numbering story out of the box.
- Funded by a real company (Posit) with paid engineering time.
- Familiar to anyone who used RMarkdown.

**Weaknesses:**
- Output is *artifacts* (HTML files, PDF files) — not a single portable archive.
- No signing / provenance / derivation chain.
- No content-addressed identifiers.
- Accessibility story is HTML-output-level, not file-format-level.
- Not designed for the "submit and verify" loop — it's an authoring tool,
  not a submission container.

**How MDZ differs:** Single signed archive instead of build artifacts.
Provenance + signing baked into the format. Format-level accessibility
metadata. Reviewer can verify what was signed matches what they read.

### Jupyter Book / MyST
**Who:** Executable Books project (community + grant-funded through Sloan).
**What it is:** Build system that turns `.md` + `.ipynb` collections into
a book-shaped website, using MyST (Markdown variant similar to MDZ).
**Strengths:**
- MyST Markdown syntax is mature and close to what MDZ specifies.
- Strongest community — adopted widely in scientific Python.
- Integrates natively with Jupyter kernel ecosystem.
- Open governance, well-documented.
- Executable books corpus proves the model works.

**Weaknesses:**
- Output is a multi-file website, not a single archive.
- No signing / provenance.
- Multi-locale support is weak.
- Content-addressing is absent.
- Cross-document includes are build-time only (no runtime transclusion).

**How MDZ differs:** Same authoring experience (same directive style), but
the output is a signed archive with provenance instead of a website. MDZ
can complement Jupyter Book — `jupyter-book → MDZ` export for final
submission, while keeping Jupyter Book for the working-draft website.

### Curvenote
**Who:** YC-backed startup, closest commercial competitor.
**What it is:** Hosted platform + editor for scientific papers; partnered
with arXiv for some submission flows; exports to multiple formats.
**Strengths:**
- Funded, staffed, shipping.
- arXiv partnership is the strongest external validation of this niche.
- Real editor with WYSIWYG authoring.
- Closest product-level match to "MDZ plus editor" vision.

**Weaknesses:**
- Proprietary backend — papers live in their cloud.
- Closed format — no spec for authors to implement against.
- Subscription-gated features.
- Vendor lock-in risk for institutional users.
- Not a file format — a platform.

**How MDZ differs:** **Open format, open reference implementation, no
vendor.** A university press can host MDZ submissions on its own
infrastructure. Authors own the file. MDZ wants to be the format Curvenote
(or anyone) can ingest and produce, not compete with the hosted experience.
If Curvenote adopted MDZ as their export format, that would be a win for
both — we are not zero-sum with them.

### Manubot
**Who:** Greene Lab + open-source community.
**What it is:** Git-first academic writing — Markdown manuscripts in a
GitHub repo, auto-built to HTML / PDF via CI.
**Strengths:**
- Strong provenance via git history.
- Familiar workflow for open-source contributors.
- Well-regarded in bioinformatics.

**Weaknesses:**
- No executable code cells — the `.md` is prose + references, not runnable.
- No single-file archive — always a repo + build artifacts.
- No content-addressing.
- Accessibility is whatever the HTML output provides.
- Authoring requires git comfort — not the median researcher.

**How MDZ differs:** MDZ carries executable cells with outputs; Manubot
doesn't. MDZ is a single archive; Manubot is a repo. Different layer.

### Stencila
**Who:** Stencila organization; notably dormant circa 2024–2026.
**What it is:** An earlier attempt at "executable document" with its own
format (Stencila Schema). Conceptually influential, practically stalled.
**Strengths:**
- Schema design is thoughtful and influenced later work.
- First-mover vocabulary (Article → CreativeWork).
**Weaknesses:**
- Dormant. Last major release 2022. Community dispersed.
- No sustained adoption.

**How MDZ differs:** MDZ is active; Stencila is not. But Stencila's schema
is worth studying — some MDZ vocabulary should probably align with theirs
where they got it right (e.g., their `Article` type maps cleanly to MDZ
`scientific-paper-v1` profile).

### Distill (historical reference)
**Who:** Google Brain + collaborators. Journal closed 2021.
**What it is:** A web-native journal format using custom Web Components
for figures, math, and interactive visualizations.
**Why it matters:** Proved that web-native papers with interactive figures
are a real audience demand. The journal failed for social/governance reasons,
not technical ones. MDZ should carry forward the "interactive figure as a
first-class citizen" principle.

---

## Feature matrix

Legend: **yes** = ships today • **spec-only** = defined in the specification,
no tooling yet • **planned** = on the roadmap, not yet spec'd or implemented
• **no** = not planned.

| Capability                      | Quarto | Jupyter Book | Curvenote | Manubot | Stencila | **MDZ (today)** |
|---------------------------------|--------|--------------|-----------|---------|----------|-----------------|
| Single-file archive             | no     | no           | no        | no      | partial  | **yes**         |
| Executable cells (in-browser)   | build  | build+live   | live      | no      | partial  | **spec-only**   |
| Cryptographic signing           | no     | no           | hosted    | git     | no       | **spec-only**   |
| Provenance chain (fork/merge)   | no     | no           | partial   | git     | no       | **spec-only**   |
| Content-addressed IDs           | no     | no           | no        | no      | no       | **yes**         |
| W3C DID signer identity         | no     | no           | no        | no      | no       | **spec-only**   |
| Multi-locale bundle             | no     | partial      | no        | no      | no       | **spec-only**   |
| Format-level accessibility meta | no     | no           | no        | no      | yes      | **spec-only**   |
| CSL bibliography                | yes    | yes          | yes       | yes     | yes      | **planned**     |
| Figure/eq/table numbering       | yes    | yes          | yes       | yes     | yes      | **planned (v2.1)** |
| JATS export                     | partial| via-pandoc   | yes       | no      | no       | **planned (Phase 2)** |
| PDF export                      | yes    | yes          | yes       | yes     | yes      | via-JATS→LaTeX  |
| Reflowable reading UI           | yes    | yes          | yes       | yes     | partial  | **basic**       |
| Open format spec                | yes    | yes          | **no**    | yes     | yes      | **yes**         |
| Active maintainers (2026)       | yes    | yes          | yes       | yes     | **no**   | ramping         |

**Reading the matrix honestly:** today MDZ has one concrete advantage
(single-file archive) and a long list of spec-only differentiators. The
value prop *requires* those spec features shipping as working tooling —
that's what Phase 2 + 3 of the roadmap exist to do. Do not pitch the
spec-only rows as shipped capabilities.

## Where MDZ wins, concretely

1. **Portability as a property, not an afterthought.** A Quarto site is a
   directory of HTML; a Jupyter Book is the same. You can't email "the book"
   — you email a link. An MDZ is one file. Email attaches it. USB carries it.
   Git stores it as a single blob. Zenodo archives it by content hash.
2. **Verifiable authorship.** Multi-signature chains with `did:web` + ORCID
   give you "this paper was authored by Alice (did:web:alice.example.com),
   endorsed by PI Bob (did:web:bob.example.com), and reviewed by Editor
   Carol (did:web:editor.journal.org)." No competitor does this.
3. **Reproducibility loop closes in the viewer.** A reviewer opens the MDZ
   in a browser, clicks "re-execute this cell," and the figure regenerates.
   Quarto requires building; Jupyter Book requires BinderHub; Curvenote
   requires their platform. MDZ requires a URL.
4. **File-level accessibility metadata.** WCAG-compliance declaration lives
   in the manifest, not only in the rendered HTML. Journals can programmatically
   reject inaccessible submissions.

## Where MDZ loses (today)

Honest list — these are the things competitors do better and we must close
the gap on before claiming feature parity:

1. **Citations and cross-references** — Quarto and friends ship this. MDZ
   v2.0 doesn't. Planned for v2.1. Until shipped, MDZ is not usable for real
   papers. This is the highest-priority spec gap.
2. **Journal templates** — Quarto has hundreds. MDZ has zero. Need at least
   5 for launch: PLOS, eLife, Nature Communications, arXiv default, Zenodo
   default.
3. **Maturity** — Quarto has 5+ years of bugs-fixed. MDZ is draft v2.0. Do
   not oversell maturity.
4. **Pandoc ecosystem lock-in** — Quarto rides Pandoc's enormous filter
   library. MDZ needs its own transformers. Closing this gap = writing many
   transformers or bridging to Pandoc (planned Phase 4).
5. **Large-scale real-world test corpus** — Quarto has Nature Methods issues
   worth of test material. MDZ has example-document.mdx. Phase 4 includes
   a 100-paper corpus.

## Decision rule

If Quarto, Jupyter Book, or Curvenote already ships a feature well, MDZ
does not *need* to duplicate it — we need to make our format work with
theirs. Our value is in what they don't have: **signed, content-addressed,
provenance-preserving, single-file, open-spec archives.**

When evaluating a proposed feature, apply the test:

1. Does a competitor already do this well?
2. If yes: can MDZ consume their output or produce input they can consume?
3. If no: does the feature serve the core "signed, portable, reproducible
   paper" value prop?
4. If neither: drop it.
