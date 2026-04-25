/**
 * Renderer entry point — the editor's UI.
 *
 * 0.1 scope (Phase 2.3a.1): a single button that round-trips an MDZ
 * through the main process and shows the manifest title + raw
 * content. CodeMirror + live preview lands in 2.3a.2; asset sidebar
 * in 2.3a.3.
 *
 * No Node access here. Everything goes through `window.editorApi`,
 * exposed by the preload bridge.
 */

import type { EditorApi } from "../preload/preload.js";

declare global {
  interface Window {
    editorApi: EditorApi;
  }
}

const titleEl = document.getElementById("title")!;
const pathEl = document.getElementById("path")!;
const contentEl = document.getElementById("content")!;
const openBtn = document.getElementById("open-btn") as HTMLButtonElement;

async function openFlow(): Promise<void> {
  const path = await window.editorApi.pickOpen();
  if (!path) return;
  const result = await window.editorApi.openFromPath(path);
  if (!result.ok) {
    titleEl.textContent = `Error opening: ${result.error}`;
    titleEl.classList.add("empty");
    pathEl.textContent = "";
    contentEl.textContent = "";
    return;
  }
  const manifest = result.archive.manifest as { document?: { title?: string } };
  titleEl.textContent = manifest.document?.title ?? "(untitled)";
  titleEl.classList.remove("empty");
  pathEl.textContent = result.archive.path;
  contentEl.textContent = result.archive.content;
}

openBtn.addEventListener("click", () => {
  openFlow().catch((e) => {
    titleEl.textContent = `Error: ${(e as Error).message}`;
  });
});

// Wire the menu accelerators (Cmd/Ctrl+O, etc.) so the same flow
// fires from both the button and the menu.
window.editorApi.onMenu("open", () => {
  openFlow().catch(() => undefined);
});
