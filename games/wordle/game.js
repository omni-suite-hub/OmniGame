(function () {
  'use strict';

  var STORAGE_KEY = 'omg:save:wordle';
  var STATS_KEY = 'omg:stats:wordle';

  var WORDS = [
    'ABOUT', 'ABOVE', 'ACUTE', 'ADMIT', 'ADOPT', 'ADULT', 'AFTER', 'AGAIN', 'AGENT', 'AGREE',
    'AHEAD', 'ALARM', 'ALBUM', 'ALERT', 'ALIKE', 'ALIVE', 'ALLOW', 'ALONE', 'ALONG', 'ALTER',
    'AMONG', 'ANGER', 'ANGLE', 'ANGRY', 'APART', 'APPLE', 'APPLY', 'ARENA', 'ARGUE', 'ARISE',
    'ARRAY', 'ARROW', 'ASIDE', 'ASSET', 'AUDIO', 'AUDIT', 'AVOID', 'AWARD', 'AWARE', 'BADGE',
    'BAKER', 'BASIC', 'BASIS', 'BEACH', 'BEAST', 'BEGIN', 'BEING', 'BELOW', 'BENCH', 'BIRTH',
    'BLACK', 'BLAME', 'BLIND', 'BLOCK', 'BLOOD', 'BOARD', 'BOOST', 'BRAIN', 'BRAND', 'BREAD',
    'BREAK', 'BRIEF', 'BRING', 'BROAD', 'BROWN', 'BUILD', 'BUYER', 'CABIN', 'CABLE', 'CANDY',
    'CATCH', 'CAUSE', 'CHAIN', 'CHAIR', 'CHART', 'CHASE', 'CHEAP', 'CHECK', 'CHEST', 'CHIEF',
    'CHILD', 'CHINA', 'CHOSE', 'CIVIL', 'CLAIM', 'CLASS', 'CLEAN', 'CLEAR', 'CLICK', 'CLOCK',
    'CLOSE', 'CLOUD', 'COACH', 'COAST', 'COULD', 'COUNT', 'COURT', 'COVER', 'CRAFT', 'CRANE',
    'CRASH', 'CRAZY', 'CREAM', 'CRIME', 'CROSS', 'CROWD', 'CROWN', 'CURVE', 'CYCLE', 'DAILY',
    'DANCE', 'DEATH', 'DEBUT', 'DELAY', 'DEPTH', 'DEVIL', 'DIRTY', 'DISCO', 'DOUBT', 'DRAFT',
    'DRAMA', 'DREAM', 'DRESS', 'DRIFT', 'DRINK', 'DRIVE', 'DYING', 'EAGER', 'EARLY', 'EARTH',
    'EIGHT', 'ELITE', 'EMPTY', 'ENEMY', 'ENJOY', 'ENTER', 'ENTRY', 'EQUAL', 'ERROR', 'EVENT',
    'EXACT', 'EXIST', 'EXTRA', 'FAITH', 'FALSE', 'FAULT', 'FIBER', 'FIELD', 'FIFTH', 'FIFTY',
    'FIGHT', 'FINAL', 'FIRST', 'FLAME', 'FLASH', 'FLEET', 'FLOAT', 'FLOOR', 'FLUID', 'FOCUS',
    'FORCE', 'FORTH', 'FORTY', 'FOUND', 'FRAME', 'FRESH', 'FRONT', 'FRUIT', 'GIANT', 'GIVEN',
    'GLASS', 'GLOBE', 'GLORY', 'GRACE', 'GRADE', 'GRAND', 'GRANT', 'GRAPE', 'GRASS', 'GREAT',
    'GREEN', 'GREET', 'GRIEF', 'GROUP', 'GUARD', 'GUESS', 'GUEST', 'GUIDE', 'HABIT', 'HAPPY',
    'HEART', 'HEAVY', 'HONEY', 'HORSE', 'HOTEL', 'HOUSE', 'HUMAN', 'IDEAL', 'IMAGE', 'INDEX',
    'INNER', 'INPUT', 'ISSUE', 'JELLY', 'JEWEL', 'JOINT', 'JUDGE', 'JUICE', 'KNIFE', 'KNOCK',
    'LABOR', 'LASER', 'LATER', 'LAUGH', 'LAYER', 'LEARN', 'LEASE', 'LEAST', 'LEAVE', 'LEGAL',
    'LEVEL', 'LIGHT', 'LIMIT', 'LOCAL', 'LOGIC', 'LOOSE', 'LUCKY', 'LUNCH', 'MAGIC', 'MAJOR',
    'MAKER', 'MARCH', 'MATCH', 'MAYOR', 'MEDIA', 'METAL', 'MIGHT', 'MINOR', 'MODEL', 'MONEY',
    'MONTH', 'MORAL', 'MOTOR', 'MOUNT', 'MOUSE', 'MOUTH', 'MOVIE', 'MUSIC', 'NAKED', 'NERVE',
    'NEVER', 'NIGHT', 'NOBLE', 'NOISE', 'NORTH', 'NOTED', 'NOVEL', 'NURSE', 'OCEAN', 'OFFER',
    'OFTEN', 'ORDER', 'OTHER', 'OUGHT', 'PAINT', 'PANEL', 'PAPER', 'PARTY', 'PEACE', 'PENNY',
    'PHASE', 'PHONE', 'PHOTO', 'PIECE', 'PILOT', 'PITCH', 'PIZZA', 'PLACE', 'PLAIN', 'PLANE',
    'PLANT', 'PLATE', 'POINT', 'POUND', 'POWER', 'PRESS', 'PRICE', 'PRIDE', 'PRIME', 'PRINT',
    'PRIOR', 'PRIZE', 'PROOF', 'PROUD', 'PROVE', 'QUEEN', 'QUICK', 'QUIET', 'QUITE', 'RADIO',
    'RAISE', 'RANGE', 'RAPID', 'RATIO', 'REACH', 'REACT', 'READY', 'RIGHT', 'RIVAL', 'RIVER',
    'ROBOT', 'ROUND', 'ROUTE', 'ROYAL', 'RULER', 'SCALE', 'SCENE', 'SCOPE', 'SCORE', 'SENSE',
    'SERVE', 'SEVEN', 'SHALL', 'SHAPE', 'SHARE', 'SHARP', 'SHEET', 'SHELF', 'SHELL', 'SHIFT',
    'SHINE', 'SHIRT', 'SHOCK', 'SHOOT', 'SHORT', 'SHOWN', 'SIGHT', 'SINCE', 'SIXTY', 'SKILL',
    'SLEEP', 'SLIDE', 'SMALL', 'SMART', 'SMILE', 'SMOKE', 'SOLID', 'SOLVE', 'SORRY', 'SOUND',
    'SOUTH', 'SPACE', 'SPARE', 'SPEAK', 'SPEED', 'SPEND', 'SPICE', 'SPORT', 'STAFF', 'STAGE',
    'STAKE', 'STAND', 'START', 'STATE', 'STEAM', 'STEEL', 'STICK', 'STILL', 'STOCK', 'STONE',
    'STORE', 'STORM', 'STORY', 'STRIP', 'STUDY', 'STUFF', 'STYLE', 'SUGAR', 'SUITE', 'SUPER',
    'SWEET', 'TABLE', 'TAKEN', 'TASTE', 'TEACH', 'THANK', 'THEME', 'THERE', 'THICK', 'THING',
    'THINK', 'THIRD', 'THOSE', 'THREE', 'THROW', 'TIGER', 'TIGHT', 'TIMES', 'TIRED', 'TITLE',
    'TODAY', 'TOPIC', 'TOTAL', 'TOUCH', 'TOUGH', 'TOWER', 'TRACK', 'TRADE', 'TRAIN', 'TREAT',
    'TREND', 'TRIAL', 'TRIBE', 'TRUCK', 'TRULY', 'TRUST', 'TRUTH', 'TWICE', 'UNCLE', 'UNDER',
    'UNION', 'UNITY', 'UNTIL', 'UPPER', 'UPSET', 'URBAN', 'USAGE', 'USUAL', 'VALID', 'VALUE',
    'VIDEO', 'VIRUS', 'VISIT', 'VITAL', 'VOICE', 'WASTE', 'WATCH', 'WATER', 'WHEEL', 'WHERE',
    'WHICH', 'WHILE', 'WHITE', 'WHOLE', 'WHOSE', 'WOMAN', 'WORLD', 'WORRY', 'WORSE', 'WORST',
    'WORTH', 'WOULD', 'WOUND', 'WRITE', 'WRONG', 'YIELD', 'YOUNG', 'YOUTH', 'ZEBRA'
  ];

  var KB_LAYOUT = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE']
  ];

  // DOM
  var boardEl = document.getElementById('board');
  var statusBar = document.getElementById('statusBar');
  var kbRow1 = document.getElementById('kbRow1');
  var kbRow2 = document.getElementById('kbRow2');
  var kbRow3 = document.getElementById('kbRow3');
  var soundBtn = document.getElementById('soundBtn');
  var statsBtn = document.getElementById('statsBtn');
  var newWordBtn = document.getElementById('newWordBtn');

  var modal = document.getElementById('wdModal');
  var modalEmoji = document.getElementById('modalEmoji');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalActionBtn = document.getElementById('modalActionBtn');

  // State
  var targetWord = '';
  var guesses = []; // array of 5-letter strings
  var currentGuess = '';
  var isGameOver = false;
  var keyStatuses = {}; // key -> 'correct' | 'present' | 'absent'
  var soundEnabled = true;
  var stats = { played: 0, wins: 0, currentStreak: 0, maxStreak: 0 };

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

    if (type === 'key') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(480, t);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.04);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.05);
    } else if (type === 'flip') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(800, t + 0.06);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.07);
    } else if (type === 'error') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(140, t);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.13);
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

  function initGame() {
    targetWord = WORDS[Math.floor(Math.random() * WORDS.length)];
    guesses = [];
    currentGuess = '';
    isGameOver = false;
    keyStatuses = {};

    statusBar.className = 'wd-status-bar';
    statusBar.textContent = '猜出 5 个字母的目标英文单词，你有 6 次机会！';

    renderBoard();
    renderKeyboard();
    hideModal();
    saveState();
  }

  function renderBoard() {
    boardEl.innerHTML = '';

    for (var r = 0; r < 6; r++) {
      var rowEl = document.createElement('div');
      rowEl.className = 'wd-row';
      rowEl.id = 'row-' + r;

      var word = (r < guesses.length) ? guesses[r] : (r === guesses.length ? currentGuess : '');
      var evaluations = (r < guesses.length) ? evaluateGuess(guesses[r], targetWord) : null;

      for (var c = 0; c < 5; c++) {
        var tile = document.createElement('div');
        tile.className = 'wd-tile';
        var letter = word[c] || '';
        tile.textContent = letter;

        if (letter && r === guesses.length) {
          tile.classList.add('pop');
        }

        if (evaluations) {
          tile.classList.add(evaluations[c]);
        }

        rowEl.appendChild(tile);
      }

      boardEl.appendChild(rowEl);
    }
  }

  // Proper Wordle duplicate letter evaluation
  function evaluateGuess(guess, target) {
    var result = Array(5).fill('absent');
    var targetCounts = {};

    for (var i = 0; i < 5; i++) {
      var ch = target[i];
      targetCounts[ch] = (targetCounts[ch] || 0) + 1;
    }

    // First pass: mark correct (Green)
    for (var j = 0; j < 5; j++) {
      if (guess[j] === target[j]) {
        result[j] = 'correct';
        targetCounts[guess[j]]--;
      }
    }

    // Second pass: mark present (Yellow)
    for (var k = 0; k < 5; k++) {
      if (result[k] !== 'correct') {
        var gCh = guess[k];
        if (targetCounts[gCh] && targetCounts[gCh] > 0) {
          result[k] = 'present';
          targetCounts[gCh]--;
        }
      }
    }

    return result;
  }

  function renderKeyboard() {
    var rows = [kbRow1, kbRow2, kbRow3];
    rows.forEach(function (rowEl, rIdx) {
      rowEl.innerHTML = '';
      KB_LAYOUT[rIdx].forEach(function (k) {
        var btn = document.createElement('button');
        btn.className = 'kb-key';
        if (k === 'ENTER' || k === 'BACKSPACE') {
          btn.classList.add('wide');
          btn.textContent = (k === 'BACKSPACE') ? '⌫' : 'ENTER';
        } else {
          btn.textContent = k;
          if (keyStatuses[k]) {
            btn.classList.add(keyStatuses[k]);
          }
        }
        btn.dataset.key = k;
        rowEl.appendChild(btn);
      });
    });
  }

  function handleKey(key) {
    if (isGameOver) return;

    if (key === 'ENTER') {
      submitGuess();
    } else if (key === 'BACKSPACE') {
      if (currentGuess.length > 0) {
        currentGuess = currentGuess.slice(0, -1);
        playSound('key');
        renderBoard();
      }
    } else if (/^[A-Z]$/.test(key)) {
      if (currentGuess.length < 5) {
        currentGuess += key;
        playSound('key');
        renderBoard();
      }
    }
  }

  function submitGuess() {
    if (currentGuess.length < 5) {
      showError('字母不足 5 个！');
      shakeCurrentRow();
      return;
    }

    var evals = evaluateGuess(currentGuess, targetWord);

    // Update keyboard statuses
    for (var i = 0; i < 5; i++) {
      var letter = currentGuess[i];
      var status = evals[i];
      var prev = keyStatuses[letter];
      if (status === 'correct') {
        keyStatuses[letter] = 'correct';
      } else if (status === 'present' && prev !== 'correct') {
        keyStatuses[letter] = 'present';
      } else if (!prev) {
        keyStatuses[letter] = 'absent';
      }
    }

    guesses.push(currentGuess);
    var won = (currentGuess === targetWord);
    currentGuess = '';

    playSound('flip');
    renderBoard();
    renderKeyboard();
    saveState();

    if (won) {
      handleGameOver(true);
    } else if (guesses.length >= 6) {
      handleGameOver(false);
    }
  }

  function showError(msg) {
    statusBar.textContent = msg;
    statusBar.classList.add('error');
    playSound('error');
    setTimeout(function () {
      statusBar.textContent = '猜出 5 个字母的目标英文单词，你有 6 次机会！';
      statusBar.classList.remove('error');
    }, 1500);
  }

  function shakeCurrentRow() {
    var rowEl = document.getElementById('row-' + guesses.length);
    if (rowEl) {
      rowEl.classList.remove('shake');
      void rowEl.offsetWidth; // trigger reflow
      rowEl.classList.add('shake');
    }
  }

  function handleGameOver(won) {
    isGameOver = true;
    stats.played++;
    if (won) {
      stats.wins++;
      stats.currentStreak++;
      if (stats.currentStreak > stats.maxStreak) stats.maxStreak = stats.currentStreak;
      playSound('win');
      modalEmoji.textContent = '🎉';
      modalTitle.textContent = '精彩绝伦！猜中了！';
      modalDesc.textContent = '答案是：' + targetWord + '\n共用步数: ' + guesses.length + ' / 6 次尝试';
    } else {
      stats.currentStreak = 0;
      playSound('error');
      modalEmoji.textContent = '💡';
      modalTitle.textContent = '很遗憾！机会已用完';
      modalDesc.textContent = '正确答案是：<b>' + targetWord + '</b>\n吸取经验再试一局！';
    }

    saveStats();
    saveState();

    setTimeout(function () {
      modal.classList.add('show');
    }, 600);
  }

  function hideModal() {
    modal.classList.remove('show');
  }

  function showStatsModal() {
    var winRate = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
    modalEmoji.textContent = '📊';
    modalTitle.textContent = '个人战绩统计';
    modalDesc.textContent = '对局数: ' + stats.played + ' · 胜率: ' + winRate + '%\n当前连胜: ' + stats.currentStreak + ' · 最高连胜: ' + stats.maxStreak;
    modalActionBtn.textContent = '继续挑战';
    modalActionBtn.onclick = hideModal;
    modal.classList.add('show');
  }

  function saveStats() {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (e) {}
  }

  function loadStats() {
    try {
      var saved = localStorage.getItem(STATS_KEY);
      if (saved) stats = JSON.parse(saved);
    } catch (e) {}
  }

  function saveState() {
    try {
      var state = {
        targetWord: targetWord,
        guesses: guesses,
        keyStatuses: keyStatuses,
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
        if (state && state.targetWord && Array.isArray(state.guesses)) {
          targetWord = state.targetWord;
          guesses = state.guesses;
          keyStatuses = state.keyStatuses || {};
          isGameOver = !!state.isGameOver;
          renderBoard();
          renderKeyboard();
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // Event Listeners
  document.getElementById('keyboard').addEventListener('click', function (e) {
    var btn = e.target.closest('.kb-key');
    if (!btn) return;
    var key = btn.dataset.key;
    handleKey(key);
  });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      handleKey('ENTER');
    } else if (e.key === 'Backspace') {
      handleKey('BACKSPACE');
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      handleKey(e.key.toUpperCase());
    }
  });

  newWordBtn.addEventListener('click', initGame);
  modalActionBtn.addEventListener('click', function () {
    hideModal();
    initGame();
  });
  statsBtn.addEventListener('click', showStatsModal);

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  // Init
  loadStats();
  if (!loadState()) {
    initGame();
  }
})();
