/**
 * Tests for the Cloudflare Worker that fronts view.mdz-format.org.
 *
 * Targets the Worker's HTTP handler directly via `worker.fetch(request,
 * env, ctx)`. No Miniflare needed — the request/response classes are
 * standard `globalThis.Request` / `Response`, available in Node 18+.
 *
 * Coverage:
 *   1. Helpers: isSafeUrl, escapeHtml, cacheControlFor.
 *   2. HTTP routing: /, /embed.html, /robots.txt, /healthz, 404.
 *   3. Method handling: OPTIONS preflight, non-GET rejection.
 *   4. Security headers on every response (CSP, COOP, X-Content-Type-
 *      Options, Referrer-Policy, Permissions-Policy).
 *   5. URL safety — javascript:, data:, file:, http: all rejected.
 *   6. Content-hash pinning — `?content_hash=…` triggers immutable
 *      Cache-Control.
 *   7. OG / Twitter meta — present on archive-rendering pages,
 *      escapes user-supplied URL values.
 */

import { describe, it, expect } from "vitest";
import worker, { isSafeUrl, escapeHtml, cacheControlFor } from "./worker.js";

const ENV = {} as never;
const CTX = {
  waitUntil: () => undefined,
  passThroughOnException: () => undefined,
} as unknown as ExecutionContext;

async function get(url: string): Promise<Response> {
  return worker.fetch(new Request(url, { method: "GET" }), ENV, CTX);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe("isSafeUrl", () => {
  it("accepts https URLs", () => {
    expect(isSafeUrl("https://arxiv.org/paper.mdz")).toBe(true);
  });

  it("rejects http URLs (CSP/security)", () => {
    expect(isSafeUrl("http://example.com/paper.mdz")).toBe(false);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "vbscript:msgbox",
    "about:blank",
  ])("rejects dangerous scheme: %s", (raw) => {
    expect(isSafeUrl(raw)).toBe(false);
  });

  it("rejects null and empty string", () => {
    expect(isSafeUrl(null)).toBe(false);
    expect(isSafeUrl("")).toBe(false);
  });

  it("rejects strings containing control characters", () => {
    expect(isSafeUrl("https://example.com/\x00path")).toBe(false);
    expect(isSafeUrl("https://example.com/\x1fpath")).toBe(false);
    expect(isSafeUrl("https://example.com/path\x7f")).toBe(false);
  });

  it("rejects malformed URLs that throw on parse", () => {
    expect(isSafeUrl("not a url at all")).toBe(false);
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML special characters", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
    expect(escapeHtml("a & b")).toBe("a &amp; b");
    expect(escapeHtml(`"'`)).toBe("&quot;&#039;");
  });
});

describe("cacheControlFor", () => {
  it("returns short TTL when content_hash is absent", () => {
    const cc = cacheControlFor(new URL("https://view.mdz-format.org/?url=https://x.com/a.mdz"));
    expect(cc).toContain("max-age=300");
    expect(cc).toContain("stale-while-revalidate");
  });

  it("returns immutable / 1-year TTL when content_hash is present", () => {
    const cc = cacheControlFor(
      new URL(
        "https://view.mdz-format.org/?url=https://x.com/a.mdz&content_hash=sha256:abc",
      ),
    );
    expect(cc).toContain("max-age=31536000");
    expect(cc).toContain("immutable");
  });
});

// ---------------------------------------------------------------------------
// HTTP routing
// ---------------------------------------------------------------------------

describe("routing", () => {
  it("GET / returns the landing page (200, text/html)", async () => {
    const r = await get("https://view.mdz-format.org/");
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toContain("text/html");
    const body = await r.text();
    expect(body).toContain("<title>");
    expect(body).toContain("MDZ Viewer");
  });

  it("GET /?url=https://... renders the viewer shell", async () => {
    const r = await get("https://view.mdz-format.org/?url=https://example.com/p.mdz");
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain("<mdz-viewer");
    expect(body).toContain("https://example.com/p.mdz");
  });

  it("GET /?url=javascript:... renders the landing page (URL refused)", async () => {
    const r = await get("https://view.mdz-format.org/?url=javascript:alert(1)");
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).not.toContain("javascript:alert(1)");
    expect(body).toContain("Render");
  });

  it("GET /embed.html renders embed shell when url is safe", async () => {
    const r = await get("https://view.mdz-format.org/embed.html?url=https://example.com/p.mdz");
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain("<mdz-viewer");
    expect(body).not.toContain("Render");
  });

  it("GET /robots.txt returns plain text with disallow rules", async () => {
    const r = await get("https://view.mdz-format.org/robots.txt");
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toContain("text/plain");
    const body = await r.text();
    expect(body).toContain("User-agent: *");
    expect(body).toContain("Disallow: /embed.html");
  });

  it("GET /healthz returns 'ok'", async () => {
    const r = await get("https://view.mdz-format.org/healthz");
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("ok");
  });

  it("GET /unknown returns 404", async () => {
    const r = await get("https://view.mdz-format.org/does-not-exist");
    expect(r.status).toBe(404);
  });
});

