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

import type { EditorApi } from "./types.js";

const api: EditorApi = {
  openFromPath: async (path) =>
    ipcRenderer.invoke("archive:open", path) as ReturnType<EditorApi["openFromPath"]>,
  saveToPath: async (path, payload) =>
    ipcRenderer.invoke("archive:save", path, payload) as ReturnType<EditorApi["saveToPath"]>,
  pickOpen: async () => ipcRenderer.invoke("dialog:openFile") as Promise<string | null>,
  pickSave: async (defaultName) =>
    ipcRenderer.invoke("dialog:saveFile", defaultName) as Promise<string | null>,
  pickIpynb: async () => ipcRenderer.invoke("dialog:openIpynb") as Promise<string | null>,
  importIpynb: async (ipynbPath) =>
    ipcRenderer.invoke("ipynb:import", ipynbPath) as ReturnType<EditorApi["importIpynb"]>,
  encodeVariants: async (payload) =>
    ipcRenderer.invoke("variants:encode", payload) as ReturnType<EditorApi["encodeVariants"]>,
  onMenu: (event, handler) => {
    const channel = `menu:${event}`;
    const listener = () => handler();
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld("editorApi", api);
