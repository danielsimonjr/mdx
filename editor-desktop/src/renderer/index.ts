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
import { extractPythonCells, runCells, insertOutputs } from "./cell-runner.js";
import { loadPyodideKernel, type PythonKernel } from "./python-kernel.js";
import { mergeKernelDeclaration } from "./kernel-manifest.js";
import { attachCellRunButtons, spliceSingleCellOutput } from "./cell-run-buttons.js";
import { tokenizeBlocks, diffBlocks } from "./block-diff.js";
import { renderBlockOps, renderDiffStats } from "./diff-render.js";
import {
  parseSnapshotIndex,
  reconstructVersionSync,
  type SnapshotIndex,
} from "@mdz-format/viewer";
import {
  loadAnnotations,
  buildThreads,
  findTrustWarnings,
  type Annotation,
} from "./annotations.js";
import { renderAnnotationSidebar, summarizeAnnotations } from "./annotations-render.js";
import { enumerateLocales, planAddLocale } from "./locales.js";
import { buildSyncScrollState, mapWithFallback } from "./sync-scroll.js";

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
const runCellsBtn = document.getElementById("run-cells-btn") as HTMLButtonElement;
const diffBtn = document.getElementById("diff-btn") as HTMLButtonElement;
const localeBtn = document.getElementById("locale-btn") as HTMLButtonElement;

/**
 * Track the open archive's parsed snapshot index + raw entry text
 * so the Compare-versions modal can reconstruct any saved version
 * without going back through the file system.
 */
let snapshotIndex: SnapshotIndex | null = null;
const snapshotEntryText = new Map<string, string>();

let annotations: Annotation[] = [];
const annotationListEl = document.getElementById("annotation-list")!;
const annotationCountEl = document.getElementById("annotation-count")!;
const tabAssets = document.getElementById("tab-assets") as HTMLButtonElement;
const tabAnnotations = document.getElementById("tab-annotations") as HTMLButtonElement;
const panelAssets = document.getElementById("panel-assets")!;
const panelAnnotations = document.getElementById("panel-annotations")!;

function activateSidebarTab(which: "assets" | "annotations"): void {
  tabAssets.setAttribute("aria-selected", String(which === "assets"));
  tabAnnotations.setAttribute("aria-selected", String(which === "annotations"));
  panelAssets.dataset.active = String(which === "assets");
  panelAnnotations.dataset.active = String(which === "annotations");
}
tabAssets.addEventListener("click", () => activateSidebarTab("assets"));
tabAnnotations.addEventListener("click", () => activateSidebarTab("annotations"));

function refreshAnnotationsPanel(): void {
  if (annotations.length === 0) {
    annotationListEl.innerHTML = `<p class="annotation-empty">No annotations.</p>`;
    annotationCountEl.textContent = "0";
    return;
  }
  // We don't yet have signature data wired up — pass an empty set,
  // which means every signed-required annotation surfaces as a warning.
  // Phase 3 signature integration will replace this with the real
  // signed-creator id set from `security/signatures.json`.
  const warnings = findTrustWarnings(annotations, new Set());
  const threads = buildThreads(annotations);
  annotationListEl.innerHTML = renderAnnotationSidebar(threads, warnings);
  annotationCountEl.textContent = String(threads.length);
  // Update the title-bar mini-summary too, so users see whether
  // annotations are present without opening the panel.
  const summary = summarizeAnnotations(threads);
  if (summary !== "0 annotations" && tabAnnotations.getAttribute("aria-selected") !== "true") {
    tabAnnotations.title = summary;
  }
}

function loadAnnotationsState(entries: ReadonlyMap<string, Uint8Array>): void {
  const result = loadAnnotations(entries);
  annotations = result.annotations;
  if (result.errors.length > 0) {
    console.warn("[annotations] parse errors:", result.errors);
  }
  refreshAnnotationsPanel();
}

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
  runCellsBtn.disabled = !enabled;
  diffBtn.disabled = !enabled;
  localeBtn.disabled = !enabled;
}

/**
 * Track raw locale-file text per archive open so the
 * "Compare locales" modal can pull a sibling without going back
 * through IPC.
 */
