/**
 * Tests for the main-process variant encoder (Phase 2.3b.6.2).
 *
 * The real `sharp` is in optionalDependencies and may not be
 * installed in CI. These tests inject a stub `SharpModule` so we
 * exercise the orchestration logic — pipeline assembly, error
 * collection, missing-source handling, manifest projection —
 * without booting libvips. End-to-end encoding correctness
 * (does sharp actually produce a valid AVIF?) is a Phase 2.3a.6
 * Playwright responsibility.
 */
import { describe, it, expect, vi } from "vitest";
import {
  encodeVariants,
  loadSharp,
  manifestVariantsProjection,
  type SharpInstance,
  type SharpModule,
  type VariantPlanEntry,
} from "../src/main/variant-encoder.js";

// ---------------------------------------------------------------------------
// Stub sharp module
// ---------------------------------------------------------------------------

interface StubCall {
  resize: { width?: number; withoutEnlargement?: boolean } | null;
  format: "webp" | "avif" | null;
  quality: number | null;
  inputBytes: number;
}

/**
 * Build a SharpModule stub that records every pipeline call and
 * returns deterministic encoded bytes. The first arg is a
 * pre-canned response per call; the second is a list to push
 * `StubCall` records into for assertion.
 */
function makeStubSharp(
  encodes: ReadonlyArray<{ width: number; height: number; bytes: Uint8Array }>,
  log: StubCall[],
): SharpModule {
  let callIdx = 0;
  return (input: Uint8Array) => {
    const record: StubCall = { resize: null, format: null, quality: null, inputBytes: input.length };
    log.push(record);
    const pipeline: SharpInstance = {
      resize(opts) { record.resize = opts; return pipeline; },
      webp(opts) { record.format = "webp"; record.quality = opts.quality; return pipeline; },
      avif(opts) { record.format = "avif"; record.quality = opts.quality; return pipeline; },
      async toBuffer() {
        const result = encodes[callIdx++] ?? { width: 100, height: 100, bytes: new Uint8Array([0]) };
        const buf = Buffer.from(result.bytes);
        return { data: buf, info: { width: result.width, height: result.height } };
      },
    };
    return pipeline;
  };
}

const SOURCE_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header, fake

const FIGURE_PLAN: VariantPlanEntry[] = [
  {
    sourcePath: "assets/images/diagram.png",
    variantPath: "assets/images/diagram.1600w.webp",
    preset: { format: "webp", quality: 85, maxWidth: 1600 },
  },
  {
    sourcePath: "assets/images/diagram.png",
    variantPath: "assets/images/diagram.1600w.avif",
    preset: { format: "avif", quality: 65, maxWidth: 1600 },
  },
];

