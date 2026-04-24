# Reviewing an MDZ submission

**Audience:** peer reviewers invited to evaluate a paper submitted as MDZ.

**TL;DR:** Click the hosted viewer link, read the paper, click "re-execute"
on any code cell you doubt, inspect the provenance chain. Sign your review
at the end.

---

## What's different about reviewing MDZ

Compared to a PDF:

- You can **re-run the code** that produced any figure, live in the browser.
- You can **check the data** — it's in the archive, not a dead external link.
- You can **verify authorship** cryptographically before trusting the
  authorship claim.
- You can **see the revision history** — what changed between preprint,
  v1, and the version you're reviewing.
- Your review **cryptographically signs** your assessment, so the editor
  knows it's really you.

## Step 1 — Open the submission

You'll get a link like:

```
https://view.mdz-format.org/review?submission=ABC123&token=XXX
```

The `token` authorizes you to see the blinded version (authors' names
hidden per the journal's double-blind policy).

The hosted viewer renders everything: prose, figures, cells, annotations,
references. Works in any browser. No install.

If the submission arrived as an MDZ file attached to an email, drop it on
https://view.mdz-format.org and the viewer reads it locally (no upload).

## Step 2 — Read the paper

Same as a PDF, but:

- **Click a citation** → jumps to the references section.
- **Click a figure caption** → see the `::cell` that generated it.
- **Click a cell's "code" toggle** → see the source that produced the output.
- **Click a cell's "re-execute" button** → the viewer runs it via Pyodide
  (Python) or webR (R) and shows you the fresh output. If the fresh output
  differs from the cached output, it's highlighted.

## Step 3 — Verify claims

### "The figure matches the code"

Click "re-execute" on the cell. Output should match what's printed.

### "The data is what they say"

In the viewer's file browser (left panel), click `assets/data/measurements.csv`.
The raw CSV opens. Header, row count, sample rows. No mystery.

### "The methods reference real prior work"

Click each citation. The reference entry shows DOI; viewer optionally
resolves it to the publisher page.

### "The authors are real"

Click on the Authors section. Each author entry shows:

- Name
- ORCID (if provided via `did:web` resolution)
- Institution
- Signature verification status (green ✓ if the author's signing key
  resolves correctly; red ✗ if tampered)

If double-blind: author identity panel is hidden to you; only sig-verification
status is shown.

### "The version I'm reviewing isn't a surprise"

Click History → see the DAG of versions:

```
preprint-v1 ── revised-v1 ── revised-v2 ── YOUR VERSION
     (Jan 2026)     (Feb)        (Mar)        (Apr)
```

Every edge has the message the author wrote explaining the revision.
Click a prior version to see a diff against your version. Detects
"stealth changes" between preprint and submitted version.

## Step 4 — Annotate

The viewer's annotation layer is W3C Web Annotation-compatible. Select any
text or figure:

- **Highlight** — "I want to flag this but have no comment."
- **Comment** — threaded discussion ("This figure is unclear").
- **Suggestion** — inline proposed rewording.
- **Question** — marked for author response.

Your annotations are scoped to your review. The author sees them only when
the editor forwards the review.

## Step 5 — Overall assessment

At the bottom of the review form:

- **Decision:** Accept / Minor Revisions / Major Revisions / Reject
- **Confidence:** 1 (weak) – 5 (expert)
- **Reproducibility check:** Did you re-execute any cells? Y/N — which?
- **Signed review body** (Markdown)

## Step 6 — Sign

Click "Sign and submit." The viewer generates an MDZ containing:

- Your annotations (W3C Web Annotation)
- Your overall assessment
- A signature entry with role=`reviewer`, your DID, and a hash linking
  to the submission you reviewed

You download this "review MDZ" as confirmation. The journal archives it.

If the submission is retracted later or the paper is disputed, your review's
signature timestamp proves what you assessed and when.

## Privacy and anonymity

- **Single-blind / open review:** your name + ORCID is on the signature
  entry. Your signed review is archivable.
- **Double-blind:** the journal's system signs with a reviewer-role
  pseudonymous DID (`did:web:journal.example.com#reviewer-42`) — the
  editor can resolve it to you; the author cannot.
- **Your signing key never leaves your device.** The viewer uses the
  WebCrypto API; no upload.

You can revoke a signed review later via `revocation_url` if, for example,
the submission is withdrawn; the signature remains but is marked revoked.

## Scaling concerns

### "I don't want to install Python"

You don't. Pyodide runs in your browser. First load is slow (~10MB);
subsequent loads are cached.

### "Pyodide won't run their code because they use torch"

Real limit. If you hit `ModuleNotFoundError` for a non-Pyodide-supported
package, note it in the review: "I could not re-execute cells X, Y, Z
because of dependencies not available in Pyodide." The editor can require
the author to provide alternatives (cached outputs + code review) or
decline to pilot.

### "Cells take forever to run"

The viewer backgrounds execution. You can browse other sections while one
cell runs. Use the cache if the cell is validated by the author's cached
output.

### "I want to run things on my own machine"

```bash
mdz extract submission.mdz --out ./paper-review
cd paper-review
# cells are standard python/R files under assets/cells/
```

Then point your local Jupyter at them.

## What makes a good MDZ review

- You re-executed at least one cell.
- You checked at least one citation resolves.
- You looked at the raw data in at least one `assets/data/` file.
- Your signed review is specific enough that a future reader (or another
  reviewer) understands your reasoning.

## What doesn't change

- **The paper still needs to be good.** MDZ doesn't make a bad paper good.
- **Reviewing is still hard work.** Re-executing cells is not a substitute
  for reading carefully.
- **Your expertise is what matters.** MDZ makes verification *possible*,
  not *automatic*.
