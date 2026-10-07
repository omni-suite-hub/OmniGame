// Happy Match (开心消消乐) - OmniGame Match-3 Engine
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

  function playPopSound(combo) {
    var base = 440 + (combo || 0) * 80;
    playTone(base, 0.08, 'triangle', 0.15);
  }
  function playSwapSound() { playTone(350, 0.05, 'sine', 0.1); }
  function playInvalidSound() { playTone(180, 0.12, 'sawtooth', 0.12); }
  function playWinSound() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { playTone(f, 0.25, 'triangle', 0.2); }, i * 110);
    });
  }

  var ANIMALS = ['🦊', '🐸', '🐻', '🐥', '🦉', '🦛'];
  var ROWS = 8;
  var COLS = 8;

  var board = [];
  var selected = null;
  var isAnimating = false;
  var score = 0;
  var movesLeft = 25;
  var targetScore = 2000;
  var isGameOver = false;

  var boardEl = document.getElementById('board');
  var movesTextEl = document.getElementById('movesText');
  var targetScoreTextEl = document.getElementById('targetScoreText');
  var scoreTextEl = document.getElementById('scoreText');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalTitleEl = document.getElementById('modalTitle');
  var modalDescEl = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  function getRandomAnimal() {
    return ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  }

  function initGame() {
    score = 0;
    movesLeft = 25;
    targetScore = 2000;
    selected = null;
    isAnimating = false;
    isGameOver = false;

    modalEl.classList.remove('active');
    updateUI();

    // Generate initial board with NO starting matches
    board = [];
    for (var r = 0; r < ROWS; r++) {
      board[r] = [];
      for (var c = 0; c < COLS; c++) {
        var animal = getRandomAnimal();
        while ((c >= 2 && board[r][c - 1] === animal && board[r][c - 2] === animal) ||
               (r >= 2 && board[r - 1][c] === animal && board[r - 2][c] === animal)) {
          animal = getRandomAnimal();
        }
        board[r][c] = animal;
      }
    }

    renderBoard();
  }

  function updateUI() {
    movesTextEl.textContent = movesLeft;
    targetScoreTextEl.textContent = targetScore;
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

    // Deduplicate
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

    // Click same tile to deselect
    if (selected.r === r && selected.c === c) {
      selected = null;
      renderBoard();
      return;
    }

    // Check adjacency
    var dr = Math.abs(selected.r - r);
    var dc = Math.abs(selected.c - c);

    if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
      // Swap tiles
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
      // Swap back
      playInvalidSound();
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
    playPopSound(combo);
    score += matches.length * 30 * combo;
    updateUI();

    // Mark matched cells
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
      // Fill empty spots at top
      while (writeR >= 0) {
        board[writeR][c] = getRandomAnimal();
        writeR--;
      }
    }
  }

  function checkGameStatus() {
    if (score >= targetScore) {
      isGameOver = true;
      playWinSound();
      modalTitleEl.textContent = '🌟 闯关大成功！';
      modalDescEl.textContent = '总得分 ' + score + '，提前达到目标斩获三星！';
      modalEl.classList.add('active');
    } else if (movesLeft <= 0) {
      isGameOver = true;
      playTone(200, 0.4, 'sawtooth', 0.2);
      modalTitleEl.textContent = '步数用尽！';
      modalDescEl.textContent = '总得分 ' + score + '，未达到 ' + targetScore + ' 分目标。';
      modalEl.classList.add('active');
    }
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var tile = document.createElement('div');
        tile.className = 'tile';
        if (selected && selected.r === r && selected.c === c) {
          tile.classList.add('selected');
        }
        var val = board[r][c];
        if (val) {
          tile.textContent = val;
        } else {
          tile.classList.add('matched');
        }

        (function (row, col) {
          tile.addEventListener('click', function () {
            handleCellClick(row, col);
          });
        })(r, c);

        boardEl.appendChild(tile);
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
