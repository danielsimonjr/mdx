/**
 * Renderer-side variant-generation flow — Phase 2.3b.6.3.
 *
 * Glue between the asset store, the variant planner, and the
 * IPC encoder running in the main process. Pure orchestration:
 * no DOM, no Electron, no `window` — testable in node by injecting
 * a fake encoder.
 *
 * Pipeline:
 *
 *   1. Enumerate image entries in the asset store.
 *   2. Build a `PlannerSourceImage[]` from them. The default kind
 *      mapping (figure / icon / hero / inline) is path-based for
 *      now; a future iteration reads kind from
 *      `manifest.assets.images[].variants_kind` so authors can
 *      override.
 *   3. Call `planVariants` to get the list of (source, preset)
 *      pairs.
 *   4. Hand the plan + source bytes to the main-process encoder
 *      via the injected `encoder` callback.
 *   5. Write each returned variant back into the asset store.
 *   6. Return a summary the UI surfaces in a status panel.
 */
import {
  planVariants,
  variantPath,
  type PlannerSourceImage,
  type VariantPlanEntry,
  type ImageKind,
} from "./variant-planner.js";
import type { AssetStore } from "./asset-store.js";

/**
 * Encoder callback the flow invokes. Real implementation goes
 * through `window.editorApi.encodeVariants`; tests pass a fake.
 */
export type VariantEncoderCallback = (input: {
  sources: Array<[string, Uint8Array]>;
  plan: VariantPlanEntry[];
}) => Promise<{
  ok: boolean;
  reason?: "sharp-not-installed" | "encode-failed";
  variants: Array<{ variantPath: string; bytes: Uint8Array; width?: number; height?: number }>;
  errors: Array<{ variantPath: string; message: string }>;
}>;

export interface FlowResult {
  /** What status the flow ended in. */
  status: "ok" | "no-images" | "no-pending-work" | "sharp-not-installed" | "partial" | "failed";
  /** Number of variants written back into the asset store. */
  written: number;
  /** Variants the encoder skipped + reason. */
  errors: Array<{ variantPath: string; message: string }>;
  /** Plan that was sent to the encoder (empty when status === "no-images"). */
  plan: VariantPlanEntry[];
}

/**
 * Default kind heuristic: path tells us the role.
 *   `assets/images/icon-*` or `*-icon.*`        → icon
 *   `assets/images/hero-*` or `*-hero.*`        → hero
 *   `assets/images/inline-*` or `*-inline.*`    → inline
 *   everything else                             → figure
 */
export function inferImageKind(archivePath: string): ImageKind {
  const lower = archivePath.toLowerCase();
  const basename = lower.slice(lower.lastIndexOf("/") + 1);
  if (/(?:^|[-_.])icon(?:[-_.]|$)/.test(basename)) return "icon";
  if (/(?:^|[-_.])hero(?:[-_.]|$)/.test(basename)) return "hero";
  if (/(?:^|[-_.])inline(?:[-_.]|$)/.test(basename)) return "inline";
  return "figure";
}

const ENCODABLE_IMAGE_MIMES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
]);

/** True when the path is a generated variant (we don't re-variant variants). */
function isVariantPath(path: string): boolean {
  return /\.\d+w\.(webp|avif)$/.test(path) || /\/[^/]+\.(webp|avif)$/.test(path);
}

const MIME_BY_FORMAT: Record<"webp" | "avif", string> = {
  webp: "image/webp",
  avif: "image/avif",
};

export async function runVariantFlow(
  store: AssetStore,
  encoder: VariantEncoderCallback,
): Promise<FlowResult> {
  // 1. Enumerate encodable, non-variant images currently staged.
  const candidates = store.filter(
    (e) =>
      e.path.startsWith("assets/images/") &&
      ENCODABLE_IMAGE_MIMES.has(e.mimeType) &&
      !isVariantPath(e.path),
  );
  if (candidates.length === 0) {
    return { status: "no-images", written: 0, errors: [], plan: [] };
  }

  // 2. Build planner sources.
  const planner: PlannerSourceImage[] = candidates.map((e) => ({
    path: e.path,
    mimeType: e.mimeType,
    kind: inferImageKind(e.path),
    existingVariantPaths: store.variantPathsFor(e.path),
  }));

  // 3. Plan.
  const plan = planVariants(planner);
  if (plan.length === 0) {
    return { status: "no-pending-work", written: 0, errors: [], plan: [] };
  }

  // 4. Encode.
  const sources: Array<[string, Uint8Array]> = candidates.map((e) => [e.path, e.bytes]);
  const result = await encoder({ sources, plan });
  if (!result.ok && result.reason === "sharp-not-installed") {
    return { status: "sharp-not-installed", written: 0, errors: [], plan };
  }
  if (!result.ok) {
    return { status: "failed", written: 0, errors: result.errors, plan };
  }

  // 5. Write back into the asset store. Each variant goes in at the
  //    pre-decided path with the format-specific MIME.
  let written = 0;
  for (const v of result.variants) {
    const ext = v.variantPath.endsWith(".webp") ? "webp" : "avif";
    await store.addAt(v.variantPath, v.bytes, MIME_BY_FORMAT[ext]);
    written++;
  }

  // 6. Status mapping.
  if (result.errors.length > 0 && written > 0) {
    return { status: "partial", written, errors: result.errors, plan };
  }
  if (result.errors.length > 0) {
    return { status: "failed", written, errors: result.errors, plan };
  }
  return { status: "ok", written, errors: [], plan };
}

/** Friendly string for the status panel. */
export function summarizeFlow(result: FlowResult): string {
  switch (result.status) {
    case "ok":
      return `Generated ${result.written} variant${result.written === 1 ? "" : "s"}.`;
    case "partial":
      return `Generated ${result.written} variant${result.written === 1 ? "" : "s"}; ${result.errors.length} failed.`;
    case "no-images":
      return "No image assets to generate variants for.";
    case "no-pending-work":
      return "All variants already up to date.";
    case "sharp-not-installed":
      return "Variant generation requires `sharp` (run `npm install sharp` and restart).";
    case "failed":
      return `Variant generation failed (${result.errors.length} error${result.errors.length === 1 ? "" : "s"}).`;
  }
}

// Re-export for callers that want the canonical path computation.
export { variantPath };
