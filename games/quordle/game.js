(function () {
  'use strict';

  var attemptEl = document.getElementById('attempt-el');
  var solvedEl = document.getElementById('solved-el');
  var keyboardEl = document.getElementById('keyboard');
  var modalEl = document.getElementById('modal');
  var modalTitleEl = document.getElementById('modal-title');
  var modalWordsEl = document.getElementById('modal-words');
  var btnRestart = document.getElementById('btn-restart');

  var WORD_BANK = [
    'APPLE', 'BEACH', 'CHAIR', 'DREAM', 'EARTH', 'FLAME', 'GHOST', 'HEART',
    'LIGHT', 'MAGIC', 'NIGHT', 'OCEAN', 'PLANT', 'QUEEN', 'RIVER', 'STORM',
    'TRAIN', 'VOICE', 'WATER', 'YOUTH', 'BREAD', 'CLOCK', 'CLOUD', 'DANCE',
    'FRUIT', 'GRAPE', 'HOUSE', 'LEMON', 'MUSIC', 'PIANO', 'RADIO', 'SMILE'
  ];

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

      if (type === 'type') {
        osc.frequency.setValueAtTime(500, now);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'flip') {
        osc.frequency.setValueAtTime(320, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'win') {
        [523, 659, 783, 1046].forEach(function (f, i) {
          var o = actx.createOscillator();
          var g = actx.createGain();
          o.frequency.setValueAtTime(f, now + i * 0.1);
          g.gain.setValueAtTime(0.15, now + i * 0.1);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
          o.connect(g);
          g.connect(actx.destination);
          o.start(now + i * 0.1);
          o.stop(now + i * 0.1 + 0.3);
        });
      } else if (type === 'board_done') {
        [659, 880].forEach(function (f, i) {
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
      }
    } catch (e) {}
  }

  var MAX_ATTEMPTS = 9;
  var targetWords = [];
  var solvedStatus = [false, false, false, false];
  var guesses = []; // array of 5-letter strings
  var currentGuess = '';

  function resetGame() {
    var shuffled = WORD_BANK.slice().sort(function () { return Math.random() - 0.5; });
    targetWords = shuffled.slice(0, 4);
    solvedStatus = [false, false, false, false];
    guesses = [];
    currentGuess = '';
    modalEl.classList.add('hidden');

    for (var b = 0; b < 4; b++) {
      var bEl = document.getElementById('board-' + b);
      bEl.classList.remove('solved');
    }

    renderAllBoards();
    renderKeyboard();
    updateHUD();
  }

  function updateHUD() {
    var numSolved = solvedStatus.filter(Boolean).length;
    solvedEl.textContent = numSolved + ' / 4';
    var curAtt = Math.min(guesses.length + 1, MAX_ATTEMPTS);
    attemptEl.textContent = curAtt + ' / ' + MAX_ATTEMPTS;
  }

  function renderAllBoards() {
    for (var b = 0; b < 4; b++) {
      var boardEl = document.getElementById('board-' + b);
      boardEl.innerHTML = '';
      var target = targetWords[b];
      var isSolved = solvedStatus[b];

      for (var r = 0; r < MAX_ATTEMPTS; r++) {
        var rowEl = document.createElement('div');
        rowEl.className = 'board-row';

        var wordStr = '';
        var isEvaluated = false;

        if (r < guesses.length) {
          wordStr = guesses[r];
          isEvaluated = true;
        } else if (r === guesses.length && !isSolved) {
          wordStr = currentGuess;
        }

        for (var c = 0; c < 5; c++) {
          var cell = document.createElement('div');
          cell.className = 'board-cell';
          var char = wordStr.charAt(c) || '';
          cell.textContent = char;

          if (isEvaluated) {
            if (char === target.charAt(c)) {
              cell.classList.add('cell-correct');
            } else if (target.indexOf(char) >= 0) {
              cell.classList.add('cell-present');
            } else {
              cell.classList.add('cell-absent');
            }
          }
          rowEl.appendChild(cell);
        }
        boardEl.appendChild(rowEl);
      }
    }
  }

  function renderKeyboard() {
    keyboardEl.innerHTML = '';
    var rows = [
      ['Q','W','E','R','T','Y','U','I','O','P'],
      ['A','S','D','F','G','H','J','K','L'],
      ['⌫','Z','X','C','V','B','N','M','✔']
    ];

    rows.forEach(function (rList) {
      var rDiv = document.createElement('div');
      rDiv.className = 'kb-row';
      rList.forEach(function (k) {
        var btn = document.createElement('button');
        btn.className = 'kb-key';
        btn.textContent = k;
        btn.addEventListener('click', function () {
          handleInput(k);
        });
        rDiv.appendChild(btn);
      });
      keyboardEl.appendChild(rDiv);
    });
  }

  function handleInput(key) {
    getAudioCtx();
    if (solvedStatus.every(Boolean) || guesses.length >= MAX_ATTEMPTS) return;

    if (key === '⌫' || key === 'Backspace') {
      if (currentGuess.length > 0) {
        currentGuess = currentGuess.slice(0, -1);
        playSound('type');
        renderAllBoards();
      }
    } else if (key === '✔' || key === 'Enter') {
      if (currentGuess.length === 5) {
        submitGuess();
      }
    } else if (/^[A-Za-z]$/.test(key)) {
      if (currentGuess.length < 5) {
        currentGuess += key.toUpperCase();
        playSound('type');
        renderAllBoards();
      }
    }
  }

  function submitGuess() {
    guesses.push(currentGuess);
    playSound('flip');

    // Check newly solved boards
    for (var b = 0; b < 4; b++) {
      if (!solvedStatus[b] && currentGuess === targetWords[b]) {
        solvedStatus[b] = true;
        document.getElementById('board-' + b).classList.add('solved');
        playSound('board_done');
      }
    }

    currentGuess = '';
    renderAllBoards();
    updateHUD();

    if (solvedStatus.every(Boolean)) {
      playSound('win');
      modalTitleEl.textContent = '🎉 全盘告捷！四词尽收！';
      modalWordsEl.textContent = '谜底: ' + targetWords.join(', ');
      modalEl.classList.remove('hidden');
    } else if (guesses.length >= MAX_ATTEMPTS) {
      modalTitleEl.textContent = '💔 机会耗尽！';
      modalWordsEl.textContent = '正确谜底: ' + targetWords.join(', ');
      modalEl.classList.remove('hidden');
    }
  }

  btnRestart.addEventListener('click', resetGame);

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Backspace') handleInput('⌫');
    else if (e.key === 'Enter') handleInput('✔');
    else if (/^[a-zA-Z]$/.test(e.key)) handleInput(e.key);
  });

  resetGame();
})();
