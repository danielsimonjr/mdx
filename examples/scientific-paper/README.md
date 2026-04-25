# Example: scientific paper

A minimal demonstration MDZ archive shaped like a peer-reviewable
scientific paper. Use it as a starting template — copy the
directory, edit the contents in `source/`, then bundle with
`mdz create source/ -o my-paper.mdz`.

## What's in here

```
source/
├── manifest.json         # required document metadata + author DIDs
├── document.md           # the manuscript itself (IMRaD structure)
├── references.json       # CSL-JSON bibliography
└── assets/
    └── data/
        └── series.csv    # one tiny example data file
```

This skeleton validates against the **`scientific-paper-v1`**
profile (`spec/profiles/scientific-paper-v1.json`) — the required
sections (Abstract / Introduction / Methods / Results / Discussion)
are present, every author has a DID, every cited reference resolves
against `references.json`, and `document.keywords` has ≥3 entries.

It is deliberately a thin skeleton — real papers replace each
section's placeholder text with their own content and add
figures / equations / tables / code cells as needed.

## Build it

```bash
cd examples/scientific-paper
zip -r ../scientific-paper-example.mdz source/*
# or: node ../../cli/src/index.js create --from source/ -o ../scientific-paper-example.mdz
```

## Validate against the profile

```bash
node ../../cli/src/index.js validate ../scientific-paper-example.mdz \
  --profile scientific-paper-v1
```

## What this demonstrates

- IMRaD section structure (`scientific-paper-v1` requires it)
- CSL-JSON bibliography + `::cite[…]` references
- `::fig{id=…}`, `::eq{id=…}`, `::tab{id=…}` labeled directives
  with `::ref[…]` cross-references
- `::cell{language=python}` with a fenced source block —
  re-executable in any Pyodide-capable viewer
- Author DIDs resolving to ORCID records
- Manifest integrity hooks (`security.integrity.manifest_checksum`)
  ready to be filled in by a signing pass

What it deliberately does NOT include:

- Real signatures (the example author is a placeholder DID)
- A `history/` snapshot chain
- Compiled-wheel Python dependencies that would break in Pyodide
