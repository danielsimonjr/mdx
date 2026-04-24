# MDZ RFC process

Formal process for proposing, discussing, and merging changes to the
MDZ specification, reference implementations, and tooling.

Patterned on the Rust / TC39 RFC workflows, adapted for a solo-to-
small-team project. Two-way: low-friction for minor changes, structured
for anything touching the format's surface.

---

## When you need an RFC

| Change type | RFC needed? |
|-------------|-------------|
| Typo / doc clarification | **No** — open a PR directly. |
| Bug fix in reference implementation | **No** — PR with test. |
| Test-suite addition | **No** — PR. |
| New directive syntax | **Yes.** |
| Breaking change to manifest fields | **Yes.** |
| New conformance level or profile | **Yes.** |
| New file under `history/snapshots/` layout, etc. | **Yes.** |
| Deprecation or removal | **Yes.** |
| Security-model change | **Yes** and requires a Phase-3 security review. |
| New reference-implementation language | **Yes** (light — scope + maintainer). |

Rule of thumb: if the change affects what an **external implementer**
has to do, it needs an RFC.

## RFC file format

RFCs live in `docs/rfcs/` with naming convention:

```
rfcs/
  NNNN-kebab-case-title.md
```

Where `NNNN` is a zero-padded sequential number assigned at merge time
(not at draft time — draft PRs use the branch name).

## RFC template

```markdown
# RFC-NNNN: <Title>

- Start date: YYYY-MM-DD
- Authors: @handle, @handle
- Target MDZ version: 2.2.0 (or "n/a" for process / implementation RFCs)
- Status: Draft / Under review / Accepted / Rejected / Superseded
- Discussion issue: #<github issue number>
- Related RFCs: RFC-NNNN, RFC-NNNN

## Summary

One paragraph, non-technical. What changes? What does a user see?

## Motivation

What problem is this solving? Why does the existing format / tooling
fall short? Include concrete scenarios — "a reviewer trying to X finds
they can't because Y" is better than abstract principle.

## Detailed design

The substance. For spec RFCs: the exact grammar / manifest / directive
changes, with ABNF or schema snippets. For implementation RFCs: the
API surface. For process RFCs: the new workflow in full.

Include:
- Normative language (MUST / SHOULD / MAY) where applicable.
- Migration guidance for existing archives / implementations.
- Conformance test fixtures that demonstrate the change.

## Backward compatibility

Does this break v2.0 archives / readers / writers? If yes, what's the
upgrade path? What's the sunset date for the old behavior?

Readers MUST accept the older form for at least 12 months after an RFC
lands. Writers MAY emit the new form immediately.

## Security considerations

Does this change the threat model? New attack surface? Reference
`docs/security/THREAT_MODEL.md` and identify any new threats (T19+).

## Alternatives considered

- What else did you consider?
- Why is this the right choice?
- What's the smaller version of this RFC we could ship first?

## Unresolved questions

Anything the author can't answer without implementation experience.
These become issues attached to the RFC after acceptance.

## Prior art

- Links to how other formats solved this (JATS, EPUB, Quarto, etc.).
- Links to academic literature where relevant.
```

## Workflow

### 1. Pre-RFC discussion (optional, recommended)

Before writing the RFC, open a GitHub Discussions thread tagged
`proposal:<area>`. Sketch the idea, gather feedback, see if anyone
else is solving the same problem.

For large changes, this discussion runs 2+ weeks before a PR lands.

### 2. Draft PR

Open a PR to `docs/rfcs/` with a file named
`NNNN-kebab-title.md` (use `0000` as the placeholder number). Mark
the PR as **draft**. PR description includes:

- A one-paragraph summary pulled from the RFC.
- Links to prior-art implementations if any.
- An explicit "this RFC is not yet ready for formal review" note.

### 3. Review period

- **Minor RFCs** (no breaking change, single spec clause): 2 weeks of
  public review.
- **Normal RFCs**: 4 weeks.
- **Breaking-change RFCs**: 8 weeks (public + stakeholder notification).

During review:

- Implementers of the reference implementations weigh in on feasibility.
- Security reviewer (usually the editor, eventually a dedicated
  volunteer) flags threat-model impact.
- At least 2 reviewers other than the author must approve before the
  RFC can be merged.

### 4. Final comment period (FCP)

The editor opens a "final comment period" comment on the PR:

> FCP triggered; resolving this RFC. If no blocking concerns are raised
> within 7 days, this RFC will be merged as Accepted.

FCP is the last chance to object. "I disagree with the direction" at
FCP should come with a concrete alternative; "I haven't had time to
review" is not a block — you had the 2/4/8 weeks.

### 5. Merge

On merge:

- RFC file moves from `0000-*` to `NNNN-*` with the sequential number.
- Status field changes from `Draft` to `Accepted`.
- Editor opens tracking issues for implementation.
- Spec + reference implementations updated by subsequent PRs, each
  linking back to the RFC.

### 6. Implementation

RFCs are not specs on their own — they describe WHAT and WHY. Once
merged, the real work is:

- Update `spec/MDZ_FORMAT_SPECIFICATION_vN.md` (or start a new v
  file).
- Update `spec/grammar/mdz-directives.abnf`.
- Update `spec/manifest-vN.schema.json` if manifest fields change.
- Add conformance fixtures to `tests/conformance/`.
- Update reference implementations (Python, TypeScript, Rust).
- Update CLI + viewer if applicable.

Each implementation PR links the RFC and passes the expanded
conformance suite.

### 7. Post-implementation retrospective

After all implementations ship, the editor opens a retrospective
issue:

- Did the RFC's design survive implementation?
- Were the backward-compatibility claims accurate?
- Any errata to publish?

Lessons feed into future RFCs.

## Rejection

RFCs may be rejected by:

- Unresolved blocking concerns at FCP.
- The editor exercising VETO (see CHARTER.md decision-making).
- Withdrawal by the author.

Rejection is final only for that specific RFC. A resubmission that
addresses the rejection reasons is welcome.

## Errata

If an Accepted RFC turns out to be wrong after implementation:

- Minor errata: update the RFC file in-place with an ERRATA section at
  the top; no new RFC needed.
- Major errata: supersede with a new RFC that references the old one
  via the `Related RFCs` field; old RFC's status moves to `Superseded`.

## Example RFC number scheme

```
0001 — Formal ABNF grammar for MDZ directives           (Phase 1)
0002 — ::cite / ::ref / labelable blocks                (Phase 1)
0003 — delta-snapshots-v1 extension                     (Phase 4)
0004 — Streaming / lazy-loading reader profile          (Phase 4)
0005 — W3C DID-Web signer identity, concrete semantics  (Phase 3)
0006 — Content-addressed storage (multihash / CID)      (Phase 4+)
```

Numbers are assigned at merge time, so drafts can run in parallel.

## FAQ

**Can I propose an RFC if I'm not a regular contributor?** Yes. The
process is open to anyone.

**Do RFCs need a reference implementation to be accepted?** For spec
RFCs, at least one working implementation (feature-branched in a fork)
is expected before FCP. For process RFCs, no implementation is needed.

**What if no one reviews my RFC?** The editor sets a minimum-activity
threshold — if an RFC sits with no reviewer comments for 4 weeks, the
editor solicits reviewers or moves the RFC to `Stalled` status. A
stalled RFC can be revived by new activity.

**Where do I discuss an in-flight RFC?** Primary: the PR comments on
GitHub. Secondary: the CG mailing list once chartered. Tertiary: the
bi-weekly call if you need synchronous discussion.
