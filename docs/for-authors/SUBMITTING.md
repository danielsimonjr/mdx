# Authoring and submitting an MDZ paper

**Audience:** researchers who want to convert an existing `.ipynb` + LaTeX
workflow into a single MDZ archive and submit it to arXiv, Zenodo, OSF, or a
journal that accepts MDZ.

**Assumes:** you have an existing reproducible paper draft in ipynb + tex +
bib + a folder of supplementary files.

> **Tooling status (2026-04):** Most of the commands in this document don't
> exist yet. They are the **target UX** for the Phase 2 CLI rebuild
> (`ROADMAP.md` §2.3). Each block labelled **(planned)** describes the
> intended workflow; the "What works today" section at the bottom lists the
> commands that ship in the current CLI. If you need to author MDZ today,
> hand-assemble the ZIP per the layout below and use
> `mdz validate your-paper.mdz` (the one command that does exist).

---

## The one-archive mental model

Before any tools: understand what you're producing.

```
my-paper.mdz   (a ZIP file; rename to .zip and unzip to inspect)
├── manifest.json       ← metadata: title, authors, license, accessibility
├── document.md         ← your manuscript as Markdown
├── assets/
│   ├── images/         ← figures (PNG / SVG / WebP)
│   ├── data/           ← raw CSVs / datasets referenced by ::cell blocks
│   └── models/         ← 3D models if relevant
├── references.json     ← CSL-JSON bibliography
├── history/            ← fork/merge DAG (preprint → v2 → published)
└── signatures/         ← optional cryptographic signatures
```

This is the whole paper. One file. Content-addressable. Sign it; email it;
upload it.

## Step 1 — Convert your ipynb **(planned)**

Use the `ipynb-to-mdz` CLI:

```bash
mdz import-ipynb analysis.ipynb --out figure-cells.md
```

This emits a Markdown file where each ipynb code cell becomes a `::cell`
directive and each output becomes an `::output` block:

```markdown
## Figure 2 — Temperature anomaly

::cell{language="python" kernel="python3" execution_count=12}
​```python
import pandas as pd
df = pd.read_csv("assets/data/temperature.csv")
df.plot(x="year", y="anomaly")
​```

::output{type="image" mime="image/png" src="assets/images/fig2.png"}
```

The outputs are *cached*. Reviewers can re-execute if they want, or read
the cached figure if they don't.

## Step 2 — Convert your LaTeX prose

Easier than it sounds, because your paper isn't doing heroic TeX.

```bash
pandoc paper.tex -o document.md --citeproc --bibliography=refs.bib
```

Then hand-fix:

- `\ref{fig:2}` → `::ref[fig-2]` (planned v2.1 directive)
- `\cite{smith2023}` → `::cite[smith2023]`
- `\label{eq:1}` → `::eq{id="eq-1"}`
- `\input{section.tex}` → `::include[target="section.md"]`

Most other TeX → CommonMark cleanly via pandoc.

## Step 3 — Assemble the archive **(planned flags)**

**Target UX:**

```bash
mdz create \
  --title "Temperature anomalies in the paleoarctic" \
  --author "Alice Author <alice@uni.edu>" \
  --author-did "did:web:alice.example.com" \
  --license "CC-BY-4.0" \
  --profile scientific-paper-v1 \
  --content document.md \
  --bibliography references.json \
  --add-folder assets/ \
  --out my-paper.mdz
```

**Today:** `mdz create` exists but is interactive (prompts for title, author,
etc.) and accepts only `--output` and `--template`. The flags `--profile`,
`--author-did`, `--bibliography`, `--add-folder` are Phase 2. For now,
assemble the ZIP manually from the layout above or run the interactive
wizard and patch the manifest afterward.

## Step 4 — Validate

**Target UX** (Phase 2 `--profile` flag):

```bash
mdz validate my-paper.mdz --profile scientific-paper-v1
```

**Today** (profile validation not yet wired — the command validates
manifest structure and asset inventory but does not enforce the
scientific-paper profile's rules like IMRaD sections or CSL-JSON
bibliography):

```bash
mdz validate my-paper.mdz
```

Checks you'll see (Phase 2 target):

- ✓ IMRaD structure (Introduction, Methods, Results, Discussion sections present)
- ✓ At least one author with a valid ORCID-resolvable DID
- ✓ SPDX license identifier valid
- ✓ All `::cite[key]` references resolve against `references.json`
- ✓ All `::ref[id]` references resolve to a labelable block
- ✓ All `::cell` blocks declare a kernel
- ✓ All assets have content hashes
- ✓ Accessibility declares WCAG 2.1 AA baseline
- ✓ No external `::include` without content_hash pinning

Failed validation = red output + exit code 1. Fix and re-run.

## Step 5 — Sign **(planned — Phase 3)**

Signing is spec'd (v2.0 §16) but no CLI exists yet. Target UX:

