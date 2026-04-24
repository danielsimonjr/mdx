# MDZ Accessibility Conformance Suite

**Phase 3.3 scaffold.** WCAG 2.1 AA baseline checks for the `<mdz-viewer>`
web component, run against a corpus of hand-crafted fixtures via axe-core
and pa11y.

## What this suite verifies — current state

**Phase 3.3 scaffold.** Currently ships a structural Python runner (no
browser) that catches 4 WCAG 2.1 AA criteria via markdown analysis. The
full Playwright + axe-core integration (which would cover color contrast,
keyboard nav, ARIA correctness) is Phase 3.3 work — this README
describes both the current state and the target fixture set.

| Fixture category | Phase | Status | What's tested |
|------------------|-------|--------|---------------|
| `fixtures/alt-text-*/` | 3.3a | ✓ ships | Every image has non-empty `alt` attribute (WCAG 1.1.1) |
| `fixtures/heading-order-*/` | 3.3a | ✓ ships | Heading levels are sequential; no h1→h3 skip (WCAG 2.4.10) |
| `fixtures/link-purpose-*/` | 3.3a | ✓ ships | Link text makes sense out of context (WCAG 2.4.4) |
| (language) | 3.3a | ✓ ships | `document.language` set in manifest (WCAG 3.1.1) — tested via runner, no dedicated fixture |
| `fixtures/color-contrast/` | 3.3b | ⏳ planned | WCAG 2.1 AA contrast (4.5:1 / 3:1) — needs browser |
| `fixtures/keyboard-nav/` | 3.3b | ⏳ planned | Interactive elements tabbable — needs browser |
| `fixtures/aria-labels/` | 3.3b | ⏳ planned | Landmarks/regions labelled — needs browser |
| `fixtures/table-semantics/` | 3.3b | ⏳ planned | `<th scope>` not `<td>` — browser-based check |
| `fixtures/video-captions/` | 3.3b | ⏳ planned | Video `captions[]` or `<track>` — manifest + DOM |
| `fixtures/landmarks/` | 3.3b | ⏳ planned | `<main>` / `<nav>` structure — browser |

## Running

```bash
# Install once
cd tests/accessibility
npm install

# Run against the viewer web component
npm run test

# Generate an HTML compliance report
npm run test:report
```

The runner spawns Chromium via Playwright, loads each fixture through
the viewer, and runs axe-core. Failures are printed with the WCAG
success-criterion reference and a suggested fix.

## Fixture format

Each fixture is a directory containing:

- `input.md` — the markdown the viewer renders
- `manifest.json` — optional; if absent, a default v2.0 manifest is
  wrapped around the input at test time
- `expected.json` — describes expected axe result shape:
  ```json
  {
    "expected_violations": [],
    "expected_passes": ["image-alt", "color-contrast"],
    "wcag_level": "AA",
    "description": "A bare paragraph and image; nothing exotic."
  }
  ```

For "positive" fixtures (should pass), `expected_violations` is empty.
For "negative" fixtures (documenting viewer bugs that shouldn't exist),
the expected violation is listed so the test fails loudly if the bug
is fixed without updating the fixture.

## Coverage target

- **v1 (Phase 3.3 ship):** 10 fixtures covering the highest-impact WCAG
  2.1 AA success criteria. The 10 listed in the table above.
- **v2 (Phase 4):** 40+ fixtures covering WCAG 2.2, per-locale RTL text,
  ARIA live regions, focus management during cell re-execution.

## Non-goals

- **Full WCAG 2.2 AAA.** AAA is optional; we target AA which is what
  journals actually require.
- **Manual accessibility testing.** axe-core catches ~30% of WCAG issues
  automatically. Manual screen-reader testing (NVDA/JAWS/VoiceOver) is
  a separate ROADMAP item (Phase 3.3 "accessibility conformance report"
  deliverable, not this automated suite).
- **Content-level accessibility.** This suite tests the viewer's output;
  whether the archive author wrote accessible content is a separate
  validator concern (`scientific-paper-v1.json` profile rules).

## Relationship to the format's accessibility declarations

Archives declare their own accessibility level in
`manifest.document.accessibility.api_compliance` (e.g., `["WCAG-2.1-AA"]`).
This suite verifies the VIEWER renders such archives accessibly —
combining a WCAG-AA-claiming archive with a viewer that fails axe-core
would be a bug in the viewer.

## Current status

Phase 3.3 scaffold in progress. Fixture directories exist; runner +
axe-core integration is under development. Until the runner lands, this
directory documents the target structure so contributors can start
adding fixtures.
