/*
 * surface.js — shared game surface for OmniGame (loaded by surface.html).
 *
 * This page is reused in two carriers:
 *   (a) inside the content-script floatwin iframe on web pages  (inIframe=true)
 *   (b) directly as the Chrome side panel                       (inIframe=false)
 *
 * Both carriers share one catalog, one player, and one "resume last game"
 * behavior (persisted `omg:lastGame`). Because the games themselves do not
 * serialize in-progress state, "continue" means reopening the last selected
 * game rather than restoring a board — acceptable for v1.1.
 *
 * The only contextual difference is the toolbar action button:
 *   - in an iframe  → "在侧边栏继续玩" posts a message so the host content
 *                     script can open the side panel (same game resumes there).
 *   - as side panel → "开小窗" asks the active tab's content script to spawn
 *                     its floating window.
 *
 * Offline-first (CSP `script-src 'self'`): no network, no eval.
 */
(function () {
  'use strict';

  var inIframe = window.self !== window.top;
  if (inIframe) {
    document.body.classList.add('is-iframe');
  }

  var ctxBtn = document.getElementById('ctxBtn');
  var ctxBtnIcon = document.getElementById('ctxBtnIcon');
  var ctxBtnText = document.getElementById('ctxBtnText');
  var summonBallBtn = document.getElementById('summonBallBtn');
  var summonBallIcon = document.getElementById('summonBallIcon');
  var summonBallText = document.getElementById('summonBallText');
  var centerBtn = document.getElementById('centerBtn');
  var closeBtn = document.getElementById('closeBtn');
  var pinBtn = document.getElementById('surfPinBtn');
  var grid = document.getElementById('grid');
  var home = document.getElementById('home');
  var player = document.getElementById('player');
  var frame = document.getElementById('gameFrame');
  var playerTitle = document.getElementById('playerTitle');
  var backBtn = document.getElementById('backBtn');
  var currentId = null;
  var EXT_ORIGIN = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL('').slice(0, -1)
    : '';
  var GAMES = window.OMNIGAME_GAMES || [];

  var howBtn = document.getElementById('howBtn');
  var tipEl = document.getElementById('gameHowTooltip');
  var currentGame = null;

  // ---- Gameplay Tooltip Popover ----------------------------------------------
  function showTooltip(game, targetEl) {
    if (!game || !targetEl || !tipEl) return;
    tipEl.innerHTML = [
      '<div class="omg-tooltip-title"><span>' + (game.emoji || '🎮') + '</span> ' + game.name + (game.badge ? (' <span class="surf-badge">' + game.badge + '</span>') : '') + '</div>',
      game.goal ? ('<div class="omg-tooltip-row"><span class="omg-tooltip-label">🎯 目标:</span><span class="omg-tooltip-val">' + game.goal + '</span></div>') : '',
      game.controls ? ('<div class="omg-tooltip-row"><span class="omg-tooltip-label">🕹️ 操作:</span><span class="omg-tooltip-val">' + game.controls + '</span></div>') : '',
      game.rules ? ('<div class="omg-tooltip-row"><span class="omg-tooltip-label">💡 规则:</span><span class="omg-tooltip-val">' + game.rules + '</span></div>') : '',
      game.tips ? ('<div class="omg-tooltip-tip">✨ 秘籍: ' + game.tips + '</div>') : ''
    ].join('');

    tipEl.hidden = false;
    tipEl.classList.add('visible');

    var r = targetEl.getBoundingClientRect();
    var tipW = tipEl.offsetWidth || 300;
    var tipH = tipEl.offsetHeight || 180;

    var top = r.bottom + 8;
    if (top + tipH > window.innerHeight - 12) {
      top = Math.max(12, r.top - tipH - 8);
    }
    var left = r.left + (r.width / 2) - (tipW / 2);
    left = Math.max(10, Math.min(left, window.innerWidth - tipW - 10));

    tipEl.style.top = top + 'px';
    tipEl.style.left = left + 'px';
  }

  function hideTooltip() {
    if (tipEl) {
      tipEl.classList.remove('visible');
      tipEl.hidden = true;
    }
  }

  function toggleTooltip(game, targetEl) {
    if (tipEl && tipEl.classList.contains('visible')) {
      hideTooltip();
    } else {
      showTooltip(game, targetEl);
    }
  }

  if (howBtn) {
    howBtn.addEventListener('mouseenter', function () {
      if (currentGame) showTooltip(currentGame, howBtn);
    });
    howBtn.addEventListener('mouseleave', hideTooltip);
    howBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (currentGame) toggleTooltip(currentGame, howBtn);
    });
  }

  function isExtValid() {
    try {
      return typeof chrome !== 'undefined' &&
        !!chrome.runtime &&
        !!chrome.runtime.id &&
        typeof chrome.runtime.getManifest === 'function' &&
        !!chrome.runtime.getManifest();
    } catch (e) {
      return false;
    }
  }

  // Robustly query active web tab in the current browser window
  function getActiveWebTab(cb) {
    if (!isExtValid() || !chrome.tabs || !chrome.tabs.query) {
      cb(null);
      return;
    }
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!isExtValid() || (chrome.runtime && chrome.runtime.lastError)) {
          cb(null);
          return;
        }
        var t = tabs && tabs[0];
        if (t && t.id) {
          cb(t);
          return;
        }
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs2) {
          if (!isExtValid() || (chrome.runtime && chrome.runtime.lastError)) {
            cb(null);
            return;
          }
          var t2 = tabs2 && tabs2[0];
          if (t2 && t2.id) {
            cb(t2);
            return;
          }
          chrome.tabs.query({ active: true }, function (tabs3) {
            if (!isExtValid() || (chrome.runtime && chrome.runtime.lastError)) {
              cb(null);
              return;
            }
            cb(tabs3 && tabs3[0]);
          });
        });
      });
    } catch (err) {
      cb(null);
    }
  }

  // ---- Carrier Detection & Mutually Exclusive Context Button ----------------
  // Carrier A: Window Mode (独立小窗 / 网页悬浮窗) -> 按钮为 "📑 打开侧边栏", 显示 🎯 居中和 × 关闭
  // Carrier B: Side Panel Mode (浏览器侧边栏) -> 按钮为 "🪟 开小窗", 隐藏 🎯、×、📌
  // "这两个永远只能显示一个"
  var urlParams = new URLSearchParams(window.location.search);
  var urlCarrier = urlParams.get('carrier');

  // Window mode is true ONLY if:
  // 1. Inside an iframe (e.g. floatwin on web page)
  // 2. Explicitly loaded with carrier=window / popup / floatwin
  var isWindowMode = inIframe ||
    urlCarrier === 'window' ||
    urlCarrier === 'popup' ||
    urlCarrier === 'floatwin';

  function setCarrierMode(isWin) {
    isWindowMode = !!isWin;
    if (isWindowMode) {
      document.body.classList.add('is-window');
      document.body.classList.remove('is-sidepanel');
    } else {
      document.body.classList.add('is-sidepanel');
      document.body.classList.remove('is-window');
    }
    updateContextButton();
  }

  function updateContextButton() {
    if (!ctxBtn) return;
    if (isWindowMode) {
      // 弹窗中：只显示【📑 打开侧边栏】小图标，绝不显示开小窗！
      if (ctxBtnIcon) ctxBtnIcon.textContent = '📑';
      if (ctxBtnText) ctxBtnText.textContent = '打开侧边栏';
      ctxBtn.title = '打开侧边栏 (在浏览器侧边栏继续玩)';
      ctxBtn.setAttribute('aria-label', '打开侧边栏');
    } else {
      // 侧边栏中：保持原样，只显示【🪟 开小窗】图文按钮，绝不显示打开侧边栏！
      if (ctxBtnIcon) ctxBtnIcon.textContent = '🪟';
      if (ctxBtnText) ctxBtnText.textContent = '开小窗';
      ctxBtn.title = '开小窗 (在网页开启悬浮小窗)';
      ctxBtn.setAttribute('aria-label', '开小窗');
    }
  }

  // Double-check via chrome.windows API if available
  if (!inIframe && typeof chrome !== 'undefined' && chrome.windows && chrome.windows.getCurrent) {
    try {
      chrome.windows.getCurrent(function (win) {
        if (chrome.runtime && chrome.runtime.lastError) return;
        if (win) {
          if (win.type === 'popup' || urlCarrier === 'window' || urlCarrier === 'popup') {
            setCarrierMode(true);
          } else {
            // Chrome 侧边栏属于主浏览器窗口 (win.type === 'normal')，严格保持侧边栏模式！
            setCarrierMode(false);
          }
        }
      });
    } catch (e) {}
  }

  setCarrierMode(isWindowMode);

  function openSmallWindow(cb) {
    var targetGid = (currentGame && currentGame.id) || currentId;
    var w = 440, h = 640;
    var left = Math.max(0, Math.round((screen.availWidth - w) / 2));
    var top = Math.max(0, Math.round((screen.availHeight - h) / 2));

    if (targetGid) {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({
            'omg:activeView': 'player',
            'omg:activeGame': targetGid,
            'omg:lastGame': targetGid
          });
        }
      } catch (e) {}
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'openPopoutWindow',
        gameId: targetGid,
        left: left,
        top: top,
        width: w,
        height: h
      }, function () {
        if (typeof cb === 'function') cb();
      });
    } else if (typeof chrome !== 'undefined' && chrome.windows && chrome.windows.create) {
      var targetUrl = 'surface.html?carrier=window' + (targetGid ? ('&gameId=' + encodeURIComponent(targetGid)) : '');
      chrome.windows.create({
        url: chrome.runtime.getURL(targetUrl),
        type: 'popup',
        width: w,
        height: h,
        left: left,
        top: top,
        focused: true
      }, function () {
        if (typeof cb === 'function') cb();
      });
    } else {
      window.open('surface.html?carrier=window', '_blank', 'width=' + w + ',height=' + h);
      if (typeof cb === 'function') cb();
    }
  }

  if (ctxBtn) {
    ctxBtn.addEventListener('click', function () {
      if (isWindowMode) {
        // 在弹窗中点击 "打开侧边栏"：
        var gid = (currentGame && currentGame.id) || currentId;
        try {
          if (gid && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({
              'omg:activeView': 'player',
              'omg:activeGame': gid,
              'omg:lastGame': gid
            });
          }
        } catch (e) {}

        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'openSidePanel', gameId: gid }, function () {
            setTimeout(function () {
              try { window.close(); } catch (e) {}
            }, 120);
          });
        }
      } else {
        // 在侧边栏中点击 "开小窗"：关闭当前侧边栏，再打开小窗
        if (ctxBtnIcon) ctxBtnIcon.textContent = '⏳';
        if (ctxBtnText) ctxBtnText.textContent = '打开中...';

        openSmallWindow(function () {
          setTimeout(function () {
            try { window.close(); } catch (e) {}
          }, 60);
        });
      }
    });
  }

  if (centerBtn) {
    centerBtn.addEventListener('click', function () {
      if (inIframe) {
        parent.postMessage({ type: 'surface:centerWin' }, '*');
      } else if (typeof chrome !== 'undefined' && chrome.windows && chrome.windows.getCurrent) {
        chrome.windows.getCurrent(function (win) {
          if (win && win.id) {
            var w = win.width || 440;
            var h = win.height || 640;
            var left = Math.max(0, Math.round((screen.availWidth - w) / 2));
            var top = Math.max(0, Math.round((screen.availHeight - h) / 2));
            chrome.windows.update(win.id, { left: left, top: top });
          }
        });
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      if (inIframe) {
        parent.postMessage({ type: 'surface:closeWin' }, '*');
      } else {
        window.close();
      }
    });
  }

  // ---- Summon / Hide Floating Ball from Side Panel (Toggleable & Synced) -----
  var isBallVisible = true;

  function updateBallButton(visible) {
    isBallVisible = !!visible;
    if (summonBallIcon) {
      summonBallIcon.textContent = isBallVisible ? '🙈' : '🎮';
    }
    if (summonBallText) {
      summonBallText.textContent = isBallVisible ? '隐藏小球' : '召唤小球';
    }
    if (summonBallBtn) {
      summonBallBtn.title = isBallVisible
        ? '隐藏摸鱼小球 (快捷键 Option+Q)'
        : '召唤摸鱼小球 (快捷键 Option+Q)';
      summonBallBtn.setAttribute('aria-label', isBallVisible ? '隐藏小球' : '召唤小球');
    }
  }

  function queryBallState() {
    if (inIframe) return;
    if (typeof chrome === 'undefined') return;

    // 1. Read storage first (fast cache)
    if (chrome.storage && chrome.storage.local) {
      try {
        chrome.storage.local.get('omg:ballVisible', function (o) {
          if (chrome.runtime && chrome.runtime.lastError) return;
          if (o && typeof o['omg:ballVisible'] === 'boolean') {
            updateBallButton(o['omg:ballVisible']);
          }
        });
      } catch (e) {}
    }

    // 2. Query active tab for real-time live state
    getActiveWebTab(function (t) {
      if (!t || !t.id) return;
      chrome.tabs.sendMessage(t.id, { type: 'queryBallState' }, function (res) {
        if (!chrome.runtime.lastError && res && typeof res.visible === 'boolean') {
          updateBallButton(res.visible);
        }
      });
    });
  }

  if (inIframe && summonBallBtn) {
    summonBallBtn.style.display = 'none';
  } else if (summonBallBtn) {
    summonBallBtn.addEventListener('click', function () {
      if (typeof chrome === 'undefined' || !chrome.tabs) return;
      getActiveWebTab(function (t) {
        if (!t || !t.id) return;

        function doToggle() {
          chrome.tabs.sendMessage(t.id, { type: 'toggleBall' }, function (res) {
            if (!chrome.runtime.lastError && res && typeof res.visible === 'boolean') {
              updateBallButton(res.visible);
            } else {
              updateBallButton(!isBallVisible);
            }
          });
        }

        chrome.tabs.sendMessage(t.id, { type: 'toggleBall' }, function (res) {
          if (chrome.runtime.lastError || !res || !res.ok) {
            if (chrome.scripting && chrome.scripting.executeScript) {
              chrome.scripting
                .executeScript({
                  target: { tabId: t.id },
                  files: ['games/_shared/catalog.js', 'content.js']
                })
                .then(function () {
                  setTimeout(doToggle, 120);
                })
                .catch(function () {});
            }
          } else {
            updateBallButton(res.visible);
          }
        });
      });
    });
  }

  // ---- Best-score formatting (mirrors popup.js) ------------------------------
  function fmtBest(game, val) {
    if (val == null) return '—';
    if (game.metric === 'time') return (val / 1000).toFixed(1) + 's';
    if (game.metric === 'percent') return val.toFixed(1) + '%';
    return String(val);
  }

  function loadBest(game, cell) {
    if (!window.GameStore) return;
    var p =
      game.metric === 'time'
        ? window.GameStore.getBestTime(game.id)
        : window.GameStore.getBest(game.id);
    p.then(function (v) {
      cell.textContent = fmtBest(game, v);
    });
  }

  // ---- Catalog grid & Search/Category Filtering ----------------------------
  // ---- Catalog grid & Search/Category/Favorites Filtering -------------------
  var allGamesList = [];
  var currentCat = 'all';
  var searchQuery = '';
  var favoriteSet = new Set();
  var recentGamesList = [];
  var isMasterMuted = false;

  var searchInput = document.getElementById('surfSearchInput');
  var searchClear = document.getElementById('surfSearchClear');
  var countBadge = document.getElementById('surfCountBadge');
  var favCountBadge = document.getElementById('favCountBadge');
  var origCountBadge = document.getElementById('origCountBadge');
  var catPills = document.querySelectorAll('.surf-cat-pill');
  var surfEmpty = document.getElementById('surfEmpty');
  var surfEmptyReset = document.getElementById('surfEmptyReset');
  var surfRecentBar = document.getElementById('surfRecentBar');
  var surfRecentList = document.getElementById('surfRecentList');
  var surfRecentClear = document.getElementById('surfRecentClear');
  var surfMuteBtn = document.getElementById('surfMuteBtn');
  var playerMuteBtn = document.getElementById('playerMuteBtn');
  var playerFavBtn = document.getElementById('playerFavBtn');
  var restartBtn = document.getElementById('restartBtn');
  var tabBtn = document.getElementById('tabBtn');
  var surfRandomBtn = document.getElementById('surfRandomBtn');
  var surfRandomModal = document.getElementById('surfRandomModal');
  var surfRandomClose = document.getElementById('surfRandomClose');
  var surfRandomEmoji = document.getElementById('surfRandomEmoji');
  var surfRandomName = document.getElementById('surfRandomName');
  var surfRandomTag = document.getElementById('surfRandomTag');
  var surfRandomLaunch = document.getElementById('surfRandomLaunch');
  var surfRandomCountdown = document.getElementById('surfRandomCountdown');
  var surfRandomReroll = document.getElementById('surfRandomReroll');

  // ---- View Mode Switch (Grid ⊞ vs Compact List ☰) & Category Themes ---------
  var CAT_THEMES = {
    multiplayer: { name: '联机', color: '#f472b6', bg: 'rgba(244, 114, 182, 0.12)', border: 'rgba(244, 114, 182, 0.3)' },
    puzzle:      { name: '益智', color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.12)', border: 'rgba(167, 139, 250, 0.3)' },
    arcade:      { name: '街机', color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.12)',  border: 'rgba(34, 211, 238, 0.3)' },
    physics:     { name: '敏捷', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)',  border: 'rgba(251, 191, 36, 0.3)' },
    match:       { name: '消除', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.12)',  border: 'rgba(74, 222, 128, 0.3)' },
    board:       { name: '棋牌', color: '#818cf8', bg: 'rgba(129, 140, 248, 0.12)', border: 'rgba(129, 140, 248, 0.3)' }
  };
  var DEFAULT_THEME = { name: '精选', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)' };

  var currentViewMode = 'grid';
  try {
    currentViewMode = localStorage.getItem('omnigame_view_mode') || 'grid';
  } catch (e) {}

  var viewGridBtn = document.getElementById('viewGridBtn');
  var viewListBtn = document.getElementById('viewListBtn');

  function setViewMode(mode) {
    currentViewMode = mode === 'list' ? 'list' : 'grid';
    try {
      localStorage.setItem('omnigame_view_mode', currentViewMode);
    } catch (e) {}
    if (viewGridBtn) viewGridBtn.classList.toggle('active', currentViewMode === 'grid');
    if (viewListBtn) viewListBtn.classList.toggle('active', currentViewMode === 'list');
    document.body.classList.toggle('view-list', currentViewMode === 'list');
    filterGames();
  }

  if (viewGridBtn) {
    viewGridBtn.addEventListener('click', function () { setViewMode('grid'); });
  }
  if (viewListBtn) {
    viewListBtn.addEventListener('click', function () { setViewMode('list'); });
  }
  document.body.classList.toggle('view-list', currentViewMode === 'list');
  if (viewGridBtn) viewGridBtn.classList.toggle('active', currentViewMode === 'grid');
  if (viewListBtn) viewListBtn.classList.toggle('active', currentViewMode === 'list');

  // ---- Favorites Management ------------------------------------------------
  function loadFavorites() {
    if (window.GameStore && window.GameStore.getFavorites) {
      window.GameStore.getFavorites().then(function (favs) {
        favoriteSet = new Set(favs || []);
        updateFavBadge();
        updateCardFavButtons();
        updatePlayerFavBtn();
      });
    }
  }

  function updateFavBadge() {
    if (favCountBadge) {
      favCountBadge.textContent = String(favoriteSet.size);
    }
  }

  function updateCardFavButtons() {
    if (!grid) return;
    var favBtns = grid.querySelectorAll('.surf-card-fav');
    favBtns.forEach(function (btn) {
      var gid = btn.dataset.id;
      var isFav = favoriteSet.has(gid);
      btn.classList.toggle('active', isFav);
      btn.title = isFav ? '取消常用收藏' : '加入常用收藏';
    });
  }

  function updatePlayerFavBtn() {
    if (!playerFavBtn) return;
    if (!currentGame) return;
    var isFav = favoriteSet.has(currentGame.id);
    playerFavBtn.classList.toggle('active', isFav);
    playerFavBtn.title = isFav ? '点击取消常用收藏' : '加入常用收藏';
    var iconEl = playerFavBtn.querySelector('.fav-star-icon') || playerFavBtn.querySelector('.surf-btn-icon');
    var labelEl = playerFavBtn.querySelector('.surf-btn-label');
    if (iconEl) {
      if (isFav) {
        iconEl.setAttribute('fill', '#FBBF24');
        iconEl.setAttribute('stroke', '#F59E0B');
      } else {
        iconEl.setAttribute('fill', 'none');
        iconEl.setAttribute('stroke', 'currentColor');
      }
    }
    if (labelEl) {
      labelEl.textContent = isFav ? '已收藏' : '收藏';
    }
  }

  // ---- Recently-Played Management -------------------------------------------
  function loadRecents() {
    if (window.GameStore && window.GameStore.getRecents) {
      window.GameStore.getRecents().then(function (recents) {
        recentGamesList = recents || [];
        renderRecentBar();
      });
    }
  }

  function renderRecentBar() {
    if (!surfRecentBar || !surfRecentList) return;
    if (!recentGamesList || recentGamesList.length === 0) {
      surfRecentBar.hidden = true;
      return;
    }
    surfRecentList.innerHTML = '';
    var count = 0;
    recentGamesList.forEach(function (gid) {
      var g = allGamesList.find(function (item) { return item.id === gid; });
      if (!g) return;
      count++;
      var pill = document.createElement('button');
      pill.className = 'surf-recent-pill';
      pill.type = 'button';
      pill.innerHTML = '<span>' + (g.emoji || '🎮') + '</span><span>' + g.name + '</span>';
      pill.title = '最近玩过：' + g.name + ' (点击立即开局)';
      pill.addEventListener('click', function () {
        launch(g);
      });
      surfRecentList.appendChild(pill);
    });
    surfRecentBar.hidden = count === 0;
  }

  if (surfRecentClear) {
    surfRecentClear.addEventListener('click', function () {
      if (window.GameStore && window.GameStore.clearRecents) {
        window.GameStore.clearRecents().then(function () {
          recentGamesList = [];
          renderRecentBar();
        });
      }
    });
  }

  // ---- Master Sound / Mute Management (摸鱼静音 · 全局静音拦截引擎) -----------
  function installAudioPatch(win) {
    if (!win) return;
    try {
      if (win.__omniAudioPatched) {
        syncTrackedContexts(win);
        return;
      }
      win.__omniAudioPatched = true;
      var trackedContexts = (win.__omniTrackedAudioContexts = []);

      var AC = win.AudioContext || win.webkitAudioContext;
      if (AC) {
        var OrigAC = AC;
        var OrigProto = OrigAC.prototype;
        var OrigResume = OrigProto.resume;
        var OrigSuspend = OrigProto.suspend;
        var OrigCreateGain = OrigProto.createGain;

        // 1. 拦截 resume()：静音状态下禁止音频硬件恢复，欺骗游戏使其保持静默
        OrigProto.resume = function () {
          if (isMasterMuted) {
            return Promise.resolve();
          }
          return OrigResume.apply(this, arguments);
        };

        // 2. 拦截 AudioNode.prototype.connect：重定向 destination 到增益为 0 的静音节点
        var NodeProto = (win.AudioNode && win.AudioNode.prototype) || null;
        if (NodeProto && NodeProto.connect) {
          var OrigNodeConnect = NodeProto.connect;
          NodeProto.connect = function (dest) {
            try {
              if (this.context && this.context.__omniMasterGain && dest === this.context.destination) {
                dest = this.context.__omniMasterGain;
              }
            } catch (e) {}
            return OrigNodeConnect.call(this, dest);
          };
        }

        // 3. 代理 AudioContext 构造器，注册并注入物理静音增益控制器
        var PatchedAC = function () {
          var ctx = new OrigAC();
          try {
            var mg = OrigCreateGain.call(ctx);
            mg.gain.value = isMasterMuted ? 0 : 1;
            OrigProto.connect ? OrigProto.connect.call(mg, ctx.destination) : mg.connect(ctx.destination);
            ctx.__omniMasterGain = mg;
          } catch (e) {}

          trackedContexts.push(ctx);
          if (isMasterMuted) {
            try { OrigSuspend.call(ctx); } catch (e) {}
          }
          return ctx;
        };
        PatchedAC.prototype = OrigProto;
        win.AudioContext = PatchedAC;
        if (win.webkitAudioContext) win.webkitAudioContext = PatchedAC;
      }

      // 4. 拦截 HTML5 Audio / Video 标签与 new Audio()
      if (win.HTMLMediaElement && win.HTMLMediaElement.prototype) {
        var MediaProto = win.HTMLMediaElement.prototype;
        var OrigMediaPlay = MediaProto.play;
        MediaProto.play = function () {
          if (isMasterMuted) {
            this.muted = true;
            this.volume = 0;
          }
          return OrigMediaPlay.apply(this, arguments);
        };
      }
    } catch (e) {}
  }

  function syncTrackedContexts(win) {
    if (!win) return;
    try {
      var contexts = win.__omniTrackedAudioContexts || [];
      contexts.forEach(function (ctx) {
        try {
          if (ctx.__omniMasterGain && ctx.__omniMasterGain.gain) {
            ctx.__omniMasterGain.gain.value = isMasterMuted ? 0 : 1;
          }
          if (isMasterMuted) {
            var susp = Object.getPrototypeOf(ctx).suspend || ctx.suspend;
            if (susp) susp.call(ctx);
          } else {
            var res = Object.getPrototypeOf(ctx).resume || ctx.resume;
            if (res) res.call(ctx);
          }
        } catch (e) {}
      });
    } catch (e) {}
  }

  function applyIframeMute() {
    try {
      try {
        localStorage.setItem('omnigame:masterMute', isMasterMuted ? '1' : '0');
      } catch (e) {}

      if (frame && frame.contentWindow) {
        installAudioPatch(frame.contentWindow);
        syncTrackedContexts(frame.contentWindow);

        if (frame.contentDocument) {
          var audios = frame.contentDocument.querySelectorAll('audio, video');
          audios.forEach(function (a) {
            a.muted = isMasterMuted;
            if (isMasterMuted) a.volume = 0;
            else a.volume = 1;
          });
        }

        try {
          frame.contentWindow.postMessage({ type: 'omnigame:setMute', muted: isMasterMuted }, '*');
        } catch (e) {}
      }
    } catch (e) {}
  }

  var SVG_MUTE_SOUND_ON = '<svg class="surf-btn-icon mute-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 4.5L5 7.5H2.5v5H5l3.5 3V4.5z"/><path d="M12.5 7a4 4 0 0 1 0 6"/><path d="M14.5 4.5a7.5 7.5 0 0 1 0 11"/></svg>';
  var SVG_MUTE_SOUND_MUTED = '<svg class="surf-btn-icon mute-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 4.5L5 7.5H2.5v5H5l3.5 3V4.5z"/><line x1="12" y1="7.5" x2="17" y2="12.5"/><line x1="17" y1="7.5" x2="12" y2="12.5"/></svg>';

  function isOriginalGame(g) {
    if (!g) return false;
    return !!(
      g.original === true ||
      (g.badge && (g.badge.indexOf('自研') !== -1 || g.badge.indexOf('原创') !== -1)) ||
      (g.tagline && (g.tagline.indexOf('自研') !== -1 || g.tagline.indexOf('原创') !== -1))
    );
  }

  function updateMuteUI() {
    var tip = isMasterMuted ? '当前已静音 (点击开启声音)' : '一键静音 (点击进入静音摸鱼模式)';
    if (surfMuteBtn) {
      surfMuteBtn.innerHTML = isMasterMuted ? SVG_MUTE_SOUND_MUTED : SVG_MUTE_SOUND_ON;
      surfMuteBtn.title = tip;
      surfMuteBtn.classList.toggle('surf-top-btn-accent', isMasterMuted);
    }
    if (playerMuteBtn) {
      playerMuteBtn.innerHTML = isMasterMuted ? SVG_MUTE_SOUND_MUTED : SVG_MUTE_SOUND_ON;
      playerMuteBtn.title = tip;
      playerMuteBtn.classList.toggle('active', isMasterMuted);
    }
    applyIframeMute();
  }

  function toggleMasterMute() {
    isMasterMuted = !isMasterMuted;
    if (window.GameStore && window.GameStore.setMasterMute) {
      window.GameStore.setMasterMute(isMasterMuted);
    }
    updateMuteUI();
  }

  if (surfMuteBtn) surfMuteBtn.addEventListener('click', toggleMasterMute);
  if (playerMuteBtn) playerMuteBtn.addEventListener('click', toggleMasterMute);

  if (frame) {
    frame.addEventListener('load', function () {
      installAudioPatch(frame.contentWindow);
      applyIframeMute();
    });
  }

  // ---- Filtering & Grid Rendering -------------------------------------------
  function filterGames() {
    var filtered = allGamesList.filter(function (g) {
      if (!g || !g.id) return false;

      // 1. Category filter
      if (currentCat === 'fav') {
        if (!favoriteSet.has(g.id)) return false;
      } else if (currentCat === 'original') {
        if (!isOriginalGame(g)) return false;
      } else if (currentCat === 'hot') {
        if (!g.hot) return false;
      } else if (currentCat === 'multiplayer') {
        if (g.category !== 'multiplayer' && (!g.badge || !/联机/.test(g.badge))) return false;
      } else if (currentCat !== 'all') {
        if (g.category !== currentCat) return false;
      }

      // 2. Smart Search Query Filter (supports pinyin initials, full pinyin, keywords, id, name)
      if (searchQuery) {
        if (window.OmniCatalog && window.OmniCatalog.matchGame) {
          return window.OmniCatalog.matchGame(g, searchQuery);
        }
        var q = searchQuery.toLowerCase().trim();
        return (g.name || '').toLowerCase().indexOf(q) !== -1 ||
               (g.tagline || '').toLowerCase().indexOf(q) !== -1 ||
               (g.id || '').toLowerCase().indexOf(q) !== -1 ||
               (g.keywords || '').toLowerCase().indexOf(q) !== -1;
      }

      return true;
    });

    renderFilteredGrid(filtered);
  }

  function renderFilteredGrid(list) {
    grid.innerHTML = '';
    if (countBadge) {
      countBadge.textContent = list.length + ' 款';
    }

    if (list.length === 0) {
      if (surfEmpty) {
        surfEmpty.classList.remove('hidden');
        var emptyTitle = surfEmpty.querySelector('.surf-empty-title');
        var emptyDesc = surfEmpty.querySelector('.surf-empty-desc');
        if (currentCat === 'fav' && !searchQuery) {
          if (emptyTitle) emptyTitle.textContent = '暂无收藏的游戏';
          if (emptyDesc) emptyDesc.textContent = '点击卡片右上角 ★ 即可将喜欢的游戏加入常用收藏！';
        } else if (currentCat === 'original' && !searchQuery) {
          if (emptyTitle) emptyTitle.textContent = '暂无自研游戏';
          if (emptyDesc) emptyDesc.textContent = '即将推出更多原创自研游戏，敬请期待！';
        } else {
          if (emptyTitle) emptyTitle.textContent = '未找到相关游戏';
          if (emptyDesc) emptyDesc.textContent = '换个关键词试试，或点击下方按钮重置筛选';
        }
      }
      return;
    }
    if (surfEmpty) surfEmpty.classList.add('hidden');

    list.forEach(function (g) {
      var isFav = favoriteSet.has(g.id);
      var catKey = g.category || g.cat || 'all';
      var theme = CAT_THEMES[catKey] || DEFAULT_THEME;

      if (currentViewMode === 'list') {
        // --- 紧凑列表行视图 (Steam/Linear/Raycast 质感) ---
        var row = document.createElement('div');
        row.className = 'surf-list-row';
        row.setAttribute('role', 'listitem');
        row.innerHTML =
          '<div class="surf-row-icon" style="background:' + theme.bg + '; border:1px solid ' + theme.border + ';">' +
            (g.emoji || '🎮') +
          '</div>' +
          '<div class="surf-row-main">' +
            '<div class="surf-row-title-row">' +
              '<span class="surf-row-name">' + g.name + '</span>' +
              '<span class="surf-card-cat-pill" style="color:' + theme.color + '; border-color:' + theme.border + '; background:' + theme.bg + ';">' +
                theme.name +
              '</span>' +
            '</div>' +
            '<div class="surf-row-desc">' + (g.tagline || '') + '</div>' +
          '</div>' +
          '<div class="surf-row-meta">' +
            '<span class="surf-card-best">🏆 <span data-best="' + g.id + '">…</span></span>' +
          '</div>' +
          '<div class="surf-row-actions">' +
            '<button type="button" class="surf-card-info-btn" title="查看玩法说明">ℹ</button>' +
            '<button type="button" class="surf-card-fav ' + (isFav ? 'active' : '') + '" data-id="' + g.id + '" title="' + (isFav ? '取消常用收藏' : '加入常用收藏') + '" aria-label="收藏">★</button>' +
            '<button type="button" class="surf-row-play-btn">开玩 ▷</button>' +
          '</div>';

        var rowInfoBtn = row.querySelector('.surf-card-info-btn');
        if (rowInfoBtn) {
          rowInfoBtn.addEventListener('mouseenter', function (e) {
            e.stopPropagation();
            showTooltip(g, rowInfoBtn);
          });
          rowInfoBtn.addEventListener('mouseleave', function (e) {
            e.stopPropagation();
            hideTooltip();
          });
          rowInfoBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleTooltip(g, rowInfoBtn);
          });
        }

        var rowFavBtn = row.querySelector('.surf-card-fav');
        if (rowFavBtn) {
          rowFavBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (window.GameStore && window.GameStore.toggleFavorite) {
              window.GameStore.toggleFavorite(g.id).then(function (isNowFav) {
                if (isNowFav) favoriteSet.add(g.id);
                else favoriteSet.delete(g.id);
                rowFavBtn.classList.toggle('active', isNowFav);
                rowFavBtn.title = isNowFav ? '取消常用收藏' : '加入常用收藏';
                updateFavBadge();
                if (currentCat === 'fav') filterGames();
              });
            }
          });
        }

        row.addEventListener('click', function () {
          hideTooltip();
          launch(g);
        });

        grid.appendChild(row);
        loadBest(g, row.querySelector('[data-best="' + g.id + '"]'));
      } else {
        // --- 现代暗黑超质感卡片视图 (Unified Cyber Surface) ---
        var card = document.createElement('button');
        card.className = 'surf-card';
        card.setAttribute('role', 'listitem');
        card.style.setProperty('--card-accent', theme.color);
        card.innerHTML =
          '<div class="surf-card-top">' +
            '<div class="surf-card-icon" style="background:' + theme.bg + '; border:1px solid ' + theme.border + ';">' +
              (g.emoji || '🎮') +
            '</div>' +
            '<div class="surf-card-top-meta">' +
              '<span class="surf-card-cat-pill" style="color:' + theme.color + '; border-color:' + theme.border + '; background:' + theme.bg + ';">' +
                theme.name +
              '</span>' +
              '<button type="button" class="surf-card-info-btn" title="查看玩法说明">ℹ</button>' +
              '<button type="button" class="surf-card-fav ' + (isFav ? 'active' : '') + '" data-id="' + g.id + '" title="' + (isFav ? '取消常用收藏' : '加入常用收藏') + '" aria-label="收藏">★</button>' +
            '</div>' +
          '</div>' +
          '<div class="surf-card-content">' +
            '<div class="surf-card-name" title="' + g.name + '">' +
              g.name +
            '</div>' +
            '<div class="surf-card-tag" title="' + (g.tagline || '') + '">' +
              (g.tagline || '') +
            '</div>' +
          '</div>' +
          '<div class="surf-card-footer">' +
            '<div class="surf-card-best">🏆 <span data-best="' + g.id + '">…</span></div>' +
            '<div class="surf-card-play-hint">开玩 ▷</div>' +
          '</div>';

        var cardInfoBtn = card.querySelector('.surf-card-info-btn');
        if (cardInfoBtn) {
          cardInfoBtn.addEventListener('mouseenter', function (e) {
            e.stopPropagation();
            showTooltip(g, cardInfoBtn);
          });
          cardInfoBtn.addEventListener('mouseleave', function (e) {
            e.stopPropagation();
            hideTooltip();
          });
          cardInfoBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleTooltip(g, cardInfoBtn);
          });
        }

        var cardFavBtn = card.querySelector('.surf-card-fav');
        if (cardFavBtn) {
          cardFavBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (window.GameStore && window.GameStore.toggleFavorite) {
              window.GameStore.toggleFavorite(g.id).then(function (isNowFav) {
                if (isNowFav) favoriteSet.add(g.id);
                else favoriteSet.delete(g.id);
                cardFavBtn.classList.toggle('active', isNowFav);
                cardFavBtn.title = isNowFav ? '取消常用收藏' : '加入常用收藏';
                updateFavBadge();
                if (currentCat === 'fav') filterGames();
              });
            }
          });
        }

        card.addEventListener('click', function () {
          hideTooltip();
          launch(g);
        });

        grid.appendChild(card);
        loadBest(g, card.querySelector('[data-best="' + g.id + '"]'));
      }
    });
  }

  function updateOriginalBadge() {
    if (origCountBadge && allGamesList && allGamesList.length > 0) {
      var count = allGamesList.filter(isOriginalGame).length;
      origCountBadge.textContent = String(count);
    }
  }

  function renderGamesList(games) {
    allGamesList = (games && games.length > 0) ? games : (window.OMNIGAME_GAMES || []);
    updateOriginalBadge();
    filterGames();
  }

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      searchQuery = searchInput.value;
      if (searchClear) searchClear.hidden = !searchQuery;
      filterGames();
    });
  }
  if (searchClear) {
    searchClear.addEventListener('click', function () {
      if (searchInput) searchInput.value = '';
      searchQuery = '';
      searchClear.hidden = true;
      if (searchInput) searchInput.focus();
      filterGames();
    });
  }
  if (catPills && catPills.length > 0) {
    catPills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        catPills.forEach(function (p) {
          p.classList.remove('active');
          p.setAttribute('aria-selected', 'false');
        });
        pill.classList.add('active');
        pill.setAttribute('aria-selected', 'true');
        currentCat = pill.dataset.cat || 'all';
        filterGames();
      });
    });
  }
  if (surfEmptyReset) {
    surfEmptyReset.addEventListener('click', function () {
      if (searchInput) searchInput.value = '';
      searchQuery = '';
      if (searchClear) searchClear.hidden = true;
      currentCat = 'all';
      if (catPills && catPills.length > 0) {
        catPills.forEach(function (p) {
          p.classList.toggle('active', p.dataset.cat === 'all');
          p.setAttribute('aria-selected', p.dataset.cat === 'all' ? 'true' : 'false');
        });
      }
      filterGames();
    });
  }

  // ---- Random Game (摸鱼盲盒) Lottery -----------------------------------------
  var currentPickedRandomGame = null;
  var randomCountdownTimer = null;
  var randomSpinTimer = null;

  function closeRandomModal() {
    if (surfRandomModal) surfRandomModal.hidden = true;
    if (randomCountdownTimer) {
      clearInterval(randomCountdownTimer);
      randomCountdownTimer = null;
    }
    if (randomSpinTimer) {
      clearInterval(randomSpinTimer);
      randomSpinTimer = null;
    }
  }

  function rollRandomGame() {
    if (!allGamesList || allGamesList.length === 0) return;
    if (surfRandomModal) surfRandomModal.hidden = false;
    if (randomCountdownTimer) clearInterval(randomCountdownTimer);
    if (randomSpinTimer) clearInterval(randomSpinTimer);

    if (surfRandomLaunch) surfRandomLaunch.disabled = true;

    var step = 0;
    randomSpinTimer = setInterval(function () {
      var temp = allGamesList[Math.floor(Math.random() * allGamesList.length)];
      if (surfRandomEmoji) {
        surfRandomEmoji.textContent = temp.emoji || '🎲';
        surfRandomEmoji.style.transform = (step % 2 === 0) ? 'rotate(-12deg) scale(1.15)' : 'rotate(12deg) scale(1.15)';
      }
      if (surfRandomName) surfRandomName.textContent = temp.name;
      if (surfRandomTag) surfRandomTag.textContent = temp.tagline || '精选小游戏';
      step++;

      if (step >= 10) {
        clearInterval(randomSpinTimer);
        randomSpinTimer = null;
        var chosen = allGamesList[Math.floor(Math.random() * allGamesList.length)];
        currentPickedRandomGame = chosen;
        if (surfRandomEmoji) {
          surfRandomEmoji.textContent = chosen.emoji || '🎲';
          surfRandomEmoji.style.transform = 'scale(1.25)';
          setTimeout(function () { if (surfRandomEmoji) surfRandomEmoji.style.transform = 'none'; }, 200);
        }
        if (surfRandomName) surfRandomName.textContent = chosen.name;
        if (surfRandomTag) surfRandomTag.textContent = chosen.tagline || '精选好玩小游戏';
        if (surfRandomLaunch) surfRandomLaunch.disabled = false;

        var timeLeft = 3;
        if (surfRandomCountdown) surfRandomCountdown.textContent = String(timeLeft);
        randomCountdownTimer = setInterval(function () {
          timeLeft--;
          if (surfRandomCountdown) surfRandomCountdown.textContent = String(timeLeft);
          if (timeLeft <= 0) {
            clearInterval(randomCountdownTimer);
            randomCountdownTimer = null;
            closeRandomModal();
            if (currentPickedRandomGame) launch(currentPickedRandomGame);
          }
        }, 1000);
      }
    }, 45);
  }

  if (surfRandomBtn) surfRandomBtn.addEventListener('click', rollRandomGame);
  if (surfRandomClose) surfRandomClose.addEventListener('click', closeRandomModal);
  if (surfRandomReroll) surfRandomReroll.addEventListener('click', rollRandomGame);
  if (surfRandomLaunch) {
    surfRandomLaunch.addEventListener('click', function () {
      closeRandomModal();
      if (currentPickedRandomGame) launch(currentPickedRandomGame);
    });
  }
  if (surfRandomModal) {
    surfRandomModal.addEventListener('click', function (e) {
      if (e.target === surfRandomModal) closeRandomModal();
    });
  }

  // ---- Player Toolbar Extra Controls ----------------------------------------
  if (restartBtn) {
    restartBtn.addEventListener('click', function () {
      if (frame && currentGame) {
        var src = frame.src;
        frame.src = 'about:blank';
        setTimeout(function () {
          frame.src = src;
        }, 80);
      }
    });
  }

  if (playerFavBtn) {
    playerFavBtn.addEventListener('click', function () {
      if (!currentGame) return;
      if (window.GameStore && window.GameStore.toggleFavorite) {
        window.GameStore.toggleFavorite(currentGame.id).then(function (isNowFav) {
          if (isNowFav) favoriteSet.add(currentGame.id);
          else favoriteSet.delete(currentGame.id);
          updatePlayerFavBtn();
          updateFavBadge();
          updateCardFavButtons();
        });
      }
    });
  }

  if (tabBtn) {
    tabBtn.addEventListener('click', function () {
      if (!currentGame) return;
      var u = currentGame.url || ('games/' + currentGame.id + '/index.html');
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: chrome.runtime.getURL(u) });
      } else {
        window.open(u, '_blank');
      }
    });
  }

  // ---- Auto-hiding Top Header (Hover-to-reveal) ------------------------------
  var headerArea = document.getElementById('surfHeaderArea');
  var triggerEl = document.getElementById('surfHoverTrigger');
  var pinBtn = document.getElementById('surfPinBtn');
  var hideTimer = null;
  var isPinned = false;

  try {
    isPinned = localStorage.getItem('omg:headerPinned') === 'true';
  } catch (e) {}

  function applyPinState() {
    if (isPinned) {
      document.body.classList.add('header-pinned');
      if (pinBtn) {
        pinBtn.textContent = '📍';
        pinBtn.title = '取消固定顶部栏 (当前已固定，点击恢复悬停自显)';
        pinBtn.setAttribute('aria-label', '已固定');
        pinBtn.classList.add('surf-top-btn-accent');
      }
    } else {
      document.body.classList.remove('header-pinned');
      if (pinBtn) {
        pinBtn.textContent = '📌';
        pinBtn.title = '固定顶部栏 (当前为悬停自显，点击固定常驻)';
        pinBtn.setAttribute('aria-label', '固定顶部栏');
        pinBtn.classList.remove('surf-top-btn-accent');
      }
    }
  }
  applyPinState();

  if (pinBtn) {
    pinBtn.addEventListener('click', function () {
      isPinned = !isPinned;
      try {
        localStorage.setItem('omg:headerPinned', isPinned ? 'true' : 'false');
      } catch (e) {}
      applyPinState();
    });
  }

  function showHeader() {
    if (headerArea && !document.body.classList.contains('in-player')) {
      headerArea.classList.add('visible');
    }
  }

  function scheduleHide() {
    // Top header is permanently in document flow without occlusion
  }

  // Header is permanently visible and sticky at the top without occlusion

  if (searchInput) {
    searchInput.addEventListener('focus', function () {
      if (isWindowMode) showHeader();
    });
    searchInput.addEventListener('blur', function () {
      if (isWindowMode) scheduleHide(300);
    });
  }

  window.addEventListener('keydown', function (e) {
    if (!isWindowMode) return;
    if (e.key === 'Escape' && !isPinned && headerArea && headerArea.classList.contains('visible')) {
      if (searchInput && document.activeElement === searchInput) {
        searchInput.blur();
      }
      headerArea.classList.remove('visible');
    }
  });

  function render() {
    var p = window.OmniCatalog && window.OmniCatalog.getAll
      ? window.OmniCatalog.getAll()
      : Promise.resolve(window.OMNIGAME_GAMES || []);

    p.then(function (games) {
      renderGamesList(games);
    }).catch(function () {
      renderGamesList(window.OMNIGAME_GAMES || []);
    });
  }

  function launch(g) {
    currentId = g.id;
    currentGame = g;
    playerTitle.textContent = g.name;
    updatePlayerFavBtn();
    updateMuteUI();
    var targetUrl = g.url || (isExtValid() && chrome.runtime && chrome.runtime.getURL
      ? chrome.runtime.getURL('games/' + g.id + '/index.html')
      : 'games/' + g.id + '/index.html');
    frame.src = targetUrl;
    var patchCount = 0;
    var patchTimer = setInterval(function () {
      patchCount++;
      if (frame && frame.contentWindow) {
        installAudioPatch(frame.contentWindow);
        applyIframeMute();
      }
      if (patchCount >= 20) clearInterval(patchTimer);
    }, 30);
    document.body.classList.add('in-player');
    if (headerArea) headerArea.classList.remove('visible');
    home.classList.add('hidden');
    player.classList.remove('hidden');

    if (window.GameStore && window.GameStore.recordPlay) {
      window.GameStore.recordPlay(g.id).then(function () {
        loadRecents();
      });
    }

    try {
      if (isExtValid() && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          'omg:activeView': 'player',
          'omg:activeGame': g.id,
          'omg:lastGame': g.id
        });
      }
    } catch (e) {}
  }

  function showHome() {
    currentId = null;
    currentGame = null;
    if (frame) frame.src = 'about:blank';
    document.body.classList.remove('in-player');
    if (isWindowMode && headerArea && !isPinned) headerArea.classList.remove('visible');
    player.classList.add('hidden');
    home.classList.remove('hidden');
    loadRecents();
    loadFavorites();
    try {
      if (isExtValid() && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          'omg:activeView': 'home',
          'omg:activeGame': null
        });
      }
    } catch (e) {}
    render(); // refresh best scores and recents after a play session
  }

  function launchById(targetId) {
    if (!targetId) {
      showHome();
      return;
    }
    var p = window.OmniCatalog && window.OmniCatalog.getAll
      ? window.OmniCatalog.getAll()
      : Promise.resolve(window.OMNIGAME_GAMES || []);
    p.then(function (games) {
      var g = (games || []).find(function (item) { return item.id === targetId; });
      if (g) launch(g);
      else showHome();
    }).catch(function () {
      var g = (window.OMNIGAME_GAMES || []).find(function (item) { return item.id === targetId; });
      if (g) launch(g);
      else showHome();
    });
  }

  backBtn.addEventListener('click', showHome);

  // Global Boss Key (Esc & Alt+Q/Option+Q)
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (surfRandomModal && !surfRandomModal.hidden) {
        closeRandomModal();
        return;
      }
      if (document.body.classList.contains('in-player')) {
        showHome();
        return;
      }
      if (searchInput && document.activeElement === searchInput) {
        searchInput.blur();
      }
      if (isWindowMode && headerArea && !isPinned) {
        headerArea.classList.remove('visible');
      }
    }
    var isKeyQ = e.code === 'KeyQ' || e.key === 'q' || e.key === 'Q' || e.key === 'œ' || e.key === 'Œ';
    if ((e.altKey || (e.ctrlKey && e.altKey)) && isKeyQ) {
      e.preventDefault();
      if (document.body.classList.contains('in-player')) {
        showHome();
      } else if (isWindowMode) {
        window.close();
      }
    }
  });

  window.addEventListener('message', function (e) {
    if (!e || !e.data) return;
    if (e.data.type === 'omnigame:home') showHome();
    if (e.data.type === 'omnigame:launch' && e.data.gameId) {
      launchById(e.data.gameId);
    }
    if (e.data.type === 'omnigame:record' && window.GameStore) {
      var d = e.data;
      if (d.metric === 'time') GameStore.setBestTime(d.id, d.value);
      else GameStore.setBest(d.id, d.value);
    }
  });

  // ---- Sync game when switched from float window to side panel --------------
  if (isExtValid() && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (!inIframe && msg && msg.type === 'omnigame:syncGame') {
        if (msg.gameId) {
          launchById(msg.gameId);
        } else {
          showHome();
        }
      }
    });
  }

  if (isExtValid() && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'local') {
        if (!inIframe && changes['omg:activeView']) {
          var view = changes['omg:activeView'].newValue;
          if (view === 'home') {
            showHome();
          } else if (view === 'player') {
            var gid = changes['omg:activeGame'] ? changes['omg:activeGame'].newValue : null;
            if (gid && gid !== currentId) {
              launchById(gid);
            }
          }
        }
        if (!inIframe && changes['omg:ballVisible']) {
          updateBallButton(changes['omg:ballVisible'].newValue);
        }
        if (changes['omnigame:favorites']) {
          favoriteSet = new Set(changes['omnigame:favorites'].newValue || []);
          updateFavBadge();
          updateCardFavButtons();
          updatePlayerFavBtn();
          if (currentCat === 'fav') filterGames();
        }
        if (changes['omnigame:recent_games']) {
          recentGamesList = changes['omnigame:recent_games'].newValue || [];
          renderRecentBar();
        }
        if (changes['omnigame:master_muted']) {
          isMasterMuted = !!changes['omnigame:master_muted'].newValue;
          updateMuteUI();
        }
      }
    });
  }

  if (isExtValid() && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (!inIframe && msg && msg.type === 'omnigame:ballStateChanged' && typeof msg.visible === 'boolean') {
        updateBallButton(msg.visible);
      }
    });
  }

  if (isExtValid() && chrome.tabs && chrome.tabs.onActivated) {
    chrome.tabs.onActivated.addListener(function () {
      queryBallState();
    });
  }

  // Open external links reliably in a new browser tab
  function setupExternalLinks() {
    var extLinks = document.querySelectorAll('a[href^="http"]');
    extLinks.forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var url = link.getAttribute('href');
        if (!url) return;
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
          chrome.tabs.create({ url: url });
        } else {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      });
    });
  }

  // ---- Resume: synchronize view state across carriers -----------------------
  function init() {
    setupExternalLinks();

    if (window.GameStore && window.GameStore.getMasterMute) {
      window.GameStore.getMasterMute().then(function (muted) {
        isMasterMuted = !!muted;
        updateMuteUI();
      });
    }

    loadFavorites();
    loadRecents();
    render();
    queryBallState();

    var paramGid = urlParams.get('gameId');
    if (paramGid) {
      launchById(paramGid);
      return;
    }

    try {
      if (isExtValid() && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['omg:activeView', 'omg:activeGame'], function (o) {
          if (!isExtValid() || (chrome.runtime && chrome.runtime.lastError)) return;
          if (o && o['omg:activeView'] === 'player' && o['omg:activeGame']) {
            launchById(o['omg:activeGame']);
          } else {
            showHome();
          }
        });
      } else {
        showHome();
      }
    } catch (e) {
      showHome();
    }
  }

  init();
})();
