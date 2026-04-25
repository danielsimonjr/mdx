/**
 * Tests for the centralised HTML-escape helper (Phase 4.6.9).
 */
import { describe, it, expect } from "vitest";
import { escapeHtml } from "../src/renderer/html-escape.js";

describe("escapeHtml", () => {
  it("escapes the five HTML5-significant characters", () => {
    expect(escapeHtml("&")).toBe("&amp;");
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml(">")).toBe("&gt;");
    expect(escapeHtml('"')).toBe("&quot;");
    expect(escapeHtml("'")).toBe("&#39;");
  });

  it("escapes ampersands FIRST so already-escaped sequences round-trip safely", () => {
    expect(escapeHtml("a & <b>")).toBe("a &amp; &lt;b&gt;");
    // If `&` were escaped last, `&lt;` would become `&amp;lt;`.
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves safe characters unchanged", () => {
    expect(escapeHtml("hello world 123")).toBe("hello world 123");
    expect(escapeHtml("café — naïve résumé")).toBe("café — naïve résumé");
  });

  it("coerces null + undefined to empty string", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("handles a hostile XSS-style payload end-to-end", () => {
    const payload = `<img src="x" onerror="alert('1')">`;
    const out = escapeHtml(payload);
    expect(out).not.toContain("<img");
    expect(out).not.toContain('onerror="');
    expect(out).toContain("&lt;img");
    expect(out).toContain("&quot;x&quot;");
    expect(out).toContain("&#39;1&#39;");
  });

  it("escapes apostrophes — the gap the prior `escapeHtmlSimple` had", () => {
    // The retired `escapeHtmlSimple` in index.ts skipped `'` and `"`.
    // Verifying the canonical escape covers them so any caller that
    // migrated from the simple form gets stronger output, not
    // weaker.
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });
});
