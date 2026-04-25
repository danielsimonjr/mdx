/**
 * Phase 4.6.9 security audit: verify the `data-mdz-cell-source`
 * attribute escapes round-trip correctly when JS reads them back
 * via `element.dataset.mdzCellSource`.
 *
 * The attack model: a malicious cell source contains characters
 * that, if interpolated unescaped into an HTML attribute, would
 * either (a) close the attribute / tag and inject markup, or
 * (b) survive into the dataset read in a way that lets the
 * downstream "Run cell" handler execute attacker-controlled code.
 *
 * What we test:
 *   1. Five-char escape applied to attribute (& < > " ').
 *   2. dataset.X round-trips entity-decoded UTF-8 correctly.
 *   3. U+2028 / U+2029 line-separator chars don't break the
 *      attribute (browsers tolerate them inside attrs but they
 *      can break a string-comparison if the test code differs
 *      from the production read).
 *   4. Attribute closer + tag closer (`</textarea>`, `</div>`,
 *      `<script>`) inside the source string don't escape the
 *      attribute boundary.
 *
 * The cell renderer is `renderCellBlock` (private); we exercise
 * it through `processDirectives`, which is the same path the
 * editor's preview-pane uses.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { processDirectives } from "./directives.js";
import type { CslEntry } from "./references.js";

beforeAll(async () => {
  if (typeof DOMParser === "undefined") {
    const { DOMParser: LinkeDOMParser } = await import("linkedom");
    (globalThis as unknown as { DOMParser: unknown }).DOMParser = LinkeDOMParser;
  }
});

const NO_REFS = {} as Readonly<Record<string, CslEntry>>;

function renderCell(source: string): string {
  const md = "::cell{language=python kernel=python3}\n\n```python\n" + source + "\n```\n";
  return processDirectives(md, { references: NO_REFS });
}

describe("Phase 4.6.9 security audit: data-mdz-cell-source", () => {
  it("escapes the five HTML-significant characters in the attribute", () => {
    const html = renderCell("a & b < c > d \" e ' f");
    // Inside the attribute value the chars must appear escaped.
    const m = /data-mdz-cell-source="([^"]*)"/.exec(html);
    expect(m).not.toBeNull();
    const attr = m![1];
    expect(attr).toContain("&amp;");
    expect(attr).toContain("&lt;");
    expect(attr).toContain("&gt;");
    expect(attr).toContain("&quot;");
    expect(attr).toContain("&#39;");
    // None of the raw chars should survive inside the attribute.
    expect(attr).not.toContain("<");
    expect(attr).not.toContain('"');
  });

  it("round-trips a closing-tag-shaped string through the attribute", () => {
    // If escaping is broken, `</textarea>` inside the source would
    // close the attribute and inject the rest as HTML.
    const evil = "x = '</textarea><script>alert(1)</script>'";
    const html = renderCell(evil);
    // The actual attribute value should still be the original text
    // (entity-encoded), reachable via DOMParser → dataset.
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const cell = doc.querySelector('[data-mdz-cell-language="python"]');
    expect(cell).not.toBeNull();
    expect((cell as HTMLElement).dataset.mdzCellSource).toBe(evil);
    // No injected <script> from the malicious payload.
    expect(html).not.toMatch(/<script[^>]*>alert/i);
  });

  it("preserves U+2028 / U+2029 line-separator characters", () => {
    // U+2028 LINE SEPARATOR; U+2029 PARAGRAPH SEPARATOR. Browsers
    // accept these inside attribute values; our escape pass should
    // pass them through unchanged so the dataset read returns the
    // exact bytes the cell author wrote.
    const sep = `print("line1 line2 line3")`;
    const html = renderCell(sep);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const cell = doc.querySelector('[data-mdz-cell-language="python"]');
    expect((cell as HTMLElement).dataset.mdzCellSource).toBe(sep);
  });

  it("encodes ampersand FIRST so existing &-sequences round-trip safely", () => {
    const src = "x = '&amp; literal'";  // a literal ampersand sequence
    const html = renderCell(src);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const cell = doc.querySelector('[data-mdz-cell-language="python"]');
    // dataset read must return the original `&amp; literal` text,
    // NOT the entity-decoded form.
    expect((cell as HTMLElement).dataset.mdzCellSource).toBe(src);
  });

  it("does not let a `</div>` in the source close the cell wrapper", () => {
    const evil = "y = '</div><img src=x onerror=alert(1)>'";
    const html = renderCell(evil);
    // The cell div remains intact; the malicious closer is escaped
    // inside the attribute.
    expect(html).toContain('class="mdz-cell');
    // The `<img onerror>` payload must not appear as an actual tag.
    expect(html).not.toMatch(/<img[^>]*onerror/i);
    // Round-trip via DOMParser confirms the attribute holds the
    // original unmodified text.
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const cell = doc.querySelector('[data-mdz-cell-language="python"]');
    expect((cell as HTMLElement).dataset.mdzCellSource).toBe(evil);
  });
});
