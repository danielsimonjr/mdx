/**
 * Preload script — bridges a tiny, audited API into the sandboxed
 * renderer via `contextBridge`. The renderer NEVER has direct access
 * to Node.js, IPC, or the filesystem; everything goes through this
 * layer.
 *
 * Surface below is exactly what the renderer needs. New methods MUST
 * undergo a security review before landing — every method here is a
 * potential capability leak from main into renderer.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

import { contextBridge, ipcRenderer } from "electron";

interface OpenedArchiveSerialized {
  path: string;
  manifest: Record<string, unknown>;
  // ipcMain serializes Map → array of [k, v] pairs; we restore client-side.
  entries: Array<[string, Uint8Array]>;
  content: string;
}

const api = {
  openFromPath: async (path: string) => {
    const result = (await ipcRenderer.invoke("archive:open", path)) as
      | { ok: true; archive: { path: string; manifest: Record<string, unknown>; entries: Map<string, Uint8Array>; content: string } }
      | { ok: false; error: string };
    return result;
  },
  saveToPath: async (path: string, payload: unknown) => {
    return (await ipcRenderer.invoke("archive:save", path, payload)) as
      | { ok: true }
      | { ok: false; error: string };
  },
  pickOpen: async () => (await ipcRenderer.invoke("dialog:openFile")) as string | null,
  pickSave: async (defaultName?: string) =>
    (await ipcRenderer.invoke("dialog:saveFile", defaultName)) as string | null,
  /**
   * Subscribe to menu events from main (File → Open / Save / Save As).
   * Returns an unsubscribe function.
   */
  onMenu: (event: "open" | "save" | "save-as", handler: () => void): (() => void) => {
    const channel = `menu:${event}`;
    const listener = () => handler();
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

export type EditorApi = typeof api;
export type { OpenedArchiveSerialized };

contextBridge.exposeInMainWorld("editorApi", api);
