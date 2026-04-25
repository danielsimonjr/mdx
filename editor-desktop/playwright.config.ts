/**
 * Playwright configuration for editor-desktop end-to-end tests
 * (Phase 2.3a.7).
 *
 * The shipped editor is an Electron app, so the only project here uses
 * Playwright's `_electron` driver — no browser projects. Specs live in
 * `e2e/` (separate from the vitest unit tests in `test/`) so the two
 * runners never clash on the same files.
 *
 * Why scaffold-only: spinning up Electron in CI requires installing the
 * ~200 MB platform binary that's currently in `optionalDependencies`
 * (see comment-optional-deps in package.json). The scaffold therefore
 * runs locally on developer machines that have done
 * `npm install --include=optional`; CI keeps the existing typecheck +
 * vitest validation. A future Phase 2.3a.7.1 may add a separate CI job
 * that opts into the Electron install on a tag-cut workflow.
 */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // One worker — Electron sessions hold global filesystem locks (lock
  // files in userData), and concurrent app instances will collide on
  // the dialog mocking we set up in the fixture.
  workers: 1,
  fullyParallel: false,
  // 30s default; Electron cold-start on Windows can take ~10s before
  // the renderer is ready, leaving headroom for the actual assertion.
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    // Capture trace on first retry so flaky launches surface a
    // reviewable artifact without ballooning every passing run.
    trace: "on-first-retry",
  },
  // No `projects` — the spec files spawn Electron via the fixture in
  // e2e/fixtures/electron-app.ts. Adding a "chromium" project here
  // would mislead readers into thinking we test in a browser.
});
