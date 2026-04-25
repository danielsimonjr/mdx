/**
 * Cloudflare Worker entry point for view.mdz-format.org.
 *
 * Behavior:
 *   GET /                   → landing page with drop-zone + URL input
 *   GET /?url=<archive>     → HTML shell that loads the web-component viewer
 *                             and passes the archive URL to it
 *   GET /embed.html         → minimal embeddable shell (no chrome)
 *   GET /robots.txt         → allow crawling of the landing page only
 *
 * Security posture (implements ROADMAP Phase 3.1 CSP profile):
 *   - Content-Security-Policy strict: default-src 'self'; script-src
 *     'self' 'unsafe-inline' for the inline viewer bootstrap; img-src
 *     data: blob: https:; object-src 'none'; frame-ancestors 'self'.
 *   - CORS: Access-Control-Allow-Origin: * on GET only (no credentials).
 *   - Permissions-Policy: interest-cohort=(), geolocation=(), camera=(),
 *     microphone=() — viewer has no legitimate need for these.
 *   - Referrer-Policy: strict-origin-when-cross-origin.
 *   - X-Content-Type-Options: nosniff.
 *
 * The Worker does NOT download or render the archive itself — it returns
 * an HTML page that loads the <mdz-viewer> web component, which fetches
 * and renders the archive client-side. This keeps the server stateless
 * and means archives never transit through Cloudflare's edge as data
 * (only as URL strings).
 */

/// <reference types="@cloudflare/workers-types" />

interface Env {
  // Reserved for future KV bindings (signer-key cache, rate-limit counters)
  // — none used in the 0.1 alpha.
}

const CSP_HEADER = [
  "default-src 'self'",
  // Bootstrap script is inlined — the nonce is generated per-request below,
  // so 'unsafe-inline' is a fallback for clients that don't support nonces.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // Archives load via HTTPS; blob: needed for inflated asset URLs; data:
  // needed for inline SVG / base64 images that the sanitizer allows.
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https:",
  "font-src 'self' data:",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  // Turn on Trusted Types for browsers that support it — the viewer's
  // sanitizer is the only trusted source of HTML.
  "require-trusted-types-for 'script'",
].join("; ");

const COMMON_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CSP_HEADER,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "interest-cohort=(), geolocation=(), camera=(), microphone=(), usb=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: COMMON_HEADERS });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return text("Method not allowed", 405);
    }

    switch (url.pathname) {
      case "/":
      case "/index.html":
        return html(renderIndexPage(url), 200, url);
      case "/embed.html":
        return html(renderEmbedPage(url), 200, url);
      case "/robots.txt":
        return text(
          [
            "User-agent: *",
            "Allow: /",
            "Allow: /index.html",
            "Disallow: /embed.html",
          ].join("\n"),
          200,
          "text/plain; charset=utf-8",
        );
      case "/healthz":
        return text("ok", 200, "text/plain");
      default:
        return text("Not found", 404);
    }
  },
};

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * Cache duration tiers — content-hash-pinned URLs may be cached
 * forever (the URL itself encodes the bytes so the response can
 * never go stale). Unpinned archive-URL pages get a short TTL so
 * authors who replace the archive at the same URL see updates
 * within ~5 minutes.
 */
export function cacheControlFor(url: URL): string {
  // The optional `content_hash` query param signals "this URL is
  // pinned to specific bytes; the page rendering cannot change for
  // this URL". Allow Cloudflare's edge to cache for a year.
  if (url.searchParams.has("content_hash")) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=300, stale-while-revalidate=86400";
}

export function html(body: string, status = 200, url: URL | null = null): Response {
  return new Response(body, {
    status,
    headers: {
      ...COMMON_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": url ? cacheControlFor(url) : "public, max-age=300, stale-while-revalidate=86400",
      // Vary on Accept so a future JSON variant of the same URL
      // doesn't share a cache slot with the HTML.
      "Vary": "Accept",
    },
  });
}

