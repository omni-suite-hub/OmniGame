/**
 * OmniGame - 打字测速 (Monkeytype)
 * Pure vanilla JS, mechanical switch SFX, live caret tracking, WPM & accuracy stats.
 */
(function () {
  'use strict';

  // --- Audio Synthesizer (Mechanical Key Switch Sounds) ---
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
    keyPress: function (isSpace) {
      if (!this.enabled || !this.ctx) return;
      try {
        var now = this.ctx.currentTime;
        var osc = this.ctx.createOscillator();
        var gain = this.ctx.createGain();
        osc.type = 'triangle';
        var freq = isSpace ? (280 + Math.random() * 40) : (440 + Math.random() * 60);
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.035);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.035);
      } catch (e) {}
    },
    errorTick: function () {
      if (!this.enabled || !this.ctx) return;
      try {
        var now = this.ctx.currentTime;
        var osc = this.ctx.createOscillator();
        var gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
      } catch (e) {}
    },
    finishChime: function () {
      if (!this.enabled || !this.ctx) return;
      var notes = [523.25, 659.25, 783.99, 1046.5];
      var self = this;
      notes.forEach(function (f, i) {
        try {
          var now = self.ctx.currentTime + i * 0.08;
          var osc = self.ctx.createOscillator();
          var gain = self.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, now);
          gain.gain.setValueAtTime(0.18, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
          osc.connect(gain);
          gain.connect(self.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.3);
        } catch (e) {}
      });
    }
  };

  // --- Word Bank ---
  var WORD_BANK = [
    'the', 'be', 'of', 'and', 'a', 'to', 'in', 'he', 'have', 'it', 'that', 'for', 'they', 'with', 'as', 'not',
    'on', 'she', 'at', 'by', 'this', 'we', 'you', 'do', 'but', 'his', 'from', 'they', 'say', 'her', 'or', 'an',
    'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who',
    'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
    'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now',
    'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work',
    'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
    'code', 'fast', 'type', 'game', 'space', 'light', 'focus', 'clean', 'world', 'power', 'logic', 'style',
    'build', 'share', 'music', 'apple', 'water', 'dream', 'night', 'quick', 'quiet', 'smart', 'super', 'smile'
  ];

  // --- DOM Elements ---
  var elements = {
    wordsContainer: document.getElementById('wordsContainer'),
    wordsList: document.getElementById('wordsList'),
    caret: document.getElementById('caret'),
    hiddenInput: document.getElementById('hiddenInput'),
    wpmText: document.getElementById('wpmText'),
    accText: document.getElementById('accText'),
    timeLeftText: document.getElementById('timeLeftText'),
    soundBtn: document.getElementById('soundBtn'),
    restartBtn: document.getElementById('restartBtn'),
    modeBtns: Array.from(document.querySelectorAll('.mode-btn')),
    modal: document.getElementById('resultModal'),
    modalWpm: document.getElementById('modalWpm'),
    modalAcc: document.getElementById('modalAcc'),
    modalChars: document.getElementById('modalChars'),
    modalRestartBtn: document.getElementById('modalRestartBtn')
  };

  // --- Game State ---
  var state = {
    duration: 15, // seconds
    timeLeft: 15,
    isRunning: false,
    timerInterval: null,
    words: [],
    currentWordIndex: 0,
    currentInput: '',
    correctChars: 0,
    incorrectChars: 0,
    totalKeystrokes: 0,
    startTime: 0
  };

  // --- Shuffle Words ---
  function generateWords(count) {
    var words = [];
    for (var i = 0; i < count; i++) {
      var rand = WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)];
      words.push(rand);
    }
    return words;
  }

  // --- Initialize Test ---
  function initTest() {
    AudioSys.init();
    clearInterval(state.timerInterval);
    state.isRunning = false;
    state.timeLeft = state.duration;
    state.currentWordIndex = 0;
    state.currentInput = '';
    state.correctChars = 0;
    state.incorrectChars = 0;
    state.totalKeystrokes = 0;
    state.words = generateWords(60);

    elements.timeLeftText.textContent = state.timeLeft + 's';
    elements.wpmText.textContent = '0';
    elements.accText.textContent = '100%';
    elements.modal.classList.remove('active');

    renderWords();
    updateCaret();
    focusInput();
  }

  function focusInput() {
    elements.hiddenInput.value = '';
    elements.hiddenInput.focus();
  }

  // --- Render Words & Letters ---
  function renderWords() {
    elements.wordsList.innerHTML = '';
    state.words.forEach(function (wordStr, wIdx) {
      var wordEl = document.createElement('div');
      wordEl.className = 'word' + (wIdx === state.currentWordIndex ? ' active' : '');
      wordEl.id = 'word-' + wIdx;

      for (var l = 0; l < wordStr.length; l++) {
        var letterSpan = document.createElement('span');
        letterSpan.className = 'letter';
        letterSpan.textContent = wordStr[l];
        wordEl.appendChild(letterSpan);
      }
      elements.wordsList.appendChild(wordEl);
    });
  }

  // --- Update Caret Position ---
  function updateCaret() {
    var activeWordEl = document.getElementById('word-' + state.currentWordIndex);
    if (!activeWordEl) return;

    var letterEls = activeWordEl.querySelectorAll('.letter');
    var targetIdx = state.currentInput.length;

    var containerRect = elements.wordsContainer.getBoundingClientRect();

    if (targetIdx < letterEls.length) {
      var targetLetter = letterEls[targetIdx];
      var rect = targetLetter.getBoundingClientRect();
      elements.caret.style.left = (rect.left - containerRect.left) + 'px';
      elements.caret.style.top = (rect.top - containerRect.top + 2) + 'px';
      elements.caret.style.height = (rect.height - 4) + 'px';
    } else {
      // At the end of the word
      var lastLetter = letterEls[letterEls.length - 1];
      if (lastLetter) {
        var lRect = lastLetter.getBoundingClientRect();
        elements.caret.style.left = (lRect.right - containerRect.left) + 'px';
        elements.caret.style.top = (lRect.top - containerRect.top + 2) + 'px';
        elements.caret.style.height = (lRect.height - 4) + 'px';
      }
    }

    // Scroll line if needed
    var wordTop = activeWordEl.offsetTop;
    if (wordTop > 70) {
      elements.wordsList.style.transform = 'translateY(-' + (wordTop - 20) + 'px)';
    } else {
      elements.wordsList.style.transform = 'translateY(0px)';
    }
  }

  // --- Keystroke Handler ---
  function startTimer() {
    state.isRunning = true;
    state.startTime = Date.now();
    state.timerInterval = setInterval(function () {
      state.timeLeft--;
      elements.timeLeftText.textContent = state.timeLeft + 's';
      calculateStats();

      if (state.timeLeft <= 0) {
        finishTest();
      }
    }, 1000);
  }

  function calculateStats() {
    var elapsedSec = Math.max(1, state.duration - state.timeLeft);
    var elapsedMin = elapsedSec / 60;
    var wpm = Math.round((state.correctChars / 5) / elapsedMin);
    var total = state.correctChars + state.incorrectChars;
    var acc = total > 0 ? Math.round((state.correctChars / total) * 100) : 100;

    elements.wpmText.textContent = Math.max(0, wpm);
    elements.accText.textContent = acc + '%';
  }

  function handleKeyInput(e) {
    if (state.timeLeft <= 0) return;

    var key = e.key;

    // Restart shortcut
    if (key === 'Tab') {
      e.preventDefault();
      initTest();
      return;
    }

    // Start timer on first printable keystroke
    if (!state.isRunning && (key.length === 1 || key === ' ')) {
      startTimer();
    }

    var activeWordStr = state.words[state.currentWordIndex];
    var activeWordEl = document.getElementById('word-' + state.currentWordIndex);
    if (!activeWordEl) return;

    // --- Backspace ---
    if (key === 'Backspace') {
      e.preventDefault();
      if (state.currentInput.length > 0) {
        AudioSys.keyPress(false);
        state.currentInput = state.currentInput.slice(0, -1);
        renderCurrentWordState();
        updateCaret();
      }
      return;
    }

    // --- Space: Finish Word ---
    if (key === ' ') {
      e.preventDefault();
      if (state.currentInput.length === 0) return; // Prevent double space
      AudioSys.keyPress(true);

      // Check remaining missing letters in current word
      for (var m = state.currentInput.length; m < activeWordStr.length; m++) {
        state.incorrectChars++;
      }

      state.currentWordIndex++;
      state.currentInput = '';

      // Append more words if running out
      if (state.currentWordIndex >= state.words.length - 10) {
        state.words = state.words.concat(generateWords(30));
        renderWords();
      }

      // Update active word class
      var prevWordEl = document.getElementById('word-' + (state.currentWordIndex - 1));
      if (prevWordEl) prevWordEl.classList.remove('active');
      var nextWordEl = document.getElementById('word-' + state.currentWordIndex);
      if (nextWordEl) nextWordEl.classList.add('active');

      calculateStats();
      updateCaret();
      return;
    }

    // --- Single Printable Character ---
    if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      state.totalKeystrokes++;
      var curIdx = state.currentInput.length;
      var expectedChar = activeWordStr[curIdx];

      if (expectedChar && key === expectedChar) {
        state.correctChars++;
        AudioSys.keyPress(false);
      } else {
        state.incorrectChars++;
        AudioSys.errorTick();
      }

      state.currentInput += key;
      renderCurrentWordState();
      calculateStats();
      updateCaret();
    }
  }

  function renderCurrentWordState() {
    var activeWordStr = state.words[state.currentWordIndex];
    var activeWordEl = document.getElementById('word-' + state.currentWordIndex);
    if (!activeWordEl) return;

    activeWordEl.innerHTML = '';
    var maxLen = Math.max(activeWordStr.length, state.currentInput.length);

    for (var i = 0; i < maxLen; i++) {
      var span = document.createElement('span');
      span.className = 'letter';

      if (i < state.currentInput.length && i < activeWordStr.length) {
        if (state.currentInput[i] === activeWordStr[i]) {
          span.classList.add('correct');
        } else {
          span.classList.add('incorrect');
        }
        span.textContent = activeWordStr[i];
      } else if (i < activeWordStr.length) {
        span.textContent = activeWordStr[i];
      } else {
        // Extra letters beyond target word
        span.classList.add('extra');
        span.textContent = state.currentInput[i];
      }
      activeWordEl.appendChild(span);
    }
  }

  function finishTest() {
    clearInterval(state.timerInterval);
    state.isRunning = false;
    AudioSys.finishChime();

    var elapsedMin = state.duration / 60;
    var wpm = Math.round((state.correctChars / 5) / elapsedMin);
    var total = state.correctChars + state.incorrectChars;
    var acc = total > 0 ? Math.round((state.correctChars / total) * 100) : 100;

    try {
      var best = parseInt(localStorage.getItem('omg:save:monkeytype') || '0', 10);
      if (wpm > best) {
        localStorage.setItem('omg:save:monkeytype', wpm.toString());
      }
    } catch (e) {}

    elements.modalWpm.textContent = wpm;
    elements.modalAcc.textContent = acc + '%';
    elements.modalChars.textContent = state.correctChars + ' / ' + state.incorrectChars;
    elements.modal.classList.add('active');
  }

  // --- Event Listeners ---
  elements.wordsContainer.addEventListener('click', focusInput);
  document.addEventListener('keydown', handleKeyInput);

  elements.soundBtn.addEventListener('click', function () {
    AudioSys.enabled = !AudioSys.enabled;
    elements.soundBtn.textContent = AudioSys.enabled ? '🔊' : '🔇';
    focusInput();
  });

  elements.restartBtn.addEventListener('click', initTest);
  elements.modalRestartBtn.addEventListener('click', initTest);

  elements.modeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      elements.modeBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      state.duration = parseInt(btn.dataset.time, 10);
      initTest();
    });
  });

  window.addEventListener('resize', updateCaret);

  // Initialize
  initTest();
})();
