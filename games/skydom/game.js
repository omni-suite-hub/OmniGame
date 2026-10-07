// Skydom (天空之城) - OmniGame Celestial Match-3 Engine
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

  function playChimeSound(combo) {
    var base = 587.33 + (combo || 0) * 110;
    playTone(base, 0.09, 'triangle', 0.16);
  }
  function playIceShatterSound() {
    playTone(880, 0.1, 'sawtooth', 0.18);
    setTimeout(function () { playTone(1400, 0.12, 'sine', 0.2); }, 40);
  }
  function playSwapSound() { playTone(400, 0.05, 'sine', 0.1); }
  function playWinSound() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { playTone(f, 0.25, 'triangle', 0.2); }, i * 110);
    });
  }

  var RUNES = ['☀️', '🌙', '⭐', '☁️', '⚡'];
  var ROWS = 8;
  var COLS = 8;

  var board = []; // 8x8 runes
  var iceGrid = []; // 8x8 booleans
  var selected = null;
  var isAnimating = false;
  var score = 0;
  var movesLeft = 22;
  var isGameOver = false;

  var boardEl = document.getElementById('board');
  var movesTextEl = document.getElementById('movesText');
  var iceTargetTextEl = document.getElementById('iceTargetText');
  var scoreTextEl = document.getElementById('scoreText');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalTitleEl = document.getElementById('modalTitle');
  var modalDescEl = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  function getRandomRune() {
    return RUNES[Math.floor(Math.random() * RUNES.length)];
  }

  function initGame() {
    score = 0;
    movesLeft = 22;
    selected = null;
    isAnimating = false;
    isGameOver = false;

    modalEl.classList.remove('active');

    // Create board and ice layout (10 ice blocks around center and edges)
    board = [];
    iceGrid = [];

    for (var r = 0; r < ROWS; r++) {
      board[r] = [];
      iceGrid[r] = [];
      for (var c = 0; c < COLS; c++) {
        var rune = getRandomRune();
        while ((c >= 2 && board[r][c - 1] === rune && board[r][c - 2] === rune) ||
               (r >= 2 && board[r - 1][c] === rune && board[r - 2][c] === rune)) {
          rune = getRandomRune();
        }
        board[r][c] = rune;
        // Ice placement
        if ((r >= 2 && r <= 5 && c >= 2 && c <= 5) && (r + c) % 2 === 0) {
          iceGrid[r][c] = true;
        } else {
          iceGrid[r][c] = false;
        }
      }
    }

    updateUI();
    renderBoard();
  }

  function countRemainingIce() {
    var count = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (iceGrid[r][c]) count++;
      }
    }
    return count;
  }

  function updateUI() {
    movesTextEl.textContent = movesLeft;
    iceTargetTextEl.textContent = countRemainingIce();
    scoreTextEl.textContent = score;
  }

  function findMatches() {
    var matches = [];
    // Horizontal
    for (var r = 0; r < ROWS; r++) {
      var matchLen = 1;
      for (var c = 0; c < COLS; c++) {
        var isMatch = false;
        if (c < COLS - 1 && board[r][c] && board[r][c] === board[r][c + 1]) {
          isMatch = true;
        }
        if (isMatch) {
          matchLen++;
        } else {
          if (matchLen >= 3) {
            for (var k = 0; k < matchLen; k++) {
              matches.push({ r: r, c: c - k });
            }
          }
          matchLen = 1;
        }
      }
    }

    // Vertical
    for (var col = 0; col < COLS; col++) {
      var vMatchLen = 1;
      for (var row = 0; row < ROWS; row++) {
        var vIsMatch = false;
        if (row < ROWS - 1 && board[row][col] && board[row][col] === board[row + 1][col]) {
          vIsMatch = true;
        }
        if (vIsMatch) {
          vMatchLen++;
        } else {
          if (vMatchLen >= 3) {
            for (var m = 0; m < vMatchLen; m++) {
              matches.push({ r: row - m, c: col });
            }
          }
          vMatchLen = 1;
        }
      }
    }

    var unique = [];
    var seen = {};
    matches.forEach(function (m) {
      var key = m.r + '_' + m.c;
      if (!seen[key]) {
        seen[key] = true;
        unique.push(m);
      }
    });
    return unique;
  }

  function handleCellClick(r, c) {
    if (isAnimating || isGameOver) return;
    initAudio();

    if (!selected) {
      selected = { r: r, c: c };
      playSwapSound();
      renderBoard();
      return;
    }

    if (selected.r === r && selected.c === c) {
      selected = null;
      renderBoard();
      return;
    }

    var dr = Math.abs(selected.r - r);
    var dc = Math.abs(selected.c - c);

    if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
      var r1 = selected.r;
      var c1 = selected.c;
      selected = null;
      trySwap(r1, c1, r, c);
    } else {
      selected = { r: r, c: c };
      playSwapSound();
      renderBoard();
    }
  }

  function trySwap(r1, c1, r2, c2) {
    isAnimating = true;
    var temp = board[r1][c1];
    board[r1][c1] = board[r2][c2];
    board[r2][c2] = temp;
    renderBoard();

    var matches = findMatches();
    if (matches.length > 0) {
      movesLeft--;
      updateUI();
      processMatches(matches, 1);
    } else {
      playTone(180, 0.12, 'sawtooth', 0.12);
      setTimeout(function () {
        var t2 = board[r1][c1];
        board[r1][c1] = board[r2][c2];
        board[r2][c2] = t2;
        isAnimating = false;
        renderBoard();
      }, 250);
    }
  }

  function processMatches(matches, combo) {
    playChimeSound(combo);
    score += matches.length * 35 * combo;

    // Check Ice Shattering
    var shatteredIce = false;
    matches.forEach(function (m) {
      if (iceGrid[m.r][m.c]) {
        iceGrid[m.r][m.c] = false;
        shatteredIce = true;
        score += 80;
      }
    });

    if (shatteredIce) playIceShatterSound();
    updateUI();

    matches.forEach(function (m) {
      board[m.r][m.c] = null;
    });
    renderBoard();

    setTimeout(function () {
      applyGravity();
      renderBoard();

      setTimeout(function () {
        var nextMatches = findMatches();
        if (nextMatches.length > 0) {
          processMatches(nextMatches, combo + 1);
        } else {
          isAnimating = false;
          checkGameStatus();
        }
      }, 220);
    }, 220);
  }

  function applyGravity() {
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
      while (writeR >= 0) {
        board[writeR][c] = getRandomRune();
        writeR--;
      }
    }
  }

  function checkGameStatus() {
    var remainIce = countRemainingIce();
    if (remainIce === 0) {
      isGameOver = true;
      playWinSound();
      modalTitleEl.textContent = '🏰 天空之城破封！';
      modalDescEl.textContent = '所有冰封符文全部碎裂，得分 ' + score + '！';
      modalEl.classList.add('active');
    } else if (movesLeft <= 0) {
      isGameOver = true;
      playTone(200, 0.4, 'sawtooth', 0.2);
      modalTitleEl.textContent = '步数用尽！';
      modalDescEl.textContent = '仍残留 ' + remainIce + ' 块冰封，最终得分 ' + score + '。';
      modalEl.classList.add('active');
    }
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var cell = document.createElement('div');
        cell.className = 'sky-cell';
        if (iceGrid[r][c]) cell.classList.add('has-ice');
        if (selected && selected.r === r && selected.c === c) {
          cell.classList.add('selected');
        }

        var val = board[r][c];
        if (val) {
          cell.textContent = val;
        } else {
          cell.classList.add('matched');
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
