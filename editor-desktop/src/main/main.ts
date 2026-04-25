/**
 * Electron main-process entry point.
 *
 * Responsibilities:
 *   1. Create a sandboxed BrowserWindow with contextIsolation.
 *   2. Wire IPC handlers for archive open / save against the pure
 *      `archive-io.ts` module (which knows nothing about Electron).
 *   3. Application menu (File → Open / Save / Save As / Quit).
 *   4. Auto-update bootstrap via electron-updater (no-op stub feed
 *      until release-engineering Phase 2.3a.6 wires a real GitHub
 *      Releases endpoint).
 *
 * Why this file isn't unit-tested: the Electron API is host-specific
 * (BrowserWindow, app, dialog, Menu) and pulling it in via
 * `optionalDependencies` keeps CI fast. The testable logic lives in
 * `archive-io.ts`. Integration testing for the editor shell is an
 * explicit Phase 2.3a.6 follow-up via Playwright with electron+
 * webContents driving.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promises as fsp, existsSync } from "node:fs";

import {
  openArchive,
  saveArchive,
  ArchiveOpenError,
  ArchiveSaveError,
  type FsLike,
} from "./archive-io.js";
import { runIpynbImport } from "./ipynb-import.js";

// Electron is in optionalDependencies; require lazily so the module
// can be imported by typecheck even when electron isn't installed.
type ElectronModule = typeof import("electron");
type AutoUpdaterModule = typeof import("electron-updater");

let electron: ElectronModule;
let autoUpdater: AutoUpdaterModule["autoUpdater"] | null = null;

try {
  electron = require("electron") as ElectronModule;
} catch (e) {
  throw new Error(
    "Electron is not installed. The editor shell requires Electron at " +
      "runtime — install with `npm install --include=optional`. " +
      `(${(e as Error).message})`,
  );
}

try {
  autoUpdater = (require("electron-updater") as AutoUpdaterModule).autoUpdater;
} catch {
  autoUpdater = null; // optional; Phase 2.3a.6 wires the real feed
}

const { app, BrowserWindow, ipcMain, Menu, dialog } = electron;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Node fs adapter — production-side `FsLike`. */
const nodeFs: FsLike = {
  readFile: (path) => fsp.readFile(path),
  writeFile: (path, bytes) => fsp.writeFile(path, bytes),
  exists: async (path) => existsSync(path),
};

let mainWindow: import("electron").BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "MDZ Editor",
    webPreferences: {
      // Sandbox + contextIsolation are non-negotiable. The renderer
      // runs untrusted MDZ markdown via <mdz-viewer>; even though the
      // viewer's own sanitizer strips dangerous HTML, defense-in-
      // depth means the renderer process has no Node.js access at
      // all.
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(__dirname, "..", "preload", "preload.js"),
    },
  });

  if (process.env.MDZ_EDITOR_DEV === "1") {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(join(__dirname, "..", "renderer", "index.html"));
  }
}

// ---------------------------------------------------------------------------
// IPC handlers — thin wrappers around the pure archive-io functions
// ---------------------------------------------------------------------------

ipcMain.handle("archive:open", async (_e, path: string) => {
  try {
    return { ok: true, archive: await openArchive(path, nodeFs) };
  } catch (e) {
    if (e instanceof ArchiveOpenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
});

ipcMain.handle("archive:save", async (_e, path: string, payload: {
  manifest: Record<string, unknown>;
  content: string;
  /** IPC serializes Map → array of [k, Uint8Array] pairs; restore here. */
  assets?: Array<[string, Uint8Array]>;
}) => {
  try {
    const assetMap = payload.assets ? new Map(payload.assets) : undefined;
    await saveArchive(
      path,
      { manifest: payload.manifest, content: payload.content, assets: assetMap },
      nodeFs,
    );
    return { ok: true };
  } catch (e) {
    if (e instanceof ArchiveSaveError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
});

ipcMain.handle("dialog:openFile", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Open MDZ archive",
    filters: [{ name: "MDZ archives", extensions: ["mdz", "mdx"] }],
    properties: ["openFile"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("dialog:openIpynb", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Import Jupyter notebook as MDZ",
    filters: [{ name: "Jupyter notebooks", extensions: ["ipynb"] }],
    properties: ["openFile"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("ipynb:import", async (_e, ipynbPath: string) => {
  try {
    const mdzPath = await runIpynbImport(ipynbPath);
    return { ok: true, mdzPath };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
});

ipcMain.handle("dialog:saveFile", async (_e, defaultName?: string) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save MDZ archive",
    defaultPath: defaultName,
    filters: [{ name: "MDZ archives", extensions: ["mdz"] }],
  });
  return result.canceled ? null : result.filePath;
});

// ---------------------------------------------------------------------------
// Menu + lifecycle
// ---------------------------------------------------------------------------

function buildMenu(): import("electron").Menu {
  return Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          label: "Open…",
          accelerator: "CmdOrCtrl+O",
          click: () => mainWindow?.webContents.send("menu:open"),
        },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => mainWindow?.webContents.send("menu:save"),
        },
        {
          label: "Save As…",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => mainWindow?.webContents.send("menu:save-as"),
        },
        { type: "separator" },
        {
          label: "Import Jupyter notebook…",
          click: () => mainWindow?.webContents.send("menu:import-ipynb"),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildMenu());
  createWindow();

  // Auto-update feed wired to GitHub Releases via electron-builder's
  // publish config (electron-builder.yml). The feed URL is generated
  // at build time and embedded in the installer; at runtime, the
  // updater fetches the latest-<platform>.yml from
  // github.com/danielsimonjr/mdx/releases and compares versions.
  //
  // Until the first signed release ships, no release matches the
  // current version's update channel, so checkForUpdates resolves
  // with `update-not-available` — that's the intended steady state
  // for a pre-release build.
  if (autoUpdater) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    // Logger output goes to the Electron app's userData/logs dir;
    // useful for diagnosing "why didn't my update fire?" on user
    // reports. Production builds keep it at info; debug builds
    // (MDZ_EDITOR_DEV=1) escalate to debug.
    if (process.env.MDZ_EDITOR_DEV === "1") {
      // electron-updater's logger field is typed loosely; cast.
      const updaterAny = autoUpdater as unknown as { logger?: { transports?: { file?: { level?: string } } } };
      if (updaterAny.logger?.transports?.file) {
        updaterAny.logger.transports.file.level = "debug";
      }
    }
    autoUpdater
      .checkForUpdates()
      .catch((e: Error) => {
        // Network failures are expected on cold-start with no
        // connectivity; log to stderr but don't surface to the user.
        console.error("[auto-update] checkForUpdates failed:", e.message);
      });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
