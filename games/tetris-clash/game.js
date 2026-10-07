/*
 * games/tetris-clash/game.js
 * Tetris Clash (方块死斗) — Real-time Head-to-Head Multiplayer Attack Tetris.
 *
 * Line clear attack rules:
 * - 2 lines cleared = 1 garbage line sent to opponent
 * - 3 lines cleared = 2 garbage lines sent
 * - 4 lines (Tetris) = 4 garbage lines sent!
 *
 * Supports:
 * - Competitive AI duel mode
 * - Realtime WebRTC P2P multiplayer mode via OmniNet
 * - Split-screen Local 2P mode (P1: WASD+Space, P2: Arrows+Num0)
 */
(function () {
  'use strict';

  var COLS = 10;
  var ROWS = 20;

  // 7 Tetromino shapes
  var SHAPES = {
    I: [[1, 1, 1, 1]],
    J: [[1, 0, 0], [1, 1, 1]],
    L: [[0, 0, 1], [1, 1, 1]],
    O: [[1, 1], [1, 1]],
    S: [[0, 1, 1], [1, 1, 0]],
    T: [[0, 1, 0], [1, 1, 1]],
    Z: [[1, 1, 0], [0, 1, 1]]
  };
  var COLORS = {
    1: '#06b6d4', // I cyan
    2: '#3b82f6', // J blue
    3: '#f97316', // L orange
    4: '#eab308', // O yellow
    5: '#22c55e', // S green
    6: '#a855f7', // T purple
    7: '#ef4444', // Z red
    8: '#64748b'  // Garbage grey
  };
  var PIECE_TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

  // Match State
  var match = {
    mode: 'ai', // 'ai' | 'online' | 'local'
    net: null,
    p1Wins: 0,
    p2Wins: 0,
    isHost: true,
    running: false
  };

  // DOM Elements
  var cv1 = document.getElementById('cv1');
  var ctx1 = cv1.getContext('2d');
  var cv2 = document.getElementById('cv2');
  var ctx2 = cv2.getContext('2d');
  var nextCv1 = document.getElementById('nextCv1');
  var nctx1 = nextCv1.getContext('2d');
  var nextCv2 = document.getElementById('nextCv2');
  var nctx2 = nextCv2.getContext('2d');

  var p1LinesEl = document.getElementById('p1Lines');
  var p1AttacksEl = document.getElementById('p1Attacks');
  var p2LinesEl = document.getElementById('p2Lines');
  var p2AttacksEl = document.getElementById('p2Attacks');
  var matchScoreEl = document.getElementById('matchScore');
  var p1KoCount = document.getElementById('p1KoCount');
  var p2KoCount = document.getElementById('p2KoCount');
  var p1NameEl = document.getElementById('p1Name');
  var p2NameEl = document.getElementById('p2Name');
  var p1GarbageBar = document.getElementById('p1GarbageBar');
  var p2GarbageBar = document.getElementById('p2GarbageBar');
  var p1AttackFloat = document.getElementById('p1AttackFloat');
  var p2AttackFloat = document.getElementById('p2AttackFloat');

  var modeSelectBtn = document.getElementById('modeSelectBtn');
  var onlineLobbyBtn = document.getElementById('onlineLobbyBtn');
  var overlay = document.getElementById('overlay');
  var winnerTitle = document.getElementById('winnerTitle');
  var winnerDesc = document.getElementById('winnerDesc');
  var finalStats = document.getElementById('finalStats');
  var playAgainBtn = document.getElementById('playAgainBtn');
  var changeModeBtn = document.getElementById('changeModeBtn');
  var backBtn = document.querySelector('[data-back]');

  /* ---------------- Board Instance Constructor ---------------- */
  function createBoardPlayer(id, cv, ctx, nextCv, nctx, isAi) {
    return {
      id: id,
      cv: cv,
      ctx: ctx,
      nextCv: nextCv,
      nctx: nctx,
      isAi: isAi,
      grid: createEmptyGrid(),
      current: null,
      nextType: randomType(),
      x: 3,
      y: 0,
      lines: 0,
      attacks: 0,
      pendingGarbage: 0,
      dropMs: 650,
      lastDrop: 0,
      alive: true
    };
  }

  function createEmptyGrid() {
    var g = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) row.push(0);
      g.push(row);
    }
    return g;
  }

  function randomType() {
    return PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
  }

  var p1 = createBoardPlayer(1, cv1, ctx1, nextCv1, nctx1, false);
  var p2 = createBoardPlayer(2, cv2, ctx2, nextCv2, nctx2, true);

  /* ---------------- Responsive Canvas Sizing ---------------- */
  function resizeCanvases() {
    var arena = document.getElementById('arena');
    if (!arena) return;
    var rect = arena.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var availH = rect.height - 36;
    var maxBwFromWidth = Math.floor((rect.width - 150) / 2);
    var maxBhFromWidth = maxBwFromWidth * 2;
    var bh = Math.floor(Math.min(availH, maxBhFromWidth > 0 ? maxBhFromWidth : availH, 520));
    bh = Math.max(160, bh);
    var bw = Math.floor(bh / 2); // 10:20 aspect ratio

    document.documentElement.style.setProperty('--bh', bh + 'px');
    document.documentElement.style.setProperty('--bw', bw + 'px');

    var dpr = window.devicePixelRatio || 1;
    [cv1, cv2].forEach(function (c) {
      c.width = bw * dpr;
      c.height = bh * dpr;
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    [nextCv1, nextCv2].forEach(function (nc) {
      nc.width = 44 * dpr;
      nc.height = 44 * dpr;
      nc.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    });

    drawPlayer(p1);
    drawPlayer(p2);
  }
  window.addEventListener('resize', resizeCanvases);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resizeCanvases).observe(document.getElementById('arena'));
  }

  /* ---------------- Piece Mechanics ---------------- */
  function spawnPiece(p) {
    p.current = {
      type: p.nextType,
      matrix: cloneMatrix(SHAPES[p.nextType]),
      colorIdx: PIECE_TYPES.indexOf(p.nextType) + 1
    };
    p.nextType = randomType();
    p.x = Math.floor((COLS - p.current.matrix[0].length) / 2);
    p.y = 0;

    // Check collision on spawn -> Game Over
    if (collides(p.grid, p.current.matrix, p.x, p.y)) {
      p.alive = false;
      onPlayerTopOut(p);
    }
    drawNext(p);
  }

  function collides(grid, matrix, ox, oy) {
    for (var r = 0; r < matrix.length; r++) {
      for (var c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c] !== 0) {
          var nx = ox + c;
          var ny = oy + r;
          if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
          if (ny >= 0 && grid[ny][nx] !== 0) return true;
        }
      }
    }
    return false;
  }

  function rotateMatrix(matrix) {
    var H = matrix.length, W = matrix[0].length;
    var rotated = [];
    for (var c = 0; c < W; c++) {
      var row = [];
      for (var r = H - 1; r >= 0; r--) row.push(matrix[r][c]);
      rotated.push(row);
    }
    return rotated;
  }

  function lockPiece(p) {
    if (!p.current) return;
    var m = p.current.matrix;
    for (var r = 0; r < m.length; r++) {
      for (var c = 0; c < m[r].length; c++) {
        if (m[r][c] !== 0) {
          var gy = p.y + r;
          var gx = p.x + c;
          if (gy >= 0 && gy < ROWS && gx >= 0 && gx < COLS) {
            p.grid[gy][gx] = p.current.colorIdx;
          }
        }
      }
    }

    // Check line clears
    var cleared = 0;
    for (var r = ROWS - 1; r >= 0; r--) {
      var full = true;
      for (var c = 0; c < COLS; c++) {
        if (p.grid[r][c] === 0) { full = false; break; }
      }
      if (full) {
        p.grid.splice(r, 1);
        var emptyRow = [];
        for (var i = 0; i < COLS; i++) emptyRow.push(0);
        p.grid.unshift(emptyRow);
        cleared++;
        r++; // recheck same row index
      }
    }

    if (cleared > 0) {
      p.lines += cleared;
      var attackLines = 0;
      if (cleared === 2) attackLines = 1;
      else if (cleared === 3) attackLines = 2;
      else if (cleared === 4) attackLines = 4; // TETRIS

      if (attackLines > 0) {
        p.attacks += attackLines;
        sendAttack(p, attackLines);
      }
    }

    // Apply incoming garbage if no lines were cleared this drop
    if (cleared === 0 && p.pendingGarbage > 0) {
      applyPendingGarbage(p);
    }

    updateStatsDisplay();

    // Broadcast board in online mode
    if (match.mode === 'online' && match.net && p.id === 1) {
      match.net.send('board', { grid: p.grid, lines: p.lines, attacks: p.attacks });
    }

    spawnPiece(p);
  }

  function applyPendingGarbage(p) {
    var count = Math.min(p.pendingGarbage, 6);
    p.pendingGarbage -= count;
    for (var k = 0; k < count; k++) {
      p.grid.shift();
      var hole = Math.floor(Math.random() * COLS);
      var gRow = [];
      for (var c = 0; c < COLS; c++) gRow.push(c === hole ? 0 : 8); // 8 = grey garbage
      p.grid.push(gRow);
    }
  }

  function sendAttack(fromPlayer, count) {
    var target = fromPlayer.id === 1 ? p2 : p1;
    var floatEl = fromPlayer.id === 1 ? p1AttackFloat : p2AttackFloat;

    floatEl.textContent = count === 4 ? '🔥 TETRIS +4' : '💥 攻击 +' + count;
    floatEl.classList.add('active');
    setTimeout(function () { floatEl.classList.remove('active'); }, 700);

    if (match.mode === 'online') {
      if (fromPlayer.id === 1 && match.net) {
        match.net.send('attack', { count: count });
      }
    } else {
      target.pendingGarbage += count;
    }
  }

  /* ---------------- Rendering ---------------- */
  function drawPlayer(p) {
    var w = p.cv.width / (window.devicePixelRatio || 1);
    var h = p.cv.height / (window.devicePixelRatio || 1);
    var cw = w / COLS;
    var ch = h / ROWS;
    var ctx = p.ctx;

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (var c = 0; c <= COLS; c++) {
      ctx.beginPath(); ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, h); ctx.stroke();
    }

    // Stack
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var v = p.grid[r][c];
        if (v !== 0) drawCell(ctx, c * cw, r * ch, cw, ch, COLORS[v]);
      }
    }

    // Active piece & Ghost piece (for P1 or active local)
    if (p.current && p.alive) {
      // Ghost
      var gy = p.y;
      while (!collides(p.grid, p.current.matrix, p.x, gy + 1)) gy++;
      drawMatrix(ctx, p.current.matrix, p.x * cw, gy * ch, cw, ch, 'rgba(255,255,255,0.15)');

      // Falling
      drawMatrix(ctx, p.current.matrix, p.x * cw, p.y * ch, cw, ch, COLORS[p.current.colorIdx]);
    }
  }

  function drawCell(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  function drawMatrix(ctx, m, ox, oy, cw, ch, color) {
    for (var r = 0; r < m.length; r++) {
      for (var c = 0; c < m[r].length; c++) {
        if (m[r][c] !== 0) drawCell(ctx, ox + c * cw, oy + r * ch, cw, ch, color);
      }
    }
  }

  function drawNext(p) {
    var ctx = p.nctx;
    var w = p.nextCv.width / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, w);
    var shape = SHAPES[p.nextType];
    var cellSize = 8;
    var ox = (w - shape[0].length * cellSize) / 2;
    var oy = (w - shape.length * cellSize) / 2;
    drawMatrix(ctx, shape, ox, oy, cellSize, cellSize, COLORS[PIECE_TYPES.indexOf(p.nextType) + 1]);
  }

  function updateStatsDisplay() {
    p1LinesEl.textContent = p1.lines;
    p1AttacksEl.textContent = p1.attacks;
    p2LinesEl.textContent = p2.lines;
    p2AttacksEl.textContent = p2.attacks;

    p1GarbageBar.style.setProperty('--gh', Math.min(100, p1.pendingGarbage * 16.6) + '%');
    p2GarbageBar.style.setProperty('--gh', Math.min(100, p2.pendingGarbage * 16.6) + '%');
  }

  /* ---------------- Game Loop & AI ---------------- */
  function loop(time) {
    if (!match.running) return;

    // Player 1 step
    if (p1.alive && p1.current) {
      if (time - p1.lastDrop > p1.dropMs) {
        if (!collides(p1.grid, p1.current.matrix, p1.x, p1.y + 1)) {
          p1.y++;
        } else {
          lockPiece(p1);
        }
        p1.lastDrop = time;
      }
    }

    // Player 2 step (if AI or local)
    if (p2.alive && p2.current) {
      if (match.mode === 'ai') {
        runAiStep(time);
      } else if (match.mode === 'local') {
        if (time - p2.lastDrop > p2.dropMs) {
          if (!collides(p2.grid, p2.current.matrix, p2.x, p2.y + 1)) p2.y++;
          else lockPiece(p2);
          p2.lastDrop = time;
        }
      }
    }

    drawPlayer(p1);
    drawPlayer(p2);
    requestAnimationFrame(loop);
  }

  function runAiStep(time) {
    if (time - p2.lastDrop > 750) {
      // Simple heuristic: slide towards column with lowest stack
      var lowestCol = 0, lowestH = 999;
      for (var c = 0; c < COLS; c++) {
        var h = 0;
        for (var r = 0; r < ROWS; r++) {
          if (p2.grid[r][c] !== 0) { h = ROWS - r; break; }
        }
        if (h < lowestH) { lowestH = h; lowestCol = c; }
      }
      if (p2.x < lowestCol && !collides(p2.grid, p2.current.matrix, p2.x + 1, p2.y)) p2.x++;
      else if (p2.x > lowestCol && !collides(p2.grid, p2.current.matrix, p2.x - 1, p2.y)) p2.x--;

      // Drop down
      if (!collides(p2.grid, p2.current.matrix, p2.x, p2.y + 1)) p2.y++;
      else lockPiece(p2);

      p2.lastDrop = time;
    }
  }

  function onPlayerTopOut(p) {
    match.running = false;
    var winner = p.id === 1 ? p2 : p1;
    if (winner.id === 1) match.p1Wins++;
    else match.p2Wins++;

    if (match.mode === 'online' && match.net && p.id === 1) {
      match.net.send('ko', {});
    }

    matchScoreEl.textContent = match.p1Wins + ' : ' + match.p2Wins;
    p1KoCount.textContent = match.p1Wins + ' 胜';
    p2KoCount.textContent = match.p2Wins + ' 胜';

    winnerTitle.textContent = winner.id === 1 ? 'KO! 蓝方胜出！' : 'KO! 红方胜出！';
    winnerDesc.textContent = (winner.id === 1 ? '你' : '对手') + '通过凶猛的垃圾行压制击溃了对方！';
    finalStats.innerHTML =
      '<span>总消行：<b>' + (p1.lines + p2.lines) + '</b></span>' +
      '<span>总攻防：<b>' + (p1.attacks + p2.attacks) + ' 行</b></span>';
    overlay.hidden = false;

    // Record battle
    if (window.GameStore && window.GameStore.recordBattle) {
      GameStore.recordBattle({
        gameId: 'tetris-clash',
        opponent: match.mode === 'online' ? (match.opponentName || '网络对手') : (match.mode === 'ai' ? '🤖 竞技人机' : '本地双人'),
        result: winner.id === 1 ? 'win' : 'loss',
        mode: match.mode
      });
    }
  }

  /* ---------------- Controls ---------------- */
  function moveP1(dx) {
    if (!match.running || !p1.current) return;
    if (!collides(p1.grid, p1.current.matrix, p1.x + dx, p1.y)) p1.x += dx;
  }
  function rotateP1() {
    if (!match.running || !p1.current) return;
    var r = rotateMatrix(p1.current.matrix);
    if (!collides(p1.grid, r, p1.x, p1.y)) p1.current.matrix = r;
  }
  function dropP1() {
    if (!match.running || !p1.current) return;
    while (!collides(p1.grid, p1.current.matrix, p1.x, p1.y + 1)) p1.y++;
    lockPiece(p1);
  }
  function softDropP1() {
    if (!match.running || !p1.current) return;
    if (!collides(p1.grid, p1.current.matrix, p1.x, p1.y + 1)) p1.y++;
  }

  // Keyboard mapping
  window.addEventListener('keydown', function (e) {
    if (!match.running) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') moveP1(-1);
    else if (e.key === 'ArrowRight' || e.key === 'd') moveP1(1);
    else if (e.key === 'ArrowUp' || e.key === 'w') rotateP1();
    else if (e.key === 'ArrowDown' || e.key === 's') softDropP1();
    else if (e.key === ' ' || e.key === 'Enter') dropP1();
  });

  document.getElementById('btnLeft').onclick = function () { moveP1(-1); };
  document.getElementById('btnRight').onclick = function () { moveP1(1); };
  document.getElementById('btnRot').onclick = rotateP1;
  document.getElementById('btnDown').onclick = softDropP1;
  document.getElementById('btnDrop').onclick = dropP1;

  /* ---------------- Reset & Modes ---------------- */
  function startMatch() {
    p1 = createBoardPlayer(1, cv1, ctx1, nextCv1, nctx1, false);
    p2 = createBoardPlayer(2, cv2, ctx2, nextCv2, nctx2, match.mode === 'ai');
    spawnPiece(p1);
    if (match.mode !== 'online') {
      spawnPiece(p2);
    } else {
      p2.current = null;
    }
    updateStatsDisplay();
    overlay.hidden = true;
    match.running = true;
    resizeCanvases();
    requestAnimationFrame(loop);
  }

  function setMode(mode, net, isHost, opponent) {
    match.mode = mode;
    match.net = net;
    match.isHost = isHost;

    if (mode === 'ai') {
      modeSelectBtn.textContent = '模式: 🤖 竞技人机';
      p2NameEl.textContent = '竞技人机';
    } else if (mode === 'local') {
      modeSelectBtn.textContent = '模式: 👥 本地';
      p2NameEl.textContent = '玩家 2';
    } else if (mode === 'online') {
      match.opponentName = (opponent && opponent.nickname) || '网络好友';
      modeSelectBtn.textContent = '模式: 🌐 联机';
      p2NameEl.textContent = match.opponentName;

      net.on('msg:attack', function (d) {
        p1.pendingGarbage += (d.count || 1);
        updateStatsDisplay();
      });
      net.on('msg:board', function (d) {
        if (d.grid) p2.grid = d.grid;
        p2.lines = d.lines || 0;
        p2.attacks = d.attacks || 0;
        updateStatsDisplay();
        drawPlayer(p2);
      });
      net.on('msg:ko', function () {
        p2.alive = false;
        onPlayerTopOut(p2);
      });
      net.on('msg:rematch', function () {
        startMatch();
      });
      net.on('disconnected', function () {
        alert('对手已离开房间');
        setMode('ai');
      });
    }
    startMatch();
  }

  modeSelectBtn.onclick = function () {
    if (match.mode === 'ai') setMode('local');
    else setMode('ai');
  };

  onlineLobbyBtn.onclick = function () {
    if (window.OmniNetUI) {
      OmniNetUI.showLobby({
        gameId: 'tetris-clash',
        gameTitle: '方块死斗',
        onReady: function (res) {
          if (res.mode === 'online') setMode('online', res.net, res.isHost, res.opponent);
          else setMode('local');
        }
      });
    }
  };

  playAgainBtn.onclick = function () {
    if (match.mode === 'online' && match.net) {
      match.net.send('rematch', {});
    }
    startMatch();
  };

  changeModeBtn.onclick = function () {
    overlay.hidden = true;
    onlineLobbyBtn.click();
  };

  if (backBtn) {
    backBtn.onclick = function () {
      try { parent.postMessage({ type: 'omnigame:home' }, '*'); } catch (e) {}
      if (window.parent === window) {
        if (history.length > 1) history.back();
        else window.location.href = '../../index.html';
      }
    };
  }

  function cloneMatrix(m) {
    return m.map(function (row) { return row.slice(); });
  }

  // Boot
  setMode('ai');
})();
