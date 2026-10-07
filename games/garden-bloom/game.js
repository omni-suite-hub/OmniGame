// Garden Bloom (花园绽放) - OmniGame Engine
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

  function playBloomSound(combo) {
    var base = 520 + (combo || 0) * 80;
    playTone(base, 0.08, 'triangle', 0.15);
  }
  function playBeeSound() {
    playTone(400, 0.12, 'sawtooth', 0.2);
    setTimeout(function () { playTone(800, 0.18, 'sine', 0.2); }, 70);
  }
  function playSwapSound() { playTone(360, 0.05, 'sine', 0.1); }
  function playWinSound() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { playTone(f, 0.25, 'triangle', 0.2); }, i * 110);
    });
  }

  var FLOWERS = ['🌹', '🌻', '🌷', '🌸', '🌼'];
  var BEE_SPECIAL = '🐝';
  var ROWS = 8;
  var COLS = 8;

  var board = [];
  var selected = null;
  var isAnimating = false;
  var score = 0;
  var movesLeft = 22;
  var targetScore = 2200;
  var isGameOver = false;

  var boardEl = document.getElementById('board');
  var movesTextEl = document.getElementById('movesText');
  var targetTextEl = document.getElementById('targetText');
  var scoreTextEl = document.getElementById('scoreText');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalTitleEl = document.getElementById('modalTitle');
  var modalDescEl = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  function getRandomFlower() {
    return {
      type: FLOWERS[Math.floor(Math.random() * FLOWERS.length)],
      isWater: false,
      isBee: false
    };
  }

  function initGame() {
    score = 0;
    movesLeft = 22;
    targetScore = 2200;
    selected = null;
    isAnimating = false;
    isGameOver = false;

    modalEl.classList.remove('active');
    updateUI();

    board = [];
    for (var r = 0; r < ROWS; r++) {
      board[r] = [];
      for (var c = 0; c < COLS; c++) {
        var flower = getRandomFlower();
        while ((c >= 2 && board[r][c - 1].type === flower.type && board[r][c - 2].type === flower.type) ||
               (r >= 2 && board[r - 1][c].type === flower.type && board[r - 2][c].type === flower.type)) {
          flower = getRandomFlower();
        }
        board[r][c] = flower;
      }
    }

    renderBoard();
  }

  function updateUI() {
    movesTextEl.textContent = movesLeft;
    targetTextEl.textContent = targetScore;
    scoreTextEl.textContent = score;
  }

  function findMatches() {
    var matchedCells = [];
    var fourSpecials = [];
    var fiveSpecials = [];

    // Horizontal
    for (var r = 0; r < ROWS; r++) {
      var matchLen = 1;
      for (var c = 0; c < COLS; c++) {
        var isMatch = false;
        if (c < COLS - 1 && board[r][c] && board[r][c + 1] && board[r][c].type === board[r][c + 1].type) {
          isMatch = true;
        }
        if (isMatch) {
          matchLen++;
        } else {
          if (matchLen >= 3) {
            if (matchLen === 4) fourSpecials.push({ r: r, c: c - 1 });
            if (matchLen >= 5) fiveSpecials.push({ r: r, c: c - 2 });
            for (var k = 0; k < matchLen; k++) {
              matchedCells.push({ r: r, c: c - k });
            }
          }
          matchLen = 1;
        }
      }
    }

    // Vertical
    for (var col = 0; col < COLS; col++) {
      var vLen = 1;
      for (var row = 0; row < ROWS; row++) {
        var vMatch = false;
        if (row < ROWS - 1 && board[row][col] && board[row + 1][col] && board[row][col].type === board[row + 1][col].type) {
          vMatch = true;
        }
        if (vMatch) {
          vLen++;
        } else {
          if (vLen >= 3) {
            if (vLen === 4) fourSpecials.push({ r: row - 1, c: col });
            if (vLen >= 5) fiveSpecials.push({ r: row - 2, c: col });
            for (var m = 0; m < vLen; m++) {
              matchedCells.push({ r: row - m, c: col });
            }
          }
          vLen = 1;
        }
      }
    }

    // Deduplicate
    var unique = [];
    var seen = {};
    matchedCells.forEach(function (cell) {
      var key = cell.r + '_' + cell.c;
      if (!seen[key]) {
        seen[key] = true;
        unique.push(cell);
      }
    });

    return { matches: unique, fourSpecials: fourSpecials, fiveSpecials: fiveSpecials };
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
    var fl1 = board[r1][c1];
    var fl2 = board[r2][c2];

    // Check Queen Bee Special interaction
    if (fl1.isBee || fl2.isBee) {
      movesLeft--;
      updateUI();
      detonateBee(fl1.isBee ? fl2.type : fl1.type, fl1.isBee ? { r: r1, c: c1 } : { r: r2, c: c2 });
      return;
    }

    // Normal Swap
    board[r1][c1] = fl2;
    board[r2][c2] = fl1;
    renderBoard();

    var res = findMatches();
    if (res.matches.length > 0) {
      movesLeft--;
      updateUI();
      processMatches(res, 1);
    } else {
      playTone(180, 0.12, 'sawtooth', 0.12);
      setTimeout(function () {
        board[r1][c1] = fl1;
        board[r2][c2] = fl2;
        isAnimating = false;
        renderBoard();
      }, 250);
    }
  }

  function detonateBee(targetType, beeCell) {
    playBeeSound();
    board[beeCell.r][beeCell.c] = null;
    var count = 1;

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (board[r][c] && board[r][c].type === targetType) {
          board[r][c] = null;
          count++;
        }
      }
    }
    score += count * 55;
    updateUI();
    renderBoard();

    setTimeout(function () {
      applyGravity();
      renderBoard();
      setTimeout(checkCascade, 220);
    }, 250);
  }

  function processMatches(res, combo) {
    playBloomSound(combo);
    var matches = res.matches;
    var extraElims = [];

    // Check Water Droplet 3x3 surrounding splash
    matches.forEach(function (m) {
      var cell = board[m.r][m.c];
      if (cell && cell.isWater) {
        for (var dr = -1; dr <= 1; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            var nr = m.r + dr;
            var nc = m.c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              extraElims.push({ r: nr, c: nc });
            }
          }
        }
      }
    });

    extraElims.forEach(function (e) {
      if (!matches.some(function (m) { return m.r === e.r && m.c === e.c; })) {
        matches.push(e);
      }
    });

    score += matches.length * 30 * combo;
    updateUI();

    var specialPos = {};
    if (res.fiveSpecials.length > 0) {
      var fv = res.fiveSpecials[0];
      specialPos[fv.r + '_' + fv.c] = { type: BEE_SPECIAL, isWater: false, isBee: true };
    } else if (res.fourSpecials.length > 0) {
      var fr = res.fourSpecials[0];
      specialPos[fr.r + '_' + fr.c] = { type: board[fr.r][fr.c].type, isWater: true, isBee: false };
    }

    matches.forEach(function (m) {
      var k = m.r + '_' + m.c;
      if (specialPos[k]) {
        board[m.r][m.c] = specialPos[k];
      } else {
        board[m.r][m.c] = null;
      }
    });

    renderBoard();

    setTimeout(function () {
      applyGravity();
      renderBoard();
      setTimeout(checkCascade, 220);
    }, 220);
  }

  function checkCascade() {
    var res = findMatches();
    if (res.matches.length > 0) {
      processMatches(res, 2);
    } else {
      isAnimating = false;
      checkGameStatus();
    }
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
        board[writeR][c] = getRandomFlower();
        writeR--;
      }
    }
  }

  function checkGameStatus() {
    if (score >= targetScore) {
      isGameOver = true;
      playWinSound();
      modalTitleEl.textContent = '🌺 百花齐放！花满庄园！';
      modalDescEl.textContent = '总得分 ' + score + '，收获大丰收！';
      modalEl.classList.add('active');
    } else if (movesLeft <= 0) {
      isGameOver = true;
      playTone(200, 0.4, 'sawtooth', 0.2);
      modalTitleEl.textContent = '步数用尽！';
      modalDescEl.textContent = '最终得分 ' + score + '，未达到 ' + targetScore + ' 分目标。';
      modalEl.classList.add('active');
    }
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var cell = document.createElement('div');
        cell.className = 'flower-cell';
        if (selected && selected.r === r && selected.c === c) {
          cell.classList.add('selected');
        }

        var item = board[r][c];
        if (item) {
          cell.textContent = item.type;
          if (item.isWater) cell.classList.add('water');
          if (item.isBee) cell.classList.add('bee');
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
