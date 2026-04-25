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

/** Mirror of `VariantPlanEntry` from the renderer-side variant planner. */
export interface VariantPlanEntrySerialized {
  sourcePath: string;
  variantPath: string;
  preset: { format: "webp" | "avif"; quality: number; maxWidth: number | null };
}

export interface EncodeVariantsPayload {
  /** Map flattened to tuple-form for IPC serialization. */
  sources: Array<[string, Uint8Array]>;
  plan: VariantPlanEntrySerialized[];
}

export interface EncodeVariantsResultSerialized {
  ok: boolean;
  reason?: "sharp-not-installed" | "encode-failed";
  variants: Array<{
    variantPath: string;
    bytes: Uint8Array;
    width?: number;
    height?: number;
  }>;
  errors: Array<{ variantPath: string; message: string }>;
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
   * Encode variant images. Renderer hands the planner output + the
   * source bytes; main process invokes sharp and returns the encoded
   * payloads. When sharp is missing, resolves with `ok: false` and
   * `reason: 'sharp-not-installed'` — the caller surfaces a clear
   * install hint instead of crashing.
   */
  encodeVariants(payload: EncodeVariantsPayload): Promise<EncodeVariantsResultSerialized>;
  /**
   * Subscribe to a menu event from main. Returns an unsubscribe
   * function.
   */
  onMenu(
    event: "open" | "save" | "save-as" | "import-ipynb",
    handler: () => void,
  ): () => void;
}
