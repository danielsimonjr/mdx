/**
 * Tests for the AVIF/WebP variant planner (Phase 2.3b.6).
 *
 * The encoder itself requires sharp/libvips and is exercised in
 * the main-process integration tests; here we cover the pure
 * planning logic — what to encode, where to write, and what to
 * skip.
 */
import { describe, it, expect } from "vitest";
import {
  planVariants,
  variantPath,
  summarizePlan,
  DEFAULT_PRESETS,
  type PlannerSourceImage,
  type VariantPreset,
} from "../src/renderer/variant-planner.js";

const PNG_FIGURE: PlannerSourceImage = {
  path: "assets/images/diagram.png",
  mimeType: "image/png",
  kind: "figure",
};

describe("variantPath", () => {
  it("appends width tag and format to a PNG source", () => {
    const preset: VariantPreset = { format: "webp", quality: 85, maxWidth: 1600 };
    expect(variantPath("assets/images/diagram.png", preset)).toBe(
      "assets/images/diagram.1600w.webp",
    );
  });

  it("omits width tag for full-size variants", () => {
    const preset: VariantPreset = { format: "avif", quality: 70, maxWidth: null };
    expect(variantPath("assets/images/diagram.png", preset)).toBe(
      "assets/images/diagram.avif",
    );
  });

  it("handles paths without an extension", () => {
    const preset: VariantPreset = { format: "webp", quality: 85, maxWidth: 256 };
    expect(variantPath("assets/images/icon", preset)).toBe(
      "assets/images/icon.256w.webp",
    );
  });
});

describe("planVariants", () => {
  it("expands every source into one entry per preset", () => {
    const plan = planVariants([PNG_FIGURE]);
    // figure: webp 1600 + avif 1600 = 2 entries.
    expect(plan).toHaveLength(2);
    expect(plan.map((e) => e.preset.format).sort()).toEqual(["avif", "webp"]);
  });

  it("skips sources flagged skip=true", () => {
    const plan = planVariants([{ ...PNG_FIGURE, skip: true }]);
    expect(plan).toEqual([]);
  });

  it("skips unencodable MIME types", () => {
    const plan = planVariants([{ ...PNG_FIGURE, mimeType: "image/svg+xml" }]);
    expect(plan).toEqual([]);
  });

  it("skips presets whose target is already in the archive", () => {
    const plan = planVariants([
      {
        ...PNG_FIGURE,
        existingVariantPaths: ["assets/images/diagram.1600w.webp"],
      },
    ]);
    // Only the AVIF variant remains.
    expect(plan).toHaveLength(1);
    expect(plan[0].preset.format).toBe("avif");
  });

  it("does not write a variant onto the source path", () => {
    // A webp source for a `figure` would attempt to write
    // `diagram.1600w.webp` — same as the source if the source were
    // already that exact name. Verify no self-overwrite.
    const plan = planVariants([
      {
        path: "assets/images/diagram.1600w.webp",
        mimeType: "image/webp",
        kind: "figure",
      },
    ]);
    expect(plan.find((e) => e.variantPath === e.sourcePath)).toBeUndefined();
  });

  it("uses different presets for different kinds", () => {
    const sources: PlannerSourceImage[] = [
      { path: "assets/images/icon.png", mimeType: "image/png", kind: "icon" },
      { path: "assets/images/hero.png", mimeType: "image/png", kind: "hero" },
    ];
    const plan = planVariants(sources);
    // icon: 1 preset (webp 256w). hero: 2 presets (webp + avif at 2400w).
    expect(plan.filter((e) => e.sourcePath.endsWith("icon.png"))).toHaveLength(1);
    expect(plan.filter((e) => e.sourcePath.endsWith("hero.png"))).toHaveLength(2);
  });

  it("respects custom preset overrides", () => {
    const customPresets = {
      ...DEFAULT_PRESETS,
      figure: [{ format: "webp" as const, quality: 50, maxWidth: 800 }],
    };
    const plan = planVariants([PNG_FIGURE], customPresets);
    expect(plan).toHaveLength(1);
    expect(plan[0].preset.quality).toBe(50);
    expect(plan[0].preset.maxWidth).toBe(800);
  });

  it("returns an empty plan for an empty input", () => {
    expect(planVariants([])).toEqual([]);
  });
});

describe("summarizePlan", () => {
  it("counts entries per format", () => {
    const plan = planVariants([PNG_FIGURE]);
    expect(summarizePlan(plan)).toEqual({ webp: 1, avif: 1 });
  });

  it("returns zeroes for an empty plan", () => {
    expect(summarizePlan([])).toEqual({ webp: 0, avif: 0 });
  });
});