describe("encodeVariants", () => {
  it("returns ok=false when sharp is not installed", async () => {
    const r = await encodeVariants({ sources: new Map(), plan: FIGURE_PLAN }, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("sharp-not-installed");
    expect(r.variants).toEqual([]);
  });

  it("encodes every entry with the right pipeline", async () => {
    const log: StubCall[] = [];
    const stub = makeStubSharp(
      [
        { width: 1600, height: 900, bytes: new Uint8Array([1, 2, 3]) },
        { width: 1600, height: 900, bytes: new Uint8Array([4, 5, 6, 7]) },
      ],
      log,
    );
    const r = await encodeVariants(
      { sources: new Map([["assets/images/diagram.png", SOURCE_BYTES]]), plan: FIGURE_PLAN },
      stub,
    );
    expect(r.ok).toBe(true);
    expect(r.variants).toHaveLength(2);
    expect(r.variants[0].variantPath).toBe("assets/images/diagram.1600w.webp");
    expect(r.variants[0].bytes.length).toBe(3);
    expect(r.variants[1].bytes.length).toBe(4);
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({
      resize: { width: 1600, withoutEnlargement: true },
      format: "webp",
      quality: 85,
    });
    expect(log[1]).toMatchObject({
      resize: { width: 1600, withoutEnlargement: true },
      format: "avif",
      quality: 65,
    });
  });

  it("skips the resize stage when maxWidth is null", async () => {
    const log: StubCall[] = [];
    const stub = makeStubSharp([{ width: 800, height: 600, bytes: new Uint8Array([1]) }], log);
    const fullSizePlan: VariantPlanEntry[] = [{
      sourcePath: "assets/images/x.png",
      variantPath: "assets/images/x.webp",
      preset: { format: "webp", quality: 80, maxWidth: null },
    }];
    await encodeVariants(
      { sources: new Map([["assets/images/x.png", SOURCE_BYTES]]), plan: fullSizePlan },
      stub,
    );
    expect(log[0].resize).toBe(null);
  });

  it("collects per-entry failures without halting the whole run", async () => {
    let callIdx = 0;
    const failingStub: SharpModule = (() => {
      const pipeline: SharpInstance = {
        resize() { return pipeline; },
        webp() { return pipeline; },
        avif() { return pipeline; },
        async toBuffer() {
          callIdx++;
          if (callIdx === 1) throw new Error("libvips: corrupt input");
          return { data: Buffer.from([42]), info: { width: 1, height: 1 } };
        },
      };
      return () => pipeline;
    })();
    const r = await encodeVariants(
      { sources: new Map([["assets/images/diagram.png", SOURCE_BYTES]]), plan: FIGURE_PLAN },
      failingStub,
    );
    expect(r.ok).toBe(true);
    expect(r.variants).toHaveLength(1); // one succeeded
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({
      variantPath: "assets/images/diagram.1600w.webp",
      message: expect.stringContaining("corrupt"),
    });
  });

  it("flags missing-source entries instead of throwing", async () => {
    const log: StubCall[] = [];
    const stub = makeStubSharp([{ width: 100, height: 100, bytes: new Uint8Array([0]) }], log);
    const r = await encodeVariants(
      // Empty sources map.
      { sources: new Map(), plan: FIGURE_PLAN },
      stub,
    );
    expect(r.ok).toBe(true);
    expect(r.variants).toEqual([]);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0].message).toContain("not in input map");
    // Stub was never invoked.
    expect(log).toEqual([]);
  });

  it("returns an empty result for an empty plan", async () => {
    const stub = makeStubSharp([], []);
    const r = await encodeVariants({ sources: new Map(), plan: [] }, stub);
    expect(r).toMatchObject({ ok: true, variants: [], errors: [] });
  });
});

describe("loadSharp", () => {
  it("returns null when sharp isn't installed (the test runner's case)", () => {
    // sharp is in optionalDependencies and not installed in CI; loadSharp should
    // return null rather than throwing. (If you've added it locally, this test
    // returns the sharp function — both are valid in different environments.)
    const result = loadSharp();
    expect(result === null || typeof result === "function").toBe(true);
  });
});

describe("manifestVariantsProjection", () => {
  it("projects encode results back to manifest §17.2 entries", () => {
    const results = [
      { variantPath: "assets/images/diagram.1600w.webp", bytes: new Uint8Array(50000), width: 1600, height: 900 },
      { variantPath: "assets/images/diagram.1600w.avif", bytes: new Uint8Array(20000), width: 1600, height: 900 },
    ];
    const m = manifestVariantsProjection(results, FIGURE_PLAN);
    expect(m).toHaveLength(2);
    expect(m[0].format).toBe("avif"); // alphabetical sort: avif < webp
    expect(m[0].size_bytes).toBe(20000);
    expect(m[1].format).toBe("webp");
    expect(m[1].size_bytes).toBe(50000);
  });

  it("ignores results whose path isn't in the plan", () => {
    const results = [
      { variantPath: "assets/images/orphan.webp", bytes: new Uint8Array([1]), width: 1, height: 1 },
    ];
    const m = manifestVariantsProjection(results, FIGURE_PLAN);
    expect(m).toEqual([]);
  });

  it("returns an empty array for empty inputs", () => {
    expect(manifestVariantsProjection([], [])).toEqual([]);
  });
});
