'use strict';

importScripts('model.js');

function isYouTubeSender(sender) {
  if (!sender.tab || !Number.isInteger(sender.tab.id) || sender.tab.id < 0 || sender.frameId !== 0) {
    return false;
  }
  try {
    const url = new URL(sender.url);
    return url.origin === 'https://www.youtube.com' && url.pathname === '/watch' && Boolean(url.searchParams.get('v'));
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || message.type !== 'cuetrail:open') return false;
  if (!isYouTubeSender(sender)) {
    sendResponse({ ok: false, error: 'Links can only be opened from a YouTube watch page.' });
    return false;
  }
  const url = CueTrailModel.normalizeUrl(message.url);
  if (!url) {
    sendResponse({ ok: false, error: 'This section does not contain a safe web link.' });
    return false;
  }
  chrome.tabs.create({ url, active: false }).then(function () {
    sendResponse({ ok: true });
  }).catch(function () {
    sendResponse({ ok: false, error: 'Chrome could not open this link. Please try again.' });
  });
  return true;
});

async function activateCurrentTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs[0] && Number.isInteger(tabs[0].id)) {
      await chrome.tabs.sendMessage(tabs[0].id, { type: 'cuetrail:activate' });
    }
  } catch {
    // Other sites, closed tabs, and pages not yet injected have no receiver.
  }
}

chrome.action.onClicked.addListener(function () {
  void activateCurrentTab();
});

chrome.commands.onCommand.addListener(function (command) {
  if (command === 'open-current-link') void activateCurrentTab();
});
