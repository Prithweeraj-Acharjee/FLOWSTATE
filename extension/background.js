/**
 * FlowState — Background Service Worker v1.1
 * Handles extension lifecycle and cross-tab messaging.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log("[FlowState] Installed.");
  chrome.storage.local.set({ fsHistory: [], fsLatest: null, fsModel: null });
});

// Relay messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // C2: Return the sender's tab ID so content script can namespace storage
  if (msg.type === "FS_GET_TAB_ID") {
    sendResponse({ tabId: sender.tab ? sender.tab.id : null });
    return;
  }
  if (msg.type === "FS_SCORE_UPDATE") {
    chrome.storage.local.set({ fsLatest: msg.data });
  }
  sendResponse({ ok: true });
});
