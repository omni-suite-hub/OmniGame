/* 拆弹心跳博弈 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '自罚原地做 10 个深蹲 🏃',
    '大喊一声“轰！我被炸焦了！” 📢'
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

  function playSnip() { playTone(800, 'sawtooth', 0.04, 0.25); }
  function playBoom() { playTone(80, 'square', 0.5, 0.5); }
  function playDefuse() {
    [523, 659, 784, 1046].forEach(function(f, idx) {
      setTimeout(function() { playTone(f, 'sine', 0.15, 0.25); }, idx * 60);
    });
  }

  var WIRE_COLORS = ['red', 'blue', 'green', 'yellow', 'white', 'black'];
  var safeWire = '';
  var boomWire = '';
  var cutWires = {};

  var timeLeft = 30.0;
  var timerInterval = null;
  var turn = 1;
  var isResolving = false;
  var gameOver = false;
  var mode = 'ai';
  var net = null;
  var roundNum = 1;

  var wireItems = document.querySelectorAll('.wire-item');
  var timerDisplay = document.getElementById('bombTimerDisplay');

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

  function initRound() {
    cutWires = {};
    wireItems.forEach(function(wi) { wi.classList.remove('cut'); });
    timeLeft = 30.0;
    gameOver = false;
    isResolving = false;
    turn = 1;

    // Pick 1 safe, 1 boom randomly
    var shuffled = WIRE_COLORS.slice().sort(function() { return Math.random() - 0.5; });
    safeWire = shuffled[0];
    boomWire = shuffled[1];

    updateStatus();
    oppAvatarMood.textContent = '😨';
    myAvatarMood.textContent = '🐱';
    oppBubble.textContent = '千万别剪到炸弹啊…';
    myBubble.textContent = '我有一双透视眼！';

    clearInterval(timerInterval);
    timerInterval = setInterval(function() {
      if (gameOver) return;
      timeLeft -= 0.1;
      if (timeLeft <= 0) {
        timeLeft = 0;
        clearInterval(timerInterval);
        handleBoom(turn === 1);
      }
      timerDisplay.textContent = '00:' + (timeLeft < 10 ? '0' : '') + timeLeft.toFixed(2);
    }, 100);
  }

  function cutWire(color, isP1) {
    if (cutWires[color] || gameOver || isResolving) return;
    isResolving = true;
    playSnip();
    cutWires[color] = true;

    var targetEl = document.querySelector('[data-wire="' + color + '"]');
    if (targetEl) targetEl.classList.add('cut');

    if (color === boomWire) {
      handleBoom(isP1);
    } else if (color === safeWire) {
      handleSafe(isP1);
    } else {
      // Safe common wire
      statusBanner.textContent = '✂️ 咔嚓！普通引信剪断，虚惊一场！';
      turn = turn === 1 ? 2 : 1;
      updateStatus();
      setTimeout(function() {
        isResolving = false;
        if (mode === 'ai' && turn === 2 && !gameOver) {
          aiCut();
        }
      }, 700);
    }
  }

  function handleBoom(isP1Victim) {
    gameOver = true;
    clearInterval(timerInterval);
    playBoom();
    document.getElementById('arenaStage').classList.add('shake-screen');
    setTimeout(function() { document.getElementById('arenaStage').classList.remove('shake-screen'); }, 400);

    if (isP1Victim) {
      p2Score++;
      p2ScoreEl.textContent = p2Score;
      statusBanner.textContent = '💥 轰！！！你剪断了炸弹引信被炸焦了！';
      myAvatarMood.textContent = '😵';
      oppAvatarMood.textContent = '🤣';
      myBubble.textContent = '救命啊！炸糊了！';
      oppBubble.textContent = '哈哈！我就知道是那根！';
    } else {
      p1Score++;
      p1ScoreEl.textContent = p1Score;
      statusBanner.textContent = '💥 对手自爆！恭喜你化险为夷！';
      myAvatarMood.textContent = '😎';
      oppAvatarMood.textContent = '😵';
      oppBubble.textContent = '呜呜被炸飞了…';
    }

    setTimeout(function() {
      penaltyTitle.textContent = !isP1Victim ? '拆弹大赢家！' : '自爆炸焦！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 900);
  }

  function handleSafe(isP1Hero) {
    gameOver = true;
    clearInterval(timerInterval);
    playDefuse();

    if (isP1Hero) {
      p1Score++;
      p1ScoreEl.textContent = p1Score;
      statusBanner.textContent = '🎉 奇迹！你直接剪断了解密线，成功拆弹！';
      myAvatarMood.textContent = '🏆';
      myAvatarMood.classList.add('celebrate');
      oppAvatarMood.textContent = '😲';
      myBubble.textContent = '一发入魂！拆弹专家！';
    } else {
      p2Score++;
      p2ScoreEl.textContent = p2Score;
      statusBanner.textContent = '⚡ 对手运气爆棚拆除了炸弹！';
      oppAvatarMood.textContent = '👑';
      oppAvatarMood.classList.add('celebrate');
      myAvatarMood.textContent = '🥺';
    }

    setTimeout(function() {
      penaltyTitle.textContent = isP1Hero ? '拆弹奇迹！' : '对手胜出！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 900);
  }

  function updateStatus() {
    if (gameOver) return;
    if (turn === 1) {
      statusBanner.textContent = '🟢 轮到你：选一根线剪断！';
    } else {
      statusBanner.textContent = '⏳ 对手正在颤抖着挑选引信…';
    }
  }

  function aiCut() {
    if (gameOver) return;
    var remain = WIRE_COLORS.filter(function(c) { return !cutWires[c]; });
    if (remain.length === 0) return;
    var chosen = remain[Math.floor(Math.random() * remain.length)];
    setTimeout(function() {
      cutWire(chosen, false);
    }, 600);
  }

  wireItems.forEach(function(wi) {
    wi.addEventListener('click', function() {
      if (turn !== 1 || isResolving || gameOver) return;
      var color = wi.getAttribute('data-wire');
      cutWire(color, true);
      if (mode === 'online' && net) net.send('cut', { color: color });
    });
  });

  opponentTypeBtn.addEventListener('click', function() {
    mode = mode === 'ai' ? 'local' : 'ai';
    opponentTypeBtn.textContent = mode === 'ai' ? '🤖 智能人机' : '👥 同屏双人';
    initRound();
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
    initRound();
  });

  onlineBtn.addEventListener('click', function() {
    if (window.OmniNetUI && window.OmniNetUI.openLobby) {
      window.OmniNetUI.openLobby('bomb-defuse-clash', '拆弹心跳博弈', function(session) {
        if (!session) return;
        mode = session.mode;
        net = session.net;
        if (mode === 'online') {
          opponentTypeBtn.textContent = '🌐 联机对战';
          p1Name.textContent = '你';
          p2Name.textContent = (session.opponent && session.opponent.nickname) || '联机好友';

          net.on('msg:cut', function(data) {
            cutWire(data.color, false);
          });
          initRound();
        }
      });
    }
  });

  initRound();
})();