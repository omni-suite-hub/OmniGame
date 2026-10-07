(function () {
  'use strict';

  var scoreEl = document.getElementById('score-el');
  var bestEl = document.getElementById('best-el');
  var nextTileEl = document.getElementById('next-tile');
  var boardEl = document.getElementById('board');
  var gameOverModal = document.getElementById('game-over-modal');
  var finalScoreEl = document.getElementById('final-score');
  var btnRestart = document.getElementById('btn-restart');

  var audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playSound(type) {
    try {
      var actx = getAudioCtx();
      var now = actx.currentTime;
      var osc = actx.createOscillator();
      var gain = actx.createGain();
      osc.connect(gain);
      gain.connect(actx.destination);

      if (type === 'drop') {
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'merge') {
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.exponentialRampToValueAtTime(1046, now + 0.12);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'win') {
        [523, 659, 784, 1046, 1318].forEach(function (f, i) {
          var o = actx.createOscillator();
          var gn = actx.createGain();
          o.frequency.setValueAtTime(f, now + i * 0.1);
          gn.gain.setValueAtTime(0.18, now + i * 0.1);
          gn.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);
          o.connect(gn);
          gn.connect(actx.destination);
          o.start(now + i * 0.1);
          o.stop(now + i * 0.1 + 0.35);
        });
      }
    } catch (e) {}
  }

  var COLS = 5;
  var ROWS = 7;
  var grid = [];
  var currentNextVal = 2;
  var score = 0;
  var bestScore = 0;
  var isOver = false;

  function initGrid() {
    grid = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) {
        row.push(0);
      }
      grid.push(row);
    }
  }

  function getTileClass(val) {
    if (val === 0) return '';
    if (val <= 2048) return 'b-' + val;
    return 'b-super';
  }

  function pickNextVal() {
    var pool = [2, 2, 4, 4, 8];
    if (score > 1000) pool.push(16);
    if (score > 3000) pool.push(32);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function updateNextPreview() {
    nextTileEl.textContent = currentNextVal;
    nextTileEl.className = 'block-cell ' + getTileClass(currentNextVal);
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var cell = document.createElement('div');
        cell.className = 'block-cell';
        var val = grid[r][c];

        if (val > 0) {
          cell.textContent = val;
          cell.className += ' ' + getTileClass(val);
        } else {
          cell.style.background = '#1e293b';
        }

        cell.addEventListener('click', (function (colIdx) {
          return function () {
            dropColumn(colIdx);
          };
        })(c));

        boardEl.appendChild(cell);
      }
    }
  }

  function dropColumn(col) {
    if (isOver) return;
    getAudioCtx();

    // Find lowest empty row in col
    var targetRow = -1;
    for (var r = ROWS - 1; r >= 0; r--) {
      if (grid[r][col] === 0) {
        targetRow = r;
        break;
      }
    }

    if (targetRow === -1) {
      // Column is full
      return;
    }

    grid[targetRow][col] = currentNextVal;
    playSound('drop');

    // Trigger cascading merges
    var merged = true;
    while (merged) {
      merged = checkAndMerge();
    }

    scoreEl.textContent = score;
    if (score > bestScore) {
      bestScore = score;
      bestEl.textContent = bestScore;
    }

    // Check game over
    var fullCols = 0;
    for (var c = 0; c < COLS; c++) {
      if (grid[0][c] !== 0) fullCols++;
    }
    if (fullCols === COLS) {
      isOver = true;
      finalScoreEl.textContent = '最终得分: ' + score;
      gameOverModal.classList.remove('hidden');
    }

    currentNextVal = pickNextVal();
    updateNextPreview();
    renderBoard();
  }

  function checkAndMerge() {
    var didMerge = false;

    for (var r = ROWS - 1; r >= 0; r--) {
      for (var c = 0; c < COLS; c++) {
        var val = grid[r][c];
        if (val === 0) continue;

        // Check down
        if (r + 1 < ROWS && grid[r + 1][c] === val) {
          grid[r + 1][c] = val * 2;
          grid[r][c] = 0;
          score += val * 2;
          playSound('merge');
          didMerge = true;
          applyGravity();
          return true;
        }

        // Check left
        if (c - 1 >= 0 && grid[r][c - 1] === val) {
          grid[r][c - 1] = val * 2;
          grid[r][c] = 0;
          score += val * 2;
          playSound('merge');
          didMerge = true;
          applyGravity();
          return true;
        }

        // Check right
        if (c + 1 < COLS && grid[r][c + 1] === val) {
          grid[r][c + 1] = val * 2;
          grid[r][c] = 0;
          score += val * 2;
          playSound('merge');
          didMerge = true;
          applyGravity();
          return true;
        }
      }
    }

    return didMerge;
  }

  function applyGravity() {
    for (var c = 0; c < COLS; c++) {
      for (var r = ROWS - 2; r >= 0; r--) {
        if (grid[r][c] !== 0) {
          var curR = r;
          while (curR + 1 < ROWS && grid[curR + 1][c] === 0) {
            grid[curR + 1][c] = grid[curR][c];
            grid[curR][c] = 0;
            curR++;
          }
        }
      }
    }
  }

  function resetGame() {
    initGrid();
    score = 0;
    isOver = false;
    currentNextVal = 2;
    gameOverModal.classList.add('hidden');
    scoreEl.textContent = 0;
    updateNextPreview();
    renderBoard();
  }

  btnRestart.addEventListener('click', resetGame);

  resetGame();
})();
