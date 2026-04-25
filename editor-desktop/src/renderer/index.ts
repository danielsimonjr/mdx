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
import { AssetStore, formatSize, webCryptoHasher } from "./asset-store.js";
import {
  openCellPicker,
  openIncludePicker,
  openFigPicker,
  openCitePicker,
  openAssetPointerPicker,
} from "./directive-modal.js";
import type { AssetPointerKind } from "./directive-insert.js";
import { collectExistingIds, collectBibliographyKeys } from "./directive-pickers.js";
import { checkMarkdown, summarize, type A11yViolation } from "./accessibility-checker.js";
import { runVariantFlow, summarizeFlow, type VariantEncoderCallback } from "./variant-flow.js";

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
const assetStore = new AssetStore(webCryptoHasher);

const pickerButtons = {
  cell: document.getElementById("picker-cell") as HTMLButtonElement,
  include: document.getElementById("picker-include") as HTMLButtonElement,
  fig: document.getElementById("picker-fig") as HTMLButtonElement,
  cite: document.getElementById("picker-cite") as HTMLButtonElement,
  video: document.getElementById("picker-video") as HTMLButtonElement,
  audio: document.getElementById("picker-audio") as HTMLButtonElement,
  model: document.getElementById("picker-model") as HTMLButtonElement,
  embed: document.getElementById("picker-embed") as HTMLButtonElement,
  data: document.getElementById("picker-data") as HTMLButtonElement,
};

const a11yStatusEl = document.getElementById("a11y-status")!;
const a11yPanelEl = document.getElementById("a11y-panel")!;
const generateVariantsBtn = document.getElementById("generate-variants-btn") as HTMLButtonElement;

const dropzone = document.getElementById("asset-dropzone") as HTMLDivElement;
const assetListEl = document.getElementById("asset-list") as HTMLUListElement;
const assetCountEl = document.getElementById("asset-count")!;
const fileInput = document.getElementById("asset-file-input") as HTMLInputElement;

function renderAssetList(): void {
  assetListEl.innerHTML = "";
  const entries = assetStore.list();
  assetCountEl.textContent = String(entries.length);
  for (const e of entries) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "asset-path";
    span.textContent = e.path;
    span.title = `${e.path}\n${e.contentHash}`;
    const size = document.createElement("span");
    size.className = "asset-size";
    size.textContent = formatSize(e.sizeBytes);
    const del = document.createElement("button");
    del.className = "asset-delete";
    del.type = "button";
    del.textContent = "×";
    del.title = `Remove ${e.path}`;
    del.addEventListener("click", () => {
      assetStore.remove(e.path);
      renderAssetList();
      if (session) setModified(true);
    });
    li.append(span, size, del);
    assetListEl.append(li);
  }
}

async function ingestFiles(files: FileList | File[]): Promise<void> {
  for (const f of Array.from(files)) {
    const buf = new Uint8Array(await f.arrayBuffer());
    await assetStore.add(f.name, buf);
  }
  renderAssetList();
  if (session) setModified(true);
}

dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files) {
    void ingestFiles(fileInput.files);
    fileInput.value = "";
  }
});
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (e.dataTransfer?.files.length) {
    void ingestFiles(e.dataTransfer.files);
  }
});

function setModified(modified: boolean): void {
  modifiedIndicator.hidden = !modified;
}

function setModeButtons(active: ViewMode): void {
  for (const [m, btn] of Object.entries(modeButtons)) {
    btn.setAttribute("aria-pressed", String(m === active));
  }
}

function setPickersEnabled(enabled: boolean): void {
  for (const btn of Object.values(pickerButtons)) btn.disabled = !enabled;
  generateVariantsBtn.disabled = !enabled;
}

const ipcEncoder: VariantEncoderCallback = (input) =>
  window.editorApi.encodeVariants({ sources: input.sources, plan: input.plan });

generateVariantsBtn.addEventListener("click", () => {
  void (async () => {
    if (!session) return;
    generateVariantsBtn.disabled = true;
    const original = generateVariantsBtn.textContent;
    generateVariantsBtn.textContent = "Generating…";
    try {
      const result = await runVariantFlow(assetStore, ipcEncoder);
      titleEl.textContent = summarizeFlow(result);
      if (result.written > 0) {
        renderAssetList();
        setModified(true);
      }
    } catch (e) {
      titleEl.textContent = `Variant generation error: ${(e as Error).message}`;
    } finally {
      generateVariantsBtn.textContent = original;
      generateVariantsBtn.disabled = !session;
    }
  })();
});

/**
 * Run the accessibility checker over the current source + manifest
 * and update the status bar. Wired to the editor pane's onChange so
 * findings track keystrokes; the underlying check is regex-based and
 * fast enough that no extra debounce is needed (the source-render
 * debounce coalesces it for free).
 */
