/**
 * OmniGame - 木块拼图 (Wood Block Blast)
 * Pure vanilla JS, 8x8 grid, block fitting algorithm, line blasting, combo streaks, Web Audio.
 */
(function () {
  'use strict';

  // --- Audio Synthesizer ---
  var AudioSys = {
    ctx: null,
    enabled: true,
    init: function () {
      if (!this.ctx) {
        try {
          var AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) this.ctx = new AudioCtx();
        } catch (e) {}
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(function () {});
      }
    },
    playTone: function (freq, type, duration, gainVal, startDelay) {
      if (!this.enabled || !this.ctx) return;
      try {
        var now = this.ctx.currentTime + (startDelay || 0);
        var osc = this.ctx.createOscillator();
        var gain = this.ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(gainVal || 0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration);
      } catch (e) {}
    },
    place: function () {
      this.playTone(280, 'triangle', 0.06, 0.2);
      this.playTone(180, 'sine', 0.08, 0.22, 0.01);
    },
    blast: function (lines) {
      var base = 440 + lines * 80;
      this.playTone(base, 'triangle', 0.12, 0.25);
      this.playTone(base * 1.25, 'sine', 0.16, 0.2, 0.04);
      this.playTone(base * 1.5, 'sine', 0.2, 0.18, 0.08);
    },
    gameOver: function () {
      this.playTone(220, 'sawtooth', 0.3, 0.2);
      this.playTone(160, 'sawtooth', 0.4, 0.2, 0.1);
    }
  };

  // --- Block Shape Templates ---
  var SHAPES = [
    { matrix: [[1]] },
    { matrix: [[1, 1]] },
    { matrix: [[1], [1]] },
    { matrix: [[1, 1, 1]] },
    { matrix: [[1], [1], [1]] },
    { matrix: [[1, 1, 1, 1]] },
    { matrix: [[1], [1], [1], [1]] },
    { matrix: [[1, 1], [1, 1]] },
    { matrix: [[1, 1, 1], [1, 1, 1], [1, 1, 1]] },
    { matrix: [[1, 0], [1, 0], [1, 1]] }, // L
    { matrix: [[0, 1], [0, 1], [1, 1]] },
    { matrix: [[1, 1, 1], [1, 0, 0]] },
    { matrix: [[1, 1, 1], [0, 0, 1]] },
    { matrix: [[1, 1, 1], [0, 1, 0]] }, // T
    { matrix: [[0, 1, 0], [1, 1, 1]] },
    { matrix: [[1, 1, 0], [0, 1, 1]] }, // Z
    { matrix: [[0, 1, 1], [1, 1, 0]] },
    { matrix: [[1, 1], [1, 0]] }, // Mini corner
    { matrix: [[1, 1], [0, 1]] }
  ];

  // --- DOM Elements ---
  var elements = {
    grid: document.getElementById('blockGrid'),
    piecesTray: document.getElementById('piecesTray'),
    scoreText: document.getElementById('scoreText'),
    bestText: document.getElementById('bestText'),
    comboText: document.getElementById('comboText'),
    soundBtn: document.getElementById('soundBtn'),
    restartBtn: document.getElementById('restartBtn'),
    modal: document.getElementById('gameOverModal'),
    modalDesc: document.getElementById('modalDesc'),
    modalRestartBtn: document.getElementById('modalRestartBtn')
  };

  // --- Game State ---
  var GRID_SIZE = 8;
  var state = {
    grid: [], // 8x8 matrix (0: empty, 1: filled)
    trayPieces: [], // [shape1, shape2, shape3]
    selectedTrayIndex: null,
    score: 0,
    bestScore: 0,
    combo: 0,
    gameOver: false
  };

  // --- Persistence ---
  var SAVE_KEY = 'omg:save:wood-block';

  function loadBestScore() {
    try {
      var saved = localStorage.getItem(SAVE_KEY);
      if (saved) state.bestScore = parseInt(saved, 10) || 0;
    } catch (e) {}
    elements.bestText.textContent = state.bestScore;
  }

  function saveBestScore() {
    if (state.score > state.bestScore) {
      state.bestScore = state.score;
      elements.bestText.textContent = state.bestScore;
      try {
        localStorage.setItem(SAVE_KEY, state.bestScore.toString());
      } catch (e) {}
    }
  }

  // --- Game Flow ---
  function initGame() {
    AudioSys.init();
    loadBestScore();
    state.score = 0;
    state.combo = 0;
    state.gameOver = false;
    state.selectedTrayIndex = null;

    elements.scoreText.textContent = '0';
    elements.comboText.textContent = '0';
    elements.modal.classList.remove('active');

    // Init 8x8 empty grid
    state.grid = [];
    for (var r = 0; r < GRID_SIZE; r++) {
      var row = [];
      for (var c = 0; c < GRID_SIZE; c++) row.push(0);
      state.grid.push(row);
    }

    renderGrid();
    spawnTrayPieces();
  }

  function spawnTrayPieces() {
    state.trayPieces = [];
    for (var i = 0; i < 3; i++) {
      var rand = SHAPES[Math.floor(Math.random() * SHAPES.length)];
      state.trayPieces.push({
        matrix: rand.matrix,
        used: false
      });
    }
    state.selectedTrayIndex = null;
    renderTray();

    checkGameOver();
  }

  // --- Render Board Grid ---
  function renderGrid() {
    elements.grid.innerHTML = '';
    for (var r = 0; r < GRID_SIZE; r++) {
      for (var c = 0; c < GRID_SIZE; c++) {
        var cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        if (state.grid[r][c] === 1) {
          cell.classList.add('filled');
        }

        (function (row, col) {
          cell.addEventListener('click', function () {
            onGridCellClick(row, col);
          });
          cell.addEventListener('mouseenter', function () {
            onGridCellHover(row, col);
          });
        })(r, c);

        elements.grid.appendChild(cell);
      }
    }
  }

  // --- Render Tray ---
  function renderTray() {
    elements.piecesTray.innerHTML = '';
    state.trayPieces.forEach(function (piece, idx) {
      var slot = document.createElement('div');
      slot.className = 'tray-slot';

      if (!piece.used) {
        var pieceEl = document.createElement('div');
        pieceEl.className = 'wood-piece' + (idx === state.selectedTrayIndex ? ' selected' : '');

        var rows = piece.matrix.length;
        var cols = piece.matrix[0].length;
        pieceEl.style.gridTemplateColumns = 'repeat(' + cols + ', 16px)';
        pieceEl.style.gridTemplateRows = 'repeat(' + rows + ', 16px)';

        for (var r = 0; r < rows; r++) {
          for (var c = 0; c < cols; c++) {
            var block = document.createElement('div');
            block.className = 'piece-block' + (piece.matrix[r][c] ? '' : ' empty');
            pieceEl.appendChild(block);
          }
        }

        pieceEl.addEventListener('click', function (e) {
          e.stopPropagation();
          onSelectTrayPiece(idx);
        });

        slot.appendChild(pieceEl);
      }

      elements.piecesTray.appendChild(slot);
    });
  }

  function onSelectTrayPiece(index) {
    AudioSys.init();
    if (state.selectedTrayIndex === index) {
      state.selectedTrayIndex = null;
    } else {
      state.selectedTrayIndex = index;
    }
    renderTray();
    clearPreviews();
  }

  // --- Hover & Placement Logic ---
  function canPlaceShape(matrix, startR, startR_c, startC) {
    var rows = matrix.length;
    var cols = matrix[0].length;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        if (matrix[r][c] === 1) {
          var targetR = startR + r;
          var targetC = startC + c;

          if (targetR < 0 || targetR >= GRID_SIZE || targetC < 0 || targetC >= GRID_SIZE) {
            return false;
          }
          if (state.grid[targetR][targetC] === 1) {
            return false;
          }
        }
      }
    }
    return true;
  }

  function clearPreviews() {
    var cells = elements.grid.querySelectorAll('.grid-cell');
    cells.forEach(function (cell) {
      cell.classList.remove('preview-valid', 'preview-invalid');
    });
  }

  function onGridCellHover(row, col) {
    if (state.selectedTrayIndex === null) return;
    var piece = state.trayPieces[state.selectedTrayIndex];
    if (!piece || piece.used) return;

    clearPreviews();

    var valid = canPlaceShape(piece.matrix, row, 0, col);
    var rows = piece.matrix.length;
    var cols = piece.matrix[0].length;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        if (piece.matrix[r][c] === 1) {
          var tr = row + r;
          var tc = col + c;
          if (tr >= 0 && tr < GRID_SIZE && tc >= 0 && tc < GRID_SIZE) {
            var cell = elements.grid.querySelector('.grid-cell[data-r="' + tr + '"][data-c="' + tc + '"]');
            if (cell) {
              cell.classList.add(valid ? 'preview-valid' : 'preview-invalid');
            }
          }
        }
      }
    }
  }

  function onGridCellClick(row, col) {
    if (state.selectedTrayIndex === null || state.gameOver) return;
    var piece = state.trayPieces[state.selectedTrayIndex];
    if (!piece || piece.used) return;

    if (canPlaceShape(piece.matrix, row, 0, col)) {
      AudioSys.init();
      AudioSys.place();

      // Place shape into grid
      var rows = piece.matrix.length;
      var cols = piece.matrix[0].length;
      var placedBlocks = 0;

      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          if (piece.matrix[r][c] === 1) {
            state.grid[row + r][col + c] = 1;
            placedBlocks++;
          }
        }
      }

      state.score += placedBlocks;
      piece.used = true;
      state.selectedTrayIndex = null;

      clearPreviews();
      renderGrid();
      renderTray();

      // Check Full Lines
      checkLineBlasts();

      // Check if all tray pieces used
      var allUsed = state.trayPieces.every(function (p) { return p.used; });
      if (allUsed) {
        spawnTrayPieces();
      } else {
        checkGameOver();
      }

      saveBestScore();
    }
  }

  // --- Line Blast Checks ---
  function checkLineBlasts() {
    var fullRows = [];
    var fullCols = [];

    // Rows
    for (var r = 0; r < GRID_SIZE; r++) {
      var rowFull = true;
      for (var c = 0; c < GRID_SIZE; c++) {
        if (state.grid[r][c] === 0) { rowFull = false; break; }
      }
      if (rowFull) fullRows.push(r);
    }

    // Cols
    for (var col = 0; col < GRID_SIZE; col++) {
      var colFull = true;
      for (var row = 0; row < GRID_SIZE; row++) {
        if (state.grid[row][col] === 0) { colFull = false; break; }
      }
      if (colFull) fullCols.push(col);
    }

    var totalLines = fullRows.length + fullCols.length;
    if (totalLines > 0) {
      state.combo++;
      elements.comboText.textContent = state.combo;

      AudioSys.blast(totalLines);

      // Animation & Clear cells
      fullRows.forEach(function (r) {
        for (var c = 0; c < GRID_SIZE; c++) {
          state.grid[r][c] = 0;
          var cell = elements.grid.querySelector('.grid-cell[data-r="' + r + '"][data-c="' + c + '"]');
          if (cell) cell.classList.add('clearing');
        }
      });

      fullCols.forEach(function (col) {
        for (var row = 0; row < GRID_SIZE; row++) {
          state.grid[row][col] = 0;
          var cell = elements.grid.querySelector('.grid-cell[data-r="' + row + '"][data-c="' + col + '"]');
          if (cell) cell.classList.add('clearing');
        }
      });

      var bonus = totalLines * 10 * totalLines * state.combo;
      state.score += bonus;
      elements.scoreText.textContent = state.score;

      setTimeout(function () {
        renderGrid();
      }, 250);
    } else {
      state.combo = 0;
      elements.comboText.textContent = '0';
      elements.scoreText.textContent = state.score;
    }
  }

  // --- Game Over Verification ---
  function checkGameOver() {
    var available = state.trayPieces.filter(function (p) { return !p.used; });
    if (available.length === 0) return;

    for (var p = 0; p < available.length; p++) {
      var piece = available[p];
      for (var r = 0; r < GRID_SIZE; r++) {
        for (var c = 0; c < GRID_SIZE; c++) {
          if (canPlaceShape(piece.matrix, r, 0, c)) {
            return; // Can still place at least one piece!
          }
        }
      }
    }

    // No space for any remaining piece!
    state.gameOver = true;
    AudioSys.gameOver();
    saveBestScore();

    elements.modalDesc.textContent = '最终得分: ' + state.score + ' 分 · 最佳记录: ' + state.bestScore + ' 分';
    elements.modal.classList.add('active');
  }

  // --- Listeners ---
  elements.boardArea = document.getElementById('boardArea');
  elements.boardArea.addEventListener('mouseleave', clearPreviews);

  elements.soundBtn.addEventListener('click', function () {
    AudioSys.enabled = !AudioSys.enabled;
    elements.soundBtn.textContent = AudioSys.enabled ? '🔊' : '🔇';
  });

  elements.restartBtn.addEventListener('click', initGame);
  elements.modalRestartBtn.addEventListener('click', initGame);

  // Init
  initGame();
})();
