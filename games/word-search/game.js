(function () {
  'use strict';

  var foundCountEl = document.getElementById('found-count');
  var timerValEl = document.getElementById('timer-val');
  var wordListEl = document.getElementById('word-list');
  var gridEl = document.getElementById('grid');
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

      if (type === 'found') {
        [523, 659, 784].forEach(function (f, i) {
          var o = actx.createOscillator();
          var g = actx.createGain();
          o.frequency.setValueAtTime(f, now + i * 0.08);
          g.gain.setValueAtTime(0.12, now + i * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.2);
          o.connect(g);
          g.connect(actx.destination);
          o.start(now + i * 0.08);
          o.stop(now + i * 0.08 + 0.2);
        });
      } else if (type === 'win') {
        [523, 659, 784, 1046, 1318].forEach(function (f, i) {
          var o = actx.createOscillator();
          var g = actx.createGain();
          o.frequency.setValueAtTime(f, now + i * 0.1);
          g.gain.setValueAtTime(0.2, now + i * 0.1);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);
          o.connect(g);
          g.connect(actx.destination);
          o.start(now + i * 0.1);
          o.stop(now + i * 0.1 + 0.35);
        });
      }
    } catch (e) {}
  }

  var GRID_SIZE = 10;
  var WORDS_POOL = ['APPLE', 'TIGER', 'ROBOT', 'SPACE', 'CLOUD', 'MUSIC'];
  var targetWords = [];
  var foundWords = [];
  var board = [];
  var foundCells = {};

  var isSelecting = false;
  var startCell = null;
  var currentSelection = [];

  var startTime = Date.now();
  var timerInterval = null;

  function initBoard() {
    board = [];
    foundCells = {};
    for (var r = 0; r < GRID_SIZE; r++) {
      var row = [];
      for (var c = 0; c < GRID_SIZE; c++) {
        row.push('');
      }
      board.push(row);
    }
  }

  function placeWords() {
    targetWords = WORDS_POOL.slice();
    var dirs = [
      { dr: 0, dc: 1 },  // horizontal
      { dr: 1, dc: 0 },  // vertical
      { dr: 1, dc: 1 }   // diagonal
    ];

    targetWords.forEach(function (word) {
      var placed = false;
      var attempts = 0;
      while (!placed && attempts < 100) {
        attempts++;
        var dir = dirs[Math.floor(Math.random() * dirs.length)];
        var maxR = GRID_SIZE - dir.dr * (word.length - 1);
        var maxC = GRID_SIZE - dir.dc * (word.length - 1);
        if (maxR <= 0 || maxC <= 0) continue;

        var startR = Math.floor(Math.random() * maxR);
        var startC = Math.floor(Math.random() * maxC);

        // Check fit
        var canFit = true;
        for (var i = 0; i < word.length; i++) {
          var rr = startR + dir.dr * i;
          var cc = startC + dir.dc * i;
          if (board[rr][cc] !== '' && board[rr][cc] !== word.charAt(i)) {
            canFit = false;
            break;
          }
        }

        if (canFit) {
          for (var j = 0; j < word.length; j++) {
            board[startR + dir.dr * j][startC + dir.dc * j] = word.charAt(j);
          }
          placed = true;
        }
      }
    });

    // Fill remaining with random letters
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (var r = 0; r < GRID_SIZE; r++) {
      for (var c = 0; c < GRID_SIZE; c++) {
        if (board[r][c] === '') {
          board[r][c] = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
        }
      }
    }
  }

  function renderWordList() {
    wordListEl.innerHTML = '';
    targetWords.forEach(function (w) {
      var d = document.createElement('div');
      d.className = 'target-word' + (foundWords.indexOf(w) >= 0 ? ' found' : '');
      d.textContent = w;
      wordListEl.appendChild(d);
    });
    foundCountEl.textContent = foundWords.length + ' / ' + targetWords.length;
  }

  function renderGrid() {
    gridEl.innerHTML = '';
    for (var r = 0; r < GRID_SIZE; r++) {
      for (var c = 0; c < GRID_SIZE; c++) {
        var cell = document.createElement('div');
        cell.className = 'letter-cell';
        cell.textContent = board[r][c];
        cell.dataset.r = r;
        cell.dataset.c = c;

        var key = r + ',' + c;
        if (foundCells[key]) cell.classList.add('found-cell');

        var isSel = currentSelection.some(function (p) { return p.r === r && p.c === c; });
        if (isSel) cell.classList.add('highlight');

        gridEl.appendChild(cell);
      }
    }
  }

  function getCellsBetween(p1, p2) {
    var dr = p2.r - p1.r;
    var dc = p2.c - p1.c;
    var dist = Math.max(Math.abs(dr), Math.abs(dc));
    if (dist === 0) return [p1];

    var stepR = dr === 0 ? 0 : dr / dist;
    var stepC = dc === 0 ? 0 : dc / dist;

    // Check if valid straight line (horizontal, vertical, or 45 deg diagonal)
    if (Math.abs(stepR) !== 0 && Math.abs(stepR) !== 1) return [p1];
    if (Math.abs(stepC) !== 0 && Math.abs(stepC) !== 1) return [p1];

    var cells = [];
    for (var i = 0; i <= dist; i++) {
      cells.push({ r: p1.r + i * stepR, c: p1.c + i * stepC });
    }
    return cells;
  }

  function setupInteraction() {
    function getCellFromPoint(clientX, clientY) {
      var el = document.elementFromPoint(clientX, clientY);
      if (el && el.classList.contains('letter-cell')) {
        return { r: parseInt(el.dataset.r, 10), c: parseInt(el.dataset.c, 10) };
      }
      return null;
    }

    var onDown = function (e) {
      e.preventDefault();
      getAudioCtx();
      var cx = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      var cy = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      var cell = getCellFromPoint(cx, cy);
      if (cell) {
        isSelecting = true;
        startCell = cell;
        currentSelection = [cell];
        renderGrid();
      }
    };

    var onMove = function (e) {
      if (!isSelecting || !startCell) return;
      var cx = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      var cy = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      var cell = getCellFromPoint(cx, cy);
      if (cell) {
        currentSelection = getCellsBetween(startCell, cell);
        renderGrid();
      }
    };

    var onUp = function () {
      if (!isSelecting) return;
      isSelecting = false;

      // Check currentSelection word
      var str = currentSelection.map(function (p) { return board[p.r][p.c]; }).join('');
      var revStr = str.split('').reverse().join('');

      var matchedWord = null;
      if (targetWords.indexOf(str) >= 0 && foundWords.indexOf(str) === -1) {
        matchedWord = str;
      } else if (targetWords.indexOf(revStr) >= 0 && foundWords.indexOf(revStr) === -1) {
        matchedWord = revStr;
      }

      if (matchedWord) {
        foundWords.push(matchedWord);
        currentSelection.forEach(function (p) {
          foundCells[p.r + ',' + p.c] = true;
        });
        playSound('found');
        renderWordList();

        if (foundWords.length >= targetWords.length) {
          playSound('win');
          setTimeout(function () {
            alert('🎉 恭喜！您已成功找齐所有隐藏单词！');
          }, 200);
        }
      }

      currentSelection = [];
      renderGrid();
    };

    gridEl.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    gridEl.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp, { passive: false });
  }

  function restart() {
    initBoard();
    placeWords();
    foundWords = [];
    startTime = Date.now();
    renderWordList();
    renderGrid();
  }

  btnRestart.addEventListener('click', restart);

  clearInterval(timerInterval);
  timerInterval = setInterval(function () {
    var sec = Math.floor((Date.now() - startTime) / 1000);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    timerValEl.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }, 1000);

  setupInteraction();
  restart();
})();
