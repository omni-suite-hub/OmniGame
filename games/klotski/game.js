/*
 * games/klotski/game.js
 * 数字华容道 (Number Klotski / 15-Puzzle)
 *
 * Smooth sliding puzzle with multi-tile row/col push, guaranteed solvable shuffle,
 * customizable 3x3 / 4x4 / 5x5 grid sizes, and Web Audio feedback.
 */
(function () {
  'use strict';

  var boardEl = document.getElementById('puzzleBoard');
  var stepsVal = document.getElementById('stepsVal');
  var timerVal = document.getElementById('timerVal');
  var soundBtn = document.getElementById('soundBtn');
  var shuffleBtn = document.getElementById('shuffleBtn');
  var modal = document.getElementById('modalOverlay');
  var finalStepsEl = document.getElementById('finalSteps');
  var finalTimeEl = document.getElementById('finalTime');
  var playAgainBtn = document.getElementById('playAgainBtn');
  var modeBtns = document.querySelectorAll('.mode-btn');

  var currentSize = 4;
  var board = []; // length = size * size, 0 represents blank space
  var steps = 0;
  var timerInterval = null;
  var elapsedSec = 0;
  var isPlaying = false;
  var isWon = false;

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

    if (type === 'slide') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.06);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        var o = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f, now + i * 0.08);
        g.gain.setValueAtTime(0.2, now + i * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.35);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(now + i * 0.08);
        o.stop(now + i * 0.08 + 0.35);
      });
    }
  }

  try {
    var storedSound = localStorage.getItem('omg:klotski:sound');
    if (storedSound !== null) soundEnabled = storedSound === '1';
  } catch (e) {}
  soundBtn.textContent = soundEnabled ? '🔊' : '🔇';

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
    try {
      localStorage.setItem('omg:klotski:sound', soundEnabled ? '1' : '0');
    } catch (e) {}
  });

  // ---- Timer & High Score ---------------------------------------------------
  function formatTime(s) {
    var m = Math.floor(s / 60);
    var sec = s % 60;
    return (m < 10 ? '0' + m : m) + ':' + (sec < 10 ? '0' + sec : sec);
  }

  function startTimer() {
    if (timerInterval) return;
    isPlaying = true;
    timerInterval = setInterval(function () {
      elapsedSec++;
      timerVal.textContent = formatTime(elapsedSec);
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    isPlaying = false;
  }

  function saveRecord(timeSec) {
    if (window.GameStore && typeof window.GameStore.saveBestTime === 'function') {
      window.GameStore.saveBestTime('klotski', timeSec * 1000);
    }
  }

  var SAVE_KEY = 'omg:save:klotski';

  function saveKlotskiState() {
    if (isWon) {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      return;
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        board: board,
        currentSize: currentSize,
        steps: steps,
        elapsedSec: elapsedSec
      }));
    } catch (e) {}
  }

  function restoreKlotskiState() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (data && Array.isArray(data.board) && data.currentSize) {
        currentSize = data.currentSize;
        board = data.board;
        steps = data.steps || 0;
        elapsedSec = data.elapsedSec || 0;
        stepsVal.textContent = steps;
        timerVal.textContent = formatTime(elapsedSec);
        modeBtns.forEach(function (b) {
          b.classList.toggle('active', parseInt(b.dataset.size, 10) === currentSize);
        });
        renderBoard();
        return true;
      }
    } catch (e) {}
    return false;
  }

  // ---- Game Board & Solvable Shuffle ----------------------------------------
  function initGame(size) {
    currentSize = size || currentSize;
    stopTimer();
    elapsedSec = 0;
    steps = 0;
    isWon = false;
    stepsVal.textContent = '0';
    timerVal.textContent = '00:00';
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    modal.classList.add('hidden');

    var total = currentSize * currentSize;
    board = [];
    for (var i = 1; i < total; i++) {
      board.push(i);
    }
    board.push(0); // 0 = blank space

    // Perform random valid moves from solved state to guarantee solvability
    var blankPos = total - 1;
    var lastMovedPos = -1;
    var shuffleMoves = currentSize * currentSize * 15;

    for (var m = 0; m < shuffleMoves; m++) {
      var bRow = Math.floor(blankPos / currentSize);
      var bCol = blankPos % currentSize;
      var neighbors = [];

      if (bRow > 0) neighbors.push(blankPos - currentSize);
      if (bRow < currentSize - 1) neighbors.push(blankPos + currentSize);
      if (bCol > 0) neighbors.push(blankPos - 1);
      if (bCol < currentSize - 1) neighbors.push(blankPos + 1);

      // Avoid immediately undoing last move
      var filtered = neighbors.filter(function (p) { return p !== lastMovedPos; });
      if (filtered.length === 0) filtered = neighbors;

      var chosenPos = filtered[Math.floor(Math.random() * filtered.length)];
      board[blankPos] = board[chosenPos];
      board[chosenPos] = 0;
      lastMovedPos = blankPos;
      blankPos = chosenPos;
    }

    renderBoard();
  }

  // ---- Sliding Mechanics ----------------------------------------------------
  function tryMoveTile(index) {
    if (isWon) return;
    if (board[index] === 0) return;

    var blankIdx = board.indexOf(0);
    var tRow = Math.floor(index / currentSize);
    var tCol = index % currentSize;
    var bRow = Math.floor(blankIdx / currentSize);
    var bCol = blankIdx % currentSize;

    // Check if in same row or column
    var moved = false;
    if (tRow === bRow) {
      // Same row: slide horizontally
      var dir = tCol < bCol ? 1 : -1;
      for (var c = bCol; c !== tCol; c -= dir) {
        var fromIdx = tRow * currentSize + (c - dir);
        var toIdx = tRow * currentSize + c;
        board[toIdx] = board[fromIdx];
      }
      board[index] = 0;
      moved = true;
    } else if (tCol === bCol) {
      // Same column: slide vertically
      var vdir = tRow < bRow ? 1 : -1;
      for (var r = bRow; r !== tRow; r -= vdir) {
        var fromI = (r - vdir) * currentSize + tCol;
        var toI = r * currentSize + tCol;
        board[toI] = board[fromI];
      }
      board[index] = 0;
      moved = true;
    }

    if (moved) {
      if (!isPlaying) startTimer();
      steps++;
      stepsVal.textContent = steps;
      playSound('slide');
      renderBoard();
      saveKlotskiState();
      checkWin();
    }
  }

  function moveByDirection(dir) {
    var blankIdx = board.indexOf(0);
    var bRow = Math.floor(blankIdx / currentSize);
    var bCol = blankIdx % currentSize;
    var targetIdx = -1;

    // Arrow keys move the tile adjacent to blank
    if (dir === 'up' && bRow < currentSize - 1) targetIdx = blankIdx + currentSize;
    else if (dir === 'down' && bRow > 0) targetIdx = blankIdx - currentSize;
    else if (dir === 'left' && bCol < currentSize - 1) targetIdx = blankIdx + 1;
    else if (dir === 'right' && bCol > 0) targetIdx = blankIdx - 1;

    if (targetIdx !== -1) {
      tryMoveTile(targetIdx);
    }
  }

  function checkWin() {
    var total = currentSize * currentSize;
    for (var i = 0; i < total - 1; i++) {
      if (board[i] !== i + 1) return;
    }
    if (board[total - 1] !== 0) return;

    // WON!
    isWon = true;
    stopTimer();
    playSound('win');
    saveRecord(elapsedSec);
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}

    finalStepsEl.textContent = steps;
    finalTimeEl.textContent = formatTime(elapsedSec);
    modal.classList.remove('hidden');
  }

  // ---- DOM Rendering --------------------------------------------------------
  function renderBoard() {
    boardEl.innerHTML = '';
    var total = currentSize * currentSize;
    var pad = 6;
    var boardW = boardEl.clientWidth || 320;
    var cellSize = (boardW - pad * (currentSize + 1)) / currentSize;
    var fontSize = Math.round(cellSize * 0.44);

    for (var i = 0; i < total; i++) {
      var val = board[i];
      if (val === 0) continue; // blank space

      var row = Math.floor(i / currentSize);
      var col = i % currentSize;
      var left = pad + col * (cellSize + pad);
      var top = pad + row * (cellSize + pad);

      var tile = document.createElement('div');
      tile.className = 'puzzle-tile' + (val === i + 1 ? ' correct' : '');
      tile.textContent = val;
      tile.style.width = cellSize + 'px';
      tile.style.height = cellSize + 'px';
      tile.style.left = left + 'px';
      tile.style.top = top + 'px';
      tile.style.fontSize = fontSize + 'px';

      (function (idx) {
        tile.addEventListener('click', function () {
          tryMoveTile(idx);
        });
      })(i);

      boardEl.appendChild(tile);
    }
  }

  // ---- Controls / Listeners -------------------------------------------------
  modeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      modeBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var sz = parseInt(btn.dataset.size, 10);
      initGame(sz);
    });
  });

  window.addEventListener('keydown', function (e) {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); moveByDirection('up'); }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); moveByDirection('down'); }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); moveByDirection('left'); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); moveByDirection('right'); }
  });

  shuffleBtn.addEventListener('click', function () { initGame(currentSize); });
  playAgainBtn.addEventListener('click', function () { initGame(currentSize); });
  window.addEventListener('resize', renderBoard);

  // ---- Bootstrap ------------------------------------------------------------
  if (!restoreKlotskiState()) {
    initGame(4);
  }
})();
