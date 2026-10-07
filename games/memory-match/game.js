(function () {
  'use strict';

  var STORAGE_KEY = 'omg:save:memory-match';

  var ICONS = [
    '🐶', '🐱', '🦊', '🐻', '🐼', '🦁', '🐯', '🐰',
    '🐸', '🐵', '🦄', '🐝', '🐙', '🐬', '🦉', '🦋',
    '🐢', '🦀', '🚀', '🛸', '🎮', '💎', '🍎', '🍉'
  ];

  // DOM
  var boardEl = document.getElementById('board');
  var diffSelect = document.getElementById('diffSelect');
  var flipCountEl = document.getElementById('flipCount');
  var timerTextEl = document.getElementById('timerText');
  var soundBtn = document.getElementById('soundBtn');
  var restartBtn = document.getElementById('restartBtn');

  var modal = document.getElementById('mmModal');
  var modalEmoji = document.getElementById('modalEmoji');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  // State
  var difficulty = '4x4';
  var cards = []; // array of { id, icon, matched, flipped }
  var flippedCards = [];
  var isChecking = false;
  var flipCount = 0;
  var timerSeconds = 0;
  var timerInterval = null;
  var isGameOver = false;
  var soundEnabled = true;

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

  function playSound(type) {
    if (!soundEnabled) return;
    var ctxA = getAudioCtx();
    if (!ctxA) return;
    var t = ctxA.currentTime;

    if (type === 'flip') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(540, t + 0.05);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    } else if (type === 'match') {
      [587.33, 880].forEach(function (freq, i) {
        var osc = ctxA.createOscillator();
        var gain = ctxA.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.08);
        gain.gain.setValueAtTime(0.3, t + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.08 + 0.15);
        osc.connect(gain);
        gain.connect(ctxA.destination);
        osc.start(t + i * 0.08);
        osc.stop(t + i * 0.08 + 0.16);
      });
    } else if (type === 'mismatch') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.1);
      gain.gain.setValueAtTime(0.18, t);
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

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function initGame() {
    var totalCards = 16;
    if (difficulty === '6x4') totalCards = 24;
    else if (difficulty === '6x6') totalCards = 36;

    var numPairs = totalCards / 2;
    var chosenIcons = shuffle(ICONS.slice()).slice(0, numPairs);
    var deck = [];

    chosenIcons.forEach(function (icon, idx) {
      deck.push({ id: idx * 2, icon: icon, matched: false, flipped: false });
      deck.push({ id: idx * 2 + 1, icon: icon, matched: false, flipped: false });
    });

    cards = shuffle(deck);
    flippedCards = [];
    isChecking = false;
    flipCount = 0;
    timerSeconds = 0;
    isGameOver = false;

    updateUI();
    renderBoard();
    hideModal();
    startTimer();
    saveState();
  }

  function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(function () {
      if (!isGameOver) {
        timerSeconds++;
        updateTimerDisplay();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    var m = Math.floor(timerSeconds / 60);
    var s = timerSeconds % 60;
    timerTextEl.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function updateUI() {
    flipCountEl.textContent = flipCount;
    updateTimerDisplay();
  }

  function renderBoard() {
    boardEl.innerHTML = '';

    if (difficulty === '4x4') {
      boardEl.style.gridTemplateColumns = 'repeat(4, 1fr)';
      boardEl.style.gridTemplateRows = 'repeat(4, 1fr)';
    } else if (difficulty === '6x4') {
      boardEl.style.gridTemplateColumns = 'repeat(4, 1fr)';
      boardEl.style.gridTemplateRows = 'repeat(6, 1fr)';
    } else {
      boardEl.style.gridTemplateColumns = 'repeat(6, 1fr)';
      boardEl.style.gridTemplateRows = 'repeat(6, 1fr)';
    }

    cards.forEach(function (card, idx) {
      var cardEl = document.createElement('div');
      cardEl.className = 'mm-card';
      cardEl.dataset.idx = idx;

      if (card.flipped || card.matched) {
        cardEl.classList.add('flipped');
      }
      if (card.matched) {
        cardEl.classList.add('matched');
      }

      cardEl.innerHTML = '<div class="card-inner">' +
        '<div class="card-back"></div>' +
        '<div class="card-front">' + card.icon + '</div>' +
        '</div>';

      boardEl.appendChild(cardEl);
    });
  }

  function handleCardClick(idx) {
    if (isChecking || isGameOver) return;
    var card = cards[idx];
    if (card.flipped || card.matched) return;

    card.flipped = true;
    flippedCards.push(idx);
    playSound('flip');
    renderBoard();

    if (flippedCards.length === 2) {
      flipCount++;
      updateUI();
      checkPair();
    }
  }

  function checkPair() {
    isChecking = true;
    var idx1 = flippedCards[0];
    var idx2 = flippedCards[1];
    var card1 = cards[idx1];
    var card2 = cards[idx2];

    if (card1.icon === card2.icon) {
      // Match!
      card1.matched = true;
      card2.matched = true;
      flippedCards = [];
      isChecking = false;
      playSound('match');
      renderBoard();
      checkVictory();
      saveState();
    } else {
      // Mismatch
      playSound('mismatch');
      setTimeout(function () {
        card1.flipped = false;
        card2.flipped = false;
        flippedCards = [];
        isChecking = false;
        renderBoard();
        saveState();
      }, 700);
    }
  }

  function checkVictory() {
    var allMatched = cards.every(function (c) { return c.matched; });
    if (allMatched) {
      isGameOver = true;
      clearInterval(timerInterval);
      playSound('win');

      modalEmoji.textContent = '🎉';
      modalTitle.textContent = '记忆大师！顺利通关！';
      modalDesc.textContent = '用时 ' + timerTextEl.textContent + ' · 翻牌 ' + flipCount + ' 次完成全部配对！';
      setTimeout(function () {
        modal.classList.add('show');
      }, 500);
    }
  }

  function hideModal() {
    modal.classList.remove('show');
  }

  function saveState() {
    try {
      var state = {
        difficulty: difficulty,
        cards: cards,
        flipCount: flipCount,
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
        if (state && Array.isArray(state.cards)) {
          difficulty = state.difficulty || '4x4';
          cards = state.cards;
          flipCount = state.flipCount || 0;
          timerSeconds = state.timerSeconds || 0;
          isGameOver = !!state.isGameOver;
          diffSelect.value = difficulty;
          updateUI();
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
    var cardEl = e.target.closest('.mm-card');
    if (!cardEl) return;
    var idx = parseInt(cardEl.dataset.idx, 10);
    handleCardClick(idx);
  });

  diffSelect.addEventListener('change', function () {
    difficulty = diffSelect.value;
    initGame();
  });

  restartBtn.addEventListener('click', initGame);
  modalRestartBtn.addEventListener('click', initGame);

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  // Init
  if (!loadState()) {
    initGame();
  }
})();
