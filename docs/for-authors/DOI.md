# Minting a DOI for your MDZ archive

A DOI (Digital Object Identifier) is the standard persistent identifier
for academic works. MDZ does not mint DOIs itself — it carries DOIs
that you register with a DOI agency alongside your archive. This page
documents the two workflows relevant to MDZ authors:

- **Crossref** — for peer-reviewed journal articles.
- **DataCite** — for preprints and datasets deposited to Zenodo, OSF,
  figshare, bioRxiv, and most institutional repositories.

If you are *not* publishing through a journal or a repository that mints
DOIs automatically, you do not need this guide — your archive is
perfectly valid without a DOI.

---

## Where the DOI lives in the archive

Put the DOI in `manifest.json` under `document.doi`:

```json
{
  "document": {
    "id": "00000000-0000-0000-0000-000000000001",
    "title": "Reproducible Bayesian inference on 1000 Genomes",
    "doi": "10.5281/zenodo.1234567",
    "license": "CC-BY-4.0",
    ...
  }
}
```

The DOI is the identifier string only — no `https://doi.org/` prefix,
no `doi:` scheme prefix. Viewers link to `https://doi.org/<doi>` at
display time.

---

## Workflow 1 — Deposit to Zenodo (easiest, gets a DataCite DOI)

Zenodo mints a fresh DOI for every deposit, free, with no institutional
affiliation required. This is the path to take if you want a DOI and
have nowhere else to deposit.

1. Package your archive (`mdz create` or `mdz import-ipynb`).
2. Leave `document.doi` unset for this first pass — Zenodo mints the
   DOI on deposit.
3. Upload the `.mdz` as the primary file on zenodo.org.
4. Fill out the Zenodo metadata form. Minimum fields:
   - Title (must match `manifest.document.title`).
   - Authors with ORCID iDs (match `manifest.document.authors[].did`
     when formatted as `did:web:orcid.org/0000-0000-0000-0000`).
   - License (must match `manifest.document.license` — the SPDX id).
   - Version (match `manifest.document.version`).
5. Publish. Zenodo mints `10.5281/zenodo.<id>`.
6. **Patch the archive:** edit `manifest.document.doi` to the minted
   value, re-sign if your workflow signs manifests, and upload the
   patched version as a new Zenodo record version (Zenodo preserves
   the DOI across versions via `10.5281/zenodo.<id>.v2`).

Step 6 matters because the DOI-inside-the-archive is what a reader
sees when they open the `.mdz` offline.

## Workflow 2 — Deposit to OSF (also DataCite)

OSF mints a DOI on demand via the "Register" flow. The workflow is
analogous to Zenodo; see the OSF help docs for the exact UI. Register
the project first, then add the DOI to the archive and re-upload.

## Workflow 3 — Journal submission via JATS (Crossref)

If you are submitting to a journal that ingests JATS-XML, the journal
registers the Crossref DOI on publication. Your archive should not
claim a DOI at submission time.

1. Export JATS from your MDZ: `mdz export-jats paper.mdz -o paper.xml`.
2. Submit the JATS package + supplementary `.mdz` per the journal's
   submission guidelines.
3. After publication, the journal returns the minted Crossref DOI
   (typically of the form `10.xxxx/<journal>.YYYY.ABCDE`).
4. Patch `manifest.document.doi` to the Crossref value and re-upload
   the archive to the supplementary-material URL the journal provides.
5. Also update `document.published` and `document.publisher` to
   reflect the journal record.

## Workflow 4 — arXiv (no DOI from arXiv itself)

arXiv does not mint DOIs. If your paper is arXiv-only, leave
`document.doi` unset; the arXiv identifier `arXiv:YYMM.NNNNN` is the
persistent pointer. Many authors later publish a Zenodo copy (Workflow
1) to attach a DOI without going through a journal.

---

## Peer-review round-trip — versioned DOIs

When a preprint is revised, you have two choices:

- **Version-stamped DOIs** (Zenodo default): each revision gets its own
  DOI; the "concept DOI" (e.g. `10.5281/zenodo.1234567`) always
  redirects to the latest, while version DOIs
  (`10.5281/zenodo.1234567.v2`) pin the exact revision.
- **Single mutable DOI** (some journals): the DOI stays constant; the
  `document.version` field and history snapshots in
  `history/snapshots/` (v2.0 §15) track revisions internally.

If you use versioned DOIs, every revision MUST carry its own DOI in
`manifest.document.doi` for that version's archive. Cross-link prior
versions through `document.derived_from`:

```json
{
  "document": {
    "doi": "10.5281/zenodo.1234567.v2",
    "derived_from": [
      {
        "doi": "10.5281/zenodo.1234567.v1",
        "relation": "isNewVersionOf"
      }
    ]
  }
}
```

`relation` values match the DataCite "relationType" vocabulary
(`IsNewVersionOf`, `IsPreviousVersionOf`, `IsSupplementTo`, etc.).

---

## Validation — does my DOI field look right?

`mdz validate` performs only structural checks. To verify the DOI
resolves, run:

```bash
# Assuming jq + curl are on PATH.
DOI=$(unzip -p paper.mdz manifest.json | jq -r .document.doi)
curl -sI "https://doi.org/$DOI" | grep -i '^location:'
```

A working DOI returns a `Location: https://...` header pointing at the
landing page. A failed DOI returns 404 — most commonly because the DOI
has not yet been activated (Crossref DOIs take up to 24 hours to
propagate; DataCite DOIs are usually live within minutes).

---

## What MDZ does NOT do

- **Mint DOIs.** We are not a DOI-registration agency. Use Zenodo, OSF,
  DataCite Fabrica, or a Crossref-member journal.
- **Validate DOI ownership.** Anyone can put any DOI in a manifest. The
  signature chain (v2.0 §16) is what ties an archive to an identity;
  the DOI is an orthogonal claim.
- **Auto-deposit.** You run the deposit; MDZ is the format, not the
  workflow engine.
