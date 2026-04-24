/**
 * Popup UI script — runs inside the extension's popup context.
 * Sends a message to the service worker to open the viewer tab.
 */

"use strict";

const form = document.getElementById("url-form");
const urlInput = document.getElementById("url-input");
const fileDrop = document.getElementById("file-drop");

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;
  chrome.runtime.sendMessage({ type: "open-archive", url }, () => {
    // Close the popup after dispatch.
    window.close();
  });
});

["dragenter", "dragover"].forEach((evt) => {
  fileDrop.addEventListener(evt, (e) => {
    e.preventDefault();
    fileDrop.classList.add("drag");
  });
});
["dragleave", "drop"].forEach((evt) => {
  fileDrop.addEventListener(evt, (e) => {
    e.preventDefault();
    fileDrop.classList.remove("drag");
  });
});
fileDrop.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  // Create a blob URL and open the viewer with it. The viewer tab will
  // revoke the URL after loading.
  const blobUrl = URL.createObjectURL(file);
  chrome.runtime.sendMessage({ type: "open-archive", url: blobUrl }, () => {
    window.close();
  });
});
