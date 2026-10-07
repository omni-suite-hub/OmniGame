/* 飞镖大师对决 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '为赢家捶背捏肩 30 秒 💆',
    '自罚原地做 5 个深蹲 🏃',
    '大喊一声“正中靶心！百步穿杨！” 📢'
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

  function playThwack() { playTone(220, 'triangle', 0.06, 0.3); }
  function playBullseye() {
    [523, 659, 784, 1046].forEach(function(f, idx) {
      setTimeout(function() { playTone(f, 'sine', 0.15, 0.25); }, idx * 60);
    });
  }

  var canvas = document.getElementById('dartboardCanvas');
  var ctx = canvas.getContext('2d');
  var crosshair = document.getElementById('crosshair');
  var throwBtn = document.getElementById('throwDartBtn');

  var W = canvas.width, H = canvas.height;
  var cx = W / 2, cy = H / 2;

  var p1Score = 0, p2Score = 0;
  var dartsLeft = 3;
  var turn = 1;
  var isResolving = false;
  var gameOver = false;
  var mode = 'ai';
  var net = null;
  var roundNum = 1;

  var crossX = cx, crossY = cy;
  var angle = 0;

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

  function drawDartboard() {
    ctx.clearRect(0, 0, W, H);

    // Outer circle
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx, cy, 130, 0, Math.PI * 2);
    ctx.fill();

    // 20 sectors
    var numSectors = 20;
    var sectorAngle = (Math.PI * 2) / numSectors;
    for (var i = 0; i < numSectors; i++) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, 120, i * sectorAngle, (i + 1) * sectorAngle);
      ctx.fillStyle = (i % 2 === 0) ? '#1e293b' : '#f8fafc';
      ctx.fill();
    }

    // Double Ring
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, 115, 0, Math.PI * 2);
    ctx.stroke();

    // Triple Ring
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 75, 0, Math.PI * 2);
    ctx.stroke();

    // Outer Bull
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();

    // Bullseye
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  function aimLoop() {
    if (!gameOver && !isResolving) {
      angle += 0.05;
      crossX = cx + Math.sin(angle * 1.8) * 45 + Math.cos(angle * 0.9) * 20;
      crossY = cy + Math.cos(angle * 1.4) * 45 + Math.sin(angle * 1.2) * 20;
      crosshair.style.left = crossX + 'px';
      crosshair.style.top = crossY + 'px';
    }
    requestAnimationFrame(aimLoop);
  }

  function throwDart(isP1) {
    if (isResolving || gameOver) return;
    isResolving = true;
    playThwack();

    var hitX = crossX + (Math.random() - 0.5) * 12;
    var hitY = crossY + (Math.random() - 0.5) * 12;

    var dist = Math.sqrt((hitX - cx) * (hitX - cx) + (hitY - cy) * (hitY - cy));
    var points = 0;

    if (dist < 10) {
      points = 50;
      playBullseye();
      statusBanner.textContent = '🎯 正中红心！50分绝杀！';
    } else if (dist < 22) {
      points = 25;
      statusBanner.textContent = '🎯 命中内圈绿心！25分！';
    } else if (dist > 70 && dist < 80) {
      points = 30; // Triple
      statusBanner.textContent = '🔥 命中三倍区！30分！';
    } else if (dist > 110 && dist < 120) {
      points = 20; // Double
      statusBanner.textContent = '⚡ 命中双倍区！20分！';
    } else if (dist < 125) {
      points = 15;
      statusBanner.textContent = '🎯 命中靶盘，斩获 15 分！';
    } else {
      points = 0;
      statusBanner.textContent = '💨 脱靶！0分！';
    }

    if (isP1) {
      p1Score += points;
      p1ScoreEl.textContent = p1Score;
      if (points >= 50) {
        myAvatarMood.textContent = '🤩';
        myBubble.textContent = '正中靶心！百步穿杨！';
      }
    } else {
      p2Score += points;
      p2ScoreEl.textContent = p2Score;
    }

    dartsLeft--;
    setTimeout(function() {
      if (dartsLeft > 0) {
        isResolving = false;
        if (mode === 'ai' && turn === 2) throwDart(false);
      } else {
        if (turn === 1) {
          turn = 2;
          dartsLeft = 3;
          statusBanner.textContent = '轮到对方投掷 3 镖！';
          isResolving = false;
          if (mode === 'ai') {
            setTimeout(function() { throwDart(false); }, 700);
          }
        } else {
          handleGameOver();
        }
      }
    }, 700);
  }

  function handleGameOver() {
    gameOver = true;
    var p1Won = p1Score > p2Score;
    if (p1Won) {
      statusBanner.textContent = '🎉 飞镖大师！你以高分获胜！';
      myAvatarMood.textContent = '🏆';
      myAvatarMood.classList.add('celebrate');
      oppAvatarMood.textContent = '😭';
    } else {
      statusBanner.textContent = '💥 对手得分领先，你惜败！';
      oppAvatarMood.textContent = '👑';
      oppAvatarMood.classList.add('celebrate');
      myAvatarMood.textContent = '😵';
    }

    setTimeout(function() {
      penaltyTitle.textContent = p1Won ? '飞镖称王！' : '飞镖惜败！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 900);
  }

  throwBtn.addEventListener('click', function() {
    if (turn === 1) throwDart(true);
  });

  opponentTypeBtn.addEventListener('click', function() {
    mode = mode === 'ai' ? 'local' : 'ai';
    opponentTypeBtn.textContent = mode === 'ai' ? '🤖 智能人机' : '👥 同屏双人';
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
    p1Score = 0; p2Score = 0;
    p1ScoreEl.textContent = '0'; p2ScoreEl.textContent = '0';
    dartsLeft = 3;
    turn = 1;
    gameOver = false;
    isResolving = false;
    roundNum++;
    roundText.textContent = '第 ' + roundNum + ' 局';
    statusBanner.textContent = '看准晃动准星，点击投掷飞镖！';
  });

  onlineBtn.addEventListener('click', function() {
    if (window.OmniNetUI && window.OmniNetUI.openLobby) {
      window.OmniNetUI.openLobby('darts-duel', '飞镖大师对决', function(session) {
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

  drawDartboard();
  aimLoop();
  statusBanner.textContent = '看准晃动准星，点击投掷飞镖！';
})();