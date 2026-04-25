/**
 * Image-variant generation planner — Phase 2.3b.6.
 *
 * The actual AVIF / WebP encoder requires a native binary (sharp
 * or libvips) and the renderer is sandboxed, so encoding lives in
 * the main process; the planner here is pure and decides *what*
 * to generate without doing the encoding itself. The renderer
 * shows the user the planned set; the main process executes one
 * encode per `VariantPlanEntry` and writes the result back into
 * the asset store.
 *
 * What the planner accounts for:
 *   - Per-kind config (figure / icon / hero / inline) — different
 *     quality + width presets per role
 *   - Skipping already-present variants (so re-runs are idempotent)
 *   - Skipping sources whose extension can't be re-encoded (SVG,
 *     animated GIFs marked via `manifest.assets.images[].animated`)
 */

export type ImageKind = "figure" | "icon" | "hero" | "inline";
export type VariantFormat = "webp" | "avif";

export interface VariantPreset {
  /** Output format. */
  format: VariantFormat;
  /** Encoder quality (0-100). */
  quality: number;
  /** Maximum width — preserves aspect ratio; null = full size. */
  maxWidth: number | null;
}

export const DEFAULT_PRESETS: Record<ImageKind, ReadonlyArray<VariantPreset>> = {
  figure: [
    { format: "webp", quality: 85, maxWidth: 1600 },
    { format: "avif", quality: 65, maxWidth: 1600 },
  ],
  icon: [
    { format: "webp", quality: 90, maxWidth: 256 },
  ],
  hero: [
    { format: "webp", quality: 80, maxWidth: 2400 },
    { format: "avif", quality: 60, maxWidth: 2400 },
  ],
  inline: [
    { format: "webp", quality: 85, maxWidth: 1200 },
  ],
};

export interface PlannerSourceImage {
  /** Archive-relative path. */
  path: string;
  /** Source MIME, used to skip unsupported sources. */
  mimeType: string;
  /** Per-kind config for this image; the planner picks the preset list from this. */
  kind: ImageKind;
  /**
   * Existing variant paths already present in the archive. The
   * planner skips presets whose target path matches one of these
   * so re-runs don't re-encode.
   */
  existingVariantPaths?: ReadonlyArray<string>;
  /** When true, the planner skips this source entirely (animated GIFs etc.). */
  skip?: boolean;
}

export interface VariantPlanEntry {
  /** The source path the encoder will read. */
  sourcePath: string;
  /** Where to write the encoded variant in the archive. */
  variantPath: string;
  /** Which encoder + parameters to use. */
  preset: VariantPreset;
}

const ENCODABLE_MIMES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/webp",
  // AVIF input is theoretically supported by libvips but real-world
  // round-tripping is uneven; allow it through and let the encoder
  // fail loudly if the platform's libvips is too old.
  "image/avif",
]);

/**
 * Given a planner-source image, compute its variant target path:
 *   `assets/images/<basename>.<format>` →
 *   `assets/images/<basename>.<width>w.<format>` for size-bound
 *   variants, or `assets/images/<basename>.<format>` for full-size.
 *
 * Width tag goes between the basename and the format extension so
 * a glob `*.webp` still picks them up; manifest writers can sort
 * variants ascending by suffix.
 */
export function variantPath(sourcePath: string, preset: VariantPreset): string {
  const dot = sourcePath.lastIndexOf(".");
  const stem = dot >= 0 ? sourcePath.slice(0, dot) : sourcePath;
  const widthTag = preset.maxWidth == null ? "" : `.${preset.maxWidth}w`;
  return `${stem}${widthTag}.${preset.format}`;
}

/**
 * Plan the variant set for a list of source images. Returns one
 * `VariantPlanEntry` per (source, preset) pair the encoder must
 * produce — already-existing variant paths are filtered out.
 *
 * The planner is intentionally synchronous + side-effect-free; the
 * main-process executor consumes the array and runs one encode per
 * entry.
 */
export function planVariants(
  sources: ReadonlyArray<PlannerSourceImage>,
  presets: Record<ImageKind, ReadonlyArray<VariantPreset>> = DEFAULT_PRESETS,
): VariantPlanEntry[] {
  const out: VariantPlanEntry[] = [];
  for (const src of sources) {
    if (src.skip) continue;
    if (!ENCODABLE_MIMES.has(src.mimeType)) continue;
    const presetList = presets[src.kind];
    if (!presetList) continue;
    const existing = new Set(src.existingVariantPaths ?? []);
    for (const preset of presetList) {
      const target = variantPath(src.path, preset);
      // Don't generate a self-referential variant (e.g. a webp
      // source rendered to webp at its own size + format).
      if (target === src.path) continue;
      if (existing.has(target)) continue;
      out.push({ sourcePath: src.path, variantPath: target, preset });
    }
  }
  return out;
}

/** Convenience: count variants per format for a status-bar widget. */
export function summarizePlan(plan: ReadonlyArray<VariantPlanEntry>): Record<VariantFormat, number> {
  const out: Record<VariantFormat, number> = { webp: 0, avif: 0 };
  for (const e of plan) out[e.preset.format]++;
  return out;
}
