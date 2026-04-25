/**
 * Tests for the multi-locale data layer (Phase 2.3b.5).
 *
 * Covers manifest enumeration in both common shapes (string-form
 * and object-form locales), the add-locale planner's mutation
 * safety, and paragraph-slice / alignment behaviour.
 */
import { describe, it, expect } from "vitest";
import {
  enumerateLocales,
  planAddLocale,
  paragraphSlices,
  alignParagraphs,
} from "../src/renderer/locales.js";

describe("enumerateLocales", () => {
  it("returns an empty list for a null manifest", () => {
    expect(enumerateLocales(null)).toEqual([]);
    expect(enumerateLocales(undefined)).toEqual([]);
  });

  it("falls back to a single primary entry when locales block is absent", () => {
    const m = {
      document: { language: "en-US" },
      content: { entry_point: "doc.md" },
    };
    expect(enumerateLocales(m)).toEqual([
      { language: "en-US", path: "doc.md", primary: true },
    ]);
  });

  it("uses 'und' when document.language is missing in fallback", () => {
    expect(enumerateLocales({})).toEqual([
      { language: "und", path: "document.md", primary: true },
    ]);
  });

  it("handles string-form locale items", () => {
    const m = {
      content: {
        entry_point: "document.md",
        locales: { primary: "en-US", available: ["en-US", "es-ES"] },
      },
    };
    const r = enumerateLocales(m);
    expect(r).toEqual([
      { language: "en-US", path: "document.md", primary: true },
      { language: "es-ES", path: "document.es-ES.md", primary: false },
    ]);
  });

  it("handles object-form locale items", () => {
    const m = {
      content: {
        locales: {
          primary: "en-US",
          available: [
            { language: "en-US", path: "document.md" },
            { language: "fr-FR", path: "fr/main.md" },
          ],
        },
      },
    };
    const r = enumerateLocales(m);
    expect(r[1].path).toBe("fr/main.md");
  });

  it("marks first entry primary when no primary tag exists", () => {
    // Without a primary tag the path can't be promoted to entry_point —
    // we don't know which locale owns it. Each gets its conventional
    // `document.<lang>.md` path; only the `primary` flag is fixed up
    // so the UI has a default selection.
    const m = {
      content: { locales: { available: ["zh-CN", "ja-JP"] } },
    };
    const r = enumerateLocales(m);
    expect(r[0]).toEqual({ language: "zh-CN", path: "document.zh-CN.md", primary: true });
    expect(r[1].primary).toBe(false);
  });

  it("ignores malformed locale items", () => {
    const m = { content: { locales: { available: [null, 42, { language: "en-US" }] } } };
    const r = enumerateLocales(m as Record<string, unknown>);
    expect(r).toHaveLength(1);
    expect(r[0].language).toBe("en-US");
  });
});

describe("planAddLocale", () => {
  const base = {
    document: { language: "en-US" },
    content: {
      entry_point: "document.md",
      locales: { primary: "en-US", available: ["en-US"] },
    },
  };

  it("adds a new locale with a default path", () => {
    const r = planAddLocale(base, "es-ES");
    expect(r.newPath).toBe("document.es-ES.md");
    const locales = (r.manifest.content as Record<string, unknown>).locales as {
      available: Array<{ language: string; path: string }>;
    };
    expect(locales.available.map((e) => e.language)).toContain("es-ES");
  });

  it("does not mutate the input manifest", () => {
    const before = JSON.stringify(base);
    planAddLocale(base, "fr-FR");
    expect(JSON.stringify(base)).toBe(before);
  });

  it("rejects duplicates", () => {
    expect(() => planAddLocale(base, "en-US")).toThrow(/already/);
  });

  it("creates locales block when manifest had none", () => {
    const m = { document: { language: "en-US" }, content: { entry_point: "document.md" } };
    const r = planAddLocale(m, "es-ES");
    const content = r.manifest.content as Record<string, unknown>;
    expect(content.locales).toBeDefined();
  });
});

describe("paragraphSlices", () => {
  it("returns empty for empty source", () => {
    expect(paragraphSlices("")).toEqual([]);
    expect(paragraphSlices("\n\n\n")).toEqual([]);
  });

  it("splits paragraphs at blank lines", () => {
    const slices = paragraphSlices("First.\n\nSecond.\n\nThird paragraph.\n");
    expect(slices).toHaveLength(3);
    expect(slices.map((s) => s.text)).toEqual(["First.", "Second.", "Third paragraph."]);
  });

  it("reports 1-based startLine including blank-line offsets", () => {
    const slices = paragraphSlices("\n\nA.\n\nB.\n");
    expect(slices[0].startLine).toBe(3);
    expect(slices[1].startLine).toBe(5);
  });

  it("collects multi-line paragraphs", () => {
    const slices = paragraphSlices("Line one\nLine two\n\nNext.\n");
    expect(slices[0].text).toContain("Line one");
    expect(slices[0].text).toContain("Line two");
  });
});

describe("alignParagraphs", () => {
  it("pairs by index when lengths match", () => {
    const a = paragraphSlices("A.\n\nB.\n");
    const b = paragraphSlices("X.\n\nY.\n");
    expect(alignParagraphs(a, b)).toEqual([[0, 0], [1, 1]]);
  });

  it("pads with nulls when right is shorter", () => {
    const a = paragraphSlices("A.\n\nB.\n\nC.\n");
    const b = paragraphSlices("X.\n");
    expect(alignParagraphs(a, b)).toEqual([[0, 0], [1, null], [2, null]]);
  });

  it("pads with nulls when left is shorter", () => {
    const a = paragraphSlices("A.\n");
    const b = paragraphSlices("X.\n\nY.\n");
    expect(alignParagraphs(a, b)).toEqual([[0, 0], [null, 1]]);
  });

  it("returns empty for two empty inputs", () => {
    expect(alignParagraphs([], [])).toEqual([]);
  });
});
