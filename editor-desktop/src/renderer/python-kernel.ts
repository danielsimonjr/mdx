/**
 * Python kernel layer — Phase 2.3b.1.
 *
 * Three pieces:
 *   1. `PythonKernel` interface — what the editor's "Run cell" UI
 *      calls. Two implementations: `PyodideKernel` (real, lazy-loads
 *      the Pyodide WASM bundle from CDN at runtime) and
 *      `FakePythonKernel` (deterministic, used in vitest).
 *   2. `parseExecutionOutput` — pure normalization from the raw
 *      Pyodide return shape into a `KernelResult`. Tested without
 *      the WASM.
 *   3. `withTimeout` — race-vs-setTimeout helper. Pyodide can't be
 *      preempted (the spec calls this out); the timeout is
 *      advisory and only releases the calling Promise — the
 *      underlying interpreter keeps running until natural
 *      completion. We document this loudly so downstream code
 *      doesn't assume hard cancellation.
 *
 * Why lazy-load from CDN: Pyodide's WASM bundle is ~10 MB
 * compressed. Bundling it inflates the editor's installer by an
 * order of magnitude, and most authors don't run cells. CDN load
 * happens the first time a user hits "Run"; subsequent loads are
 * served from the browser cache. The renderer's CSP allows
 * `script-src` from `cdn.jsdelivr.net` for this purpose
 * (configured in `index.html`).
 */

export type KernelStatus = "ok" | "error" | "timeout";

/**
 * One unit of structured output from a cell execution. Matches
 * Jupyter's display_data shape — keys are MIME types, values are
 * the rendered payload (HTML string, base64 PNG, etc.).
 */
export interface DisplayBundle {
  data: Record<string, string>;
  /** Optional metadata (e.g. `{"image/png": {"width": 640}}`). */
  metadata?: Record<string, unknown>;
}

export interface KernelResult {
  status: KernelStatus;
  stdout: string;
  stderr: string;
  /** The last-expression value if the cell ended in an expression (REPL semantics). */
  result?: unknown;
  /** Inline display calls (`display(...)`, plotting libs). */
  displayData: DisplayBundle[];
  /** Set when status === 'error' or 'timeout'. */
  errorMessage?: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
}

export interface RunOptions {
  /** Timeout in ms. Defaults to 30 000 (per spec). */
  timeoutMs?: number;
  /** Optional per-execution stdin string (rare; for `input()` flows). */
  stdin?: string;
}

/**
 * Abstract kernel interface. Editor UI talks only to this; the
 * real Pyodide kernel and the test fake both satisfy it.
 */
