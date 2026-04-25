# MDZ Editor — Phase 2.3a desktop scaffold

**Status:** 0.1.0-alpha. Phase 2.3a.1 (editor shell foundation) ships
in this directory; subsequent ROADMAP sub-phases (2.3a.2 source
editor, 2.3a.3 asset sidebar, 2.3a.4 .ipynb import, 2.3a.5 picker
pack, 2.3a.6 release engineering) build on top.

## What's here

| Path | Role |
|------|------|
| `src/main/archive-io.ts` | Pure open / save MDZ logic. Tested. |
| `src/main/main.ts` | Electron main-process glue. Wires IPC + menu + auto-update. |
| `src/preload/preload.ts` | `contextBridge` surface — all renderer ↔ main calls go through here. |
| `src/renderer/index.html` + `index.ts` | Minimal "Open archive, show title + content" UI. CodeMirror replaces the `<pre>` in 2.3a.2. |
| `test/archive-io.test.ts` | Vitest unit tests for the pure I/O layer. |
| `tsconfig.test.json` | Type-check config that excludes Electron-dependent files (CI runs this). |
| `tsconfig.main.json` | CommonJS build config for main + preload (real-build use). |
| `vite.config.ts` | Renderer dev server + production bundle config. |

## Install

```bash
# Default install: skips electron + electron-updater (~200 MB).
# Useful for CI and for inspecting the testable core.
npm install

# Local development: pulls Electron platform binaries.
npm install --include=optional
```

## Scripts

```bash
npm run test           # vitest — pure archive-io
npm run test:e2e       # Playwright + Electron (requires --include=optional + npm run build)
npm run typecheck:core # tsc on the testable subset
npm run dev            # vite + electron (requires --include=optional)
npm run build          # tsc main + preload, vite build renderer
```

### End-to-end suite (Phase 2.3a.7)

Specs live in `e2e/` and drive the production build of the editor via
Playwright's `_electron` API. The suite is not part of CI today —
it requires the Electron platform binary that's currently in
`optionalDependencies`. Local invocation:

```bash
npm install --include=optional
npm run build
npm run test:e2e
```

`e2e/smoke.spec.ts` is the always-on baseline (window mounts +
`window.editorApi` surface check). The remaining specs
(`open-save-roundtrip`, `picker-modals`, `compare-modals`,
`cell-runner`) are `.skip`-marked stubs — they ship checked in so the
test surface is reviewable, and Phase 2.3a.7.1 lands the fixture
archive that unblocks them.

## Acceptance for Phase 2.3a.1

Per ROADMAP §2.3a.1:

- [x] Electron app skeleton with main + sandboxed renderer split.
- [x] `contextIsolation: true`, `sandbox: true`, `nodeIntegration:
      false` on the BrowserWindow.
- [x] Vite dev server (port 5173) + production build for the
      renderer.
- [x] IPC channels for `archive:open` / `archive:save` /
      `dialog:openFile` / `dialog:saveFile`.
- [x] Pure archive-io module decoupled from Electron — testable
      without spawning the host.
- [x] `electron-updater` plumbing wired (no-op stub feed; real
      GitHub Releases endpoint lands in 2.3a.6).
- [x] Application menu (File → Open / Save / Save As / Quit) with
      accelerators.
- [x] CSP on the renderer HTML with `default-src 'self'` and no
      remote scripts.

## Next sub-phases

- **2.3a.2** Source editor + live preview (CodeMirror 6 + reuse
  `<mdz-viewer>`).
- **2.3a.3** Asset sidebar (drag-drop + content-hash on save).
- **2.3a.4** `.ipynb` import flow (calls existing
  `cli/src/commands/import-ipynb.js`).
- **2.3a.5** Visual-authoring picker pack (insertion engine + four
  per-directive pickers).
- **2.3a.6** Release engineering (signed installers, real
  auto-update feed, Playwright integration tests).

## What's NOT here yet

- Real Electron integration testing (Playwright + electron-driver).
  Pending Phase 2.3a.6.
- The viewer / preview pane. Pending 2.3a.2.
- Anything beyond "open + show". The renderer just dumps content as
  a `<pre>` — the editing surface is the next milestone.
