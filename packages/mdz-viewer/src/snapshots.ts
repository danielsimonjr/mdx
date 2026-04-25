/**
 * delta-snapshots-v1 extension reader — Phase 4.5 reference impl.
 *
 * Spec: spec/extensions/delta-snapshots-v1.md
 *
 * This module reconstructs any version listed in
 * `history/snapshots/index.json` by walking back to its chain's
 * `base/<version>.md` and applying unified-diff patches in
 * forward order. It does no encoding (writer-side patch creation
 * is the CLI's job — `mdz snapshot create`); reading is enough
 * for the viewer + the editor's diff pane.
 *
 * Strict validation per the spec's "Conformance" section:
 *
 *   - Malformed chains (missing parent, missing base file) → throw
 *   - Circular chains → throw with the cycle path
 *   - Chain depth >50 → throw unless `maxChainDepth` raised
 *   - Unapplyable patches → throw with the version + line number
 *
 * Readers MUST surface clear errors rather than silently returning
 * a partially-applied document — so every error path throws a
 * `SnapshotError` carrying the offending version.
 */

const DEFAULT_MAX_CHAIN_DEPTH = 50;

export interface SnapshotIndex {
  schema_version: string;
  extension: "delta-snapshots-v1";
  chains: ReadonlyArray<SnapshotChain>;
}

export interface SnapshotChain {
  /** Archive-relative path to the base markdown file. */
  base: string;
  /** Version string of the base. Must appear in versions.json. */
  base_version: string;
  deltas: ReadonlyArray<SnapshotDelta>;
}

export interface SnapshotDelta {
  /** Version this delta produces. */
  version: string;
  /** Archive-relative patch path. */
  patch: string;
  /** Version this patch applies TO. */
  parent: string;
}

export class SnapshotError extends Error {
  constructor(
    message: string,
    public readonly version?: string,
    public readonly patchLine?: number,
  ) {
    super(message);
    this.name = "SnapshotError";
  }
}

// ---------------------------------------------------------------------------
// index.json parsing
// ---------------------------------------------------------------------------

/**
 * Parse + structurally validate `history/snapshots/index.json`.
 * Throws `SnapshotError` on malformed input. Does not validate
 * patch contents (that happens at apply time).
 */
