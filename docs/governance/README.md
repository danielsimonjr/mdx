# Governance

This directory hosts the governance documents for the MDZ Format project.
**Everything here is draft and not yet in force** — Phase 5 of
`../../ROADMAP.md` explicitly gates the W3C Community Group charter
submission on adoption milestones from earlier phases.

## Documents

- [`CHARTER.md`](CHARTER.md) — Draft W3C Community Group charter. Defines
  mission, scope, deliverables, decision-making rules, and termination
  conditions.
- [`RFC_PROCESS.md`](RFC_PROCESS.md) — How changes to the spec,
  reference implementations, and tooling get proposed, reviewed, and
  merged. Includes the RFC template and workflow.
- [`TRADEMARK.md`](TRADEMARK.md) — Nominative-fair-use rules for the
  "MDZ Format" wordmark. Draft; will be filed as a registered trademark
  when adoption warrants it.
- [`RELEASE_ENGINEERING.md`](RELEASE_ENGINEERING.md) — Versioning
  policy, release workflow, errata process, supply-chain security
  practices.

## Status checklist

What governance artifact needs to exist before each phase milestone:

| Milestone | Requirement | Status |
|-----------|-------------|--------|
| Phase 1 ship (grammar, parser, conformance) | RFC process in draft | ✓ (this commit) |
| Phase 2 ship (viewer, editor MVP) | RFC process in use, first RFC merged | ⏳ |
| Phase 3 ship (security, accessibility) | Trademark draft published | ✓ (this commit) |
| Phase 4 ship (ecosystem, corpus) | Release engineering formalized | ✓ (this commit) |
| Phase 5 charter submission | Charter draft + 5 W3C-member endorsements | Draft ✓ / endorsements ⏳ |

## Why these docs exist now, before anyone needs them

Two reasons:

1. **Shape future work.** Having a draft charter means Phase 4 decisions
   can be made with a clear picture of what "governance" will eventually
   require — rather than discovering in Phase 5 that we've painted
   ourselves into a corner.
2. **Signal seriousness.** Partners we want to recruit (W3C members,
   journal publishers, academic institutions) want to see that
   governance questions have been thought about, not left as "we'll
   figure it out."

The docs are explicitly *draft*. They will change substantially before
they're operationalized. Contributions welcome — open a PR or an issue
tagged `governance`.
