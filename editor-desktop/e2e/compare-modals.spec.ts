/**
 * Phase 2.3a.7 baseline: the Compare modals from Phase 2.3b.3
 * (versions) and 2.3b.5 (locales).
 *
 * `.skip`-marked: relies on the same fixture archive as
 * `open-save-roundtrip.spec.ts`, plus a delta-snapshots-v1 chain and
 * at least two locales (`document.en.md` + `document.fr.md`). The
 * fixture builder will produce both as part of Phase 2.3a.7.1.
 *
 * Once unskipped:
 *   - Compare versions: open the modal, select two snapshots, assert
 *     the block-diff renders insertion / deletion markers and that
 *     paragraph-aligned sync-scroll keeps the two panes in lockstep.
 *   - Compare locales: open the side-by-side view, scroll the source
 *     pane, assert the target pane scrolls proportionally.
 */

import { test, expect } from "./fixtures/electron-app.js";

test.describe("compare modals", () => {
  test.skip("compare-versions diff renders block-diff markers", async ({ page }) => {
    void page;
    expect(true).toBe(true);
  });

  test.skip("compare-locales sync-scroll stays paragraph-aligned", async ({ page }) => {
    void page;
    expect(true).toBe(true);
  });
});