const localeFileText = new Map<string, string>();

function loadLocaleState(entries: ReadonlyMap<string, Uint8Array>): void {
  localeFileText.clear();
  if (!session) return;
  for (const entry of enumerateLocales(session.manifest)) {
    const bytes = entries.get(entry.path);
    if (bytes) localeFileText.set(entry.language, new TextDecoder().decode(bytes));
  }
}

function openLocaleModal(): void {
  if (!pane || !session) return;
  const localeEntries = enumerateLocales(session.manifest);
  const primary = localeEntries.find((e) => e.primary) ?? localeEntries[0];
  const hasSiblings = localeEntries.length >= 2;
  const dialog = document.createElement("dialog");
  dialog.className = "locale-modal";
  dialog.innerHTML = `
    <div class="locale-modal-header">
      <h3 style="margin:0;font-size:1rem;">Compare &amp; edit locales</h3>
      <div class="diff-modal-controls">
        <select aria-label="Sibling locale"></select>
        <button type="button" class="add-locale-btn" title="Add a new sibling locale">+ Add locale</button>
        <button type="button" class="save-locale-btn" title="Save right-pane edits to the archive's locale file">Save locale</button>
        <button type="button" class="cancel-btn">Close</button>
      </div>
    </div>
    <div class="locale-modal-body">
      <div class="locale-pane left-pane"></div>
      <textarea class="locale-pane right-pane" spellcheck="false" aria-label="Sibling locale source"></textarea>
    </div>
  `;
  const select = dialog.querySelector("select") as HTMLSelectElement;
  const populateSelect = (): void => {
    select.innerHTML = "";
    for (const e of localeEntries) {
      if (e.language === primary.language) continue;
      const opt = document.createElement("option");
      opt.value = e.language;
      opt.textContent = e.language;
      select.appendChild(opt);
    }
  };
  populateSelect();
  const leftPane = dialog.querySelector(".left-pane") as HTMLDivElement;
  const rightPane = dialog.querySelector(".right-pane") as HTMLTextAreaElement;
  const cancelBtn = dialog.querySelector(".cancel-btn") as HTMLButtonElement;
  const addLocaleBtn = dialog.querySelector(".add-locale-btn") as HTMLButtonElement;
  const saveLocaleBtn = dialog.querySelector(".save-locale-btn") as HTMLButtonElement;
  if (!hasSiblings) {
    rightPane.value = "";
    rightPane.placeholder = "(no sibling locale yet — click \"+ Add locale\" to create one)";
  }

  let syncing = false;
  const refresh = (): void => {
    const leftText = pane!.getContent();
    const rightText = select.value ? localeFileText.get(select.value) ?? "" : "";
    leftPane.innerHTML = `<h4>${escapeHtmlSimple(primary.language)} (current draft)</h4>` + escapeHtmlSimple(leftText);
    rightPane.value = rightText;
    saveLocaleBtn.disabled = !select.value;
    const state = buildSyncScrollState(leftText, rightText);
    leftPane.scrollTop = 0;
    rightPane.scrollTop = 0;
    const lineHeight = 1.5 * 13.6;
    const scrollHandler = (source: "left" | "right"): (() => void) => () => {
      if (syncing) { syncing = false; return; }
      syncing = true;
      const fromPane = source === "left" ? leftPane : rightPane;
      const toPane = source === "left" ? rightPane : leftPane;
      const sourceLine = Math.max(1, Math.round(fromPane.scrollTop / lineHeight) + 1);
      const targetLine = mapWithFallback(state, sourceLine, source === "left" ? "ltr" : "rtl");
      toPane.scrollTop = (targetLine - 1) * lineHeight;
    };
    leftPane.addEventListener("scroll", scrollHandler("left"));
    rightPane.addEventListener("scroll", scrollHandler("right"));
  };

  select.addEventListener("change", refresh);
  cancelBtn.addEventListener("click", () => { dialog.close(); dialog.remove(); });

  saveLocaleBtn.addEventListener("click", () => {
    if (!session || !select.value) return;
    // Update the in-memory locale text. saveFlow picks it up from the
    // assetStore's writeback path on the next save.
    localeFileText.set(select.value, rightPane.value);
    setModified(true);
    titleEl.textContent = `Locale ${select.value} edited (save the document to persist).`;
  });

  addLocaleBtn.addEventListener("click", () => {
    if (!session) return;
    const tag = window.prompt("New locale BCP-47 tag (e.g. es-ES):", "");
    if (!tag) return;
    if (localeEntries.some((e) => e.language === tag)) {
      titleEl.textContent = `Locale ${tag} already declared.`;
      return;
    }
    try {
      const { manifest: patched, newPath } = planAddLocale(session.manifest, tag);
      session.manifest = patched;
      // Seed the new locale's file text with the primary draft so the
      // user can edit it down — same as the spec's "pre-populated
      // from the current pane" rule.
      const primaryText = pane!.getContent();
      localeFileText.set(tag, primaryText);
      // Update enumeration so the dropdown picks it up.
      localeEntries.push({ language: tag, path: newPath, primary: false });
      populateSelect();
      select.value = tag;
      setModified(true);
      titleEl.textContent = `Added locale ${tag} → ${newPath} (save to persist).`;
      refresh();
    } catch (e) {
      titleEl.textContent = `Add-locale failed: ${(e as Error).message}`;
    }
  });

  document.body.appendChild(dialog);
  dialog.showModal();
  refresh();
}

