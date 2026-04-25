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

### Always-on baseline (Python, no browser)

```bash
python tests/accessibility/run_accessibility.py
```

Runs the structural rules (image-alt / heading-order / link-name /
document-language) against every fixture under `fixtures/`. CI
exercises this on every push.

### Browser-driven runner (Phase 3.3 axe-core scaffold)

```bash
# Install once — heavy (~150 MB for Playwright chromium-headless-shell)
npm install --no-save axe-core@^4.10.0 playwright@^1.59.0
npx playwright install chromium

# Run against fixtures-axe/
npm run test:a11y-real
```

`tests/accessibility/run_axe.js` boots Chromium via Playwright, loads
each `fixtures-axe/*/input.html` via `page.setContent()` (no network),
injects axe-core, and asserts `axe.run()` violations exactly match
`expected.json`. Catches the WCAG criteria the Python runner cannot:
contrast (1.4.3), keyboard / focus (2.1.1, 2.4.7), ARIA (4.1.2), form
labels (1.3.1, 4.1.2), and landmarks (1.3.1).

This runner is **opt-in, not in CI** today — the Playwright + Chromium
install is too heavy to pay on every push. Promote to CI when the
fixture-pack count justifies the runner cost (currently 7 axe fixtures;
Phase 3.3b target is +20 more).

## Fixture format

### `fixtures/` — markdown, structural rules

Each directory contains:

- `input.md` — markdown the structural Python runner scans
- `expected.json` — `{expected_violations, wcag_level, description}`

### `fixtures-axe/` — HTML, axe-core rules

Each directory contains:

- `input.html` — minimal page. Load via `page.setContent()`; no network.
- `expected.json` — `{expected_violations, wcag_level, wcag_criteria, description}`

For "positive" fixtures (should pass), `expected_violations` is empty.
For "negative" fixtures (documenting failure modes the viewer must
not produce), the expected violation IDs are listed; drift either
direction surfaces as a per-fixture FAIL.

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
