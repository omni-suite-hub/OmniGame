// UNO (经典UNO纸牌) - OmniGame Engine
(function () {
  'use strict';

  var audioCtx = null;
  var soundEnabled = true;

  function initAudio() {
    if (!audioCtx) {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playTone(freq, dur, type, gain) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;
    try {
      var osc = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      g.gain.setValueAtTime(gain || 0.12, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (e) {}
  }

  function playCardSound() { playTone(440, 0.06, 'triangle', 0.1); }
  function playDrawSound() { playTone(350, 0.08, 'sine', 0.09); }
  function playSpecialSound() {
    playTone(550, 0.1, 'square', 0.15);
    setTimeout(function () { playTone(770, 0.15, 'square', 0.18); }, 80);
  }
  function playUnoSound() {
    [400, 600, 800].forEach(function (f, i) {
      setTimeout(function () { playTone(f, 0.12, 'sawtooth', 0.2); }, i * 90);
    });
  }
  function playWinSound() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { playTone(f, 0.25, 'triangle', 0.2); }, i * 110);
    });
  }

  var COLORS = ['red', 'blue', 'green', 'yellow'];
  var COLOR_ZH = { red: '红色', blue: '蓝色', green: '绿色', yellow: '黄色' };

  function createUnoDeck() {
    var deck = [];
    var uid = 1;

    COLORS.forEach(function (c) {
      // 0 once
      deck.push({ uid: uid++, color: c, val: '0', display: '0', type: 'number' });
      // 1-9 twice
      for (var n = 1; n <= 9; n++) {
        deck.push({ uid: uid++, color: c, val: String(n), display: String(n), type: 'number' });
        deck.push({ uid: uid++, color: c, val: String(n), display: String(n), type: 'number' });
      }
      // Special actions twice
      ['🚫', '🔄', '+2'].forEach(function (act) {
        deck.push({ uid: uid++, color: c, val: act, display: act, type: act === '+2' ? 'draw2' : (act === '🚫' ? 'skip' : 'reverse') });
        deck.push({ uid: uid++, color: c, val: act, display: act, type: act === '+2' ? 'draw2' : (act === '🚫' ? 'skip' : 'reverse') });
      });
    });

    // 4 Wild, 4 Wild Draw 4
    for (var w = 0; w < 4; w++) {
      deck.push({ uid: uid++, color: 'wild', val: '🌈', display: '🌈', type: 'wild' });
      deck.push({ uid: uid++, color: 'wild', val: '+4', display: '+4', type: 'wild4' });
    }

    // Shuffle
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = deck[i];
      deck[i] = deck[j];
      deck[j] = t;
    }
    return deck;
  }

  // State
  var drawPile = [];
  var discardPile = [];
  var playerHand = [];
  var botHands = [[], [], []]; // bot1 (left), bot2 (top), bot3 (right)
  var currentTurn = 0; // 0: Player, 1: Bot1, 2: Bot2, 3: Bot3
  var direction = 1; // 1: Clockwise, -1: Counter-clockwise
  var activeColor = 'red';
  var isGameOver = false;
  var pendingWildCard = null;

  // DOM
  var currentColorBadge = document.getElementById('currentColorBadge');
  var turnTextEl = document.getElementById('turnText');
  var directionTextEl = document.getElementById('directionText');
  var bot1CountEl = document.getElementById('bot1Count');
  var bot2CountEl = document.getElementById('bot2Count');
  var bot3CountEl = document.getElementById('bot3Count');
  var playerHandCountEl = document.getElementById('playerHandCount');
  var drawPileEl = document.getElementById('drawPile');
  var discardPileEl = document.getElementById('discardPile');
  var playerCardsEl = document.getElementById('playerCards');
  var colorPickerEl = document.getElementById('colorPicker');
  var unoShoutBtn = document.getElementById('unoShoutBtn');
  var restartBtn = document.getElementById('restartBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalTitleEl = document.getElementById('modalTitle');
  var modalDescEl = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');
  var soundBtn = document.getElementById('soundBtn');

  function initGame() {
    drawPile = createUnoDeck();
    discardPile = [];
    playerHand = [];
    botHands = [[], [], []];
    currentTurn = 0;
    direction = 1;
    isGameOver = false;
    pendingWildCard = null;
    modalEl.classList.remove('active');
    colorPickerEl.classList.remove('active');

    // Deal 7 cards each
    for (var i = 0; i < 7; i++) {
      playerHand.push(drawCard());
      botHands[0].push(drawCard());
      botHands[1].push(drawCard());
      botHands[2].push(drawCard());
    }

    // Top discard card must be a regular number card
    var firstCard = drawCard();
    while (firstCard.color === 'wild') {
      drawPile.unshift(firstCard);
      firstCard = drawCard();
    }
    discardPile.push(firstCard);
    activeColor = firstCard.color;

    updateUI();
  }

  function drawCard() {
    if (drawPile.length === 0) {
      // Reshuffle discard pile except top card
      var top = discardPile.pop();
      drawPile = discardPile;
      discardPile = [top];
      for (var i = drawPile.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = drawPile[i];
        drawPile[i] = drawPile[j];
        drawPile[j] = t;
      }
    }
    return drawPile.pop();
  }

  function topDiscard() {
    return discardPile[discardPile.length - 1];
  }

  function canPlay(card) {
    var top = topDiscard();
    if (card.color === 'wild') return true;
    if (card.color === activeColor) return true;
    if (card.val === top.val) return true;
    return false;
  }

  function updateUI() {
    currentColorBadge.textContent = COLOR_ZH[activeColor];
    currentColorBadge.className = 'color-badge color-' + activeColor;

    directionTextEl.textContent = direction === 1 ? '顺时针 ↻' : '逆时针 ↺';
    bot1CountEl.textContent = botHands[0].length + '张';
    bot2CountEl.textContent = botHands[1].length + '张';
    bot3CountEl.textContent = botHands[2].length + '张';
    playerHandCountEl.textContent = playerHand.length;

    var turnNames = ['你的回合', '选手一行动中...', '选手二行动中...', '选手三行动中...'];
    turnTextEl.textContent = turnNames[currentTurn];

    // Render Discard Pile
    discardPileEl.innerHTML = '';
    var top = topDiscard();
    if (top) {
      var dCard = document.createElement('div');
      var colorCls = top.color === 'wild' ? 'card-wild' : 'card-' + top.color;
      dCard.className = 'uno-card ' + colorCls;
      dCard.innerHTML = '<span class="uno-val-corner">' + top.display + '</span><span class="uno-val-center">' + top.display + '</span><span class="uno-val-corner" style="align-self:flex-end;">' + top.display + '</span>';
      discardPileEl.appendChild(dCard);
    }

    // Render Player Hand
    playerCardsEl.innerHTML = '';
    playerHand.forEach(function (c) {
      var pCard = document.createElement('div');
      var cCls = c.color === 'wild' ? 'card-wild' : 'card-' + c.color;
      pCard.className = 'uno-card ' + cCls;
      pCard.innerHTML = '<span class="uno-val-corner">' + c.display + '</span><span class="uno-val-center">' + c.display + '</span><span class="uno-val-corner" style="align-self:flex-end;">' + c.display + '</span>';
      pCard.addEventListener('click', function () {
        handlePlayerCardClick(c);
      });
      playerCardsEl.appendChild(pCard);
    });
  }

  function handlePlayerCardClick(card) {
    if (currentTurn !== 0 || isGameOver) return;
    initAudio();

    if (!canPlay(card)) {
      playTone(220, 0.1, 'sawtooth', 0.12);
      return;
    }

    // If wild, open color picker
    if (card.color === 'wild') {
      pendingWildCard = card;
      colorPickerEl.classList.add('active');
      return;
    }

    executePlay(0, card, card.color);
  }

  // Color picker choice
  document.querySelectorAll('.color-choice').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var chosenColor = btn.getAttribute('data-color');
      colorPickerEl.classList.remove('active');
      if (pendingWildCard) {
        var card = pendingWildCard;
        pendingWildCard = null;
        executePlay(0, card, chosenColor);
      }
    });
  });

  // Player clicks Draw Pile
  drawPileEl.addEventListener('click', function () {
    if (currentTurn !== 0 || isGameOver) return;
    initAudio();
    var drawn = drawCard();
    playerHand.push(drawn);
    playDrawSound();
    updateUI();

    // Pass turn to next
    nextTurn(1);
  });

  function executePlay(playerIdx, card, chosenColor) {
    // Remove card from player hand
    if (playerIdx === 0) {
      var pIdx = playerHand.findIndex(function (c) { return c.uid === card.uid; });
      if (pIdx >= 0) playerHand.splice(pIdx, 1);
    } else {
      var bIdx = botHands[playerIdx - 1].findIndex(function (c) { return c.uid === card.uid; });
      if (bIdx >= 0) botHands[playerIdx - 1].splice(bIdx, 1);
    }

    discardPile.push(card);
    activeColor = chosenColor;
    playCardSound();

    // Check winner
    var remaining = (playerIdx === 0) ? playerHand.length : botHands[playerIdx - 1].length;
    if (remaining === 0) {
      handleGameOver(playerIdx);
      return;
    }

    if (remaining === 1) {
      playUnoSound();
    }

    // Handle special effects
    var step = 1;
    if (card.type === 'skip') {
      playSpecialSound();
      step = 2;
    } else if (card.type === 'reverse') {
      playSpecialSound();
      direction = -direction;
      step = 1;
    } else if (card.type === 'draw2') {
      playSpecialSound();
      var targetP = getNextPlayerIndex(1);
      giveCards(targetP, 2);
      step = 2; // target skips turn
    } else if (card.type === 'wild4') {
      playSpecialSound();
      var targetP4 = getNextPlayerIndex(1);
      giveCards(targetP4, 4);
      step = 2; // target skips turn
    }

    updateUI();
    nextTurn(step);
  }

  function giveCards(pIdx, count) {
    for (var k = 0; k < count; k++) {
      var c = drawCard();
      if (pIdx === 0) playerHand.push(c);
      else botHands[pIdx - 1].push(c);
    }
  }

  function getNextPlayerIndex(step) {
    var next = (currentTurn + direction * step) % 4;
    if (next < 0) next += 4;
    return next;
  }

  function nextTurn(step) {
    currentTurn = getNextPlayerIndex(step);
    updateUI();

    if (currentTurn !== 0 && !isGameOver) {
      setTimeout(botTurn, 700);
    }
  }

  // --- Bot AI ---
  function botTurn() {
    if (currentTurn === 0 || isGameOver) return;
    var bIdx = currentTurn - 1;
    var hand = botHands[bIdx];

    // Find playable cards
    var valid = hand.filter(canPlay);

    if (valid.length > 0) {
      // Pick best card (prefer action/wild cards if trailing)
      var pick = valid[0];
      var newCol = pick.color;
      if (pick.color === 'wild') {
        // Count colors in hand
        var colCounts = { red: 0, blue: 0, green: 0, yellow: 0 };
        hand.forEach(function (c) { if (c.color !== 'wild') colCounts[c.color]++; });
        newCol = Object.keys(colCounts).sort(function (a, b) { return colCounts[b] - colCounts[a]; })[0] || 'red';
      }
      executePlay(currentTurn, pick, newCol);
    } else {
      // Bot draws
      var d = drawCard();
      hand.push(d);
      playDrawSound();
      updateUI();
      nextTurn(1);
    }
  }

  unoShoutBtn.addEventListener('click', function () {
    initAudio();
    playUnoSound();
  });

  function handleGameOver(winnerIdx) {
    isGameOver = true;
    if (winnerIdx === 0) {
      playWinSound();
      modalTitleEl.textContent = '🎉 UNO 大获全胜！';
      modalDescEl.textContent = '你率先清空所有手牌，成为 UNO 之王！';
    } else {
      playTone(200, 0.4, 'sawtooth', 0.2);
      modalTitleEl.textContent = '💀 遗憾落败';
      modalDescEl.textContent = '选手 ' + winnerIdx + ' 率先出完了全部手牌！';
    }
    modalEl.classList.add('active');
  }

  restartBtn.addEventListener('click', initGame);
  modalRestartBtn.addEventListener('click', initGame);
  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  initGame();
})();
