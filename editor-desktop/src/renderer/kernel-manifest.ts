/**
 * `manifest.kernels` projection — Phase 2.3b.1.3.
 *
 * When the editor has loaded the Pyodide kernel during the
 * session, the saved archive needs to declare `kernels.python.runtime`
 * so readers know which interpreter constraints applied (Pyodide ≠
 * CPython — no compiled-wheel `pip install`, no TensorFlow / PyTorch
 * etc.). Per spec §10:
 *
 *   "kernels": {
 *     "python": {
 *       "runtime": "pyodide",
 *       "version": "0.26.4"
 *     }
 *   }
 *
 * `mergeKernelDeclaration(manifest)` is pure — no DOM, no IPC. It
 * takes the open session's manifest and returns a new `kernels`
 * object that adds (or updates) the `python` slot while preserving
 * any non-Python kernel declarations the manifest already carried.
 */

export interface PythonKernelManifest {
  runtime: "pyodide";
  /** Pinned Pyodide release the editor loaded. */
  version?: string;
}

export interface KernelsManifestSlot {
  python?: PythonKernelManifest;
  /** Other kernels (R, Julia) the spec allows but the editor doesn't run. */
  [language: string]: PythonKernelManifest | unknown;
}

const DEFAULT_PYODIDE_VERSION = "0.26.4";

/**
 * Merge the Pyodide declaration into a copy of the manifest's
 * existing `kernels` slot. Existing non-`python` kernels are kept
 * verbatim. Returns the new slot — caller splices it into the
 * manifest copy that's about to be saved.
 */
export function mergeKernelDeclaration(
  manifest: Record<string, unknown>,
  pyodideVersion: string = DEFAULT_PYODIDE_VERSION,
): KernelsManifestSlot {
  const existing = (manifest.kernels && typeof manifest.kernels === "object")
    ? (manifest.kernels as KernelsManifestSlot)
    : {};
  return {
    ...existing,
    python: {
      runtime: "pyodide",
      version: pyodideVersion,
    },
  };
}
