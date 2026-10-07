/*
 * background.js — service worker for OmniGame.
 * - Opens the side panel when the toolbar icon is clicked.
 * - Opens dedicated popup window when requested by surface/popup.
 */
(function () {
  'use strict';

  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(function () {});
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg) return;

    if (msg.type === 'openSidePanel') {
      if (typeof msg.gameId !== 'undefined') {
        try {
          if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({
              'omg:activeView': msg.gameId ? 'player' : 'home',
              'omg:activeGame': msg.gameId || null
            });
          }
        } catch (e) {}
      }
      if (chrome.sidePanel && chrome.sidePanel.open) {
        var tabId = (sender && sender.tab) ? sender.tab.id : undefined;
        var winId = (sender && sender.tab) ? sender.tab.windowId : undefined;
        if (tabId) {
          chrome.sidePanel.open({ tabId: tabId }).then(function () {
            sendResponse({ ok: true });
          }).catch(function () {
            if (winId) {
              chrome.sidePanel.open({ windowId: winId }).then(function () {
                sendResponse({ ok: true });
              }).catch(function () { sendResponse({ ok: false }); });
            } else {
              sendResponse({ ok: false });
            }
          });
        } else {
          chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            var t = tabs && tabs[0];
            if (t && t.id) {
              chrome.sidePanel.open({ tabId: t.id }).then(function () {
                sendResponse({ ok: true });
              }).catch(function () { sendResponse({ ok: false }); });
            } else {
              sendResponse({ ok: false });
            }
          });
        }
        return true;
      } else {
        sendResponse({ ok: false });
        return true;
      }
    }

    function openPopoutDesktopWindow(opts) {
      opts = opts || {};
      var w = opts.width || 440;
      var h = opts.height || 640;
      var targetGid = opts.gameId || null;

      if (targetGid) {
        try {
          if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({
              'omg:activeView': 'player',
              'omg:activeGame': targetGid,
              'omg:lastGame': targetGid
            });
          }
        } catch (e) {}
      }

      var targetUrl = 'surface.html?carrier=window' + (targetGid ? ('&gameId=' + encodeURIComponent(targetGid)) : '');
      var createData = {
        url: chrome.runtime.getURL(targetUrl),
        type: 'popup',
        width: w,
        height: h,
        focused: true
      };
      if (typeof opts.left === 'number') createData.left = Math.round(opts.left);
      if (typeof opts.top === 'number') createData.top = Math.round(opts.top);

      if (chrome.windows && chrome.windows.create) {
        chrome.windows.create(createData, function (win) {
          if (chrome.runtime.lastError && chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url: chrome.runtime.getURL(targetUrl) });
          }
        });
      } else if (chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: chrome.runtime.getURL(targetUrl) });
      }
    }

    if (msg.type === 'openPopoutWindow' || msg.type === 'openSmallWindow') {
      openPopoutDesktopWindow(msg);
      sendResponse({ ok: true });
      return true;
    }
  });

  // Re-inject content scripts across existing tabs so users do not have to refresh manually
  function injectContentScriptsIntoAllTabs() {
    if (!chrome.tabs || !chrome.scripting) return;
    chrome.tabs.query({}, function (tabs) {
      if (!tabs || chrome.runtime.lastError) return;
      tabs.forEach(function (t) {
        if (!t || !t.id || !t.url) return;
        if (!t.url.startsWith('http://') && !t.url.startsWith('https://')) return;
        chrome.scripting.executeScript({
          target: { tabId: t.id },
          files: ['games/_shared/catalog.js', 'content.js']
        }).catch(function () {});
      });
    });
  }

  // Context menus for emergency recovery and quick launch
  function setupContextMenus() {
    if (!chrome.contextMenus) return;
    chrome.contextMenus.removeAll(function () {
      chrome.contextMenus.create({
        id: 'omg:restore-ball',
        title: '🎮 召唤 / 恢复摸鱼悬浮球',
        contexts: ['page', 'frame', 'selection', 'link']
      });
      chrome.contextMenus.create({
        id: 'omg:open-floatwin',
        title: '🪟 打开 OmniGame 独立弹窗',
        contexts: ['page', 'frame', 'selection', 'link']
      });
      chrome.contextMenus.create({
        id: 'omg:open-sidepanel',
        title: '📑 打开侧边栏',
        contexts: ['page', 'frame', 'selection', 'link']
      });
    });
  }

  if (chrome.runtime && chrome.runtime.onInstalled) {
    chrome.runtime.onInstalled.addListener(function () {
      setupContextMenus();
      injectContentScriptsIntoAllTabs();
      try {
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ 'omg:ballVisible': true });
        }
      } catch (e) {}
    });
  }
  if (chrome.runtime && chrome.runtime.onStartup) {
    chrome.runtime.onStartup.addListener(function () {
      setupContextMenus();
      injectContentScriptsIntoAllTabs();
      try {
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ 'omg:ballVisible': true });
        }
      } catch (e) {}
    });
  }
  setupContextMenus();

  if (chrome.contextMenus && chrome.contextMenus.onClicked) {
    chrome.contextMenus.onClicked.addListener(function (info, tab) {
      if (!tab || !tab.id) return;
      if (info.menuItemId === 'omg:restore-ball') {
        chrome.tabs.sendMessage(tab.id, { type: 'restoreBall' }, function () {
          if (chrome.runtime.lastError && chrome.scripting) {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['games/_shared/catalog.js', 'content.js']
            }, function () {
              chrome.tabs.sendMessage(tab.id, { type: 'restoreBall' }, function () {
                if (chrome.runtime.lastError) {}
              });
            });
          }
        });
      } else if (info.menuItemId === 'omg:open-floatwin') {
        openPopoutDesktopWindow();
      } else if (info.menuItemId === 'omg:open-sidepanel') {
        if (chrome.sidePanel && chrome.sidePanel.open) {
          chrome.sidePanel.open({ tabId: tab.id }).catch(function () {});
        }
      }
    });
  }
})();