```bash
mdz sign my-paper.mdz \
  --role author \
  --did did:web:alice.example.com \
  --key ~/.mdz/keys/alice-ed25519
```

This appends a signature entry to `security.signatures[]` with role "author"
and the author's did:web resolution. Corresponding authors and reviewers
add their own signatures via the same command with different role values.

## Step 6 — Submit

### arXiv

**Current (as of 2026):** arXiv doesn't natively accept MDZ. Workaround:

1. Upload the JATS-XML conversion (`mdz export jats my-paper.mdz` — **planned, Phase 2**; until then, hand-convert via pandoc)
2. Upload the MDZ as an "ancillary file"
3. Link to the hosted viewer in your abstract: `View interactive version:
   view.mdz-format.org?url=https://arxiv.org/abs/2612.12345/my-paper.mdz`
   *(hosted viewer is a Phase 2.2 target — not live as of 2026-04; until
   it ships, reviewers open the MDZ by downloading and extracting.)*

When arXiv natively renders MDZ (stretch goal end-2027), this becomes
one-step.

### Zenodo / OSF

Upload the MDZ as the primary file. These platforms accept arbitrary
binaries; the content_id in the manifest becomes part of your DOI metadata.

Configure the Zenodo deposit form:

- Resource type: Publication → Preprint (or Journal Article if accepted)
- License: same SPDX as in your MDZ manifest
- Communities: "MDZ Papers" (TBD once created)

### Journal

Per the journal's submission portal. Most accept supplementary ZIP files;
an MDZ is "just" a ZIP so it uploads cleanly. The journal's production
team then runs `mdz export jats` (Phase 2 target) to feed their pipeline;
until that ships, the journal can run pandoc or their own converter against
the extracted `document.md`.

## Common issues

**"My `::cell` has 2GB of matplotlib output"**
Don't embed huge outputs. Set `::cell{cache="external"}` and store the
output in `assets/data/` with a content hash. Reviewers pull on demand.

**"Reviewers say they can't re-execute because of a missing dep"**
Declare requirements explicitly:
```
interactivity:
  kernels:
    - id: python3
      language: python
      version: "3.11"
      requirements: ["numpy>=1.25", "pandas>=2.0", "matplotlib>=3.8"]
```
The hosted viewer installs these via Pyodide where possible.

**"My paper uses R, not Python"**
Use `::cell{language="r" kernel="webR"}`. WebR is a Pyodide-equivalent for R.

**"I need equation numbering"**
`::eq{id="e1"}$$E = mc^2$$` then `::ref[e1]` later. Renders as "equation 1."

**"I need cross-references to figures in other files"**
Use `::include` with a fragment: `::ref[fig-2 in chapter-3.md]`. Full
cross-file reference resolution planned for v2.1.

## Ethics and authorship

- **Sign only what you authored.** Don't sign as "reviewer" on your own paper.
- **Publish your key rotation.** If your signing key is compromised, revoke
  via the `revocation_url` and re-sign; don't silently replace.
- **Declare AI assistance** in the document per journal policy — MDZ does
  not try to detect it, but `document.ai_assistance` is a reserved field
  you can populate with your journal's required disclosure format.

## What works today vs. planned (2026-04 snapshot)

| Command / feature | Status | Notes |
|-------------------|--------|-------|
| `mdz view <file>` | ✓ works | Opens MDZ/MDX in browser viewer |
| `mdz info <file>` | ✓ works | Shows manifest summary |
| `mdz extract <file> [out]` | ✓ works | Unzips the archive |
| `mdz edit <file>` | ✓ works | Interactive terminal editor |
| `mdz create [name]` | ✓ works | Interactive wizard; no `--profile` yet |
| `mdz validate <file>` | ✓ works | Structural only; no profile rules |
| `mdz import-ipynb` | ✓ works (starter) | Jupyter .ipynb → MDZ; cells + outputs + images converted |
| `mdz sign` | ⏳ planned (Phase 3.2) | Ed25519/RS256/ES256 signing; spec'd in v2.0 §16 |
| `mdz verify` | ✓ works (structural) | Chain + integrity check; crypto-verify is Phase 3.2 |
| `mdz export-jats` | ✓ works (starter) | JATS 1.3 XML for journal ingest pipelines |
| `mdz export-epub` | ✓ works (starter) | EPUB 3.3 package for Calibre / readium / iBooks |
| `--profile` validation | ⏳ planned (Phase 2) | Enforces scientific-paper rules |
| `view.mdz-format.org` hosted viewer | ⏳ planned (Phase 2.2) | Domain not yet registered |
| `@mdz-format/viewer` web component | ⏳ planned (Phase 2.1) | npm scope not yet registered |

Until the planned items ship, hand-assembly + pandoc + manual ZIP
manipulation cover most of the gap.

## Get help

- GitHub issues: [link]
- Example papers: `examples/scientific-paper/` (TBD — Phase 0 deliverable)
- Discussion forum: [link, TBD]
