/**
 * Tests for the v2.1 directive renderer: `::fig` / `::eq` / `::tab` /
 * `::ref` / `::cite` / `::bibliography`.
 *
 * Two layers:
 *   1. Direct unit tests on `processDirectives` — assert the pre-marked
 *      transform produces the expected HTML islands.
 *   2. End-to-end via `renderMarkdown` — confirms the islands survive
 *      `marked.parse` + the sanitizer.
 *
 * The sanitizer requires DOMParser; provided by linkedom in the
 * test runner via the existing beforeAll polyfill in render.test.ts.
 * Importing this file separately means we re-run the polyfill setup.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { processDirectives } from "./directives.js";
import { renderMarkdown } from "./render.js";
import type { CslEntry } from "./references.js";

beforeAll(async () => {
  if (typeof DOMParser === "undefined") {
    const { DOMParser: LinkeDOMParser } = await import("linkedom");
    (globalThis as unknown as { DOMParser: unknown }).DOMParser = LinkeDOMParser;
  }
});

const NO_REFS = {} as Readonly<Record<string, CslEntry>>;

// ---------------------------------------------------------------------------
// ::fig / ::eq / ::tab — labeling + numbering
// ---------------------------------------------------------------------------

describe("labeled blocks", () => {
  it("numbers ::fig sequentially per kind", () => {
    const md = `
::fig{id=a}

caption A

::fig{id=b}

caption B
`;
    const out = processDirectives(md, { references: NO_REFS });
    expect(out).toContain('id="a"');
    expect(out).toContain("Figure 1");
    expect(out).toContain('id="b"');
    expect(out).toContain("Figure 2");
  });

  it("numbers ::fig and ::eq independently", () => {
    const md = `
::fig{id=f1}

x

::eq{id=e1}

y

::fig{id=f2}

z
`;
    const out = processDirectives(md, { references: NO_REFS });
    expect(out).toContain("Figure 1");
    expect(out).toContain("Equation 1");
    expect(out).toContain("Figure 2");
    expect(out).not.toContain("Figure 3");
  });

  it("emits aria-labelledby for figures", () => {
    const md = `::fig{id=panel-a}\n\nbody`;
    const out = processDirectives(md, { references: NO_REFS });
    expect(out).toContain('aria-labelledby="panel-a-caption"');
  });

  it("emits role=math for equations", () => {
    const md = `::eq{id=schrodinger}\n\nbody`;
    const out = processDirectives(md, { references: NO_REFS });
    expect(out).toContain('role="math"');
    expect(out).toContain('aria-label="Equation 1"');
  });

  it("comments out ::fig with no id (visible miss in HTML inspector)", () => {
    const out = processDirectives(`::fig{}\n\nbody`, { references: NO_REFS });
    expect(out).toContain("<!-- mdz-fig: missing id -->");
  });

  it("rejects quoted ids that violate the strict charset", () => {
    // C1 from review: a quoted form like id="javascript:alert(1)" or
    // id="foo bar" must NOT be accepted. parseId returns null on
    // charset failure → renders as a missing-id comment.
    for (const bad of [
      `::fig{id="foo bar"}\n\nbody`,
      `::fig{id="javascript:alert(1)"}\n\nbody`,
      `::fig{id="has<script>tag"}\n\nbody`,
      `::fig{id="9starts-with-digit"}\n\nbody`,
    ]) {
      const out = processDirectives(bad, { references: NO_REFS });
      expect(out, `bad input: ${bad}`).toContain("<!-- mdz-fig: missing id -->");
      expect(out, `bad input: ${bad}`).not.toContain('id="foo bar"');
      expect(out, `bad input: ${bad}`).not.toContain("javascript:");
    }
  });

  it("renders ::tab labeled block with mdz-tab class", () => {
    const md = `::tab{id=results}\n\nrows`;
    const out = processDirectives(md, { references: NO_REFS });
    expect(out).toContain('class="mdz-tab"');
    expect(out).toContain("Table 1");
    expect(out).toContain('id="results"');
  });
});

// ---------------------------------------------------------------------------
// ::ref — cross-references
// ---------------------------------------------------------------------------

describe("cross references", () => {
  it("resolves ::ref[id] to the labeled block's number", () => {
    const md = `
::fig{id=f1}

body

See ::ref[f1] for details.
`;
    const out = processDirectives(md, { references: NO_REFS });
    expect(out).toContain('href="#f1"');
    expect(out).toContain(">Figure 1<");
  });

  it("renders a visible miss marker for unknown refs", () => {
    const out = processDirectives("See ::ref[ghost] for details.", { references: NO_REFS });
    expect(out).toContain("[?ghost]");
    expect(out).toContain("mdz-ref-missing");
  });

  it("resolves ::ref to ::eq and ::tab targets, not just ::fig", () => {
    const md = `
::eq{id=schrodinger}

body

::tab{id=t1}

rows

See ::ref[schrodinger] and ::ref[t1].
`;
    const out = processDirectives(md, { references: NO_REFS });
    expect(out).toContain('href="#schrodinger"');
    expect(out).toContain(">Equation 1<");
    expect(out).toContain('href="#t1"');
    expect(out).toContain(">Table 1<");
  });

  it("passes non-ASCII cite/ref keys through as literal text (ABNF-conformant)", () => {
    // I1 from review: non-ASCII keys are out of grammar. The viewer
    // does NOT silently drop them — they survive as plain text in the
    // rendered output, visible to the author.
    const md = "Cite ::cite[müller2020] and ::ref[张2021].";
    const out = processDirectives(md, { references: NO_REFS });
    expect(out).toContain("::cite[müller2020]");
    expect(out).toContain("::ref[张2021]");
  });

  it("survives end-to-end through marked + sanitizer", async () => {
    const md = `
::fig{id=f1}

caption text

See ::ref[f1].
`;
    const html = renderMarkdown(md, {
      resolveAsset: () => null,
      references: NO_REFS,
    });
    expect(html).toContain('href="#f1"');
    expect(html).toContain("Figure 1");
    // Sanitizer keeps the figure wrapper.
    expect(html).toContain('id="f1"');
  });
});

// ---------------------------------------------------------------------------
// ::cite — inline citations
// ---------------------------------------------------------------------------

const SAMPLE_REFS: Readonly<Record<string, CslEntry>> = Object.freeze({
  "smith2020": {
    id: "smith2020",
    type: "article-journal",
    title: "Variant calling pipelines",
    author: [{ family: "Smith", given: "Jane" }],
    issued: { "date-parts": [[2020, 5, 12]] },
    "container-title": "Bioinformatics",
    volume: 36,
  },
  "jones2021": {
    id: "jones2021",
    type: "article-journal",
    title: "Reproducibility in genomics",
    author: [
      { family: "Jones", given: "A." },
      { family: "Patel", given: "R." },
    ],
    issued: { "date-parts": [[2021]] },
  },
  "etal2019": {
    id: "etal2019",
    type: "article-journal",
    title: "Three-author work",
    author: [
      { family: "Alpha", given: "A." },
      { family: "Beta", given: "B." },
      { family: "Gamma", given: "G." },
    ],
    issued: { "date-parts": [[2019]] },
  },
});

describe("inline citations", () => {
  it("renders single citation as 'Author Year'", () => {
    const out = processDirectives("Per ::cite[smith2020], the result holds.", {
      references: SAMPLE_REFS,
    });
    expect(out).toContain("Smith 2020");
    expect(out).toContain('href="#cite-smith2020"');
  });

  it("renders two-author citation as 'A & B Year'", () => {
    const out = processDirectives("See ::cite[jones2021].", {
      references: SAMPLE_REFS,
    });
    expect(out).toContain("Jones &amp; Patel 2021");
  });

  it("renders 3+ authors as 'First et al. Year'", () => {
    const out = processDirectives("From ::cite[etal2019].", {
      references: SAMPLE_REFS,
    });
    expect(out).toContain("Alpha et al. 2019");
  });

  it("renders multi-key citations grouped with semicolons", () => {
    const out = processDirectives("Both ::cite[smith2020,jones2021] agree.", {
      references: SAMPLE_REFS,
    });
    expect(out).toContain("(");
    expect(out).toContain(";");
    expect(out).toContain("Smith 2020");
    expect(out).toContain("Jones &amp; Patel 2021");
  });

  it("renders missing citation as visible [?key] marker", () => {
    const out = processDirectives("Bogus ::cite[ghost].", { references: SAMPLE_REFS });
    expect(out).toContain("[?ghost]");
    expect(out).toContain("mdz-cite-missing");
  });
});

// ---------------------------------------------------------------------------
// ::bibliography
// ---------------------------------------------------------------------------

describe("bibliography block", () => {
  it("emits an ordered list of cited references in citation order", () => {
    const md = `
First we cite ::cite[jones2021]. Later ::cite[smith2020].

::bibliography
`;
    const out = processDirectives(md, { references: SAMPLE_REFS });
    expect(out).toContain('class="mdz-bibliography"');
    // Citation order: jones2021 appears first in the text.
    const jonesIdx = out.indexOf("cite-jones2021");
    const smithIdx = out.indexOf("cite-smith2020");
    expect(jonesIdx).toBeGreaterThan(-1);
    expect(smithIdx).toBeGreaterThan(jonesIdx);
  });

  it("omits uncited references from the bibliography", () => {
    // smith2020 cited; jones2021 uncited.
    const md = `Cite ::cite[smith2020].\n\n::bibliography`;
    const out = processDirectives(md, { references: SAMPLE_REFS });
    expect(out).toContain("cite-smith2020");
    expect(out).not.toContain("cite-jones2021");
  });

  it("emits empty marker when no citations exist", () => {
    const out = processDirectives("Just text.\n\n::bibliography", {
      references: SAMPLE_REFS,
    });
    expect(out).toContain("mdz-bibliography-empty");
  });

  it("formats journal-article entry with title, container, volume", () => {
    const md = `Cite ::cite[smith2020].\n\n::bibliography`;
    const out = processDirectives(md, { references: SAMPLE_REFS });
    expect(out).toContain("Smith, J.");
    expect(out).toContain("(2020)");
    expect(out).toContain("Variant calling pipelines");
    expect(out).toContain("Bioinformatics");
  });

  it("formats anonymous entries (no author) with title leading", () => {
    // I4 from review: a CSL entry with no `author` field starts the
    // bibliography line with the title (or year), not an empty author
    // block. Inline cite uses `title` as the label.
    const refs: Readonly<Record<string, CslEntry>> = Object.freeze({
      "anon2020": {
        id: "anon2020",
        type: "report",
        title: "WHO COVID-19 situation report",
        issued: { "date-parts": [[2020]] },
      },
    });
    const md = `Per ::cite[anon2020] guidance.\n\n::bibliography`;
    const out = processDirectives(md, { references: refs });
    // Inline citation falls back to title since there's no author.
    expect(out).toContain("WHO COVID-19 situation report");
    // Bibliography entry should NOT lead with an empty-author artifact.
    expect(out).not.toMatch(/^\.\s/m);
    expect(out).toContain("(2020)");
  });
});

// ---------------------------------------------------------------------------
// End-to-end through the full render pipeline
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ::include — archive-aware resolution (Milestone F)
// ---------------------------------------------------------------------------

function makeEntries(map: Record<string, string>): Map<string, Uint8Array> {
  const m = new Map<string, Uint8Array>();
  const enc = new TextEncoder();
  for (const [k, v] of Object.entries(map)) {
    m.set(k, enc.encode(v));
  }
  return m;
}

describe("::include archive-aware resolution", () => {
  it("inlines a target's content as markdown", () => {
    const entries = makeEntries({ "methods.md": "Methods body text." });
    const md = "Intro.\n\n::include[target=methods.md]\n\nOutro.";
    const out = processDirectives(md, { references: NO_REFS, archiveEntries: entries });
    expect(out).toContain("Methods body text.");
    expect(out).toContain('class="mdz-include"');
    expect(out).toContain('aria-label="included from methods.md"');
  });

  it("renders a visible miss marker when target is not in the archive", () => {
    const out = processDirectives("::include[target=ghost.md]", {
      references: NO_REFS,
      archiveEntries: new Map(),
    });
    expect(out).toContain("mdz-include-missing");
    expect(out).toContain("not found in archive");
    expect(out).toContain("ghost.md");
  });

  it("renders a miss marker when target attribute is absent", () => {
    const out = processDirectives("::include[]", {
      references: NO_REFS,
      archiveEntries: new Map(),
    });
    expect(out).toContain("mdz-include-missing");
    expect(out).toContain("missing target");
  });

  it("recursively inlines includes (A includes B; B has body)", () => {
    const entries = makeEntries({
      "a.md": "Section A start.\n\n::include[target=b.md]\n\nSection A end.",
      "b.md": "Body of B.",
    });
    const out = processDirectives("Outer.\n\n::include[target=a.md]", {
      references: NO_REFS,
      archiveEntries: entries,
    });
    expect(out).toContain("Section A start.");
    expect(out).toContain("Body of B.");
    expect(out).toContain("Section A end.");
  });

  it("detects cycles and emits a visible cycle marker", () => {
    const entries = makeEntries({
      "a.md": "::include[target=b.md]",
      "b.md": "::include[target=a.md]",
    });
    const out = processDirectives("::include[target=a.md]", {
      references: NO_REFS,
      archiveEntries: entries,
    });
    expect(out).toContain("include cycle detected");
    expect(out).toMatch(/a\.md.*b\.md.*a\.md/);
  });

  it("caps recursion depth (MAX_INCLUDE_DEPTH=10)", () => {
    // Build a 15-deep chain.
    const entries = new Map<string, Uint8Array>();
    const enc = new TextEncoder();
    for (let i = 0; i < 15; i++) {
      const next = i + 1 === 15 ? "leaf" : `::include[target=ch${i + 1}.md]`;
      entries.set(`ch${i}.md`, enc.encode(next));
    }
    const out = processDirectives("::include[target=ch0.md]", {
      references: NO_REFS,
      archiveEntries: entries,
    });
    expect(out).toContain("MAX_INCLUDE_DEPTH=10");
  });

  it("refuses external (URL) includes without a content_hash", () => {
    const out = processDirectives(
      "::include[target=https://example.com/methods.md]",
      { references: NO_REFS, archiveEntries: new Map() },
    );
    expect(out).toContain("mdz-include-missing");
    expect(out).toContain("requires content_hash");
  });

  it("emits a pending placeholder for external includes WITH content_hash", () => {
    const out = processDirectives(
      `::include[target=https://example.com/methods.md]{content_hash="sha256:abc"}`,
      { references: NO_REFS, archiveEntries: new Map() },
    );
    expect(out).toContain("mdz-include-pending");
    expect(out).toContain("sha256:abc");
    expect(out).not.toContain("mdz-include-missing");
  });

  it("flags fragment-bearing includes as fragment-unsupported (v0.1 honest gap)", () => {
    const entries = makeEntries({ "methods.md": "Body." });
    const out = processDirectives(
      `::include[target=methods.md fragment=intro]`,
      { references: NO_REFS, archiveEntries: entries },
    );
    expect(out).toContain("mdz-include-fragment-unsupported");
  });

  it("post-include cells + cross-refs work — included content participates in numbering", () => {
    const entries = makeEntries({
      "methods.md": [
        "::fig{id=hist}",
        "",
        "Histogram body.",
      ].join("\n"),
    });
    const md = [
      "::include[target=methods.md]",
      "",
      "See ::ref[hist].",
    ].join("\n");
    const out = processDirectives(md, { references: NO_REFS, archiveEntries: entries });
    expect(out).toContain('href="#hist"');
    expect(out).toContain(">Figure 1<");
  });

  it("end-to-end: included content survives marked + sanitizer", () => {
    const entries = makeEntries({
      "intro.md": "# Intro\n\nThe **introduction** body.",
    });
    const html = renderMarkdown("::include[target=intro.md]", {
      resolveAsset: () => null,
      references: {},
      archiveEntries: entries,
    });
    expect(html).toContain("mdz-include");
    expect(html).toContain("introduction");
    expect(html).toContain("<strong");
  });
});

// ---------------------------------------------------------------------------
// ::cell + ::output (Milestone E)
// ---------------------------------------------------------------------------

describe("cell + output blocks", () => {
  const CELL_MD = [
    "::cell{language=python kernel=python3 execution_count=1}",
    "",
    "```python",
    "import numpy as np",
    "print(np.ones(3))",
    "```",
  ].join("\n");

  it("renders a cell as <div class='mdz-cell ...'><pre><code>", () => {
    const out = processDirectives(CELL_MD, { references: NO_REFS });
    expect(out).toContain('class="mdz-cell mdz-cell-lang-python mdz-cell-kernel-python3 mdz-cell-exec-1"');
    expect(out).toContain('<pre class="mdz-cell-source">');
    expect(out).toContain('<code class="language-python">');
    expect(out).toContain("import numpy as np");
  });

  it("escapes cell source — no XSS via TeX-like content", () => {
    const md = [
      "::cell{language=html}",
      "",
      "```html",
      "<script>alert(1)</script>",
      "```",
    ].join("\n");
    const out = processDirectives(md, { references: NO_REFS });
    expect(out).not.toMatch(/<script[^>]*>alert/i);
    expect(out).toContain("&lt;script&gt;");
  });

  it("emits an aria-label naming language + kernel + exec count", () => {
    const out = processDirectives(CELL_MD, { references: NO_REFS });
    expect(out).toMatch(/aria-label="python cell, kernel python3, execution count 1"/);
  });

  it("preserves cell id when present", () => {
    const md = [
      "::cell{id=fig1-source language=python}",
      "",
      "```python",
      "x = 1",
      "```",
    ].join("\n");
    const out = processDirectives(md, { references: NO_REFS });
    expect(out).toContain('id="fig1-source"');
  });

  it("rejects malformed quoted ids on cells (charset enforcement)", () => {
    // Same charset rule that ::fig uses applies to cells.
    const md = [
      `::cell{id="bad space" language=python}`,
      "",
      "```python",
      "x",
      "```",
    ].join("\n");
    const out = processDirectives(md, { references: NO_REFS });
    expect(out).not.toContain('id="bad space"');
  });

  it("falls back to fenced-block lang when directive omits language=", () => {
    const md = [
      "::cell{kernel=ir}",
      "",
      "```r",
      "summary(x)",
      "```",
    ].join("\n");
    const out = processDirectives(md, { references: NO_REFS });
    expect(out).toContain("mdz-cell-lang-r");
    expect(out).toContain('<code class="language-r">');
  });

  it("renders a stream output block", () => {
    const md = [
      "::output{type=text}",
      "",
      "```",
      "[1. 1. 1.]",
      "```",
    ].join("\n");
    const out = processDirectives(md, { references: NO_REFS });
    expect(out).toContain('class="mdz-output mdz-output-text"');
    expect(out).toContain("[1. 1. 1.]");
  });

  it("renders an image-output standalone form", () => {
    const md = `::output{type=image src=assets/images/plot.png alt="Histogram"}`;
    const out = processDirectives(md, { references: NO_REFS });
    expect(out).toContain('class="mdz-output mdz-output-image"');
    expect(out).toContain('src="assets/images/plot.png"');
    expect(out).toContain('alt="Histogram"');
  });

  it("emits empty-image marker for image output without src", () => {
    const md = `::output{type=image}`;
    const out = processDirectives(md, { references: NO_REFS });
    expect(out).toContain("mdz-output-empty");
    expect(out).not.toContain("<img");
  });

  it("does not consume a fenced block following non-cell prose", () => {
    // Regression guard: the multi-line regex must NOT eat fenced
    // blocks that follow prose (or any non-`::cell{...}` line).
    const md = [
      "Just some prose.",
      "",
      "```python",
      "x = 1",
      "```",
    ].join("\n");
    const out = processDirectives(md, { references: NO_REFS });
    expect(out).not.toContain("mdz-cell");
    // Original fenced block still in markdown form for marked to handle.
    expect(out).toContain("```python");
  });

  it("end-to-end: cells + outputs survive marked + sanitizer", () => {
    const md = [
      "# Demo",
      "",
      CELL_MD,
      "",
      "::output{type=text}",
      "",
      "```",
      "[1. 1. 1.]",
      "```",
    ].join("\n");
    const html = renderMarkdown(md, {
      resolveAsset: () => null,
      references: NO_REFS,
    });
    expect(html).toContain("mdz-cell");
    expect(html).toContain("mdz-output");
    // Sanitizer keeps <pre> + <code> + <div> + <span>.
    expect(html).toMatch(/<pre[^>]*>/);
    expect(html).toMatch(/<code[^>]*>/);
  });
});

describe("end-to-end render pipeline", () => {
  it("preserves directive HTML islands through marked + sanitizer", () => {
    const md = `
# Paper

We cite ::cite[smith2020].

::fig{id=f1}

The figure body.

See ::ref[f1] for the result.

::bibliography
`;
    const html = renderMarkdown(md, {
      resolveAsset: () => null,
      references: SAMPLE_REFS,
    });
    expect(html).toContain("Figure 1");
    expect(html).toContain('href="#f1"');
    expect(html).toContain("Smith 2020");
    expect(html).toContain('class="mdz-bibliography"');
    // The sanitizer must NOT have stripped the cite/figure islands.
    expect(html).toContain("<cite");
    expect(html).toContain("<figure");
  });

  it("does not leak script through the cite path even if a key looks malicious", () => {
    const evilRefs: Readonly<Record<string, CslEntry>> = Object.freeze({
      "x": {
        id: "x",
        title: '<script>alert(1)</script>',
        author: [{ family: '<img onerror="alert(1)">', given: "X" }],
        issued: { "date-parts": [[2020]] },
      },
    });
    const html = renderMarkdown("Cite ::cite[x].\n\n::bibliography", {
      resolveAsset: () => null,
      references: evilRefs,
    });
    // No executable <script> tag should survive (escaped text is fine).
    expect(html).not.toMatch(/<script[^>]*>/i);
    // No live event handler attribute. We tolerate the literal substring
    // "onerror" inside escaped text ("&lt;img onerror=...&gt;") — that's
    // text content, not an attribute, and cannot fire. The regex below
    // matches `onerror=` only when it's preceded by something that
    // would make it an attribute (whitespace inside a tag), not when
    // preceded by `&lt;` which means it's text.
    expect(html).not.toMatch(/<[^>]*\sonerror\s*=/i);
  });
});
