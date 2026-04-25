/**
 * Tests for the annotation sidebar's pure HTML renderer
 * (Phase 2.3b.4.2).
 */
import { describe, it, expect } from "vitest";
import {
  buildThreads,
  findTrustWarnings,
  type Annotation,
} from "../src/renderer/annotations.js";
import {
  renderAnnotationSidebar,
  renderAnnotationThread,
  summarizeAnnotations,
} from "../src/renderer/annotations-render.js";

const REVIEWER_COMMENT: Annotation = {
  id: "annotations/r1.json",
  type: "Annotation",
  role: "reviewer",
  motivation: "commenting",
  body: { type: "TextualBody", value: "Sample size unclear." },
  target: { source: "document.md", selector: { type: "TextQuoteSelector", exact: "N=80 samples" } },
  creator: { id: "did:web:r1.example.com", name: "Reviewer 1" },
  created: "2026-04-12T09:00:00Z",
};

const AUTHOR_REPLY: Annotation = {
  id: "annotations/a1.json",
  type: "Annotation",
  role: "author",
  motivation: "replying",
  body: { type: "TextualBody", value: "Added justification in §3.2." },
  target: "annotations/r1.json",
  creator: { id: "did:web:author.example.com", name: "Jane Author" },
  created: "2026-04-14T10:00:00Z",
};

const EDITOR_DECISION: Annotation = {
  id: "annotations/e1.json",
  type: "Annotation",
  role: "editor",
  motivation: "review-accept",
  body: { type: "TextualBody", value: "Accepted with minor revisions." },
  target: { source: "document.md" },
  creator: { id: "did:web:editor.journal.com", name: "Editor" },
  created: "2026-04-20T15:30:00Z",
};

describe("renderAnnotationThread", () => {
  it("renders a single annotation with header, quote, and body", () => {
    const threads = buildThreads([REVIEWER_COMMENT]);
    const html = renderAnnotationThread(threads[0], []);
    expect(html).toContain("annotation-reviewer");
    expect(html).toContain("Reviewer 1");
    expect(html).toContain("Sample size unclear");
    expect(html).toContain("N=80 samples");
    expect(html).toContain("2026-04-12");
  });

  it("nests replies inside annotation-replies", () => {
    const threads = buildThreads([REVIEWER_COMMENT, AUTHOR_REPLY]);
    const html = renderAnnotationThread(threads[0], []);
    expect(html).toContain("annotation-replies");
    // Reply appears inside the parent's article.
    const parentEnd = html.lastIndexOf("</article>");
    const replyStart = html.indexOf("annotation-author");
    expect(replyStart).toBeGreaterThan(0);
    expect(replyStart).toBeLessThan(parentEnd);
  });

  it("escapes HTML in annotation bodies", () => {
    const evil: Annotation = {
      ...REVIEWER_COMMENT,
      body: { type: "TextualBody", value: "<script>alert(1)</script>" },
    };
    const html = renderAnnotationThread(buildThreads([evil])[0], []);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders editor decisions with a decision class", () => {
    const html = renderAnnotationThread(buildThreads([EDITOR_DECISION])[0], []);
    expect(html).toContain("decision-review-accept");
    expect(html).toContain("Accepted");
  });

  it("surfaces trust warnings on unsigned editor decisions", () => {
    const warnings = findTrustWarnings([EDITOR_DECISION], new Set());
    const html = renderAnnotationThread(buildThreads([EDITOR_DECISION])[0], warnings);
    expect(html).toContain("trust-error");
  });

  it("shows trust-ok when the creator is in the signed set", () => {
    const warnings = findTrustWarnings([EDITOR_DECISION], new Set(["did:web:editor.journal.com"]));
    const html = renderAnnotationThread(buildThreads([EDITOR_DECISION])[0], warnings);
    expect(html).toContain("trust-ok");
    expect(html).not.toContain("trust-error");
  });

  it("renders 'anonymous' creator when neither name nor id is present", () => {
    const anon: Annotation = { ...REVIEWER_COMMENT, creator: undefined };
    const html = renderAnnotationThread(buildThreads([anon])[0], []);
    expect(html).toContain("(anonymous)");
  });

  it("falls back to creator.id when name is absent", () => {
    const idOnly: Annotation = { ...REVIEWER_COMMENT, creator: { id: "did:web:opaque-hash-abc123" } };
    const html = renderAnnotationThread(buildThreads([idOnly])[0], []);
    expect(html).toContain("did:web:opaque-hash-abc123");
  });

  it("renders a Reply action button on root annotations (Phase 2.3b.4.3)", () => {
    const html = renderAnnotationThread(buildThreads([REVIEWER_COMMENT])[0], []);
    expect(html).toMatch(/data-annotation-action="reply"/);
    expect(html).toContain('aria-label="Reply to this annotation"');
  });

  it("does NOT render a Reply button on replies — chains stay flat", () => {
    const reply: Annotation = {
      ...REVIEWER_COMMENT,
      id: "annotations/reply-1.json",
      motivation: "replying",
      target: REVIEWER_COMMENT.id,
    };
    const threads = buildThreads([REVIEWER_COMMENT, reply]);
    const html = renderAnnotationThread(threads[0], []);
    // The root has one Reply button; the reply nested under it must not.
    const replyButtons = html.match(/data-annotation-action="reply"/g) ?? [];
    expect(replyButtons.length).toBe(1);
  });
});

describe("renderAnnotationSidebar", () => {
  it("renders the empty-state when no threads", () => {
    const html = renderAnnotationSidebar([], []);
    expect(html).toContain("No annotations");
  });

  it("renders multiple threads in order", () => {
    const a1: Annotation = { ...REVIEWER_COMMENT, id: "a", created: "2026-04-10T00:00:00Z" };
    const a2: Annotation = { ...REVIEWER_COMMENT, id: "b", created: "2026-04-15T00:00:00Z" };
    const html = renderAnnotationSidebar(buildThreads([a1, a2]), []);
    // a1 (earlier) appears before a2 in the sorted list.
    expect(html.indexOf('data-annotation-id="a"')).toBeLessThan(html.indexOf('data-annotation-id="b"'));
  });
});

describe("summarizeAnnotations", () => {
  it("reports 0 annotations for empty input", () => {
    expect(summarizeAnnotations([])).toBe("0 annotations");
  });

  it("counts roots + replies", () => {
    const summary = summarizeAnnotations(buildThreads([REVIEWER_COMMENT, AUTHOR_REPLY]));
    expect(summary).toContain("2 annotations");
    expect(summary).toContain("1 thread");
  });

  it("handles multi-thread documents", () => {
    const a: Annotation = { ...REVIEWER_COMMENT, id: "a" };
    const b: Annotation = { ...REVIEWER_COMMENT, id: "b" };
    const c: Annotation = { ...REVIEWER_COMMENT, id: "c" };
    const summary = summarizeAnnotations(buildThreads([a, b, c]));
    expect(summary).toContain("3 annotations");
    expect(summary).toContain("3 threads");
  });
});
