// San Guo Sha (三国杀简版) - OmniGame Engine
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

  function playClashSound() {
    playTone(180, 0.15, 'sawtooth', 0.2);
    setTimeout(function () { playTone(320, 0.12, 'square', 0.15); }, 50);
  }
  function playHealSound() {
    playTone(523, 0.15, 'sine', 0.15);
    setTimeout(function () { playTone(659, 0.2, 'sine', 0.15); }, 100);
  }
  function playCardPlaySound() { playTone(440, 0.08, 'triangle', 0.1); }
  function playWinSound() {
    [392, 523.25, 659.25, 783.99].forEach(function (f, i) {
      setTimeout(function () { playTone(f, 0.25, 'triangle', 0.25); }, i * 110);
    });
  }

  var CARDS_DEF = [
    { type: 'slash', name: '杀', cls: 'card-slash', desc: '出伤1点', count: 14 },
    { type: 'dodge', name: '闪', cls: 'card-dodge', desc: '抵消伤害', count: 8 },
    { type: 'peach', name: '桃', cls: 'card-peach', desc: '回复1血', count: 6 },
    { type: 'duel', name: '决斗', cls: 'card-trick', desc: '殊死轮杀', count: 4 },
    { type: 'nanman', name: '南蛮', cls: 'card-trick', desc: '出杀或伤', count: 3 },
    { type: 'wanjian', name: '万箭', cls: 'card-trick', desc: '出闪或伤', count: 3 },
    { type: 'snatch', name: '顺手', cls: 'card-trick', desc: '牵走敌牌', count: 4 },
    { type: 'dismantle', name: '拆桥', cls: 'card-trick', desc: '弃敌一牌', count: 4 }
  ];

  function createDeck() {
    var deck = [];
    var uid = 1;
    CARDS_DEF.forEach(function (def) {
      for (var i = 0; i < def.count; i++) {
        deck.push({
          uid: uid++,
          type: def.type,
          name: def.name,
          cls: def.cls,
          desc: def.desc
        });
      }
    });
    // Shuffle
    for (var j = deck.length - 1; j > 0; j--) {
      var r = Math.floor(Math.random() * (j + 1));
      var t = deck[j];
      deck[j] = deck[r];
      deck[r] = t;
    }
    return deck;
  }

  // State
  var deck = [];
  var playerHp = 4;
  var playerMaxHp = 4;
  var playerHand = [];
  var botHp = 4;
  var botMaxHp = 4;
  var botHand = [];
  var roundNum = 1;
  var slashUsedThisTurn = false;
  var currentPhase = 'player'; // 'player' or 'bot'
  var isGameOver = false;

  // DOM
  var deckCountEl = document.getElementById('deckCount');
  var phaseTextEl = document.getElementById('phaseText');
  var roundTextEl = document.getElementById('roundText');
  var botHpBarEl = document.getElementById('botHpBar');
  var botHandCountEl = document.getElementById('botHandCount');
  var playerHpBarEl = document.getElementById('playerHpBar');
  var playerHandEl = document.getElementById('playerHand');
  var battleLogEl = document.getElementById('battleLog');
  var playedSlotEl = document.getElementById('playedSlot');
  var btnEndTurn = document.getElementById('btnEndTurn');
  var restartBtn = document.getElementById('restartBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalTitleEl = document.getElementById('modalTitle');
  var modalDescEl = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');
  var soundBtn = document.getElementById('soundBtn');

  function initGame() {
    deck = createDeck();
    playerHp = 4;
    botHp = 4;
    playerHand = [];
    botHand = [];
    roundNum = 1;
    slashUsedThisTurn = false;
    currentPhase = 'player';
    isGameOver = false;

    // Initial deal: 4 cards each
    for (var i = 0; i < 4; i++) {
      playerHand.push(drawCard());
      botHand.push(drawCard());
    }

    modalEl.classList.remove('active');
    setLog('英雄齐聚！主公刘备对决反贼曹操！');
    startPlayerTurn();
  }

  function drawCard() {
    if (deck.length === 0) {
      deck = createDeck(); // reshuffle discard into deck
    }
    return deck.pop();
  }

  function setLog(msg) {
    battleLogEl.textContent = msg;
  }

  function renderArenaCard(card) {
    playedSlotEl.innerHTML = '';
    var el = document.createElement('div');
    el.className = 'sgs-card';
    el.innerHTML = '<span class="card-cost">出牌</span><div class="card-title ' + card.cls + '">' + card.name + '</div><div class="card-desc-mini">' + card.desc + '</div>';
    playedSlotEl.appendChild(el);
  }

  function updateUI() {
    deckCountEl.textContent = deck.length;
    roundTextEl.textContent = roundNum;
    botHandCountEl.textContent = botHand.length;

    // HP Hearts
    botHpBarEl.innerHTML = '';
    for (var b = 0; b < botMaxHp; b++) {
      var hb = document.createElement('span');
      hb.className = 'hp-heart';
      hb.textContent = b < botHp ? '❤️' : '🖤';
      botHpBarEl.appendChild(hb);
    }

    playerHpBarEl.innerHTML = '';
    for (var p = 0; p < playerMaxHp; p++) {
      var hp = document.createElement('span');
      hp.className = 'hp-heart';
      hp.textContent = p < playerHp ? '❤️' : '🖤';
      playerHpBarEl.appendChild(hp);
    }

    // Player Hand
    playerHandEl.innerHTML = '';
    playerHand.forEach(function (card) {
      var cEl = document.createElement('div');
      cEl.className = 'sgs-card';
      cEl.innerHTML = '<span class="card-cost">手牌</span><div class="card-title ' + card.cls + '">' + card.name + '</div><div class="card-desc-mini">' + card.desc + '</div>';
      cEl.addEventListener('click', function () {
        handleCardClick(card);
      });
      playerHandEl.appendChild(cEl);
    });
  }

  function startPlayerTurn() {
    currentPhase = 'player';
    slashUsedThisTurn = false;
    phaseTextEl.textContent = '你的出牌阶段';
    btnEndTurn.disabled = false;

    // Draw 2
    playerHand.push(drawCard());
    playerHand.push(drawCard());
    setLog('轮到你的回合，摸入 2 张手牌！');
    updateUI();
  }

  function handleCardClick(card) {
    if (currentPhase !== 'player' || isGameOver) return;
    initAudio();

    if (card.type === 'dodge') {
      setLog('【闪】只能在遭受攻击时用于防御！');
      return;
    }

    if (card.type === 'slash') {
      if (slashUsedThisTurn) {
        setLog('每回合只能主动使用一次【杀】！');
        return;
      }
      playCard(card);
      slashUsedThisTurn = true;
      executePlayerSlash();
    } else if (card.type === 'peach') {
      if (playerHp >= playerMaxHp) {
        setLog('体力已满，无需使用【桃】！');
        return;
      }
      playCard(card);
      playerHp++;
      playHealSound();
      setLog('你使用了【桃】，体力回复 1 点！');
      updateUI();
    } else if (card.type === 'snatch') {
      playCard(card);
      executePlayerSnatch();
    } else if (card.type === 'dismantle') {
      playCard(card);
      executePlayerDismantle();
    } else if (card.type === 'duel') {
      playCard(card);
      executePlayerDuel();
    } else if (card.type === 'nanman') {
      playCard(card);
      executePlayerNanman();
    } else if (card.type === 'wanjian') {
      playCard(card);
      executePlayerWanjian();
    }
  }

  function playCard(card) {
    var idx = playerHand.findIndex(function (c) { return c.uid === card.uid; });
    if (idx >= 0) playerHand.splice(idx, 1);
    playCardPlaySound();
    renderArenaCard(card);
    updateUI();
  }

  function executePlayerSlash() {
    setLog('你打出了【杀】！反贼曹操尝试闪避...');
    setTimeout(function () {
      var dIdx = botHand.findIndex(function (c) { return c.type === 'dodge'; });
      if (dIdx >= 0) {
        var dodgeCard = botHand.splice(dIdx, 1)[0];
        renderArenaCard(dodgeCard);
        setLog('曹操使用了【闪】，成功化解攻击！');
        playTone(400, 0.1, 'sine', 0.1);
      } else {
        botHp--;
        playClashSound();
        setLog('曹操无【闪】可出，受到 1 点伤害！');
        checkWinner();
      }
      updateUI();
    }, 500);
  }

  function executePlayerSnatch() {
    if (botHand.length === 0) {
      setLog('对方已无手牌可牵！');
      return;
    }
    var stolen = botHand.pop();
    playerHand.push(stolen);
    setLog('【顺手牵羊】成功牵走曹操 1 张手牌！');
    updateUI();
  }

  function executePlayerDismantle() {
    if (botHand.length === 0) {
      setLog('对方已无手牌可拆！');
      return;
    }
    botHand.pop();
    setLog('【过河拆桥】成功拆除曹操 1 张手牌！');
    updateUI();
  }

  function executePlayerDuel() {
    setLog('你发起了【决斗】！');
    setTimeout(function () {
      var sIdx = botHand.findIndex(function (c) { return c.type === 'slash'; });
      if (sIdx >= 0) {
        botHand.splice(sIdx, 1);
        setLog('曹操出【杀】迎战，决斗相持未中伤！');
      } else {
        botHp--;
        playClashSound();
        setLog('曹操无【杀】应战，在决斗中受到 1 点伤害！');
        checkWinner();
      }
      updateUI();
    }, 500);
  }

  function executePlayerNanman() {
    setLog('你打出锦囊【南蛮入侵】！曹操需出【杀】响应...');
    setTimeout(function () {
      var sIdx = botHand.findIndex(function (c) { return c.type === 'slash'; });
      if (sIdx >= 0) {
        botHand.splice(sIdx, 1);
        setLog('曹操出【杀】抵御了南蛮入侵！');
      } else {
        botHp--;
        playClashSound();
        setLog('曹操未出【杀】，受到南蛮入侵 1 点伤害！');
        checkWinner();
      }
      updateUI();
    }, 500);
  }

  function executePlayerWanjian() {
    setLog('你打出锦囊【万箭齐发】！曹操需出【闪】响应...');
    setTimeout(function () {
      var dIdx = botHand.findIndex(function (c) { return c.type === 'dodge'; });
      if (dIdx >= 0) {
        botHand.splice(dIdx, 1);
        setLog('曹操出【闪】避开了万箭齐发！');
      } else {
        botHp--;
        playClashSound();
        setLog('曹操未出【闪】，受到万箭齐发 1 点伤害！');
        checkWinner();
      }
      updateUI();
    }, 500);
  }

  btnEndTurn.addEventListener('click', function () {
    if (currentPhase !== 'player' || isGameOver) return;
    initAudio();
    // Discard down to HP
    while (playerHand.length > playerHp) {
      playerHand.pop();
    }
    updateUI();
    startBotTurn();
  });

  function startBotTurn() {
    if (isGameOver) return;
    currentPhase = 'bot';
    phaseTextEl.textContent = '曹操行动中...';
    btnEndTurn.disabled = true;

    // Bot draws 2
    botHand.push(drawCard());
    botHand.push(drawCard());
    updateUI();

    setTimeout(botActionStep, 700);
  }

  function botActionStep() {
    if (isGameOver) return;

    // 1. Bot Peach if damaged
    if (botHp < botMaxHp) {
      var pIdx = botHand.findIndex(function (c) { return c.type === 'peach'; });
      if (pIdx >= 0) {
        var peach = botHand.splice(pIdx, 1)[0];
        botHp++;
        renderArenaCard(peach);
        playHealSound();
        setLog('曹操使用了【桃】，回复 1 点体力！');
        updateUI();
        setTimeout(botActionStep, 700);
        return;
      }
    }

    // 2. Bot tricks: Snatch or Dismantle
    var trickIdx = botHand.findIndex(function (c) { return c.type === 'snatch' || c.type === 'dismantle'; });
    if (trickIdx >= 0 && playerHand.length > 0) {
      var trick = botHand.splice(trickIdx, 1)[0];
      renderArenaCard(trick);
      if (trick.type === 'snatch') {
        var st = playerHand.pop();
        botHand.push(st);
        setLog('曹操使用了【顺手牵羊】，夺取你 1 张手牌！');
      } else {
        playerHand.pop();
        setLog('曹操使用了【过河拆桥】，拆除你 1 张手牌！');
      }
      updateUI();
      setTimeout(botActionStep, 700);
      return;
    }

    // 3. Bot Slash
    var sIdx = botHand.findIndex(function (c) { return c.type === 'slash'; });
    if (sIdx >= 0) {
      var slash = botHand.splice(sIdx, 1)[0];
      renderArenaCard(slash);
      setLog('曹操挥剑向你打出了【杀】！');
      updateUI();

      setTimeout(function () {
        var dIdx = playerHand.findIndex(function (c) { return c.type === 'dodge'; });
        if (dIdx >= 0) {
          playerHand.splice(dIdx, 1);
          setLog('你自动出【闪】，成功化解曹操的攻击！');
          playTone(480, 0.1, 'sine', 0.1);
        } else {
          playerHp--;
          playClashSound();
          setLog('你无【闪】抵御，受到 1 点伤害！');
          checkWinner();
        }
        updateUI();
        setTimeout(endBotTurn, 800);
      }, 600);
      return;
    }

    endBotTurn();
  }

  function endBotTurn() {
    if (isGameOver) return;
    // Bot discards down to HP
    while (botHand.length > botHp) {
      botHand.pop();
    }
    updateUI();

    roundNum++;
    setTimeout(startPlayerTurn, 400);
  }

  function checkWinner() {
    if (botHp <= 0) {
      isGameOver = true;
      playWinSound();
      modalTitleEl.textContent = '🏆 荡平叛乱！主公凯旋！';
      modalDescEl.textContent = '成功诛杀反贼曹操！匡扶汉室大获全胜！';
      modalEl.classList.add('active');
    } else if (playerHp <= 0) {
      isGameOver = true;
      playTone(180, 0.5, 'sawtooth', 0.3);
      modalTitleEl.textContent = '💀 主公阵亡...';
      modalDescEl.textContent = '反贼曹操得逞！请重整旗鼓再战三国！';
      modalEl.classList.add('active');
    }
  }

  restartBtn.addEventListener('click', initGame);
  modalRestartBtn.addEventListener('click', initGame);
  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  initGame();
})();
