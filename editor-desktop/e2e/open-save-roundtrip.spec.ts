/**
 * Phase 2.3a.7 baseline: open the deterministic fixture archive,
 * mutate the manifest title via the contextBridge surface, save to a
 * fresh path, reopen, assert the mutation persisted.
 *
 * The fixture is built by `e2e/fixtures/build-fixtures.mjs` and
 * checked in as `sample.mdz` so the test doesn't depend on the
 * builder running first. CI's verification job greps build-fixtures
 * for the inlined PNG hash to catch divergence; see
 * `editor-desktop/e2e/fixtures/build-fixtures.mjs` for the
 * self-check assertion.
 */

import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { test, expect } from "./fixtures/electron-app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test.describe("open/save round-trip", () => {
  test("opens fixture archive and persists a manifest mutation", async ({ page }) => {
    const fixture = join(__dirname, "fixtures", "sample.mdz");

    // Step 1 — read fixture bytes via the contextBridge openFromPath.
    const opened = await page.evaluate(async (path) => {
      return await (window as unknown as {
        editorApi: { openFromPath: (p: string) => Promise<unknown> };
      }).editorApi.openFromPath(path);
    }, fixture);
    expect(opened).toMatchObject({
      ok: true,
      archive: { manifest: { document: { title: "E2E Sample Archive" } } },
    });

    // Step 2 — pick a fresh temp path and save with a mutated title.
    const outPath = join(
      await fsp.mkdtemp(join(tmpdir(), "mdz-e2e-")),
      "out.mdz",
    );
    const saveResult = await page.evaluate(
      async ({ source, target }) => {
        const api = (window as unknown as {
          editorApi: {
            openFromPath: (p: string) => Promise<{
              ok: boolean;
              archive: { manifest: Record<string, unknown>; content: string };
            }>;
            saveToPath: (
              p: string,
              payload: { manifest: Record<string, unknown>; content: string },
            ) => Promise<{ ok: boolean }>;
          };
        }).editorApi;
        const original = await api.openFromPath(source);
        if (!original.ok) throw new Error("source did not open");
        const manifest = original.archive.manifest as Record<string, unknown>;
        const document = manifest.document as Record<string, unknown>;
        const mutated = {
          ...manifest,
          document: { ...document, title: "Mutated by e2e" },
        };
        return await api.saveToPath(target, {
          manifest: mutated,
          content: original.archive.content,
        });
      },
      { source: fixture, target: outPath },
    );
    expect(saveResult).toEqual({ ok: true });

    // Step 3 — reopen the saved archive and assert the mutation stuck.
    const reopened = await page.evaluate(async (path) => {
      return await (window as unknown as {
        editorApi: { openFromPath: (p: string) => Promise<unknown> };
      }).editorApi.openFromPath(path);
    }, outPath);
    expect(reopened).toMatchObject({
      ok: true,
      archive: { manifest: { document: { title: "Mutated by e2e" } } },
    });

    await fsp.rm(outPath, { force: true });
  });
});
