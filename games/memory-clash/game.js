/* 记忆翻牌竞速 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '自罚原地做 5 个深蹲 🏃',
    '大喊一声“最强大脑在此！” 📢'
  ];

  var audioCtx = null;
  var soundEnabled = true;
  function getAudioCtx() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function playTone(freq, type, dur, gainVal) {
    if (!soundEnabled) return;
    try {
      var ctx = getAudioCtx();
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(gainVal || 0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch(e) {}
  }

  function playFlip() { playTone(450, 'triangle', 0.05, 0.2); }
  function playMatch() {
    [523, 659, 784].forEach(function(f, idx) {
      setTimeout(function() { playTone(f, 'sine', 0.12, 0.25); }, idx * 60);
    });
  }

  var ICONS = ['🐱', '🐶', '🦊', '🐼', '🦁', '🐸', '🐵', '🦄'];
  var cards = [];
  var flipped = [];
  var matchedCount = 0;
  var turn = 1;
  var isResolving = false;
  var gameOver = false;
  var mode = 'ai';
  var net = null;
  var roundNum = 1;

  var grid = document.getElementById('memoryGrid');
  var statusBanner = document.getElementById('statusBanner');
  var oppAvatarMood = document.getElementById('oppAvatarMood');
  var myAvatarMood = document.getElementById('myAvatarMood');
  var oppBubble = document.getElementById('oppBubble');
  var myBubble = document.getElementById('myBubble');
  var p1Score = 0, p2Score = 0;
  var p1ScoreEl = document.getElementById('p1Score');
  var p2ScoreEl = document.getElementById('p2Score');
  var roundText = document.getElementById('roundText');
  var p1Name = document.getElementById('p1Name');
  var p2Name = document.getElementById('p2Name');
  var opponentTypeBtn = document.getElementById('opponentTypeBtn');
  var backBtn = document.getElementById('backBtn');
  var soundBtn = document.getElementById('soundBtn');
  var rulesBtn = document.getElementById('rulesBtn');
  var onlineBtn = document.getElementById('onlineBtn');
  var penaltyModal = document.getElementById('penaltyModal');
  var penaltyTitle = document.getElementById('penaltyTitle');
  var penaltyResultText = document.getElementById('penaltyResultText');
  var reRollPenaltyBtn = document.getElementById('reRollPenaltyBtn');
  var nextRoundBtn = document.getElementById('nextRoundBtn');

  function initGame() {
    grid.innerHTML = '';
    cards = ICONS.concat(ICONS).sort(function() { return Math.random() - 0.5; });
    flipped = [];
    matchedCount = 0;
    p1Score = 0; p2Score = 0;
    p1ScoreEl.textContent = '0'; p2ScoreEl.textContent = '0';
    turn = 1;
    gameOver = false;
    isResolving = false;

    cards.forEach(function(icon, idx) {
      var card = document.createElement('div');
      card.className = 'memory-card';
      card.setAttribute('data-idx', idx);

      var back = document.createElement('div');
      back.className = 'card-face card-back';
      back.textContent = '❓';

      var front = document.createElement('div');
      front.className = 'card-face card-front';
      front.textContent = icon;

      card.appendChild(back);
      card.appendChild(front);

      card.addEventListener('click', function() {
        if (turn !== 1 || isResolving || gameOver) return;
        flipCard(idx, true);
        if (mode === 'online' && net) net.send('flip', { idx: idx });
      });

      grid.appendChild(card);
    });

    updateStatus();
    oppAvatarMood.textContent = '😏';
    myAvatarMood.textContent = '🐱';
  }

  function flipCard(idx, isP1) {
    var card = grid.children[idx];
    if (card.classList.contains('flipped') || card.classList.contains('matched') || flipped.length >= 2) return;

    playFlip();
    card.classList.add('flipped');
    flipped.push({ idx: idx, icon: cards[idx], el: card });

    if (flipped.length === 2) {
      isResolving = true;
      var c1 = flipped[0], c2 = flipped[1];

      if (c1.icon === c2.icon) {
        // MATCH!
        playMatch();
        setTimeout(function() {
          c1.el.classList.add('matched');
          c2.el.classList.add('matched');
          matchedCount++;

          if (isP1) {
            p1Score++;
            p1ScoreEl.textContent = p1Score;
            myAvatarMood.textContent = '🤩';
            myBubble.textContent = '配对成功！我记性超神！';
          } else {
            p2Score++;
            p2ScoreEl.textContent = p2Score;
            oppAvatarMood.textContent = '😈';
            oppBubble.textContent = '哈哈，又抢到一对！';
          }

          flipped = [];
          isResolving = false;

          if (matchedCount >= 8) {
            handleGameOver();
          } else {
            // Keep turn!
            if (!isP1 && mode === 'ai') setTimeout(aiTurn, 600);
          }
        }, 500);

      } else {
        // NO MATCH
        setTimeout(function() {
          c1.el.classList.remove('flipped');
          c2.el.classList.remove('flipped');
          flipped = [];
          turn = turn === 1 ? 2 : 1;
          updateStatus();
          isResolving = false;

          if (turn === 2 && mode === 'ai') {
            setTimeout(aiTurn, 700);
          }
        }, 850);
      }
    }
  }

  function aiTurn() {
    if (gameOver || isResolving) return;
    // Find unflipped cards
    var available = [];
    for (var i = 0; i < 16; i++) {
      var c = grid.children[i];
      if (!c.classList.contains('matched') && !c.classList.contains('flipped')) {
        available.push(i);
      }
    }
    if (available.length < 2) return;
    available.sort(function() { return Math.random() - 0.5; });
    flipCard(available[0], false);
    setTimeout(function() {
      flipCard(available[1], false);
    }, 400);
  }

  function handleGameOver() {
    gameOver = true;
    var p1Won = p1Score > p2Score;
    if (p1Won) {
      statusBanner.textContent = '🎉 记忆之王！你以 ' + p1Score + ' 对领先获胜！';
      myAvatarMood.textContent = '🏆';
      myAvatarMood.classList.add('celebrate');
      oppAvatarMood.textContent = '😭';
    } else {
      statusBanner.textContent = '💥 对手记性更强，你惜败！';
      oppAvatarMood.textContent = '👑';
      oppAvatarMood.classList.add('celebrate');
      myAvatarMood.textContent = '😵';
    }

    setTimeout(function() {
      penaltyTitle.textContent = p1Won ? '记忆大师获胜！' : '记忆翻牌惜败！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 800);
  }

  function updateStatus() {
    if (gameOver) return;
    statusBanner.textContent = turn === 1 ? '🟢 轮到你翻牌（翻中可连击）' : '⏳ 轮到对方翻牌…';
  }

  opponentTypeBtn.addEventListener('click', function() {
    mode = mode === 'ai' ? 'local' : 'ai';
    opponentTypeBtn.textContent = mode === 'ai' ? '🤖 智能人机' : '👥 同屏双人';
    initGame();
  });

  if (backBtn) {

    backBtn.addEventListener('click', function() {
      try { parent.postMessage({ type: 'omnigame:home' }, '*'); } catch (e) {}
      if (window.parent === window) {
        if (history.length > 1) history.back();
        else window.location.href = '../../index.html';
      }
    });

  }

  soundBtn.addEventListener('click', function() {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  rulesBtn.addEventListener('click', function() { document.getElementById('rulesModal').classList.remove('hidden'); });
  document.getElementById('closeRulesBtn').addEventListener('click', function() { document.getElementById('rulesModal').classList.add('hidden'); });

  reRollPenaltyBtn.addEventListener('click', function() {
    penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
  });

  nextRoundBtn.addEventListener('click', function() {
    penaltyModal.classList.add('hidden');
    roundNum++;
    roundText.textContent = '第 ' + roundNum + ' 局';
    initGame();
  });

  onlineBtn.addEventListener('click', function() {
    if (window.OmniNetUI && window.OmniNetUI.openLobby) {
      window.OmniNetUI.openLobby('memory-clash', '记忆翻牌竞速', function(session) {
        if (!session) return;
        mode = session.mode;
        net = session.net;
        if (mode === 'online') {
          opponentTypeBtn.textContent = '🌐 联机对战';
          p1Name.textContent = '你';
          p2Name.textContent = (session.opponent && session.opponent.nickname) || '联机好友';

          net.on('msg:flip', function(data) {
            flipCard(data.idx, false);
          });
          initGame();
        }
      });
    }
  });

  initGame();
})();