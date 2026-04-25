# MDZ Content Security Policy Profile

**Audience:** implementers of MDZ viewers (web component, browser
extension, hosted service, desktop editor, third-party integrations).

**Status:** Phase 3.1 — mandatory for any viewer claiming conformance to
the MDZ v2.0 security model.

---

## What this profile is

A set of Content-Security-Policy header + meta directives that every
conformant MDZ viewer MUST apply when rendering archive content. The
profile is defense-in-depth against malicious archives: even if the
viewer's input sanitizer has a bug, CSP prevents the bug from escalating
into cross-site scripting, data exfiltration, or session hijacking on
the host page.

## Why CSP is not optional

An MDZ archive is untrusted content by default. A reviewer opening a
submission, a reader opening a stranger's paper, a journal's production
pipeline ingesting thousands of submissions — all of these are
attack-surface scenarios. The parser + sanitizer catches most malicious
content; CSP catches what the sanitizer misses.

The threat model (`THREAT_MODEL.md`) enumerates specific attacker
objectives this profile blocks.

## Core CSP (MUST apply)

Every viewer MUST apply at minimum:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https:;
  media-src 'self' blob: https:;
  connect-src 'self' https:;
  font-src 'self' data:;
  object-src 'none';
  frame-ancestors 'self';
  base-uri 'self';
  form-action 'self';
  require-trusted-types-for 'script';
```

### Directive-by-directive rationale

| Directive | Setting | Why |
|-----------|---------|-----|
| `default-src` | `'self'` | Fallback for anything not explicitly listed. Forces explicit opt-in for any resource category. |
| `script-src` | `'self'` | No `'unsafe-inline'`, no `'unsafe-eval'`. Archives cannot inject script; the viewer's own scripts are served from same origin. |
| `style-src` | `'self' 'unsafe-inline'` | `'unsafe-inline'` permitted because the viewer's shadow-DOM styling uses inline `<style>` (scoped to the component). Archive-sourced CSS is rejected. |
| `img-src` | `'self' data: blob: https:` | `blob:` for inflated archive assets; `data:` for small inline images; `https:` for authorized external images (opt-in via `permissions.allow_external_images`). |
| `media-src` | `'self' blob: https:` | Same rationale as img-src for `<video>` / `<audio>`. |
| `connect-src` | `'self' https:` | For loading the archive itself (fetch), and future `::include` transclusions of external resources (pinned by content_hash). |
| `font-src` | `'self' data:` | Embedded fonts delivered via `data:` URLs in shadow DOM. |
| `object-src` | `'none'` | No Flash, no ActiveX, no `<embed>` of arbitrary content. |
| `frame-ancestors` | `'self'` | Prevents the viewer from being framed by a third-party site (clickjacking defense). |
| `base-uri` | `'self'` | Prevents a malicious `<base href="...">` in the archive (if the sanitizer missed it) from redirecting relative URLs. |
| `form-action` | `'self'` | Prevents form submissions from the viewer to attacker-controlled endpoints. |
| `require-trusted-types-for` | `'script'` | Modern-browser enforcement that any string reaching `innerHTML` must pass through a typed policy. The viewer's sanitizer IS the typed policy. |

## Stricter profile for untrusted archives (SHOULD apply)

When the viewer has no trust signal for the archive (anonymous upload,
first-time-seen signer, no profile match), it SHOULD tighten the default
profile:

```diff
- img-src 'self' data: blob: https:;
+ img-src 'self' data: blob:;
- media-src 'self' blob: https:;
+ media-src 'self' blob:;
- connect-src 'self' https:;
+ connect-src 'self';
```

This blocks external image / media / fetch entirely — the archive is
restricted to whatever bytes it carries in the ZIP. Legitimate archives
with content_hash-pinned `::include` URLs will fail to load external
pieces, but anonymous archives shouldn't be using external resources
anyway.

## Host-page CSP constraints

The viewer cannot control the CSP of the page that embeds it. However,
the viewer's web component runs inside a closed shadow DOM, which
isolates styles and restricts DOM traversal from the host. Host pages
that integrate the viewer are RECOMMENDED to apply at least:

```
frame-ancestors 'self';
object-src 'none';
```

## Trusted Types policy

The viewer's sanitizer (`packages/mdz-viewer/src/render.ts`) is the only
source of HTML that reaches `innerHTML`. When Trusted Types is active,
the sanitizer registers a policy via `getTrustedHtmlPolicy()`:

```javascript
trustedTypes.createPolicy("mdz-sanitizer", {
  createHTML: (input) => input, // identity — already sanitized upstream
});
```

The identity function is safe because this policy is only reachable via
the `toSanitizedHtml()` helper in `render.ts`, which wraps strings that
have already been walked by the allowlist + URL rewriter. Host pages
that run the viewer under
`Content-Security-Policy: require-trusted-types-for 'script'` MUST
ensure the "mdz-sanitizer" policy name isn't already claimed by another
library — see `toSanitizedHtml()` for the graceful-degrade behavior
when policy creation throws.

Any attempt by archive content to reach `innerHTML` via a path that
BYPASSES the sanitizer is blocked by the browser (there's no other
policy registered to wrap the raw string).

## Reporting

Viewers SHOULD configure `report-to` / `report-uri` to a same-origin
endpoint that logs violations. In 0.1.x alpha, the hosted viewer logs to
Cloudflare Worker logs; desktop viewers log to local file.

Example header:

```
Content-Security-Policy: ...; report-to csp-endpoint
Report-To: {"group":"csp-endpoint","max_age":10886400,
            "endpoints":[{"url":"/csp-report"}]}
