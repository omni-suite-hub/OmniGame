/*
 * games/gomoku/game.js
 * 经典五子棋 (Gomoku / Five in a Row)
 *
 * Features:
 * - 15×15 standard board with authentic wooden grain canvas rendering
 * - Convex 3D stones with light glare and drop shadows
 * - Smart heuristic AI with 3 difficulties (初级, 进阶, 大师)
 * - Local 2-Player mode (双人同屏)
 * - Unlimited Undo (悔棋), last-move ring indicator, and winning 5-in-a-row laser beam
 * - Web Audio physical stone placement acoustics
 * - Mid-game continuity auto-save & restore
 */
(function () {
  'use strict';

  var BOARD_SIZE = 15;
  var EMPTY = 0;
  var BLACK = 1;
  var WHITE = 2;

  var canvas = document.getElementById('boardCanvas');
  var ctx = canvas.getContext('2d');
  var turnBadge = document.getElementById('turnBadge');
  var statusMsg = document.getElementById('statusMsg');
  var soundBtn = document.getElementById('soundBtn');
  var undoBtn = document.getElementById('undoBtn');
  var restartBtn = document.getElementById('restartBtn');
  var oppBtns = document.querySelectorAll('#oppGroup .mode-btn');
  var diffBtns = document.querySelectorAll('#diffGroup .diff-btn');
  var modal = document.getElementById('modalOverlay');
  var modalEmoji = document.getElementById('modalEmoji');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalPlayAgain = document.getElementById('modalPlayAgain');

  var board = []; // 15x15: EMPTY, BLACK, WHITE
  var history = []; // array of { r, c, player }
  var currentTurn = BLACK;
  var opponentMode = 'ai'; // 'ai' or 'pvp'
  var difficulty = 'norm'; // 'easy', 'norm', 'hard'
  var isGameOver = false;
  var winningLine = null; // [ {r,c}, ... ] 5 stones
  var isAiThinking = false;

  var dpr = window.devicePixelRatio || 1;
  var boardPx = 450;
  var cellPx = boardPx / (BOARD_SIZE + 1);

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

  function playSound(type) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;

    var now = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'stone') {
      // Wood clack sound
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.05);
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (type === 'undo') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        var o = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f, now + i * 0.08);
        g.gain.setValueAtTime(0.2, now + i * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.32);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(now + i * 0.08);
        o.stop(now + i * 0.08 + 0.32);
      });
    }
  }

  try {
    var storedSound = localStorage.getItem('omg:gomoku:sound');
    if (storedSound !== null) soundEnabled = storedSound === '1';
  } catch (e) {}
  soundBtn.textContent = soundEnabled ? '🔊' : '🔇';

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
    try {
      localStorage.setItem('omg:gomoku:sound', soundEnabled ? '1' : '0');
    } catch (e) {}
  });

  // ---- Canvas Sizing & DPR --------------------------------------------------
  function resizeBoard() {
    var wrap = document.querySelector('.board-wrap');
    if (!wrap) return;
    var w = wrap.clientWidth;
    var h = wrap.clientHeight;
    var size = Math.min(w - 12, h - 12, 520);
    size = Math.max(280, size);

    boardPx = size;
    cellPx = boardPx / (BOARD_SIZE + 1);

    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(boardPx * dpr);
    canvas.height = Math.round(boardPx * dpr);
    canvas.style.width = boardPx + 'px';
    canvas.style.height = boardPx + 'px';

    render();
  }

  window.addEventListener('resize', resizeBoard);

  // ---- State Persistence ----------------------------------------------------
  var SAVE_KEY = 'omg:save:gomoku';

  function saveGameState() {
    if (isGameOver) {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      return;
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        board: board,
        history: history,
        currentTurn: currentTurn,
        opponentMode: opponentMode,
        difficulty: difficulty
      }));
    } catch (e) {}
  }

  function restoreGameState() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (data && Array.isArray(data.board) && data.board.length === BOARD_SIZE && Array.isArray(data.history)) {
        board = data.board;
        history = data.history;
        currentTurn = data.currentTurn || BLACK;
        opponentMode = data.opponentMode || 'ai';
        difficulty = data.difficulty || 'norm';
        isGameOver = false;
        winningLine = null;

        oppBtns.forEach(function (b) {
          b.classList.toggle('active', b.dataset.opp === opponentMode);
        });
        diffBtns.forEach(function (b) {
          b.classList.toggle('active', b.dataset.diff === difficulty);
        });
        var diffGroup = document.getElementById('diffGroup');
        if (diffGroup) diffGroup.style.display = opponentMode === 'ai' ? 'flex' : 'none';

        updateUI();
        resizeBoard();
        return true;
      }
    } catch (e) {}
    return false;
  }

  // ---- Game Board Lifecycle -------------------------------------------------
  function initBoard() {
    board = [];
    for (var r = 0; r < BOARD_SIZE; r++) {
      var row = [];
      for (var c = 0; c < BOARD_SIZE; c++) {
        row.push(EMPTY);
      }
      board.push(row);
    }
    history = [];
    currentTurn = BLACK;
    isGameOver = false;
    winningLine = null;
    isAiThinking = false;
    modal.classList.add('hidden');
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}

    updateUI();
    render();
  }

  function updateUI() {
    if (currentTurn === BLACK) {
      turnBadge.className = 'turn-badge black-turn';
      turnBadge.textContent = (opponentMode === 'ai' ? '玩家执黑' : '黑方回合');
      statusMsg.textContent = isGameOver ? '对局已结束' : '黑子先行，落子无悔';
    } else {
      turnBadge.className = 'turn-badge white-turn';
      turnBadge.textContent = (opponentMode === 'ai' ? '白方(电脑)' : '白方回合');
      statusMsg.textContent = isGameOver ? '对局已结束' : (opponentMode === 'ai' ? '电脑思考中…' : '轮到白方落子');
    }
    undoBtn.disabled = history.length === 0 || isGameOver || isAiThinking;
    undoBtn.style.opacity = undoBtn.disabled ? '0.45' : '1';
  }

  // ---- Move Logic -----------------------------------------------------------
  function makeMove(r, c) {
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return false;
    if (board[r][c] !== EMPTY || isGameOver || isAiThinking) return false;

    board[r][c] = currentTurn;
    history.push({ r: r, c: c, player: currentTurn });
    playSound('stone');

    var win = checkWin(r, c, currentTurn);
    if (win) {
      isGameOver = true;
      winningLine = win;
      render();
      setTimeout(function () {
        playSound('win');
        triggerGameOver(currentTurn);
      }, 200);
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      return true;
    }

    // Check board full / draw
    if (history.length >= BOARD_SIZE * BOARD_SIZE) {
      isGameOver = true;
      render();
      setTimeout(function () {
        triggerDraw();
      }, 200);
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      return true;
    }

    currentTurn = currentTurn === BLACK ? WHITE : BLACK;
    updateUI();
    render();
    saveGameState();

    // Trigger AI if in AI mode and it's White's turn
    if (opponentMode === 'ai' && currentTurn === WHITE && !isGameOver) {
      isAiThinking = true;
      updateUI();
      setTimeout(function () {
        aiPlayMove();
        isAiThinking = false;
        updateUI();
      }, 180);
    }

    return true;
  }

  function undoMove() {
    if (history.length === 0 || isGameOver || isAiThinking) return;
    playSound('undo');

    if (opponentMode === 'ai') {
      // In vs AI mode, undo both AI's and player's moves
      if (history.length >= 2) {
        var aiMove = history.pop();
        board[aiMove.r][aiMove.c] = EMPTY;
        var pMove = history.pop();
        board[pMove.r][pMove.c] = EMPTY;
        currentTurn = BLACK;
      } else if (history.length === 1) {
        var last = history.pop();
        board[last.r][last.c] = EMPTY;
        currentTurn = BLACK;
      }
    } else {
      // In 2-Player mode, undo last single move
      var singleMove = history.pop();
      board[singleMove.r][singleMove.c] = EMPTY;
      currentTurn = singleMove.player;
    }

    winningLine = null;
    isGameOver = false;
    modal.classList.add('hidden');
    updateUI();
    render();
    saveGameState();
  }

  // ---- Win Check (5 in a row in any 4 directions) ---------------------------
  var DIRS = [
    [0, 1],   // horizontal
    [1, 0],   // vertical
    [1, 1],   // diagonal \
    [1, -1]   // anti-diagonal /
  ];

  function checkWin(r, c, player) {
    for (var d = 0; d < DIRS.length; d++) {
      var dr = DIRS[d][0];
      var dc = DIRS[d][1];
      var stones = [{ r: r, c: c }];

      // Forward direction
      var step = 1;
      while (true) {
        var nr = r + dr * step;
        var nc = c + dc * step;
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === player) {
          stones.push({ r: nr, c: nc });
          step++;
        } else {
          break;
        }
      }

      // Backward direction
      step = 1;
      while (true) {
        var br = r - dr * step;
        var bc = c - dc * step;
        if (br >= 0 && br < BOARD_SIZE && bc >= 0 && bc < BOARD_SIZE && board[br][nc = bc] === player) {
          stones.unshift({ r: br, c: bc });
          step++;
        } else {
          break;
        }
      }

      if (stones.length >= 5) {
        return stones;
      }
    }
    return null;
  }

  function triggerGameOver(winner) {
    if (winner === BLACK) {
      modalEmoji.textContent = '🏆';
      modalTitle.textContent = opponentMode === 'ai' ? '恭喜！你战胜了电脑！' : '黑方胜利！';
      modalDesc.textContent = '率先形成五子连珠，精彩绝伦！';
    } else {
      modalEmoji.textContent = opponentMode === 'ai' ? '🤖' : '⚪';
      modalTitle.textContent = opponentMode === 'ai' ? '电脑获胜！' : '白方胜利！';
      modalDesc.textContent = '白方率先连成五子，再接再厉！';
    }
    modal.classList.remove('hidden');
  }

  function triggerDraw() {
    modalEmoji.textContent = '🤝';
    modalTitle.textContent = '棋逢对手 · 和局';
    modalDesc.textContent = '15×15 棋盘全满，不分胜负！';
    modal.classList.remove('hidden');
  }

  // ---- Smart Heuristic AI ---------------------------------------------------
  function aiPlayMove() {
    if (isGameOver) return;

    // First move of AI: play near center if open
    if (history.length === 1) {
      var p = history[0];
      var cand = [
        { r: p.r - 1, c: p.c - 1 },
        { r: p.r + 1, c: p.c + 1 },
        { r: p.r - 1, c: p.c + 1 },
        { r: p.r + 1, c: p.c - 1 },
        { r: 7, c: 7 }
      ];
      for (var k = 0; k < cand.length; k++) {
        var cr = cand[k].r, cc = cand[k].c;
        if (cr >= 0 && cr < BOARD_SIZE && cc >= 0 && cc < BOARD_SIZE && board[cr][cc] === EMPTY) {
          makeMove(cr, cc);
          return;
        }
      }
    }

    var bestScore = -Infinity;
    var bestMoves = [];

    // Evaluate all empty cells within 2 tiles of any placed stone
    for (var r = 0; r < BOARD_SIZE; r++) {
      for (var c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] !== EMPTY) continue;
        if (!hasNeighbor(r, c, 2)) continue;

        var myScore = evaluateCell(r, c, WHITE);
        var opponentScore = evaluateCell(r, c, BLACK);

        var score = 0;
        if (difficulty === 'easy') {
          score = myScore * 0.8 + opponentScore * 0.6 + Math.random() * 80;
        } else if (difficulty === 'norm') {
          score = myScore * 1.1 + opponentScore * 1.0 + Math.random() * 20;
        } else {
          // Hard / Master
          // Defend critical threats aggressively!
          if (opponentScore >= 10000) score = opponentScore * 2.5;
          else if (myScore >= 10000) score = myScore * 3.0;
          else score = myScore * 1.25 + opponentScore * 1.15;
          // Slight center preference
          var centerDist = Math.abs(r - 7) + Math.abs(c - 7);
          score += (14 - centerDist) * 3;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMoves = [{ r: r, c: c }];
        } else if (Math.abs(score - bestScore) < 5) {
          bestMoves.push({ r: r, c: c });
        }
      }
    }

    if (bestMoves.length > 0) {
      var chosen = bestMoves[Math.floor(Math.random() * bestMoves.length)];
      makeMove(chosen.r, chosen.c);
    } else {
      // Fallback
      makeMove(7, 7);
    }
  }

  function hasNeighbor(r, c, dist) {
    var minR = Math.max(0, r - dist);
    var maxR = Math.min(BOARD_SIZE - 1, r + dist);
    var minC = Math.max(0, c - dist);
    var maxC = Math.min(BOARD_SIZE - 1, c + dist);
    for (var row = minR; row <= maxR; row++) {
      for (var col = minC; col <= maxC; col++) {
        if (board[row][col] !== EMPTY) return true;
      }
    }
    return false;
  }

  function evaluateCell(r, c, player) {
    var opp = player === BLACK ? WHITE : BLACK;
    var totalScore = 0;

    for (var d = 0; d < DIRS.length; d++) {
      var dr = DIRS[d][0];
      var dc = DIRS[d][1];
      var count = 1; // including the hypothetical stone at (r,c)
      var openEnds = 0;

      // Forward
      var step = 1;
      while (true) {
        var nr = r + dr * step;
        var nc = c + dc * step;
        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
        if (board[nr][nc] === player) {
          count++;
          step++;
        } else if (board[nr][nc] === EMPTY) {
          openEnds++;
          break;
        } else {
          break; // blocked by opponent
        }
      }

      // Backward
      step = 1;
      while (true) {
        var br = r - dr * step;
        var bc = c - dc * step;
        if (br < 0 || br >= BOARD_SIZE || bc < 0 || bc >= BOARD_SIZE) break;
        if (board[br][bc] === player) {
          count++;
          step++;
        } else if (board[br][bc] === EMPTY) {
          openEnds++;
          break;
        } else {
          break; // blocked by opponent
        }
      }

      // Pattern scoring
      if (count >= 5) {
        totalScore += 100000; // Five in a row
      } else if (count === 4) {
        if (openEnds === 2) totalScore += 10000; // Live 4
        else if (openEnds === 1) totalScore += 2500; // Rush 4
      } else if (count === 3) {
        if (openEnds === 2) totalScore += 1200; // Live 3
        else if (openEnds === 1) totalScore += 180; // Rush 3
      } else if (count === 2) {
        if (openEnds === 2) totalScore += 120; // Live 2
        else if (openEnds === 1) totalScore += 20;
      }
    }

    return totalScore;
  }

  // ---- Canvas Rendering -----------------------------------------------------
  function render() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, boardPx, boardPx);

    // 1. Board Wood Texture & Borders
    var woodGrad = ctx.createRadialGradient(
      boardPx * 0.5, boardPx * 0.45, boardPx * 0.1,
      boardPx * 0.5, boardPx * 0.5, boardPx * 0.72
    );
    woodGrad.addColorStop(0, '#e5be85');
    woodGrad.addColorStop(0.7, '#d3a669');
    woodGrad.addColorStop(1, '#b88648');
    ctx.fillStyle = woodGrad;
    ctx.fillRect(0, 0, boardPx, boardPx);

    // Wood rim shadow
    ctx.strokeStyle = '#855627';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, boardPx - 3, boardPx - 3);

    // 2. Grid lines
    ctx.strokeStyle = '#5a3818';
    ctx.lineWidth = 1;

    var start = cellPx;
    var end = boardPx - cellPx;

    for (var i = 0; i < BOARD_SIZE; i++) {
      var pos = cellPx * (i + 1);
      // Horizontal
      ctx.beginPath();
      ctx.moveTo(start, pos);
      ctx.lineTo(end, pos);
      ctx.stroke();

      // Vertical
      ctx.beginPath();
      ctx.moveTo(pos, start);
      ctx.lineTo(pos, end);
      ctx.stroke();
    }

    // Outer thick boundary
    ctx.lineWidth = 2;
    ctx.strokeRect(start, start, end - start, end - start);

    // 3. Star points (天元 & 4 星位)
    var stars = [
      [3, 3], [3, 11],
      [7, 7],
      [11, 3], [11, 11]
    ];
    ctx.fillStyle = '#5a3818';
    for (var s = 0; s < stars.length; s++) {
      var sx = cellPx * (stars[s][1] + 1);
      var sy = cellPx * (stars[s][0] + 1);
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Placed Stones
    if (board && board.length) {
      var radius = cellPx * 0.42;
      for (var r = 0; r < BOARD_SIZE; r++) {
        if (!board[r]) continue;
        for (var c = 0; c < BOARD_SIZE; c++) {
          var stone = board[r][c];
          if (stone !== EMPTY) {
            drawStone(r, c, stone, radius);
          }
        }
      }
    }

    // 5. Last Move Indicator Ring
    if (history.length > 0) {
      var last = history[history.length - 1];
      var lx = cellPx * (last.c + 1);
      var ly = cellPx * (last.r + 1);
      ctx.strokeStyle = last.player === BLACK ? '#ef4444' : '#0284c7';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(lx, ly, radius * 0.38, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 6. Winning Laser Beam
    if (winningLine && winningLine.length >= 5) {
      ctx.save();
      ctx.strokeStyle = '#facc15';
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';

      var first = winningLine[0];
      var finalStone = winningLine[winningLine.length - 1];

      ctx.beginPath();
      ctx.moveTo(cellPx * (first.c + 1), cellPx * (first.r + 1));
      ctx.lineTo(cellPx * (finalStone.c + 1), cellPx * (finalStone.r + 1));
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawStone(r, c, stone, radius) {
    var cx = cellPx * (c + 1);
    var cy = cellPx * (r + 1);

    // Stone drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;

    // Radial gradient for 3D convex bead appearance
    var grad = ctx.createRadialGradient(
      cx - radius * 0.28, cy - radius * 0.32, radius * 0.1,
      cx, cy, radius
    );

    if (stone === BLACK) {
      grad.addColorStop(0, '#555e6c');
      grad.addColorStop(0.35, '#222831');
      grad.addColorStop(1, '#090d14');
    } else {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.4, '#f1f5f9');
      grad.addColorStop(0.85, '#cbd5e1');
      grad.addColorStop(1, '#94a3b8');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Subtle edge contour
    ctx.strokeStyle = stone === BLACK ? 'rgba(0,0,0,0.5)' : 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // ---- Pointer Input Handling -----------------------------------------------
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (isGameOver || isAiThinking) return;

    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;

    // Convert pixel coordinates to closest intersection
    var col = Math.round(x / cellPx) - 1;
    var row = Math.round(y / cellPx) - 1;

    makeMove(row, col);
  });

  // ---- Controls / Listeners -------------------------------------------------
  undoBtn.addEventListener('click', undoMove);
  restartBtn.addEventListener('click', initBoard);
  modalPlayAgain.addEventListener('click', initBoard);

  oppBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      oppBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      opponentMode = btn.dataset.opp;
      var diffGroup = document.getElementById('diffGroup');
      if (diffGroup) diffGroup.style.display = opponentMode === 'ai' ? 'flex' : 'none';
      initBoard();
    });
  });

  diffBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      diffBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      difficulty = btn.dataset.diff;
    });
  });

  // ---- Boot -----------------------------------------------------------------
  if (!restoreGameState()) {
    initBoard();
  }
  resizeBoard();
})();
