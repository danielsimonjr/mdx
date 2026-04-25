/**
 * Tests for the picker validation layer.
 *
 * The DOM modal calls `validateXxx(formState, …context)` and only
 * proceeds on `{ok: true}`. We exercise every error branch here so
 * the modal layer can rely on the validator catching bad input.
 */
import { describe, it, expect } from "vitest";
import {
  validateCell,
  validateInclude,
  validateFig,
  validateCite,
  validateAssetPointer,
  collectExistingIds,
  collectBibliographyKeys,
} from "../src/renderer/directive-pickers.js";

describe("validateCell", () => {
  it("accepts a minimal valid form", () => {
    const r = validateCell({ language: "python", kernel: "python3" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.text).toContain("language=python kernel=python3");
  });

  it("rejects empty language", () => {
    const r = validateCell({ language: "  ", kernel: "python3" });
    expect(r).toEqual({ ok: false, field: "language", message: expect.any(String) });
  });

  it("rejects empty kernel", () => {
    const r = validateCell({ language: "r", kernel: "" });
    expect(r).toEqual({ ok: false, field: "kernel", message: expect.any(String) });
  });

  it("accepts execution_count = 0", () => {
    const r = validateCell({ language: "python", kernel: "python3", executionCount: 0 });
    expect(r.ok).toBe(true);
  });

  it("rejects negative execution_count", () => {
    const r = validateCell({ language: "python", kernel: "python3", executionCount: -1 });
    expect(r.ok).toBe(false);
  });

  it("rejects non-integer execution_count", () => {
    const r = validateCell({ language: "python", kernel: "python3", executionCount: 3.14 });
    expect(r.ok).toBe(false);
  });
});

describe("validateInclude", () => {
  it("accepts a target with no archive context", () => {
    const r = validateInclude({ target: "snippets/intro.md" }, null);
    expect(r.ok).toBe(true);
  });

  it("rejects empty target", () => {
    const r = validateInclude({ target: "" }, null);
    expect(r).toEqual({ ok: false, field: "target", message: expect.any(String) });
  });

  it("rejects absolute paths", () => {
    const r = validateInclude({ target: "/etc/passwd" }, null);
    expect(r.ok).toBe(false);
  });

  it("rejects path traversal", () => {
    const r = validateInclude({ target: "../secrets.md" }, null);
    expect(r.ok).toBe(false);
  });

  it("rejects target not in archive when entries provided", () => {
    const r = validateInclude({ target: "missing.md" }, ["other.md"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("not in the open archive");
  });

  it("accepts target present in archive entries", () => {
    const r = validateInclude({ target: "intro.md" }, ["intro.md", "ch1.md"]);
    expect(r.ok).toBe(true);
  });

  it("threads fragment + content_hash through", () => {
    const r = validateInclude(
      { target: "x.md", fragment: "intro", contentHash: "sha256-abc" },
      null,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.text).toContain("fragment=intro");
      expect(r.payload.text).toContain('content_hash="sha256-abc"');
    }
  });
});

describe("collectExistingIds", () => {
  it("returns empty sets for empty input", () => {
    const out = collectExistingIds("");
    expect(out.fig.size).toBe(0);
    expect(out.eq.size).toBe(0);
    expect(out.tab.size).toBe(0);
  });

  it("collects ids by directive kind", () => {
    const src = `
      ::fig{id=overview}
      Some prose.
      ::eq{id=energy-conservation}
      ::tab{id=results-2024}
      ::fig{id=summary class=highlight}
    `;
    const out = collectExistingIds(src);
    expect(out.fig).toEqual(new Set(["overview", "summary"]));
    expect(out.eq).toEqual(new Set(["energy-conservation"]));
    expect(out.tab).toEqual(new Set(["results-2024"]));
  });

  it("ignores directives without id=", () => {
    const out = collectExistingIds("::fig{class=foo}");
    expect(out.fig.size).toBe(0);
  });
});

describe("validateFig", () => {
  const empty = { fig: new Set<string>(), eq: new Set<string>(), tab: new Set<string>() };

  it("accepts a fresh id", () => {
    const r = validateFig({ kind: "fig", id: "overview" }, empty);
    expect(r.ok).toBe(true);
  });

  it("rejects empty id", () => {
    const r = validateFig({ kind: "fig", id: "" }, empty);
    expect(r.ok).toBe(false);
  });

  it("rejects ids starting with a digit", () => {
    const r = validateFig({ kind: "fig", id: "1-overview" }, empty);
    expect(r.ok).toBe(false);
  });

  it("rejects ids with whitespace or punctuation", () => {
    expect(validateFig({ kind: "fig", id: "ov view" }, empty).ok).toBe(false);
    expect(validateFig({ kind: "fig", id: "ov.view" }, empty).ok).toBe(false);
  });

  it("rejects collisions within the same kind", () => {
    const existing = { fig: new Set(["taken"]), eq: new Set<string>(), tab: new Set<string>() };
    const r = validateFig({ kind: "fig", id: "taken" }, existing);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("already in use");
  });

  it("allows the same id in different kinds", () => {
    const existing = { fig: new Set(["x"]), eq: new Set<string>(), tab: new Set<string>() };
    const r = validateFig({ kind: "eq", id: "x" }, existing);
    expect(r.ok).toBe(true);
  });
});

describe("collectBibliographyKeys", () => {
  it("returns an empty set for null input", () => {
    expect(collectBibliographyKeys(null).size).toBe(0);
  });

  it("returns an empty set for malformed JSON", () => {
    expect(collectBibliographyKeys("not json").size).toBe(0);
  });

  it("returns an empty set when JSON is not an array", () => {
    expect(collectBibliographyKeys('{"id": "smith2020"}').size).toBe(0);
  });

  it("collects ids from a CSL-JSON array", () => {
    const json = JSON.stringify([
      { id: "smith2020", title: "X" },
      { id: "jones2019", title: "Y" },
      { title: "no id" },
    ]);
    expect(collectBibliographyKeys(json)).toEqual(new Set(["smith2020", "jones2019"]));
  });
});

describe("validateCite", () => {
  it("accepts keys with no bibliography to check against", () => {
    const r = validateCite({ keys: ["smith2020"] }, null);
    expect(r.ok).toBe(true);
  });

  it("rejects an empty keys array", () => {
    const r = validateCite({ keys: [] }, null);
    expect(r.ok).toBe(false);
  });

  it("rejects keys not in bibliography when bibliography is non-empty", () => {
    const r = validateCite({ keys: ["nope"] }, new Set(["smith2020"]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("Unknown bibliography key");
  });

  it("falls back to permissive mode when bibliography is empty", () => {
    // Empty set means "no references.json present" — accept any key.
    const r = validateCite({ keys: ["anything"] }, new Set());
    expect(r.ok).toBe(true);
  });

  it("deduplicates while preserving order", () => {
    const r = validateCite({ keys: ["b", "a", "b", "c", "a"] }, null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.text).toBe("::cite[b,a,c]");
  });

  it("threads locator prefix and suffix", () => {
    const r = validateCite({ keys: ["x"], prefix: "see", suffix: "p. 42" }, null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.text).toContain('{prefix="see" suffix="p. 42"}');
  });
});

describe("validateAssetPointer", () => {
  it("accepts a valid mp4 for ::video", () => {
    const r = validateAssetPointer("video", { src: "assets/video/intro.mp4" }, null);
    expect(r.ok).toBe(true);
  });

  it("rejects empty src", () => {
    const r = validateAssetPointer("video", { src: "" }, null);
    expect(r.ok).toBe(false);
  });

  it("rejects absolute paths", () => {
    const r = validateAssetPointer("video", { src: "/etc/foo.mp4" }, null);
    expect(r.ok).toBe(false);
  });

  it("rejects path traversal", () => {
    const r = validateAssetPointer("audio", { src: "../leaked.mp3" }, null);
    expect(r.ok).toBe(false);
  });

  it("rejects mismatched extension for kind", () => {
    const r = validateAssetPointer("video", { src: "assets/images/x.png" }, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("supported ::video extension");
  });

  it("is case-insensitive on extensions", () => {
    expect(validateAssetPointer("video", { src: "assets/x.MP4" }, null).ok).toBe(true);
    expect(validateAssetPointer("audio", { src: "assets/x.WAV" }, null).ok).toBe(true);
  });

  it("rejects src not in archive when entries provided", () => {
    const r = validateAssetPointer("video", { src: "assets/missing.mp4" }, ["assets/x.mp4"]);
    expect(r.ok).toBe(false);
  });

  it("accepts src present in archive entries", () => {
    const r = validateAssetPointer("video", { src: "assets/x.mp4" }, ["assets/x.mp4"]);
    expect(r.ok).toBe(true);
  });

  it("threads attrs through to the builder", () => {
    const r = validateAssetPointer("video", {
      src: "assets/video/x.mp4",
      attrs: { poster: "assets/images/p.jpg", caption: "Demo video" },
    }, null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.text).toContain("poster=assets/images/p.jpg");
      // "Demo video" contains whitespace, so the brace formatter wraps in quotes.
      expect(r.payload.text).toContain('caption="Demo video"');
    }
  });

  it("strips empty attr values", () => {
    const r = validateAssetPointer("video", {
      src: "assets/x.mp4",
      attrs: { poster: "  ", caption: "" },
    }, null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.text).not.toContain("{");
  });

  // Per-kind extension matrix
  it.each([
    ["video", "assets/v/x.mp4", true],
    ["video", "assets/v/x.webm", true],
    ["video", "assets/v/x.mp3", false],
    ["audio", "assets/a/x.wav", true],
    ["audio", "assets/a/x.mp4", false],
    ["model", "assets/m/x.glb", true],
    ["model", "assets/m/x.gltf", true],
    ["model", "assets/m/x.png", false],
    ["embed", "assets/d/x.pdf", true],
    ["embed", "assets/d/x.docx", false],
    ["data", "assets/d/x.csv", true],
    ["data", "assets/d/x.json", true],
    ["data", "assets/d/x.xml", false],
  ] as const)("validateAssetPointer(%s, %s) → %s", (kind, src, expected) => {
    expect(validateAssetPointer(kind, { src }, null).ok).toBe(expected);
  });
});
