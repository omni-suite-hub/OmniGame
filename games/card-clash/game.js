/*
 * games/card-clash/game.js
 * 卡牌比大小 (Card Clash) — 办公室极简摸鱼对决
 * 支持 单张比大小 / 三张牌对决 (炸金花模式) / 加倍博弈
 * 支持 WebRTC 局域网/跨网联机、同屏对战、老千 AI 与办公室惩罚抽签！
 */
(function () {
  'use strict';

  var SUITS = [
    { id: 'spades', symbol: '♠', name: '黑桃', color: 'black', power: 4 },
    { id: 'hearts', symbol: '♥', name: '红桃', color: 'red', power: 3 },
    { id: 'clubs', symbol: '♣', name: '梅花', color: 'black', power: 2 },
    { id: 'diamonds', symbol: '♦', name: '方块', color: 'red', power: 1 }
  ];

  var RANKS = [
    { val: 2, label: '2' },
    { val: 3, label: '3' },
    { val: 4, label: '4' },
    { val: 5, label: '5' },
    { val: 6, label: '6' },
    { val: 7, label: '7' },
    { val: 8, label: '8' },
    { val: 9, label: '9' },
    { val: 10, label: '10' },
    { val: 11, label: 'J' },
    { val: 12, label: 'Q' },
    { val: 13, label: 'K' },
    { val: 14, label: 'A' }
  ];

  var PENALTIES = [
    '请赢家喝一杯大杯拿铁 ☕',
    '下楼帮全组拿今日外卖 🥡',
    '前台取快递送到工位 📦',
    '群里发两元大红包 🧧',
    '为赢家真诚捶背一分钟 💆',
    '承包今天下午垃圾倾倒 🗑️',
    '自罚原地做 8 个深蹲 🏃',
    '赞美赢家是办公室扑克之王 👑'
  ];

  // Sound Synthesizer
  var audioCtx = null;
  var soundEnabled = true;

  try {
    var storedSound = localStorage.getItem('omg:sound');
    if (storedSound !== null) soundEnabled = storedSound === 'true';
  } catch (e) {}

  function getAudioCtx() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playTone(freq, type, dur, gainVal, ramp) {
    if (!soundEnabled) return;
    try {
      var ctx = getAudioCtx();
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (ramp) osc.frequency.exponentialRampToValueAtTime(ramp, ctx.currentTime + dur);
      gain.gain.setValueAtTime(gainVal || 0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch (e) {}
  }

  function playCardDeal() {
    playTone(450, 'triangle', 0.08, 0.18, 220);
  }

  function playCardFlip() {
    playTone(320, 'sine', 0.1, 0.22, 680);
  }

  function playDouble() {
    playTone(300, 'square', 0.15, 0.18, 600);
  }

  function playWin() {
    if (!soundEnabled) return;
    var notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach(function (n, idx) {
      setTimeout(function () {
        playTone(n, 'triangle', 0.16, 0.25);
      }, idx * 60);
    });
  }

  // State
  var mode = 'single'; // 'single' | 'three'
  var oppType = 'ai'; // 'ai' | 'local' | 'online'
  var net = null;
  var isHost = true;

  var round = 1;
  var p1Score = 0;
  var p2Score = 0;
  var isDoubled = false;

  var p1Hand = [];
  var p2Hand = [];
  var isDealt = false;
  var isRevealed = false;

  // DOM Elements
  var soundBtn = document.getElementById('soundBtn');
  var rulesBtn = document.getElementById('rulesBtn');
  var onlineBtn = document.getElementById('onlineBtn');
  var opponentTypeBtn = document.getElementById('opponentTypeBtn');
  var cardModePills = document.getElementById('cardModePills');

  var p1ScoreEl = document.getElementById('p1Score');
  var p2ScoreEl = document.getElementById('p2Score');
  var p1NameEl = document.getElementById('p1Name');
  var p2NameEl = document.getElementById('p2Name');
  var roundBadge = document.getElementById('roundBadge');

  var myCardsTray = document.getElementById('myCardsTray');
  var oppCardsTray = document.getElementById('oppCardsTray');
  var myRankText = document.getElementById('myRankText');
  var oppRankText = document.getElementById('oppRankText');
  var clashResultBanner = document.getElementById('clashResultBanner');
  var deckPile = document.getElementById('deckPile');

  var dealBtn = document.getElementById('dealBtn');
  var doubleBtn = document.getElementById('doubleBtn');
  var revealBtn = document.getElementById('revealBtn');

  // Penalty Modal
  var penaltyModal = document.getElementById('penaltyModal');
  var penaltyModalTitle = document.getElementById('penaltyModalTitle');
  var cardPenaltyText = document.getElementById('cardPenaltyText');
  var reRollCardPenaltyBtn = document.getElementById('reRollCardPenaltyBtn');
  var nextCardRoundBtn = document.getElementById('nextCardRoundBtn');

  // Rules Modal
  var rulesModal = document.getElementById('rulesModal');
  var closeRulesBtn = document.getElementById('closeRulesBtn');
  var knowRulesBtn = document.getElementById('knowRulesBtn');

  // Generate Deck
  function createFullDeck() {
    var deck = [];
    SUITS.forEach(function (suit) {
      RANKS.forEach(function (rank) {
        deck.push({
          suit: suit,
          rank: rank,
          id: suit.symbol + rank.label
        });
      });
    });
    // Shuffle Fisher-Yates
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = deck[i];
      deck[i] = deck[j];
      deck[j] = temp;
    }
    return deck;
  }

  function resetRound() {
    isDealt = false;
    isRevealed = false;
    isDoubled = false;
    p1Hand = [];
    p2Hand = [];

    myCardsTray.innerHTML = '';
    oppCardsTray.innerHTML = '';

    dealBtn.disabled = false;
    doubleBtn.disabled = true;
    doubleBtn.classList.remove('active');
    revealBtn.disabled = true;

    myRankText.textContent = '等待发牌…';
    oppRankText.textContent = '等待发牌…';
    clashResultBanner.textContent = '点击“洗牌发牌”开局';
    roundBadge.textContent = '第 ' + round + ' 局';
  }

  // Render 3D Card Element
  function createCardElement(card, flipped) {
    var cardItem = document.createElement('div');
    cardItem.className = 'card-item deal-anim' + (flipped ? ' flipped' : '');

    var inner = document.createElement('div');
    inner.className = 'card-inner';

    // Back
    var back = document.createElement('div');
    back.className = 'card-back';

    // Front
    var front = document.createElement('div');
    front.className = 'card-front suit-' + card.suit.color;

    var top = document.createElement('div');
    top.className = 'card-top';
    top.innerHTML = '<span>' + card.rank.label + '</span><span>' + card.suit.symbol + '</span>';

    var center = document.createElement('div');
    center.className = 'card-center';
    center.textContent = card.suit.symbol;

    var btm = document.createElement('div');
    btm.className = 'card-bottom';
    btm.innerHTML = '<span>' + card.rank.label + '</span><span>' + card.suit.symbol + '</span>';

    front.appendChild(top);
    front.appendChild(center);
    front.appendChild(btm);

    inner.appendChild(back);
    inner.appendChild(front);
    cardItem.appendChild(inner);

    return cardItem;
  }

  function renderDealtCards(count) {
    myCardsTray.innerHTML = '';
    oppCardsTray.innerHTML = '';

    p2Hand.forEach(function (card, i) {
      setTimeout(function () {
        var el = createCardElement(card, false);
        oppCardsTray.appendChild(el);
      }, i * 100);
    });

    p1Hand.forEach(function (card, i) {
      setTimeout(function () {
        var el = createCardElement(card, true);
        myCardsTray.appendChild(el);
      }, (i + count) * 100);
    });

    setTimeout(function () {
      myRankText.textContent = evaluateHandRank(p1Hand).name;
      oppRankText.textContent = '暗牌待揭晓…';
      clashResultBanner.textContent = '手牌已就绪！可加倍或直接翻牌！';
    }, (count * 2 + 1) * 100);
  }

  var oppAvatarMood = document.getElementById('oppAvatarMood');
  var myAvatarMood = document.getElementById('myAvatarMood');
  var oppBubble = document.getElementById('oppBubble');
  var myBubble = document.getElementById('myBubble');

  // Deal Cards
  function doDeal() {
    if (isDealt) return;
    if (oppType === 'online' && !isHost) {
      if (net) net.send('reqDeal', {});
      clashResultBanner.textContent = '已请求房主洗牌发牌…';
      return;
    }
    isDealt = true;
    playCardDeal();

    dealBtn.disabled = true;
    doubleBtn.disabled = false;
    revealBtn.disabled = false;

    if (myAvatarMood) myAvatarMood.textContent = '🔥';
    if (myBubble) myBubble.textContent = '看我发绝杀底牌！';
    if (oppAvatarMood) oppAvatarMood.textContent = '😏';
    if (oppBubble) oppBubble.textContent = '我的手牌深不可测！';

    var deck = createFullDeck();
    var count = mode === 'three' ? 3 : 1;

    p1Hand = deck.splice(0, count);
    p2Hand = deck.splice(0, count);

    renderDealtCards(count);

    if (oppType === 'online' && net) {
      net.send('dealt', {
        hostHand: p1Hand,
        guestHand: p2Hand,
        count: count
      });
    }
  }

  // Double Mechanism
  function doDouble(fromRemote) {
    if (!isDealt || isRevealed || isDoubled) return;
    isDoubled = true;
    playDouble();
    doubleBtn.classList.add('active');
    doubleBtn.disabled = true;
    clashResultBanner.textContent = fromRemote ? '⚡ 对方发起了加倍！战况升级！' : '⚡ 决斗已加倍！惩罚升级！';

    if (fromRemote) {
      if (oppAvatarMood) { oppAvatarMood.textContent = '⚡'; oppAvatarMood.classList.add('celebrate'); }
      if (oppBubble) oppBubble.textContent = '敢不敢跟？加倍！';
      if (myAvatarMood) myAvatarMood.textContent = '😬';
      if (myBubble) myBubble.textContent = '来就来，谁怕谁！';
    } else {
      if (myAvatarMood) { myAvatarMood.textContent = '⚡'; myAvatarMood.classList.add('celebrate'); }
      if (myBubble) myBubble.textContent = '乘胜追击！加倍决战！';
      if (oppAvatarMood) oppAvatarMood.textContent = '🤔';
      if (oppBubble) oppBubble.textContent = '虚张声势吧？';
    }

    if (!fromRemote && oppType === 'online' && net) {
      net.send('doubled', {});
    }
  }

  // Reveal & Settle
  function doReveal(fromRemote) {
    if (!isDealt || isRevealed) return;
    isRevealed = true;
    playCardFlip();

    doubleBtn.disabled = true;
    revealBtn.disabled = true;

    if (!fromRemote && oppType === 'online' && net) {
      net.send('revealed', {});
    }

    // Flip opponent cards
    var oppCardEls = oppCardsTray.querySelectorAll('.card-item');
    oppCardEls.forEach(function (el) {
      el.classList.add('flipped');
    });

    var p1Eval = evaluateHandRank(p1Hand);
    var p2Eval = evaluateHandRank(p2Hand);

    oppRankText.textContent = p2Eval.name;

    var winner = compareEvals(p1Eval, p2Eval);

    setTimeout(function () {
      if (winner === 1) {
        p1Score += isDoubled ? 2 : 1;
        p1ScoreEl.textContent = p1Score;
        playWin();
        clashResultBanner.textContent = '🎉 你赢了！' + p1Eval.name + ' 压制 ' + p2Eval.name + (isDoubled ? ' (双倍胜!)' : '');
        highlightWinner(myCardsTray);
        if (myAvatarMood) { myAvatarMood.textContent = '🥳'; myAvatarMood.classList.add('celebrate'); }
        if (myBubble) myBubble.textContent = '压制全场！大获全胜！👑';
        if (oppAvatarMood) { oppAvatarMood.textContent = '😭'; oppAvatarMood.classList.remove('celebrate'); }
        if (oppBubble) oppBubble.textContent = '竟然抽到这么大的牌…';
      } else if (winner === 2) {
        p2Score += isDoubled ? 2 : 1;
        p2ScoreEl.textContent = p2Score;
        clashResultBanner.textContent = '💔 对方胜出！' + p2Eval.name + ' 大于 ' + p1Eval.name + (isDoubled ? ' (双倍罚!)' : '');
        highlightWinner(oppCardsTray);
        if (oppAvatarMood) { oppAvatarMood.textContent = '😎'; oppAvatarMood.classList.add('celebrate'); }
        if (oppBubble) oppBubble.textContent = '我的牌力更胜一筹！👑';
        if (myAvatarMood) { myAvatarMood.textContent = '😢'; myAvatarMood.classList.remove('celebrate'); }
        if (myBubble) myBubble.textContent = '差了一点点…';
      } else {
        clashResultBanner.textContent = '🤝 平局！牌力完全一致！';
        if (myAvatarMood) { myAvatarMood.textContent = '😲'; myAvatarMood.classList.remove('celebrate'); }
        if (oppAvatarMood) { oppAvatarMood.textContent = '😲'; oppAvatarMood.classList.remove('celebrate'); }
        if (myBubble) myBubble.textContent = '一模一样的牌力！';
        if (oppBubble) oppBubble.textContent = '不分伯仲！再来！🔥';
      }

      round++;
      setTimeout(function () {
        if (winner === 1 || winner === 2) {
          showPenaltyModal(winner === 1 ? '你大获全胜！快开出输家惩罚吧！' : '惜败！来看看你今天的办公室命运：');
        } else {
          resetRound();
        }
      }, 1800);
    }, 400);
  }

  function highlightWinner(tray) {
    var items = tray.querySelectorAll('.card-item');
    items.forEach(function (c) { c.classList.add('winner-card'); });
  }

  // Hand Evaluation (Single Card & 3-Card Poker)
  function evaluateHandRank(hand) {
    if (hand.length === 1) {
      var c = hand[0];
      return {
        type: 'single',
        score: c.rank.val * 10 + c.suit.power,
        name: c.suit.name + ' ' + c.rank.label
      };
    }

    // 3 Cards Evaluation
    // Sort descending by rank
    var sorted = hand.slice().sort(function (a, b) {
      if (b.rank.val !== a.rank.val) return b.rank.val - a.rank.val;
      return b.suit.power - a.suit.power;
    });

    var isFlush = (sorted[0].suit.id === sorted[1].suit.id && sorted[1].suit.id === sorted[2].suit.id);
    var isStraight = (sorted[0].rank.val === sorted[1].rank.val + 1 && sorted[1].rank.val === sorted[2].rank.val + 1) ||
                     (sorted[0].rank.val === 14 && sorted[1].rank.val === 3 && sorted[2].rank.val === 2); // A-3-2

    var isTrio = (sorted[0].rank.val === sorted[1].rank.val && sorted[1].rank.val === sorted[2].rank.val);
    var isPair = (sorted[0].rank.val === sorted[1].rank.val || sorted[1].rank.val === sorted[2].rank.val);

    // Type Score Multipliers:
    // Trio: 600000, Straight Flush: 500000, Flush: 400000, Straight: 300000, Pair: 200000, High Card: 100000
    if (isTrio) {
      return { score: 600000 + sorted[0].rank.val, name: '🐆 豹子三条 (' + sorted[0].rank.label + ')' };
    }
    if (isFlush && isStraight) {
      return { score: 500000 + sorted[0].rank.val * 10 + sorted[0].suit.power, name: '👑 同花顺 (' + sorted[0].rank.label + '高)' };
    }
    if (isFlush) {
      return { score: 400000 + sorted[0].rank.val * 100 + sorted[1].rank.val * 10 + sorted[2].rank.val, name: '💎 同花金花' };
    }
    if (isStraight) {
      return { score: 300000 + sorted[0].rank.val * 10 + sorted[0].suit.power, name: '⚡ 顺子拖拉机' };
    }
    if (isPair) {
      var pairVal = (sorted[0].rank.val === sorted[1].rank.val) ? sorted[0].rank.val : sorted[1].rank.val;
      var kicker = (sorted[0].rank.val === sorted[1].rank.val) ? sorted[2].rank.val : sorted[0].rank.val;
      return { score: 200000 + pairVal * 100 + kicker, name: '👯 对子 (' + pairVal + ')' };
    }
    return {
      score: 100000 + sorted[0].rank.val * 100 + sorted[1].rank.val * 10 + sorted[2].rank.val,
      name: '🃏 单牌高牌 (' + sorted[0].rank.label + '领衔)'
    };
  }

  function compareEvals(e1, e2) {
    if (e1.score > e2.score) return 1;
    if (e2.score > e1.score) return 2;
    return 0;
  }

  // Penalty Modal
  function showPenaltyModal(title) {
    penaltyModalTitle.textContent = title;
    rollPenalty();
    penaltyModal.classList.remove('hidden');
  }

  function rollPenalty() {
    var p = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
    if (isDoubled) {
      p = '⚡【双倍惩罚】' + p;
    }
    cardPenaltyText.textContent = p;
  }

  // Button Listeners
  dealBtn.addEventListener('click', doDeal);
  deckPile.addEventListener('click', doDeal);
  doubleBtn.addEventListener('click', doDouble);
  revealBtn.addEventListener('click', doReveal);

  if (reRollCardPenaltyBtn) reRollCardPenaltyBtn.addEventListener('click', rollPenalty);
  if (nextCardRoundBtn) {
    nextCardRoundBtn.addEventListener('click', function () {
      penaltyModal.classList.add('hidden');
      if (oppType === 'online' && net) {
        net.send('nextRound', {});
      }
      resetRound();
    });
  }

  var backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', function () {
      try { parent.postMessage({ type: 'omnigame:home' }, '*'); } catch (e) {}
      if (window.parent === window) {
        if (history.length > 1) history.back();
        else window.location.href = '../../index.html';
      }
    });
  }

  // Mode Pills
  if (cardModePills) {
    cardModePills.addEventListener('click', function (e) {
      var pill = e.target.closest('.pill');
      if (pill && pill.dataset.mode) {
        var pills = cardModePills.querySelectorAll('.pill');
        pills.forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        mode = pill.dataset.mode;
        resetRound();
      }
    });
  }

  // Sound Toggle
  if (soundBtn) {
    soundBtn.addEventListener('click', function () {
      soundEnabled = !soundEnabled;
      soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
      try { localStorage.setItem('omg:sound', soundEnabled ? 'true' : 'false'); } catch (e) {}
    });
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  }

  // Rules Modal
  if (rulesBtn) rulesBtn.addEventListener('click', function () { rulesModal.classList.remove('hidden'); });
  if (closeRulesBtn) closeRulesBtn.addEventListener('click', function () { rulesModal.classList.add('hidden'); });
  if (knowRulesBtn) knowRulesBtn.addEventListener('click', function () { rulesModal.classList.add('hidden'); });

  // Opponent Type Toggle
  if (opponentTypeBtn) {
    opponentTypeBtn.addEventListener('click', function () {
      if (oppType === 'ai') {
        oppType = 'local';
        opponentTypeBtn.textContent = '👥 同屏对决';
        p2NameEl.textContent = '玩家2';
      } else {
        oppType = 'ai';
        opponentTypeBtn.textContent = '🤖 人机: 扑克赌神';
        p2NameEl.textContent = '扑克赌神';
      }
      resetRound();
    });
  }

  // Online Multiplayer
  if (onlineBtn) {
    onlineBtn.addEventListener('click', function () {
      if (window.OmniNetUI && window.OmniNetUI.openLobby) {
        window.OmniNetUI.openLobby('card-clash', '卡牌比大小', function (session) {
          if (!session) return;
          oppType = session.mode;
          net = session.net;
          isHost = session.isHost;

          if (oppType === 'online') {
            opponentTypeBtn.textContent = '🌐 联机对战中';
            p1NameEl.textContent = '你 (' + (isHost ? '房主' : '加入者') + ')';
            p2NameEl.textContent = (session.opponent && session.opponent.nickname) || '联机好友';

            net.on('msg:dealt', function (data) {
              isDealt = true;
              playCardDeal();
              dealBtn.disabled = true;
              doubleBtn.disabled = false;
              revealBtn.disabled = false;
              p1Hand = data.guestHand;
              p2Hand = data.hostHand;
              renderDealtCards(data.count);
            });

            net.on('msg:reqDeal', function () {
              if (isHost && !isDealt) doDeal();
            });

            net.on('msg:doubled', function () {
              doDouble(true);
            });

            net.on('msg:revealed', function () {
              doReveal(true);
            });

            net.on('msg:nextRound', function () {
              penaltyModal.classList.add('hidden');
              resetRound();
            });

            net.on('disconnected', function () {
              clashResultBanner.textContent = '⚠️ 对方已离开房间';
              oppType = 'ai';
              opponentTypeBtn.textContent = '🤖 人机: 扑克赌神';
            });
          }
          resetRound();
        });
      }
    });
  }

  // Keyboard Shortcuts
  window.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'Enter') {
      if (!isDealt) doDeal();
      else if (!isRevealed) doReveal();
    } else if (e.key === 'd' || e.key === 'D') {
      doDouble();
    } else if (e.key === 'Escape') {
      if (rulesModal) rulesModal.classList.add('hidden');
    }
  });

  resetRound();
})();
