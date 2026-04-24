# MDZ peer-review annotations

**Spec status:** v2.1 draft. Extends the v2.0 `annotations/` layer (W3C
Web Annotation) with reviewer roles, decision motivations, and signed
reviewer identity. Required by ROADMAP Phase 0.2 for the
"peer-review round-trips" positioning claim to be real.

**Audience:** implementers of editor UIs + readers that display
reviewer threads; journals and preprint servers wiring MDZ into their
review workflows.

---

## Goal

Carry a peer-review conversation inside the archive:

- Line-level (or block-level) comments tied to the manuscript.
- Accept / reject / request-changes decisions with rationale.
- Cryptographically attributable reviewer identity (the signature
  chain proves *who* made the comment; this spec structures *what*
  they said).
- Round-trippable between editors (a reviewer's annotations written in
  editor A must render identically in editor B).

## Foundation — W3C Web Annotation

MDZ inherits the W3C Web Annotation data model (REC 2017-02-23) for
the annotation shape. Every annotation is a JSON document at

```
annotations/<uuid>.json
```

with a stable `id` (fragment-of-archive URI) and a `target`/`body`
structure. This spec adds a `role` field and extends the `motivation`
vocabulary.

## Reviewer-role field

Add a top-level `role` field to the annotation object:

```json
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "id": "annotations/2026-04-reviewer-1-comment-01.json",
  "type": "Annotation",
  "role": "reviewer",
  "motivation": "commenting",
  "body": {
    "type": "TextualBody",
    "value": "The sample size in Figure 2 is not clearly justified.",
    "format": "text/plain",
    "language": "en"
  },
  "target": {
    "source": "document.md",
    "selector": {
      "type": "TextQuoteSelector",
      "exact": "N=80 samples (expanded per reviewer 2)",
      "prefix": "We measured the effect using ",
      "suffix": ". See Figure 2 for"
    }
  },
  "creator": {
    "id": "did:web:reviewer.example.com",
    "name": "Reviewer 1 (anonymous)"
  },
  "created": "2026-04-12T09:00:00Z"
}
```

Allowed `role` values:

| Role | Who | Signature requirement |
|------|-----|-----------------------|
| `author` | The manuscript author (or co-author) | MUST be in `security.signatures` as an `author` signer |
| `reviewer` | A peer reviewer | SHOULD be signed (see "Anonymity" below) |
| `editor` | A journal editor / editorial board member | MUST be signed if annotation carries a decision `motivation` |
| `reader` | A post-publication commenter | Signature optional |

Readers MUST surface unsigned `editor` decisions as a clear warning —
an unsigned accept/reject is a forgery risk.

## Extended motivations

W3C Web Annotation ships 13 core motivations (`assessing`, `bookmarking`,
`classifying`, `commenting`, `describing`, `editing`, `highlighting`,
`identifying`, `linking`, `moderating`, `questioning`, `replying`,
`tagging`). MDZ adds four review-specific motivations:

| Motivation | Purpose | Applies to |
|------------|---------|-----------|
| `review-accept` | Editorial decision: accept the submission as-is | role=`editor` |
| `review-reject` | Editorial decision: reject | role=`editor` |
| `review-request-changes` | Decision: revisions required before next round | role=`editor` |
| `review-confidential-comment` | Reviewer comment visible to the editor only | role=`reviewer` |

Readers that don't recognise the extended motivations MUST treat them
as `commenting` (per the W3C Web Annotation fallback rule). That
degrades the display — a "reject" looks like a comment — but doesn't
drop data.

## Threading — replies

A reviewer reply to an author comment, or an author response to a
reviewer comment, uses the W3C `replying` motivation with a `target`
that points at the parent annotation's `id`:

```json
{
  "id": "annotations/2026-04-author-reply-01.json",
  "role": "author",
  "motivation": "replying",
  "body": {
    "type": "TextualBody",
    "value": "We added justification for N=80 in §3.2, lines 118-125.",
    "format": "text/plain"
  },
  "target": "annotations/2026-04-reviewer-1-comment-01.json",
  "creator": { "id": "did:web:example.edu/users/jane-author" },
  "created": "2026-04-14T11:23:00Z"
}
```

Readers MUST render reply chains as threads (indented, collapsible,
ordered by `created` timestamp).

## Review-round aggregation

