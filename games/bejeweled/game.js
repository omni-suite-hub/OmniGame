(function () {
  'use strict';

  var STORAGE_KEY = 'omg:save:bejeweled';

  var ROWS = 8;
  var COLS = 8;
  var NUM_TYPES = 6;

  // DOM
  var boardEl = document.getElementById('board');
  var movesText = document.getElementById('movesText');
  var scoreText = document.getElementById('scoreText');
  var targetText = document.getElementById('targetText');
  var soundBtn = document.getElementById('soundBtn');
  var restartBtn = document.getElementById('restartBtn');

  var modal = document.getElementById('bjModal');
  var modalEmoji = document.getElementById('modalEmoji');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalActionBtn = document.getElementById('modalActionBtn');

  // State
  var board = []; // 8x8 array of integers 1..6
  var selectedCell = null; // { r, c }
  var isAnimating = false;
  var movesLeft = 25;
  var score = 0;
  var targetScore = 2500;
  var isGameOver = false;
  var soundEnabled = true;

  // Gem SVG renders
  var GEMS_SVG = {
    1: '<svg viewBox="0 0 100 100" class="gem-icon"><polygon points="50,10 90,50 50,90 10,50" fill="#ef4444" stroke="#b91c1c" stroke-width="4"/><polygon points="50,22 78,50 50,78 22,50" fill="#f87171"/></svg>', // Ruby
    2: '<svg viewBox="0 0 100 100" class="gem-icon"><circle cx="50" cy="50" r="38" fill="#3b82f6" stroke="#1d4ed8" stroke-width="4"/><ellipse cx="42" cy="40" rx="18" ry="12" fill="#93c5fd"/></svg>', // Sapphire
    3: '<svg viewBox="0 0 100 100" class="gem-icon"><rect x="18" y="18" width="64" height="64" rx="10" fill="#10b981" stroke="#047857" stroke-width="4"/><rect x="28" y="28" width="44" height="44" rx="6" fill="#34d399"/></svg>', // Emerald
    4: '<svg viewBox="0 0 100 100" class="gem-icon"><polygon points="50,12 90,82 10,82" fill="#eab308" stroke="#a16207" stroke-width="4"/><polygon points="50,28 78,74 22,74" fill="#fde047"/></svg>', // Topaz
    5: '<svg viewBox="0 0 100 100" class="gem-icon"><polygon points="50,12 85,32 85,68 50,88 15,68 15,32" fill="#a855f7" stroke="#7e22ce" stroke-width="4"/><polygon points="50,24 74,38 74,62 50,76 26,62 26,38" fill="#c084fc"/></svg>', // Amethyst
    6: '<svg viewBox="0 0 100 100" class="gem-icon"><path d="M50,10 C75,45 80,85 50,85 C20,85 25,45 50,10 Z" fill="#f97316" stroke="#c2410c" stroke-width="4"/><path d="M50,22 C66,50 70,76 50,76 C30,76 34,50 50,22 Z" fill="#fb923c"/></svg>' // Amber
  };

  // Audio Context
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

  function playSound(type, combo) {
    if (!soundEnabled) return;
    var ctxA = getAudioCtx();
    if (!ctxA) return;
    var t = ctxA.currentTime;

    if (type === 'swap') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(380, t);
      osc.frequency.exponentialRampToValueAtTime(520, t + 0.05);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    } else if (type === 'match') {
      var base = 440 * Math.pow(1.15, Math.min(combo || 0, 6));
      [base, base * 1.25, base * 1.5].forEach(function (freq, i) {
        var osc = ctxA.createOscillator();
        var gain = ctxA.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.06);
        gain.gain.setValueAtTime(0.25, t + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.06 + 0.12);
        osc.connect(gain);
        gain.connect(ctxA.destination);
        osc.start(t + i * 0.06);
        osc.stop(t + i * 0.06 + 0.13);
      });
    } else if (type === 'invalid') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, t);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.11);
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (freq, i) {
        var osc = ctxA.createOscillator();
        var gain = ctxA.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + i * 0.1);
        gain.gain.setValueAtTime(0.3, t + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.1 + 0.2);
        osc.connect(gain);
        gain.connect(ctxA.destination);
        osc.start(t + i * 0.1);
        osc.stop(t + i * 0.1 + 0.22);
      });
    }
  }

  function getRandomGem() {
    return Math.floor(Math.random() * NUM_TYPES) + 1;
  }

  // Find all matches on board: returns array of { r, c }
  function findMatches(b) {
    var matchedMap = {};

    // Horizontal
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS - 2; c++) {
        var val = b[r][c];
        if (val !== 0 && val === b[r][c + 1] && val === b[r][c + 2]) {
          var matchLen = 3;
          while (c + matchLen < COLS && b[r][c + matchLen] === val) {
            matchLen++;
          }
          for (var i = 0; i < matchLen; i++) {
            matchedMap[r + '-' + (c + i)] = true;
          }
          c += matchLen - 1;
        }
      }
    }

    // Vertical
    for (var col = 0; col < COLS; col++) {
      for (var row = 0; row < ROWS - 2; row++) {
        var vVal = b[row][col];
        if (vVal !== 0 && vVal === b[row + 1][col] && vVal === b[row + 2][col]) {
          var vLen = 3;
          while (row + vLen < ROWS && b[row + vLen][col] === vVal) {
            vLen++;
          }
          for (var j = 0; j < vLen; j++) {
            matchedMap[(row + j) + '-' + col] = true;
          }
          row += vLen - 1;
        }
      }
    }

    var list = [];
    for (var key in matchedMap) {
      var parts = key.split('-');
      list.push({ r: parseInt(parts[0], 10), c: parseInt(parts[1], 10) });
    }
    return list;
  }

  function generateInitialBoard() {
    var b = [];
    for (var r = 0; r < ROWS; r++) {
      b[r] = [];
      for (var c = 0; c < COLS; c++) {
        var gem;
        do {
          gem = getRandomGem();
        } while (
          (c >= 2 && b[r][c - 1] === gem && b[r][c - 2] === gem) ||
          (r >= 2 && b[r - 1][c] === gem && b[r - 2][c] === gem)
        );
        b[r][c] = gem;
      }
    }
    return b;
  }

  function initGame() {
    board = generateInitialBoard();
    selectedCell = null;
    isAnimating = false;
    movesLeft = 25;
    score = 0;
    targetScore = 2500;
    isGameOver = false;

    updateUI();
    renderBoard();
    hideModal();
    saveState();
  }

  function updateUI() {
    movesText.textContent = movesLeft;
    scoreText.textContent = score.toLocaleString();
    targetText.textContent = targetScore.toLocaleString();
  }

  function renderBoard() {
    boardEl.innerHTML = '';

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var cellEl = document.createElement('div');
        cellEl.className = 'bj-cell';
        cellEl.dataset.row = r;
        cellEl.dataset.col = c;

        if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
          cellEl.classList.add('selected');
        }

        var gemVal = board[r][c];
        if (gemVal > 0 && GEMS_SVG[gemVal]) {
          cellEl.innerHTML = GEMS_SVG[gemVal];
        }

        boardEl.appendChild(cellEl);
      }
    }
  }

  function handleCellClick(r, c) {
    if (isAnimating || isGameOver) return;

    if (!selectedCell) {
      selectedCell = { r: r, c: c };
      playSound('swap');
      renderBoard();
      return;
    }

    var r1 = selectedCell.r;
    var c1 = selectedCell.c;
    var r2 = r;
    var c2 = c;

    // Clicked same cell
    if (r1 === r2 && c1 === c2) {
      selectedCell = null;
      renderBoard();
      return;
    }

    // Check adjacency
    var isAdjacent = (Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1);
    if (!isAdjacent) {
      selectedCell = { r: r, c: c };
      playSound('swap');
      renderBoard();
      return;
    }

    // Attempt swap
    selectedCell = null;
    executeSwap(r1, c1, r2, c2);
  }

  function executeSwap(r1, c1, r2, c2) {
    isAnimating = true;

    // Swap values
    var tmp = board[r1][c1];
    board[r1][c1] = board[r2][c2];
    board[r2][c2] = tmp;
    playSound('swap');
    renderBoard();

    var matches = findMatches(board);

    if (matches.length > 0) {
      // Valid move!
      movesLeft--;
      updateUI();
      resolveMatches(0);
    } else {
      // Invalid swap: revert
      playSound('invalid');
      setTimeout(function () {
        var revertTmp = board[r1][c1];
        board[r1][c1] = board[r2][c2];
        board[r2][c2] = revertTmp;
        isAnimating = false;
        renderBoard();
      }, 300);
    }
  }

  function resolveMatches(combo) {
    var matches = findMatches(board);
    if (matches.length === 0) {
      isAnimating = false;
      renderBoard();
      checkGameStatus();
      saveState();
      return;
    }

    playSound('match', combo);

    // Calculate score
    var pts = matches.length * 50 * (combo + 1);
    score += pts;
    updateUI();

    // Mark matched cells for animation
    matches.forEach(function (m) {
      var cellEl = boardEl.querySelector('[data-row="' + m.r + '"][data-col="' + m.c + '"]');
      if (cellEl) cellEl.classList.add('clearing');
      board[m.r][m.c] = 0;
    });

    setTimeout(function () {
      applyGravityAndRefill();
      renderBoard();
      setTimeout(function () {
        resolveMatches(combo + 1);
      }, 200);
    }, 250);
  }

  function applyGravityAndRefill() {
    for (var c = 0; c < COLS; c++) {
      var writeR = ROWS - 1;
      for (var r = ROWS - 1; r >= 0; r--) {
        if (board[r][c] !== 0) {
          board[writeR][c] = board[r][c];
          if (writeR !== r) {
            board[r][c] = 0;
          }
          writeR--;
        }
      }
      // Fill remaining top slots with new gems
      while (writeR >= 0) {
        board[writeR][c] = getRandomGem();
        writeR--;
      }
    }
  }

  function checkGameStatus() {
    if (score >= targetScore) {
      isGameOver = true;
      playSound('win');
      modalEmoji.textContent = '💎';
      modalTitle.textContent = '过关大捷！';
      modalDesc.textContent = '最终得分: ' + score.toLocaleString() + ' · 成功达成 ' + targetScore.toLocaleString() + ' 目标！';
      modalActionBtn.textContent = '进入下一关';
      modalActionBtn.onclick = function () {
        targetScore += 1500;
        initGame();
      };
      setTimeout(function () { modal.classList.add('show'); }, 400);
    } else if (movesLeft <= 0) {
      isGameOver = true;
      modalEmoji.textContent = '🥀';
      modalTitle.textContent = '步数耗尽！';
      modalDesc.textContent = '最终得分: ' + score.toLocaleString() + ' · 距目标还差 ' + (targetScore - score).toLocaleString() + ' 分';
      modalActionBtn.textContent = '再试一次';
      modalActionBtn.onclick = function () {
        initGame();
      };
      setTimeout(function () { modal.classList.add('show'); }, 400);
    }
  }

  function hideModal() {
    modal.classList.remove('show');
  }

  function saveState() {
    try {
      var state = {
        board: board,
        movesLeft: movesLeft,
        score: score,
        targetScore: targetScore,
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
        if (state && Array.isArray(state.board)) {
          board = state.board;
          movesLeft = state.movesLeft || 25;
          score = state.score || 0;
          targetScore = state.targetScore || 2500;
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
  boardEl.addEventListener('click', function (e) {
    var cellEl = e.target.closest('.bj-cell');
    if (!cellEl) return;
    var r = parseInt(cellEl.dataset.row, 10);
    var c = parseInt(cellEl.dataset.col, 10);
    handleCellClick(r, c);
  });

  restartBtn.addEventListener('click', initGame);

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  // Init
  if (!loadState()) {
    initGame();
  }
})();
