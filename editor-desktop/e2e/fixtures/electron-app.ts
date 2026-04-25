/**
 * Playwright fixture that boots the editor as an Electron app and
 * yields the first BrowserWindow page to the test (Phase 2.3a.7).
 *
 * Usage:
 *   import { test, expect } from "./fixtures/electron-app.js";
 *   test("smoke: window opens", async ({ page }) => {
 *     await expect(page).toHaveTitle(/MDZ Editor/);
 *   });
 *
 * Why a custom fixture instead of inline `_electron.launch()` calls:
 *   1. We need to skip the entire suite cleanly when Electron isn't
 *      installed (it's in `optionalDependencies`). Doing the
 *      availability probe once in a fixture prevents N copies of the
 *      same try/catch in every spec.
 *   2. The fixture also tears down via `app.close()` in `use`'s
 *      cleanup path so a failing test doesn't leak Electron processes.
 *   3. Future iterations will add IPC mocks here (dialog stubs,
 *      sandboxed userData dirs) so individual specs stay focused on
 *      assertions rather than setup.
 */

import { test as base, _electron, expect, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Resolve the built main-process entry. The build is a prerequisite. */
function resolveMainEntry(): string {
  const root = resolve(__dirname, "..", "..");
  return join(root, "dist", "main", "main.js");
}

type Fixtures = {
  app: ElectronApplication;
  page: Page;
};

export const test = base.extend<Fixtures>({
  app: async ({}, use) => {
    const mainEntry = resolveMainEntry();
    if (!existsSync(mainEntry)) {
      test.skip(
        true,
        `Electron main bundle not found at ${mainEntry}. Run \`npm run build\` ` +
          `inside editor-desktop/ before invoking the e2e suite, or install ` +
          `Electron with \`npm install --include=optional\` if it's missing.`,
      );
    }
    const app = await _electron.launch({
      args: [mainEntry],
      // Spec workflows shouldn't trigger the auto-updater network call.
      env: { ...process.env, MDZ_EDITOR_E2E: "1" },
    });
    await use(app);
    await app.close();
  },
  page: async ({ app }, use) => {
    const page = await app.firstWindow();
    // Wait for the renderer's main entry to mount. The renderer sets
    // `data-mdz-ready="1"` on <body> once initial wiring completes; if
    // that attribute hasn't shipped yet, fall back to DOM-content-load.
    try {
      await page.waitForSelector("body[data-mdz-ready='1']", { timeout: 10_000 });
    } catch {
      await page.waitForLoadState("domcontentloaded");
    }
    await use(page);
  },
});

export { expect };
