/* 2048 — OmniGame
 * Clean, dependency-free implementation. Keyboard (arrows/WASD) + touch swipe.
 * Best score persisted via shared GameStore (chrome.storage.local / localStorage).
 */
(function () {
  'use strict';

  var SIZE = 4;
  var WIN = 2048;

  var board, before, score, best, won, over;

  var boardEl = document.getElementById('board');
  var scoreEl = document.getElementById('score');
  var bestEl = document.getElementById('best');
  var msgEl = document.getElementById('msg');
  var msgTitle = document.getElementById('msgTitle');
  var msgBtn = document.getElementById('msgBtn');

  var idx = function (r, c) {
    return r * SIZE + c;
  };

  function emptyBoard() {
    var a = new Array(SIZE * SIZE);
    for (var i = 0; i < a.length; i++) a[i] = 0;
    return a;
  }

  function emptyCells() {
    var a = [];
    for (var i = 0; i < board.length; i++) if (board[i] === 0) a.push(i);
    return a;
  }

  function addRandom() {
    var cells = emptyCells();
    if (!cells.length) return;
    var i = cells[Math.floor(Math.random() * cells.length)];
    board[i] = Math.random() < 0.9 ? 2 : 4;
  }

  // Slide one line (array of SIZE) toward index 0, merging equal neighbours once.
  function slide(line) {
    var arr = line.filter(function (v) {
      return v !== 0;
    });
    var gained = 0;
    for (var i = 0; i < arr.length - 1; i++) {
      if (arr[i] === arr[i + 1]) {
        arr[i] *= 2;
        gained += arr[i];
        arr[i + 1] = 0;
        i++;
      }
    }
    arr = arr.filter(function (v) {
      return v !== 0;
    });
    while (arr.length < SIZE) arr.push(0);
    return { line: arr, gained: gained };
  }

  function canMove() {
    if (emptyCells().length) return true;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var v = board[idx(r, c)];
        if (c + 1 < SIZE && board[idx(r, c + 1)] === v) return true;
        if (r + 1 < SIZE && board[idx(r + 1, c)] === v) return true;
      }
    }
    return false;
  }

  function move(dir) {
    if (over) return;
    before = board.slice();
    var gained = 0;
    for (var i = 0; i < SIZE; i++) {
      var line = [];
      if (dir === 'left') {
        for (var c = 0; c < SIZE; c++) line.push(board[idx(i, c)]);
      } else if (dir === 'right') {
        for (var c2 = SIZE - 1; c2 >= 0; c2--) line.push(board[idx(i, c2)]);
      } else if (dir === 'up') {
        for (var r = 0; r < SIZE; r++) line.push(board[idx(r, i)]);
      } else if (dir === 'down') {
        for (var r2 = SIZE - 1; r2 >= 0; r2--) line.push(board[idx(r2, i)]);
      }
      var res = slide(line);
      gained += res.gained;
      for (var k = 0; k < SIZE; k++) {
        var v = res.line[k];
        if (dir === 'left') board[idx(i, k)] = v;
        else if (dir === 'right') board[idx(i, SIZE - 1 - k)] = v;
        else if (dir === 'up') board[idx(k, i)] = v;
        else if (dir === 'down') board[idx(SIZE - 1 - k, i)] = v;
      }
    }

    var changed = false;
    for (var j = 0; j < board.length; j++) {
      if (board[j] !== before[j]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;

    score += gained;
    addRandom();
    render();
    updateScore();

    if (!won && board.indexOf(WIN) >= 0) {
      won = true;
      showMsg('你赢了！🎉', '继续挑战', false);
    } else if (!canMove()) {
      over = true;
      showMsg('游戏结束', '再来一局', true);
    }
    saveState();
  }

  function valueClass(v) {
    if (v === 0) return '';
    if (v > 2048) return 'vbig';
    return 'v' + v;
  }

  function render() {
    var html = '';
    for (var i = 0; i < board.length; i++) {
      var v = board[i];
      var changed = before && v !== 0 && v !== before[i];
      var cls = 'tile ' + (v ? valueClass(v) : 'empty');
      if (changed) cls += ' pop';
      html += '<div class="' + cls + '">' + (v ? v : '') + '</div>';
    }
    boardEl.innerHTML = html;
  }

  function updateScore() {
    scoreEl.textContent = score;
    if (score > best) {
      best = score;
      GameStore.setBest('2048', best);
    }
    bestEl.textContent = best;
  }

  function showMsg(title, btn, isOver) {
    msgTitle.textContent = title;
    msgBtn.textContent = btn;
    msgBtn.dataset.over = isOver ? '1' : '0';
    msgEl.hidden = false;
  }
  function hideMsg() {
    msgEl.hidden = true;
  }

  var SAVE_KEY = 'omg:save:2048';

  function saveState() {
    if (over) {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      return;
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        board: board,
        score: score,
        won: won
      }));
    } catch (e) {}
  }

  function init(forceNew) {
    if (!forceNew) {
      try {
        var raw = localStorage.getItem(SAVE_KEY);
        if (raw) {
          var data = JSON.parse(raw);
          if (data && Array.isArray(data.board) && data.board.length === SIZE * SIZE) {
            board = data.board;
            score = data.score || 0;
            won = !!data.won;
            over = false;
            hideMsg();
            render();
            updateScore();
            return;
          }
        }
      } catch (e) {}
    }
    board = emptyBoard();
    score = 0;
    won = false;
    over = false;
    hideMsg();
    addRandom();
    addRandom();
    render();
    updateScore();
    saveState();
  }

  // ---- Input: keyboard ----
  document.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    var map = {
      arrowleft: 'left',
      a: 'left',
      arrowright: 'right',
      d: 'right',
      arrowup: 'up',
      w: 'up',
      arrowdown: 'down',
      s: 'down'
    };
    if (map[k]) {
      move(map[k]);
      e.preventDefault();
    } else if (
      (k === 'enter' || k === ' ') &&
      !msgEl.hidden &&
      msgBtn.dataset.over === '1'
    ) {
      init();
      e.preventDefault();
    }
  });

  // ---- Input: touch swipe ----
  var sx = 0,
    sy = 0,
    tracking = false;
  document.addEventListener(
    'touchstart',
    function (e) {
      var t = e.touches[0];
      sx = t.clientX;
      sy = t.clientY;
      tracking = true;
    },
    { passive: true }
  );
  document.addEventListener(
    'touchend',
    function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - sx;
      var dy = t.clientY - sy;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
      else move(dy > 0 ? 'down' : 'up');
    },
    { passive: true }
  );

  // ---- Controls ----
  msgBtn.addEventListener('click', function () {
    if (msgBtn.dataset.over === '1') init(true);
    else hideMsg(); // "继续挑战"
  });

  // ---- Boot ----
  GameStore.getBest('2048').then(function (b) {
    best = b || 0;
    bestEl.textContent = best;
  });
  init();

  // ---- Responsive: size the board to fit the available stage ----
  function fitBoard() {
    var headH = (document.querySelector('.head') || {}).offsetHeight || 44;
    var tipH = (document.querySelector('.tip') || {}).offsetHeight || 22;
    var availH = window.innerHeight - headH - tipH - 46;
    var availW = Math.min(window.innerWidth - 32, 850);
    var s = Math.min(availW, availH);
    s = Math.max(260, Math.min(s, 720));
    boardEl.style.width = s + 'px';
    boardEl.style.height = s + 'px';
    boardEl.style.setProperty('--bs', s + 'px');
    if (board) render();
  }
  window.addEventListener('resize', fitBoard);
  fitBoard();
})();
