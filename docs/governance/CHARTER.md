# MDZ Format Community Group — Charter (Draft)

**Status:** Draft. Not yet submitted to W3C. Phase 5 of ROADMAP.md
blocks charter submission on having 5+ W3C Member-organization
endorsements, which requires the adoption milestones in Phase 2/3/4 to
hit first.

**Intended parent:** W3C Community Group (CG) framework. If/when the CG
demonstrates sustained use across multiple implementers with
interoperability proven by a shared conformance suite, graduation to a
Working Group (WG) becomes possible — but that's a 5+ year horizon.

---

## Mission

Advance the **MDZ** (Markdown Zipped Container) file format as an open
interchange format for **executable scientific papers**. Specifically:

1. Publish versioned specifications of the MDZ format, grammar, and
   conformance suite.
2. Maintain reference implementations (TypeScript, Python, Rust) that
   track the spec.
3. Coordinate interoperability between third-party readers / writers
   via the conformance suite.
4. Liaise with adjacent formats (JATS, EPUB 3, ipynb, CSL-JSON) to
   ensure clean bridges exist.
5. Provide a venue for discussion of extensions, errata, and breaking
   changes that the format's users can rely on.

## Scope

**In scope:**

- MDZ specification (v1.1, v2.0, future v2.1/v3.0).
- ABNF grammar for MDZ directives.
- Profile schema (`spec/profiles/*.json`).
- Conformance test suite (`tests/conformance/`).
- Reference implementations hosted in the github.com/danielsimonjr/mdx
  repository (or its successor).
- Interop liaison with JATS 1.3, EPUB 3.3, ipynb 4.5, CSL-JSON 1.0.
- Security threat model + CSP profile.
- Accessibility conformance criteria.
- Extension registry (e.g., `delta-snapshots-v1`, future
  `lazy-loading-v1`).

**Out of scope:**

- Competing with general-purpose document formats (ODT, DOCX).
- Enforcing journal editorial policy — that belongs to journals.
- Operating hosted services (`view.mdz-format.org` is run by an
  operator, not the CG itself).
- Trademark enforcement (handled by the trademark owner; see
  `TRADEMARK.md`).
- Cryptocurrency / token / NFT integration. Explicit non-goal.

## Deliverables (12-month horizon once chartered)

- **MDZ v2.1** — `::cite`, `::ref`, `::fig`/`::eq`/`::tab` labelable
  blocks. Published as a Community Group Report.
- **Conformance test suite v1.0** — minimum 100 fixtures across
  positive / negative / roundtrip / edge categories. Machine-readable
  results; reader-implementation scorecards.
- **Security threat model v1.0** — the current Phase 3 draft, polished
  to Community Group Report.
- **Accessibility conformance report** — the Phase 3.3 WCAG 2.1 AA axe
  + Playwright suite results against the reference viewer.
- **Interop-testing matrix** — monthly report of which reader + writer
  pairs produce byte-identical conformant output, published at
  `mdz-format.org/interop/`.

## Participants

**Initial participants (at charter draft):**

- Founder / primary editor (Daniel Simon Jr.).
- Open invitation to anyone who implements or uses MDZ.

**Target participants at charter submission (minimum):**

- 5 W3C Member organizations endorsing the CG.
- 2 journal / publisher representatives interested in MDZ as a
  submission or archive format.
- 2 existing-tool maintainers (Quarto, Jupyter Book, Curvenote,
  Manubot, Stencila) — to coordinate interop rather than duplicate
  work.
- 1 accessibility-specialist organization (e.g., an a11y consulting
  firm, DAISY Consortium, or academic a11y researcher).

## Meeting cadence

- **Bi-weekly video calls** (30 min) for regular business — async-first
  agenda on the CG mailing list.
- **Quarterly face-to-face or virtual F2F** for deeper discussions
  (spec revisions, governance changes).
- **Annual roadmap review** — published report summarizing adoption
  metrics, open issues, and planned work for the next year.

All meeting notes are posted to the CG wiki within 7 days.

## Decision-making

Patterned on the W3C TAG and on IETF rough-consensus traditions:

1. **Ordinary discussion** happens on the mailing list and GitHub
   issues. The editor proposes text; participants comment.
2. **Spec-affecting changes** require a **2-week public review** before
   merging, with a summary of the change at the top of the issue.
3. **Breaking changes** (e.g., a v3.0 that isn't backward-compatible
   with v2.x) require **4 weeks** of review and a documented migration
   path.
4. **Formal votes** happen only if rough consensus can't be achieved.
   Voting is one vote per participant, simple majority of those who
   respond within the review window. The editor retains the right to
   VETO any change that breaks the format's core value proposition
   (executable, signed, single-file, open-spec).

## Intellectual property

- The CG operates under the **W3C Community Contributor License
  Agreement (CLA)** as defined in the W3C Community and Business Group
  Process (<https://www.w3.org/community/about/process/>) — contributions
  are licensed back to the community royalty-free. The canonical CLA
  text lives at <https://www.w3.org/community/about/agreements/cla/>.
- No patent commitments beyond what the W3C CG framework requires.
- Reference-implementation code is MIT-licensed; the spec itself is
  CC-BY-4.0.
- Trademark "MDZ Format" is held separately — see `TRADEMARK.md`.

## Termination

The CG may be dissolved if:

- No meetings happen for 12 consecutive months.
- The editor resigns and no replacement volunteers within 90 days.
- W3C Process Document requires termination (e.g., for code-of-conduct
  violations that can't be resolved).

On dissolution, the github repository and all spec history remain
publicly accessible under their existing licenses. The domain
`mdz-format.org` transitions to a community-elected custodian or is
retired.

---

## Path to charter approval

1. **Phase 4 adoption milestones hit** (10+ papers, 1 journal pilot).
   These establish real usage — a precondition for W3C member interest.
2. **Draft charter reviewed** by 3+ external reviewers with governance
   experience (W3C TAG alumni, OSS foundation-board members).
3. **Member endorsements gathered** — minimum 5, target 10.
4. **Charter submitted to W3C** via the CG application form.
5. **CG chartered** — typically within 4-6 weeks of a well-prepared
   submission.

This document will be revised extensively before submission. Current
state is to lock the high-level structure so Phase 4 work doesn't
accidentally paint us into a corner on governance questions.
