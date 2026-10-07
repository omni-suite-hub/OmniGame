// Two-Player Mahjong (二人麻将) - OmniGame High Polish Engine
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

  function playDiscardSound() { playTone(360, 0.08, 'triangle', 0.12); }
  function playDrawSound() { playTone(540, 0.06, 'sine', 0.1); }
  function playPengSound() {
    playTone(440, 0.12, 'square', 0.15);
    setTimeout(function () { playTone(660, 0.15, 'square', 0.18); }, 80);
  }
  function playHuSound() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { playTone(f, 0.25, 'triangle', 0.25); }, i * 110);
    });
  }

  // Tile definitions:
  // type: 'wan' (value: 1..9), 'zi' (value: 1..7: 东 南 西 北 中 发 白)
  var ZI_NAMES = ['', '东', '南', '西', '北', '中', '发', '白'];
  var WAN_NUMS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  function createTile(type, value, id) {
    var char = type === 'wan' ? WAN_NUMS[value] : ZI_NAMES[value];
    var sub = type === 'wan' ? '萬' : (value <= 4 ? '風' : '箭');
    var color = type === 'wan' ? 'c-wan' : 'c-zi';
    return {
      id: id,
      type: type,
      value: value,
      char: char,
      sub: sub,
      color: color,
      key: type + '_' + value
    };
  }

  function generateDeck() {
    var deck = [];
    var uid = 1;
    // 4 of each Wan (1-9)
    for (var v = 1; v <= 9; v++) {
      for (var k = 0; k < 4; k++) {
        deck.push(createTile('wan', v, uid++));
      }
    }
    // 4 of each Wind & Dragon (1-7)
    for (var z = 1; z <= 7; z++) {
      for (var j = 0; j < 4; j++) {
        deck.push(createTile('zi', z, uid++));
      }
    }
    // Shuffle deck
    for (var i = deck.length - 1; i > 0; i--) {
      var r = Math.floor(Math.random() * (i + 1));
      var tmp = deck[i];
      deck[i] = deck[r];
      deck[r] = tmp;
    }
    return deck;
  }

  // Mahjong winning (Hu) checker
  function canHu(hand) {
    if (hand.length % 3 !== 2) return false;
    var counts = {};
    for (var i = 0; i < hand.length; i++) {
      var k = hand[i].key;
      counts[k] = (counts[k] || 0) + 1;
    }

    // Try each unique tile as the Pair (将牌)
    var keys = Object.keys(counts);
    for (var p = 0; p < keys.length; p++) {
      var pairKey = keys[p];
      if (counts[pairKey] >= 2) {
        var copy = Object.assign({}, counts);
        copy[pairKey] -= 2;
        if (checkMelds(copy)) return true;
      }
    }
    return false;
  }

  function checkMelds(counts) {
    var firstKey = null;
    for (var k in counts) {
      if (counts[k] > 0) {
        firstKey = k;
        break;
      }
    }
    if (!firstKey) return true; // All matched

    var parts = firstKey.split('_');
    var type = parts[0];
    var val = parseInt(parts[1], 10);

    // Option 1: Triplet (刻子)
    if (counts[firstKey] >= 3) {
      counts[firstKey] -= 3;
      if (checkMelds(counts)) return true;
      counts[firstKey] += 3;
    }

    // Option 2: Sequence (顺子) - only Wan can form sequences
    if (type === 'wan' && val <= 7) {
      var k2 = 'wan_' + (val + 1);
      var k3 = 'wan_' + (val + 2);
      if ((counts[k2] || 0) > 0 && (counts[k3] || 0) > 0) {
        counts[firstKey]--;
        counts[k2]--;
        counts[k3]--;
        if (checkMelds(counts)) return true;
        counts[firstKey]++;
        counts[k2]++;
        counts[k3]++;
      }
    }

    return false;
  }

  function sortHand(hand) {
    return hand.slice().sort(function (a, b) {
      if (a.type !== b.type) {
        return a.type === 'wan' ? -1 : 1;
      }
      return a.value - b.value;
    });
  }

  // Game state
  var wall = [];
  var playerHand = [];
  var playerDraw = null;
  var botHand = [];
  var botDraw = null;
  var playerRiver = [];
  var botRiver = [];
  var playerScore = 1000;
  var botScore = 1000;
  var currentTurn = 'player'; // 'player' or 'bot'
  var isGameOver = false;
  var pendingDiscard = null; // Tile waiting for player action (Peng, Hu)

  // DOM elements
  var wallCountEl = document.getElementById('wallCount');
  var turnTextEl = document.getElementById('turnText');
  var playerScoreEl = document.getElementById('playerScore');
  var botScoreEl = document.getElementById('botScore');
  var botHandEl = document.getElementById('botHand');
  var botRiverEl = document.getElementById('botRiver');
  var playerRiverEl = document.getElementById('playerRiver');
  var playerHandEl = document.getElementById('playerHand');
  var playerDrawSlotEl = document.getElementById('playerDrawSlot');
  var actionBarEl = document.getElementById('actionBar');
  var btnHu = document.getElementById('btnHu');
  var btnPeng = document.getElementById('btnPeng');
  var btnPass = document.getElementById('btnPass');
  var restartBtn = document.getElementById('restartBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalTitleEl = document.getElementById('modalTitle');
  var modalDescEl = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');
  var soundBtn = document.getElementById('soundBtn');

  function initGame() {
    wall = generateDeck();
    playerRiver = [];
    botRiver = [];
    pendingDiscard = null;
    isGameOver = false;

    // Deal 13 tiles each
    playerHand = [];
    botHand = [];
    for (var i = 0; i < 13; i++) {
      playerHand.push(wall.pop());
      botHand.push(wall.pop());
    }
    playerHand = sortHand(playerHand);

    playerDraw = null;
    botDraw = null;
    modalEl.classList.remove('active');
    hideActionBar();

    // Player starts by drawing 14th tile
    startPlayerTurn();
  }

  function startPlayerTurn() {
    if (wall.length === 0) {
      endRound('流局 (平手)', '牌墙已摸空，双方未分胜负！', 0);
      return;
    }
    currentTurn = 'player';
    turnTextEl.textContent = '你的回合 (出牌)';
    playerDraw = wall.pop();
    playDrawSound();
    render();

    // Check if player self-drew winning tile (自摸)
    var fullHand = playerHand.concat([playerDraw]);
    if (canHu(fullHand)) {
      showActionBar(true, false);
    }
  }

  function playerDiscard(tile, isDrawnTile) {
    if (currentTurn !== 'player' || isGameOver) return;
    initAudio();
    playDiscardSound();
    hideActionBar();

    if (isDrawnTile) {
      playerRiver.push(playerDraw);
      pendingDiscard = playerDraw;
      playerDraw = null;
    } else {
      var idx = playerHand.findIndex(function (t) { return t.id === tile.id; });
      if (idx >= 0) {
        playerRiver.push(playerHand[idx]);
        pendingDiscard = playerHand[idx];
        playerHand.splice(idx, 1);
        if (playerDraw) {
          playerHand.push(playerDraw);
          playerDraw = null;
        }
      }
    }
    playerHand = sortHand(playerHand);
    render();

    // Check if Bot can Hu or Peng on this discard
    checkBotReaction();
  }

  function checkBotReaction() {
    var botTest = botHand.concat([pendingDiscard]);
    if (canHu(botTest)) {
      playHuSound();
      endRound('电脑胡牌！', '电脑抓住了你的放铳，点炮结算 -200分！', -200);
      return;
    }

    // Bot skips Peng to keep simple, moves to bot draw
    setTimeout(startBotTurn, 400);
  }

  function startBotTurn() {
    if (isGameOver) return;
    if (wall.length === 0) {
      endRound('流局 (平手)', '牌墙已摸空！', 0);
      return;
    }
    currentTurn = 'bot';
    turnTextEl.textContent = '电脑思考中...';
    botDraw = wall.pop();
    render();

    setTimeout(function () {
      // Check bot Hu (自摸)
      var botFull = botHand.concat([botDraw]);
      if (canHu(botFull)) {
        playHuSound();
        endRound('电脑自摸！', '电脑自摸胡牌，结算 -300分！', -300);
        return;
      }

      // Bot AI picks discard: find least useful tile
      var discardCandidate = botDraw;
      // Prefer discarding isolated honors (zi)
      var counts = {};
      botFull.forEach(function (t) { counts[t.key] = (counts[t.key] || 0) + 1; });
      var isolatedZi = botFull.find(function (t) { return t.type === 'zi' && counts[t.key] === 1; });
      if (isolatedZi) {
        discardCandidate = isolatedZi;
      }

      var bIdx = botHand.findIndex(function (t) { return t.id === discardCandidate.id; });
      if (bIdx >= 0) {
        botRiver.push(botHand[bIdx]);
        pendingDiscard = botHand[bIdx];
        botHand.splice(bIdx, 1);
        botHand.push(botDraw);
      } else {
        botRiver.push(botDraw);
        pendingDiscard = botDraw;
      }
      botDraw = null;
      playDiscardSound();
      render();

      // Check player reactions on Bot's discard (Hu or Peng)
      checkPlayerReaction();
    }, 600);
  }

  function checkPlayerReaction() {
    if (!pendingDiscard) return;
    var testHand = playerHand.concat([pendingDiscard]);
    var canPlayerHu = canHu(testHand);

    var sameCount = playerHand.filter(function (t) { return t.key === pendingDiscard.key; }).length;
    var canPlayerPeng = sameCount >= 2;

    if (canPlayerHu || canPlayerPeng) {
      showActionBar(canPlayerHu, canPlayerPeng);
    } else {
      setTimeout(startPlayerTurn, 300);
    }
  }

  function showActionBar(showHu, showPeng) {
    actionBarEl.classList.add('active');
    btnHu.style.display = showHu ? 'inline-block' : 'none';
    btnPeng.style.display = showPeng ? 'inline-block' : 'none';
    btnPass.style.display = 'inline-block';
  }

  function hideActionBar() {
    actionBarEl.classList.remove('active');
  }

  function handleHuClick() {
    initAudio();
    playHuSound();
    hideActionBar();
    if (pendingDiscard) {
      playerHand.push(pendingDiscard);
      pendingDiscard = null;
    } else if (playerDraw) {
      playerHand.push(playerDraw);
      playerDraw = null;
    }
    playerHand = sortHand(playerHand);
    render();
    endRound('胡牌大胜利！🎉', '成功自摸/荣和！精彩胡牌斩获 +300分！', 300);
  }

  function handlePengClick() {
    initAudio();
    playPengSound();
    hideActionBar();
    // Move 2 matching cards from hand + pending discard to melds/hand
    var matching = playerHand.filter(function (t) { return t.key === pendingDiscard.key; }).slice(0, 2);
    matching.forEach(function (m) {
      var idx = playerHand.findIndex(function (t) { return t.id === m.id; });
      if (idx >= 0) playerHand.splice(idx, 1);
    });
    // Add peng triplet
    playerHand = sortHand(playerHand);
    pendingDiscard = null;
    currentTurn = 'player';
    turnTextEl.textContent = '碰牌成功！请选择一张手牌打出';
    render();
  }

  function handlePassClick() {
    hideActionBar();
    pendingDiscard = null;
    if (currentTurn === 'player') {
      // passed on self-draw Hu, player still needs to discard
    } else {
      setTimeout(startPlayerTurn, 200);
    }
  }

  function endRound(title, desc, deltaScore) {
    isGameOver = true;
    playerScore += deltaScore;
    botScore -= deltaScore;
    playerScoreEl.textContent = playerScore;
    botScoreEl.textContent = botScore;
    modalTitleEl.textContent = title;
    modalDescEl.textContent = desc;
    modalEl.classList.add('active');
  }

  function createTileDOM(tile, isDraw) {
    var el = document.createElement('div');
    el.className = 'mj-tile';
    var cSpan = document.createElement('span');
    cSpan.className = 'tile-c ' + tile.color;
    cSpan.textContent = tile.char;
    var sSpan = document.createElement('span');
    sSpan.className = 'tile-s ' + tile.color;
    sSpan.textContent = tile.sub;
    el.appendChild(cSpan);
    el.appendChild(sSpan);

    el.addEventListener('click', function () {
      playerDiscard(tile, !!isDraw);
    });
    return el;
  }

  function render() {
    wallCountEl.textContent = wall.length;
    playerScoreEl.textContent = playerScore;
    botScoreEl.textContent = botScore;

    // Bot Hand (Backs)
    botHandEl.innerHTML = '';
    var totalBotTiles = botHand.length + (botDraw ? 1 : 0);
    for (var b = 0; b < totalBotTiles; b++) {
      var back = document.createElement('div');
      back.className = 'bot-tile-back';
      botHandEl.appendChild(back);
    }

    // Bot River
    botRiverEl.innerHTML = '';
    botRiver.forEach(function (t) {
      var r = document.createElement('div');
      r.className = 'river-tile';
      r.innerHTML = '<span class="r-char ' + t.color + '">' + t.char + '</span><span class="r-sub ' + t.color + '">' + t.sub + '</span>';
      botRiverEl.appendChild(r);
    });

    // Player River
    playerRiverEl.innerHTML = '';
    playerRiver.forEach(function (t) {
      var r2 = document.createElement('div');
      r2.className = 'river-tile';
      r2.innerHTML = '<span class="r-char ' + t.color + '">' + t.char + '</span><span class="r-sub ' + t.color + '">' + t.sub + '</span>';
      playerRiverEl.appendChild(r2);
    });

    // Player Hand
    playerHandEl.innerHTML = '';
    playerHand.forEach(function (t) {
      playerHandEl.appendChild(createTileDOM(t, false));
    });

    // Player Draw Slot
    playerDrawSlotEl.innerHTML = '';
    if (playerDraw) {
      playerDrawSlotEl.appendChild(createTileDOM(playerDraw, true));
    }
  }

  btnHu.addEventListener('click', handleHuClick);
  btnPeng.addEventListener('click', handlePengClick);
  btnPass.addEventListener('click', handlePassClick);
  restartBtn.addEventListener('click', initGame);
  modalRestartBtn.addEventListener('click', initGame);

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  initGame();
})();
