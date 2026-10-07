// Super Collapse (塌方消除) - OmniGame Engine
(function () {
  'use strict';

  var audioCtx = null;
  var soundEnabled = true;

  function initAudio() {
    if (!audioCtx) {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playTone(freq, dur, type, gain) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;
    try {
      var osc = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      g.gain.setValueAtTime(gain || 0.12, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (e) {}
  }

  function playCrumbleSound(size) {
    var base = 320 + Math.min(size * 25, 400);
    playTone(base, 0.08, 'triangle', 0.15);
  }
  function playBombSound() {
    playTone(150, 0.25, 'sawtooth', 0.25);
    setTimeout(function () { playTone(80, 0.35, 'square', 0.3); }, 70);
  }
  function playRiseSound() { playTone(240, 0.06, 'sine', 0.08); }
  function playGameOverSound() {
    playTone(180, 0.4, 'sawtooth', 0.3);
  }

  var ROWS = 12;
  var COLS = 10;
  var COLORS = ['c-red', 'c-blue', 'c-green', 'c-yellow', 'c-purple'];

  var board = []; // 12x10, null or string color
  var score = 0;
  var blocksCleared = 0;
  var isGameOver = false;

  var riseInterval = 5000; // ms
  var riseElapsed = 0;
  var lastTickTime = 0;
  var animFrameId = null;

  var boardEl = document.getElementById('board');
  var scoreTextEl = document.getElementById('scoreText');
  var blocksTextEl = document.getElementById('blocksText');
  var timerTextEl = document.getElementById('timerText');
  var riseBarEl = document.getElementById('riseBar');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalDescEl = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  function getRandomBlock() {
    if (Math.random() < 0.03) return 'c-bomb';
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  function initGame() {
    score = 0;
    blocksCleared = 0;
    isGameOver = false;
    riseInterval = 5000;
    riseElapsed = 0;
    lastTickTime = performance.now();

    modalEl.classList.remove('active');
    updateStatsUI();

    // Fill bottom 4 rows initially
    board = [];
    for (var r = 0; r < ROWS; r++) {
      board[r] = [];
      for (var c = 0; c < COLS; c++) {
        if (r >= ROWS - 5) {
          board[r][c] = getRandomBlock();
        } else {
          board[r][c] = null;
        }
      }
    }

    renderBoard();

    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(gameLoop);
  }

  function updateStatsUI() {
    scoreTextEl.textContent = score;
    blocksTextEl.textContent = blocksCleared;
    var remainSec = Math.max(0, ((riseInterval - riseElapsed) / 1000)).toFixed(1);
    timerTextEl.textContent = remainSec + 's';
    riseBarEl.style.width = Math.min(100, (riseElapsed / riseInterval) * 100) + '%';
  }

  function getConnectedGroup(startR, startC) {
    var target = board[startR][startC];
    if (!target) return [];

    // Special bomb clears 3x3
    if (target === 'c-bomb') {
      var bombGroup = [];
      for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
          var nr = startR + dr;
          var nc = startC + dc;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc]) {
            bombGroup.push({ r: nr, c: nc });
          }
        }
      }
      return bombGroup;
    }

    var group = [];
    var visited = {};
    var queue = [{ r: startR, c: startC }];
    visited[startR + '_' + startC] = true;

    while (queue.length > 0) {
      var curr = queue.shift();
      group.push(curr);

      var neighbors = [
        { r: curr.r - 1, c: curr.c },
        { r: curr.r + 1, c: curr.c },
        { r: curr.r, c: curr.c - 1 },
        { r: curr.r, c: curr.c + 1 }
      ];

      for (var i = 0; i < neighbors.length; i++) {
        var n = neighbors[i];
        var key = n.r + '_' + n.c;
        if (n.r >= 0 && n.r < ROWS && n.c >= 0 && n.c < COLS && !visited[key]) {
          if (board[n.r][n.c] === target) {
            visited[key] = true;
            queue.push(n);
          }
        }
      }
    }

    return group;
  }

  function handleCellClick(r, c) {
    if (isGameOver) return;
    initAudio();

    if (!board[r][c]) return;

    var group = getConnectedGroup(r, c);
    var isBomb = board[r][c] === 'c-bomb';

    // Must be at least 3 connected, or a bomb!
    if (group.length >= 3 || isBomb) {
      if (isBomb) playBombSound();
      else playCrumbleSound(group.length);

      group.forEach(function (g) {
        board[g.r][g.c] = null;
      });

      blocksCleared += group.length;
      score += group.length * (group.length >= 5 ? 25 : 15);
      updateStatsUI();

      applyCollapsePhysics();
      renderBoard();
    } else {
      playTone(180, 0.08, 'sawtooth', 0.08);
    }
  }

  function applyCollapsePhysics() {
    // 1. Gravity (blocks fall down in each column)
    for (var c = 0; c < COLS; c++) {
      var writeR = ROWS - 1;
      for (var r = ROWS - 1; r >= 0; r--) {
        if (board[r][c] !== null) {
          board[writeR][c] = board[r][c];
          if (writeR !== r) {
            board[r][c] = null;
          }
          writeR--;
        }
      }
    }

    // 2. Inward Column Shifting (empty columns slide towards center)
    var activeCols = [];
    for (var col = 0; col < COLS; col++) {
      var hasBlock = false;
      for (var row = 0; row < ROWS; row++) {
        if (board[row][col] !== null) { hasBlock = true; break; }
      }
      if (hasBlock) {
        var colData = [];
        for (var row2 = 0; row2 < ROWS; row2++) {
          colData.push(board[row2][col]);
        }
        activeCols.push(colData);
      }
    }

    // Rewrite board with shifted columns aligned left
    for (var cc = 0; cc < COLS; cc++) {
      for (var rr = 0; rr < ROWS; rr++) {
        if (cc < activeCols.length) {
          board[rr][cc] = activeCols[cc][rr];
        } else {
          board[rr][cc] = null;
        }
      }
    }
  }

  function pushNewRow() {
    // Check if any block exists on top row 0 -> ceiling breach game over!
    for (var c = 0; c < COLS; c++) {
      if (board[0][c] !== null) {
        gameOver();
        return;
      }
    }

    playRiseSound();

    // Shift all rows up by 1
    for (var r = 0; r < ROWS - 1; r++) {
      for (var col = 0; col < COLS; col++) {
        board[r][col] = board[r + 1][col];
      }
    }

    // Insert new random row at bottom row 11
    for (var c2 = 0; c2 < COLS; c2++) {
      board[ROWS - 1][c2] = getRandomBlock();
    }

    // Check ceiling breach again
    for (var chk = 0; chk < COLS; chk++) {
      if (board[0][chk] !== null) {
        gameOver();
        return;
      }
    }

    renderBoard();
  }

  function gameOver() {
    isGameOver = true;
    playGameOverSound();
    modalDescEl.textContent = '总消除 ' + blocksCleared + ' 块方块，斩获 ' + score + ' 分！';
    modalEl.classList.add('active');
  }

  function gameLoop(now) {
    if (!isGameOver) {
      var delta = now - lastTickTime;
      lastTickTime = now;
      riseElapsed += delta;

      // Accelerate rise speed based on score
      riseInterval = Math.max(2200, 5000 - Math.floor(score / 500) * 350);

      if (riseElapsed >= riseInterval) {
        riseElapsed = 0;
        pushNewRow();
      }

      updateStatsUI();
    }

    animFrameId = requestAnimationFrame(gameLoop);
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var cell = document.createElement('div');
        var val = board[r][c];

        if (val) {
          cell.className = 'c-block ' + val;
          if (val === 'c-bomb') cell.textContent = '💣';
        } else {
          cell.className = 'c-block c-empty';
        }

        (function (row, col) {
          cell.addEventListener('click', function () {
            handleCellClick(row, col);
          });
        })(r, c);

        boardEl.appendChild(cell);
      }
    }
  }

  restartBtn.addEventListener('click', initGame);
  modalRestartBtn.addEventListener('click', initGame);
  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  initGame();
})();
