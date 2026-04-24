/**
 * Archive detector — content script.
 *
 * Runs on every page and detects `<a href="...mdz">` / `<a href="...mdx">`
 * links. Adds a small badge next to each one that lets the user open it
 * in the MDZ viewer without downloading. The DNR rule in the service
 * worker handles the direct-navigation case (MIME-type intercept); this
 * script covers the "I linked to a .mdz but my server returns
 * application/octet-stream" case.
 */

(function () {
  "use strict";

  const EXT_RE = /\.(mdz|mdx)(\?|$)/i;
  const BADGE_ATTR = "data-mdz-enhanced";

  function enhanceLinks(root) {
    const anchors = root.querySelectorAll?.("a[href]") ?? [];
    for (const a of anchors) {
      if (a.hasAttribute(BADGE_ATTR)) continue;
      if (!EXT_RE.test(a.href)) continue;
      a.setAttribute(BADGE_ATTR, "1");
      // Insert a small "Open in MDZ Viewer" button after the link.
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "📖 Open";
      btn.title = "Open this MDZ archive in the browser viewer";
      Object.assign(btn.style, {
        marginLeft: "4px",
        padding: "0 6px",
        fontSize: "11px",
        background: "#1d4ed8",
        color: "#fff",
        border: "none",
        borderRadius: "3px",
        cursor: "pointer",
        verticalAlign: "baseline",
      });
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        chrome.runtime.sendMessage({ type: "open-archive", url: a.href });
      });
      a.insertAdjacentElement("afterend", btn);
    }
  }

  // Initial pass.
  enhanceLinks(document);

  // Watch for dynamically-inserted links (SPAs, infinite scroll, etc.).
  // Debounced so a burst of DOM mutations doesn't thrash.
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      enhanceLinks(document);
    });
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
