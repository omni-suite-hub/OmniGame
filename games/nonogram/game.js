/**
 * OmniGame - 数织像素解谜 (Nonogram / Picross)
 * Pure vanilla JS, automatic clue calculation, paint/cross tools, Web Audio SFX.
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
    fill: function () {
      this.playTone(380, 'sine', 0.05, 0.14);
    },
    cross: function () {
      this.playTone(260, 'triangle', 0.04, 0.12);
    },
    clear: function () {
      this.playTone(200, 'sine', 0.04, 0.08);
    },
    satisfied: function () {
      this.playTone(659.25, 'triangle', 0.1, 0.15);
      this.playTone(783.99, 'sine', 0.14, 0.15, 0.04);
    },
    victory: function () {
      var notes = [523.25, 659.25, 783.99, 1046.5];
      var self = this;
      notes.forEach(function (f, i) {
        self.playTone(f, 'sine', 0.22, 0.2, i * 0.08);
      });
    }
  };

  // --- Built-in Pixel Art Puzzles (8x8) ---
  var PUZZLES = {
    heart: {
      name: '爱心',
      emoji: '❤️',
      grid: [
        [0, 1, 1, 0, 0, 1, 1, 0],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 0, 0, 1, 1, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0]
      ]
    },
    cat: {
      name: '小猫',
      emoji: '🐱',
      grid: [
        [1, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 0, 0, 0, 0, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 1, 1, 1, 1, 0, 1],
        [1, 1, 1, 0, 0, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [0, 0, 1, 1, 1, 1, 0, 0]
      ]
    },
    mushroom: {
      name: '蘑菇',
      emoji: '🍄',
      grid: [
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 0, 0, 1, 1, 0],
        [1, 1, 0, 1, 1, 0, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 0, 1, 1, 1, 1, 0, 0]
      ]
    },
    rocket: {
      name: '火箭',
      emoji: '🚀',
      grid: [
        [0, 0, 0, 1, 1, 0, 0, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 0, 1, 0, 0, 1, 0, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 1, 1, 1, 1, 0, 1],
        [0, 0, 0, 1, 1, 0, 0, 0]
      ]
    }
  };

  // --- Compute Clues ---
  function computeRuns(arr) {
    var runs = [];
    var count = 0;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === 1) {
        count++;
      } else {
        if (count > 0) runs.push(count);
        count = 0;
      }
    }
    if (count > 0) runs.push(count);
    return runs.length ? runs : [0];
  }

  // --- DOM Elements ---
  var elements = {
    board: document.getElementById('board'),
    fillToolBtn: document.getElementById('fillToolBtn'),
    crossToolBtn: document.getElementById('crossToolBtn'),
    timerText: document.getElementById('timerText'),
    soundBtn: document.getElementById('soundBtn'),
    restartBtn: document.getElementById('restartBtn'),
    puzBtns: Array.from(document.querySelectorAll('.puz-btn')),
    modal: document.getElementById('victoryModal'),
    modalEmoji: document.getElementById('modalEmoji'),
    modalTitle: document.getElementById('modalTitle'),
    modalDesc: document.getElementById('modalDesc'),
    modalNextBtn: document.getElementById('modalNextBtn')
  };

  // --- State ---
  var state = {
    puzzleKey: 'heart',
    puzzle: PUZZLES.heart,
    size: 8,
    rowClues: [],
    colClues: [],
    userGrid: [], // 0: empty, 1: filled, 2: crossed
    activeTool: 'fill', // 'fill' or 'cross'
    timer: 0,
    timerInterval: null,
    isWon: false,
    isMouseDown: false,
    drawMode: null // 0, 1, or 2
  };

  // --- Game Initialization ---
  function initGame() {
    AudioSys.init();
    clearInterval(state.timerInterval);
    state.isWon = false;
    state.timer = 0;
    elements.timerText.textContent = '00:00';
    elements.modal.classList.remove('active');

    state.puzzle = PUZZLES[state.puzzleKey];
    state.size = state.puzzle.grid.length;

    // Generate clues
    state.rowClues = [];
    state.colClues = [];

    for (var r = 0; r < state.size; r++) {
      state.rowClues.push(computeRuns(state.puzzle.grid[r]));
    }

    for (var c = 0; c < state.size; c++) {
      var col = [];
      for (var row = 0; row < state.size; row++) {
        col.push(state.puzzle.grid[row][c]);
      }
      state.colClues.push(computeRuns(col));
    }

    // Init user grid
    state.userGrid = [];
    for (var i = 0; i < state.size; i++) {
      var rowArr = [];
      for (var j = 0; j < state.size; j++) rowArr.push(0);
      state.userGrid.push(rowArr);
    }

    renderBoard();

    state.timerInterval = setInterval(function () {
      if (!state.isWon) {
        state.timer++;
        var m = Math.floor(state.timer / 60);
        var s = state.timer % 60;
        elements.timerText.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      }
    }, 1000);
  }

  // --- Render Board ---
  function renderBoard() {
    var b = elements.board;
    b.innerHTML = '';
    var totalCols = state.size + 1;
    var totalRows = state.size + 1;

    b.style.gridTemplateColumns = 'auto repeat(' + state.size + ', 28px)';
    b.style.gridTemplateRows = 'auto repeat(' + state.size + ', 28px)';

    // Top-left corner
    var corner = document.createElement('div');
    corner.className = 'clue-corner';
    b.appendChild(corner);

    // Column Clues (Top headers)
    for (var c = 0; c < state.size; c++) {
      var colDiv = document.createElement('div');
      colDiv.className = 'clue-col';
      colDiv.id = 'col-clue-' + c;
      state.colClues[c].forEach(function (num) {
        var nSpan = document.createElement('span');
        nSpan.textContent = num;
        colDiv.appendChild(nSpan);
      });
      b.appendChild(colDiv);
    }

    // Rows
    for (var r = 0; r < state.size; r++) {
      // Row Clue Header (Left)
      var rowDiv = document.createElement('div');
      rowDiv.className = 'clue-row';
      rowDiv.id = 'row-clue-' + r;
      state.rowClues[r].forEach(function (num) {
        var nSpan = document.createElement('span');
        nSpan.textContent = num;
        rowDiv.appendChild(nSpan);
      });
      b.appendChild(rowDiv);

      // Playable Cells
      for (var col = 0; col < state.size; col++) {
        var cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.r = r;
        cell.dataset.c = col;

        // Group border styling
        if (col % 5 === 4 && col !== state.size - 1) cell.classList.add('thick-border-right');
        if (r % 5 === 4 && r !== state.size - 1) cell.classList.add('thick-border-bottom');

        updateCellVisual(cell, state.userGrid[r][col]);

        (function (rowIdx, colIdx, cellEl) {
          cellEl.addEventListener('mousedown', function (e) {
            e.preventDefault();
            AudioSys.init();
            var tool = (e.button === 2) ? 'cross' : state.activeTool;
            applyCellAction(rowIdx, colIdx, tool);
          });

          cellEl.addEventListener('mouseenter', function (e) {
            if (state.isMouseDown) {
              var tool = state.drawMode === 2 ? 'cross' : (state.drawMode === 1 ? 'fill' : 'clear');
              applyCellAction(rowIdx, colIdx, tool);
            }
          });

          cellEl.addEventListener('contextmenu', function (e) {
            e.preventDefault();
          });
        })(r, col, cell);

        b.appendChild(cell);
      }
    }

    checkClueSatisfaction();
  }

  function updateCellVisual(cellEl, val) {
    cellEl.classList.remove('filled', 'crossed');
    cellEl.textContent = '';
    if (val === 1) {
      cellEl.classList.add('filled');
    } else if (val === 2) {
      cellEl.classList.add('crossed');
      cellEl.textContent = '✕';
    }
  }

  function applyCellAction(r, c, tool) {
    if (state.isWon) return;
    var cur = state.userGrid[r][c];
    var next = 0;

    if (tool === 'fill') {
      next = (cur === 1) ? 0 : 1;
    } else if (tool === 'cross') {
      next = (cur === 2) ? 0 : 2;
    } else if (tool === 'clear') {
      next = 0;
    }

    state.userGrid[r][c] = next;

    if (next === 1) AudioSys.fill();
    else if (next === 2) AudioSys.cross();
    else AudioSys.clear();

    var cellEl = elements.board.querySelector('.cell[data-r="' + r + '"][data-c="' + c + '"]');
    if (cellEl) updateCellVisual(cellEl, next);

    checkClueSatisfaction();
    checkWinCondition();
  }

  // --- Clue Satisfaction Check ---
  function checkClueSatisfaction() {
    // Check rows
    for (var r = 0; r < state.size; r++) {
      var rowUserRuns = computeRuns(state.userGrid[r].map(function (v) { return v === 1 ? 1 : 0; }));
      var matches = JSON.stringify(rowUserRuns) === JSON.stringify(state.rowClues[r]);
      var rClueEl = document.getElementById('row-clue-' + r);
      if (rClueEl) {
        if (matches) rClueEl.classList.add('satisfied');
        else rClueEl.classList.remove('satisfied');
      }
    }

    // Check cols
    for (var c = 0; c < state.size; c++) {
      var colUser = [];
      for (var row = 0; row < state.size; row++) {
        colUser.push(state.userGrid[row][c] === 1 ? 1 : 0);
      }
      var colUserRuns = computeRuns(colUser);
      var cMatches = JSON.stringify(colUserRuns) === JSON.stringify(state.colClues[c]);
      var cClueEl = document.getElementById('col-clue-' + c);
      if (cClueEl) {
        if (cMatches) cClueEl.classList.add('satisfied');
        else cClueEl.classList.remove('satisfied');
      }
    }
  }

  // --- Win Condition ---
  function checkWinCondition() {
    for (var r = 0; r < state.size; r++) {
      for (var c = 0; c < state.size; c++) {
        var expected = state.puzzle.grid[r][c];
        var actual = state.userGrid[r][c] === 1 ? 1 : 0;
        if (expected !== actual) return;
      }
    }

    // Solved!
    state.isWon = true;
    clearInterval(state.timerInterval);
    AudioSys.victory();

    try {
      var key = 'omg:save:nonogram_' + state.puzzleKey;
      var best = parseInt(localStorage.getItem(key) || '9999', 10);
      if (state.timer < best) {
        localStorage.setItem(key, state.timer.toString());
      }
    } catch (e) {}

    elements.modalEmoji.textContent = state.puzzle.emoji;
    elements.modalTitle.textContent = '🎉 ' + state.puzzle.name + ' 像素画破译成功！';
    elements.modalDesc.textContent = '解谜用时 ' + elements.timerText.textContent;
    elements.modal.classList.add('active');
  }

  // --- Mouse Drag Listeners ---
  window.addEventListener('mousedown', function () { state.isMouseDown = true; });
  window.addEventListener('mouseup', function () { state.isMouseDown = false; });

  // Tool toggle
  elements.fillToolBtn.addEventListener('click', function () {
    state.activeTool = 'fill';
    elements.fillToolBtn.classList.add('active');
    elements.crossToolBtn.classList.remove('active');
  });

  elements.crossToolBtn.addEventListener('click', function () {
    state.activeTool = 'cross';
    elements.crossToolBtn.classList.add('active');
    elements.fillToolBtn.classList.remove('active');
  });

  elements.soundBtn.addEventListener('click', function () {
    AudioSys.enabled = !AudioSys.enabled;
    elements.soundBtn.textContent = AudioSys.enabled ? '🔊' : '🔇';
  });

  elements.restartBtn.addEventListener('click', initGame);

  elements.modalNextBtn.addEventListener('click', function () {
    var keys = Object.keys(PUZZLES);
    var curIdx = keys.indexOf(state.puzzleKey);
    var nextKey = keys[(curIdx + 1) % keys.length];
    state.puzzleKey = nextKey;

    elements.puzBtns.forEach(function (btn) {
      if (btn.dataset.puz === nextKey) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    initGame();
  });

  elements.puzBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      elements.puzBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      state.puzzleKey = btn.dataset.puz;
      initGame();
    });
  });

  // Init
  initGame();
})();
