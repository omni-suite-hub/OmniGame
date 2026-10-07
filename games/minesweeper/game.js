/* 扫雷 — OmniGame
 * DOM-grid Minesweeper with 3 difficulties. First click is always safe.
 * Flag modes: right-click, long-press, or a "flag mode" toggle for touch.
 * Best (fastest) time per difficulty persisted via GameStore.
 */
(function () {
  'use strict';

  var DIFFS = {
    beginner: { cols: 9, rows: 9, mines: 10 },
    inter: { cols: 16, rows: 16, mines: 40 },
    expert: { cols: 30, rows: 16, mines: 99 }
  };

  var boardEl = document.getElementById('board');
  var minesEl = document.getElementById('mines');
  var timeEl = document.getElementById('time');
  var bestTimeEl = document.getElementById('bestTime');
  var flagBtn = document.getElementById('flagBtn');
  var restartBtn = document.getElementById('restartBtn');
  var overlay = document.getElementById('overlay');
  var ovTitle = document.getElementById('ovTitle');
  var ovText = document.getElementById('ovText');
  var ovBtn = document.getElementById('ovBtn');

  var diffKey = 'beginner';
  var cfg = DIFFS[diffKey];
  var grid, started, over, won, flagMode, flags, revealedCount, timer, elapsed;

  var SAVE_KEY = 'omg:save:minesweeper';

  function saveMinesState() {
    if (!started || over) {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      return;
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        diffKey: diffKey,
        grid: grid,
        started: started,
        flags: flags,
        revealedCount: revealedCount,
        elapsed: elapsed
      }));
    } catch (e) {}
  }

  function restoreMinesState() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (data && data.started && Array.isArray(data.grid) && data.diffKey && DIFFS[data.diffKey]) {
        diffKey = data.diffKey;
        cfg = DIFFS[diffKey];
        grid = data.grid;
        started = true;
        over = false;
        won = false;
        flags = data.flags || 0;
        revealedCount = data.revealedCount || 0;
        elapsed = data.elapsed || 0;
        timeEl.textContent = elapsed;
        overlay.hidden = true;
        flagMode = false;
        refreshFlagBtn();
        minesEl.textContent = cfg.mines - flags;

        document.querySelectorAll('.diff').forEach(function (x) {
          x.classList.toggle('active', x.dataset.diff === diffKey);
        });

        renderBoard();
        showBest();

        for (var r = 0; r < cfg.rows; r++) {
          for (var c = 0; c < cfg.cols; c++) {
            paintCell(r, c);
          }
        }
        startTimer();
        return true;
      }
    } catch (e) {}
    return false;
  }

  function newGame() {
    cfg = DIFFS[diffKey];
    grid = [];
    for (var r = 0; r < cfg.rows; r++) {
      var row = [];
      for (var c = 0; c < cfg.cols; c++) {
        row.push({ mine: false, adj: 0, revealed: false, flagged: false });
      }
      grid.push(row);
    }
    started = false;
    over = false;
    won = false;
    flags = 0;
    revealedCount = 0;
    elapsed = 0;
    stopTimer();
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    timeEl.textContent = '0';
    overlay.hidden = true;
    flagMode = false;
    refreshFlagBtn();
    minesEl.textContent = cfg.mines;
    renderBoard();
    showBest();
  }

  // Place mines after the first click so the first reveal is always safe.
  function placeMines(safeR, safeC) {
    var forbidden = {};
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        var rr = safeR + dr, cc = safeC + dc;
        if (rr >= 0 && rr < cfg.rows && cc >= 0 && cc < cfg.cols) {
          forbidden[rr + ',' + cc] = 1;
        }
      }
    }
    var placed = 0;
    while (placed < cfg.mines) {
      var r = Math.floor(Math.random() * cfg.rows);
      var c = Math.floor(Math.random() * cfg.cols);
      if (grid[r][c].mine || forbidden[r + ',' + c]) continue;
      grid[r][c].mine = true;
      placed++;
    }
    for (var r2 = 0; r2 < cfg.rows; r2++) {
      for (var c2 = 0; c2 < cfg.cols; c2++) {
        if (grid[r2][c2].mine) continue;
        var n = 0;
        for (var ddr = -1; ddr <= 1; ddr++) {
          for (var ddc = -1; ddc <= 1; ddc++) {
            if (!ddr && !ddc) continue;
            var nr = r2 + ddr, nc = c2 + ddc;
            if (nr >= 0 && nr < cfg.rows && nc >= 0 && nc < cfg.cols && grid[nr][nc].mine) n++;
          }
        }
        grid[r2][c2].adj = n;
      }
    }
  }

  function renderBoard() {
    boardEl.style.gridTemplateColumns = 'repeat(' + cfg.cols + ', var(--cs))';
    fitBoard();

    boardEl.innerHTML = '';
    for (var r = 0; r < cfg.rows; r++) {
      for (var c = 0; c < cfg.cols; c++) {
        var btn = document.createElement('button');
        btn.className = 'cell';
        btn.dataset.r = r;
        btn.dataset.c = c;
        boardEl.appendChild(btn);
      }
    }
  }

  function cellEl(r, c) {
    return boardEl.children[r * cfg.cols + c];
  }

  function paintCell(r, c) {
    var cell = grid[r][c];
    var el = cellEl(r, c);
    el.className = 'cell';
    el.textContent = '';
    if (cell.revealed) {
      el.classList.add('open');
      if (cell.mine) {
        el.classList.add('mine');
        el.textContent = '💣';
      } else if (cell.adj > 0) {
        el.classList.add('n' + cell.adj);
        el.textContent = cell.adj;
      }
    } else if (cell.flagged) {
      el.classList.add('flag');
      el.textContent = '🚩';
    }
  }

  function reveal(r, c) {
    if (over) return;
    var cell = grid[r][c];
    if (cell.revealed || cell.flagged) return;

    if (!started) {
      placeMines(r, c);
      started = true;
      startTimer();
    }

    // flood fill via stack
    var stack = [[r, c]];
    while (stack.length) {
      var p = stack.pop();
      var rr = p[0], cc = p[1];
      var cl = grid[rr][cc];
      if (cl.revealed || cl.flagged) continue;
      cl.revealed = true;
      revealedCount++;
      paintCell(rr, cc);
      if (cl.mine) {
        return lose();
      }
      if (cl.adj === 0) {
        for (var ddr = -1; ddr <= 1; ddr++) {
          for (var ddc = -1; ddc <= 1; ddc++) {
            if (!ddr && !ddc) continue;
            var nr = rr + ddr, nc = cc + ddc;
            if (nr >= 0 && nr < cfg.rows && nc >= 0 && nc < cfg.cols) {
              var ncl = grid[nr][nc];
              if (!ncl.revealed && !ncl.flagged && !ncl.mine) {
                stack.push([nr, nc]);
              }
            }
          }
        }
      }
    }
    checkWin();
    saveMinesState();
  }

  function toggleFlag(r, c) {
    if (over) return;
    var cell = grid[r][c];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
    flags += cell.flagged ? 1 : -1;
    minesEl.textContent = cfg.mines - flags;
    paintCell(r, c);
    saveMinesState();
  }

  function checkWin() {
    var total = cfg.rows * cfg.cols;
    if (revealedCount === total - cfg.mines) {
      won = true;
      over = true;
      stopTimer();
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      // auto-flag remaining mines
      for (var r = 0; r < cfg.rows; r++) {
        for (var c = 0; c < cfg.cols; c++) {
          if (grid[r][c].mine && !grid[r][c].flagged) {
            grid[r][c].flagged = true;
            paintCell(r, c);
          }
        }
      }
      GameStore.setBestTime('minesweeper:' + diffKey, elapsed * 1000).then(showBest);
      ovTitle.textContent = '🎉 扫雷成功';
      ovText.textContent = '用时 ' + elapsed + ' 秒';
      ovBtn.textContent = '再来一局';
      overlay.hidden = false;
    }
  }

  function lose() {
    over = true;
    stopTimer();
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    for (var r = 0; r < cfg.rows; r++) {
      for (var c = 0; c < cfg.cols; c++) {
        var cell = grid[r][c];
        if (cell.mine && !cell.flagged) paintCell(r, c);
        if (!cell.mine && cell.flagged) {
          cellEl(r, c).classList.add('wrong');
          cellEl(r, c).textContent = '✖';
        }
      }
    }
    ovTitle.textContent = '💥 踩雷了';
    ovText.textContent = '本局用时 ' + elapsed + ' 秒';
    ovBtn.textContent = '再来一局';
    overlay.hidden = false;
  }

  // ---- Timer ----
  function startTimer() {
    stopTimer();
    timer = setInterval(function () {
      elapsed++;
      timeEl.textContent = elapsed;
      if (elapsed % 5 === 0) saveMinesState();
    }, 1000);
  }
  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function refreshFlagBtn() {
    flagBtn.setAttribute('aria-pressed', flagMode ? 'true' : 'false');
    flagBtn.textContent = flagMode ? '🚩 标雷模式：开' : '🚩 标雷模式：关';
  }

  function showBest() {
    GameStore.getBestTime('minesweeper:' + diffKey).then(function (t) {
      bestTimeEl.textContent = t != null ? '最佳 ' + Math.round(t / 1000) + 's' : '最佳 —';
    });
  }

  // ---- Input ----
  boardEl.addEventListener('click', function (e) {
    var el = e.target.closest('.cell');
    if (!el) return;
    var r = +el.dataset.r, c = +el.dataset.c;
    if (flagMode) toggleFlag(r, c);
    else reveal(r, c);
  });

  boardEl.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    var el = e.target.closest('.cell');
    if (!el) return;
    toggleFlag(+el.dataset.r, +el.dataset.c);
  });

  // long-press to flag on touch, then suppress the click
  var pressTimer = null, longPressed = false, pressEl = null;
  boardEl.addEventListener('touchstart', function (e) {
    var el = e.target.closest('.cell');
    if (!el) return;
    pressEl = el;
    longPressed = false;
    pressTimer = setTimeout(function () {
      longPressed = true;
      toggleFlag(+el.dataset.r, +el.dataset.c);
    }, 420);
  }, { passive: true });
  boardEl.addEventListener('touchend', function (e) {
    if (pressTimer) clearTimeout(pressTimer);
    if (longPressed && pressEl) {
      // swallow the synthetic click that follows the long-press
      e.preventDefault();
      var el = pressEl;
      pressEl = null;
      // stop the next click from revealing
      el.addEventListener('click', function handler(ev) {
        ev.stopImmediatePropagation();
        el.removeEventListener('click', handler);
      }, { once: true, capture: true });
    }
    pressTimer = null;
  }, { passive: false });

  document.getElementById('diffs').addEventListener('click', function (e) {
    var b = e.target.closest('.diff');
    if (!b) return;
    document.querySelectorAll('.diff').forEach(function (x) {
      x.classList.remove('active');
    });
    b.classList.add('active');
    diffKey = b.dataset.diff;
    newGame();
  });

  flagBtn.addEventListener('click', function () {
    flagMode = !flagMode;
    refreshFlagBtn();
  });
  restartBtn.addEventListener('click', newGame);
  ovBtn.addEventListener('click', newGame);

  // Size cells to fit the available space dynamically across all screens.
  function fitBoard() {
    var headH = (document.querySelector('.head') || {}).offsetHeight || 44;
    var diffsH = (document.querySelector('.diffs') || {}).offsetHeight || 38;
    var toolH = (document.querySelector('.toolbar') || {}).offsetHeight || 40;
    var tipH = (document.querySelector('.tip') || {}).offsetHeight || 22;
    var padH = 36;

    var availH = Math.max(160, window.innerHeight - (headH + diffsH + toolH + tipH + padH));
    var availW = Math.max(200, window.innerWidth - 32);

    var gridGap = 3;
    var boardPad = 16; // 8px * 2

    var csH = Math.floor((availH - boardPad - (cfg.rows - 1) * gridGap) / cfg.rows);
    var csW = Math.floor((availW - boardPad - (cfg.cols - 1) * gridGap) / cfg.cols);
    var cs = Math.min(csH, csW);

    // Beginner 9x9 can expand up to 78px, intermediate 16x16 up to 52px, expert up to 44px
    var maxCs = cfg.cols <= 9 ? 78 : (cfg.cols <= 16 ? 52 : 44);
    cs = Math.max(20, Math.min(cs, maxCs));

    boardEl.style.setProperty('--cs', cs + 'px');
    document.documentElement.style.setProperty('--cs', cs + 'px');
  }

  window.addEventListener('resize', fitBoard);

  // ---- Boot ----
  if (!restoreMinesState()) {
    newGame();
  }
})();
