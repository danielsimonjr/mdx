/**
 * Tests for the peer-review annotation data layer (Phase 2.3b.4).
 *
 * Coverage:
 *   - parseAnnotation: every required-field error branch
 *   - loadAnnotations: archive-entry walk + error tolerance
 *   - buildThreads: reply-chain construction with timestamp ordering
 *   - findTrustWarnings: signature-requirement enforcement per spec
 */
import { describe, it, expect } from "vitest";
import {
  parseAnnotation,
  loadAnnotations,
  buildThreads,
  findTrustWarnings,
  createAnnotation,
  filterAnnotationsForRole,
  DEFAULT_ANNOTATION_CONTEXT,
  type Annotation,
} from "../src/renderer/annotations.js";

const SAMPLE: Annotation = {
  "@context": "http://www.w3.org/ns/anno.jsonld",
  id: "annotations/r1-c1.json",
  type: "Annotation",
  role: "reviewer",
  motivation: "commenting",
  body: { type: "TextualBody", value: "Sample size?", format: "text/plain" },
  target: { source: "document.md", selector: { type: "TextQuoteSelector", exact: "N=80" } },
  creator: { id: "did:web:r1.example.com", name: "Reviewer 1" },
  created: "2026-04-12T09:00:00Z",
};

const enc = (s: string) => new TextEncoder().encode(s);

