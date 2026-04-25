/**
 * AVIF / WebP variant encoder — Phase 2.3b.6.2.
 *
 * Lives in the main process because (a) the renderer is sandboxed
 * and can't load native modules, and (b) `sharp` is a native
 * binding to libvips with platform-specific binaries. The renderer
 * computes the plan via `variant-planner.ts`, sends it over IPC,
 * and the main process executes one encode per `VariantPlanEntry`.
 *
 * `sharp` is in `optionalDependencies` so CI doesn't drag libvips
 * into every test run. When sharp isn't installed, `encodeVariants`
 * resolves with `{ ok: false, reason: 'sharp-not-installed' }` so
 * the editor can show a clear "install sharp to enable variant
 * generation" message rather than crash.
 *
 * The encoder pipeline is injected (`SharpModule`) so unit tests
 * can drive the orchestration logic against a stub without
 * actually invoking libvips.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

import type { Buffer } from "node:buffer";

// Mirror of `VariantPlanEntry` from `editor-desktop/src/renderer/variant-planner.ts`
// — duplicated here to keep the main-process module independent of the renderer.
// Renderer + main agree on the shape via IPC serialization.
export interface VariantPlanEntry {
  sourcePath: string;
  variantPath: string;
  preset: {
    format: "webp" | "avif";
    quality: number;
    maxWidth: number | null;
  };
}

export interface EncoderInput {
  /** Map of source path → bytes (renderer hands these over for encoding). */
  sources: ReadonlyMap<string, Uint8Array>;
  /** The plan to execute. */
  plan: ReadonlyArray<VariantPlanEntry>;
}

export interface VariantEncodeResult {
  variantPath: string;
  /** Encoded bytes; the caller writes them back into the asset store. */
  bytes: Uint8Array;
  /** Encoded width × height for manifest population. */
  width?: number;
  height?: number;
}

export interface EncoderResult {
  ok: boolean;
  /** When ok=false, why. */
  reason?: "sharp-not-installed" | "encode-failed";
  /** Encoded variants, in the order the plan listed them. */
  variants: VariantEncodeResult[];
  /** Per-entry errors (encode-failed). */
  errors: Array<{ variantPath: string; message: string }>;
}

// ---------------------------------------------------------------------------
// Sharp adapter
// ---------------------------------------------------------------------------

/**
 * Minimal subset of sharp's API the encoder uses. The real `sharp`
 * default export satisfies this; tests can pass a stub.
 */
export interface SharpInstance {
  resize(opts: { width?: number; withoutEnlargement?: boolean }): SharpInstance;
  webp(opts: { quality: number }): SharpInstance;
  avif(opts: { quality: number }): SharpInstance;
  toBuffer(opts?: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number } }>;
}

export type SharpModule = (input: Uint8Array) => SharpInstance;

/**
 * Lazy-load the sharp module. Returns `null` if sharp isn't
 * installed (we're running on a machine that opted out of the
 * optional dep). Catches both `MODULE_NOT_FOUND` (npm-side
 * failure) and the bindings.gyp / libvips load errors that show
 * up on platforms sharp's prebuilds don't cover.
 */
export function loadSharp(): SharpModule | null {
  try {
    // Use require so the call is dynamic at the Node level — bundlers
    // that statically analyze imports won't try to bundle sharp.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("sharp") as unknown;
    if (typeof mod === "function") return mod as SharpModule;
    if (mod && typeof mod === "object" && "default" in mod && typeof (mod as { default: unknown }).default === "function") {
      return (mod as { default: SharpModule }).default;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Encoder
// ---------------------------------------------------------------------------

/**
 * Encode every variant in `input.plan`. The pipeline is:
 *
 *   for each entry:
 *     pipeline = sharp(sourceBytes)
 *     if maxWidth set: pipeline.resize({ width, withoutEnlargement: true })
 *     pipeline.<format>({ quality })
 *     bytes ← pipeline.toBuffer({ resolveWithObject: true })
 *
 * `withoutEnlargement: true` ensures we never up-scale a small
 * source to the preset's maxWidth — that produces blurry output
 * with no quality benefit.
 *
 * Per-entry failures are collected into `result.errors`. The
 * function only returns `ok: false` when sharp itself is missing.
 */
export async function encodeVariants(
  input: EncoderInput,
  sharpModule: SharpModule | null = loadSharp(),
): Promise<EncoderResult> {
  if (!sharpModule) {
    return {
      ok: false,
      reason: "sharp-not-installed",
      variants: [],
      errors: [],
    };
  }
  const variants: VariantEncodeResult[] = [];
  const errors: EncoderResult["errors"] = [];
  for (const entry of input.plan) {
    const sourceBytes = input.sources.get(entry.sourcePath);
    if (!sourceBytes) {
      errors.push({ variantPath: entry.variantPath, message: `source '${entry.sourcePath}' not in input map` });
      continue;
    }
    try {
      let pipeline = sharpModule(sourceBytes);
      if (entry.preset.maxWidth != null) {
        pipeline = pipeline.resize({ width: entry.preset.maxWidth, withoutEnlargement: true });
      }
      pipeline = entry.preset.format === "webp"
        ? pipeline.webp({ quality: entry.preset.quality })
        : pipeline.avif({ quality: entry.preset.quality });
      const out = await pipeline.toBuffer({ resolveWithObject: true });
      variants.push({
        variantPath: entry.variantPath,
        bytes: new Uint8Array(out.data.buffer, out.data.byteOffset, out.data.byteLength),
        width: out.info.width,
        height: out.info.height,
      });
    } catch (e) {
      errors.push({
        variantPath: entry.variantPath,
        message: (e as Error).message,
      });
    }
  }
  return {
    ok: true,
    variants,
    errors,
  };
}

/**
 * Build a `manifest.assets.images[].variants[]` projection from
 * the encoder's output, matching spec §17.2. Pure function — does
 * not touch disk.
 */
export interface ManifestVariantEntry {
  path: string;
  format: string;
  width?: number;
  height?: number;
  size_bytes: number;
}

export function manifestVariantsProjection(
  results: ReadonlyArray<VariantEncodeResult>,
  plan: ReadonlyArray<VariantPlanEntry>,
): ManifestVariantEntry[] {
  const planByPath = new Map<string, VariantPlanEntry>();
  for (const p of plan) planByPath.set(p.variantPath, p);
  const out: ManifestVariantEntry[] = [];
  for (const r of results) {
    const planEntry = planByPath.get(r.variantPath);
    if (!planEntry) continue;
    out.push({
      path: r.variantPath,
      format: planEntry.preset.format,
      width: r.width,
      height: r.height,
      size_bytes: r.bytes.length,
    });
  }
  // Stable ordering for reproducible content-hashes.
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}