export function text(body: string, status = 200, contentType = "text/plain; charset=utf-8"): Response {
  return new Response(body, {
    status,
    headers: {
      ...COMMON_HEADERS,
      "Content-Type": contentType,
    },
  });
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/**
 * Build a canonical URL that drops any refused-by-isSafeUrl `?url=`
 * query so we never echo attacker-controlled `javascript:` / `file:`
 * payloads in `<link rel="canonical">` or `<meta property="og:url">`
 * — those tags survive in caches, search-engine indexes, and social
 * preview snapshots.
 */
function canonicalUrl(url: URL, safeArchiveUrl: string | null): string {
  if (safeArchiveUrl) return url.toString();
  // The `url` param is either absent or refused; emit a canonical
  // pointing at the bare path with no query.
  return `${url.origin}${url.pathname}`;
}

function renderIndexPage(url: URL): string {
  const archiveUrl = url.searchParams.get("url");
  // Only accept http(s) URLs — disallow `javascript:`, `file:`, `data:` etc.
  // The viewer's sanitizer also rejects these, but refusing at the Worker
  // means we never serve a page that links to a dangerous URL.
  const safeUrl = isSafeUrl(archiveUrl) ? archiveUrl : null;

  return baseShell({
    title: safeUrl
      ? `Viewing ${safeUrl}`
      : "MDZ Viewer — drop an archive to render",
    body: safeUrl ? renderViewerBody(safeUrl) : renderLandingBody(),
    archiveUrl: safeUrl,
    canonical: canonicalUrl(url, safeUrl),
  });
}

function renderEmbedPage(url: URL): string {
  const archiveUrl = url.searchParams.get("url");
  const safeUrl = isSafeUrl(archiveUrl) ? archiveUrl : null;
  if (!safeUrl) {
    return baseShell({
      title: "MDZ Embed",
      body: '<p style="padding:1rem;color:#666">Pass ?url=https://... to embed an MDZ archive.</p>',
      canonical: canonicalUrl(url, null),
    });
  }
  // Embed page omits header/footer chrome — intended to be <iframe>'d.
  return baseShell({
    title: "MDZ Embed",
    body: `<mdz-viewer src="${escapeHtml(safeUrl)}" theme="auto"></mdz-viewer>`,
    archiveUrl: safeUrl,
    canonical: canonicalUrl(url, safeUrl),
  });
}

function renderLandingBody(): string {
  return `
  <header>
    <h1>MDZ Viewer</h1>
    <p>Render any <strong>MDZ</strong> (or legacy <strong>.mdx</strong>) archive at a URL.
    Free, no sign-up. Archives never transit our servers.</p>
  </header>
  <main>
    <form id="load-form">
      <label for="url">Archive URL:</label>
      <input id="url" name="url" type="url" required
             placeholder="https://arxiv.org/abs/2612.12345/paper.mdz"
             autocomplete="off"/>
      <button type="submit">Render</button>
    </form>
    <details>
      <summary>Or paste an archive URL into the address bar:</summary>
      <code>view.mdz-format.org?url=&lt;your-archive-url&gt;</code>
    </details>
    <section aria-label="About">
      <h2>What is MDZ?</h2>
      <p>MDZ is an open file format for executable scientific papers — a signed
      ZIP archive containing manuscript, data, code, figures, and provenance.
      <a href="https://github.com/danielsimonjr/mdx">Specification on GitHub</a>.</p>
    </section>
  </main>
  <footer>
    <p><small>Self-hosted on Cloudflare Workers. Source:
    <a href="https://github.com/danielsimonjr/mdx/tree/master/packages/mdz-viewer-hosted">
    packages/mdz-viewer-hosted</a>. MIT-licensed.</small></p>
  </footer>
  <script>
    document.getElementById('load-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const u = document.getElementById('url').value.trim();
      if (!u) return;
      location.search = '?url=' + encodeURIComponent(u);
    });
  </script>`;
}

function renderViewerBody(archiveUrl: string): string {
  return `
  <header class="site-chrome">
    <a href="/">← New archive</a>
    <span class="archive-url">${escapeHtml(archiveUrl)}</span>
  </header>
  <mdz-viewer src="${escapeHtml(archiveUrl)}" theme="auto"></mdz-viewer>`;
}

interface ShellOptions {
  title: string;
  body: string;
  /** Archive URL the page is rendering, if any. Used for OG / Twitter
   *  card meta so a paste into Slack/Twitter/etc. shows useful preview. */
  archiveUrl?: string | null;
  /** Canonical URL for this page (the request URL). */
  canonical?: string | null;
}

function baseShell(opts: ShellOptions): string {
  const { title, body, archiveUrl, canonical } = opts;
  const description = archiveUrl
    ? `View MDZ archive ${archiveUrl} — rendered live in your browser, no download required.`
    : "Render MDZ (Markdown Zipped Container) archives in the browser. Free, stateless, open-source.";
  // OG / Twitter card meta — covers the "shareable URL" Phase 2.2
  // deliverable. Image is a static SVG hosted alongside the worker;
  // a per-archive cover-image extraction is a follow-up that requires
  // fetching + parsing the manifest at preview time.
  const ogMeta = [
    `<meta property="og:type" content="article"/>`,
    `<meta property="og:title" content="${escapeHtml(title)}"/>`,
    `<meta property="og:description" content="${escapeHtml(description)}"/>`,
    `<meta property="og:site_name" content="MDZ Viewer"/>`,
    canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}"/>` : "",
    `<meta name="twitter:card" content="summary"/>`,
    `<meta name="twitter:title" content="${escapeHtml(title)}"/>`,
    `<meta name="twitter:description" content="${escapeHtml(description)}"/>`,
  ].filter(Boolean).join("\n  ");
  const canonicalLink = canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}"/>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="description" content="${escapeHtml(description)}"/>
  ${ogMeta}
  ${canonicalLink}
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; color: #1a1a1a; }
    .site-chrome { padding: 0.75rem 1rem; background: #f5f5f5; border-bottom: 1px solid #ddd;
                   display: flex; gap: 1rem; align-items: center; font-size: 0.9rem; }
    .site-chrome a { color: #1d4ed8; text-decoration: none; }
    .archive-url { color: #666; font-family: ui-monospace, monospace; font-size: 0.85rem;
                   overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
    header h1 { margin: 0 0 0.25rem 0; }
    main, header:not(.site-chrome), footer {
      max-width: 42rem; margin: 0 auto; padding: 1.5rem;
    }
    form { display: flex; gap: 0.5rem; margin: 1rem 0; }
    label { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
            overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    input[type="url"] { flex: 1; padding: 0.5rem; font-size: 1rem; border: 1px solid #ccc;
                       border-radius: 4px; }
    button { padding: 0.5rem 1.5rem; background: #1d4ed8; color: white; border: none;
             border-radius: 4px; font-size: 1rem; cursor: pointer; }
    code { background: #f0f0f0; padding: 0.2em 0.4em; border-radius: 3px; }
    @media (prefers-color-scheme: dark) {
      body { background: #0a0a0a; color: #f5f5f5; }
      .site-chrome { background: #1a1a1a; border-color: #333; }
      .archive-url { color: #888; }
      input[type="url"] { background: #1a1a1a; color: #f5f5f5; border-color: #444; }
      code { background: #222; }
    }
  </style>
  <!--
    The viewer ships as /viewer.js — a Cloudflare Assets binding
    (configured in wrangler.toml's [assets] block) that serves
    the single-file ESM emitted by "npm run build" in
    packages/mdz-viewer/ (output: packages/mdz-viewer/dist/mdz-viewer.js).
    The worker itself is binding-agnostic; serving is wrangler's job.
  -->
  <script type="module">
    import '/viewer.js';
  </script>
</head>
<body>
${body}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Safety helpers
// ---------------------------------------------------------------------------

export function isSafeUrl(raw: string | null): raw is string {
  if (!raw) return false;
  // Reject strings with raw control characters — `new URL()` accepts
  // some (e.g., leading whitespace, which it trims silently), and
  // embedding them in an HTML attribute can lead to parser-state
  // surprises.
  if (/[\x00-\x1f\x7f]/.test(raw)) return false;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  // HTTPS only. The CSP profile's `connect-src 'self' https:` disallows
  // fetching http:// archives anyway; accepting http: here would silently
  // fail at fetch time with an opaque error. Reject upfront with a clean
  // message instead.
  return parsed.protocol === "https:";
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
