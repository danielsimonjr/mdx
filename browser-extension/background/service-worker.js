/**
 * MDZ Viewer — background service worker.
 *
 * Responsibility:
 *   - Intercept navigations that end in `.mdz` or `.mdx` via a DNR
 *     `regexSubstitution` rule — the original URL is captured by the
 *     regex and substituted into the viewer URL via `\0`.
 *   - MIME-type-based interception (via declarativeNetRequest response-
 *     header matching) is also attempted as a defense-in-depth rule, but
 *     Chrome's DNR `addOrReplaceParams.value` does NOT support capture-
 *     group substitution — only `regexSubstitution` does. The path-based
 *     rule below is the primary interception mechanism.
 *
 * Why declarativeNetRequest instead of webRequest?
 *   - webRequest blocking APIs are deprecated in Chrome MV3 in favor of
 *     declarativeNetRequest.
 *   - DNR rules are declarative → no persistent background activity
 *     needed, matching MV3's service-worker lifecycle.
 */

const VIEWER_URL = chrome.runtime.getURL("viewer/viewer.html");

const ACCEPTED_MIMES = [
  "application/vnd.mdz-container+zip",
  "application/vnd.mdx-container+zip",
];

// On install, register DNR rules that redirect .mdz / .mdx navigations
// to our viewer page. Uses regexSubstitution so the original URL lands
// in the `?url=` parameter — literal `\0` (as we had before) would
// produce the string "\0" in the URL, not the captured match.
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existing.map((r) => r.id);
    if (existingIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingIds,
      });
    }
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: buildRules(),
    });
  } catch (e) {
    // DNR may be unavailable in some test contexts — log loudly so a
    // packaging regression is visible in the install pane. Without DNR
    // the content-script detector (archive-detector.js) is the only
    // fallback; it only catches visible links, not direct navigations.
    console.error("[MDZ Viewer] DNR rule registration failed:", e);
  }
});

/**
 * Build DNR rules. Two strategies, both registered:
 *
 * 1. Path-based `regexFilter` with `regexSubstitution` — fires on any
 *    URL ending in `.mdz` or `.mdx`. This is the primary rule because
 *    it correctly substitutes the full original URL into the viewer's
 *    `?url=` parameter via the `\0` backreference (valid ONLY inside
 *    `regexSubstitution`, NOT inside `queryTransform` / `addOrReplaceParams`).
 *
 * 2. MIME-based fallback — some servers serve `.mdz` as `application/
 *    octet-stream` but specify the proper MIME in Content-Type. Catching
 *    those requires a response-header condition. We can't use
 *    `regexSubstitution` here (no URL regex matched), so we redirect to
 *    a fixed URL that includes a `source-header` query param the viewer
 *    reads to reconstruct the archive URL via `document.referrer`. Not
 *    perfect, but a second-best for servers that misdeclare extensions.
 *    Documented limitation: archives loaded via a 302 chain may lose the
 *    original URL.
 */
function buildRules() {
  const extensionUrl = chrome.runtime.getURL("viewer/viewer.html");
  return [
    // 1. Path-based intercept with regex substitution (primary)
    {
      id: 1,
      priority: 1,
      action: {
        type: "redirect",
        redirect: {
          regexSubstitution: `${extensionUrl}?url=\\0`,
        },
      },
      condition: {
        regexFilter: "^https?://.*\\.(mdz|mdx)(\\?.*)?$",
        resourceTypes: ["main_frame"],
      },
    },
    // 2. MIME-based intercept (fallback; loses original URL — viewer
    // reconstructs from document.referrer where possible)
    ...ACCEPTED_MIMES.map((mime, i) => ({
      id: 10 + i,
      priority: 1,
      action: {
        type: "redirect",
        redirect: { url: `${extensionUrl}?source=mime-intercept` },
      },
      condition: {
        resourceTypes: ["main_frame"],
        responseHeaders: [
          {
            header: "content-type",
            values: [mime, `${mime};*`],
          },
        ],
      },
    })),
  ];
}

// Message handler for the popup + content script.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "open-archive" && typeof msg.url === "string") {
    chrome.tabs.create({
      url: `${VIEWER_URL}?url=${encodeURIComponent(msg.url)}`,
    });
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
