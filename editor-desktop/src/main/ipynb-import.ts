/**
 * Bridge from the editor's main process to the existing
 * `cli/src/commands/import-ipynb.js` converter. Spawns the CLI as a
 * child process so the editor reuses one battle-tested converter
 * rather than forking a second copy.
 *
 * Why subprocess instead of `require`-and-call: the CLI's
 * `import-ipynb.js` exports an `async function importIpynb(input,
 * options)` that calls `process.exit()` on the unhappy paths. Loading
 * it in-process would let those exits kill the editor. Subprocess is
 * the cleaner isolation.
 *
 * Output convention: the CLI writes the resulting `.mdz` next to the
 * input `.ipynb` (same basename, `.mdz` extension). We compute that
 * path ahead of time so the renderer can open it after the import
 * settles.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { dirname, basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Strategy for locating + invoking the import-ipynb CLI. The default
 * picks `node` + the bundled CLI script; tests inject a fake `spawn`
 * to assert behavior without forking a real process.
 */
export interface IpynbRunner {
  /**
   * Spawn the converter. Receives the resolved arg list; returns a
   * ChildProcess whose `exit` event resolves the import.
   */
  spawn(args: { node: string; cliPath: string; ipynbPath: string }): ChildProcess;
}

export const defaultRunner: IpynbRunner = {
  spawn({ node, cliPath, ipynbPath }) {
    return spawn(node, [cliPath, "import-ipynb", ipynbPath], {
      // Explicit empty stdio: the CLI's spinner output is informational;
      // we don't surface it to the editor (the modified-indicator on
      // the imported MDZ is the user-facing signal).
      stdio: ["ignore", "ignore", "pipe"],
    });
  },
};

/**
 * Compute the `.mdz` path the CLI will produce for a given
 * `.ipynb` input. Matches the CLI's "same basename, .mdz extension"
 * convention. Exposed for unit testing.
 */
export function expectedOutputPath(ipynbPath: string): string {
  const dir = dirname(ipynbPath);
  const base = basename(ipynbPath, extname(ipynbPath));
  return resolve(dir, `${base}.mdz`);
}

/**
 * Resolve the path to the CLI script relative to the editor-desktop
 * package root. The editor ships under `editor-desktop/` and the CLI
 * lives at `cli/src/index.js` — we walk up two directories from the
 * compiled main.js to find the repo root.
 *
 * Exposed for unit testing — production callers don't need it.
 */
export function resolveCliPath(mainModuleUrl: string): string {
  const dir = dirname(fileURLToPath(mainModuleUrl));
  // editor-desktop/dist/main → editor-desktop → repo root → cli/src/index.js
  return resolve(dir, "..", "..", "..", "cli", "src", "index.js");
}

/**
 * Drive the CLI to convert an .ipynb to an .mdz. Returns the absolute
 * path of the resulting archive on success; throws on subprocess
 * failure with stderr included for diagnostics.
 *
 * Default `cliPath` reads `import.meta.url` when called from the
 * compiled main module; tests pass an explicit path.
 */
export async function runIpynbImport(
  ipynbPath: string,
  opts: { runner?: IpynbRunner; cliPath?: string; nodeBin?: string } = {},
): Promise<string> {
  const runner = opts.runner ?? defaultRunner;
  const cliPath = opts.cliPath ?? resolveCliPath(import.meta.url);
  const nodeBin = opts.nodeBin ?? process.execPath;

  return new Promise<string>((resolveOk, rejectErr) => {
    const child = runner.spawn({ node: nodeBin, cliPath, ipynbPath });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    child.on("error", (err) => {
      rejectErr(new Error(`failed to spawn ipynb import CLI: ${err.message}`));
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolveOk(expectedOutputPath(ipynbPath));
      } else {
        rejectErr(
          new Error(
            `ipynb import CLI exited with code ${code}` +
              (stderr ? `: ${stderr.trim()}` : ""),
          ),
        );
      }
    });
  });
}
