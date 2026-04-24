/**
 * MDZ Viewer — background service worker.
 *
 * Responsibility:
 *   - Detect MDZ/MDX MIME types on navigation and redirect to our viewer
 *     page, passing the original URL via ?url= so the viewer can fetch
 *     the archive and render it.
 *   - Maintain a small allow-list of MIME types we intercept so we don't
 *     hijack unrelated downloads.
 *
 * Why declarativeNetRequest instead of webRequest?
 *   - webRequest blocking APIs are being deprecated in Chrome MV3 in
 *     favor of declarativeNetRequest rules.
 *   - DNR rules are static + declarative → no persistent background
 *     activity needed, which satisfies MV3's service-worker lifecycle.
 */

const VIEWER_URL = chrome.runtime.getURL("viewer/viewer.html");

const ACCEPTED_MIMES = [
  "application/vnd.mdz-container+zip",
  "application/vnd.mdx-container+zip",
];

// On install, register a DNR rule that rewrites responses with our MIME
// types to our viewer page. Chrome/Edge/Brave/Arc support this; Firefox
// 115+ supports DNR with some differences (registered via the dynamic
// rules API).
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
    // DNR may be unavailable in some test contexts — log but don't
    // prevent the extension from loading. The content-script detector
    // catches any archives the DNR rule misses.
    console.warn("[MDZ Viewer] DNR rule registration failed:", e);
  }
});

/**
 * Build DNR rules. Each rule matches on the archive's MIME type and
 * redirects the navigation to our viewer with the original URL as a
 * query parameter. Chrome MV3 DNR redirect supports ${url} substitution
 * via a transform; Firefox uses the same schema.
 */
function buildRules() {
  return ACCEPTED_MIMES.map((mime, i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: "redirect",
      redirect: {
        transform: {
          scheme: chrome.runtime.getURL("").split(":")[0], // chrome-extension:
          host: chrome.runtime.id,
          path: "/viewer/viewer.html",
          queryTransform: {
            addOrReplaceParams: [{ key: "url", value: "\\0" }],
          },
        },
      },
    },
    condition: {
      resourceTypes: ["main_frame"],
      responseHeaders: [
        {
          header: "content-type",
          values: [mime, `${mime}; *`],
        },
      ],
    },
  }));
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
