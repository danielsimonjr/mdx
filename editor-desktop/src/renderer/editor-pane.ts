/**
 * Source-editor pane — wraps CodeMirror 6 with the markdown language
 * pack and the project's split-pane layout. Exports a factory that
 * the renderer entry-point wires to the DOM; the factory itself is
 * pure enough to unit-test the surrounding plumbing (debounce, mode
 * toggle state, save callbacks) without booting CodeMirror.
 *
 * Pipeline integration:
 *   - Edit event → 150 ms debounce → renderMarkdown(source, …) →
 *     preview pane innerHTML.
 *   - The viewer's `renderMarkdown` already runs through the full
 *     directive + math + sanitize stack, so the preview matches what
 *     the deployed `<mdz-viewer>` produces.
 *
 * Mode toggle: `source` | `preview` | `split` (default). State lives
 * here; the host is responsible for applying the corresponding CSS
 * class to the pane's parent element.
 */

import { renderMarkdown } from "@mdz-format/viewer";

import {
  applyModeClass,
  makeDebouncer,
  type ViewMode,
} from "./editor-pane-helpers.js";
import type { InsertionPayload } from "./directive-insert.js";

export type { ViewMode };
export { applyModeClass, makeDebouncer, modeClassName } from "./editor-pane-helpers.js";

export interface EditorPaneOptions {
  /** Initial markdown source. */
  initialContent?: string;
  /** Initial view mode. */
  mode?: ViewMode;
  /** Debounce window for the source → preview render. */
  debounceMs?: number;
  /**
   * Hook fired when the user invokes "save" (Cmd/Ctrl+S or the
   * matching menu event). Receives the current source.
   */
  onSave?: (source: string) => void;
  /**
   * Hook fired when the source changes (after every keystroke,
   * NOT debounced — use this for "modified" indicators on the title
   * bar; preview rendering uses its own debounced path).
   */
  onChange?: (source: string) => void;
  /**
   * Optional hook that fires AFTER each preview-pane render.
   * Phase 2.3b.1.3 uses this to inject per-cell Run buttons into
   * the rendered DOM. Receives the previewHost element so the
   * caller can run `querySelectorAll` etc. without the editor
   * pane needing to know what the hook does.
   */
  onPreviewRendered?: (previewHost: HTMLElement) => void;
}

export interface EditorPane {
  /** Read the current source. */
  getContent(): string;
  /** Replace the source (e.g. when opening a new archive). */
  setContent(source: string): void;
  /** Get the current view mode. */
  getMode(): ViewMode;
  /** Switch view mode. */
  setMode(mode: ViewMode): void;
  /** Manually trigger a preview re-render (skips the debounce). */
  refreshPreview(): void;
  /**
   * Splice an `InsertionPayload` (from the directive-insert builders)
   * at the current cursor; replaces the selection if non-empty. After
   * the splice, parks the cursor at `payload.cursorOffset` relative to
   * the inserted text — so picker handoffs land the user inside the
   * first attribute slot.
   */
  insertDirective(payload: InsertionPayload): void;
  /** Tear down listeners + CodeMirror state. */
  destroy(): void;
}

interface EditorHosts {
  sourceHost: HTMLElement;
  previewHost: HTMLElement;
  /** The element whose CSS class encodes the current mode (typically the pane container). */
  modeHost: HTMLElement;
}

/**
 * Browser-only entry point. Lazy-imports CodeMirror so the module
 * can be partially type-checked without it (the test config
 * type-checks `makeDebouncer`, `applyModeClass`, etc. directly; the
 * full `createEditorPane` body is only reachable in a browser
 * runtime).
 */
export async function createEditorPane(
  hosts: EditorHosts,
  opts: EditorPaneOptions = {},
): Promise<EditorPane> {
  // Dynamic imports keep CodeMirror out of the unit-test compile path.
  const { EditorView, keymap, lineNumbers, highlightActiveLineGutter } = await import(
    "@codemirror/view"
  );
  const { EditorState } = await import("@codemirror/state");
  const { defaultKeymap, history, historyKeymap } = await import("@codemirror/commands");
  const { markdown } = await import("@codemirror/lang-markdown");

  const debounceMs = opts.debounceMs ?? 150;
  let mode: ViewMode = opts.mode ?? "split";
  applyModeClass(hosts.modeHost, mode);

  const renderPreview = (source: string): void => {
    try {
      hosts.previewHost.innerHTML = renderMarkdown(source, {
        resolveAsset: () => null,
      });
      opts.onPreviewRendered?.(hosts.previewHost);
    } catch (e) {
      hosts.previewHost.textContent = `Preview error: ${(e as Error).message}`;
    }
  };

  const debouncer = makeDebouncer(renderPreview, debounceMs);

  const state = EditorState.create({
    doc: opts.initialContent ?? "",
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            opts.onSave?.(view.state.doc.toString());
            return true;
          },
        },
      ]),
      markdown(),
      EditorView.updateListener.of((u) => {
        if (!u.docChanged) return;
        const source = u.state.doc.toString();
        opts.onChange?.(source);
        debouncer.schedule(source);
      }),
    ],
  });

  const view = new EditorView({ state, parent: hosts.sourceHost });
  // Initial preview render — bypass the debounce so first paint shows
  // the current state.
  renderPreview(opts.initialContent ?? "");

  return {
    getContent: () => view.state.doc.toString(),
    setContent: (source) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } });
      // dispatch fires updateListener which schedules the debounce —
      // flush so the preview matches the new content immediately.
      debouncer.flush();
    },
    getMode: () => mode,
    setMode: (next) => {
      mode = next;
      applyModeClass(hosts.modeHost, mode);
    },
    refreshPreview: () => {
      debouncer.cancel();
      renderPreview(view.state.doc.toString());
    },
    insertDirective: (payload) => {
      const sel = view.state.selection.main;
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: payload.text },
        selection: { anchor: sel.from + payload.cursorOffset },
      });
      view.focus();
    },
    destroy: () => {
      debouncer.cancel();
      view.destroy();
    },
  };
}
