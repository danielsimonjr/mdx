/**
 * Phase 2.3a.7 baseline: per-cell ▶ Run button (Phase 2.3b.1.3) and
 * the Pyodide CDN bootstrap (Phase 2.3b.1.1–2).
 *
 * Pyodide loads from cdn.jsdelivr.net the first time a cell runs; the
 * CSP relaxation that allows that fetch is asserted in the unit suite
 * (`test/python-kernel.test.ts`). The e2e equivalent watches the user
 * journey: open an archive containing a Python cell, click ▶, wait
 * for the output to render in the preview pane.
 *
 * `.skip`-marked: requires (a) the fixture archive from
 * `open-save-roundtrip.spec.ts`, and (b) a network-allow flag for the
 * CI runner. Both arrive with Phase 2.3a.7.1.
 */

import { test, expect } from "./fixtures/electron-app.js";

test.describe("per-cell run + Pyodide", () => {
  test.skip("clicking ▶ on a Python cell renders the output", async ({ page }) => {
    void page;
    expect(true).toBe(true);
  });

  test.skip("Pyodide CDN load completes within the configured budget", async ({ page }) => {
    void page;
    expect(true).toBe(true);
  });
});
