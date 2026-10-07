(function () {
  'use strict';

  var STORAGE_KEY = 'omg:save:samegame';

  var ROWS = 10;
  var COLS = 10;
  var NUM_COLORS = 5;

  // DOM elements
  var boardEl = document.getElementById('board');
  var hoverTip = document.getElementById('hoverTip');
  var levelText = document.getElementById('levelText');
  var targetText = document.getElementById('targetText');
  var scoreText = document.getElementById('scoreText');
  var soundBtn = document.getElementById('soundBtn');
  var undoBtn = document.getElementById('undoBtn');
  var restartBtn = document.getElementById('restartBtn');

  var modal = document.getElementById('sgModal');
  var modalEmoji = document.getElementById('modalEmoji');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalActionBtn = document.getElementById('modalActionBtn');

  // State
  var board = []; // 10x10 array of ints
  var level = 1;
  var score = 0;
  var currentCluster = [];
  var history = [];
  var isGameOver = false;
  var soundEnabled = true;

  // Web Audio Synth
  var audioCtx = null;
  function getAudioCtx() {
    if (!soundEnabled) return null;
    if (!audioCtx) {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type, count) {
    if (!soundEnabled) return;
    var ctx = getAudioCtx();
    if (!ctx) return;
    var t = ctx.currentTime;

    if (type === 'pop') {
      var freq = 300 + Math.min(count || 2, 20) * 35;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.08);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.09);
    } else if (type === 'slide') {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(260, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.1);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.11);
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + i * 0.1);
        gain.gain.setValueAtTime(0.3, t + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.1 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.1);
        osc.stop(t + i * 0.1 + 0.22);
      });
    } else if (type === 'lose') {
      [330, 293.66, 261.63, 220].forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t + i * 0.12);
        gain.gain.setValueAtTime(0.2, t + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.12 + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.12);
        osc.stop(t + i * 0.12 + 0.2);
      });
    }
  }

  function getTargetScore(lvl) {
    return Math.round((lvl * (lvl + 1) / 2) * 1000);
  }

  function cloneBoard(b) {
    return b.map(function (row) { return row.slice(); });
  }

  // Generate new random level board
  function createNewBoard() {
    var b = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) {
        row.push(Math.floor(Math.random() * NUM_COLORS) + 1);
      }
      b.push(row);
    }
    return b;
  }

  function initLevel(lvl) {
    level = lvl || 1;
    if (level === 1) score = 0;
    board = createNewBoard();
    currentCluster = [];
    history = [];
    isGameOver = false;

    updateUI();
    renderBoard();
    hideModal();
    saveState();
  }

  function updateUI() {
    levelText.textContent = level;
    targetText.textContent = getTargetScore(level).toLocaleString();
    scoreText.textContent = score.toLocaleString();
  }

  // BFS Cluster detection
  function getCluster(r, c) {
    var targetColor = board[r][c];
    if (targetColor === 0) return [];

    var cluster = [];
    var queue = [{ r: r, c: c }];
    var visited = {};
    visited[r + '-' + c] = true;

    var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    while (queue.length > 0) {
      var curr = queue.shift();
      cluster.push(curr);

      for (var i = 0; i < dirs.length; i++) {
        var nr = curr.r + dirs[i][0];
        var nc = curr.c + dirs[i][1];
        var key = nr + '-' + nc;

        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !visited[key]) {
          if (board[nr][nc] === targetColor) {
            visited[key] = true;
            queue.push({ r: nr, c: nc });
          }
        }
      }
    }

    return cluster.length >= 2 ? cluster : [];
  }

  // Check if any matching moves remain
  function hasRemainingMoves() {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var color = board[r][c];
        if (color !== 0) {
          if (r + 1 < ROWS && board[r + 1][c] === color) return true;
          if (c + 1 < COLS && board[r][c + 1] === color) return true;
        }
      }
    }
    return false;
  }

  // Apply gravity: collapse empty vertical spaces
  function applyGravity() {
    for (var c = 0; c < COLS; c++) {
      var writeRow = ROWS - 1;
      for (var r = ROWS - 1; r >= 0; r--) {
        if (board[r][c] !== 0) {
          board[writeRow][c] = board[r][c];
          if (writeRow !== r) {
            board[r][c] = 0;
          }
          writeRow--;
        }
      }
    }

    // Collapse empty columns to the left
    var writeCol = 0;
    for (var col = 0; col < COLS; col++) {
      // Check if col is empty
      var isEmpty = true;
      for (var row = 0; row < ROWS; row++) {
        if (board[row][col] !== 0) {
          isEmpty = false;
          break;
        }
      }

      if (!isEmpty) {
        if (writeCol !== col) {
          for (var r2 = 0; r2 < ROWS; r2++) {
            board[r2][writeCol] = board[r2][col];
            board[r2][col] = 0;
          }
        }
        writeCol++;
      }
    }
  }

  // Count remaining non-zero blocks
  function countRemainingBlocks() {
    var count = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (board[r][c] !== 0) count++;
      }
    }
    return count;
  }

  // Render board
  function renderBoard() {
    boardEl.innerHTML = '';
    var clusterMap = {};
    currentCluster.forEach(function (pt) {
      clusterMap[pt.r + '-' + pt.c] = true;
    });

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var cell = document.createElement('div');
        cell.className = 'sg-cell';
        cell.dataset.row = r;
        cell.dataset.col = c;

        var color = board[r][c];
        if (color === 0) {
          cell.classList.add('empty');
        } else {
          cell.classList.add('color-' + color);
          if (clusterMap[r + '-' + c]) {
            cell.classList.add('highlighted');
          }
        }

        boardEl.appendChild(cell);
      }
    }
  }

  // Highlight cluster on hover
  function highlightCluster(r, c) {
    if (isGameOver) return;
    currentCluster = getCluster(r, c);

    if (currentCluster.length >= 2) {
      var pts = currentCluster.length * currentCluster.length * 5;
      hoverTip.textContent = '选定 ' + currentCluster.length + ' 块 · 消除获得 ' + pts + ' 分';
      hoverTip.classList.add('show');
    } else {
      hoverTip.classList.remove('show');
    }

    renderBoard();
  }

  // Pop cluster on click
  function popCluster() {
    if (currentCluster.length < 2 || isGameOver) return;

    // Save history for undo
    history.push({
      board: cloneBoard(board),
      score: score
    });

    var count = currentCluster.length;
    var points = count * count * 5;
    score += points;

    // Remove cluster
    currentCluster.forEach(function (pt) {
      board[pt.r][pt.c] = 0;
    });

    playSound('pop', count);
    currentCluster = [];
    hoverTip.classList.remove('show');

    // Apply gravity
    applyGravity();
    playSound('slide');

    updateUI();
    renderBoard();
    saveState();

    // Check if stage ended
    if (!hasRemainingMoves()) {
      handleStageEnd();
    }
  }

  function handleStageEnd() {
    var remaining = countRemainingBlocks();
    var bonus = 0;
    if (remaining < 10) {
      bonus = Math.max(0, 2000 - remaining * remaining * 20);
    }
    score += bonus;
    updateUI();
    saveState();

    var target = getTargetScore(level);
    var passed = (score >= target);

    setTimeout(function () {
      if (passed) {
        playSound('win');
        modalEmoji.textContent = '⭐';
        modalTitle.textContent = '过关大捷！';
        modalDesc.textContent = '剩余 ' + remaining + ' 颗星星 · 清盘奖励 +' + bonus.toLocaleString() + ' 分\n当前总分: ' + score.toLocaleString() + ' (达标 ' + target.toLocaleString() + ')';
        modalActionBtn.textContent = '进入第 ' + (level + 1) + ' 关';
        modalActionBtn.onclick = function () {
          initLevel(level + 1);
        };
      } else {
        playSound('lose');
        modalEmoji.textContent = '💔';
        modalTitle.textContent = '挑战未达标！';
        modalDesc.textContent = '最终得分: ' + score.toLocaleString() + ' · 距本关目标还差 ' + (target - score).toLocaleString() + ' 分';
        modalActionBtn.textContent = '重新开始';
        modalActionBtn.onclick = function () {
          initLevel(1);
        };
      }
      modal.classList.add('show');
    }, 400);
  }

  function hideModal() {
    modal.classList.remove('show');
  }

  function undoMove() {
    if (history.length === 0 || isGameOver) return;
    var last = history.pop();
    board = last.board;
    score = last.score;
    currentCluster = [];
    hoverTip.classList.remove('show');
    updateUI();
    renderBoard();
    saveState();
  }

  function saveState() {
    try {
      var state = {
        board: board,
        level: level,
        score: score,
        isGameOver: isGameOver
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function loadState() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        var state = JSON.parse(saved);
        if (state && Array.isArray(state.board) && state.board.length === ROWS) {
          board = state.board;
          level = state.level || 1;
          score = state.score || 0;
          isGameOver = !!state.isGameOver;
          updateUI();
          renderBoard();
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // Event Listeners
  boardEl.addEventListener('mousemove', function (e) {
    var cell = e.target.closest('.sg-cell');
    if (!cell) {
      if (currentCluster.length > 0) {
        currentCluster = [];
        hoverTip.classList.remove('show');
        renderBoard();
      }
      return;
    }
    var r = parseInt(cell.dataset.row, 10);
    var c = parseInt(cell.dataset.col, 10);
    highlightCluster(r, c);
  });

  boardEl.addEventListener('mouseleave', function () {
    currentCluster = [];
    hoverTip.classList.remove('show');
    renderBoard();
  });

  boardEl.addEventListener('click', function (e) {
    var cell = e.target.closest('.sg-cell');
    if (!cell) return;
    var r = parseInt(cell.dataset.row, 10);
    var c = parseInt(cell.dataset.col, 10);

    // If tapping an unhighlighted cluster, highlight it first (mobile-friendly)
    var inCurrent = currentCluster.some(function (pt) { return pt.r === r && pt.c === c; });
    if (!inCurrent) {
      highlightCluster(r, c);
    } else {
      popCluster();
    }
  });

  undoBtn.addEventListener('click', undoMove);
  restartBtn.addEventListener('click', function () {
    initLevel(1);
  });

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  // Init
  if (!loadState()) {
    initLevel(1);
  }
})();
