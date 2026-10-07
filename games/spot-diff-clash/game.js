/* 眼力找不同对决 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '自罚原地做 5 个深蹲 🏃',
    '大喊一声“火眼金睛！明察秋毫！” 📢'
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

  function playFound() {
    [523, 659, 784].forEach(function(f, idx) {
      setTimeout(function() { playTone(f, 'sine', 0.1, 0.25); }, idx * 60);
    });
  }

  var EMOJIS = ['🐱', '🐶', '🦊', '🐼', '🦁', '🐸', '🐵', '🦄', '🐰', '🐯'];
  var diffIndices = [];
  var found = {};
  var p1Score = 0, p2Score = 0;
  var gameOver = false;
  var mode = 'ai';
  var net = null;
  var roundNum = 1;

  var sceneTop = document.getElementById('sceneTop');
  var sceneBottom = document.getElementById('sceneBottom');

  var statusBanner = document.getElementById('statusBanner');
  var oppAvatarMood = document.getElementById('oppAvatarMood');
  var myAvatarMood = document.getElementById('myAvatarMood');
  var oppBubble = document.getElementById('oppBubble');
  var myBubble = document.getElementById('myBubble');
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

  function initScenes() {
    sceneTop.innerHTML = '';
    sceneBottom.innerHTML = '';
    found = {};
    p1Score = 0; p2Score = 0;
    p1ScoreEl.textContent = '0'; p2ScoreEl.textContent = '0';
    gameOver = false;

    // Pick 3 diff positions out of 10
    var pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].sort(function() { return Math.random() - 0.5; });
    diffIndices = pool.slice(0, 3);

    for (var i = 0; i < 10; i++) {
      var base = EMOJIS[i];
      var diff = diffIndices.indexOf(i) !== -1;
      var alt = diff ? (base === '🐱' ? '🐯' : '🐲') : base;

      createCell(sceneTop, i, base, diff);
      createCell(sceneBottom, i, alt, diff);
    }

    statusBanner.textContent = '上下对比 · 找出 3 处不同点！';
    oppAvatarMood.textContent = '🧐';
    myAvatarMood.textContent = '🐱';
  }

  function createCell(parent, idx, icon, isDiff) {
    var cell = document.createElement('div');
    cell.className = 'diff-cell';
    cell.setAttribute('data-idx', idx);
    cell.textContent = icon;

    cell.addEventListener('click', function() {
      if (gameOver || found[idx]) return;
      if (isDiff) {
        found[idx] = true;
        playFound();
        document.querySelectorAll('[data-idx="' + idx + '"]').forEach(function(c) {
          c.classList.add('spotted');
        });

        p1Score++;
        p1ScoreEl.textContent = p1Score;
        myAvatarMood.textContent = '🤩';
        myBubble.textContent = '找到了！还有谁！';

        if (p1Score >= 3 || (p1Score + p2Score) >= 3) {
          handleGameOver(p1Score > p2Score);
        }
      } else {
        playTone(150, 'sine', 0.1, 0.2);
        statusBanner.textContent = '❌ 这里没有不同哦，再仔细找找！';
      }
    });

    parent.appendChild(cell);
  }

  function handleGameOver(p1Won) {
    gameOver = true;
    if (p1Won) {
      statusBanner.textContent = '🎉 火眼金睛！你找出了所有不同点！';
      myAvatarMood.textContent = '🏆';
      myAvatarMood.classList.add('celebrate');
      oppAvatarMood.textContent = '😭';
    } else {
      statusBanner.textContent = '💥 对手抢先找出不同，你惜败！';
      oppAvatarMood.textContent = '👑';
      oppAvatarMood.classList.add('celebrate');
      myAvatarMood.textContent = '😵';
    }

    setTimeout(function() {
      penaltyTitle.textContent = p1Won ? '眼力大师登顶！' : '眼力对决惜败！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 800);
  }

  opponentTypeBtn.addEventListener('click', function() {
    mode = mode === 'ai' ? 'local' : 'ai';
    opponentTypeBtn.textContent = mode === 'ai' ? '🤖 智能人机' : '👥 同屏双人';
    initScenes();
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
    initScenes();
  });

  onlineBtn.addEventListener('click', function() {
    if (window.OmniNetUI && window.OmniNetUI.openLobby) {
      window.OmniNetUI.openLobby('spot-diff-clash', '眼力找不同对决', function(session) {
        if (!session) return;
        mode = session.mode;
        net = session.net;
        if (mode === 'online') {
          opponentTypeBtn.textContent = '🌐 联机对战';
          p1Name.textContent = '你';
          p2Name.textContent = (session.opponent && session.opponent.nickname) || '联机好友';
        }
      });
    }
  });

  initScenes();
})();