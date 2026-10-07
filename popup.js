/*
 * popup.js — OmniGame launcher controller.
 *
 * Full-featured launcher inside the browser action popup or dedicated tab:
 * - Smart search with Pinyin initials (e.g. wzq -> 五子棋, sl -> 扫雷, 2048)
 * - Category filter pills (全部, ⭐ 收藏, 🔥 热门, ⚔️ 联机, 🧩 益智, 💥 消除, ♟️ 棋牌, 🕹️ 街机, ⚡ 物理)
 * - Horizontal Recently-Played quick tray (🕒 最近常玩)
 * - 1-Click Master Mute / Boss Stealth mode (一键静音)
 * - Random Game Lottery Modal (🎲 摸鱼盲盒随心开局)
 * - Enhanced Player Toolbar (‹ 返回, 🔄 重开, ★ 收藏, ℹ️ 玩法, ↗ 大屏, 🔊 静音)
 * - Global Boss Key (Esc / Option+Q)
 * - Floating Ball summon toggle
 */
(function () {
  'use strict';

  var grid = document.getElementById('grid');
  var home = document.getElementById('home');
  var player = document.getElementById('player');
  var frame = document.getElementById('gameFrame');
  var playerTitle = document.getElementById('playerTitle');
  var backBtn = document.getElementById('backBtn');
  var restartBtn = document.getElementById('restartBtn');
  var playerFavBtn = document.getElementById('playerFavBtn');
  var tabBtn = document.getElementById('tabBtn');
  var playerMuteBtn = document.getElementById('playerMuteBtn');
  var howBtn = document.getElementById('howBtn');
  var tipEl = document.getElementById('gameHowTooltip');

  var searchInput = document.getElementById('popupSearchInput');
  var searchClear = document.getElementById('popupSearchClear');
  var countBadge = document.getElementById('popupCountBadge');
  var favCountBadge = document.getElementById('popupFavBadge');
  var popupOriginalBadge = document.getElementById('popupOriginalBadge');
  var catPills = document.querySelectorAll('.popup-cat-pill');
  var popupEmpty = document.getElementById('popupEmpty');
  var popupEmptyReset = document.getElementById('popupEmptyReset');

  var recentBar = document.getElementById('popupRecentBar');
  var recentList = document.getElementById('popupRecentList');
  var recentClear = document.getElementById('popupRecentClear');

  var popupMuteBtn = document.getElementById('popupMuteBtn');
  var popupRandomBtn = document.getElementById('popupRandomBtn');
  var popupRandomModal = document.getElementById('popupRandomModal');
  var popupRandomClose = document.getElementById('popupRandomClose');
  var popupRandomEmoji = document.getElementById('popupRandomEmoji');
  var popupRandomName = document.getElementById('popupRandomName');
  var popupRandomTag = document.getElementById('popupRandomTag');
  var popupRandomLaunch = document.getElementById('popupRandomLaunch');
  var popupRandomCountdown = document.getElementById('popupRandomCountdown');
  var popupRandomReroll = document.getElementById('popupRandomReroll');

  var popupSummonBallBtn = document.getElementById('popupSummonBallBtn');

  var currentId = null;
  var currentGame = null;
  var allGamesList = [];
  var currentCat = 'all';
  var searchQuery = '';
  var favoriteSet = new Set();
  var recentGamesList = [];
  var isMasterMuted = false;
  var isPopupBallVisible = true;

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

  var popupViewGridBtn = document.getElementById('popupViewGridBtn');
  var popupViewListBtn = document.getElementById('popupViewListBtn');

  function setViewMode(mode) {
    currentViewMode = mode === 'list' ? 'list' : 'grid';
    try {
      localStorage.setItem('omnigame_view_mode', currentViewMode);
    } catch (e) {}
    if (popupViewGridBtn) popupViewGridBtn.classList.toggle('active', currentViewMode === 'grid');
    if (popupViewListBtn) popupViewListBtn.classList.toggle('active', currentViewMode === 'list');
    document.body.classList.toggle('view-list', currentViewMode === 'list');
    filterGames();
  }

  if (popupViewGridBtn) {
    popupViewGridBtn.addEventListener('click', function () { setViewMode('grid'); });
  }
  if (popupViewListBtn) {
    popupViewListBtn.addEventListener('click', function () { setViewMode('list'); });
  }
  document.body.classList.toggle('view-list', currentViewMode === 'list');
  if (popupViewGridBtn) popupViewGridBtn.classList.toggle('active', currentViewMode === 'grid');
  if (popupViewListBtn) popupViewListBtn.classList.toggle('active', currentViewMode === 'list');

  // ---- Gameplay Tooltip Popover ----------------------------------------------
  function showTooltip(game, targetEl) {
    if (!game || !targetEl || !tipEl) return;
    tipEl.innerHTML = [
      '<div class="omg-tooltip-title"><span>' + (game.emoji || '🎮') + '</span> ' + game.name + (game.badge ? (' <span class="badge">' + game.badge + '</span>') : '') + '</div>',
      game.goal ? ('<div class="omg-tooltip-row"><span class="omg-tooltip-label">🎯 目标:</span><span class="omg-tooltip-val">' + game.goal + '</span></div>') : '',
      game.controls ? ('<div class="omg-tooltip-row"><span class="omg-tooltip-label">🕹️ 操作:</span><span class="omg-tooltip-val">' + game.controls + '</span></div>') : '',
      game.rules ? ('<div class="omg-tooltip-row"><span class="omg-tooltip-label">💡 规则:</span><span class="omg-tooltip-val">' + game.rules + '</span></div>') : '',
      game.tips ? ('<div class="omg-tooltip-tip">✨ 秘籍: ' + game.tips + '</div>') : ''
    ].join('');

    tipEl.hidden = false;
    tipEl.classList.add('visible');

    var r = targetEl.getBoundingClientRect();
    var tipW = tipEl.offsetWidth || 280;
    var tipH = tipEl.offsetHeight || 160;

    var top = r.bottom + 6;
    if (top + tipH > window.innerHeight - 10) {
      top = Math.max(10, r.top - tipH - 6);
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

  function fmtBest(game, val) {
    if (val == null) return '—';
    if (game.metric === 'time') return (val / 1000).toFixed(1) + 's';
    if (game.metric === 'percent') return val.toFixed(1) + '%';
    return String(val);
  }

  function loadBest(game, cell) {
    if (!window.GameStore || !cell) return;
    var p =
      game.metric === 'time'
        ? window.GameStore.getBestTime(game.id)
        : window.GameStore.getBest(game.id);
    p.then(function (v) {
      cell.textContent = fmtBest(game, v);
    });
  }

  // ---- Favorites Management --------------------------------------------------
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
    var favBtns = grid.querySelectorAll('.card-fav');
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
    var iconEl = playerFavBtn.querySelector('.fav-star-icon') || playerFavBtn.querySelector('.player-btn-icon');
    var labelEl = playerFavBtn.querySelector('.player-btn-label');
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

  // ---- Recently-Played Management ---------------------------------------------
  function loadRecents() {
    if (window.GameStore && window.GameStore.getRecents) {
      window.GameStore.getRecents().then(function (recents) {
        recentGamesList = recents || [];
        renderRecentBar();
      });
    }
  }

  function renderRecentBar() {
    if (!recentBar || !recentList) return;
    if (!recentGamesList || recentGamesList.length === 0) {
      recentBar.hidden = true;
      return;
    }
    recentList.innerHTML = '';
    var count = 0;
    recentGamesList.forEach(function (gid) {
      var g = allGamesList.find(function (item) { return item.id === gid; });
      if (!g) return;
      count++;
      var pill = document.createElement('button');
      pill.className = 'popup-recent-pill';
      pill.type = 'button';
      pill.innerHTML = '<span>' + (g.emoji || '🎮') + '</span><span>' + g.name + '</span>';
      pill.title = '最近玩过：' + g.name + ' (点击立即开局)';
      pill.addEventListener('click', function () {
        launch(g);
      });
      recentList.appendChild(pill);
    });
    recentBar.hidden = count === 0;
  }

  if (recentClear) {
    recentClear.addEventListener('click', function () {
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

  var SVG_MUTE_SOUND_ON = '<svg class="player-btn-icon mute-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 4.5L5 7.5H2.5v5H5l3.5 3V4.5z"/><path d="M12.5 7a4 4 0 0 1 0 6"/><path d="M14.5 4.5a7.5 7.5 0 0 1 0 11"/></svg>';
  var SVG_MUTE_SOUND_MUTED = '<svg class="player-btn-icon mute-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 4.5L5 7.5H2.5v5H5l3.5 3V4.5z"/><line x1="12" y1="7.5" x2="17" y2="12.5"/><line x1="17" y1="7.5" x2="12" y2="12.5"/></svg>';

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
    if (popupMuteBtn) {
      popupMuteBtn.innerHTML = isMasterMuted ? SVG_MUTE_SOUND_MUTED : SVG_MUTE_SOUND_ON;
      popupMuteBtn.title = tip;
      popupMuteBtn.classList.toggle('topbar-btn-accent', isMasterMuted);
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

  if (popupMuteBtn) popupMuteBtn.addEventListener('click', toggleMasterMute);
  if (playerMuteBtn) playerMuteBtn.addEventListener('click', toggleMasterMute);

  if (frame) {
    frame.addEventListener('load', function () {
      installAudioPatch(frame.contentWindow);
      applyIframeMute();
    });
  }

  // ---- Filtering & Grid Rendering ---------------------------------------------
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
      if (popupEmpty) {
        popupEmpty.classList.remove('hidden');
        var emptyTitle = popupEmpty.querySelector('.popup-empty-title');
        var emptyDesc = popupEmpty.querySelector('.popup-empty-desc');
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
    if (popupEmpty) popupEmpty.classList.add('hidden');

    list.forEach(function (g) {
      var isFav = favoriteSet.has(g.id);
      var theme = CAT_THEMES[g.cat] || DEFAULT_THEME;

      if (currentViewMode === 'list') {
        // --- 紧凑列表行视图 (Steam/Linear/Raycast 质感) ---
        var row = document.createElement('div');
        row.className = 'popup-list-row';
        row.setAttribute('role', 'listitem');
        row.innerHTML =
          '<div class="popup-row-icon" style="background:' + theme.bg + '; border:1px solid ' + theme.border + ';">' +
            (g.emoji || '🎮') +
          '</div>' +
          '<div class="popup-row-main">' +
            '<div class="popup-row-title-row">' +
              '<span class="popup-row-name">' + g.name + '</span>' +
              '<span class="card-cat-pill" style="color:' + theme.color + '; border-color:' + theme.border + '; background:' + theme.bg + ';">' +
                theme.name +
              '</span>' +
            '</div>' +
            '<div class="popup-row-desc">' + (g.tagline || '') + '</div>' +
          '</div>' +
          '<div class="popup-row-meta">' +
            '<span class="card-best">🏆 <span data-best="' + g.id + '">…</span></span>' +
          '</div>' +
          '<div class="popup-row-actions">' +
            '<button type="button" class="card-info-btn" title="查看玩法说明">ℹ</button>' +
            '<button type="button" class="card-fav ' + (isFav ? 'active' : '') + '" data-id="' + g.id + '" title="' + (isFav ? '取消常用收藏' : '加入常用收藏') + '" aria-label="收藏">★</button>' +
            '<button type="button" class="popup-row-play-btn">开玩 ▷</button>' +
          '</div>';

        var rowInfoBtn = row.querySelector('.card-info-btn');
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

        var rowFavBtn = row.querySelector('.card-fav');
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
        card.className = 'card';
        card.setAttribute('role', 'listitem');
        card.style.setProperty('--card-accent', theme.color);
        card.innerHTML =
          '<div class="card-top">' +
            '<div class="card-icon" style="background:' + theme.bg + '; border:1px solid ' + theme.border + ';">' +
              (g.emoji || '🎮') +
            '</div>' +
            '<div class="card-top-meta">' +
              '<span class="card-cat-pill" style="color:' + theme.color + '; border-color:' + theme.border + '; background:' + theme.bg + ';">' +
                theme.name +
              '</span>' +
              '<button type="button" class="card-info-btn" title="查看玩法说明">ℹ</button>' +
              '<button type="button" class="card-fav ' + (isFav ? 'active' : '') + '" data-id="' + g.id + '" title="' + (isFav ? '取消常用收藏' : '加入常用收藏') + '" aria-label="收藏">★</button>' +
            '</div>' +
          '</div>' +
          '<div class="card-content">' +
            '<div class="card-name" title="' + g.name + '">' +
              g.name +
            '</div>' +
            '<div class="card-tag" title="' + (g.tagline || '') + '">' +
              (g.tagline || '') +
            '</div>' +
          '</div>' +
          '<div class="card-footer">' +
            '<div class="card-best">🏆 <span data-best="' + g.id + '">…</span></div>' +
            '<div class="card-play-hint">开玩 ▷</div>' +
          '</div>';

        var cardInfoBtn = card.querySelector('.card-info-btn');
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

        var cardFavBtn = card.querySelector('.card-fav');
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
    if (popupOriginalBadge && allGamesList && allGamesList.length > 0) {
      var count = allGamesList.filter(isOriginalGame).length;
      popupOriginalBadge.textContent = String(count);
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
  if (popupEmptyReset) {
    popupEmptyReset.addEventListener('click', function () {
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
    if (popupRandomModal) popupRandomModal.hidden = true;
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
    if (popupRandomModal) popupRandomModal.hidden = false;
    if (randomCountdownTimer) clearInterval(randomCountdownTimer);
    if (randomSpinTimer) clearInterval(randomSpinTimer);

    if (popupRandomLaunch) popupRandomLaunch.disabled = true;

    var step = 0;
    randomSpinTimer = setInterval(function () {
      var temp = allGamesList[Math.floor(Math.random() * allGamesList.length)];
      if (popupRandomEmoji) {
        popupRandomEmoji.textContent = temp.emoji || '🎲';
        popupRandomEmoji.style.transform = (step % 2 === 0) ? 'rotate(-12deg) scale(1.15)' : 'rotate(12deg) scale(1.15)';
      }
      if (popupRandomName) popupRandomName.textContent = temp.name;
      if (popupRandomTag) popupRandomTag.textContent = temp.tagline || '精选小游戏';
      step++;

      if (step >= 10) {
        clearInterval(randomSpinTimer);
        randomSpinTimer = null;
        var chosen = allGamesList[Math.floor(Math.random() * allGamesList.length)];
        currentPickedRandomGame = chosen;
        if (popupRandomEmoji) {
          popupRandomEmoji.textContent = chosen.emoji || '🎲';
          popupRandomEmoji.style.transform = 'scale(1.25)';
          setTimeout(function () { if (popupRandomEmoji) popupRandomEmoji.style.transform = 'none'; }, 200);
        }
        if (popupRandomName) popupRandomName.textContent = chosen.name;
        if (popupRandomTag) popupRandomTag.textContent = chosen.tagline || '精选好玩小游戏';
        if (popupRandomLaunch) popupRandomLaunch.disabled = false;

        var timeLeft = 3;
        if (popupRandomCountdown) popupRandomCountdown.textContent = String(timeLeft);
        randomCountdownTimer = setInterval(function () {
          timeLeft--;
          if (popupRandomCountdown) popupRandomCountdown.textContent = String(timeLeft);
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

  if (popupRandomBtn) popupRandomBtn.addEventListener('click', rollRandomGame);
  if (popupRandomClose) popupRandomClose.addEventListener('click', closeRandomModal);
  if (popupRandomReroll) popupRandomReroll.addEventListener('click', rollRandomGame);
  if (popupRandomLaunch) {
    popupRandomLaunch.addEventListener('click', function () {
      closeRandomModal();
      if (currentPickedRandomGame) launch(currentPickedRandomGame);
    });
  }
  if (popupRandomModal) {
    popupRandomModal.addEventListener('click', function (e) {
      if (e.target === popupRandomModal) closeRandomModal();
    });
  }

  // ---- Player Toolbar Controls ------------------------------------------------
  function launch(g) {
    currentId = g.id;
    currentGame = g;
    playerTitle.textContent = g.name;
    updatePlayerFavBtn();
    updateMuteUI();
    var targetUrl = g.url || ('games/' + g.id + '/index.html');
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
    home.classList.add('hidden');
    player.classList.remove('hidden');

    if (window.GameStore && window.GameStore.recordPlay) {
      window.GameStore.recordPlay(g.id).then(function () {
        loadRecents();
      });
    }

    try {
      if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ 'omg:lastGame': g.id });
      }
    } catch (e) {}
  }

  function showHome() {
    hideTooltip();
    currentId = null;
    currentGame = null;
    if (frame) frame.src = 'about:blank';
    player.classList.add('hidden');
    home.classList.remove('hidden');
    loadRecents();
    loadFavorites();
    render(); // refresh best scores and recents after a play session
  }

  backBtn.addEventListener('click', showHome);

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
      var url = currentGame.url || ('games/' + currentGame.id + '/index.html');
      if (/^https?:\/\//.test(url)) {
        window.open(url, '_blank');
        return;
      }
      if (
        typeof chrome !== 'undefined' &&
        chrome.runtime &&
        chrome.runtime.getURL
      ) {
        chrome.tabs.create({ url: chrome.runtime.getURL(url) });
      } else {
        window.open(url, '_blank');
      }
    });
  }

  // Global Boss Key (Esc & Alt+Q/Option+Q)
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (popupRandomModal && !popupRandomModal.hidden) {
        closeRandomModal();
        return;
      }
      if (!player.classList.contains('hidden')) {
        showHome();
        return;
      }
      if (searchInput && document.activeElement === searchInput) {
        searchInput.blur();
      }
    }
    var isKeyQ = e.code === 'KeyQ' || e.key === 'q' || e.key === 'Q' || e.key === 'œ' || e.key === 'Œ';
    if ((e.altKey || (e.ctrlKey && e.altKey)) && isKeyQ) {
      e.preventDefault();
      if (!player.classList.contains('hidden')) {
        showHome();
      }
    }
  });

  // Games running inside iframe ask launcher to go back home or report scores
  window.addEventListener('message', function (e) {
    if (!e || !e.data) return;
    if (e.data.type === 'omnigame:home') showHome();
    if (e.data.type === 'omnigame:record' && window.GameStore) {
      var d = e.data;
      if (d.metric === 'time') GameStore.setBestTime(d.id, d.value);
      else GameStore.setBest(d.id, d.value);
    }
  });

  // ---- Summon Ball Logic ------------------------------------------------------
  function updatePopupBallBtn(visible) {
    isPopupBallVisible = !!visible;
    if (popupSummonBallBtn) {
      popupSummonBallBtn.textContent = isPopupBallVisible ? '🙈 隐藏' : '🎮 小球';
      popupSummonBallBtn.title = isPopupBallVisible ? '隐藏摸鱼小球 (快捷键 Option+Q)' : '召唤摸鱼小球 (快捷键 Option+Q)';
    }
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

  function queryPopupBallState() {
    if (!isExtValid()) return;
    if (chrome.storage && chrome.storage.local) {
      try {
        var p = chrome.storage.local.get('omg:ballVisible', function (o) {
          if (!isExtValid() || (chrome.runtime && chrome.runtime.lastError)) return;
          if (o && typeof o['omg:ballVisible'] === 'boolean') {
            updatePopupBallBtn(o['omg:ballVisible']);
          }
        });
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } catch (e) {}
    }
    if (chrome.tabs && chrome.tabs.query) {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          if (!isExtValid() || (chrome.runtime && chrome.runtime.lastError)) return;
          var t = tabs && tabs[0];
          if (t && t.id) {
            chrome.tabs.sendMessage(t.id, { type: 'queryBallState' }, function (res) {
              if (!isExtValid() || chrome.runtime.lastError) return;
              if (res && typeof res.visible === 'boolean') {
                updatePopupBallBtn(res.visible);
              }
            });
          }
        });
      } catch (e) {}
    }
  }

  if (popupSummonBallBtn) {
    popupSummonBallBtn.addEventListener('click', function () {
      if (typeof chrome === 'undefined' || !chrome.tabs) return;
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var t = tabs && tabs[0];
        if (!t || !t.id) return;

        function doToggle() {
          chrome.tabs.sendMessage(t.id, { type: 'toggleBall' }, function (res) {
            if (!chrome.runtime.lastError && res && typeof res.visible === 'boolean') {
              updatePopupBallBtn(res.visible);
            } else {
              updatePopupBallBtn(!isPopupBallVisible);
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
            updatePopupBallBtn(res.visible);
          }
        });
      });
    });

    queryPopupBallState();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'local') {
          if (changes['omg:ballVisible']) {
            updatePopupBallBtn(changes['omg:ballVisible'].newValue);
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
  }

  var siteLinks = document.querySelectorAll('a[href^="http"]');
  siteLinks.forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var url = el.getAttribute('href');
      if (!url) return;
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: url });
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    });
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

  function init() {
    if (window.GameStore && window.GameStore.getMasterMute) {
      window.GameStore.getMasterMute().then(function (muted) {
        isMasterMuted = !!muted;
        updateMuteUI();
      });
    }
    loadFavorites();
    loadRecents();
    render();
  }

  init();
})();
