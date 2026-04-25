/**
 * Phase 2.3a.7 baseline: open an MDZ archive via the IPC bridge,
 * mutate the manifest, save back to a fresh path, and verify the
 * round-trip preserves declared structure.
 *
 * Currently `.skip`-marked because the fixture archive
 * (`e2e/fixtures/sample.mdz`) is built lazily by a Phase 2.3a.7.1
 * helper that imports `examples/v2/comprehensive.mdx` and re-zips it
 * with predictable timestamps. The helper isn't wired yet — the spec
 * is checked in so the test surface is reviewable and the fixture
 * landing PR has a clear target.
 *
 * What this spec asserts once unskipped:
 *   - openFromPath returns { ok: true, archive: { manifest, content, assets } }
 *   - saveToPath writes a valid ZIP at the target path
 *   - The new archive's manifest round-trips through MDZDocument.open
 *     with the mutation visible (e.g. document.title appended)
 */

import { test, expect } from "./fixtures/electron-app.js";

test.describe("open/save round-trip", () => {
  test.skip("opens fixture archive and persists a manifest mutation", async ({ page }) => {
    // Placeholder — see file header for the unskip prerequisite.
    void page;
    expect(true).toBe(true);
  });
});