function escapeHtmlSimple(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

localeBtn.addEventListener("click", openLocaleModal);

/**
 * Load `history/snapshots/index.json` + every snapshot file from
 * the archive's entry map into module state. Called on every open.
 * No-ops gracefully if the extension isn't declared.
 */
function loadSnapshotState(entries: ReadonlyMap<string, Uint8Array>): void {
  snapshotIndex = null;
  snapshotEntryText.clear();
  const indexBytes = entries.get("history/snapshots/index.json");
  if (!indexBytes) return;
  try {
    snapshotIndex = parseSnapshotIndex(new TextDecoder().decode(indexBytes));
  } catch {
    // Malformed index — leave snapshotIndex null. The diff button
    // surfaces the parse error when clicked.
    return;
  }
  for (const [path, bytes] of entries) {
    if (path.startsWith("history/snapshots/base/") || path.startsWith("history/snapshots/deltas/")) {
      snapshotEntryText.set(path, new TextDecoder().decode(bytes));
    }
  }
}

function listSnapshotVersions(): string[] {
  if (!snapshotIndex) return [];
  const out: string[] = [];
  for (const chain of snapshotIndex.chains) {
    out.push(chain.base_version);
    for (const d of chain.deltas) out.push(d.version);
  }
  return out;
}

function openDiffModal(): void {
  if (!pane) return;
  const versions = listSnapshotVersions();
  if (versions.length === 0) {
    titleEl.textContent = "No saved snapshots — use `mdz snapshot create` to seed history.";
    return;
  }
  const dialog = document.createElement("dialog");
  dialog.className = "diff-modal";
  dialog.innerHTML = `
    <div class="diff-modal-header">
      <h3>Compare current draft vs.</h3>
      <div class="diff-modal-controls">
        <select aria-label="Snapshot version"></select>
        <button type="button" class="cancel-btn">Close</button>
      </div>
    </div>
    <div class="diff-modal-body"></div>
  `;
  const select = dialog.querySelector("select") as HTMLSelectElement;
  for (const v of versions) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  }
  const body = dialog.querySelector(".diff-modal-body") as HTMLDivElement;
  const cancelBtn = dialog.querySelector(".cancel-btn") as HTMLButtonElement;
  const refresh = (): void => {
    if (!pane || !snapshotIndex) return;
    try {
      const oldText = reconstructVersionSync(snapshotIndex, select.value, snapshotEntryText);
      const newText = pane.getContent();
      const ops = diffBlocks(tokenizeBlocks(oldText), tokenizeBlocks(newText));
      body.innerHTML = renderDiffStats(ops) + renderBlockOps(ops);
    } catch (e) {
      body.innerHTML = `<p class="empty">Reconstruction failed: ${(e as Error).message}</p>`;
    }
  };
  select.addEventListener("change", refresh);
  cancelBtn.addEventListener("click", () => {
    dialog.close();
    dialog.remove();
  });
  document.body.appendChild(dialog);
  dialog.showModal();
  refresh();
}

