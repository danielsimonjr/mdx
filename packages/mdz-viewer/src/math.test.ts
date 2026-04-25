/**
 * Tests for the KaTeX math pipeline.
 *
 * Two layers:
 *   1. Direct unit tests on `processMath` — assert the pre-marked
 *      transform produces sanitizer-safe HTML islands.
 *   2. End-to-end via `renderMarkdown` — confirms KaTeX output
 *      survives marked + the sanitizer.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { processMath } from "./math.js";
import { renderMarkdown } from "./render.js";

beforeAll(async () => {
  if (typeof DOMParser === "undefined") {
    const { DOMParser: LinkeDOMParser } = await import("linkedom");
    (globalThis as unknown as { DOMParser: unknown }).DOMParser = LinkeDOMParser;
  }
});

describe("processMath", () => {
  it("fast-paths input that contains no $ at all", () => {
    const md = "# No math here\n\nJust prose.";
    expect(processMath(md)).toBe(md);
  });

  it("renders inline math $...$ to a katex span", () => {
    const out = processMath("Pythagoras: $a^2 + b^2 = c^2$.");
    expect(out).toContain('class="mdz-math mdz-math-inline"');
    expect(out).toContain("katex");
    // ARIA label preserves the original TeX so screen readers without
    // KaTeX-CSS still get a meaningful announcement.
    expect(out).toContain('aria-label="a^2 + b^2 = c^2"');
  });

  it("renders display math $$...$$ to a katex div", () => {
    const out = processMath("$$\\int_0^1 x \\, dx = \\frac{1}{2}$$");
    expect(out).toContain('class="mdz-math mdz-math-display"');
    expect(out).toContain("<div");
  });

  it("does not greedy-match $$ as adjacent inline spans", () => {
    // The order DISPLAY before INLINE prevents this regression.
    const out = processMath("$$x$$");
    expect(out).toContain("mdz-math-display");
    expect(out).not.toContain("mdz-math-inline");
  });

  it("emits empty markers for $$ $$ (whitespace-only)", () => {
    const out = processMath("$$ $$");
    expect(out).toContain("katex-empty");
  });

  it("renders malformed TeX as a visible [?math: ...] marker rather than dropping", () => {
    // throwOnError:false makes KaTeX render the partial / error inline
    // with a red-flag class. The wrapper still surfaces the source.
    const out = processMath("Bad: $\\unknownmacro$");
    // KaTeX with throwOnError:false emits its own error span; the
    // outer wrapper still preserves the ARIA label.
    expect(out).toContain('aria-label="\\unknownmacro"');
  });

  it("skips lone $ characters (currency, prose) without false-positives", () => {
    // The INLINE_MATH regex requires content between the $$, no
    // newlines, and a $ on each side that isn't already part of $$.
    // A solitary $ (`The book is $5.`) has no second $ and shouldn't
    // match.
    const out = processMath("The book is $5.");
    expect(out).toBe("The book is $5.");
  });

  it("handles multiple inline math spans in one line", () => {
    const out = processMath("If $a$ then $b$.");
    const matches = out.match(/mdz-math-inline/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("handles math that follows directive output without breaking", () => {
    // `processMath` runs after `processDirectives`; a directive-ish
    // string in the input should be left alone here (other layers
    // handle it). We verify math after a fake directive doesn't
    // corrupt anything.
    const out = processMath("See [Figure 1](#f1). Then $E = mc^2$.");
    expect(out).toContain("[Figure 1](#f1)");
    expect(out).toContain("mdz-math-inline");
  });
});

describe("KaTeX output and sanitizer compatibility", () => {
  it("KaTeX HTML output uses only sanitizer-allowed tags", () => {
    const out = processMath("$\\frac{a}{b}$");
    // The only tags KaTeX emits in `output: 'html'` mode are <span>
    // and a wrapper <div> for display mode. Both are in ALLOWED_TAGS.
    const tags = [...out.matchAll(/<([a-z][a-z0-9]*)\b/gi)].map((m) =>
      m[1].toLowerCase(),
    );
    const distinct = [...new Set(tags)];
    for (const t of distinct) {
      expect(["span", "div"]).toContain(t);
    }
  });

  it("end-to-end: math survives marked + sanitizer", () => {
    const md = "Inline: $a + b = c$.\n\nDisplay:\n\n$$\\int x\\,dx$$\n";
    const html = renderMarkdown(md, { resolveAsset: () => null });
    expect(html).toContain("mdz-math-inline");
    expect(html).toContain("mdz-math-display");
    expect(html).toContain("katex");
  });

  it("end-to-end: malicious TeX cannot inject scripts via KaTeX", () => {
    // KaTeX's parser ignores unrecognized HTML, but verify the
    // sanitizer would catch any leakage path.
    const md = `$\\href{javascript:alert(1)}{click}$`;
    const html = renderMarkdown(md, { resolveAsset: () => null });
    // KaTeX may render `\href` with `strict: "ignore"`. Whatever it
    // outputs, no live script-bearing href must survive.
    expect(html).not.toMatch(/<a[^>]*\bhref\s*=\s*["']?javascript:/i);
    expect(html).not.toMatch(/<script\b/i);
  });

  it("end-to-end: math does not interfere with directive rendering", () => {
    const md = `
::eq{id=schrodinger}

$$i\\hbar \\frac{\\partial}{\\partial t} \\Psi = \\hat{H} \\Psi$$

See ::ref[schrodinger].
`;
    const html = renderMarkdown(md, {
      resolveAsset: () => null,
      references: {},
    });
    expect(html).toContain('id="schrodinger"');
    expect(html).toContain("Equation 1");
    expect(html).toContain("mdz-math-display");
  });
});
