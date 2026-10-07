// Dou Dizhu (经典斗地主) - OmniGame High Polish Engine
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

  function playCardSound() { playTone(440, 0.08, 'triangle', 0.12); }
  function playBombSound() {
    playTone(150, 0.3, 'sawtooth', 0.25);
    setTimeout(function () { playTone(80, 0.4, 'square', 0.3); }, 100);
  }
  function playPassSound() { playTone(280, 0.08, 'sine', 0.08); }
  function playWinSound() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { playTone(f, 0.25, 'triangle', 0.2); }, i * 110);
    });
  }

  var SUITS = ['♠', '♥', '♣', '♦'];
  var RANK_NAMES = {
    3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王'
  };

  function createDeck() {
    var deck = [];
    var uid = 1;
    // 3 to 2
    for (var r = 3; r <= 15; r++) {
      for (var s = 0; s < 4; s++) {
        var suit = SUITS[s];
        var isRed = suit === '♥' || suit === '♦';
        deck.push({
          uid: uid++,
          rank: r,
          suit: suit,
          name: RANK_NAMES[r],
          isRed: isRed
        });
      }
    }
    // Jokers
    deck.push({ uid: uid++, rank: 16, suit: '🃏', name: '小王', isRed: false });
    deck.push({ uid: uid++, rank: 17, suit: '👑', name: '大王', isRed: true });

    // Shuffle
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = deck[i];
      deck[i] = deck[j];
      deck[j] = t;
    }
    return deck;
  }

  function sortCards(cards) {
    return cards.slice().sort(function (a, b) {
      return b.rank - a.rank;
    });
  }

  // --- Hand Pattern Analyzer ---
  function parseHand(cards) {
    if (!cards || cards.length === 0) return null;
    var n = cards.length;
    var counts = {};
    cards.forEach(function (c) { counts[c.rank] = (counts[c.rank] || 0) + 1; });
    var ranks = Object.keys(counts).map(Number).sort(function (a, b) { return a - b; });

    // Rocket (王炸)
    if (n === 2 && counts[16] === 1 && counts[17] === 1) {
      return { type: 'rocket', val: 999, len: 2 };
    }

    // Bomb (炸弹)
    if (n === 4 && ranks.length === 1) {
      return { type: 'bomb', val: ranks[0], len: 4 };
    }

    // Single (单张)
    if (n === 1) {
      return { type: 'single', val: ranks[0], len: 1 };
    }

    // Pair (对子)
    if (n === 2 && ranks.length === 1) {
      return { type: 'pair', val: ranks[0], len: 2 };
    }

    // Triplet (三不带)
    if (n === 3 && ranks.length === 1) {
      return { type: 'triplet', val: ranks[0], len: 3 };
    }

    // Triplet + Single (三带一)
    if (n === 4 && ranks.length === 2) {
      var tripR = ranks.find(function (r) { return counts[r] === 3; });
      if (tripR) return { type: 'triplet_single', val: tripR, len: 4 };
    }

    // Triplet + Pair (三带二)
    if (n === 5 && ranks.length === 2) {
      var tripR2 = ranks.find(function (r) { return counts[r] === 3; });
      var pairR = ranks.find(function (r) { return counts[r] === 2; });
      if (tripR2 && pairR) return { type: 'triplet_pair', val: tripR2, len: 5 };
    }

    // Straight (顺子): >= 5 cards, max rank <= 14 (A)
    if (n >= 5 && ranks.length === n && ranks[ranks.length - 1] <= 14) {
      var isConsec = true;
      for (var s = 0; s < ranks.length - 1; s++) {
        if (ranks[s + 1] - ranks[s] !== 1) { isConsec = false; break; }
      }
      if (isConsec) return { type: 'straight', val: ranks[ranks.length - 1], len: n };
    }

    // Consecutive Pairs (连对): >= 3 pairs (6 cards)
    if (n >= 6 && n % 2 === 0 && ranks.length === n / 2 && ranks[ranks.length - 1] <= 14) {
      var allPairs = true;
      for (var p = 0; p < ranks.length; p++) {
        if (counts[ranks[p]] !== 2) { allPairs = false; break; }
      }
      if (allPairs) {
        var isConsecPair = true;
        for (var cp = 0; cp < ranks.length - 1; cp++) {
          if (ranks[cp + 1] - ranks[cp] !== 1) { isConsecPair = false; break; }
        }
        if (isConsecPair) return { type: 'consec_pairs', val: ranks[ranks.length - 1], len: n };
      }
    }

    return null; // Invalid pattern
  }

  function canBeat(newPattern, lastPattern) {
    if (!newPattern) return false;
    if (!lastPattern) return true; // Free play

    if (newPattern.type === 'rocket') return true;
    if (lastPattern.type === 'rocket') return false;

    if (newPattern.type === 'bomb') {
      if (lastPattern.type !== 'bomb') return true;
      return newPattern.val > lastPattern.val;
    }

    if (lastPattern.type === 'bomb') return false;

    // Same type and same length
    if (newPattern.type === lastPattern.type && newPattern.len === lastPattern.len) {
      return newPattern.val > lastPattern.val;
    }

    return false;
  }

  // --- Game State ---
  var holeCards = [];
  var playerHand = [];
  var leftBotHand = [];
  var rightBotHand = [];
  var selectedUids = [];

  var roles = { player: 'farmer', left: 'farmer', right: 'farmer' };
  var landlord = null;
  var currentTurn = null; // 'player', 'left', 'right'
  var lastPlay = null; // { player: '...', cards: [...], pattern: {...} }
  var passStreak = 0;
  var multiplier = 1;
  var isGameOver = false;

  // DOM
  var holeCardsEl = document.getElementById('holeCards');
  var playerCardsEl = document.getElementById('playerCards');
  var centerDeskEl = document.getElementById('centerDesk');
  var playedLeftEl = document.getElementById('playedLeft');
  var playedRightEl = document.getElementById('playedRight');
  var playedPlayerEl = document.getElementById('playedPlayer');
  var countLeftEl = document.getElementById('countLeft');
  var countRightEl = document.getElementById('countRight');
  var roleLeftEl = document.getElementById('roleLeft');
  var roleRightEl = document.getElementById('roleRight');
  var playerRoleEl = document.getElementById('playerRole');
  var turnTextEl = document.getElementById('turnText');
  var multiplierTextEl = document.getElementById('multiplierText');
  var bidButtonsEl = document.getElementById('bidButtons');
  var playButtonsEl = document.getElementById('playButtons');
  var btnCall = document.getElementById('btnCall');
  var btnPassBid = document.getElementById('btnPassBid');
  var btnPlayCards = document.getElementById('btnPlayCards');
  var btnPassPlay = document.getElementById('btnPassPlay');
  var btnHint = document.getElementById('btnHint');
  var restartBtn = document.getElementById('restartBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalTitleEl = document.getElementById('modalTitle');
  var modalDescEl = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');
  var soundBtn = document.getElementById('soundBtn');

  function initGame() {
    var deck = createDeck();
    holeCards = deck.slice(0, 3);
    playerHand = sortCards(deck.slice(3, 20));
    leftBotHand = sortCards(deck.slice(20, 37));
    rightBotHand = sortCards(deck.slice(37, 54));

    selectedUids = [];
    roles = { player: 'farmer', left: 'farmer', right: 'farmer' };
    landlord = null;
    lastPlay = null;
    passStreak = 0;
    multiplier = 1;
    isGameOver = false;

    // Reset UI
    multiplierTextEl.textContent = '1';
    turnTextEl.textContent = '叫地主阶段';
    modalEl.classList.remove('active');
    playedLeftEl.innerHTML = '';
    playedRightEl.innerHTML = '';
    playedPlayerEl.innerHTML = '';
    centerDeskEl.innerHTML = '';

    renderHoleCards(false);
    updateRolesUI();
    renderPlayerCards();
    updateCounts();

    // Start bidding phase
    bidButtonsEl.style.display = 'flex';
    playButtonsEl.style.display = 'none';
  }

  function renderHoleCards(revealed) {
    holeCardsEl.innerHTML = '';
    holeCards.forEach(function (c) {
      var cardDiv = document.createElement('div');
      if (revealed) {
        cardDiv.className = 'poker-card ' + (c.isRed ? 'suit-red' : 'suit-black');
        cardDiv.style.position = 'relative';
        cardDiv.style.width = '28px';
        cardDiv.style.height = '40px';
        cardDiv.innerHTML = '<div class="card-top"><span class="card-rank">' + c.name + '</span></div><div class="card-center-suit">' + c.suit + '</div>';
      } else {
        cardDiv.className = 'card-back';
      }
      holeCardsEl.appendChild(cardDiv);
    });
  }

  function updateRolesUI() {
    playerRoleEl.textContent = roles.player === 'landlord' ? '地主' : '农民';
    playerRoleEl.className = 'player-role ' + (roles.player === 'landlord' ? 'role-landlord' : 'role-farmer');

    roleLeftEl.textContent = roles.left === 'landlord' ? '地主' : '农民';
    roleLeftEl.className = 'role-badge ' + (roles.left === 'landlord' ? 'role-landlord' : 'role-farmer');

    roleRightEl.textContent = roles.right === 'landlord' ? '地主' : '农民';
    roleRightEl.className = 'role-badge ' + (roles.right === 'landlord' ? 'role-landlord' : 'role-farmer');
  }

  function updateCounts() {
    countLeftEl.textContent = leftBotHand.length + '张';
    countRightEl.textContent = rightBotHand.length + '张';
  }

  function renderPlayerCards() {
    playerCardsEl.innerHTML = '';
    var total = playerHand.length;
    var step = Math.min(22, Math.max(14, (320 - 40) / Math.max(1, total - 1)));

    playerHand.forEach(function (c, idx) {
      var el = document.createElement('div');
      var isSel = selectedUids.indexOf(c.uid) >= 0;
      el.className = 'poker-card ' + (c.isRed ? 'suit-red' : 'suit-black') + (isSel ? ' selected' : '');
      el.style.left = (idx * step) + 'px';
      el.style.zIndex = idx + 1;

      el.innerHTML = '<div class="card-top"><span class="card-rank">' + c.name + '</span><span class="card-suit">' + c.suit + '</span></div><div class="card-center-suit">' + c.suit + '</div>';

      el.addEventListener('click', function () {
        toggleSelectCard(c.uid);
      });

      playerCardsEl.appendChild(el);
    });
  }

  function toggleSelectCard(uid) {
    initAudio();
    playTone(480, 0.04, 'sine', 0.08);
    var idx = selectedUids.indexOf(uid);
    if (idx >= 0) {
      selectedUids.splice(idx, 1);
    } else {
      selectedUids.push(uid);
    }
    renderPlayerCards();
  }

  // --- Bidding Handlers ---
  btnCall.addEventListener('click', function () {
    initAudio();
    // Player becomes Landlord!
    landlord = 'player';
    roles.player = 'landlord';
    roles.left = 'farmer';
    roles.right = 'farmer';
    playerHand = sortCards(playerHand.concat(holeCards));
    multiplier *= 2;
    multiplierTextEl.textContent = multiplier;
    startGameplay('player');
  });

  btnPassBid.addEventListener('click', function () {
    initAudio();
    // Left bot becomes landlord
    landlord = 'left';
    roles.left = 'landlord';
    roles.player = 'farmer';
    roles.right = 'farmer';
    leftBotHand = sortCards(leftBotHand.concat(holeCards));
    startGameplay('left');
  });

  function startGameplay(startUser) {
    bidButtonsEl.style.display = 'none';
    playButtonsEl.style.display = 'flex';
    renderHoleCards(true);
    updateRolesUI();
    renderPlayerCards();
    updateCounts();

    currentTurn = startUser;
    processTurn();
  }

  function processTurn() {
    if (isGameOver) return;

    if (passStreak >= 2) {
      lastPlay = null; // Free round
      passStreak = 0;
    }

    if (currentTurn === 'player') {
      turnTextEl.textContent = '轮到你出牌' + (lastPlay ? ' (跟牌)' : ' (首出)');
      btnPassPlay.disabled = !lastPlay; // Cannot pass on free lead
    } else if (currentTurn === 'left') {
      turnTextEl.textContent = '下家思考中...';
      setTimeout(botPlayLeft, 600);
    } else if (currentTurn === 'right') {
      turnTextEl.textContent = '上家思考中...';
      setTimeout(botPlayRight, 600);
    }
  }

  // Render cards in played slot
  function renderPlayedCards(slotEl, cards) {
    slotEl.innerHTML = '';
    if (!cards || cards.length === 0) {
      slotEl.innerHTML = '<span class="pass-label">不出</span>';
      return;
    }
    cards.forEach(function (c, idx) {
      var el = document.createElement('div');
      el.className = 'poker-card ' + (c.isRed ? 'suit-red' : 'suit-black');
      el.style.position = 'relative';
      el.style.display = 'inline-block';
      el.style.marginRight = '-18px';
      el.style.zIndex = idx + 1;
      el.innerHTML = '<div class="card-top"><span class="card-rank">' + c.name + '</span></div><div class="card-center-suit">' + c.suit + '</div>';
      slotEl.appendChild(el);
    });
  }

  // --- Player Plays ---
  btnPlayCards.addEventListener('click', function () {
    if (currentTurn !== 'player' || isGameOver) return;
    initAudio();

    var chosenCards = playerHand.filter(function (c) { return selectedUids.indexOf(c.uid) >= 0; });
    var pattern = parseHand(chosenCards);

    if (!pattern) {
      playTone(200, 0.15, 'sawtooth', 0.15);
      return; // Invalid cards
    }

    if (lastPlay && !canBeat(pattern, lastPlay.pattern)) {
      playTone(200, 0.15, 'sawtooth', 0.15);
      return; // Cannot beat
    }

    // Valid play!
    if (pattern.type === 'bomb' || pattern.type === 'rocket') {
      multiplier *= 2;
      multiplierTextEl.textContent = multiplier;
      playBombSound();
    } else {
      playCardSound();
    }

    // Remove from hand
    playerHand = playerHand.filter(function (c) { return selectedUids.indexOf(c.uid) < 0; });
    selectedUids = [];
    renderPlayerCards();

    lastPlay = { player: 'player', cards: chosenCards, pattern: pattern };
    passStreak = 0;
    renderPlayedCards(playedPlayerEl, chosenCards);

    if (playerHand.length === 0) {
      handleGameOver('player');
      return;
    }

    currentTurn = 'left';
    processTurn();
  });

  btnPassPlay.addEventListener('click', function () {
    if (currentTurn !== 'player' || !lastPlay || isGameOver) return;
    initAudio();
    playPassSound();
    selectedUids = [];
    renderPlayerCards();
    renderPlayedCards(playedPlayerEl, null);
    passStreak++;
    currentTurn = 'left';
    processTurn();
  });

  btnHint.addEventListener('click', function () {
    initAudio();
    playTone(520, 0.05, 'sine', 0.1);
    // Find smallest winning candidate
    selectedUids = [];
    if (!lastPlay) {
      if (playerHand.length > 0) {
        selectedUids.push(playerHand[playerHand.length - 1].uid);
      }
    } else {
      // Find single or pair that can beat
      if (lastPlay.pattern.type === 'single') {
        for (var i = playerHand.length - 1; i >= 0; i--) {
          if (playerHand[i].rank > lastPlay.pattern.val) {
            selectedUids.push(playerHand[i].uid);
            break;
          }
        }
      } else if (lastPlay.pattern.type === 'pair') {
        for (var j = playerHand.length - 1; j >= 1; j--) {
          if (playerHand[j].rank === playerHand[j - 1].rank && playerHand[j].rank > lastPlay.pattern.val) {
            selectedUids.push(playerHand[j].uid);
            selectedUids.push(playerHand[j - 1].uid);
            break;
          }
        }
      }
    }
    renderPlayerCards();
  });

  // --- Bot AI ---
  function botChooseMove(botHand) {
    if (!lastPlay) {
      // Free lead: play smallest single
      return [botHand[botHand.length - 1]];
    }

    if (lastPlay.pattern.type === 'single') {
      for (var i = botHand.length - 1; i >= 0; i--) {
        if (botHand[i].rank > lastPlay.pattern.val) {
          return [botHand[i]];
        }
      }
    } else if (lastPlay.pattern.type === 'pair') {
      for (var j = botHand.length - 1; j >= 1; j--) {
        if (botHand[j].rank === botHand[j - 1].rank && botHand[j].rank > lastPlay.pattern.val) {
          return [botHand[j], botHand[j - 1]];
        }
      }
    }

    return null; // Pass
  }

  function botPlayLeft() {
    if (isGameOver) return;
    var move = botChooseMove(leftBotHand);
    if (move) {
      var pattern = parseHand(move);
      leftBotHand = leftBotHand.filter(function (c) { return move.indexOf(c) < 0; });
      updateCounts();
      renderPlayedCards(playedLeftEl, move);
      lastPlay = { player: 'left', cards: move, pattern: pattern };
      passStreak = 0;
      playCardSound();
      if (leftBotHand.length === 0) {
        handleGameOver('left');
        return;
      }
    } else {
      renderPlayedCards(playedLeftEl, null);
      passStreak++;
      playPassSound();
    }
    currentTurn = 'right';
    processTurn();
  }

  function botPlayRight() {
    if (isGameOver) return;
    var move = botChooseMove(rightBotHand);
    if (move) {
      var pattern = parseHand(move);
      rightBotHand = rightBotHand.filter(function (c) { return move.indexOf(c) < 0; });
      updateCounts();
      renderPlayedCards(playedRightEl, move);
      lastPlay = { player: 'right', cards: move, pattern: pattern };
      passStreak = 0;
      playCardSound();
      if (rightBotHand.length === 0) {
        handleGameOver('right');
        return;
      }
    } else {
      renderPlayedCards(playedRightEl, null);
      passStreak++;
      playPassSound();
    }
    currentTurn = 'player';
    processTurn();
  }

  function handleGameOver(winner) {
    isGameOver = true;
    var isLandlordWin = (winner === landlord);
    var playerWon = (roles.player === 'landlord' && isLandlordWin) || (roles.player === 'farmer' && !isLandlordWin);

    if (playerWon) {
      playWinSound();
      modalTitleEl.textContent = '🎉 胜利大捷！';
      modalDescEl.textContent = (isLandlordWin ? '地主' : '农民') + '阵营大获全胜！获得积分 +' + (100 * multiplier) + ' 分！';
    } else {
      playTone(220, 0.4, 'sawtooth', 0.2);
      modalTitleEl.textContent = '💀 遗憾告负';
      modalDescEl.textContent = (isLandlordWin ? '地主' : '农民') + '率先出完手牌！本局扣减 -' + (100 * multiplier) + ' 分。';
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