describe("method handling", () => {
  it("OPTIONS returns 204 with CORS headers (preflight)", async () => {
    const r = await worker.fetch(
      new Request("https://view.mdz-format.org/", { method: "OPTIONS" }),
      ENV,
      CTX,
    );
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  it("POST returns 405 Method Not Allowed", async () => {
    const r = await worker.fetch(
      new Request("https://view.mdz-format.org/", { method: "POST" }),
      ENV,
      CTX,
    );
    expect(r.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

describe("security headers", () => {
  it("CSP header is present and forbids unsafe-eval", async () => {
    const r = await get("https://view.mdz-format.org/");
    const csp = r.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("require-trusted-types-for 'script'");
  });

  it("X-Content-Type-Options is nosniff", async () => {
    const r = await get("https://view.mdz-format.org/");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("Permissions-Policy disables FLoC + sensors", async () => {
    const r = await get("https://view.mdz-format.org/");
    const pp = r.headers.get("Permissions-Policy") ?? "";
    expect(pp).toContain("interest-cohort=()");
    expect(pp).toContain("geolocation=()");
    expect(pp).toContain("camera=()");
  });

  it("Referrer-Policy is strict-origin-when-cross-origin", async () => {
    const r = await get("https://view.mdz-format.org/");
    expect(r.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("Vary: Accept on HTML responses", async () => {
    const r = await get("https://view.mdz-format.org/");
    expect(r.headers.get("Vary")).toContain("Accept");
  });
});

// ---------------------------------------------------------------------------
// Cache headers
// ---------------------------------------------------------------------------

describe("cache headers", () => {
  it("/?url=... without content_hash gets short TTL", async () => {
    const r = await get("https://view.mdz-format.org/?url=https://x.com/a.mdz");
    const cc = r.headers.get("Cache-Control") ?? "";
    expect(cc).toContain("max-age=300");
  });

  it("/?url=...&content_hash=sha256:... gets immutable cache", async () => {
    const r = await get(
      "https://view.mdz-format.org/?url=https://x.com/a.mdz&content_hash=sha256:abc",
    );
    const cc = r.headers.get("Cache-Control") ?? "";
    expect(cc).toContain("max-age=31536000");
    expect(cc).toContain("immutable");
  });
});

// ---------------------------------------------------------------------------
// OG / Twitter meta tags
// ---------------------------------------------------------------------------

describe("OG and Twitter meta tags", () => {
  it("includes og:title + og:description on the landing page", async () => {
    const r = await get("https://view.mdz-format.org/");
    const body = await r.text();
    expect(body).toContain('property="og:title"');
    expect(body).toContain('property="og:description"');
    expect(body).toContain('name="twitter:card"');
  });

  it("og:url uses the canonical request URL", async () => {
    const r = await get("https://view.mdz-format.org/?url=https://example.com/p.mdz");
    const body = await r.text();
    expect(body).toMatch(/property="og:url"\s+content="[^"]+\?url=https/i);
  });

  it("escapes attacker-controlled archive URL in OG meta", async () => {
    const r = await get(
      'https://view.mdz-format.org/?url=https://example.com/"><script>alert(1)</script>',
    );
    const body = await r.text();
    expect(body).not.toMatch(/<script>alert\(1\)<\/script>/);
  });
});