describe("parseAnnotation", () => {
  it("accepts a fully-valid annotation", () => {
    const r = parseAnnotation(JSON.stringify(SAMPLE), "annotations/r1-c1.json");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.annotation.role).toBe("reviewer");
  });

  it("rejects malformed JSON", () => {
    const r = parseAnnotation("{not json", "x.json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("(json)");
  });

  it("rejects non-object root", () => {
    const r = parseAnnotation('"string"', "x.json");
    expect(r.ok).toBe(false);
  });

  it("rejects wrong type", () => {
    const r = parseAnnotation(JSON.stringify({ ...SAMPLE, type: "Note" }), "x.json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("type");
  });

  it("rejects unknown role", () => {
    const r = parseAnnotation(
      JSON.stringify({ ...SAMPLE, role: "moderator" }),
      "x.json",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("role");
  });

  it("rejects unknown motivation", () => {
    const r = parseAnnotation(
      JSON.stringify({ ...SAMPLE, motivation: "hand-waving" }),
      "x.json",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("motivation");
  });

  it("accepts MDZ-extended motivations", () => {
    for (const m of [
      "review-accept",
      "review-reject",
      "review-request-changes",
      "review-confidential-comment",
    ]) {
      const r = parseAnnotation(JSON.stringify({ ...SAMPLE, motivation: m, role: "editor" }), "x.json");
      expect(r.ok).toBe(true);
    }
  });

  it("rejects missing target", () => {
    const { target: _, ...rest } = SAMPLE;
    const r = parseAnnotation(JSON.stringify(rest), "x.json");
    expect(r.ok).toBe(false);
  });

  it("rejects target object without source", () => {
    const r = parseAnnotation(
      JSON.stringify({ ...SAMPLE, target: { selector: SAMPLE.target } }),
      "x.json",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("target.source");
  });

  it("accepts string target (reply form)", () => {
    const r = parseAnnotation(
      JSON.stringify({ ...SAMPLE, motivation: "replying", target: "annotations/parent.json" }),
      "x.json",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.annotation.target).toBe("annotations/parent.json");
  });

  it("falls back to path as id when id is missing", () => {
    const { id: _, ...rest } = SAMPLE;
    const r = parseAnnotation(JSON.stringify(rest), "annotations/derived.json");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.annotation.id).toBe("annotations/derived.json");
  });
});

describe("loadAnnotations", () => {
  it("only walks annotations/*.json", () => {
    const entries = new Map<string, Uint8Array>([
      ["annotations/a.json", enc(JSON.stringify(SAMPLE))],
      ["annotations/b.json", enc(JSON.stringify({ ...SAMPLE, id: "annotations/b.json" }))],
      ["assets/images/x.png", new Uint8Array([1, 2, 3])],
      ["document.md", enc("# Doc")],
    ]);
    const r = loadAnnotations(entries);
    expect(r.annotations).toHaveLength(2);
    expect(r.errors).toEqual([]);
  });

  it("collects errors for malformed annotations without throwing", () => {
    const entries = new Map<string, Uint8Array>([
      ["annotations/good.json", enc(JSON.stringify(SAMPLE))],
      ["annotations/bad.json", enc("{not json")],
    ]);
    const r = loadAnnotations(entries);
    expect(r.annotations).toHaveLength(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].path).toBe("annotations/bad.json");
  });

  it("ignores non-.json paths under annotations/", () => {
    const entries = new Map<string, Uint8Array>([
      ["annotations/README.md", enc("# notes")],
    ]);
    expect(loadAnnotations(entries)).toEqual({ annotations: [], errors: [] });
  });
});

describe("buildThreads", () => {
  const root: Annotation = { ...SAMPLE, id: "annotations/r1.json", created: "2026-04-10T00:00:00Z" };
  const reply: Annotation = {
    ...SAMPLE,
    id: "annotations/a1.json",
    role: "author",
    motivation: "replying",
    target: "annotations/r1.json",
    created: "2026-04-12T00:00:00Z",
  };
  const reply2: Annotation = {
    ...SAMPLE,
    id: "annotations/r2.json",
    role: "reviewer",
    motivation: "replying",
    target: "annotations/a1.json",
    created: "2026-04-15T00:00:00Z",
  };

  it("nests replies under their parent", () => {
    const threads = buildThreads([reply, root, reply2]);
    expect(threads).toHaveLength(1);
    expect(threads[0].annotation.id).toBe("annotations/r1.json");
    expect(threads[0].replies).toHaveLength(1);
    expect(threads[0].replies[0].replies).toHaveLength(1);
  });

  it("sorts roots by created ascending", () => {
    const a: Annotation = { ...SAMPLE, id: "annotations/a.json", created: "2026-04-15T00:00:00Z" };
    const b: Annotation = { ...SAMPLE, id: "annotations/b.json", created: "2026-04-10T00:00:00Z" };
    const threads = buildThreads([a, b]);
    expect(threads.map((n) => n.annotation.id)).toEqual([
      "annotations/b.json",
      "annotations/a.json",
    ]);
  });

  it("treats annotations whose target id does not resolve as roots", () => {
    const orphan: Annotation = {
      ...SAMPLE,
      id: "annotations/orphan.json",
      motivation: "replying",
      target: "annotations/missing.json",
    };
    const threads = buildThreads([orphan]);
    expect(threads).toHaveLength(1);
    expect(threads[0].annotation.id).toBe("annotations/orphan.json");
  });

  it("places annotations missing `created` after dated ones", () => {
    const dated: Annotation = { ...SAMPLE, id: "annotations/d.json", created: "2026-04-10T00:00:00Z" };
    const undated: Annotation = { ...SAMPLE, id: "annotations/u.json", created: undefined };
    const threads = buildThreads([undated, dated]);
    expect(threads.map((n) => n.annotation.id)).toEqual([
      "annotations/d.json",
      "annotations/u.json",
    ]);
  });
});

describe("findTrustWarnings", () => {
  const editorAccept: Annotation = {
    ...SAMPLE,
    id: "annotations/edit-accept.json",
    role: "editor",
    motivation: "review-accept",
    creator: { id: "did:web:editor.journal.com" },
  };
  const reviewerComment: Annotation = {
    ...SAMPLE,
    id: "annotations/r1.json",
    role: "reviewer",
    creator: { id: "did:web:reviewer.example.com" },
  };
  const authorReply: Annotation = {
    ...SAMPLE,
    id: "annotations/a1.json",
    role: "author",
    motivation: "replying",
    target: "annotations/r1.json",
    creator: { id: "did:web:author.example.com" },
  };

  it("flags unsigned editor decisions as errors", () => {
    const warnings = findTrustWarnings([editorAccept], new Set());
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe("error");
  });

  it("does not flag a signed editor decision", () => {
    const warnings = findTrustWarnings(
      [editorAccept],
      new Set(["did:web:editor.journal.com"]),
    );
    expect(warnings).toEqual([]);
  });

  it("flags unsigned author + reviewer annotations as warnings", () => {
    const warnings = findTrustWarnings([reviewerComment, authorReply], new Set());
    expect(warnings.every((w) => w.severity === "warning")).toBe(true);
    expect(warnings.map((w) => w.annotationId).sort()).toEqual([
      "annotations/a1.json",
      "annotations/r1.json",
    ]);
  });

  it("does not flag annotations with a signed creator", () => {
    const signed = new Set([
      "did:web:reviewer.example.com",
      "did:web:author.example.com",
    ]);
    expect(findTrustWarnings([reviewerComment, authorReply], signed)).toEqual([]);
  });

  it("does not flag editor commenting motivations (only review-*)", () => {
    const editorComment: Annotation = { ...editorAccept, motivation: "commenting" };
    const warnings = findTrustWarnings([editorComment], new Set());
    expect(warnings.find((w) => w.severity === "error")).toBeUndefined();
  });
});

describe("createAnnotation", () => {
  const FIXED_UUID = "00000000-0000-4000-8000-000000000abc";
  const FIXED_DATE = new Date("2026-04-25T12:34:56.789Z");

  it("populates id, path, type, @context, and ISO-second timestamp", () => {
    const { annotation, path } = createAnnotation({
      role: "reviewer",
      motivation: "commenting",
      target: { source: "document.md", selector: { type: "TextQuoteSelector", exact: "abc" } },
      body: { type: "TextualBody", value: "needs review", format: "text/plain" },
      uuid: () => FIXED_UUID,
      now: () => FIXED_DATE,
    });
    expect(path).toBe(`annotations/${FIXED_UUID}.json`);
    expect(annotation.id).toBe(path);
    expect(annotation.type).toBe("Annotation");
    expect(annotation["@context"]).toBe(DEFAULT_ANNOTATION_CONTEXT);
    // Spec timestamp format: ISO-8601 second precision (no millis).
    expect(annotation.created).toBe("2026-04-25T12:34:56Z");
  });

  it("supports reply targets (string referencing parent annotation id)", () => {
    const parent = createAnnotation({
      role: "reviewer",
      motivation: "commenting",
      target: { source: "document.md" },
      uuid: () => "00000000-0000-4000-8000-000000000aaa",
      now: () => FIXED_DATE,
    });
    const reply = createAnnotation({
      role: "author",
      motivation: "replying",
      target: parent.annotation.id,
      body: { type: "TextualBody", value: "fixed in v2" },
      uuid: () => "00000000-0000-4000-8000-000000000bbb",
      now: () => FIXED_DATE,
    });
    expect(reply.annotation.target).toBe("annotations/00000000-0000-4000-8000-000000000aaa.json");
  });
});

describe("filterAnnotationsForRole", () => {
  const editorConfidential: Annotation = {
    id: "annotations/ec.json",
    type: "Annotation",
    role: "editor",
    motivation: "review-confidential-comment",
    target: { source: "document.md" },
  };
  const editorRequestChanges: Annotation = {
    id: "annotations/erc.json",
    type: "Annotation",
    role: "editor",
    motivation: "review-request-changes",
    target: { source: "document.md" },
  };
  const editorAccept: Annotation = {
    id: "annotations/ea.json",
    type: "Annotation",
    role: "editor",
    motivation: "review-accept",
    target: { source: "document.md" },
  };
  const reviewerComment: Annotation = {
    id: "annotations/rc.json",
    type: "Annotation",
    role: "reviewer",
    motivation: "commenting",
    target: { source: "document.md" },
  };

  const all = [editorConfidential, editorRequestChanges, editorAccept, reviewerComment];

  it("editor role sees everything", () => {
    expect(filterAnnotationsForRole(all, "editor")).toHaveLength(4);
  });

  it("public role drops confidential + in-progress editorial deliberation", () => {
    const visible = filterAnnotationsForRole(all, "public");
    const ids = visible.map((a) => a.id).sort();
    expect(ids).toEqual(["annotations/ea.json", "annotations/rc.json"]);
  });

  it("does not mutate the input array", () => {
    const before = all.length;
    filterAnnotationsForRole(all, "public");
    expect(all.length).toBe(before);
  });
});
