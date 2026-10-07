(function () {
  'use strict';

  var roundEl = document.getElementById('round-el');
  var scoreEl = document.getElementById('score-el');
  var timerBar = document.getElementById('timer-bar');
  var chainFeed = document.getElementById('chain-feed');
  var targetLetterEl = document.getElementById('target-letter');
  var wordInput = document.getElementById('word-input');
  var btnSubmit = document.getElementById('btn-submit');
  var chipsRow = document.getElementById('chips-row');

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

      if (type === 'ok') {
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.exponentialRampToValueAtTime(784, now + 0.12);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'err') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch (e) {}
  }

  var DICTIONARY = [
    'APPLE', 'ANT', 'ARROW', 'ANIMAL', 'AIRPORT', 'AUTUMN',
    'BEE', 'BEAR', 'BALL', 'BIRD', 'BANANA', 'BREAD', 'BOAT',
    'CAT', 'CAR', 'CANDY', 'CLOUD', 'CROWN', 'CHAIR', 'CLOCK',
    'DOG', 'DUCK', 'DOOR', 'DREAM', 'DRAGON', 'DOLPHIN', 'DESK',
    'EGG', 'EAGLE', 'EARTH', 'ELEPHANT', 'ENGINE', 'ELBOW',
    'FISH', 'FOX', 'FROG', 'FRUIT', 'FOREST', 'FLOWER', 'FIRE',
    'GOAT', 'GRAPE', 'GHOST', 'GARDEN', 'GUITAR', 'GOLD',
    'HAT', 'HORSE', 'HOUSE', 'HEART', 'HONEY', 'HERO',
    'ICE', 'ISLAND', 'IRON', 'INSECT', 'IGLOO', 'INK',
    'JAM', 'JUICE', 'JACKET', 'JUNGLE', 'JUMP', 'JEWEL',
    'KITE', 'KING', 'KOALA', 'KEY', 'KANGAROO', 'KITCHEN',
    'LION', 'LEMON', 'LEAF', 'LIGHT', 'LAKE', 'LIZARD',
    'MOON', 'MONKEY', 'MUSIC', 'MOUSE', 'MAGIC', 'MOUNTAIN',
    'NEST', 'NIGHT', 'NOSE', 'NUT', 'NATURE', 'NEEDLE',
    'OWL', 'ORANGE', 'OCEAN', 'ONION', 'OASIS', 'OCTOPUS',
    'PIG', 'PENCIL', 'PIANO', 'PEACH', 'PLANET', 'PENGUIN',
    'QUEEN', 'QUIET', 'QUICK', 'QUILT', 'QUEST',
    'RABBIT', 'RAIN', 'RING', 'RIVER', 'ROBOT', 'ROCKET',
    'SUN', 'STAR', 'SNAKE', 'SNOW', 'STORM', 'SHADOW', 'SWORD',
    'TIGER', 'TREE', 'TRAIN', 'TURTLE', 'TABLE', 'TOOTH',
    'UMBRELLA', 'UNICORN', 'UNCLE', 'UNIFORM', 'UNDER',
    'VAN', 'VOICE', 'VIOLIN', 'VALLEY', 'VOLCANO', 'VASE',
    'WOLF', 'WATER', 'WIND', 'WHALE', 'WINTER', 'WINDOW',
    'XRAY', 'XYLOPHONE',
    'YACHT', 'YAK', 'YELLOW', 'YOUTH', 'YOGURT',
    'ZEBRA', 'ZERO', 'ZOO', 'ZONE', 'ZIPPER'
  ];

  var usedWords = [];
  var currentWord = 'PLANET';
  var score = 0;
  var round = 1;
  var timer = null;
  var timeLeft = 15;
  var TOTAL_TIME = 15;

  function addItem(sender, word) {
    var div = document.createElement('div');
    div.className = 'chain-item ' + (sender === 'user' ? 'chain-user' : 'chain-bot');
    div.textContent = (sender === 'user' ? '👤 你: ' : '🤖 对方: ') + word;
    chainFeed.appendChild(div);
    chainFeed.scrollTop = chainFeed.scrollHeight;
  }

  function startTurn() {
    var lastChar = currentWord.slice(-1).toUpperCase();
    targetLetterEl.textContent = lastChar;
    wordInput.value = '';
    wordInput.focus();

    // Render 3 suggestion chips
    chipsRow.innerHTML = '';
    var candidates = DICTIONARY.filter(function (w) {
      return w.charAt(0) === lastChar && usedWords.indexOf(w) === -1;
    });

    candidates.slice(0, 3).forEach(function (cand) {
      var btn = document.createElement('button');
      btn.className = 'chip-btn';
      btn.textContent = cand;
      btn.addEventListener('click', function () {
        wordInput.value = cand;
        submitWord();
      });
      chipsRow.appendChild(btn);
    });

    resetTimer();
  }

  function resetTimer() {
    clearInterval(timer);
    timeLeft = TOTAL_TIME;
    timerBar.style.width = '100%';
    timerBar.style.background = '#22c55e';

    timer = setInterval(function () {
      timeLeft -= 0.1;
      var pct = Math.max(0, (timeLeft / TOTAL_TIME) * 100);
      timerBar.style.width = pct + '%';
      if (pct < 30) timerBar.style.background = '#ef4444';
      else if (pct < 60) timerBar.style.background = '#f59e0b';

      if (timeLeft <= 0) {
        clearInterval(timer);
        playSound('err');
        alert('⏱️ 思考超时！接龙中断，重新开局！');
        initGame();
      }
    }, 100);
  }

  function submitWord() {
    getAudioCtx();
    var val = wordInput.value.trim().toUpperCase();
    if (!val) return;

    var targetChar = currentWord.slice(-1).toUpperCase();
    if (val.charAt(0) !== targetChar) {
      playSound('err');
      alert('首字母必须是「' + targetChar + '」！');
      return;
    }

    if (usedWords.indexOf(val) >= 0) {
      playSound('err');
      alert('「' + val + '」已经在此局中出现过了！');
      return;
    }

    if (DICTIONARY.indexOf(val) === -1 && val.length < 3) {
      playSound('err');
      alert('词库中未检索到该单词，请输入常用英文单词！');
      return;
    }

    // Success!
    playSound('ok');
    clearInterval(timer);
    usedWords.push(val);
    currentWord = val;
    addItem('user', val);
    score += val.length * 10;
    round++;
    scoreEl.textContent = score;
    roundEl.textContent = round;

    // Bot reply
    setTimeout(function () {
      var botTarget = currentWord.slice(-1).toUpperCase();
      var botPicks = DICTIONARY.filter(function (w) {
        return w.charAt(0) === botTarget && usedWords.indexOf(w) === -1;
      });

      if (botPicks.length > 0) {
        var pick = botPicks[Math.floor(Math.random() * botPicks.length)];
        usedWords.push(pick);
        currentWord = pick;
        addItem('bot', pick);
        startTurn();
      } else {
        playSound('ok');
        alert('🤖 对方词穷认输！你赢得了接龙大师称号！');
        initGame();
      }
    }, 700);
  }

  btnSubmit.addEventListener('click', submitWord);

  wordInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      submitWord();
    }
  });

  function initGame() {
    usedWords = ['PLANET'];
    currentWord = 'PLANET';
    score = 0;
    round = 1;
    scoreEl.textContent = 0;
    roundEl.textContent = 1;
    chainFeed.innerHTML = '';
    addItem('bot', currentWord);
    startTurn();
  }

  initGame();
})();
