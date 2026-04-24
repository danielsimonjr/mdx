/**
 * Tests for `references.ts` — CSL-JSON parsing edge cases.
 */

import { describe, it, expect } from "vitest";
import { parseReferences, formatInlineCitation, type CslEntry } from "./references.js";

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe("parseReferences", () => {
  it("parses canonical CSL-JSON array form", () => {
    const json = JSON.stringify([
      { id: "a", title: "First", issued: { "date-parts": [[2020]] } },
      { id: "b", title: "Second", issued: { "date-parts": [[2021]] } },
    ]);
    const out = parseReferences(bytes(json));
    expect(out["a"]).toBeDefined();
    expect(out["b"]).toBeDefined();
    expect(out["a"].title).toBe("First");
  });

  it("accepts the id-keyed object form (Zotero exporter convention)", () => {
    // I2 from review: an object-keyed CSL JSON like
    //   {"smith2020": {...}, "jones2021": {...}}
    // is a common Zotero / pandoc-citeproc shape. The parser used to
    // reject it. Now both forms work.
    const json = JSON.stringify({
      "smith2020": { title: "T1", issued: { "date-parts": [[2020]] } },
      "jones2021": { title: "T2", issued: { "date-parts": [[2021]] } },
    });
    const out = parseReferences(bytes(json));
    expect(out["smith2020"]).toBeDefined();
    expect(out["smith2020"].id).toBe("smith2020"); // synthesized from outer key
    expect(out["jones2021"].title).toBe("T2");
  });

  it("returns empty record on malformed JSON", () => {
    const out = parseReferences(bytes("{ not valid json"));
    expect(out).toEqual({});
  });

  it("returns empty record on unsupported root type", () => {
    const out = parseReferences(bytes("\"just a string\""));
    expect(out).toEqual({});
  });

  it("returns empty record on empty bytes", () => {
    expect(parseReferences(new Uint8Array(0))).toEqual({});
  });
});

describe("issuedYear (via formatInlineCitation)", () => {
  // We exercise issuedYear indirectly through formatInlineCitation
  // since the helper itself is module-private.
  function citeYear(issued: unknown): string {
    const entry: CslEntry = {
      id: "x",
      author: [{ family: "Author", given: "A." }],
      issued: issued as never,
    };
    return formatInlineCitation(entry, "chicago-author-date");
  }

  it("accepts numeric year", () => {
    expect(citeYear({ "date-parts": [[2020]] })).toBe("Author 2020");
  });

  it("accepts string year (real-world feeds ship strings)", () => {
    // I3 from review: typeof === "number" was too strict.
    expect(citeYear({ "date-parts": [["2020"]] })).toBe("Author 2020");
  });

  it("accepts BCE / classics-era years (pre-1500, negative)", () => {
    // I3 from review: 1[5-9]\d{2}|20\d{2} regex was excluding pre-1500.
    expect(citeYear({ "date-parts": [[-350]] })).toBe("Author -350");
    expect(citeYear({ "date-parts": [[1492]] })).toBe("Author 1492");
  });

  it("falls back to literal-form year extraction", () => {
    expect(citeYear({ literal: "Spring 2020" })).toBe("Author 2020");
  });

  it("returns no-year format when issued is absent", () => {
    expect(citeYear(undefined)).toBe("Author");
  });
});