export function parseIndex(raw: string): SnapshotIndex {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new SnapshotError(`index.json is not valid JSON: ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new SnapshotError("index.json must be a JSON object");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.extension !== "delta-snapshots-v1") {
    throw new SnapshotError(
      `expected extension 'delta-snapshots-v1', got '${String(obj.extension)}'`,
    );
  }
  if (!Array.isArray(obj.chains) || obj.chains.length === 0) {
    throw new SnapshotError("index.json must declare at least one chain");
  }
  const chains: SnapshotChain[] = [];
  for (const c of obj.chains) {
    chains.push(validateChain(c));
  }
  return {
    schema_version: typeof obj.schema_version === "string" ? obj.schema_version : "1.0.0",
    extension: "delta-snapshots-v1",
    chains,
  };
}

function validateChain(raw: unknown): SnapshotChain {
  if (!raw || typeof raw !== "object") {
    throw new SnapshotError("chain entry must be an object");
  }
  const c = raw as Record<string, unknown>;
  if (typeof c.base !== "string" || !c.base) {
    throw new SnapshotError("chain.base is required");
  }
  if (typeof c.base_version !== "string" || !c.base_version) {
    throw new SnapshotError("chain.base_version is required");
  }
  if (!Array.isArray(c.deltas)) {
    throw new SnapshotError(`chain '${c.base_version}': deltas must be an array`);
  }
  const deltas: SnapshotDelta[] = [];
  const seenVersions = new Set<string>([c.base_version]);
  for (const d of c.deltas) {
    if (!d || typeof d !== "object") {
      throw new SnapshotError(`chain '${c.base_version}': delta entry must be an object`);
    }
    const dd = d as Record<string, unknown>;
    if (typeof dd.version !== "string" || !dd.version) {
      throw new SnapshotError(`chain '${c.base_version}': delta.version is required`);
    }
    if (typeof dd.patch !== "string" || !dd.patch) {
      throw new SnapshotError(`chain '${c.base_version}': delta.patch is required`);
    }
    if (typeof dd.parent !== "string" || !dd.parent) {
      throw new SnapshotError(`chain '${c.base_version}': delta.parent is required`);
    }
    if (seenVersions.has(dd.version)) {
      throw new SnapshotError(
        `chain '${c.base_version}': duplicate delta version '${dd.version}'`,
        dd.version,
      );
    }
    deltas.push({ version: dd.version, patch: dd.patch, parent: dd.parent });
    seenVersions.add(dd.version);
  }
  return {
    base: c.base,
    base_version: c.base_version,
    deltas,
  };
}

// ---------------------------------------------------------------------------
// Chain resolution
// ---------------------------------------------------------------------------

interface ResolvedPath {
  chain: SnapshotChain;
  /** Patch versions (in apply order) from base → target. Empty for the base itself. */
  applyOrder: ReadonlyArray<SnapshotDelta>;
}

/**
 * Find the chain + apply path for a given version. Detects circular
 * parent references, missing parents, and chain depth violations.
 */
export function resolveVersion(
  index: SnapshotIndex,
  version: string,
  options: { maxChainDepth?: number } = {},
): ResolvedPath {
  const maxDepth = options.maxChainDepth ?? DEFAULT_MAX_CHAIN_DEPTH;
  for (const chain of index.chains) {
    if (chain.base_version === version) {
      return { chain, applyOrder: [] };
    }
    // Build a parent → delta lookup for this chain.
    const byVersion = new Map<string, SnapshotDelta>();
    for (const d of chain.deltas) byVersion.set(d.version, d);
    if (!byVersion.has(version)) continue;

    // Walk backward from `version` to chain.base_version, collecting deltas.
    const path: SnapshotDelta[] = [];
    const seen = new Set<string>();
    let current: string | null = version;
    while (current && current !== chain.base_version) {
      if (seen.has(current)) {
        throw new SnapshotError(
          `circular chain detected at version '${current}'`,
          current,
        );
      }
      seen.add(current);
      const delta = byVersion.get(current);
      if (!delta) {
        throw new SnapshotError(
          `version '${current}' has no delta in chain '${chain.base_version}'`,
          current,
        );
      }
      path.push(delta);
      current = delta.parent;
      if (path.length > maxDepth) {
        throw new SnapshotError(
          `chain depth exceeds maximum of ${maxDepth}`,
          version,
        );
      }
    }
    if (current !== chain.base_version) {
      throw new SnapshotError(
        `delta chain for '${version}' does not reach the base '${chain.base_version}'`,
        version,
      );
    }
    // path is target → base; reverse for forward apply order.
    path.reverse();
    return { chain, applyOrder: path };
  }
  throw new SnapshotError(`version '${version}' not found in any chain`, version);
}

// ---------------------------------------------------------------------------
// Unified diff applier
// ---------------------------------------------------------------------------

/**
 * Apply a single GNU unified-diff patch to `source`. Implements
 * the subset the spec produces (`diff -U 3`, no rename / mode
 * lines, no `\\ No newline at end of file` complication beyond
 * preserving the source's trailing-newline state).
 *
 * Throws `SnapshotError` with the patch line number when context
 * doesn't match — readers MUST NOT silently return a partial
 * document, per the spec.
 */
export function applyUnifiedDiff(source: string, patch: string, version?: string): string {
  const sourceLines = source.split("\n");
  // Trailing-newline tracking: spec patches don't carry the special
  // "\\ No newline at end of file" marker per design — but if the
  // source had no trailing newline, splitting yields an extra ""
  // element, and the final join must preserve it.
  const trailingNewline = source.endsWith("\n");
  if (trailingNewline) sourceLines.pop();

  const patchLines = patch.split(/\r?\n/);
  const output: string[] = [];
  let cursor = 0; // Position in sourceLines.
  let pi = 0; // Patch line index.

  // Skip --- / +++ headers if present.
  while (pi < patchLines.length && (patchLines[pi].startsWith("---") || patchLines[pi].startsWith("+++"))) {
    pi++;
  }

  while (pi < patchLines.length) {
    const line = patchLines[pi];
    if (line === "" && pi === patchLines.length - 1) break; // trailing blank
    const hunkHeader = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunkHeader) {
      pi++;
      continue;
    }
    const oldStart = parseInt(hunkHeader[1], 10);
    const oldCount = hunkHeader[2] != null ? parseInt(hunkHeader[2], 10) : 1;
    pi++;

    // Copy unchanged source lines up to the hunk start (1-indexed).
    const targetCursor = oldStart - 1;
    if (targetCursor < cursor) {
      throw new SnapshotError(
        `hunk overlaps previous content at patch line ${pi}`,
        version,
        pi,
      );
    }
    while (cursor < targetCursor) {
      output.push(sourceLines[cursor]);
      cursor++;
    }

    // Drive the hunk by patch content, not by source-line count —
    // trailing `+` additions after the last `-`/` ` line need to
    // land in `output` even though they don't advance `cursor`.
    let consumed = 0;
    while (pi < patchLines.length) {
      const hunkLine = patchLines[pi];
      if (hunkLine.startsWith("@@")) break; // next hunk
      if (hunkLine.length === 0) {
        // Trailing blank from the patch's final newline.
        if (pi === patchLines.length - 1) {
          pi++;
          break;
        }
        // Blank context line — treat as " " + empty content.
        if (consumed < oldCount) {
          if (sourceLines[cursor] !== "") {
            throw new SnapshotError(
              `context mismatch at source line ${cursor + 1} (expected blank)`,
              version,
              pi + 1,
            );
          }
          output.push("");
          cursor++;
          consumed++;
        }
        pi++;
        continue;
      }
      const sigil = hunkLine.charAt(0);
      const content = hunkLine.slice(1);
      if (sigil === " ") {
        if (sourceLines[cursor] !== content) {
          throw new SnapshotError(
            `context mismatch at source line ${cursor + 1}: expected '${content}', got '${sourceLines[cursor]}'`,
            version,
            pi + 1,
          );
        }
        output.push(content);
        cursor++;
        consumed++;
      } else if (sigil === "-") {
        if (sourceLines[cursor] !== content) {
          throw new SnapshotError(
            `removal mismatch at source line ${cursor + 1}: expected '${content}', got '${sourceLines[cursor]}'`,
            version,
            pi + 1,
          );
        }
        cursor++;
        consumed++;
      } else if (sigil === "+") {
        output.push(content);
      } else if (sigil === "\\") {
        // "\\ No newline at end of file" — ignore (spec doesn't emit).
      } else {
        throw new SnapshotError(
          `unrecognized patch line at ${pi + 1}: '${hunkLine}'`,
          version,
          pi + 1,
        );
      }
      pi++;
      // Belt-and-braces: if we've consumed every source line the
      // hunk claims and the next non-`+` line is something else,
      // we'll exit on the @@-or-end check at top of the loop.
      if (consumed > oldCount) {
        throw new SnapshotError(
          `hunk consumed more source lines than declared (${consumed} > ${oldCount})`,
          version,
          pi,
        );
      }
    }
  }

  // Append remaining unchanged source lines.
  while (cursor < sourceLines.length) {
    output.push(sourceLines[cursor]);
    cursor++;
  }

  let result = output.join("\n");
  if (trailingNewline) result += "\n";
  return result;
}

// ---------------------------------------------------------------------------
// Top-level reconstruction
// ---------------------------------------------------------------------------

/**
 * `EntryReader` abstracts archive I/O so the same code runs against
 * a JSZip-loaded archive (viewer), an in-memory test fixture, or
 * the editor's loaded entry map.
 */
export interface EntryReader {
  readText(path: string): Promise<string> | string;
}

/**
 * Reconstruct version `version` by walking the chain in `index`
 * and applying patches in forward order. Throws `SnapshotError`
 * on any spec violation.
 */
export async function reconstructVersion(
  index: SnapshotIndex,
  version: string,
  reader: EntryReader,
  options: { maxChainDepth?: number } = {},
): Promise<string> {
  const resolved = resolveVersion(index, version, options);
  let content = await Promise.resolve(reader.readText(resolved.chain.base));
  for (const delta of resolved.applyOrder) {
    const patch = await Promise.resolve(reader.readText(delta.patch));
    content = applyUnifiedDiff(content, patch, delta.version);
  }
  return content;
}

/**
 * Convenience wrapper for callers that already have the archive's
 * full entry map. Uses a synchronous reader.
 */
export function reconstructVersionSync(
  index: SnapshotIndex,
  version: string,
  entries: ReadonlyMap<string, string>,
  options: { maxChainDepth?: number } = {},
): string {
  const resolved = resolveVersion(index, version, options);
  let content = entries.get(resolved.chain.base);
  if (content == null) {
    throw new SnapshotError(`base file '${resolved.chain.base}' not found in archive`, version);
  }
  for (const delta of resolved.applyOrder) {
    const patch = entries.get(delta.patch);
    if (patch == null) {
      throw new SnapshotError(`patch '${delta.patch}' not found in archive`, delta.version);
    }
    content = applyUnifiedDiff(content, patch, delta.version);
  }
  return content;
}
