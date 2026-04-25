import { defineConfig } from "vite";

/**
 * Vite config for the editor's renderer bundle. Main + preload
 * processes are compiled separately via tsconfig.main.json (CommonJS
 * + ES2022).
 */
export default defineConfig({
  root: "src/renderer",
  base: "./",
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/renderer/index.html",
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
