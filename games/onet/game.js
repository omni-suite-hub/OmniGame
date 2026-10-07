/*
 * games/onet/game.js
 * 开心连连看 (Tile Connect / Onet)
 *
 * Full-featured Onet matching game:
 * - Precise 0-turn, 1-turn, and 2-turn obstacle-avoiding pathfinding
 * - Outside boundary perimeter wrapping
 * - Animated laser connection line on match
 * - Hint & Shuffle tools with auto-solvable check
 * - Combo multipliers & Web Audio sound effects
 */
(function () {
  'use strict';

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('scoreVal');
  var bestEl = document.getElementById('bestVal');
  var timerEl = document.getElementById('timerVal');
  var hintBtn = document.getElementById('hintBtn');
  var shuffleBtn = document.getElementById('shuffleBtn');
  var soundBtn = document.getElementById('soundBtn');
  var restartBtn = document.getElementById('restartBtn');
  var modal = document.getElementById('modalOverlay');
  var modalTitle = document.getElementById('modalTitle');
  var modalEmoji = document.getElementById('modalEmoji');
  var finalScoreEl = document.getElementById('finalScore');
  var finalBestEl = document.getElementById('finalBest');
  var playAgainBtn = document.getElementById('playAgainBtn');

  var LOGICAL_W = 380;
  var LOGICAL_H = 460;

  var INNER_ROWS = 6;
  var INNER_COLS = 8;
  var ROWS = INNER_ROWS + 2; // +2 for perimeter boundary routing
  var COLS = INNER_COLS + 2;
  var CELL_W = Math.floor(LOGICAL_W / COLS);
  var CELL_H = Math.floor(LOGICAL_H / ROWS);

  var dpr = window.devicePixelRatio || 1;
  function setupDpr() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(LOGICAL_W * dpr);
    canvas.height = Math.round(LOGICAL_H * dpr);
  }
  setupDpr();
  window.addEventListener('resize', setupDpr);

  // ---- Audio Engine (Web Audio API) -----------------------------------------
  var audioCtx = null;
  var soundEnabled = true;

  function initAudio() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      var AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function () {});
    }
  }

  function playSound(type, combo) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;

    var now = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'select') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'match') {
      var baseF = 523.25 + Math.min(8, (combo || 0)) * 60;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseF, now);
      osc.frequency.exponentialRampToValueAtTime(baseF * 1.5, now + 0.12);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.14);
    } else if (type === 'shuffle') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(600, now + 0.15);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        var o = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f, now + i * 0.09);
        g.gain.setValueAtTime(0.2, now + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.28);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(now + i * 0.09);
        o.stop(now + i * 0.09 + 0.28);
      });
    }
  }

  try {
    var storedSound = localStorage.getItem('omg:onet:sound');
    if (storedSound !== null) soundEnabled = storedSound === '1';
  } catch (e) {}
  soundBtn.textContent = soundEnabled ? '🔊' : '🔇';

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
    try {
      localStorage.setItem('omg:onet:sound', soundEnabled ? '1' : '0');
    } catch (e) {}
  });

  // ---- High Score Persistence -----------------------------------------------
  var bestScore = 0;
  function loadBestScore() {
    if (window.GameStore && typeof window.GameStore.getBest === 'function') {
      window.GameStore.getBest('onet').then(function (val) {
        bestScore = val || 0;
        bestEl.textContent = bestScore;
      });
    } else {
      try {
        bestScore = parseInt(localStorage.getItem('omg:best:onet') || '0', 10);
        bestEl.textContent = bestScore;
      } catch (e) {}
    }
  }

  function saveBestScore(sc) {
    if (sc > bestScore) {
      bestScore = sc;
      bestEl.textContent = bestScore;
      if (window.GameStore && typeof window.GameStore.saveBest === 'function') {
        window.GameStore.saveBest('onet', bestScore);
      } else {
        try {
          localStorage.setItem('omg:best:onet', String(bestScore));
        } catch (e) {}
      }
    }
  }

  // ---- Game State & Entities ------------------------------------------------
  var ICONS = ['🐶', '🐱', '🐼', '🦊', '🐰', '🐯', '🦁', '🐸', '🐵', '🦄', '🐙', '🐧'];
  var grid = []; // 2D array [ROWS][COLS], 0 = empty, string = emoji
  var selected = null; // { r, c }
  var hintPair = null; // [ {r,c}, {r,c} ]
  var activeLaser = null; // { path: [ {r,c}, ... ], timer: 14 }
  var score = 0;
  var remainingTiles = 0;
  var timeLeft = 150; // 2 min 30 sec
  var timerInterval = null;
  var hintCount = 3;
  var shuffleCount = 3;
  var combo = 0;
  var comboResetTimer = null;
  var isGameOver = false;

  function updateToolsUI() {
    hintBtn.textContent = '💡 ' + hintCount;
    shuffleBtn.textContent = '🔀 ' + shuffleCount;
  }

  function formatTimer(s) {
    var m = Math.floor(s / 60);
    var sec = s % 60;
    return (m < 10 ? '0' + m : m) + ':' + (sec < 10 ? '0' + sec : sec);
  }

  function initBoard() {
    grid = [];
    for (var r = 0; r < ROWS; r++) {
      grid[r] = [];
      for (var c = 0; c < COLS; c++) {
        grid[r][c] = 0; // Empty perimeter
      }
    }

    // Fill inner 6x8 = 48 tiles (12 icons x 4 each = 24 pairs)
    var pool = [];
    for (var i = 0; i < ICONS.length; i++) {
      for (var k = 0; k < 4; k++) pool.push(ICONS[i]);
    }
    // Shuffle pool
    for (var p = pool.length - 1; p > 0; p--) {
      var j = Math.floor(Math.random() * (p + 1));
      var temp = pool[p];
      pool[p] = pool[j];
      pool[j] = temp;
    }

    var idx = 0;
    for (var ir = 1; ir <= INNER_ROWS; ir++) {
      for (var ic = 1; ic <= INNER_COLS; ic++) {
        grid[ir][ic] = pool[idx++];
      }
    }
    remainingTiles = INNER_ROWS * INNER_COLS;

    // Ensure valid moves exist initially
    if (!findAnyValidMove()) {
      shuffleBoard(false);
    }
  }

  var SAVE_KEY = 'omg:save:onet';

  function saveOnetState() {
    if (isGameOver) {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      return;
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        grid: grid,
        score: score,
        remainingTiles: remainingTiles,
        timeLeft: timeLeft,
        hintCount: hintCount,
        shuffleCount: shuffleCount
      }));
    } catch (e) {}
  }

  function restoreOnetState() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (data && Array.isArray(data.grid) && data.remainingTiles > 0 && data.timeLeft > 0) {
        grid = data.grid;
        score = data.score || 0;
        remainingTiles = data.remainingTiles;
        timeLeft = data.timeLeft;
        hintCount = data.hintCount != null ? data.hintCount : 3;
        shuffleCount = data.shuffleCount != null ? data.shuffleCount : 3;
        selected = null;
        hintPair = null;
        activeLaser = null;
        isGameOver = false;
        combo = 0;
        scoreEl.textContent = score;
        timerEl.textContent = formatTimer(timeLeft);
        if (timeLeft <= 30) timerEl.classList.add('warning');
        updateToolsUI();
        modal.classList.add('hidden');

        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(function () {
          if (isGameOver) return;
          timeLeft--;
          timerEl.textContent = formatTimer(timeLeft);
          if (timeLeft <= 30) timerEl.classList.add('warning');
          if (timeLeft % 5 === 0) saveOnetState();
          if (timeLeft <= 0) {
            triggerGameOver(false);
          }
        }, 1000);
        return true;
      }
    } catch (e) {}
    return false;
  }

  function resetGame() {
    score = 0;
    timeLeft = 150;
    hintCount = 3;
    shuffleCount = 3;
    selected = null;
    hintPair = null;
    activeLaser = null;
    isGameOver = false;
    combo = 0;
    scoreEl.textContent = '0';
    timerEl.textContent = formatTimer(timeLeft);
    timerEl.classList.remove('warning');
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    updateToolsUI();
    initBoard();
    modal.classList.add('hidden');

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(function () {
      if (isGameOver) return;
      timeLeft--;
      timerEl.textContent = formatTimer(timeLeft);
      if (timeLeft <= 30) timerEl.classList.add('warning');
      if (timeLeft % 5 === 0) saveOnetState();
      if (timeLeft <= 0) {
        triggerGameOver(false);
      }
    }, 1000);
  }

  // ---- Onet Pathfinding (Max 2 turns) ---------------------------------------
  function isDirectClear(p1, p2) {
    if (p1.r !== p2.r && p1.c !== p2.c) return false;
    if (p1.r === p2.r) {
      var minC = Math.min(p1.c, p2.c);
      var maxC = Math.max(p1.c, p2.c);
      for (var c = minC + 1; c < maxC; c++) {
        if (grid[p1.r][c] !== 0) return false;
      }
      return true;
    } else {
      var minR = Math.min(p1.r, p2.r);
      var maxR = Math.max(p1.r, p2.r);
      for (var r = minR + 1; r < maxR; r++) {
        if (grid[r][p1.c] !== 0) return false;
      }
      return true;
    }
  }

  function findPath(p1, p2) {
    if (p1.r === p2.r && p1.c === p2.c) return null;
    if (grid[p1.r][p1.c] !== grid[p2.r][p2.c]) return null;

    // 1. Zero-turn (Direct line)
    if (isDirectClear(p1, p2)) {
      return [p1, p2];
    }

    // 2. One-turn (Corner)
    var c1 = { r: p1.r, c: p2.c };
    if (grid[c1.r][c1.c] === 0 && isDirectClear(p1, c1) && isDirectClear(c1, p2)) {
      return [p1, c1, p2];
    }
    var c2 = { r: p2.r, c: p1.c };
    if (grid[c2.r][c2.c] === 0 && isDirectClear(p1, c2) && isDirectClear(c2, p2)) {
      return [p1, c2, p2];
    }

    // 3. Two-turn (Scan horizontal ray from p1)
    for (var col = 0; col < COLS; col++) {
      if (col === p1.c) continue;
      var k1 = { r: p1.r, c: col };
      if (grid[k1.r][k1.c] === 0 && isDirectClear(p1, k1)) {
        var corner = { r: p2.r, c: col };
        if (grid[corner.r][corner.c] === 0 && isDirectClear(k1, corner) && isDirectClear(corner, p2)) {
          return [p1, k1, corner, p2];
        }
      }
    }

    // Two-turn (Scan vertical ray from p1)
    for (var row = 0; row < ROWS; row++) {
      if (row === p1.r) continue;
      var k2 = { r: row, c: p1.c };
      if (grid[k2.r][k2.c] === 0 && isDirectClear(p1, k2)) {
        var corner2 = { r: row, c: p2.c };
        if (grid[corner2.r][corner2.c] === 0 && isDirectClear(k2, corner2) && isDirectClear(corner2, p2)) {
          return [p1, k2, corner2, p2];
        }
      }
    }

    return null;
  }

  function findAnyValidMove() {
    var tiles = [];
    for (var r = 1; r <= INNER_ROWS; r++) {
      for (var c = 1; c <= INNER_COLS; c++) {
        if (grid[r][c] !== 0) tiles.push({ r: r, c: c, val: grid[r][c] });
      }
    }

    for (var i = 0; i < tiles.length; i++) {
      for (var j = i + 1; j < tiles.length; j++) {
        if (tiles[i].val === tiles[j].val) {
          var path = findPath(tiles[i], tiles[j]);
          if (path) return [tiles[i], tiles[j]];
        }
      }
    }
    return null;
  }

  function shuffleBoard(costItem) {
    if (costItem) {
      if (shuffleCount <= 0) return;
      shuffleCount--;
      updateToolsUI();
    }
    playSound('shuffle');

    // Extract all remaining tiles
    var remaining = [];
    for (var r = 1; r <= INNER_ROWS; r++) {
      for (var c = 1; c <= INNER_COLS; c++) {
        if (grid[r][c] !== 0) remaining.push(grid[r][c]);
      }
    }

    var attempts = 0;
    while (attempts < 50) {
      // Shuffle array
      for (var p = remaining.length - 1; p > 0; p--) {
        var j = Math.floor(Math.random() * (p + 1));
        var temp = remaining[p];
        remaining[p] = remaining[j];
        remaining[j] = temp;
      }

      // Put back
      var idx = 0;
      for (var ir = 1; ir <= INNER_ROWS; ir++) {
        for (var jc = 1; jc <= INNER_COLS; jc++) {
          if (grid[ir][jc] !== 0) {
            grid[ir][jc] = remaining[idx++];
          }
        }
      }

      if (findAnyValidMove()) break;
      attempts++;
    }

    selected = null;
    hintPair = null;
    render();
    saveOnetState();
  }

  function useHint() {
    if (hintCount <= 0 || isGameOver) return;
    var pair = findAnyValidMove();
    if (pair) {
      hintCount--;
      updateToolsUI();
      hintPair = pair;
      playSound('select');
      render();
      saveOnetState();
    }
  }

  // ---- Tile Selection & Match -----------------------------------------------
  function handleCellClick(r, c) {
    if (isGameOver) return;
    if (r < 1 || r > INNER_ROWS || c < 1 || c > INNER_COLS) return;
    if (grid[r][c] === 0) return;

    hintPair = null;

    if (!selected) {
      selected = { r: r, c: c };
      playSound('select');
      render();
      return;
    }

    if (selected.r === r && selected.c === c) {
      // Deselect
      selected = null;
      render();
      return;
    }

    // Try match
    var path = findPath(selected, { r: r, c: c });
    if (path) {
      // MATCH SUCCESS!
      var p1 = selected;
      var p2 = { r: r, c: c };
      grid[p1.r][p1.c] = 0;
      grid[p2.r][p2.c] = 0;
      remainingTiles -= 2;

      combo++;
      clearTimeout(comboResetTimer);
      comboResetTimer = setTimeout(function () { combo = 0; }, 2800);

      var gainPts = 20 * Math.min(5, combo);
      score += gainPts;
      scoreEl.textContent = score;
      saveBestScore(score);
      saveOnetState();

      activeLaser = { path: path, timer: 14 };
      playSound('match', combo);

      selected = null;

      // Check win or auto-shuffle
      if (remainingTiles <= 0) {
        triggerGameOver(true);
      } else if (!findAnyValidMove()) {
        setTimeout(function () { shuffleBoard(false); }, 300);
      }
    } else {
      // Switch selection to newly clicked tile
      selected = { r: r, c: c };
      playSound('select');
    }
    render();
  }

  function triggerGameOver(isWin) {
    isGameOver = true;
    if (timerInterval) clearInterval(timerInterval);
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}

    saveBestScore(score);
    finalScoreEl.textContent = score;
    finalBestEl.textContent = bestScore;

    if (isWin) {
      playSound('win');
      modalEmoji.textContent = '🎉';
      modalTitle.textContent = '全清通关！';
    } else {
      modalEmoji.textContent = '⏰';
      modalTitle.textContent = '时间耗尽！';
    }
    modal.classList.remove('hidden');
  }

  // ---- Controls / Listeners -------------------------------------------------
  function getGridCoords(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = LOGICAL_W / rect.width;
    var scaleY = LOGICAL_H / rect.height;
    var x = (clientX - rect.left) * scaleX;
    var y = (clientY - rect.top) * scaleY;
    var c = Math.floor(x / CELL_W);
    var r = Math.floor(y / CELL_H);
    return { r: r, c: c };
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    var coords = getGridCoords(e.clientX, e.clientY);
    handleCellClick(coords.r, coords.c);
  });

  hintBtn.addEventListener('click', useHint);
  shuffleBtn.addEventListener('click', function () { shuffleBoard(true); });
  restartBtn.addEventListener('click', resetGame);
  playAgainBtn.addEventListener('click', resetGame);

  // ---- Rendering ------------------------------------------------------------
  function render() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

    // 1. Grid Background & Cards
    var fontSize = Math.floor(CELL_W * 0.52);

    for (var r = 1; r <= INNER_ROWS; r++) {
      for (var c = 1; c <= INNER_COLS; c++) {
        var val = grid[r][c];
        if (val === 0) continue;

        var x = c * CELL_W + 2;
        var y = r * CELL_H + 2;
        var w = CELL_W - 4;
        var h = CELL_H - 4;

        var isSel = (selected && selected.r === r && selected.c === c);
        var isHint = (hintPair && ((hintPair[0].r === r && hintPair[0].c === c) || (hintPair[1].r === r && hintPair[1].c === c)));

        // Card body gradient
        var grad = ctx.createLinearGradient(x, y, x, y + h);
        if (isSel) {
          grad.addColorStop(0, '#0284c7');
          grad.addColorStop(1, '#0369a1');
        } else if (isHint) {
          grad.addColorStop(0, '#facc15');
          grad.addColorStop(1, '#ca8a04');
        } else {
          grad.addColorStop(0, '#1e293b');
          grad.addColorStop(1, '#0f172a');
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 6);
        ctx.fill();

        ctx.strokeStyle = isSel ? '#38bdf8' : (isHint ? '#fef08a' : 'rgba(255, 255, 255, 0.15)');
        ctx.lineWidth = isSel || isHint ? 2 : 1;
        ctx.stroke();

        // Emoji Icon
        ctx.font = fontSize + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(val, x + w / 2, y + h / 2 + 1);
      }
    }

    // 2. Active Laser Connection Line
    if (activeLaser && activeLaser.timer > 0) {
      activeLaser.timer--;
      var pts = activeLaser.path;

      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      for (var p = 0; p < pts.length; p++) {
        var px = pts[p].c * CELL_W + CELL_W / 2;
        var py = pts[p].r * CELL_H + CELL_H / 2;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Bright inner core line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  // ---- Main Loop ------------------------------------------------------------
  function loop() {
    render();
    requestAnimationFrame(loop);
  }

  // ---- Bootstrap ------------------------------------------------------------
  loadBestScore();
  if (!restoreOnetState()) {
    resetGame();
  }
  requestAnimationFrame(loop);
})();
