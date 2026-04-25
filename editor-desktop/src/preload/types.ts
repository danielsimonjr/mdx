/**
 * Type-only declaration of the editor's preload-exposed API.
 *
 * Lives in its own file so the renderer (which references the type
 * via `window.editorApi`) can pull it in without dragging in the
 * `import { contextBridge, ipcRenderer } from "electron"` graph.
 * That decoupling lets `tsconfig.test.json` type-check the renderer
 * + tests without requiring Electron be installed.
 */

export interface OpenedArchiveSerialized {
  path: string;
  manifest: Record<string, unknown>;
  /** Map → array tuple form because IPC serialization flattens Maps. */
  entries: Array<[string, Uint8Array]>;
  content: string;
}

export interface EditorApi {
  openFromPath(
    path: string,
  ): Promise<
    | {
        ok: true;
        archive: {
          path: string;
          manifest: Record<string, unknown>;
          entries: Map<string, Uint8Array>;
          content: string;
        };
      }
    | { ok: false; error: string }
  >;
  saveToPath(
    path: string,
    payload: unknown,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  pickOpen(): Promise<string | null>;
  pickSave(defaultName?: string): Promise<string | null>;
  pickIpynb(): Promise<string | null>;
  /**
   * Convert an `.ipynb` to an `.mdz` via the existing CLI. Resolves
   * with the path of the produced archive on success.
   */
  importIpynb(
    ipynbPath: string,
  ): Promise<{ ok: true; mdzPath: string } | { ok: false; error: string }>;
  /**
   * Subscribe to a menu event from main. Returns an unsubscribe
   * function.
   */
  onMenu(
    event: "open" | "save" | "save-as" | "import-ipynb",
    handler: () => void,
  ): () => void;
}
