/**
 * MDX Viewer - Background Service Worker
 * Handles extension lifecycle events
 */

// Log installation for debugging
chrome.runtime.onInstalled.addListener(() => {
    console.log('MDX Viewer extension installed');
});
