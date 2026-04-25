/**
 * Tests for the renderer-side variant-generation flow (Phase 2.3b.6.3).
 *
 * Exercises the asset-store ↔ planner ↔ IPC-encoder orchestration
 * with an injected fake encoder. Verifies:
 *   - kind heuristic from path
 *   - plan-of-zero when nothing to do
 *   - sharp-not-installed surfaces cleanly
 *   - successful encoding writes results back into the asset store
 *   - partial failures are surfaced with `status: "partial"`
 */
import { describe, it, expect, vi } from "vitest";
import { AssetStore } from "../src/renderer/asset-store.js";
import {
  runVariantFlow,
  inferImageKind,
  summarizeFlow,
  type VariantEncoderCallback,
} from "../src/renderer/variant-flow.js";

// Deterministic SHA-256 fake — sufficient for AssetStore's hash field.
const fakeHasher = async (bytes: Uint8Array): Promise<string> => {
  let h = 0;
  for (const b of bytes) h = (h * 31 + b) | 0;
  return `sha256:fake-${h >>> 0}`;
};

describe("inferImageKind", () => {
  it("classifies icon paths", () => {
    expect(inferImageKind("assets/images/icon-app.png")).toBe("icon");
    expect(inferImageKind("assets/images/app-icon.png")).toBe("icon");
    expect(inferImageKind("assets/images/icon.png")).toBe("icon");
  });

  it("classifies hero paths", () => {
    expect(inferImageKind("assets/images/hero-banner.png")).toBe("hero");
    expect(inferImageKind("assets/images/banner-hero.jpg")).toBe("hero");
  });

  it("classifies inline paths", () => {
    expect(inferImageKind("assets/images/inline-screenshot.png")).toBe("inline");
  });

  it("falls back to figure for plain images", () => {
    expect(inferImageKind("assets/images/diagram.png")).toBe("figure");
    expect(inferImageKind("assets/images/results.jpg")).toBe("figure");
  });
});

describe("runVariantFlow", () => {
  it("returns no-images when the store has no encodable images", async () => {
    const store = new AssetStore(fakeHasher);
    const encoder: VariantEncoderCallback = vi.fn();
    const r = await runVariantFlow(store, encoder);
    expect(r.status).toBe("no-images");
    expect(encoder).not.toHaveBeenCalled();
  });

  it("encodes images and writes variants back into the store", async () => {
    const store = new AssetStore(fakeHasher);
    await store.add("diagram.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    const encoder: VariantEncoderCallback = vi.fn(async ({ plan }) => ({
      ok: true,
      variants: plan.map((p: { variantPath: string }) => ({
        variantPath: p.variantPath,
        bytes: new Uint8Array([1, 2, 3]),
        width: 1600,
        height: 900,
      })),
      errors: [],
    }));

    const r = await runVariantFlow(store, encoder);
    expect(r.status).toBe("ok");
    expect(r.written).toBeGreaterThan(0);
    // figure preset → 2 variants (webp + avif)
    expect(r.plan).toHaveLength(2);
    // Variants are now in the asset store.
    expect(store.get("assets/images/diagram.1600w.webp")?.mimeType).toBe("image/webp");
    expect(store.get("assets/images/diagram.1600w.avif")?.mimeType).toBe("image/avif");
  });

  it("surfaces sharp-not-installed cleanly", async () => {
    const store = new AssetStore(fakeHasher);
    await store.add("diagram.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    const encoder: VariantEncoderCallback = async () => ({
      ok: false,
      reason: "sharp-not-installed",
      variants: [],
      errors: [],
    });
    const r = await runVariantFlow(store, encoder);
    expect(r.status).toBe("sharp-not-installed");
    expect(r.written).toBe(0);
    // Plan was still computed (so the UI can show "would have generated N").
    expect(r.plan.length).toBeGreaterThan(0);
  });

  it("returns no-pending-work when every variant already exists", async () => {
    const store = new AssetStore(fakeHasher);
    await store.add("diagram.png", new Uint8Array([0x89]));
    // Pre-populate both expected figure variants.
    await store.addAt("assets/images/diagram.1600w.webp", new Uint8Array([1]), "image/webp");
    await store.addAt("assets/images/diagram.1600w.avif", new Uint8Array([1]), "image/avif");
    const encoder: VariantEncoderCallback = vi.fn();
    const r = await runVariantFlow(store, encoder);
    expect(r.status).toBe("no-pending-work");
    expect(encoder).not.toHaveBeenCalled();
  });

  it("reports partial when some variants fail to encode", async () => {
    const store = new AssetStore(fakeHasher);
    await store.add("diagram.png", new Uint8Array([0x89]));
    const encoder: VariantEncoderCallback = async ({ plan }) => ({
      ok: true,
      variants: [{ variantPath: plan[0].variantPath, bytes: new Uint8Array([1]) }],
      errors: [{ variantPath: plan[1].variantPath, message: "libvips failure" }],
    });
    const r = await runVariantFlow(store, encoder);
    expect(r.status).toBe("partial");
    expect(r.written).toBe(1);
    expect(r.errors).toHaveLength(1);
  });

  it("skips variants that are already in the store (idempotent re-runs)", async () => {
    const store = new AssetStore(fakeHasher);
    await store.add("diagram.png", new Uint8Array([0x89]));
    await store.addAt("assets/images/diagram.1600w.webp", new Uint8Array([0xff]), "image/webp");
    const encoder: VariantEncoderCallback = vi.fn(async ({ plan }) => ({
      ok: true,
      variants: plan.map((p: { variantPath: string }) => ({ variantPath: p.variantPath, bytes: new Uint8Array([1]) })),
      errors: [],
    }));
    const r = await runVariantFlow(store, encoder);
    // Only the AVIF variant should be in the plan.
    expect(r.plan).toHaveLength(1);
    expect(r.plan[0].preset.format).toBe("avif");
  });

  it("does not try to re-variant existing .webp / .avif sources", async () => {
    const store = new AssetStore(fakeHasher);
    // A variant left over from a prior run looks like a webp source.
    await store.addAt("assets/images/diagram.1600w.webp", new Uint8Array([1]), "image/webp");
    const encoder: VariantEncoderCallback = vi.fn();
    const r = await runVariantFlow(store, encoder);
    expect(r.status).toBe("no-images");
    expect(encoder).not.toHaveBeenCalled();
  });
});

describe("summarizeFlow", () => {
  it("singular vs plural", () => {
    expect(summarizeFlow({ status: "ok", written: 1, errors: [], plan: [] })).toContain("1 variant.");
    expect(summarizeFlow({ status: "ok", written: 3, errors: [], plan: [] })).toContain("3 variants.");
  });

  it("describes each terminal state", () => {
    const states = ["no-images", "no-pending-work", "sharp-not-installed", "failed"] as const;
    for (const s of states) {
      const text = summarizeFlow({ status: s, written: 0, errors: [{ variantPath: "x", message: "y" }], plan: [] });
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    }
  });
});
