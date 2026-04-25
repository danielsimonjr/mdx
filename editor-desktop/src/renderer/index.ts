/**
 * Renderer entry point — wires the DOM to the editor-pane factory.
 *
 * Phase 2.3a.2 scope: open an MDZ → CodeMirror source pane on the
 * left, live `<mdz-viewer>`-style preview on the right, mode toggle
 * for source-only / preview-only / split. Save (Cmd/Ctrl+S) writes
 * to disk via the IPC bridge.
 *
 * 2.3a.3 (asset sidebar) and 2.3a.5 (picker pack) hang off the DOM
 * declared in `index.html`; this entry-point owns the pane lifecycle
 * and the open/save flows.
 */

import type { EditorApi } from "../preload/types.js";
import { createEditorPane, type EditorPane, type ViewMode } from "./editor-pane.js";

declare global {
  interface Window {
    editorApi: EditorApi;
  }
}

interface OpenSession {
  path: string;
  manifest: Record<string, unknown>;
  /** Original file content — used to detect "modified" state. */
  baseline: string;
}

const titleEl = document.getElementById("title")!;
const pathEl = document.getElementById("path")!;
const sourceHost = document.getElementById("source")!;
const previewHost = document.getElementById("preview")!;
const paneEl = document.getElementById("pane")!;
const openBtn = document.getElementById("open-btn") as HTMLButtonElement;
const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
const modifiedIndicator = document.getElementById("modified-indicator")!;
const modeButtons: Record<ViewMode, HTMLButtonElement> = {
  source: document.getElementById("mode-source") as HTMLButtonElement,
  split: document.getElementById("mode-split") as HTMLButtonElement,
  preview: document.getElementById("mode-preview") as HTMLButtonElement,
};

let session: OpenSession | null = null;
let pane: EditorPane | null = null;

function setModified(modified: boolean): void {
  modifiedIndicator.hidden = !modified;
}

function setModeButtons(active: ViewMode): void {
  for (const [m, btn] of Object.entries(modeButtons)) {
    btn.setAttribute("aria-pressed", String(m === active));
  }
}

async function ensurePane(initialContent: string): Promise<EditorPane> {
  if (pane) {
    pane.setContent(initialContent);
    return pane;
  }
  // Replace the placeholder paragraph with an empty preview host so
  // renderMarkdown's output isn't wrapped in the empty state.
  previewHost.innerHTML = "";
  pane = await createEditorPane(
    { sourceHost, previewHost, modeHost: paneEl },
    {
      initialContent,
      mode: "split",
      onChange: (source) => {
        if (session) setModified(source !== session.baseline);
      },
      onSave: () => {
        void saveFlow();
      },
    },
  );
  return pane;
}

async function openFlow(): Promise<void> {
  const path = await window.editorApi.pickOpen();
  if (!path) return;
  const result = await window.editorApi.openFromPath(path);
  if (!result.ok) {
    titleEl.textContent = `Error opening: ${result.error}`;
    titleEl.classList.add("empty");
    pathEl.textContent = "";
    return;
  }
  const manifest = result.archive.manifest as { document?: { title?: string } };
  titleEl.textContent = manifest.document?.title ?? "(untitled)";
  titleEl.classList.remove("empty");
  pathEl.textContent = result.archive.path;
  session = {
    path: result.archive.path,
    manifest: result.archive.manifest,
    baseline: result.archive.content,
  };
  setModified(false);
  await ensurePane(result.archive.content);
}

async function saveFlow(): Promise<void> {
  if (!pane || !session) return;
  const content = pane.getContent();
  const result = await window.editorApi.saveToPath(session.path, {
    manifest: session.manifest,
    content,
  });
  if (!result.ok) {
    titleEl.textContent = `Save failed: ${result.error}`;
    return;
  }
  session.baseline = content;
  setModified(false);
}

openBtn.addEventListener("click", () => {
  openFlow().catch((e) => {
    titleEl.textContent = `Error: ${(e as Error).message}`;
  });
});

saveBtn.addEventListener("click", () => {
  saveFlow().catch((e) => {
    titleEl.textContent = `Save error: ${(e as Error).message}`;
  });
});

for (const [m, btn] of Object.entries(modeButtons)) {
  btn.addEventListener("click", () => {
    pane?.setMode(m as ViewMode);
    setModeButtons(m as ViewMode);
  });
}

async function importIpynbFlow(): Promise<void> {
  const ipynbPath = await window.editorApi.pickIpynb();
  if (!ipynbPath) return;
  titleEl.textContent = "Importing notebook…";
  const result = await window.editorApi.importIpynb(ipynbPath);
  if (!result.ok) {
    titleEl.textContent = `Import failed: ${result.error}`;
    titleEl.classList.add("empty");
    return;
  }
  // Successful import — open the produced .mdz directly.
  const opened = await window.editorApi.openFromPath(result.mdzPath);
  if (!opened.ok) {
    titleEl.textContent = `Imported but couldn't reopen: ${opened.error}`;
    return;
  }
  const manifest = opened.archive.manifest as { document?: { title?: string } };
  titleEl.textContent = manifest.document?.title ?? "(untitled)";
  titleEl.classList.remove("empty");
  pathEl.textContent = opened.archive.path;
  session = {
    path: opened.archive.path,
    manifest: opened.archive.manifest,
    baseline: opened.archive.content,
  };
  setModified(false);
  await ensurePane(opened.archive.content);
}

window.editorApi.onMenu("open", () => {
  openFlow().catch(() => undefined);
});
window.editorApi.onMenu("save", () => {
  saveFlow().catch(() => undefined);
});
window.editorApi.onMenu("import-ipynb", () => {
  importIpynbFlow().catch((e) => {
    titleEl.textContent = `Import error: ${(e as Error).message}`;
  });
});
