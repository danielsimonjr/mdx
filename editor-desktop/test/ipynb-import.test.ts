/**
 * Tests for the ipynb-import bridge — the editor's main-process
 * facade over the existing CLI converter.
 *
 * Coverage:
 *   - `expectedOutputPath`: same-basename / different-extension
 *     contract.
 *   - `runIpynbImport`: success path resolves with the expected
 *     output path; non-zero exit throws with stderr surfaced;
 *     spawn-error throws with the underlying message.
 *   - `resolveCliPath`: walks two directories up from the compiled
 *     main module to find `cli/src/index.js`.
 *
 * The runner is injected so we never actually fork the Node CLI in
 * tests — keeps the suite fast (<100 ms) and CI-platform-independent.
 */

import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import {
  expectedOutputPath,
  resolveCliPath,
  runIpynbImport,
  type IpynbRunner,
} from "../src/main/ipynb-import.js";

/**
 * Minimal ChildProcess fake. Emits `exit` (and optionally writes to
 * stderr) when `complete()` is called.
 */
class FakeChild extends EventEmitter {
  readonly stderr: Readable;
  constructor(stderrText = "") {
    super();
    this.stderr = Readable.from([stderrText]);
  }
  complete(code: number): void {
    setImmediate(() => this.emit("exit", code));
  }
  failToSpawn(message: string): void {
    setImmediate(() => this.emit("error", new Error(message)));
  }
}

function makeRunner(child: FakeChild): IpynbRunner {
  return {
    spawn: () => child as unknown as ReturnType<IpynbRunner["spawn"]>,
  };
}

describe("expectedOutputPath", () => {
  it("returns same-dir, .mdz extension", () => {
    const out = expectedOutputPath("/tmp/notebooks/analysis.ipynb");
    expect(out.endsWith("analysis.mdz")).toBe(true);
    expect(out).not.toContain(".ipynb");
  });

  it("strips existing extension cleanly (multi-dot basenames preserved)", () => {
    const out = expectedOutputPath("/tmp/v2.0.draft.ipynb");
    expect(out.endsWith("v2.0.draft.mdz")).toBe(true);
  });
});

describe("resolveCliPath", () => {
  it("computes a path that ends in cli/src/index.js", () => {
    // pathToFileURL gives a platform-correct URL (Windows needs a
    // drive letter; POSIX doesn't). Hand-rolled `file:///repo/…`
    // strings throw on Windows because Node's WHATWG-URL parser
    // requires absolute Windows paths to start with a drive letter.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { pathToFileURL } = require("node:url") as typeof import("node:url");
    const pseudoMain = pathToFileURL(
      // Use process.cwd() to anchor a clearly-absolute path on every
      // platform; the actual contents don't matter — resolveCliPath
      // just walks 3 levels up.
      `${process.cwd()}/editor-desktop/dist/main/main.js`,
    ).toString();
    const cli = resolveCliPath(pseudoMain);
    expect(cli.replace(/\\/g, "/")).toMatch(/cli\/src\/index\.js$/);
  });
});

describe("runIpynbImport", () => {
  it("resolves with expectedOutputPath on exit code 0", async () => {
    const child = new FakeChild();
    const runner = makeRunner(child);
    const promise = runIpynbImport("/tmp/x.ipynb", {
      runner,
      cliPath: "/dev/null",
      nodeBin: "/dev/null",
    });
    child.complete(0);
    const out = await promise;
    expect(out).toMatch(/x\.mdz$/);
  });

  it("rejects with stderr in the message on non-zero exit", async () => {
    const child = new FakeChild("ipynb parse error: invalid JSON");
    const runner = makeRunner(child);
    const promise = runIpynbImport("/tmp/x.ipynb", {
      runner,
      cliPath: "/dev/null",
      nodeBin: "/dev/null",
    });
    child.complete(2);
    await expect(promise).rejects.toThrow(/exited with code 2/);
    await expect(
      runIpynbImport("/tmp/y.ipynb", {
        runner: makeRunner(
          (() => {
            const c = new FakeChild("kernel module not loadable");
            setImmediate(() => c.complete(2));
            return c;
          })(),
        ),
        cliPath: "/dev/null",
        nodeBin: "/dev/null",
      }),
    ).rejects.toThrow(/kernel module not loadable/);
  });

  it("rejects when the subprocess fails to spawn", async () => {
    const child = new FakeChild();
    const runner = makeRunner(child);
    const promise = runIpynbImport("/tmp/x.ipynb", {
      runner,
      cliPath: "/dev/null",
      nodeBin: "/dev/null",
    });
    child.failToSpawn("ENOENT: node not on PATH");
    await expect(promise).rejects.toThrow(/failed to spawn ipynb import CLI/);
    await expect(promise).rejects.toThrow(/ENOENT/);
  });

  it("invokes the runner with the expected argv (node + cliPath + ipynbPath)", () => {
    let captured: { node: string; cliPath: string; ipynbPath: string } | null = null;
    const child = new FakeChild();
    const runner: IpynbRunner = {
      spawn: (args) => {
        captured = args;
        return child as unknown as ReturnType<IpynbRunner["spawn"]>;
      },
    };
    void runIpynbImport("/tmp/notebook.ipynb", {
      runner,
      cliPath: "/repo/cli/src/index.js",
      nodeBin: "/usr/bin/node",
    });
    // schedule complete to avoid leaving the test pending
    child.complete(0);
    expect(captured).not.toBeNull();
    expect(captured!.node).toBe("/usr/bin/node");
    expect(captured!.cliPath).toBe("/repo/cli/src/index.js");
    expect(captured!.ipynbPath).toBe("/tmp/notebook.ipynb");
  });
});
