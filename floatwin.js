/*
 * floatwin.js — reusable draggable + resizable floating window component.
 *
 * Mounted inside the content-script shadow DOM on web pages.
 * Features:
 *   - Automatic centering in viewport (`center: true` / `centerWin()`).
 *   - Drag-to-move from the title bar.
 *   - Corner drag-to-resize handle (smooth min/max clamping).
 *   - One-click Maximize / Restore button (⤢ / 🗗).
 *   - One-click Center button (🎯).
 *   - Close button (×) that emits `omg:close` event to return to the floating ball.
 *   - Dispatches `omg:open` on open.
 */
(function (global) {
  'use strict';
  // Allow fresh mountFloatWin definition on re-injection

  var CSS = [
    '.omg-fw{position:fixed;display:flex;flex-direction:column;',
    'background:#0e1020;color:#eef1ff;border-radius:16px;',
    'box-shadow:0 18px 50px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.1);',
    'overflow:hidden;pointer-events:auto;min-width:320px;min-height:280px;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
    'z-index:2147483647;transition:box-shadow .2s ease;}',
    '.omg-fw-hidden{display:none!important;}',
    '.omg-fw-head{display:flex;align-items:center;height:42px;padding:0 10px;',
    'background:#141831;border-bottom:1px solid rgba(255,255,255,.08);',
    'color:#fff;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none;}',
    '.omg-fw-head:active{cursor:grabbing;}',
    '.omg-fw-title{flex:1;font-size:14px;font-weight:700;display:flex;align-items:center;',
    'gap:6px;overflow:hidden;white-space:nowrap;}',
    '.omg-fw-actions{display:flex;align-items:center;gap:6px;}',
    '.omg-fw-btn{border:0;background:#242844;color:#eef1ff;border-radius:8px;',
    'width:28px;height:28px;display:flex;align-items:center;justify-content:center;',
    'font-size:13px;cursor:pointer;transition:background .12s ease,transform .1s ease;}',
    '.omg-fw-btn:hover{background:#353d6b;}',
    '.omg-fw-btn:active{transform:scale(.92);}',
    '.omg-fw-sidepanel:hover{background:#0e7490;color:#fff;}',
    '.omg-fw-close:hover{background:#ef4444;color:#fff;}',
    '.omg-fw-body{position:relative;flex:1;min-height:0;background:#0e1020;}',
    '.omg-fw-frame{width:100%;height:100%;border:0;display:block;background:#0e1020;}',
    '.omg-fw-resize{position:absolute;right:0;bottom:0;width:20px;height:20px;',
    'cursor:nwse-resize;touch-action:none;',
    'background:linear-gradient(135deg,transparent 45%,rgba(108,140,255,.45) 45%,#0e7490 100%);',
    'border-bottom-right-radius:16px;}'
  ].join('');

  var injected = {};

  function injectStyle(mount) {
    if (injected[mount && mount.nodeType === 11 ? 'shadow' : 'doc']) return;
    injected[mount && mount.nodeType === 11 ? 'shadow' : 'doc'] = true;
    var s = document.createElement('style');
    s.textContent = CSS;
    if (mount && mount.nodeType === 11) mount.appendChild(s);
    else (document.head || document.documentElement).appendChild(s);
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function mountFloatWin(opts) {
    var mount = opts.mount;
    var iframeUrl = opts.iframeUrl;
    var storeKey = opts.storeKey || null;
    var minW = opts.minW || 320;
    var minH = opts.minH || 280;
    var bounds = opts.bounds || null;

    injectStyle(mount);

    var el = document.createElement('div');
    el.className = 'omg-fw omg-fw-hidden';
    el.innerHTML =
      '<div class="omg-fw-head">' +
      '<span class="omg-fw-title">🎮 ' +
      (opts.title || 'OmniGame') +
      '</span>' +
      '<div class="omg-fw-actions">' +
      '<button class="omg-fw-btn omg-fw-sidepanel" title="在侧边栏继续玩" aria-label="侧边栏">📑</button>' +
      '<button class="omg-fw-btn omg-fw-center" title="居中显示" aria-label="居中">🎯</button>' +
      '<button class="omg-fw-btn omg-fw-max" title="最大化 / 还原" aria-label="最大化">⤢</button>' +
      '<button class="omg-fw-btn omg-fw-close" title="关闭小窗" aria-label="关闭">×</button>' +
      '</div>' +
      '</div>' +
      '<div class="omg-fw-body">' +
      '<iframe class="omg-fw-frame" src="' +
      iframeUrl +
      '" allow="clipboard-write; fullscreen"></iframe>' +
      '<div class="omg-fw-resize" aria-label="拖拽缩放"></div>' +
      '</div>';

    var head = el.querySelector('.omg-fw-head');
    var sidepanelBtn = el.querySelector('.omg-fw-sidepanel');
    var centerBtn = el.querySelector('.omg-fw-center');
    var maxBtn = el.querySelector('.omg-fw-max');
    var closeBtn = el.querySelector('.omg-fw-close');
    var resize = el.querySelector('.omg-fw-resize');

    var state = { x: 0, y: 0, w: 460, h: 620, open: false };
    var isMaximized = false;
    var preMaxState = null;

    function boundsRect() {
      if (bounds && bounds.getBoundingClientRect) {
        var r = bounds.getBoundingClientRect();
        return {
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height
        };
      }
      return {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
        width: window.innerWidth,
        height: window.innerHeight
      };
    }

    function apply() {
      var b = boundsRect();
      state.w = clamp(state.w, minW, Math.max(minW, b.width - 24));
      state.h = clamp(state.h, minH, Math.max(minH, b.height - 24));
      state.x = clamp(state.x, b.left, b.right - state.w);
      state.y = clamp(state.y, b.top, b.bottom - state.h);
      el.style.left = state.x + 'px';
      el.style.top = state.y + 'px';
      el.style.width = state.w + 'px';
      el.style.height = state.h + 'px';
    }

    function centerWin() {
      var b = boundsRect();
      var targetW = clamp(state.w || 460, minW, Math.max(minW, Math.min(520, b.width - 32)));
      var targetH = clamp(state.h || 620, minH, Math.max(minH, Math.min(720, b.height - 32)));
      state.w = targetW;
      state.h = targetH;
      state.x = Math.round(b.left + (b.width - targetW) / 2);
      state.y = Math.round(b.top + (b.height - targetH) / 2);
      isMaximized = false;
      maxBtn.textContent = '⤢';
      maxBtn.title = '最大化';
      apply();
      persist();
    }

    function toggleMaximize() {
      var b = boundsRect();
      if (!isMaximized) {
        preMaxState = { x: state.x, y: state.y, w: state.w, h: state.h };
        state.x = b.left + 16;
        state.y = b.top + 16;
        state.w = b.width - 32;
        state.h = b.height - 32;
        isMaximized = true;
        maxBtn.textContent = '🗗';
        maxBtn.title = '还原小窗';
      } else {
        if (preMaxState) {
          state.x = preMaxState.x;
          state.y = preMaxState.y;
          state.w = preMaxState.w;
          state.h = preMaxState.h;
        } else {
          centerWin();
        }
        isMaximized = false;
        maxBtn.textContent = '⤢';
        maxBtn.title = '最大化';
      }
      apply();
      persist();
    }

    function persist() {
      if (storeKey && global.chrome && chrome.storage) {
        var p = {};
        p[storeKey] = { x: state.x, y: state.y, w: state.w, h: state.h };
        try {
          chrome.storage.local.set(p);
        } catch (e) {}
      }
    }

    function restore(cb) {
      if (storeKey && global.chrome && chrome.storage) {
        try {
          chrome.storage.local.get(storeKey, function (o) {
            var s = o && o[storeKey];
            if (s) {
              state.x = s.x != null ? s.x : state.x;
              state.y = s.y != null ? s.y : state.y;
              state.w = s.w || state.w;
              state.h = s.h || state.h;
            }
            cb();
          });
          return;
        } catch (e) {}
      }
      cb();
    }

    // Drag-to-move
    head.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.omg-fw-actions')) return;
      e.preventDefault();
      var sx = e.clientX,
        sy = e.clientY,
        ox = state.x,
        oy = state.y;
      try {
        head.setPointerCapture(e.pointerId);
      } catch (err) {}
      function move(ev) {
        state.x = ox + (ev.clientX - sx);
        state.y = oy + (ev.clientY - sy);
        isMaximized = false;
        maxBtn.textContent = '⤢';
        apply();
      }
      function up() {
        try {
          head.releasePointerCapture(e.pointerId);
        } catch (err) {}
        head.removeEventListener('pointermove', move);
        head.removeEventListener('pointerup', up);
        persist();
      }
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    });

    // Resize-handle
    resize.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var sx = e.clientX,
        sy = e.clientY,
        ow = state.w,
        oh = state.h;
      try {
        resize.setPointerCapture(e.pointerId);
      } catch (err) {}
      function move(ev) {
        state.w = ow + (ev.clientX - sx);
        state.h = oh + (ev.clientY - sy);
        isMaximized = false;
        maxBtn.textContent = '⤢';
        apply();
      }
      function up() {
        try {
          resize.releasePointerCapture(e.pointerId);
        } catch (err) {}
        resize.removeEventListener('pointermove', move);
        resize.removeEventListener('pointerup', up);
        persist();
      }
      resize.addEventListener('pointermove', move);
      resize.addEventListener('pointerup', up);
    });

    if (sidepanelBtn) {
      sidepanelBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (typeof opts.onSidePanel === 'function') {
          opts.onSidePanel();
        } else {
          el.dispatchEvent(new CustomEvent('omg:sidepanel'));
        }
      });
    }

    centerBtn.addEventListener('click', centerWin);
    maxBtn.addEventListener('click', toggleMaximize);
    closeBtn.addEventListener('click', function () {
      hide();
    });

    var frame = el.querySelector('.omg-fw-frame');

    function launchGame(gameId) {
      if (!gameId) return;
      try {
        if (global.chrome && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({
            'omg:activeView': 'player',
            'omg:activeGame': gameId,
            'omg:lastGame': gameId
          });
        }
      } catch (e) {}

      function sendLaunch() {
        try {
          if (frame && frame.contentWindow) {
            frame.contentWindow.postMessage({ type: 'omnigame:launch', gameId: gameId }, '*');
          }
        } catch (err) {}
      }

      sendLaunch();
      setTimeout(sendLaunch, 120);
      setTimeout(sendLaunch, 350);
    }

    function showHome() {
      try {
        if (global.chrome && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ 'omg:activeView': 'home', 'omg:activeGame': null });
        }
      } catch (e) {}

      function sendHome() {
        try {
          if (frame && frame.contentWindow) {
            frame.contentWindow.postMessage({ type: 'omnigame:home' }, '*');
          }
        } catch (err) {}
      }

      sendHome();
      setTimeout(sendHome, 120);
      setTimeout(sendHome, 350);
    }

    function show(forceCenter, gameId) {
      if (gameId) {
        launchGame(gameId);
      } else if (gameId === null) {
        showHome();
      }
      restore(function () {
        if (forceCenter || !state.x || state.x <= 0) {
          centerWin();
        } else {
          apply();
        }
        el.classList.remove('omg-fw-hidden');
        state.open = true;
        try {
          el.dispatchEvent(new CustomEvent('omg:open'));
        } catch (e) {}
        if (gameId) {
          setTimeout(function () { launchGame(gameId); }, 80);
        }
      });
    }

    function hide() {
      el.classList.add('omg-fw-hidden');
      state.open = false;
      try {
        el.dispatchEvent(new CustomEvent('omg:close'));
      } catch (e) {}
    }

    function toggle(forceCenter) {
      state.open ? hide() : show(forceCenter);
    }

    mount.appendChild(el);

    return {
      el: el,
      frame: frame,
      show: show,
      hide: hide,
      toggle: toggle,
      centerWin: centerWin,
      launchGame: launchGame,
      isOpen: function () {
        return state.open;
      }
    };
  }

  global.mountFloatWin = mountFloatWin;
})(typeof window !== 'undefined' ? window : this);
