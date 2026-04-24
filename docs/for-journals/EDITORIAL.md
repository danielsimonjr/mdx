# Integrating MDZ into a journal's editorial workflow

**Audience:** production editors, submission-portal engineers, and
publishers evaluating MDZ for a specific journal or platform.

**TL;DR:** MDZ submissions validate against a declarative profile, export
cleanly to JATS-XML for your existing typesetting pipeline, and carry
cryptographic signatures you can verify without building new infrastructure.

---

## What you receive when an author submits an MDZ

A single `.mdz` file. Rename to `.zip` and unzip to see:

```
├── manifest.json      ← author, title, license, accessibility, DOIs
├── document.md        ← the manuscript
├── references.json    ← CSL-JSON bibliography
├── assets/            ← figures, data, models
├── history/           ← provenance chain (preprint → revisions → accepted)
└── signatures/        ← author + reviewer + editor signatures
```

Everything the reviewer saw, everything the author wanted published, one file.

## Step 1 — Structural validation

```bash
mdz validate submission.mdz --profile <your-profile>
```

MDZ profiles are JSON-Schema-like documents your journal owns. Example:

```json
{
  "$schema": "https://mdz-format.org/schemas/profile.schema.json",
  "id": "https://journal.example.com/profiles/submission-v1",
  "name": "Journal of Example Science — Submission Profile",
  "required_sections": [
    "abstract", "introduction", "methods", "results",
    "discussion", "data_availability"
  ],
  "required_document_fields": ["license", "authors", "keywords"],
  "required_author_fields": ["name", "email", "affiliation"],
  "required_license_spdx": ["CC-BY-4.0", "CC-BY-SA-4.0"],
  "max_manuscript_words": 6000,
  "min_figure_resolution_dpi": 300,
  "accessibility_baseline": "WCAG-2.1-AA",
  "required_cite_style": "apa-6th",
  "signature_requirements": {
    "author": { "required": true, "min_count": 1 },
    "corresponding_author": { "required": true, "min_count": 1 }
  }
}
```

Host this at a stable URL; authors include it in their MDZ manifest:
`document.profile: "https://journal.example.com/profiles/submission-v1"`.

Every submission either validates (you can proceed) or produces a precise
list of reasons it doesn't (you reject programmatically and send the author
a structured feedback email).

## Step 2 — Accessibility check

```bash
mdz a11y submission.mdz --level AA
```

Checks:

- All images have `alt_text` and (for figures) `long_description`.
- All videos have captions.
- All `::cell` blocks with image outputs have text alternatives.
- Heading order is sequential (no H1 → H3 skip).
- Color-coded figures have alternative encoding (pattern, annotation).
- Tables have header rows and `scope` attributes.
- Declared features in `document.accessibility.features` are actually
  present.

Fails here = you can legally reject under accessibility-mandated
submission policies that most OA journals now enforce.

## Step 3 — Signature verification

```bash
mdz verify submission.mdz --trust /path/to/trusted-keys.json
```

Verifies:

1. Author signatures — does the public key resolved via their DID match
   the signature over the manifest?
2. Reviewer signatures — are the named reviewers registered in your journal's
   reviewer directory?
3. Chain integrity — each `prev_signature` hash matches the prior entry's
   signature bytes.

Trusted keys: you maintain a JSON file of trusted signer keys (or DIDs that
resolve to them). For journal-level use, typically you trust ORCID (authors)
+ your internal reviewer registry + your own editorial keys.

This is cryptographic verification, not a checkbox. A forged authorship
claim is detectable without any external service.

## Step 4 — Export to JATS

```bash
mdz export jats submission.mdz --out production/paper.xml
```

Produces JATS 1.3 XML suitable for feeding into your existing production
pipeline (XSLT → typeset PDF → HTML galley). The JATS carries:

- Manuscript prose as `<body>` sections
- Author metadata with ORCIDs
- Citations as `<xref>` resolved against `references.json`
- Figures as `<fig>` with `<graphic xlink:href>` pointing into the
  extracted `assets/images/`
- Equations as MathML (planned v2.1)
- Supplementary: MDZ archive itself as a `<supplementary-material>` link

The original MDZ remains the source of truth; the JATS is derived. If a
reviewer asks for a change, the author updates the MDZ and resigns — you
regenerate the JATS from the new MDZ.

## Step 5 — Editorial sign-off

When the paper is accepted and the editor signs off:

```bash
mdz sign accepted.mdz \
  --role editor \
  --did did:web:journal.example.com \
  --key /secure/editor-key.pem \
  --scope full-archive
```

This appends the journal's signature to `security.signatures[]`. Now the
published archive carries the full chain: authors → reviewers → editor,
cryptographically linked.

Publish that archive alongside your journal's PDF + HTML galleys. The MDZ
is the "reference copy" that anyone can verify.

## Workflow integration patterns

### Pattern A — Submission portal validates on upload

When an author uploads an MDZ, your portal runs:

```
validate → a11y → verify signatures → enqueue for editorial review
```

Failed validation = immediate reject-with-feedback, no human time spent.
Passes = author sees "submission received, assigned ID 2026-12345."

### Pattern B — Review round-trip

1. Your system generates the MDZ for the reviewer with the paper and
   review form.
2. Reviewer annotates in the viewer (annotation layer), re-executes cells
   they doubt, signs their review.
3. Reviewer's MDZ comes back with appended annotations + signature.
4. Editor sees the signed review, combined with 2+ others, and decides.

Reviewers sign their reviews. Retraction is then simpler: you can point
to who verified what.

### Pattern C — Post-publication

Mint a DOI with DataCite/Crossref pointing to the MDZ. Record the
manifest's `content_id` as a verifiable checksum on the landing page.
Ten years later, anyone can download the archive, compute sha256, and
know it's the byte-identical published version.

## Hosting costs (estimate)

Typical MDZ archive: **500KB–50MB** depending on figure/data footprint.
Your existing CDN handles this at sub-cent-per-GB. No per-format fee.
No vendor.

## Migration from existing submission formats

| Your current format | MDZ migration effort |
|--------------------|---------------------|
| Word + `.zip` of supplementary | ~~zero tooling~~; authors upload MDZ instead |
| LaTeX only | Accept both; run pandoc → MDZ for consistency |
| JATS | MDZ exports to JATS; your pipeline is unchanged |
| ipynb only | Accept both; `mdz import-ipynb` converts |

You do not need to rebuild your production pipeline. MDZ feeds it.

## Legal

- **MDZ the format:** open spec, no licensing fees, no patents claimed.
- **Reference implementations:** Apache 2.0 (planned; currently unlicensed).
- **Author-held content:** whatever license the author picks per SPDX.
  Journals can require a subset (e.g., "CC-BY-4.0 only") via the profile.

## Pilot path

If your journal is considering a pilot:

1. Accept MDZ as an alternative submission format in one issue.
2. Use the existing JATS export for your production pipeline unchanged.
3. Link the MDZ from the published article landing page for readers who want
   the executable version.
4. Publish a retrospective after 3 issues: how many authors used MDZ? Any
   operational headaches?

Contact information: [see PARTNERSHIPS.md]
