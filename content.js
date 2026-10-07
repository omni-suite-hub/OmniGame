/*
 * content.js — OmniGame floating-ball launcher (content script).
 *
 * Runs on every normal web page (top document only).
 * Features:
 *   - Isolated in Shadow DOM (zero style conflicts with host page).
 *   - Draggable floating ball with magnetic edge snapping and auto-peeking.
 *   - Quick Action Menu on click:
 *       1. 🪟 居中开小窗: opens draggable/resizable float window in screen center.
 *       2. 📑 打开侧边栏: opens Chrome side panel.
 *       3. 🎲 摸鱼轮盘 (随机选游戏): randomly spins and launches a game.
 *       4. 🪵 电子木鱼 (解压敲敲乐): switches ball to wooden fish with "功德+1" / "摸鱼+1s" floating badges.
 *       5. 🕶️ 老板键 (一键隐身): shrinks into a tiny translucent stealth dot (or Alt+G to toggle).
 *   - Listens to `spawnFloatWin` to pop the window in the center when requested by sidepanel.
 *   - Displays floating ball whenever the float window is closed.
 */
(function () {
  'use strict';

  if (window.self !== window.top) return;

  // Clean up any stale host from previous injections (e.g. after extension reload)
  var prevHost = document.getElementById('omg-root');
  if (prevHost && prevHost.parentNode) {
    try { prevHost.parentNode.removeChild(prevHost); } catch (e) {}
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

  function safeSendMessage(payload, cb) {
    if (!isExtValid() || !chrome.runtime || !chrome.runtime.sendMessage) {
      spawnToast('⚠️ 插件已重载，请刷新网页后使用悬浮球');
      if (typeof cb === 'function') cb(null);
      return;
    }
    try {
      chrome.runtime.sendMessage(payload, function (res) {
        if (chrome.runtime.lastError) {
          if (typeof cb === 'function') cb(null);
          return;
        }
        if (typeof cb === 'function') cb(res);
      });
    } catch (e) {
      spawnToast('⚠️ 插件连接已断开，请刷新网页');
      if (typeof cb === 'function') cb(null);
    }
  }

  var EXT_ORIGIN = (isExtValid() && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL('').slice(0, -1)
    : '';
  var BALL_KEY = 'omg:ball';
  var MUYU_KEY = 'omg:muyu_count';
  var BALL_SIZE = 54;
  var isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);

  // ---- Shadow root host -----------------------------------------------------
  var host = document.createElement('div');
  host.id = 'omg-root';
  host.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;' +
    'pointer-events:none;z-index:2147483647;overflow:visible;display:block;';

  function attachHost() {
    var parent = document.body || document.documentElement;
    if (parent && !host.parentNode) {
      parent.appendChild(host);
    }
  }
  attachHost();
  if (!host.parentNode) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attachHost);
    } else {
      setTimeout(attachHost, 50);
    }
  }

  var shadow = host.attachShadow({ mode: 'open' });

  // ---- Styles (shadow-scoped) ----------------------------------------------
  var style = document.createElement('style');
  style.textContent = [
    '* { box-sizing: border-box; }',
    '.omg-ball {',
    '  position: fixed; right: 18px; bottom: 58px; width: 54px; height: 54px; border-radius: 50%;',
    '  background: linear-gradient(135deg, #0e7490, #3b82f6); color: #fff;',
    '  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4), 0 0 0 2px rgba(255, 255, 255, 0.25);',
    '  cursor: grab; user-select: none; -webkit-user-select: none;',
    '  display: flex; align-items: center; justify-content: center; font-size: 26px;',
    '  z-index: 2147483646; pointer-events: auto; touch-action: none;',
    '  transition: transform 0.15s cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 0.25s ease, filter 0.15s ease;',
    '}',
    '.omg-ball:hover { filter: brightness(1.1); transform: scale(1.06); }',
    '.omg-ball:active { transform: scale(0.94); cursor: grabbing; }',
    '.omg-ball.dragging { cursor: grabbing; transform: scale(1.08); transition: none !important; }',
    '.omg-ball.peeking-left { transform: translateX(-40%); opacity: 0.65; }',
    '.omg-ball.peeking-right { transform: translateX(40%); opacity: 0.65; }',
    '.omg-ball.peeking-left:hover, .omg-ball.peeking-right:hover { transform: translateX(0); opacity: 1; }',
    '.omg-ball.stealth { width: 14px; height: 14px; border-radius: 50%; opacity: 0.35; background: #64748b; font-size: 0; box-shadow: 0 0 0 2px rgba(255,255,255,0.25); cursor: pointer; }',
    '.omg-ball.stealth:hover { opacity: 1; width: 36px; height: 36px; font-size: 18px; background: linear-gradient(135deg, #0e7490, #3b82f6); box-shadow: 0 4px 14px rgba(0,0,0,0.4); }',
    '.omg-ball.stealth .omg-ball-icon { display: none; }',
    '.omg-ball.stealth:hover .omg-ball-icon { display: block; }',
    '.omg-ball.muyu-active { background: linear-gradient(135deg, #b45309, #d97706); }',
    '.omg-ball-icon { font-size: 26px; line-height: 1; pointer-events: none; transition: transform 0.1s ease; }',
    '.omg-ball-close {',
    '  position: absolute; top: -3px; right: -3px; width: 20px; height: 20px; border-radius: 50%;',
    '  background: #ef4444; color: #fff; font-size: 13px; font-weight: 800; display: flex;',
    '  align-items: center; justify-content: center; cursor: pointer; border: 2px solid #fff;',
    '  box-shadow: 0 2px 6px rgba(0,0,0,0.5); z-index: 10; pointer-events: auto;',
    '  transition: transform 0.12s ease, background 0.12s ease; line-height: 1;',
    '}',
    '.omg-ball-close:hover { transform: scale(1.25); background: #dc2626; }',
    '.omg-ball-close[hidden] { display: none !important; }',
    '',
    '/* Bubble Menu */',
    '.omg-menu {',
    '  position: fixed; width: 220px; background: #141831; color: #eef1ff;',
    '  border-radius: 16px; padding: 12px; z-index: 2147483647;',
    '  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.12);',
    '  pointer-events: auto; display: flex; flex-direction: column; gap: 8px;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '  animation: omg-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1);',
    '}',
    '.omg-menu[hidden] { display: none !important; }',
    '@keyframes omg-pop { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }',
    '.omg-menu-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); font-size: 12px; font-weight: 700; color: #a6abce; }',
    '.omg-menu-btn {',
    '  border: 0; background: #242844; color: #eef1ff; border-radius: 10px;',
    '  padding: 8px 10px; font-size: 13px; font-weight: 600; cursor: pointer;',
    '  display: flex; align-items: center; gap: 8px; text-align: left;',
    '  transition: background 0.12s ease, transform 0.08s ease;',
    '}',
    '.omg-menu-btn:hover { background: #353d6b; transform: translateX(2px); }',
    '.omg-menu-btn:active { transform: scale(0.96); }',
    '.omg-menu-btn-primary { background: linear-gradient(135deg, #00E5FF, #2B6FE8); color: #06121f; font-weight: 700; }',
    '.omg-menu-btn-primary:hover { filter: brightness(1.1); }',
    '.omg-badge { margin-left: auto; font-size: 10px; padding: 2px 6px; border-radius: 999px; background: rgba(255,255,255,0.18); }',
    '',
    '/* Floating Toast / Muyu Float Text */',
    '.omg-toast {',
    '  position: fixed; padding: 8px 16px; border-radius: 999px;',
    '  background: rgba(14, 20, 48, 0.94); color: #facc15; font-weight: 700; font-size: 14px;',
    '  box-shadow: 0 8px 24px rgba(0,0,0,0.45); border: 1px solid rgba(250, 204, 21, 0.45);',
    '  pointer-events: none; z-index: 2147483647; white-space: nowrap;',
    '  animation: omg-float-up 1s cubic-bezier(0.1, 0.8, 0.2, 1) forwards;',
    '}',
    '@keyframes omg-float-up {',
    '  0% { opacity: 0; transform: translateY(0) scale(0.7); }',
    '  25% { opacity: 1; transform: translateY(-18px) scale(1.04); }',
    '  100% { opacity: 0; transform: translateY(-48px) scale(0.92); }',
    '}'
  ].join('\n');
  shadow.appendChild(style);

  // ---- Floating ball element ------------------------------------------------
  var ball = document.createElement('div');
  ball.className = 'omg-ball';
  ball.setAttribute('role', 'button');
  ball.setAttribute('aria-label', 'OmniGame 摸鱼小球');

  var ballIcon = document.createElement('span');
  ballIcon.className = 'omg-ball-icon';
  ballIcon.textContent = '🎮';
  ball.appendChild(ballIcon);

  var ballClose = document.createElement('span');
  ballClose.className = 'omg-ball-close';
  ballClose.textContent = '×';
  ballClose.title = '退出木鱼模式，恢复悬浮球';
  ballClose.hidden = true;
  ball.appendChild(ballClose);

  shadow.appendChild(ball);

  ballClose.addEventListener('pointerdown', function (e) {
    e.stopPropagation();
  });
  ballClose.addEventListener('click', function (e) {
    e.stopPropagation();
    e.preventDefault();
    setMuyuMode(false);
  });

  // Right click on ball: ALWAYS open Quick Menu
  ball.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    e.stopPropagation();
    toggleMenu();
  });

  // Double click on ball: Exit wooden fish mode or toggle menu
  ball.addEventListener('dblclick', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (isMuyuMode) {
      setMuyuMode(false);
    } else {
      toggleMenu();
    }
  });

  // ---- Quick Action Menu ----------------------------------------------------
  var menu = document.createElement('div');
  menu.className = 'omg-menu';
  menu.hidden = true;
  menu.innerHTML = [
    '<div class="omg-menu-head"><span>🎮 OmniGame 摸鱼中心</span><span style="cursor:pointer;" id="omgMenuClose">✕</span></div>',
    '<button class="omg-menu-btn omg-menu-btn-primary" id="btnFloatWin">🪟 居中开小窗<span class="omg-badge">独立窗口</span></button>',
    '<button class="omg-menu-btn" id="btnSidePanel">📑 打开侧边栏<span class="omg-badge">不挡网页</span></button>',
    '<button class="omg-menu-btn" id="btnRoulette">🎲 抽签选游戏<span class="omg-badge">随心摸鱼</span></button>',
    '<button class="omg-menu-btn" id="btnMuyu">🪵 电子木鱼<span class="omg-badge" id="muyuBadge">解压</span></button>',
    '<button class="omg-menu-btn" id="btnStealth">🕶️ 老板键隐蔽<span class="omg-badge">' + (isMac ? 'Option+Q' : 'Alt+Q') + '</span></button>'
  ].join('');
  shadow.appendChild(menu);

  var btnFloatWin = menu.querySelector('#btnFloatWin');
  var btnSidePanel = menu.querySelector('#btnSidePanel');
  var btnRoulette = menu.querySelector('#btnRoulette');
  var btnMuyu = menu.querySelector('#btnMuyu');
  var btnStealth = menu.querySelector('#btnStealth');
  var omgMenuClose = menu.querySelector('#omgMenuClose');
  var muyuBadge = menu.querySelector('#muyuBadge');

  var BALL_VISIBLE_KEY = 'omg:ballVisible';
  var isStealth = false;
  var isMuyuMode = false;
  var muyuCount = 0;

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function defaultBallPos() {
    var w = window.innerWidth || (document.documentElement ? document.documentElement.clientWidth : 1024);
    var h = window.innerHeight || (document.documentElement ? document.documentElement.clientHeight : 768);
    var m = 18;
    return {
      x: Math.max(m, w - BALL_SIZE - m),
      y: Math.max(m, h - BALL_SIZE - m - 40)
    };
  }

  var ballPos = defaultBallPos(); // { x, y }

  function applyBallPos(smooth) {
    if (!ballPos) ballPos = defaultBallPos();
    if (smooth) {
      ball.style.transition = 'left 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.2), top 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.2), transform 0.15s ease, opacity 0.25s ease';
    } else {
      ball.style.transition = 'none';
    }
    ball.style.left = ballPos.x + 'px';
    ball.style.top = ballPos.y + 'px';
    ball.style.right = 'auto';
    ball.style.bottom = 'auto';
  }

  function persistBall() {
    if (!ballPos || !isExtValid() || !chrome.storage || !chrome.storage.local) return;
    try {
      chrome.storage.local.set({ [BALL_KEY]: { x: ballPos.x, y: ballPos.y } });
    } catch (e) {}
  }

  // Auto snap to closest edge (left or right)
  var peekTimer = null;
  function snapToEdge() {
    if (!ballPos) return;
    var w = window.innerWidth || 1024;
    var snapLeft = ballPos.x < w / 2;
    var targetX = snapLeft ? 12 : (w - BALL_SIZE - 12);
    ballPos.x = targetX;
    ballPos.y = clamp(ballPos.y, 16, (window.innerHeight || 768) - BALL_SIZE - 16);
    applyBallPos(true);
    persistBall();

    clearTimeout(peekTimer);
    peekTimer = setTimeout(function () {
      if (!menu.hidden || isStealth) return;
      if (snapLeft) {
        ball.classList.add('peeking-left');
      } else {
        ball.classList.add('peeking-right');
      }
    }, 3200);
  }

  // 1. Immediately apply initial synchronous position so ball is rendered visible at frame 0
  applyBallPos(false);
  snapToEdge();

  // 2. Asynchronously restore user settings from storage
  if (isExtValid() && chrome.storage && chrome.storage.local) {
    try {
      chrome.storage.local.get([BALL_KEY, MUYU_KEY, BALL_VISIBLE_KEY], function (o) {
        if (chrome.runtime && chrome.runtime.lastError) return;
        if (!o) return;
        if (typeof o[MUYU_KEY] === 'number') {
          muyuCount = o[MUYU_KEY];
          if (muyuBadge) muyuBadge.textContent = muyuCount > 0 ? (muyuCount + '功德') : '解压';
        }
        var saved = o[BALL_KEY];
        if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
          var w = window.innerWidth || 1024;
          var h = window.innerHeight || 768;
          ballPos = {
            x: clamp(saved.x, 12, Math.max(12, w - BALL_SIZE - 12)),
            y: clamp(saved.y, 16, Math.max(16, h - BALL_SIZE - 16))
          };
          applyBallPos(false);
          snapToEdge();
        }
        // Ensure ball is always visible by default on every page load
        if (o && o[BALL_VISIBLE_KEY] === false) {
          chrome.storage.local.set({ [BALL_VISIBLE_KEY]: true });
        }
      });
    } catch (e) {}
  }

  // 3. Listen for cross-tab or sidepanel ball visibility toggle
  if (isExtValid() && chrome.storage && chrome.storage.onChanged) {
    try {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local' || !changes) return;
        if (changes[BALL_VISIBLE_KEY]) {
          var newVis = changes[BALL_VISIBLE_KEY].newValue;
          if (newVis === false && !isStealth) {
            toggleStealth();
          } else if (newVis !== false && isStealth) {
            restoreBallToVisible();
          }
        }
      });
    } catch (e) {}
  }

  // 4. Reposition ball when browser window resizes so it never falls off-screen
  window.addEventListener('resize', function () {
    if (!ballPos) return;
    var w = window.innerWidth || 1024;
    var h = window.innerHeight || 768;
    ballPos.x = clamp(ballPos.x, 12, Math.max(12, w - BALL_SIZE - 12));
    ballPos.y = clamp(ballPos.y, 16, Math.max(16, h - BALL_SIZE - 16));
    applyBallPos(false);
  });

  ball.addEventListener('mouseenter', function () {
    ball.classList.remove('peeking-left', 'peeking-right');
  });

  // ---- Dragging -------------------------------------------------------------
  var drag = { active: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0 };
  var pressTimer = null;

  ball.addEventListener('pointerdown', function (e) {
    if (e.target === ballClose) return;
    e.preventDefault();
    clearTimeout(peekTimer);
    ball.classList.remove('peeking-left', 'peeking-right');
    drag.active = true;
    drag.moved = false;
    drag.sx = e.clientX;
    drag.sy = e.clientY;
    drag.ox = ballPos ? ballPos.x : 0;
    drag.oy = ballPos ? ballPos.y : 0;
    ball.classList.add('dragging');
    try { ball.setPointerCapture(e.pointerId); } catch (err) {}

    clearTimeout(pressTimer);
    pressTimer = setTimeout(function () {
      if (drag.active && !drag.moved) {
        drag.moved = true; // prevent subsequent click
        toggleMenu();
      }
    }, 450);
  });

  ball.addEventListener('pointermove', function (e) {
    if (!drag.active) return;
    var dx = e.clientX - drag.sx;
    var dy = e.clientY - drag.sy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      drag.moved = true;
      clearTimeout(pressTimer);
    }
    ballPos = {
      x: clamp(drag.ox + dx, 0, window.innerWidth - BALL_SIZE),
      y: clamp(drag.oy + dy, 0, window.innerHeight - BALL_SIZE)
    };
    applyBallPos(false);
  });

  function endDrag(e) {
    clearTimeout(pressTimer);
    if (!drag.active) return;
    drag.active = false;
    ball.classList.remove('dragging');
    try { ball.releasePointerCapture(e.pointerId); } catch (err) {}

    if (!drag.moved) {
      handleBallClick();
    } else {
      snapToEdge();
    }
  }

  ball.addEventListener('pointerup', endDrag);
  ball.addEventListener('pointercancel', endDrag);

  // Floating text / toast for Wooden Fish and Roulette (viewport clamped)
  function spawnToast(text, x, y) {
    var toast = document.createElement('div');
    toast.className = 'omg-toast';
    toast.textContent = text;
    toast.style.visibility = 'hidden';
    shadow.appendChild(toast);

    var tw = toast.offsetWidth || 130;
    var th = toast.offsetHeight || 36;

    var idealX = (x !== undefined) ? x : (ballPos.x + BALL_SIZE / 2);
    var idealY = (y !== undefined) ? y : (ballPos.y - 14);

    // Keep safe margin of 16px from left and right screen borders
    var left = Math.max(16, Math.min(idealX - tw / 2, window.innerWidth - tw - 16));
    // Upward float animation rises 48px, so keep top >= 54px to prevent overflow at top of viewport
    var top = Math.max(54, Math.min(idealY, window.innerHeight - th - 16));

    toast.style.left = left + 'px';
    toast.style.top = top + 'px';
    toast.style.visibility = 'visible';

    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 1100);
  }

  var BLESSINGS = [
    '功德 +1 ✨', '摸鱼 +1s ☕', 'Bug -1 🐛', '薪水翻倍 💰',
    '烦恼全消 🍃', '升职加薪 🚀', '早点下班 🏃', '欧气满满 🍀'
  ];

  function handleBallClick() {
    if (isStealth) {
      toggleStealth();
      return;
    }

    // If wooden fish mode is active, each tap grants blessings!
    if (isMuyuMode) {
      muyuCount++;
      var phrase = BLESSINGS[Math.floor(Math.random() * BLESSINGS.length)];
      spawnToast(phrase);
      ballIcon.style.transform = 'scale(0.8)';
      setTimeout(function () { ballIcon.style.transform = ''; }, 90);
      if (isExtValid() && chrome.storage && chrome.storage.local) {
        try {
          chrome.storage.local.set({ [MUYU_KEY]: muyuCount });
        } catch (e) {}
      }
      var b = menu.querySelector('#muyuBadge');
      if (b && !isMuyuMode) b.textContent = muyuCount + '功德';
      return;
    }

    // Otherwise, toggle the Quick Menu
    toggleMenu();
  }

  function positionMenu() {
    var w = window.innerWidth, h = window.innerHeight;
    var menuW = 220, menuH = 260;
    var mx = ballPos.x - menuW - 10;
    if (mx < 12) mx = ballPos.x + BALL_SIZE + 10;
    var my = ballPos.y - (menuH / 2) + (BALL_SIZE / 2);
    my = clamp(my, 16, h - menuH - 16);
    menu.style.left = mx + 'px';
    menu.style.top = my + 'px';
  }

  function toggleMenu() {
    if (menu.hidden) {
      positionMenu();
      menu.hidden = false;
    } else {
      menu.hidden = true;
    }
  }

  function hideMenu() {
    menu.hidden = true;
  }

  omgMenuClose.addEventListener('click', hideMenu);

  // Close menu on click outside
  window.addEventListener('click', function (e) {
    if (menu.hidden) return;
    var path = e.composedPath ? e.composedPath() : [];
    if (path.indexOf(ball) === -1 && path.indexOf(menu) === -1) {
      hideMenu();
    }
  }, true);




  // ---- Menu Actions ---------------------------------------------------------

  // 1. 🪟 居中开小窗
  btnFloatWin.addEventListener('click', function () {
    hideMenu();
    var w = 440, h = 640;
    var left = Math.max(0, Math.round((window.screen.availWidth - w) / 2));
    var top = Math.max(0, Math.round((window.screen.availHeight - h) / 2));
    safeSendMessage({ type: 'openPopoutWindow', left: left, top: top, width: w, height: h });
  });

  // 2. 📑 打开侧边栏
  btnSidePanel.addEventListener('click', function () {
    hideMenu();
    safeSendMessage({ type: 'openSidePanel' });
  });

  // 3. 🎲 抽签选游戏 (摸鱼轮盘)
  // 3. 🎲 抽签选游戏 (摸鱼轮盘)
  var lastChosenGameId = null;

  function fetchSoloGames() {
    if (window.OmniCatalog && typeof window.OmniCatalog.getSoloGames === 'function') {
      return window.OmniCatalog.getSoloGames();
    }
    if (window.OmniCatalog && typeof window.OmniCatalog.getAll === 'function') {
      return window.OmniCatalog.getAll().then(function (all) {
        return (all || []).filter(function (g) {
          if (!g || !g.id) return false;
          if (g.badge && /联机/.test(g.badge)) return false;
          if (g.mode === 'multiplayer' || g.type === 'multiplayer') return false;
          if (g.id === 'gravitas-4' || g.id === 'tetris-clash' || g.id === 'hack-roulette') return false;
          return true;
        });
      });
    }
    if (Array.isArray(window.OMNIGAME_GAMES)) {
      return Promise.resolve(window.OMNIGAME_GAMES.filter(function (g) {
        if (!g || !g.id) return false;
        if (g.badge && /联机/.test(g.badge)) return false;
        if (g.category === 'multiplayer' || g.mode === 'multiplayer') return false;
        if (g.id === 'gravitas-4' || g.id === 'tetris-clash' || g.id === 'hack-roulette') return false;
        return true;
      }));
    }
    return Promise.resolve([]);
  }

  btnRoulette.addEventListener('click', function () {
    hideMenu();
    fetchSoloGames().then(function (soloGames) {
      if (!soloGames || soloGames.length === 0) return;

      var pool = soloGames;
      if (soloGames.length > 1 && lastChosenGameId) {
        var alt = soloGames.filter(function (g) { return g.id !== lastChosenGameId; });
        if (alt.length > 0) pool = alt;
      }

      var chosen = pool[Math.floor(Math.random() * pool.length)];
      lastChosenGameId = chosen.id;

      spawnToast((chosen.emoji || '🎲') + ' 抽中单机：' + chosen.name + '！正在开启…', window.innerWidth / 2, window.innerHeight / 2 - 40);

      try {
        if (chrome && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ 'omg:lastGame': chosen.id });
        }
      } catch (e) {}

      setTimeout(function () {
        var w = 440, h = 640;
        var left = Math.max(0, Math.round((window.screen.availWidth - w) / 2));
        var top = Math.max(0, Math.round((window.screen.availHeight - h) / 2));
        safeSendMessage({ type: 'openPopoutWindow', gameId: chosen.id, left: left, top: top, width: w, height: h });
      }, 350);
    });
  });

  // 4. 🪵 电子木鱼 (解压敲敲乐)
  function setMuyuMode(active) {
    isMuyuMode = !!active;
    if (isMuyuMode) {
      ball.classList.add('muyu-active');
      ballIcon.textContent = '🪵';
      ballClose.hidden = false;
      if (btnMuyu) {
        btnMuyu.innerHTML = '🪵 退出木鱼模式<span class="omg-badge" id="muyuBadge" style="background:#ef4444;color:#fff;">点击退出</span>';
      }
      spawnToast('已开启电子木鱼模式！敲击攒功德，点右上红叉/右键/双击可退出 📿');
    } else {
      ball.classList.remove('muyu-active');
      ballIcon.textContent = '🎮';
      ballClose.hidden = true;
      if (btnMuyu) {
        btnMuyu.innerHTML = '🪵 电子木鱼<span class="omg-badge" id="muyuBadge">' + (muyuCount > 0 ? (muyuCount + '功德') : '解压') + '</span>';
      }
      spawnToast('已退出木鱼模式，恢复悬浮球');
    }
  }

  btnMuyu.addEventListener('click', function () {
    hideMenu();
    setMuyuMode(!isMuyuMode);
  });

  // 5. 🕶️ 老板键 / 隐身模式
  function toggleStealth() {
    isStealth = !isStealth;
    if (isStealth) {
      hideMenu();
      ball.classList.add('stealth');
      ballClose.hidden = true;
      try {
        safeSendMessage({ type: 'omnigame:ballStateChanged', visible: false });
      } catch (e) {}
      spawnToast('🕶️ 老板键已开启 (' + (isMac ? 'Option+Q' : 'Alt+Q') + '、右键菜单或侧边栏可召唤恢复)', window.innerWidth / 2, window.innerHeight - 80);
    } else {
      restoreBallToVisible();
    }
  }

  function restoreBallToVisible() {
    isStealth = false;
    ball.classList.remove('stealth', 'peeking-left', 'peeking-right');
    ball.style.display = '';
    ballIcon.textContent = isMuyuMode ? '🪵' : '🎮';
    ballClose.hidden = !isMuyuMode;

    var w = window.innerWidth;
    var h = window.innerHeight;
    if (!ballPos || ballPos.x < 0 || ballPos.x > w - BALL_SIZE || ballPos.y < 0 || ballPos.y > h - BALL_SIZE) {
      ballPos = {
        x: w - BALL_SIZE - 20,
        y: Math.round(h / 2 - BALL_SIZE / 2)
      };
    }
    applyBallPos(true);
    persistBall();

    try {
      if (isExtValid() && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [BALL_VISIBLE_KEY]: true });
      }
      safeSendMessage({ type: 'omnigame:ballStateChanged', visible: true });
    } catch (e) {}

    ball.style.transform = 'scale(1.25)';
    setTimeout(function () { ball.style.transform = ''; }, 200);
    spawnToast('摸鱼球已召唤！', ballPos.x + BALL_SIZE / 2, ballPos.y - 35);
  }

  btnStealth.addEventListener('click', toggleStealth);

  // Global Boss Key Shortcut: Option + Q (Mac) / Alt + Q (Windows / Linux)
  window.addEventListener('keydown', function (e) {
    var isKeyQ = e.code === 'KeyQ' || e.key === 'q' || e.key === 'Q' || e.key === 'œ' || e.key === 'Œ';
    if ((e.altKey || (e.ctrlKey && e.altKey)) && isKeyQ) {
      e.preventDefault();
      toggleStealth();
    }
  });

  // ---- Bridge: background / side panel → spawn float window or toggle/restore ball --
  if (isExtValid() && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (!msg) return;

      if (msg.type === 'queryBallState') {
        sendResponse({ ok: true, visible: !isStealth });
        return true;
      }
      if (msg.type === 'toggleBall') {
        toggleStealth();
        sendResponse({ ok: true, visible: !isStealth });
        return true;
      }
      if (msg.type === 'hideBall') {
        if (!isStealth) toggleStealth();
        sendResponse({ ok: true, visible: false });
        return true;
      }
      if (msg.type === 'restoreBall') {
        restoreBallToVisible();
        sendResponse({ ok: true, visible: true });
        return true;
      }
      if (msg.type === 'spawnFloatWin') {
        var w = 440, h = 640;
        var left = Math.max(0, Math.round((window.screen.availWidth - w) / 2));
        var top = Math.max(0, Math.round((window.screen.availHeight - h) / 2));
        safeSendMessage({ type: 'openPopoutWindow', gameId: msg.gameId, left: left, top: top, width: w, height: h });
        sendResponse({ ok: true });
        return true;
      }
      return true;
    });
  }
})();
