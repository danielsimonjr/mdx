/**
 * Phase 2.3a.7 baseline: the four directive picker modals from
 * Phase 2.3a.5.1–4 + 2.3b.7.1–5.
 *
 * Each picker is exercised in vitest at the unit level
 * (`test/directive-pickers.test.ts`); these e2e specs assert the
 * full keyboard-driven flow: invoke via toolbar/menu, pick an asset,
 * close, observe the inserted directive in the editor pane.
 *
 * Currently `.skip`-marked — opening these requires the open/save
 * fixture from `open-save-roundtrip.spec.ts`. Once that fixture lands,
 * each picker test follows the same shape:
 *   1. Load the fixture archive
 *   2. Click the picker's toolbar button (data-test-id)
 *   3. Select an item with keyboard navigation
 *   4. Confirm the directive text appears at the cursor
 */

import { test, expect } from "./fixtures/electron-app.js";

test.describe("directive picker modals", () => {
  for (const directive of [
    "::fig",
    "::eq",
    "::tab",
    "::cite",
    "::video",
    "::audio",
    "::model",
    "::embed",
    "::data",
  ] as const) {
    test.skip(`${directive} picker inserts directive at cursor`, async ({ page }) => {
      // See file header for the unskip prerequisite.
      void page;
      expect(directive).toMatch(/^::/);
    });
  }
});