export interface PythonKernel {
  /** Resolves once the underlying interpreter is ready (WASM loaded, env initialised). */
  ready(): Promise<void>;
  /** Run `code`. Always resolves with a `KernelResult` (errors are values, not throws). */
  run(code: string, options?: RunOptions): Promise<KernelResult>;
  /** Best-effort interrupt — Pyodide can't be preempted, so this is a no-op for the real kernel. */
  interrupt?(): void;
  /** Async cleanup of the underlying interpreter. */
  destroy?(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Race a promise against a timeout. The wrapper resolves with the
 * promise's result OR rejects with `TimeoutError` after `ms`. The
 * underlying promise is NOT cancelled — Pyodide doesn't support
 * preemption. Callers should display "this cell is taking longer
 * than expected" rather than assume execution stopped.
 */
export class TimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`operation timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.reject(new RangeError("timeout must be a positive finite number"));
  }
  return new Promise<T>((resolve, reject) => {
    const handle = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (v) => { clearTimeout(handle); resolve(v); },
      (e) => { clearTimeout(handle); reject(e); },
    );
  });
}

/**
 * The raw shape Pyodide returns from the editor's run-cell harness
 * (a small Python helper that captures stdout/stderr + display
 * calls into a dict before evaluating user code). This module
 * doesn't depend on Pyodide's types; we describe the contract
 * here so `parseExecutionOutput` is pure.
 */
export interface RawExecutionRecord {
  stdout?: string;
  stderr?: string;
  /** Last-expression value (Python primitives only — bool/int/float/str/list/dict). */
  result?: unknown;
  /** Output from `display()` calls — list of MIME bundles. */
  display_data?: Array<{ data?: Record<string, unknown>; metadata?: Record<string, unknown> }>;
  /** Set when Python execution raised an exception. */
  error?: { name?: string; value?: string; traceback?: string };
  /** Wall-clock execution duration in ms (computed by the harness). */
  duration_ms?: number;
}

/**
 * Normalize the raw harness record into a strict `KernelResult`.
 * Drops malformed display entries (silently — Pyodide's display
 * pipeline is lossy in edge cases), coerces missing
 * stdout/stderr to "", and assembles a human-readable
 * `errorMessage` from the exception fields.
 */
export function parseExecutionOutput(raw: RawExecutionRecord): KernelResult {
  const stdout = typeof raw.stdout === "string" ? raw.stdout : "";
  const stderr = typeof raw.stderr === "string" ? raw.stderr : "";
  const displayData: DisplayBundle[] = [];
  if (Array.isArray(raw.display_data)) {
    for (const entry of raw.display_data) {
      if (!entry || typeof entry !== "object") continue;
      const data: Record<string, string> = {};
      if (entry.data && typeof entry.data === "object") {
        for (const [mime, value] of Object.entries(entry.data)) {
          if (typeof value === "string") data[mime] = value;
        }
      }
      if (Object.keys(data).length === 0) continue;
      displayData.push({
        data,
        metadata: (entry.metadata as Record<string, unknown> | undefined) ?? undefined,
      });
    }
  }
  const durationMs = typeof raw.duration_ms === "number" && raw.duration_ms >= 0
    ? raw.duration_ms
    : 0;
  if (raw.error) {
    const name = raw.error.name ?? "Error";
    const value = raw.error.value ?? "";
    const tb = raw.error.traceback ? `\n${raw.error.traceback}` : "";
    return {
      status: "error",
      stdout,
      stderr,
      displayData,
      errorMessage: `${name}: ${value}${tb}`,
      durationMs,
    };
  }
  return {
    status: "ok",
    stdout,
    stderr,
    result: raw.result,
    displayData,
    durationMs,
  };
}

/** Build a uniform `KernelResult` for a timeout. */
export function timeoutResult(timeoutMs: number, partial?: Partial<KernelResult>): KernelResult {
  return {
    status: "timeout",
    stdout: partial?.stdout ?? "",
    stderr: partial?.stderr ?? "",
    displayData: partial?.displayData ?? [],
    errorMessage: `cell timed out after ${timeoutMs}ms (Pyodide cannot be preempted; the interpreter may still be running)`,
    durationMs: timeoutMs,
  };
}

// ---------------------------------------------------------------------------
// FakePythonKernel — used in tests + as the Storybook stand-in
// ---------------------------------------------------------------------------

/**
 * Deterministic in-memory kernel for unit tests. Behaviour is
 * controlled per-call via `setNextResult` / `setNextRaw`; if no
 * scripted result is queued, `run` returns an empty success. The
 * fake never actually executes Python — it just plays back what
 * the test queued.
 */
export class FakePythonKernel implements PythonKernel {
  #ready = Promise.resolve();
  #queue: Array<KernelResult | Error> = [];
  /** Visible to tests so they can assert "the editor sent this code." */
  readonly history: Array<{ code: string; options: RunOptions | undefined }> = [];

  async ready(): Promise<void> { return this.#ready; }

  async run(code: string, options?: RunOptions): Promise<KernelResult> {
    this.history.push({ code, options });
    const next = this.#queue.shift();
    if (next instanceof Error) throw next;
    if (next) return next;
    return {
      status: "ok",
      stdout: "",
      stderr: "",
      displayData: [],
      durationMs: 0,
    };
  }

  /** Queue a synthetic kernel result for the next `run` call. */
  setNextResult(result: KernelResult): this {
    this.#queue.push(result);
    return this;
  }

  /** Queue a synthetic raw harness record; passes through `parseExecutionOutput`. */
  setNextRaw(raw: RawExecutionRecord): this {
    return this.setNextResult(parseExecutionOutput(raw));
  }

  /** Queue a thrown error for the next `run` call. */
  setNextError(error: Error): this {
    this.#queue.push(error);
    return this;
  }
}

// ---------------------------------------------------------------------------
// Pyodide loader — browser-only, untested in vitest
// ---------------------------------------------------------------------------

/**
 * Configuration for `loadPyodideKernel`. CDN URLs are pinned to a
 * known-good Pyodide version so a CDN regression doesn't silently
 * change behaviour mid-session. Override `indexURL` for an
 * air-gapped install (Phase 2.3a.6 release engineering).
 */
export interface PyodideLoaderOptions {
  /** Pyodide version to fetch. Default pinned to a stable release. */
  version?: string;
  /** Override the CDN base URL — used by tests AND by air-gapped installs. */
  indexURL?: string;
  /** Packages to preload via `pyodide.loadPackage` (e.g. `["numpy"]`). */
  preloadPackages?: ReadonlyArray<string>;
}

const DEFAULT_PYODIDE_VERSION = "0.26.4";
const DEFAULT_CDN_BASE = "https://cdn.jsdelivr.net/pyodide";

/**
 * The Python harness that wraps user code: captures stdout, stderr,
 * display calls, and the last expression value into a dict that
 * matches `RawExecutionRecord`. Defined here as a string so the TS
 * code-gen doesn't try to parse it.
 */
export const PYODIDE_HARNESS = `
import sys, io, time, traceback, ast, json
def _mdz_run(code):
    out_buf, err_buf = io.StringIO(), io.StringIO()
    display_data = []
    # Patch IPython display() if available — most plotting libs go through it.
    try:
        from IPython.display import display as _display
    except ImportError:
        _display = None
    record = {"stdout": "", "stderr": "", "display_data": display_data}
    started = time.perf_counter()
    old_out, old_err = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = out_buf, err_buf
    try:
        # Compile twice: once as Module (statements) and check the last
        # node — if it's an Expression, capture its value as 'result'.
        tree = ast.parse(code, mode="exec")
        last_expr = None
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            last_expr = tree.body.pop()
        if tree.body:
            exec(compile(ast.Module(body=tree.body, type_ignores=[]), "<cell>", "exec"), globals())
        if last_expr is not None:
            value = eval(compile(ast.Expression(last_expr.value), "<cell>", "eval"), globals())
            record["result"] = value
    except BaseException as exc:
        record["error"] = {
            "name": type(exc).__name__,
            "value": str(exc),
            "traceback": traceback.format_exc(),
        }
    finally:
        sys.stdout, sys.stderr = old_out, old_err
        record["stdout"] = out_buf.getvalue()
        record["stderr"] = err_buf.getvalue()
        record["duration_ms"] = (time.perf_counter() - started) * 1000.0
    return json.dumps(record, default=str)
`;

interface PyodideHandle {
  loadPackage(packages: string | ReadonlyArray<string>): Promise<void>;
  runPython(code: string): unknown;
  // Pyodide exposes more, but this is what we touch.
}

interface PyodideGlobal {
  loadPyodide(opts: { indexURL: string }): Promise<PyodideHandle>;
}

/**
 * Browser-only — loads Pyodide from CDN and returns a `PythonKernel`
 * backed by it. NOT covered by vitest; exercised by Phase 2.3a.6
 * Playwright integration tests once those land.
 *
 * Throws if invoked from Node (no `document`). Tests should use
 * `FakePythonKernel` directly.
 */
export async function loadPyodideKernel(
  options: PyodideLoaderOptions = {},
): Promise<PythonKernel> {
  if (typeof document === "undefined") {
    throw new Error("loadPyodideKernel requires a browser environment");
  }
  const version = options.version ?? DEFAULT_PYODIDE_VERSION;
  const indexURL = options.indexURL ?? `${DEFAULT_CDN_BASE}/v${version}/full/`;
  await injectPyodideScript(indexURL);
  // The Pyodide loader script puts `loadPyodide` on `window`.
  const g = (globalThis as unknown) as PyodideGlobal;
  if (typeof g.loadPyodide !== "function") {
    throw new Error("Pyodide script loaded but `loadPyodide` is not on the global scope");
  }
  const pyodide = await g.loadPyodide({ indexURL });
  if (options.preloadPackages && options.preloadPackages.length > 0) {
    await pyodide.loadPackage(options.preloadPackages);
  }
  // Install the harness once.
  pyodide.runPython(PYODIDE_HARNESS);
  return new PyodideKernel(pyodide);
}

function injectPyodideScript(indexURL: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-pyodide-loader]');
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `${indexURL}pyodide.js`;
    script.async = true;
    script.dataset.pyodideLoader = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load Pyodide from ${script.src}`));
    document.head.appendChild(script);
  });
}

class PyodideKernel implements PythonKernel {
  #pyodide: PyodideHandle;
  constructor(pyodide: PyodideHandle) { this.#pyodide = pyodide; }

  async ready(): Promise<void> { /* loadPyodide already awaited */ }

  async run(code: string, options: RunOptions = {}): Promise<KernelResult> {
    const timeoutMs = options.timeoutMs ?? 30_000;
    // Escape user code for embedding in the Python wrapper call.
    const escaped = JSON.stringify(code);
    const exec = async (): Promise<KernelResult> => {
      const json = String(this.#pyodide.runPython(`_mdz_run(${escaped})`));
      const raw: RawExecutionRecord = JSON.parse(json);
      return parseExecutionOutput(raw);
    };
    try {
      return await withTimeout(exec(), timeoutMs);
    } catch (e) {
      if (e instanceof TimeoutError) return timeoutResult(timeoutMs);
      // Native runPython failure (memory, fatal): surface as error.
      return {
        status: "error",
        stdout: "",
        stderr: "",
        displayData: [],
        errorMessage: `Pyodide host error: ${(e as Error).message}`,
        durationMs: 0,
      };
    }
  }
}
