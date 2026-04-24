# Funding model

**Decision status:** OPEN. This document gates Phase 1 scope; nothing in
Phase 1 is committed until one of the options below is selected.

---

## The problem in one sentence

The ROADMAP.md work implies roughly **3–5 full-time engineers for 24 months**
to land Phase 2 as specified. Solo execution takes 4–5× the timeline. Volunteer
contribution can't fund a pro-grade desktop editor.

## What each phase actually costs

Rough estimates, not budgets:

| Phase | FTE-months required | Notes |
|-------|---------------------|-------|
| 0 — Rename + docs + survey | 2 | Currently underway |
| 1 — Grammar + parser + conformance + fuzz | 6–8 | Requires ≥1 senior engineer |
| 2.1 — Web component viewer | 6–9 | Full-time frontend; KaTeX/video/ARIA |
| 2.2 — Hosted rendering service | 2 | Serverless, content CDN |
| 2.3a — Editor MVP | 6 | Electron + CodeMirror; pro-grade polish |
| 2.3b — Editor Pro features | 12 | Post-MVP, author-feedback-driven |
| 2.4 — EPUB + JATS bridges | 4 | Two bridges, shared by 1 engineer |
| 2.5 — Browser extension | 2 | WebExtensions, 4-store submission |
| 3 — Security + a11y conformance | 4–6 | Security review + axe-core |
| **Total to end of Phase 2** | **44–58 FTE-months** | **~2 years × 2–3 FTE** |

## Option A — Open-source grants

**Target programs:**

- **Chan Zuckerberg Initiative — Essential Open-Source Software for
  Science.** Funded Quarto adjacency; explicit interest in reproducibility
  tooling. Cycles ~annual. $150K–$500K per award. Requires existing
  community traction (>50 GitHub stars, >5 contributors).
- **Sloan Foundation — Digital Technology (Research + Data).** Funded
  Jupyter Book / Executable Books. $500K–$1M awards, 2–3 year terms.
  Fit: very strong.
- **NumFOCUS Sustainability Program.** Fiscal sponsorship + grantwriting
  support. Good if we want to donate to a 501(c)(3) fiscal sponsor rather
  than incorporate.
- **Mozilla Technology Fund / MIECO.** Smaller grants ($50K–$150K), fast
  turnaround, good for viewer + accessibility work specifically.
- **NSF POSE (Pathways to Enable Open-Source Ecosystems).** Phase I ~$300K
  planning grant; Phase II multi-year execution. Fit: possible but
  academic-heavy.
- **European Open Science Cloud (EOSC) funding.** If we find an EU partner
  (Zenodo is at CERN), becomes accessible.

**Realistic timeline:** application → decision = 4–9 months. Start with CZI
+ Sloan (best fit) early; Mozilla as a smaller faster backup.

**Prerequisites before applying:**

1. Real prototype (MVP viewer) — grants rarely fund pure ideas.
2. Letters of support from ≥2 researchers / ≥1 journal editor / ≥1 preprint
   server engineer. (This is the Phase 0 outreach work in `PARTNERSHIPS.md`.)
3. Clear open governance model (not a one-person project).

## Option B — Institutional sponsorship

**Targets:**

- A university press (MIT Press, UC Press, Cambridge University Press) —
  they have interest in next-gen formats, production budget, and journals
  that could pilot.
- A funded OA journal (PLOS, eLife, Frontiers) — strongest fit; they
  already hire engineers for submission tooling.
- A scientific society (ACM, IEEE, AAAS, RSC, ACS) — conservative but deep
  pockets.
- A data-infrastructure nonprofit (CERN / Zenodo, CZI Biohub, Allen
  Institute) — pattern-matches with their mission.

**Ask size:** 1–2 FTE for 2 years (~$400K–$800K depending on geography).
Lower bar than a federal grant, faster close if the champion inside is real.

## Option C — Commercial-adjacent

**Model:** we build MDZ as an open format, but a separate entity (the person
driving this or a new org) sells a hosted viewer + editor subscription on top,
similar to how GitLab monetizes around git.

**Risk:** splits attention. Also easy for the "open" part to starve while the
"hosted" part gets all the development.

**When it works:** if there's one paying customer willing to fund the format
work in exchange for early access to the hosted product. (Curvenote did
something like this; their format is not open, which is why we exist.)

## Option D — Scoped-solo (no funding)

**What gets built:** viewer + CLI + Python/TypeScript libs + EPUB+JATS bridges.
Explicitly *no desktop editor*, *no hosted service*, *no browser extension*.

**Realistic timeline:** 3–4 years of weekend work to reach Phase 1 + trimmed
Phase 2. Everything else either never ships or ships when someone else funds
it.

**Why this might still be the right answer:**

- Forces ruthless scope discipline.
- No obligation to anyone.
- Viewer + bridges is still useful: authors can adopt the format through
  CLI + external tools, even without our editor.
- Market-tests the idea cheaply before asking anyone for money.

## Recommendation (subject to revision)

1. **Execute Option D scope** for Phase 0 + Phase 1 (6–12 months of personal
   time). Deliverables: rename, positioning docs, formal grammar, reference
   parsers, conformance suite, CLI. No editor, no hosted service.
2. **Apply to CZI + Sloan** in parallel once Phase 1 is ~70% done (we'll
   have the prototype + community signal grants require). If either hits,
   scale up to Phase 2.
3. **Outreach to 3 institutional sponsors in parallel** (one university press,
   one OA journal, one scientific society). Target a 12-month gap: if the
   grant or a sponsor lands, Phase 2 starts; if neither, we stay in Option D
   and drop the editor indefinitely.
4. **Publish this uncertainty** — the README STATUS banner should say
   "funding not yet secured, Phase 2 scope depends on it." Authentic is
   better than performative.

## Explicit non-decisions

- **No VC funding.** A scientific-paper format should not have an IRR
  requirement; the investor-return structure breaks the "open format" promise.
- **No acqui-hire discussion.** Too early.
- **No paid support contracts** until there's a user base.
- **No crypto / token model.** Don't even joke about this.

## Update cadence

Review this doc quarterly. Changes to the funding model change the roadmap
scope; the roadmap links to this doc for a reason.
