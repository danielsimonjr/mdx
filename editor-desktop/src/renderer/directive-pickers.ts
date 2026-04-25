/**
 * Pure picker-state layer — the testable foundation for the
 * 2.3a.5.1-4 directive pickers. Each modal in `directive-modal.ts`
 * collects a form-state object, runs it through one of the
 * `validateXxx` functions here, and on success calls the matching
 * `buildXxx` from `directive-insert.ts` to get the InsertionPayload.
 *
 * Why pure? Validators (id collision, key membership, target
 * existence) need ground-truth data from the open document and
 * archive — passing those in as plain arrays keeps the validators
 * runnable under vitest's `node` environment.
 */
import {
  buildCell,
  buildInclude,
  buildFig,
  buildCite,
  type InsertionPayload,
  type LabeledKind,
} from "./directive-insert.js";

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export interface ValidationOk {
  ok: true;
  payload: InsertionPayload;
}
export interface ValidationErr {
  ok: false;
  /** Field name (matches the form's input name) that failed. */
  field: string;
  /** Human-readable reason. */
  message: string;
}
export type ValidationResult = ValidationOk | ValidationErr;

// ---------------------------------------------------------------------------
// ::cell
// ---------------------------------------------------------------------------

export interface CellFormState {
  language: string;
  kernel: string;
  executionCount?: number | null;
}

export function validateCell(state: CellFormState): ValidationResult {
  if (!state.language.trim()) {
    return { ok: false, field: "language", message: "Language is required." };
  }
  if (!state.kernel.trim()) {
    return { ok: false, field: "kernel", message: "Kernel is required." };
  }
  if (state.executionCount != null && (!Number.isInteger(state.executionCount) || state.executionCount < 0)) {
    return {
      ok: false,
      field: "executionCount",
      message: "Execution count must be a non-negative integer.",
    };
  }
  return {
    ok: true,
    payload: buildCell({
      language: state.language.trim(),
      kernel: state.kernel.trim(),
      executionCount: state.executionCount ?? undefined,
      cursorInSource: true,
    }),
  };
}

// ---------------------------------------------------------------------------
// ::include
// ---------------------------------------------------------------------------

export interface IncludeFormState {
  target: string;
  fragment?: string;
  contentHash?: string;
}

/**
 * Validate an include directive. `archiveEntries` is the list of
 * archive-relative paths the open document has (used to confirm the
 * target exists; pass `null` to skip the existence check, e.g. when
 * the user is referencing an external archive).
 */
export function validateInclude(
  state: IncludeFormState,
  archiveEntries: ReadonlyArray<string> | null,
): ValidationResult {
  const target = state.target.trim();
  if (!target) {
    return { ok: false, field: "target", message: "Target path is required." };
  }
  if (target.startsWith("/") || target.includes("..")) {
    return {
      ok: false,
      field: "target",
      message: "Target must be archive-relative (no leading slash, no `..`).",
    };
  }
  if (archiveEntries && !archiveEntries.includes(target)) {
    return {
      ok: false,
      field: "target",
      message: `Target "${target}" is not in the open archive.`,
    };
  }
  return {
    ok: true,
    payload: buildInclude({
      target,
      fragment: state.fragment?.trim() || undefined,
      contentHash: state.contentHash?.trim() || undefined,
    }),
  };
}

// ---------------------------------------------------------------------------
// ::fig / ::eq / ::tab — id collision check
// ---------------------------------------------------------------------------

const ID_TOKEN = /::(fig|eq|tab)\{[^}]*\bid=([A-Za-z0-9_\-]+)/g;

/**
 * Scan a markdown document for already-defined `id=` values on
 * `::fig`, `::eq`, `::tab` directives. Used by the picker to flag
 * collisions before the user clicks Insert.
 */
export function collectExistingIds(source: string): { fig: Set<string>; eq: Set<string>; tab: Set<string> } {
  const out = { fig: new Set<string>(), eq: new Set<string>(), tab: new Set<string>() };
  for (const m of source.matchAll(ID_TOKEN)) {
    const kind = m[1] as LabeledKind;
    out[kind].add(m[2]);
  }
  return out;
}

export interface FigFormState {
  kind: LabeledKind;
  id: string;
}

export function validateFig(
  state: FigFormState,
  existing: { fig: ReadonlySet<string>; eq: ReadonlySet<string>; tab: ReadonlySet<string> },
): ValidationResult {
  const id = state.id.trim();
  if (!id) {
    return { ok: false, field: "id", message: "ID is required." };
  }
  if (!/^[A-Za-z][A-Za-z0-9_\-]*$/.test(id)) {
    return {
      ok: false,
      field: "id",
      message: "ID must start with a letter; subsequent chars: letters, digits, `_`, `-`.",
    };
  }
  if (existing[state.kind].has(id)) {
    return {
      ok: false,
      field: "id",
      message: `ID "${id}" is already in use by another ::${state.kind}.`,
    };
  }
  return {
    ok: true,
    payload: buildFig({ kind: state.kind, id }),
  };
}

// ---------------------------------------------------------------------------
// ::cite — key validation against references.json
// ---------------------------------------------------------------------------

export interface CiteFormState {
  keys: ReadonlyArray<string>;
  prefix?: string;
  suffix?: string;
}

/**
 * Extract bibliography keys from a `references.json` blob (CSL-JSON
 * format — array of items each with an `id` field). Returns an empty
 * set when the blob is malformed or absent (so the validator falls
 * back to "any key accepted").
 */
export function collectBibliographyKeys(referencesJson: string | null): Set<string> {
  if (!referencesJson) return new Set();
  try {
    const parsed = JSON.parse(referencesJson) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    const out = new Set<string>();
    for (const item of parsed) {
      if (item && typeof item === "object" && "id" in item && typeof item.id === "string") {
        out.add(item.id);
      }
    }
    return out;
  } catch {
    return new Set();
  }
}

export function validateCite(
  state: CiteFormState,
  bibliographyKeys: ReadonlySet<string> | null,
): ValidationResult {
  const keys = state.keys.map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) {
    return { ok: false, field: "keys", message: "At least one citation key is required." };
  }
  // De-duplicate while preserving order.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const k of keys) {
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(k);
    }
  }
  if (bibliographyKeys && bibliographyKeys.size > 0) {
    const missing = unique.filter((k) => !bibliographyKeys.has(k));
    if (missing.length > 0) {
      return {
        ok: false,
        field: "keys",
        message: `Unknown bibliography key(s): ${missing.join(", ")}.`,
      };
    }
  }
  const locator =
    state.prefix?.trim() || state.suffix?.trim()
      ? { prefix: state.prefix?.trim() || undefined, suffix: state.suffix?.trim() || undefined }
      : undefined;
  return {
    ok: true,
    payload: buildCite({ keys: unique, locator }),
  };
}