diffBtn.addEventListener("click", openDiffModal);

/**
 * Pyodide kernel handle. Lazy: we only download the ~10 MB WASM
 * bundle when the user first clicks "Run Python cells". Subsequent
 * clicks reuse the same handle (Pyodide globals persist between
 * runs — module-level imports stay loaded).
 */
let pythonKernel: PythonKernel | null = null;
async function getPythonKernel(): Promise<PythonKernel> {
  if (pythonKernel) return pythonKernel;
  pythonKernel = await loadPyodideKernel();
  return pythonKernel;
}

runCellsBtn.addEventListener("click", () => {
  void (async () => {
    if (!pane) return;
    const original = runCellsBtn.textContent;
    runCellsBtn.disabled = true;
    runCellsBtn.textContent = "Loading Python…";
    try {
      const source = pane.getContent();
      const cells = extractPythonCells(source);
      if (cells.length === 0) {
        titleEl.textContent = "No Python cells in document.";
        return;
      }
      const kernel = await getPythonKernel();
      runCellsBtn.textContent = `Running ${cells.length} cell${cells.length === 1 ? "" : "s"}…`;
      const runs = await runCells(cells, kernel);
      const updated = insertOutputs(source, runs);
      pane.setContent(updated);
      const errored = runs.find((r) => r.result.status === "error");
      const timed = runs.find((r) => r.result.status === "timeout");
      if (errored) {
        titleEl.textContent = `Stopped at cell ${errored.cell.index + 1}: ${errored.result.errorMessage?.split("\n")[0] ?? "error"}`;
      } else if (timed) {
        titleEl.textContent = `Cell ${timed.cell.index + 1} timed out — interpreter may still be running`;
      } else {
        titleEl.textContent = `Ran ${runs.length} cell${runs.length === 1 ? "" : "s"}.`;
      }
      if (session) setModified(true);
    } catch (e) {
      titleEl.textContent = `Run-cells error: ${(e as Error).message}`;
    } finally {
      runCellsBtn.textContent = original;
      runCellsBtn.disabled = !session;
    }
  })();
});

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
      onPreviewRendered: (host) => {
        // Phase 2.3b.1.3: inject Run buttons next to each Python
        // cell. Idempotent — re-renders on debounced source updates
        // don't duplicate buttons.
        attachCellRunButtons(host, {
          getKernel: () => getPythonKernel(),
          onCellRun: (synthetic, result) => {
            if (!pane) return;
            const updated = spliceSingleCellOutput(pane.getContent(), synthetic.source, result);
            if (updated !== pane.getContent()) {
              pane.setContent(updated);
              if (session) setModified(true);
            }
          },
          onStatus: (text) => {
            titleEl.textContent = text;
          },
        });
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
  loadSnapshotState(result.archive.entries);
  loadAnnotationsState(result.archive.entries);
  loadLocaleState(result.archive.entries);
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
    ...(pythonKernel ? { kernels: mergeKernelDeclaration(session.manifest) } : {}),
  };
  // Phase 2.3b.5.3: tunnel locale-file edits through the assets
  // tuple. The IPC handler treats each [path, bytes] pair the same
  // — non-asset paths get written verbatim into the archive, which
  // is exactly what we want for `document.<lang>.md` siblings.
  const localeAssets: Array<[string, Uint8Array]> = [];
  for (const localeEntry of enumerateLocales(session.manifest)) {
    if (localeEntry.primary) continue;
    const localeText = localeFileText.get(localeEntry.language);
    if (localeText !== undefined) {
      localeAssets.push([localeEntry.path, new TextEncoder().encode(localeText)]);
    }
  }
  const result = await window.editorApi.saveToPath(session.path, {
    manifest: manifestCopy,
    content,
    assets: [...assetStore.toEntriesMap().entries(), ...localeAssets],
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
  loadSnapshotState(opened.archive.entries);
  loadAnnotationsState(opened.archive.entries);
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