```

## Testing conformance

A viewer passes CSP-profile conformance if:

1. **Positive:** archives in `tests/conformance/positive/` render correctly
   without CSP violations.
2. **Negative:** hand-crafted archives in `tests/security/csp/` attempting
   each of the following produce a CSP violation report:
   - `<script>alert(1)</script>` in markdown
   - `<img src="x" onerror="alert(1)">` in markdown
   - `<a href="javascript:alert(1)">` in markdown
   - `<iframe src="https://evil.example.com">` in markdown
   - `::include[target="https://evil.example.com/x.md"]` without content_hash
   - Markdown fenced code block containing a `<script>` tag with real JS

The Phase 3.3 accessibility-conformance suite adds CSP violation
assertions to its axe-core runner (`tests/accessibility/`).

## Relationship to v2.0 spec §16 (signatures) and §19 (permissions)

CSP is the runtime enforcement layer; spec §16 + §19 declare the intent:

- `manifest.security.permissions.allow_scripts: false` → viewer applies
  strict `script-src 'self'` (no relaxation).
- `manifest.security.permissions.allow_scripts: true` → viewer MAY relax
  to `script-src 'self' <signed-script-hashes>` after verifying the
  script's integrity field against `security.signatures[]`. The script
  author's signature is the trust root.
- `manifest.security.permissions.allow_external_includes: false` →
  `connect-src 'self'` only.
- `manifest.security.permissions.allow_external_images: false` → strip
  external image URLs during sanitization.

Each permission MUST be off by default. Enabling one requires a valid
signature from a signer listed in the archive's `security.signatures[]`
whose role the viewer's trust policy accepts.

## Migration guidance for existing viewers

The Chrome extension and hosted Worker shipped with CSP from 0.1.0; the
legacy `legacy/viewer/index.html` single-file HTML demo does not. Phase 3
retires that demo in favor of the web-component + hosted-service path.

If you maintain a third-party viewer:

1. Audit your current CSP (or lack of it) against the Core profile above.
2. Run the negative-test archives in `tests/security/csp/` against your
   viewer; any that successfully execute attacker-controlled code are
   critical bugs.
3. Subscribe to the project's security advisories (GitHub Security tab)
   for rule updates.

## References

- W3C CSP Level 3: https://www.w3.org/TR/CSP3/
- Trusted Types: https://www.w3.org/TR/trusted-types/
- OWASP CSP Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
- ROADMAP Phase 3: `../../ROADMAP.md` §3
