/* 俄罗斯方块 — OmniGame
 * Canvas Tetris: 7 tetrominoes, rotation with simple wall kicks, next-piece
 * preview, line clears, levels and scoring. Keyboard + on-screen controls.
 * Best score persisted via GameStore.
 */
(function () {
  'use strict';

  var COLS = 10, ROWS = 20, CELL = 28;
  var COLORS = {
    1: '#46d39a', // I
    2: '#ffce5c', // O
    3: '#a855f7', // T
    4: '#22d3ee', // S
    5: '#ff6b6b', // Z
    6: '#6c8cff', // J
    7: '#ff9f43'  // L
  };
  // Base matrices (1 = filled). Rotations computed on the fly.
  var SHAPES = {
    I: [[1, 1, 1, 1]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1]],
    S: [[0, 1, 1], [1, 1, 0]],
    Z: [[1, 1, 0], [0, 1, 1]],
    J: [[1, 0, 0], [1, 1, 1]],
    L: [[0, 0, 1], [1, 1, 1]]
  };
  var TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d');
  var nextCv = document.getElementById('next');
  var nctx = nextCv.getContext('2d');
  var scoreEl = document.getElementById('score');
  var bestEl = document.getElementById('best');
  var levelEl = document.getElementById('level');
  var linesEl = document.getElementById('lines');
  var overlay = document.getElementById('overlay');
  var ovTitle = document.getElementById('ovTitle');
  var ovText = document.getElementById('ovText');
  var ovBtn = document.getElementById('ovBtn');
  var pauseBtn = document.getElementById('pauseBtn');

  var board, current, nextType, x, y, score, best, lines, level, dropMs;
  var running, paused, rafId, lastDrop;

  function setupCanvas() {
    var dpr = window.devicePixelRatio || 1;
    var bw = COLS * CELL, bh = ROWS * CELL;
    cv.style.width = bw + 'px';
    cv.style.height = bh + 'px';
    cv.width = Math.round(bw * dpr);
    cv.height = Math.round(bh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    boardAreaEl.style.width = bw + 'px';
    boardAreaEl.style.height = bh + 'px';
    nextCv.width = 96 * dpr;
    nextCv.height = 96 * dpr;
    nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Responsive: dynamically size the board and cells based on actual viewport space.
  var stageEl, sideEl, boardAreaEl, ctrlEl;
  function fit() {
    if (!stageEl) stageEl = document.querySelector('.stage');
    if (!sideEl) sideEl = document.querySelector('.side');
    if (!boardAreaEl) boardAreaEl = document.querySelector('.board-area');
    if (!ctrlEl) ctrlEl = document.querySelector('.controls');
    if (!stageEl || !sideEl || !boardAreaEl) return;

    var headH = (document.querySelector('.head') || {}).offsetHeight || 44;
    var tipH = (document.querySelector('.tip') || {}).offsetHeight || 22;
    var padH = 34;

    var isWide = window.innerWidth >= 500;
    var ctrlH = (!isWide && ctrlEl) ? ctrlEl.offsetHeight : 0;

    var availH = window.innerHeight - (headH + ctrlH + tipH + padH);
    var sideW = (sideEl.offsetWidth && sideEl.offsetWidth > 50) ? sideEl.offsetWidth : 110;
    if (isWide) sideW = Math.max(sideW, (ctrlEl ? ctrlEl.offsetWidth : 180));
    var availW = Math.min(window.innerWidth - sideW - 48, 800);

    var cellH = Math.floor(availH / ROWS);
    var cellW = Math.floor(availW / COLS);
    var cell = Math.min(cellH, cellW);

    cell = Math.max(14, Math.min(cell, 52));
    CELL = cell;
    setupCanvas();
    if (board) draw();
  }
  window.addEventListener('resize', fit);

  function emptyBoard() {
    var b = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) row.push(0);
      b.push(row);
    }
    return b;
  }

  function rotate(m) {
    var rows = m.length, cols = m[0].length;
    var out = [];
    for (var c = 0; c < cols; c++) {
      var nr = [];
      for (var r = rows - 1; r >= 0; r--) nr.push(m[r][c]);
      out.push(nr);
    }
    return out;
  }

  function spawn() {
    var type = nextType || randomType();
    nextType = randomType();
    current = { type: type, m: SHAPES[type].map(function (r) { return r.slice(); }) };
    x = Math.floor((COLS - current.m[0].length) / 2);
    y = 0;
    drawNext();
    if (collides(current.m, x, y)) gameOver();
  }

  function randomType() {
    return TYPES[Math.floor(Math.random() * TYPES.length)];
  }

  function collides(m, px, py) {
    for (var r = 0; r < m.length; r++) {
      for (var c = 0; c < m[r].length; c++) {
        if (!m[r][c]) continue;
        var nx = px + c, ny = py + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  function lock() {
    var m = current.m;
    for (var r = 0; r < m.length; r++) {
      for (var c = 0; c < m[r].length; c++) {
        if (m[r][c]) {
          var ny = y + r, nx = x + c;
          if (ny >= 0) board[ny][nx] = colorOf(current.type);
        }
      }
    }
    clearLines();
    spawn();
    saveTetrisState();
  }

  function colorOf(type) {
    return TYPES.indexOf(type) + 1;
  }

  function clearLines() {
    var cleared = 0;
    for (var r = ROWS - 1; r >= 0; r--) {
      var full = true;
      for (var c = 0; c < COLS; c++) if (!board[r][c]) { full = false; break; }
      if (full) {
        board.splice(r, 1);
        board.unshift(new Array(COLS).fill(0));
        cleared++;
        r++; // recheck same index after shift
      }
    }
    if (cleared) {
      var points = [0, 100, 300, 500, 800][cleared] * level;
      score += points;
      lines += cleared;
      level = Math.floor(lines / 10) + 1;
      dropMs = Math.max(80, 800 - (level - 1) * 70);
      updateStats();
    }
  }

  function move(dx) {
    if (!running || paused) return;
    if (!collides(current.m, x + dx, y)) x += dx;
  }
  function softDrop() {
    if (!running || paused) return;
    if (!collides(current.m, x, y + 1)) { y++; score += 1; updateStats(); }
    else lock();
    lastDrop = performance.now();
  }
  function hardDrop() {
    if (!running || paused) return;
    var d = 0;
    while (!collides(current.m, x, y + 1)) { y++; d++; }
    score += d * 2;
    updateStats();
    lock();
    lastDrop = performance.now();
  }
  function rotateCurrent() {
    if (!running || paused) return;
    var r = rotate(current.m);
    var kicks = [0, -1, 1, -2, 2];
    for (var i = 0; i < kicks.length; i++) {
      if (!collides(r, x + kicks[i], y)) {
        current.m = r; x += kicks[i]; return;
      }
    }
  }

  // ---- Rendering ----
  // Derive a darker shade of a hex color for cell borders (contrast vs board).
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
    var g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
    var b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function drawCell(g, cx, cy, color) {
    var px = cx * CELL, py = cy * CELL;
    // Solid body
    g.fillStyle = color;
    g.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    // Top highlight for a beveled, readable look
    g.fillStyle = 'rgba(255,255,255,0.30)';
    g.fillRect(px + 1, py + 1, CELL - 2, Math.max(3, (CELL - 2) * 0.30));
    // Bottom shading
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(px + 1, py + Math.round((CELL - 2) * 0.70), CELL - 2, (CELL - 2) * 0.30);
    // Crisp dark border so each block pops against the dark board
    g.lineWidth = 2;
    g.strokeStyle = shade(color, 0.5);
    g.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3);
  }

  function draw() {
    ctx.clearRect(0, 0, COLS * CELL, ROWS * CELL);
    ctx.fillStyle = '#0a0c18';
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
    // grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    for (var gx = 0; gx <= COLS; gx++) {
      ctx.beginPath(); ctx.moveTo(gx * CELL, 0); ctx.lineTo(gx * CELL, ROWS * CELL); ctx.stroke();
    }
    for (var gy = 0; gy <= ROWS; gy++) {
      ctx.beginPath(); ctx.moveTo(0, gy * CELL); ctx.lineTo(COLS * CELL, gy * CELL); ctx.stroke();
    }
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (board[r][c]) drawCell(ctx, c, r, COLORS[board[r][c]]);
      }
    }
    if (current && running) {
      var m = current.m, col = COLORS[colorOf(current.type)];
      for (var rr = 0; rr < m.length; rr++) {
        for (var cc = 0; cc < m[rr].length; cc++) {
          if (m[rr][cc] && y + rr >= 0) drawCell(ctx, x + cc, y + rr, col);
        }
      }
    }
  }

  function drawNext() {
    nctx.clearRect(0, 0, 96, 96);
    nctx.fillStyle = '#0a0c18';
    nctx.fillRect(0, 0, 96, 96);
    if (!nextType) return;
    var m = SHAPES[nextType];
    var s = 18;
    var w = m[0].length, h = m.length;
    var ox = (96 - w * s) / 2, oy = (96 - h * s) / 2;
    nctx.fillStyle = COLORS[colorOf(nextType)];
    for (var r = 0; r < h; r++) {
      for (var c = 0; c < w; c++) {
        if (m[r][c]) {
          var bx = ox + c * s + 1, by = oy + r * s + 1, bs = s - 2;
          nctx.fillRect(bx, by, bs, bs);
          nctx.lineWidth = 1;
          nctx.strokeStyle = shade(COLORS[colorOf(nextType)], 0.5);
          nctx.strokeRect(bx + 0.5, by + 0.5, bs - 1, bs - 1);
        }
      }
    }
  }

  function updateStats() {
    scoreEl.textContent = score;
    levelEl.textContent = level;
    linesEl.textContent = lines;
    if (score > best) { best = score; GameStore.setBest('tetris', best); }
    bestEl.textContent = best;
  }

  function loop(ts) {
    if (!running) return;
    if (!paused) {
      if (lastDrop == null) lastDrop = ts;
      if (ts - lastDrop >= dropMs) {
        lastDrop = ts;
        if (!collides(current.m, x, y + 1)) y++;
        else lock();
      }
      draw();
    }
    rafId = requestAnimationFrame(loop);
  }

  var SAVE_KEY = 'omg:save:tetris';

  function saveTetrisState() {
    if (!running) {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      return;
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        board: board,
        score: score,
        lines: lines,
        level: level,
        nextType: nextType
      }));
    } catch (e) {}
  }

  function restoreTetrisState() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (data && Array.isArray(data.board) && data.board.length === ROWS) {
        board = data.board;
        score = data.score || 0;
        lines = data.lines || 0;
        level = data.level || 1;
        dropMs = Math.max(80, 800 - (level - 1) * 70);
        nextType = data.nextType || randomType();
        updateStats();
        drawNext();
        draw();
        ovTitle.textContent = '俄罗斯方块 (续玩)';
        ovText.textContent = '已恢复进度：得分 ' + score + ' · 消行 ' + lines;
        ovBtn.textContent = '继续游戏';
        overlay.hidden = false;
        return true;
      }
    } catch (e) {}
    return false;
  }

  function resumeGame() {
    fit();
    updateStats();
    running = true; paused = false;
    overlay.hidden = true;
    pauseBtn.textContent = '⏸';
    lastDrop = null;
    spawn();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function handleStartOrResume() {
    if (ovBtn.textContent === '继续游戏') {
      resumeGame();
    } else {
      start();
    }
  }

  function start() {
    fit();
    board = emptyBoard();
    score = 0; lines = 0; level = 1; dropMs = 800;
    nextType = null;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    updateStats();
    running = true; paused = false;
    overlay.hidden = true;
    pauseBtn.textContent = '⏸';
    lastDrop = null;
    spawn();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function gameOver() {
    running = false;
    cancelAnimationFrame(rafId);
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    if (score > best) { best = score; GameStore.setBest('tetris', best); bestEl.textContent = best; }
    ovTitle.textContent = '游戏结束';
    ovText.textContent = '得分 ' + score + ' · 消行 ' + lines;
    ovBtn.textContent = '再来一局';
    overlay.hidden = false;
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    pauseBtn.textContent = paused ? '▶' : '⏸';
  }

  // ---- Input: keyboard ----
  document.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    if (k === 'arrowleft') move(-1);
    else if (k === 'arrowright') move(1);
    else if (k === 'arrowup' || k === 'x') rotateCurrent();
    else if (k === 'arrowdown') softDrop();
    else if (k === ' ') hardDrop();
    else if (k === 'p') togglePause();
    else if ((k === 'enter' || k === ' ') && !running) handleStartOrResume();
    else return;
    e.preventDefault();
  });

  // ---- Input: on-screen ----
  document.querySelectorAll('.ctrl[data-act]').forEach(function (b) {
    b.addEventListener('click', function () {
      var a = b.dataset.act;
      if (a === 'left') move(-1);
      else if (a === 'right') move(1);
      else if (a === 'rotate') rotateCurrent();
      else if (a === 'down') softDrop();
      else if (a === 'drop') hardDrop();
    });
  });
  pauseBtn.addEventListener('click', togglePause);
  ovBtn.addEventListener('click', handleStartOrResume);

  // ---- Boot ----
  GameStore.getBest('tetris').then(function (b) {
    best = b || 0;
    bestEl.textContent = best;
  });
  fit();
  board = emptyBoard(); // ensure draw() at boot has a board to iterate
  draw();
  if (!restoreTetrisState()) {
    ovTitle.textContent = '俄罗斯方块';
    ovText.textContent = '方向键移动，空格硬降';
    ovBtn.textContent = '开始';
    overlay.hidden = false;
  }
})();
