(function () {
  'use strict';

  var levelEl = document.getElementById('level-el');
  var scoreEl = document.getElementById('score-el');
  var progressEl = document.getElementById('progress-el');
  var wordsBoard = document.getElementById('words-board');
  var currentWordBox = document.getElementById('current-word');
  var letterTilesEl = document.getElementById('letter-tiles');
  var btnShuffle = document.getElementById('btn-shuffle');
  var btnClear = document.getElementById('btn-clear');
  var btnSubmit = document.getElementById('btn-submit');

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

      if (type === 'tap') {
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'found') {
        [523.25, 659.25, 783.99].forEach(function (f, i) {
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
      } else if (type === 'err') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'win') {
        [523, 659, 783, 1046, 1318].forEach(function (f, i) {
          var o = actx.createOscillator();
          var g = actx.createGain();
          o.frequency.setValueAtTime(f, now + i * 0.1);
          g.gain.setValueAtTime(0.2, now + i * 0.1);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
          o.connect(g);
          g.connect(actx.destination);
          o.start(now + i * 0.1);
          o.stop(now + i * 0.1 + 0.3);
        });
      }
    } catch (e) {}
  }

  var PUZZLES = [
    {
      letters: ['P', 'L', 'A', 'N', 'E', 'T'],
      words: ['PLANET', 'PLANE', 'PLANT', 'PLATE', 'PANEL', 'LEAP', 'PALE', 'PLAN', 'LATE', 'NEAT', 'TAPE', 'NET', 'TEA', 'PAN', 'PEN', 'PET']
    },
    {
      letters: ['S', 'I', 'L', 'E', 'N', 'T'],
      words: ['SILENT', 'LISTEN', 'INLET', 'LINE', 'SITE', 'TIE', 'SET', 'LET', 'TIN', 'SIN', 'NET', 'LIT']
    },
    {
      letters: ['G', 'A', 'R', 'D', 'E', 'N'],
      words: ['GARDEN', 'DANGER', 'GRADE', 'RANGE', 'READ', 'DEAR', 'NEAR', 'EARN', 'RED', 'AGE', 'END']
    }
  ];

  var currentLevelIdx = 0;
  var currentScore = 0;
  var foundWords = [];
  var currentSelection = []; // array of { letter, index }
  var scrambledLetters = [];

  function loadLevel(idx) {
    currentLevelIdx = idx % PUZZLES.length;
    var puzzle = PUZZLES[currentLevelIdx];
    levelEl.textContent = currentLevelIdx + 1;
    foundWords = [];
    currentSelection = [];
    scrambledLetters = puzzle.letters.slice().sort(function () { return Math.random() - 0.5; });

    renderBoard();
    renderTiles();
    updateWordBox();
    updateProgress();
  }

  function renderBoard() {
    wordsBoard.innerHTML = '';
    var puzzle = PUZZLES[currentLevelIdx];
    puzzle.words.forEach(function (word) {
      var slot = document.createElement('div');
      slot.className = 'word-slot';
      if (foundWords.indexOf(word) >= 0) {
        slot.className += ' found';
        slot.textContent = word;
      } else {
        slot.textContent = word.replace(/./g, '—');
      }
      wordsBoard.appendChild(slot);
    });
  }

  function renderTiles() {
    letterTilesEl.innerHTML = '';
    scrambledLetters.forEach(function (char, idx) {
      var btn = document.createElement('button');
      btn.className = 'tile-btn';
      btn.textContent = char;
      var isUsed = currentSelection.some(function (s) { return s.index === idx; });
      if (isUsed) btn.classList.add('used');

      btn.addEventListener('click', function () {
        if (isUsed) {
          // Deselect
          currentSelection = currentSelection.filter(function (s) { return s.index !== idx; });
        } else {
          // Select
          currentSelection.push({ letter: char, index: idx });
          playSound('tap');
        }
        renderTiles();
        updateWordBox();
      });
      letterTilesEl.appendChild(btn);
    });
  }

  function updateWordBox() {
    var str = currentSelection.map(function (s) { return s.letter; }).join('');
    currentWordBox.textContent = str;
  }

  function updateProgress() {
    var total = PUZZLES[currentLevelIdx].words.length;
    progressEl.textContent = foundWords.length + ' / ' + total;
    scoreEl.textContent = currentScore;
  }

  function submitCurrentWord() {
    getAudioCtx();
    var word = currentSelection.map(function (s) { return s.letter; }).join('');
    if (!word) return;

    var puzzle = PUZZLES[currentLevelIdx];
    if (puzzle.words.indexOf(word) >= 0) {
      if (foundWords.indexOf(word) === -1) {
        // New word found!
        foundWords.push(word);
        currentScore += word.length * 10;
        playSound('found');
        currentSelection = [];
        renderBoard();
        renderTiles();
        updateWordBox();
        updateProgress();

        if (foundWords.length >= puzzle.words.length) {
          playSound('win');
          setTimeout(function () {
            alert('🎉 恭喜通关！解锁下一个单词挑战！');
            loadLevel(currentLevelIdx + 1);
          }, 300);
        }
      } else {
        playSound('err');
        flashCurrent('已经拼出过啦！');
      }
    } else {
      playSound('err');
      flashCurrent('不是有效目标词汇！');
    }
  }

  function flashCurrent(msg) {
    var orig = currentWordBox.textContent;
    currentWordBox.textContent = msg;
    currentWordBox.style.color = '#ef4444';
    setTimeout(function () {
      currentWordBox.textContent = orig;
      currentWordBox.style.color = '#facc15';
    }, 800);
  }

  btnShuffle.addEventListener('click', function () {
    scrambledLetters.sort(function () { return Math.random() - 0.5; });
    renderTiles();
  });

  btnClear.addEventListener('click', function () {
    currentSelection = [];
    renderTiles();
    updateWordBox();
  });

  btnSubmit.addEventListener('click', submitCurrentWord);

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      submitCurrentWord();
    } else if (e.key === 'Backspace') {
      if (currentSelection.length > 0) {
        currentSelection.pop();
        renderTiles();
        updateWordBox();
      }
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      var char = e.key.toUpperCase();
      // Find unused tile with this char
      for (var i = 0; i < scrambledLetters.length; i++) {
        if (scrambledLetters[i] === char && !currentSelection.some(function (s) { return s.index === i; })) {
          currentSelection.push({ letter: char, index: i });
          playSound('tap');
          renderTiles();
          updateWordBox();
          break;
        }
      }
    }
  });

  loadLevel(0);
})();
