/**
 * Viewer page entry point — loaded by viewer.html.
 *
 * This module imports the built <mdz-viewer> web component (bundled from
 * packages/mdz-viewer into ../vendor/mdz-viewer.js at extension build
 * time) and mounts it with the archive URL from the query string.
 *
 * Dev note: the bundled viewer file isn't present in the repo — it's
 * produced by `cd packages/mdz-viewer && npm run build` and copied into
 * `browser-extension/vendor/mdz-viewer.js` by the extension's build
 * pipeline (TBD, tracked as a Phase 2.5 deliverable). Until that build
 * wires up, loading this extension page shows the fallback message from
 * viewer.html.
 */

"use strict";

async function main() {
  // Try the bundled path first; fall back to the dev path.
  const candidateUrls = [
    chrome.runtime.getURL("vendor/mdz-viewer.js"),
    chrome.runtime.getURL("../packages/mdz-viewer/dist/mdz-viewer.js"),
  ];

  let loaded = false;
  for (const url of candidateUrls) {
    try {
      await import(url);
      loaded = true;
      break;
    } catch {
      // Try next candidate.
    }
  }
  if (!loaded) {
    // Fallback message is already in the DOM from viewer.html; just
    // ensure no Uncaught Error in the console.
    return;
  }

  // Remove the fallback message and mount the viewer.
  const host = document.getElementById("viewer-host");
  const fallback = document.getElementById("fallback-msg");
  if (fallback) fallback.remove();

  const params = new URL(location.href).searchParams;
  const archiveUrl = params.get("url");
  if (!archiveUrl) {
    const msg = document.createElement("p");
    msg.textContent = "No archive URL provided. Pass ?url=<archive-url>.";
    host.appendChild(msg);
    return;
  }

  const viewer = document.createElement("mdz-viewer");
  viewer.setAttribute("src", archiveUrl);
  viewer.setAttribute("theme", "auto");
  host.appendChild(viewer);

  // If the source was a blob: URL (user dropped a file in the popup),
  // revoke it once the archive is loaded — object URLs leak memory.
  if (archiveUrl.startsWith("blob:")) {
    viewer.addEventListener("mdz-loaded", () => URL.revokeObjectURL(archiveUrl), {
      once: true,
    });
  }
}

main();
