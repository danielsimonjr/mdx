import { defineConfig } from "vitest/config";

/**
 * Vitest config — separate from `vite.config.ts` because vite is
 * scoped to the renderer (root: src/renderer) but tests need the
 * package root so they can pick up `test/**` and import from
 * `src/main/`. Defining tests here keeps the renderer build clean.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