A single reviewer's full-pass review is a set of annotations, NOT a
single aggregated document. This matches how Hypothesis, PubPeer, and
Commonwealth journals structure reviewer output. Authors and editors
navigate by filtering on `creator.id` + `created` date range.

## Anonymity — the reviewer identity trade-off

Double-blind review requires that reviewers stay anonymous to authors
while remaining attributable to the editorial board. MDZ supports
two modes:

1. **Attributable** — `creator.id` is a real `did:web` resolving to an
   institutional profile or ORCID. Signature in
   `security.signatures` pins the identity cryptographically. Use for
   open review or post-publication commentary.
2. **Pseudonymous** — `creator.id` is a journal-issued opaque DID
   (e.g. `did:web:journal.example.com/reviewers/opaque-hash-abc123`).
   The journal holds the mapping to a real identity; the archive
   does not. Signature in `security.signatures` pins the pseudonym;
   revocation / de-anonymisation is a journal-internal process.

Fully anonymous review (no DID, no signature) is allowed but readers
MUST surface it as low-trust — an unsigned reviewer comment is
indistinguishable from a forgery.

## Visibility — editor-only comments

`review-confidential-comment` motivates a reviewer remark meant for
the editor, not the author. A conformant reader that is displaying the
archive to someone outside the editorial workflow MUST NOT render
confidential comments; however, viewers have no way to know *who* is
looking. The practical pattern:

1. During submission, editors work in an editor-only variant of the
   archive that includes confidential comments.
2. When the archive is published (post-acceptance), the editor
   regenerates it without confidential comments and re-signs.
3. The published archive's signature chain attests that the public
   version is the editor-approved release.

We could ship a viewer-side `--role=public|editor` flag, but gating on
UI flags is not a security boundary — the public archive SHOULD simply
not carry confidential comments.

## Validation

A conformant writer:

1. MUST emit one annotation JSON per `annotations/*.json` path.
2. MUST set the `role` field.
3. MUST either sign the annotation creator in `security.signatures` or
   surface a clear warning to the author on save.
4. MUST NOT write `review-confidential-comment` or `review-*` decision
   motivations without a signed creator.

A conformant reader:

1. MUST thread replies via `target: <annotation-id>` references.
2. MUST surface unsigned `editor` decisions as a warning.
3. SHOULD surface the count + breakdown of annotations by role near the
   document title ("3 reviewer comments, 2 editor decisions").
4. MUST NOT display `review-confidential-comment` entries in a viewer
   context where the user cannot be identified as editorial staff.

## Relationship to other layers

- **Signature chain (§16):** provides cryptographic attribution. This
  spec provides the human-readable structure layered on top.
- **History (§15):** a review round typically produces a new snapshot
  (`v1.0.0 → v1.1.0 after reviewer round 1`). Annotations from the
  prior round remain in the archive; the next round adds new ones.
- **JATS export:** `mdz export-jats` drops the annotation layer (JATS
  `<peer-review>` elements are not a clean round-trip target). The
  `annotations/` tree survives JATS-roundtrip only if the journal
  preserves the MDZ as supplementary material — which most do.

## Open questions

1. **Anchor stability under edits.** A `TextQuoteSelector` pinning
   "N=80 samples" breaks if the author rewrites that sentence. We
   currently inherit the W3C stale-selector problem. Options: also
   record a `FragmentSelector` keyed on block-id (stable across
   edits), or warn when an annotation's anchor no longer resolves and
   leave the comment floating in a "detached" panel.
2. **Review-round label.** Should an annotation carry a `round`
   field (`1`, `2`, `r1-after-rebuttal`)? Currently inferred from
   `created` date; explicit would be cleaner. Ship without, add later
   if confusion warrants.
3. **Reviewer-assigned rubric scores.** Journals sometimes want
   numeric ratings (`novelty: 4/5`, `rigor: 3/5`). Out of scope for
   v2.1 — add as a named motivation extension in v2.2 if journals
   request it.

---

## Next steps

1. Add fixtures under `tests/conformance/positive/` for each
   motivation.
2. Wire annotation rendering into `packages/mdz-viewer` with a
   collapsible sidebar.
3. Update `docs/for-reviewers/REPRODUCING.md` with a section on how
   to add comments to an archive one is reviewing.
4. Implement `mdz review add-comment <archive> --role reviewer` as a
   Phase 2 CLI follow-up.
