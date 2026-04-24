# Partnership outreach plan

**Goal of this document:** turn the vague "find a champion at arXiv" hope into
a concrete list of people to email, a message template, and a tracking table.

---

## The theory

Every successful open format had at least one institutional champion early.

- EPUB: the International Digital Publishing Forum, backed by publishers.
- PDF: Adobe.
- Jupyter: Project Jupyter + NumFOCUS + Sloan.
- Quarto: Posit (RStudio).
- MDZ: *TBD — this document is the plan to find them.*

We are not asking partners to adopt MDZ tomorrow. We are asking:

> "Would you review our draft and tell us whether the format is headed in a
> direction that could plausibly integrate with your pipeline in 2–3 years?"

Low-commitment, high-information ask. The response (even "no, never") is
the deliverable.

## Target organizations

Ranked by fit, not by prestige.

### Tier 1 — natural fits (contact first)

| Organization | Specific people to target | Ask |
|-------------|---------------------------|-----|
| **Zenodo / CERN** | Sünje Dallmeier-Tiessen (head of scientific information service), Jose Benito Gonzalez Lopez (Zenodo tech lead) | Would you accept MDZ uploads? What profile / metadata would you need? |
| **arXiv** | Steinn Sigurðsson (scientific director), Paul Ginsparg (founder, emeritus but influential) | Interest in structured-submission formats beyond LaTeX? |
| **OSF (Center for Open Science)** | Brian Nosek (exec director), engineering team via contact form | Native MDZ rendering on preprint pages? |
| **Protocols.io** | Lenny Teytelman (CEO) | Protocol reproducibility + `::cell` fit |
| **Curvenote** | Rowan Cockett (co-founder) | Adoption as *their* export/import format — zero-sum concern addressed upfront |

### Tier 2 — journal editorial

| Organization | Specific people to target | Ask |
|-------------|---------------------------|-----|
| **PLOS** | CTO / VP of product | Would you pilot MDZ in a single journal issue? |
| **eLife** | Emmy Tsang (Head of Open Research Communication) | executable-research-articles program fit |
| **Nature Research** | Iain Hrynaszkiewicz (director of research data and open research) | cautious, but Springer Nature has the budget |
| **F1000Research** | Editorial leadership | Open post-publication review model + signed reviews fit well |
| **Frontiers** | Production engineering | XML-heavy submission pipeline, JATS bridge matters |

### Tier 3 — scientific societies / infrastructure

| Organization | Why | Ask |
|-------------|-----|-----|
| **American Physical Society** | arXiv's natural publisher counterpart | Pilot for a single APS journal |
| **ACS / RSC (chem)** | chemRxiv operators | Structured-submission interest |
| **IEEE** | Engineering papers are heavily structured | Profile for IEEE paper template |
| **ORCID** | DID / did:web integration story | How should MDZ resolve `did:web` → ORCID? |
| **DataCite** | DOI minting + MDZ content_id relationship | Can content_id be recorded in DataCite metadata? |
| **Crossref** | Same for journal DOIs | Crossref deposit from MDZ? |

### Tier 4 — allies in adjacent tooling

Not partners in the "integrate with us" sense, but people who could use or
recommend MDZ:

- **Jupyter Book / MyST maintainers** (Chris Holdgraf, Rowan Cockett)
- **Quarto** (JJ Allaire, Carlos Scheidegger) — good-faith conversation about
  where MDZ fits *alongside* Quarto
- **Pandoc** (John MacFarlane) — about a Pandoc writer/reader for MDZ
- **ReadiumJS** (Daniel Weck) — since EPUB bridge is on the roadmap
- **tree-sitter maintainers** — for the grammar work

## Message template

Subject: `Open format proposal for executable scientific papers — looking for your feedback`

> Hi [name],
>
> I'm working on **MDZ**, an open file format for executable scientific
> papers. It's a signed ZIP container carrying Markdown, executable code
> cells, data, figures, citations, and provenance in one archive.
>
> I'm not asking for adoption. I'm asking whether you'd be willing to
> review the draft spec and give feedback on whether it could plausibly
> integrate with [Zenodo's upload pipeline / arXiv's submission system /
> your journal's production workflow / etc.] in a 2–3 year timeframe.
>
> The positioning document is here: [link to POSITIONING.md]
> The draft spec is here: [link to repo]
>
> Specifically, I'd value your thoughts on:
>
> 1. [one concrete question tied to their domain]
> 2. [one concrete question about constraints they face]
> 3. Is this a direction you'd want to engage with, or is it a "come back
>    when it's further along" situation? Both answers are useful.
>
> Happy to write more, meet for 30 minutes, or stay out of your way —
> whichever works best.
>
> Thanks,
> [your name]
>
> P.S. MDZ is open-spec, open-reference-implementation. No vendor. No
> subscription. No IP claims.

Why this template works:

- Concrete ask, bounded time.
- Respects their time — "both answers are useful."
- Two specific questions force a non-generic reply.
- PS distinguishes us from Curvenote and the VC-backed space.

## Tracking

Maintain at `docs/PARTNERSHIPS_TRACKING.md` (private-by-choice or in a
spreadsheet, not checked in). Columns:

| Org | Contact | Date reached | Response | Next action | Notes |

Target: **20+ conversations by end of Phase 0**. At this volume, ~1–3
real responses become a champion relationship.

## What counts as a "win"

- **Hard win:** a named contact at an org says "we would pilot MDZ for
  [X]" with a concrete timeline.
- **Soft win:** a named contact commits to reviewing the draft spec and
  giving feedback by a date.
- **Useful no:** detailed feedback on why MDZ doesn't fit their workflow
  — tells us what to change.
- **Useless no:** no reply, generic polite brush-off.

Useful-no is as valuable as soft-win for calibrating the roadmap. Useless-no
still counts toward the 20 — it's the distribution of responses we need,
not just the positive ones.

## Cadence

- **Phase 0:** 20 outreach attempts, tracked.
- **Phase 1:** follow up with the soft-wins, show them the new grammar /
  parser / conformance suite.
- **Phase 2:** convert 1–2 soft-wins into hard-wins with the viewer +
  editor in hand.

## Ethics

- No bulk email. Every message is hand-written to that person's work.
- No "influencer" cold-DMs on social media. Professional channels only.
- Disclose status honestly: experimental research project, not a company,
  not a product pitch.
- If someone says "not interested," remove them. Don't re-approach.
