// background.js
// Functionality: Service worker for tab management and message routing.
//   - Listens for "open-lichess" messages from content script
//   - Listens for "open-history-game" from popup to reload past PGNs
//   - Creates new tab with Lichess analysis URL
//   - Stores recent game reference
// Inputs: chrome.runtime messages ({ action: "open-lichess", url: string })
//          ({ action: "open-history-game", pgn: string, themeId: string })
// Outputs: chrome.tabs.create calls, chrome.storage.local writes

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "open-lichess") {
    chrome.tabs.create({ url: message.url, active: true }, (tab) => {
      chrome.storage.local.set({
        lastLichessTab: tab.id,
        lastGameUrl: message.url,
        lastTimestamp: Date.now()
      });
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "open-history-game") {
    const encoded = encodeURIComponent(message.pgn);
    const url = `https://lichess.org/analysis/pgn/${encoded}`;
    chrome.tabs.create({ url: url, active: true }, (tab) => {
      chrome.storage.local.set({
        lastLichessTab: tab.id,
        lastGameUrl: url,
        lastTimestamp: Date.now(),
        pendingThemeId: message.themeId || null
      });
    });
    sendResponse({ success: true });
    return true;
  }
});

// Re-apply pending theme when history game tab finishes loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('lichess.org/analysis')) {
    chrome.storage.local.get('pendingThemeId', (data) => {
      if (data.pendingThemeId && tabId === data.lastLichessTab) {
        chrome.tabs.sendMessage(tabId, {
          action: 'zenit-apply-theme',
          themeId: data.pendingThemeId
        }).catch(() => {});
        chrome.storage.local.remove('pendingThemeId');
      }
    });
  }
});
