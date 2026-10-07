/*
 * games/hack-roulette/game.js
 * Hack Roulette (暗箱轮盘) — Cyberpunk Psychological Tactical Duel.
 *
 * Mechanics:
 * - Load random live (damage) and blank (safe) code blocks.
 * - Shoot Opponent: if live -> damage; if blank -> turn ends.
 * - Shoot Self: if blank -> safe + EXTRA TURN! If live -> self-damage!
 * - Items: Scanner, Overclock (2x damage), Bypass (skip turn), Inverter (flip code).
 *
 * Supports:
 * - Probabilistic Cyber AI
 * - Online P2P / Relay Multiplayer via OmniNet
 * - Local 2-Player mode
 */
(function () {
  'use strict';

  var MAX_HP = 3;
  var P1 = 1; // Host / Player
  var P2 = 2; // Guest / Opponent

  var ITEMS_CATALOG = [
    { id: 'scanner', name: '🔍 扫描仪', desc: '查看下一发代码属性' },
    { id: 'overclock', name: '⚡ 超频', desc: '下一次病毒伤害翻倍 (2点)' },
    { id: 'bypass', name: '✂️ 切断', desc: '强制对手跳过下一个回合' },
    { id: 'inverter', name: '🔄 反转', desc: '倒转当前代码属性 (虚实对调)' }
  ];

  var state = {
    mode: 'ai', // 'ai' | 'online' | 'local'
    net: null,
    isHost: true,
    myPlayerId: P1,
    turn: P1, // 1 or 2
    hp: { 1: MAX_HP, 2: MAX_HP },
    items: { 1: [], 2: [] },
    chamber: [], // array of 'live' | 'blank'
    chamberIdx: 0,
    overclocked: false,
    bypassed: false,
    knownNext: null,
    gameOver: false,
    opponentName: '网络黑客'
  };

  // DOM elements
  var playerCard = document.getElementById('playerCard');
  var oppCard = document.getElementById('oppCard');
  var playerName = document.getElementById('playerName');
  var oppName = document.getElementById('oppName');
  var playerHpBar = document.getElementById('playerHpBar');
  var oppHpBar = document.getElementById('oppHpBar');
  var playerItemsRow = document.getElementById('playerItemsRow');
  var oppItemsRow = document.getElementById('oppItemsRow');
  var liveCountEl = document.getElementById('liveCount');
  var blankCountEl = document.getElementById('blankCount');
  var chamberSlotsEl = document.getElementById('chamberSlots');
  var terminalLog = document.getElementById('terminalLog');
  var turnBadge = document.getElementById('turnBadge');

  var btnShootSelf = document.getElementById('btnShootSelf');
  var btnShootOpp = document.getElementById('btnShootOpp');
  var modeSelectBtn = document.getElementById('modeSelectBtn');
  var onlineLobbyBtn = document.getElementById('onlineLobbyBtn');
  var overlay = document.getElementById('overlay');
  var winnerTitle = document.getElementById('winnerTitle');
  var winnerDesc = document.getElementById('winnerDesc');
  var finalStats = document.getElementById('finalStats');
  var playAgainBtn = document.getElementById('playAgainBtn');
  var changeModeBtn = document.getElementById('changeModeBtn');
  var backBtn = document.querySelector('[data-back]');

  /* ---------------- Terminal Logger ---------------- */
  function log(msg, type) {
    var line = document.createElement('div');
    line.className = 'log-line' + (type ? ' ' + type : '');
    line.textContent = '> ' + msg;
    terminalLog.appendChild(line);
    terminalLog.scrollTop = terminalLog.scrollHeight;
  }

  /* ---------------- Chamber Generation ---------------- */
  function reloadChamber() {
    if (state.mode === 'online' && !state.isHost) {
      log('等待房主加载新弹夹…', 'sys');
      return;
    }

    var total = Math.floor(3 + Math.random() * 4); // 3 to 6 rounds
    var live = Math.floor(1 + Math.random() * (total - 1));
    var blank = total - live;

    var list = [];
    for (var i = 0; i < live; i++) list.push('live');
    for (var j = 0; j < blank; j++) list.push('blank');

    // Shuffle
    for (var k = list.length - 1; k > 0; k--) {
      var r = Math.floor(Math.random() * (k + 1));
      var tmp = list[k]; list[k] = list[r]; list[r] = tmp;
    }

    state.chamber = list;
    state.chamberIdx = 0;
    state.overclocked = false;
    state.knownNext = null;

    // Distribute items (up to 4 each)
    distributeItems(state.items[1]);
    distributeItems(state.items[2]);

    log('====================================', 'sys');
    log('弹夹已刷新：装载 ' + live + ' 发病毒代码，' + blank + ' 发空白指令。', 'sys');

    renderChamberInfo();
    renderHp();
    renderItems();
    updateTurnUI();

    if (state.mode === 'online' && state.net && state.isHost) {
      state.net.send('chamber', {
        chamber: state.chamber,
        p1Items: state.items[1],
        p2Items: state.items[2]
      });
    }
  }

  function distributeItems(itemArray) {
    var addCount = Math.floor(1 + Math.random() * 2);
    for (var i = 0; i < addCount; i++) {
      if (itemArray.length < 4) {
        var it = ITEMS_CATALOG[Math.floor(Math.random() * ITEMS_CATALOG.length)];
        itemArray.push(it);
      }
    }
  }

  function renderChamberInfo() {
    var remaining = state.chamber.slice(state.chamberIdx);
    var lives = remaining.filter(function (x) { return x === 'live'; }).length;
    var blanks = remaining.filter(function (x) { return x === 'blank'; }).length;

    liveCountEl.textContent = lives;
    blankCountEl.textContent = blanks;

    chamberSlotsEl.innerHTML = '';
    for (var i = 0; i < state.chamber.length; i++) {
      var slot = document.createElement('div');
      slot.className = 'slot';
      if (i < state.chamberIdx) slot.classList.add('spent');
      else if (i === state.chamberIdx) slot.classList.add('current');
      slot.textContent = i < state.chamberIdx ? '•' : '?';
      chamberSlotsEl.appendChild(slot);
    }
  }

  function renderHp() {
    var myHp = state.hp[state.myPlayerId];
    var oppHp = state.hp[3 - state.myPlayerId];

    playerHpBar.innerHTML = '';
    for (var i = 0; i < MAX_HP; i++) {
      var h = document.createElement('span');
      h.className = 'hp-heart' + (i < myHp ? ' active' : '');
      h.textContent = '❤️';
      playerHpBar.appendChild(h);
    }

    oppHpBar.innerHTML = '';
    for (var j = 0; j < MAX_HP; j++) {
      var oh = document.createElement('span');
      oh.className = 'hp-heart' + (j < oppHp ? ' active' : '');
      oh.textContent = '❤️';
      oppHpBar.appendChild(oh);
    }
  }

  function renderItems() {
    var myItems = state.items[state.myPlayerId] || [];
    var oppItems = state.items[3 - state.myPlayerId] || [];

    var isMyTurn = (state.mode === 'local') ? true : (state.turn === state.myPlayerId);

    // My Items
    playerItemsRow.innerHTML = '';
    myItems.forEach(function (it, itemIdx) {
      var chip = document.createElement('button');
      chip.className = 'item-chip';
      chip.textContent = it.name;
      chip.title = it.desc;
      chip.disabled = !isMyTurn || state.gameOver;
      chip.onclick = function () {
        useItem(state.myPlayerId, itemIdx, false);
      };
      playerItemsRow.appendChild(chip);
    });

    // Opponent Items
    oppItemsRow.innerHTML = '';
    oppItems.forEach(function (it) {
      var chip = document.createElement('button');
      chip.className = 'item-chip';
      chip.textContent = it.name;
      chip.title = it.desc;
      chip.disabled = true;
      oppItemsRow.appendChild(chip);
    });
  }

  function updateTurnUI() {
    var isMyTurn = (state.mode === 'local') ? true : (state.turn === state.myPlayerId);

    if (state.turn === state.myPlayerId) {
      playerCard.classList.add('active');
      oppCard.classList.remove('active');
      turnBadge.textContent = '🟢 你的行动回合';
      turnBadge.style.display = '';
    } else {
      oppCard.classList.add('active');
      playerCard.classList.remove('active');
      turnBadge.textContent = '⏳ 等待对手行动…';
      turnBadge.style.display = '';
    }

    var canAct = isMyTurn && !state.gameOver;
    btnShootSelf.disabled = !canAct;
    btnShootOpp.disabled = !canAct;
    btnShootSelf.style.opacity = canAct ? '1' : '0.4';
    btnShootOpp.style.opacity = canAct ? '1' : '0.4';

    renderItems();
  }

  /* ---------------- Item Usage ---------------- */
  function useItem(playerIdx, itemIdx, fromRemote) {
    if (state.gameOver) return;
    var items = state.items[playerIdx];
    if (!items || itemIdx >= items.length) return;
    var it = items.splice(itemIdx, 1)[0];
    if (!it) return;

    var isMe = (playerIdx === state.myPlayerId);
    var actorName = isMe ? '你' : (state.mode === 'online' ? state.opponentName : '对手');

    log(actorName + ' 激活了道具：' + it.name, 'item');

    if (it.id === 'scanner') {
      var current = state.chamber[state.chamberIdx];
      if (isMe) {
        log('【扫描仪探测结果】当前装载代码为：' + (current === 'live' ? '🔴 病毒代码！' : '🔵 空白指令！'), 'item');
        state.knownNext = current;
      } else {
        log('【对手扫描】对手查验了当前代码属性！', 'item');
      }
    } else if (it.id === 'overclock') {
      state.overclocked = true;
      log('【超频过载】下次若命中病毒，伤害提升为 2 点！', 'item');
    } else if (it.id === 'bypass') {
      state.bypassed = true;
      log('【指令切断】对手将被强制跳过下一个回合！', 'item');
    } else if (it.id === 'inverter') {
      var cur = state.chamber[state.chamberIdx];
      state.chamber[state.chamberIdx] = cur === 'live' ? 'blank' : 'live';
      state.knownNext = state.chamber[state.chamberIdx];
      log('【极性倒转】已反转当前代码状态！', 'item');
    }

    renderItems();

    if (!fromRemote && state.mode === 'online' && state.net) {
      state.net.send('item', { player: playerIdx, itemIdx: itemIdx, itemId: it.id });
    }
  }

  /* ---------------- Turn Actions ---------------- */
  function executeShot(target, fromRemote) {
    if (state.gameOver) return;

    var currentCode = state.chamber[state.chamberIdx];
    state.chamberIdx++;
    renderChamberInfo();

    var actor = state.turn;
    var victim = (target === 'self') ? actor : (3 - actor);

    var isActorMe = (actor === state.myPlayerId);
    var actorName = isActorMe ? '你' : (state.mode === 'online' ? state.opponentName : (actor === 1 ? '玩家1' : '玩家2'));
    var victimName = (victim === state.myPlayerId) ? '自己' : '对方';

    log(actorName + ' 选择向 ' + victimName + ' 执行代码注入…');

    var isLive = currentCode === 'live';
    var dmg = state.overclocked ? 2 : 1;
    state.overclocked = false; // reset after shot

    if (isLive) {
      log('💥 [BOOM!] 注入了恶意病毒代码！造成 ' + dmg + ' 点伤害！', 'dmg');
      state.hp[victim] -= dmg;
      renderHp();

      // Check KO
      if (state.hp[1] <= 0 || state.hp[2] <= 0) {
        endGame();
        return;
      }

      // Live shot passes turn
      advanceTurn();
    } else {
      log('💨 [SAFE] 空白无害代码，系统无损。', 'safe');
      if (target === 'self') {
        log('⭐ 赌中空白代码！' + actorName + ' 获得额外一次行动权！', 'sys');
        updateTurnUI();
      } else {
        advanceTurn();
      }
    }

    // Check if chamber is spent
    if (state.chamberIdx >= state.chamber.length && !state.gameOver) {
      setTimeout(reloadChamber, 600);
    }

    // Trigger AI if AI turn
    if (state.mode === 'ai' && state.turn === P2 && !state.gameOver) {
      setTimeout(makeAiDecision, 900);
    }

    if (!fromRemote && state.mode === 'online' && state.net) {
      state.net.send('action', { target: target });
    }
  }

  function advanceTurn() {
    if (state.bypassed) {
      state.bypassed = false;
      var activeName = (state.turn === state.myPlayerId) ? '你' : '对手';
      log('✂️ 对手被切断协议锁定，' + activeName + ' 继续行动！', 'sys');
    } else {
      state.turn = (state.turn === P1 ? P2 : P1);
    }
    updateTurnUI();
  }

  /* ---------------- AI Strategy ---------------- */
  function makeAiDecision() {
    if (state.gameOver || state.turn !== P2) return;

    var remaining = state.chamber.slice(state.chamberIdx);
    var lives = remaining.filter(function (x) { return x === 'live'; }).length;
    var blanks = remaining.filter(function (x) { return x === 'blank'; }).length;

    // AI Item usage
    var aiItems = state.items[P2] || [];
    if (aiItems.length > 0) {
      var scanIdx = aiItems.findIndex(function (it) { return it.id === 'scanner'; });
      if (scanIdx >= 0) {
        useItem(P2, scanIdx, false);
        var current = state.chamber[state.chamberIdx];
        if (current === 'live') {
          var ocIdx = state.items[P2].findIndex(function (it) { return it.id === 'overclock'; });
          if (ocIdx >= 0) useItem(P2, ocIdx, false);
          setTimeout(function () { executeShot('opp', false); }, 600);
          return;
        } else {
          setTimeout(function () { executeShot('self', false); }, 600);
          return;
        }
      }
    }

    // Probabilistic reasoning:
    if (blanks > lives) {
      executeShot('self', false);
    } else {
      executeShot('opp', false);
    }
  }

  /* ---------------- Game Over ---------------- */
  function endGame() {
    state.gameOver = true;
    var isP1Alive = state.hp[1] > 0;
    var isMeWinner = state.hp[state.myPlayerId] > 0;

    winnerTitle.textContent = isMeWinner ? '🏆 系统权限已夺取！' : '💀 核心系统过载融毁！';
    winnerDesc.textContent = isMeWinner ? '你凭借精湛的博弈与算计击溃了对手。' : '对手在心理战中彻底压制了你。';
    finalStats.innerHTML =
      '<span>你的生命：<b>' + Math.max(0, state.hp[state.myPlayerId]) + ' ❤️</b></span>' +
      '<span>对手生命：<b>' + Math.max(0, state.hp[3 - state.myPlayerId]) + ' ❤️</b></span>';
    overlay.hidden = false;

    // Record Battle
    if (window.GameStore && window.GameStore.recordBattle) {
      GameStore.recordBattle({
        gameId: 'hack-roulette',
        opponent: state.mode === 'online' ? (state.opponentName || '黑客对手') : (state.mode === 'ai' ? '🤖 赛博AI' : '本地双人'),
        result: isMeWinner ? 'win' : 'loss',
        mode: state.mode
      });
    }
  }

  /* ---------------- Reset & Modes ---------------- */
  function resetMatch() {
    state.hp[1] = MAX_HP;
    state.hp[2] = MAX_HP;
    state.items[1] = [];
    state.items[2] = [];
    state.turn = P1;
    state.gameOver = false;
    overlay.hidden = true;
    terminalLog.innerHTML = '';
    renderHp();
    reloadChamber();
    updateTurnUI();
  }

  function setMode(mode, net, isHost, opponent) {
    state.mode = mode;
    state.net = net;
    state.isHost = isHost;
    state.myPlayerId = (mode === 'online' && !isHost) ? P2 : P1;

    if (mode === 'ai') {
      modeSelectBtn.textContent = '模式: 🤖 赛博AI';
      playerName.textContent = '你 (ROOT)';
      oppName.textContent = 'CYBER-DEALER';
    } else if (mode === 'local') {
      modeSelectBtn.textContent = '模式: 👥 本地';
      playerName.textContent = '玩家 1';
      oppName.textContent = '玩家 2';
    } else if (mode === 'online') {
      state.opponentName = (opponent && opponent.nickname) || '网络黑客';
      modeSelectBtn.textContent = '模式: 🌐 联机';
      playerName.textContent = isHost ? '你 (主机/P1)' : '你 (加入者/P2)';
      oppName.textContent = state.opponentName;

      net.on('msg:action', function (d) {
        if (d.target) executeShot(d.target, true);
      });

      net.on('msg:item', function (d) {
        useItem(d.player, d.itemIdx, true);
      });

      net.on('msg:chamber', function (d) {
        state.chamber = d.chamber;
        state.chamberIdx = 0;
        state.items[1] = d.p1Items;
        state.items[2] = d.p2Items;
        state.overclocked = false;
        state.knownNext = null;
        var live = 0, blank = 0;
        d.chamber.forEach(function (c) { if (c === 'live') live++; else blank++; });
        log('====================================', 'sys');
        log('房主弹夹同步完成：装载 ' + live + ' 发病毒代码，' + blank + ' 发空白指令。', 'sys');
        renderChamberInfo();
        renderHp();
        renderItems();
        updateTurnUI();
      });

      net.on('msg:rematch', function () {
        resetMatch();
      });

      net.on('disconnected', function () {
        alert('对手已断开连接');
        setMode('ai');
      });
    }

    resetMatch();
  }

  /* ---------------- Event Listeners ---------------- */
  btnShootSelf.onclick = function () {
    if (state.gameOver) return;
    if (state.mode !== 'local' && state.turn !== state.myPlayerId) return;
    executeShot('self', false);
  };

  btnShootOpp.onclick = function () {
    if (state.gameOver) return;
    if (state.mode !== 'local' && state.turn !== state.myPlayerId) return;
    executeShot('opp', false);
  };

  modeSelectBtn.onclick = function () {
    if (state.mode === 'ai') setMode('local');
    else setMode('ai');
  };

  onlineLobbyBtn.onclick = function () {
    if (window.OmniNetUI) {
      OmniNetUI.showLobby({
        gameId: 'hack-roulette',
        gameTitle: '暗箱轮盘',
        onReady: function (res) {
          if (res.mode === 'online') setMode('online', res.net, res.isHost, res.opponent);
          else setMode('local');
        }
      });
    }
  };

  playAgainBtn.onclick = function () {
    if (state.mode === 'online' && state.net) {
      state.net.send('rematch', {});
    }
    resetMatch();
  };

  changeModeBtn.onclick = function () {
    overlay.hidden = true;
    onlineLobbyBtn.click();
  };

  if (backBtn) {
    backBtn.onclick = function () {
      try { parent.postMessage({ type: 'omnigame:home' }, '*'); } catch (e) {}
      if (window.parent === window) {
        if (history.length > 1) history.back();
        else window.location.href = '../../index.html';
      }
    };
  }

  // Boot
  setMode('ai');
})();
