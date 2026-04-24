# MDZ Positioning

**One sentence:** MDZ is a single-file container for **executable scientific
papers** — manuscript, code, data, figures, citations, and signed provenance
in one portable archive.

---

## Who we serve

Researchers submitting preprints and journal articles to **arXiv, bioRxiv,
chemRxiv, medRxiv, Zenodo, OSF**, and the OA journals that ingest from them.
Specifically:

- **Grad students and postdocs** who want reviewers to re-run their analysis
  without "works on my machine."
- **Lab PIs** who need to archive the full state of a paper — not a PDF plus
  a zip of "supplementary" files that rot in separate systems.
- **Journal production editors** who want machine-checkable submissions with
  structured metadata, accessibility compliance, and verifiable authorship.

## What we replace

Today a reproducible paper is duct tape:

| Current | MDZ |
|---------|-----|
| `.tex` or `.docx` manuscript | `document.md` (CommonMark + extensions) |
| `.ipynb` for code/plots | `::cell` directives inside the document |
| `.zip` of supplementary data | `assets/` inside the same archive |
| ORCID profile (linked externally) | Author identity via `did:web` resolution |
| DOI minted post-hoc, URL-only | Content-addressed `content_id` in the manifest |
| Cover letter proving authorship | Multi-signature chain (§16) |
| Separate accessibility PDF | Machine-readable `document.accessibility` |
| Translated abstract as second PDF | Native multi-locale bundle (§8) |

One archive. One hash. Works offline. Renders in any browser.

## Why now

1. **Reproducibility crises** at Nature-indexed journals have made journals
   require source + data + instructions. The current state (ipynb + Docker +
   README) is unusable for reviewers.
2. **Preprint-server engineering teams** (arXiv, Zenodo) are publicly
   soliciting proposals for structured, executable formats — Quarto and
   Jupyter Book are being evaluated; MDZ is open to the same evaluation.
3. **Signing + provenance matter** more than ever: retractions, fraud, and
   AI-generated papers have eroded trust. A format with cryptographic authorship
   + derivation chain addresses this at the file level, not the infrastructure
   level.
4. **W3C DIDs, WCAG 2.1 AA, and SPDX** have matured enough that a format built
   on them today isn't bleeding-edge — it's what the next spec generation will
   assume.

## What MDZ is NOT

Explicit non-goals so the positioning stays honest:

- **Not a Google Docs replacement** — no real-time CRDT collaboration.
- **Not an InDesign replacement** — reflowable, not camera-ready layout.
- **Not a DRM container** — signing proves who, not who's allowed to read.
- **Not an arXiv replacement** — preprint servers still host, MDZ is the
  submission format.
- **Not a Jupyter replacement for research computing** — MDZ embeds cells for
  the *paper*, not for daily notebook work. Export from JupyterLab to MDZ at
  publish time.
- **Not a one-format-for-everything format** — general-purpose books use EPUB;
  technical docs use DocBook/AsciiDoc; API reference uses OpenAPI. MDZ is for
  one thing: executable scientific papers.

## The success shape we're chasing

By end of 2027, we want:

- A grad student can author a reproducible paper in MDZ, sign it with their
  ORCID-linked DID, and submit to arXiv via the hosted viewer link.
- A reviewer can open that archive in a browser, re-execute the cells, and
  verify the figures regenerate correctly.
- A journal's editorial pipeline can convert the MDZ to JATS-XML for
  production, while retaining the provenance chain and accessibility metadata.
- Ten published papers live as MDZ archives at arXiv / Zenodo / OSF, with
  stable content-addressed URLs.

If any of that isn't happening, we're building the wrong thing.

## The feature-vs-niche test

Every proposed feature must pass this test before it enters the spec:

> "Does this serve an author, reviewer, or editor of a reproducible scientific
> paper? If not, why is it in the core spec?"

If the answer is "it might be useful for `<other use case>`," the feature goes
to an extension profile, not core.

---

## Related documents

- [ROADMAP.md](../ROADMAP.md) — phased implementation plan
- [COMPETITIVE.md](COMPETITIVE.md) — why MDZ over Quarto / Jupyter Book / Curvenote
- [FUNDING.md](FUNDING.md) — resourcing and funding model
- [PARTNERSHIPS.md](PARTNERSHIPS.md) — outreach plan for preprint servers and journals
- [for-authors/SUBMITTING.md](for-authors/SUBMITTING.md) — convert ipynb+tex to MDZ
- [for-journals/EDITORIAL.md](for-journals/EDITORIAL.md) — validate a submission
- [for-reviewers/REPRODUCING.md](for-reviewers/REPRODUCING.md) — re-execute cells, verify provenance
