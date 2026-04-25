/**
 * Phase 2.3a.7 smoke baseline: the editor launches, the renderer
 * mounts, and the contextBridge surface (`window.editorApi`) is wired.
 *
 * This is the "is the boat floating?" test. If this passes we know:
 *   - The main process built and Electron can spawn it
 *   - Vite renderer bundle loaded into the BrowserWindow
 *   - preload.ts ran and exposed editorApi via contextBridge
 *
 * Every other e2e spec depends on those three things, so failing this
 * makes the rest moot.
 */

import { test, expect } from "./fixtures/electron-app.js";

test.describe("editor smoke", () => {
  test("window mounts with the expected title", async ({ page }) => {
    await expect(page).toHaveTitle(/MDZ Editor/);
  });

  test("contextBridge exposes the editorApi surface", async ({ page }) => {
    const surface = await page.evaluate(() => {
      const api = (window as unknown as { editorApi?: Record<string, unknown> }).editorApi;
      if (!api) return null;
      return Object.keys(api).sort();
    });
    expect(surface).not.toBeNull();
    // Snapshot the expected method set. Adding a new IPC method should
    // be a deliberate test update — this catches accidental capability
    // leaks (extra exposed methods) and accidental removals.
    expect(surface).toEqual([
      "encodeVariants",
      "importIpynb",
      "onMenu",
      "openFromPath",
      "pickIpynb",
      "pickOpen",
      "pickSave",
      "saveToPath",
    ]);
  });
});
