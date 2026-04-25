/**
 * Tests for the pure diff renderer (Phase 2.3b.3.2). The DOM-side
 * modal is exercised by Phase 2.3a.7 Playwright; here we only
 * verify the HTML-string output is well-formed and carries the
 * right CSS hooks.
 */
import { describe, it, expect } from "vitest";
import { tokenizeBlocks, diffBlocks } from "../src/renderer/block-diff.js";
import {
  renderBlockOp,
  renderBlockOps,
  renderDiffStats,
} from "../src/renderer/diff-render.js";

describe("renderBlockOps", () => {
  it("renders an empty-changes message for identical sources", () => {
    const left = tokenizeBlocks("# A\n");
    const right = tokenizeBlocks("# A\n");
    const html = renderBlockOps(diffBlocks(left, right));
    expect(html).toContain("block-diff");
    // All-equal renders as block-equal, not the empty-state.
    expect(html).toContain("block-equal");
  });

  it("renders the empty-state placeholder for an empty op list", () => {
    expect(renderBlockOps([])).toContain("No changes");
  });

  it("escapes HTML in block content", () => {
    const left = tokenizeBlocks("<script>alert(1)</script>\n");
    const right = tokenizeBlocks("<img src=x onerror=alert(1)>\n");
    const html = renderBlockOps(diffBlocks(left, right));
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });

  it("renders added blocks with block-added class", () => {
    const ops = diffBlocks(tokenizeBlocks("# A\n"), tokenizeBlocks("# A\n\nNew.\n"));
    const html = renderBlockOps(ops);
    expect(html).toContain("block-added");
  });

  it("renders removed blocks with block-removed class", () => {
    const ops = diffBlocks(tokenizeBlocks("# A\n\nB.\n"), tokenizeBlocks("# A\n"));
    const html = renderBlockOps(ops);
    expect(html).toContain("block-removed");
  });

  it("renders modified blocks with an inline line-diff", () => {
    const left = tokenizeBlocks("::fig{id=overview}\nOld body.\n");
    const right = tokenizeBlocks("::fig{id=overview}\nNew body.\n");
    const html = renderBlockOps(diffBlocks(left, right));
    expect(html).toContain("block-modified");
    expect(html).toContain("line-removed");
    expect(html).toContain("line-added");
  });

  it("renders heading labels with friendly text", () => {
    const left = tokenizeBlocks("# Sample paper\n");
    const html = renderBlockOps(diffBlocks(left, left));
    expect(html).toContain("Sample paper");
  });

  it("renders directive labels with id attribute", () => {
    const left = tokenizeBlocks("::fig{id=overview}\nBody.\n");
    const html = renderBlockOps(diffBlocks(left, left));
    expect(html).toContain("::fig");
    expect(html).toContain("overview");
  });
});

describe("renderBlockOp", () => {
  it("preserves block text inside a <pre><code> wrapper", () => {
    const blocks = tokenizeBlocks("simple paragraph\n");
    const html = renderBlockOp({ op: "equal", left: blocks[0], right: blocks[0] });
    expect(html).toContain("<pre><code>");
    expect(html).toContain("simple paragraph");
  });
});

describe("renderDiffStats", () => {
  it("counts each op type", () => {
    const left = tokenizeBlocks("# A\n\nP1.\n\n# C\n");
    const right = tokenizeBlocks("# A\n\nP2.\n\nNew.\n");
    const stats = renderDiffStats(diffBlocks(left, right));
    // Format: "+N / -N / ~N / =N"
    expect(stats).toMatch(/\+\d+ \/ -\d+ \/ ~\d+ \/ =\d+/);
  });

  it("renders zeros for an empty op list", () => {
    expect(renderDiffStats([])).toContain("+0 / -0 / ~0 / =0");
  });
});