function refreshA11y(source: string): void {
  const violations = checkMarkdown(source, session?.manifest ?? null);
  a11yStatusEl.textContent = summarize(violations);
  a11yStatusEl.classList.toggle("has-issues", violations.length > 0);
  a11yStatusEl.classList.toggle("ok", violations.length === 0);
  renderA11yPanel(violations);
}

function renderA11yPanel(violations: ReadonlyArray<A11yViolation>): void {
  a11yPanelEl.innerHTML = "";
  if (violations.length === 0) {
    a11yPanelEl.hidden = true;
    return;
  }
  const ul = document.createElement("ul");
  for (const v of violations) {
    const li = document.createElement("li");
    const where = v.line > 0 ? `line ${v.line}` : "document";
    li.textContent = `[${v.rule} / WCAG ${v.wcag}] ${where}: ${v.message}`;
    ul.appendChild(li);
  }
  a11yPanelEl.appendChild(ul);
}

a11yStatusEl.addEventListener("click", () => {
  if (a11yPanelEl.children.length === 0) return;
  a11yPanelEl.hidden = !a11yPanelEl.hidden;
});
a11yStatusEl.addEventListener("keydown", (e) => {
  if ((e as KeyboardEvent).key === "Enter" || (e as KeyboardEvent).key === " ") {
    e.preventDefault();
    a11yStatusEl.click();
  }
});

/**
 * Bibliography lookup. CSL-JSON is read from the archive's
 * `references.json` (root-level by convention) when the archive is
 * opened — `referencesJson` below holds the raw text. When absent
 * or malformed the cite picker falls back to permissive mode (any
 * key accepted, no validation).
 */
let referencesJson: string | null = null;
function bibliographyKeysFromAssets(): ReadonlySet<string> | null {
  return referencesJson == null ? null : collectBibliographyKeys(referencesJson);
}

async function runPicker(
  open: () => Promise<import("./directive-insert.js").InsertionPayload | null>,
): Promise<void> {
  if (!pane) return;
  const payload = await open();
  if (!payload) return;
  pane.insertDirective(payload);
  if (session) setModified(true);
}

pickerButtons.cell.addEventListener("click", () => {
  void runPicker(() => openCellPicker(document.body));
});
pickerButtons.include.addEventListener("click", () => {
  void runPicker(() =>
    openIncludePicker(document.body, assetStore.list().map((e) => e.path)),
  );
});
pickerButtons.fig.addEventListener("click", () => {
  void runPicker(() =>
    openFigPicker(document.body, collectExistingIds(pane?.getContent() ?? "")),
  );
});
pickerButtons.cite.addEventListener("click", () => {
  void runPicker(() => openCitePicker(document.body, bibliographyKeysFromAssets()));
});

for (const kind of ["video", "audio", "model", "embed", "data"] as const satisfies ReadonlyArray<AssetPointerKind>) {
  pickerButtons[kind].addEventListener("click", () => {
    void runPicker(() =>
      openAssetPointerPicker(document.body, kind, assetStore.list().map((e) => e.path)),
    );
  });
}

async function ensurePane(initialContent: string): Promise<EditorPane> {
  if (pane) {
    pane.setContent(initialContent);
    setPickersEnabled(true);
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
        refreshA11y(source);
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
  await assetStore.loadFromArchive(result.archive.entries);
  renderAssetList();
  // Pick up references.json (root-level CSL-JSON) for the cite
  // picker's bibliography validation. AssetStore filters to `assets/`
  // entries only, so we read it straight from the archive map.
  const refsBytes = result.archive.entries.get("references.json");
  referencesJson = refsBytes ? new TextDecoder().decode(refsBytes) : null;
  await ensurePane(result.archive.content);
  setPickersEnabled(true);
  refreshA11y(result.archive.content);
}

async function saveFlow(): Promise<void> {
  if (!pane || !session) return;
  const content = pane.getContent();
  // Project the asset store into manifest.assets so the saved archive
  // carries up-to-date paths + content_hashes. We mutate a copy of
  // the manifest, never the open session's reference, so a save
  // failure leaves the in-memory state untouched.
  const manifestCopy: Record<string, unknown> = {
    ...session.manifest,
    assets: assetStore.manifestProjection(),
  };
  const result = await window.editorApi.saveToPath(session.path, {
    manifest: manifestCopy,
    content,
    assets: Array.from(assetStore.toEntriesMap().entries()),
  });
  if (!result.ok) {
    titleEl.textContent = `Save failed: ${result.error}`;
    return;
  }
  session.manifest = manifestCopy;
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
  await assetStore.loadFromArchive(opened.archive.entries);
  renderAssetList();
  const refsBytes = opened.archive.entries.get("references.json");
  referencesJson = refsBytes ? new TextDecoder().decode(refsBytes) : null;
  await ensurePane(opened.archive.content);
  setPickersEnabled(true);
  refreshA11y(opened.archive.content);
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
