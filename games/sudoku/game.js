(function () {
  'use strict';

  var STORAGE_KEY = 'omg:save:sudoku';

  // Game state
  var solution = [];
  var initialPuzzle = [];
  var board = [];
  var notes = []; // 9x9 array of Set
  var history = [];
  var selectedCell = null; // { row, col }
  var noteMode = false;
  var difficulty = 'medium';
  var mistakes = 0;
  var maxMistakes = 3;
  var timerSeconds = 0;
  var timerInterval = null;
  var isPaused = false;
  var isGameOver = false;
  var soundEnabled = true;

  // DOM elements
  var boardEl = document.getElementById('board');
  var numpadEl = document.getElementById('numpad');
  var diffSelect = document.getElementById('diffSelect');
  var mistakeCountEl = document.getElementById('mistakeCount');
  var timerTextEl = document.getElementById('timerText');
  var pauseBtn = document.getElementById('pauseBtn');
  var resumeBtn = document.getElementById('resumeBtn');
  var pauseOverlay = document.getElementById('pauseOverlay');
  var soundBtn = document.getElementById('soundBtn');
  var newGameBtn = document.getElementById('newGameBtn');
  var undoBtn = document.getElementById('undoBtn');
  var eraseBtn = document.getElementById('eraseBtn');
  var noteBtn = document.getElementById('noteBtn');
  var noteStateEl = document.getElementById('noteState');
  var hintBtn = document.getElementById('hintBtn');

  var modal = document.getElementById('sdkModal');
  var modalEmoji = document.getElementById('modalEmoji');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalNewGameBtn = document.getElementById('modalNewGameBtn');

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

  function playSound(type) {
    if (!soundEnabled) return;
    var ctx = getAudioCtx();
    if (!ctx) return;
    var t = ctx.currentTime;

    if (type === 'tap') {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, t);
      osc.frequency.exponentialRampToValueAtTime(261.63, t + 0.05);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    } else if (type === 'note') {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, t);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.05);
    } else if (type === 'erase') {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.07);
    } else if (type === 'error') {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(130, t);
      osc.frequency.linearRampToValueAtTime(100, t + 0.18);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
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
    }
  }

  // --- Sudoku Generation & Solver Algorithms ---
  function isValid(b, row, col, num) {
    for (var i = 0; i < 9; i++) {
      if (b[row][i] === num && i !== col) return false;
      if (b[i][col] === num && i !== row) return false;
    }
    var startRow = Math.floor(row / 3) * 3;
    var startCol = Math.floor(col / 3) * 3;
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 3; c++) {
        var rr = startRow + r;
        var cc = startCol + c;
        if (b[rr][cc] === num && (rr !== row || cc !== col)) return false;
      }
    }
    return true;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function fillGrid(b) {
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (b[r][c] === 0) {
          var nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
          for (var i = 0; i < nums.length; i++) {
            var n = nums[i];
            if (isValid(b, r, c, n)) {
              b[r][c] = n;
              if (fillGrid(b)) return true;
              b[r][c] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  function generatePuzzle(diff) {
    var full = [];
    for (var r = 0; r < 9; r++) {
      full[r] = Array(9).fill(0);
    }
    fillGrid(full);

    var puzzle = full.map(function (row) { return row.slice(); });

    // Number of cells to remove
    var removeCount = 36;
    if (diff === 'easy') removeCount = 34;
    else if (diff === 'medium') removeCount = 44;
    else if (diff === 'hard') removeCount = 52;
    else if (diff === 'expert') removeCount = 56;

    var positions = [];
    for (var r2 = 0; r2 < 9; r2++) {
      for (var c2 = 0; c2 < 9; c2++) {
        positions.push([r2, c2]);
      }
    }
    shuffle(positions);

    for (var k = 0; k < removeCount && k < positions.length; k++) {
      var pos = positions[k];
      puzzle[pos[0]][pos[1]] = 0;
    }

    return {
      solution: full,
      puzzle: puzzle
    };
  }

  // --- Game Lifecycle ---
  function startNewGame() {
    var generated = generatePuzzle(difficulty);
    solution = generated.solution;
    initialPuzzle = generated.puzzle;
    board = initialPuzzle.map(function (row) { return row.slice(); });
    notes = [];
    for (var r = 0; r < 9; r++) {
      notes[r] = [];
      for (var c = 0; c < 9; c++) {
        notes[r][c] = [];
      }
    }
    history = [];
    selectedCell = null;
    mistakes = 0;
    timerSeconds = 0;
    isPaused = false;
    isGameOver = false;

    mistakeCountEl.textContent = mistakes;
    updateTimerDisplay();
    startTimer();
    renderBoard();
    saveState();
  }

  function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(function () {
      if (!isPaused && !isGameOver) {
        timerSeconds++;
        updateTimerDisplay();
        if (timerSeconds % 5 === 0) saveState();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    var m = Math.floor(timerSeconds / 60);
    var s = timerSeconds % 60;
    var str = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    timerTextEl.textContent = str;
  }

  // Check conflicts
  function hasConflict(r, c, val) {
    if (val === 0) return false;
    // Check row & col
    for (var i = 0; i < 9; i++) {
      if (i !== c && board[r][i] === val) return true;
      if (i !== r && board[i][c] === val) return true;
    }
    // Check 3x3 block
    var startRow = Math.floor(r / 3) * 3;
    var startCol = Math.floor(c / 3) * 3;
    for (var rr = 0; rr < 3; rr++) {
      for (var cc = 0; cc < 3; cc++) {
        var row = startRow + rr;
        var col = startCol + cc;
        if ((row !== r || col !== c) && board[row][col] === val) return true;
      }
    }
    return false;
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    var selVal = selectedCell ? board[selectedCell.row][selectedCell.col] : 0;

    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        var cell = document.createElement('div');
        cell.className = 'sdk-cell';
        cell.dataset.row = r;
        cell.dataset.col = c;

        var val = board[r][c];
        var isGiven = initialPuzzle[r][c] !== 0;

        if (isGiven) {
          cell.classList.add('given');
        }

        // Selection & Highlights
        if (selectedCell) {
          if (selectedCell.row === r && selectedCell.col === c) {
            cell.classList.add('selected');
          } else if (
            selectedCell.row === r ||
            selectedCell.col === c ||
            (Math.floor(r / 3) === Math.floor(selectedCell.row / 3) &&
             Math.floor(c / 3) === Math.floor(selectedCell.col / 3))
          ) {
            cell.classList.add('related');
          }

          if (val !== 0 && val === selVal) {
            cell.classList.add('same-val');
          }
        }

        // Error detection
        if (val !== 0 && hasConflict(r, c, val)) {
          cell.classList.add('error');
        }

        // Display value or notes
        if (val !== 0) {
          cell.textContent = val;
        } else if (notes[r][c] && notes[r][c].length > 0) {
          var notesGrid = document.createElement('div');
          notesGrid.className = 'notes-grid';
          for (var n = 1; n <= 9; n++) {
            var nSpan = document.createElement('span');
            if (notes[r][c].indexOf(n) !== -1) {
              nSpan.textContent = n;
            }
            notesGrid.appendChild(nSpan);
          }
          cell.appendChild(notesGrid);
        }

        boardEl.appendChild(cell);
      }
    }
  }

  // Cell selection
  function selectCell(r, c) {
    selectedCell = { row: r, col: c };
    renderBoard();
  }

  // Enter number
  function enterNumber(num) {
    if (!selectedCell || isGameOver || isPaused) return;
    var r = selectedCell.row;
    var c = selectedCell.col;

    // Can't edit given clues
    if (initialPuzzle[r][c] !== 0) return;

    if (noteMode) {
      // Toggle note
      var curNotes = notes[r][c].slice();
      var idx = curNotes.indexOf(num);
      if (idx !== -1) {
        curNotes.splice(idx, 1);
      } else {
        curNotes.push(num);
        curNotes.sort();
      }
      history.push({
        r: r, c: c,
        type: 'note',
        prev: notes[r][c].slice(),
        next: curNotes.slice()
      });
      notes[r][c] = curNotes;
      playSound('note');
      renderBoard();
      saveState();
      return;
    }

    // Normal mode: enter digit
    var prevVal = board[r][c];
    var prevNotes = notes[r][c].slice();

    if (prevVal === num) return; // already set

    history.push({
      r: r, c: c,
      type: 'val',
      prevVal: prevVal,
      nextVal: num,
      prevNotes: prevNotes
    });

    board[r][c] = num;
    notes[r][c] = []; // clear notes in this cell

    // Auto clean notes in same row, col, box
    for (var i = 0; i < 9; i++) {
      removeNote(r, i, num);
      removeNote(i, c, num);
    }
    var startRow = Math.floor(r / 3) * 3;
    var startCol = Math.floor(c / 3) * 3;
    for (var rr = 0; rr < 3; rr++) {
      for (var cc = 0; cc < 3; cc++) {
        removeNote(startRow + rr, startCol + cc, num);
      }
    }

    if (num !== solution[r][c]) {
      mistakes++;
      mistakeCountEl.textContent = mistakes;
      playSound('error');
      if (mistakes >= maxMistakes) {
        handleGameOver(false);
        renderBoard();
        saveState();
        return;
      }
    } else {
      playSound('tap');
    }

    renderBoard();
    checkWinCondition();
    saveState();
  }

  function removeNote(r, c, n) {
    if (notes[r][c]) {
      var idx = notes[r][c].indexOf(n);
      if (idx !== -1) notes[r][c].splice(idx, 1);
    }
  }

  function eraseSelected() {
    if (!selectedCell || isGameOver || isPaused) return;
    var r = selectedCell.row;
    var c = selectedCell.col;
    if (initialPuzzle[r][c] !== 0) return;

    if (board[r][c] !== 0 || notes[r][c].length > 0) {
      history.push({
        r: r, c: c,
        type: 'erase',
        prevVal: board[r][c],
        prevNotes: notes[r][c].slice()
      });
      board[r][c] = 0;
      notes[r][c] = [];
      playSound('erase');
      renderBoard();
      saveState();
    }
  }

  function undoLastAction() {
    if (history.length === 0 || isGameOver || isPaused) return;
    var item = history.pop();
    if (item.type === 'val') {
      board[item.r][item.c] = item.prevVal;
      notes[item.r][item.c] = item.prevNotes;
    } else if (item.type === 'note') {
      notes[item.r][item.c] = item.prev;
    } else if (item.type === 'erase') {
      board[item.r][item.c] = item.prevVal;
      notes[item.r][item.c] = item.prevNotes;
    }
    selectedCell = { row: item.r, col: item.c };
    renderBoard();
    saveState();
  }

  function giveHint() {
    if (isGameOver || isPaused) return;
    // Find first empty or incorrect cell
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (board[r][c] !== solution[r][c]) {
          selectedCell = { row: r, col: c };
          board[r][c] = solution[r][c];
          notes[r][c] = [];
          playSound('tap');
          renderBoard();
          checkWinCondition();
          saveState();
          return;
        }
      }
    }
  }

  function checkWinCondition() {
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (board[r][c] !== solution[r][c]) return;
      }
    }
    handleGameOver(true);
  }

  function handleGameOver(won) {
    isGameOver = true;
    clearInterval(timerInterval);

    if (won) {
      playSound('win');
      modalEmoji.textContent = '🎉';
      modalTitle.textContent = '恭喜通关！';
      modalDesc.textContent = '用时 ' + timerTextEl.textContent + ' · 难度: ' + diffSelect.options[diffSelect.selectedIndex].text;
    } else {
      playSound('error');
      modalEmoji.textContent = '💔';
      modalTitle.textContent = '失误过多！';
      modalDesc.textContent = '已累计 ' + mistakes + ' 次失误，请总结经验重开一局。';
    }

    setTimeout(function () {
      modal.classList.add('show');
    }, 400);
  }

  function togglePause() {
    if (isGameOver) return;
    isPaused = !isPaused;
    pauseOverlay.classList.toggle('show', isPaused);
    pauseBtn.textContent = isPaused ? '▶️' : '⏸️';
  }

  // State save/restore
  function saveState() {
    try {
      var state = {
        solution: solution,
        initialPuzzle: initialPuzzle,
        board: board,
        notes: notes,
        mistakes: mistakes,
        difficulty: difficulty,
        timerSeconds: timerSeconds,
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
        if (state && Array.isArray(state.board) && state.board.length === 9) {
          solution = state.solution;
          initialPuzzle = state.initialPuzzle;
          board = state.board;
          notes = state.notes || [];
          mistakes = state.mistakes || 0;
          difficulty = state.difficulty || 'medium';
          timerSeconds = state.timerSeconds || 0;
          isGameOver = !!state.isGameOver;

          diffSelect.value = difficulty;
          mistakeCountEl.textContent = mistakes;
          updateTimerDisplay();
          renderBoard();
          if (!isGameOver) startTimer();
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // Event Listeners
  boardEl.addEventListener('click', function (e) {
    var cell = e.target.closest('.sdk-cell');
    if (!cell) return;
    var r = parseInt(cell.dataset.row, 10);
    var c = parseInt(cell.dataset.col, 10);
    selectCell(r, c);
  });

  numpadEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.num-btn');
    if (!btn) return;
    var val = parseInt(btn.dataset.val, 10);
    enterNumber(val);
  });

  window.addEventListener('keydown', function (e) {
    if (isGameOver || isPaused) return;

    if (e.key >= '1' && e.key <= '9') {
      enterNumber(parseInt(e.key, 10));
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      eraseSelected();
    } else if (e.key === 'n' || e.key === 'N') {
      noteBtn.click();
    } else if (selectedCell) {
      var r = selectedCell.row;
      var c = selectedCell.col;
      if (e.key === 'ArrowUp' && r > 0) selectCell(r - 1, c);
      else if (e.key === 'ArrowDown' && r < 8) selectCell(r + 1, c);
      else if (e.key === 'ArrowLeft' && c > 0) selectCell(r, c - 1);
      else if (e.key === 'ArrowRight' && c < 8) selectCell(r, c + 1);
    }
  });

  noteBtn.addEventListener('click', function () {
    noteMode = !noteMode;
    noteBtn.classList.toggle('active', noteMode);
    noteStateEl.textContent = noteMode ? '开' : '关';
  });

  eraseBtn.addEventListener('click', eraseSelected);
  undoBtn.addEventListener('click', undoLastAction);
  hintBtn.addEventListener('click', giveHint);
  pauseBtn.addEventListener('click', togglePause);
  resumeBtn.addEventListener('click', togglePause);

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  diffSelect.addEventListener('change', function () {
    difficulty = diffSelect.value;
    startNewGame();
  });

  newGameBtn.addEventListener('click', startNewGame);
  modalNewGameBtn.addEventListener('click', function () {
    modal.classList.remove('show');
    startNewGame();
  });

  // Init
  if (!loadState()) {
    startNewGame();
  }
})();
