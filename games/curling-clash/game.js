/* 桌面冰壶碰撞 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '自罚原地做 5 个深蹲 🏃',
    '大喊一声“大力出奇迹！神之一壶！” 📢'
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

  function playSlide() { playTone(280, 'sine', 0.2, 0.15); }
  function playClack() { playTone(450, 'triangle', 0.06, 0.3); }

  var canvas = document.getElementById('curlingCanvas');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;

  var targetHouse = { x: W / 2, y: 75, r: 55 };
  var stones = []; // { x, y, vx, vy, team: 1|2, r: 12 }
  var currentAim = { angle: -Math.PI / 2, power: 5.5 };
  var turn = 1;
  var stonesLeftP1 = 3, stonesLeftP2 = 3;
  var isSliding = false;
  var gameOver = false;
  var mode = 'ai';
  var net = null;
  var roundNum = 1;

  var launchBtn = document.getElementById('launchStoneBtn');
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
    stones = [];
    stonesLeftP1 = 3; stonesLeftP2 = 3;
    turn = 1;
    gameOver = false;
    isSliding = false;
    statusBanner.textContent = '拖动微调角度，点击“推射冰壶”发力！';
    oppAvatarMood.textContent = '😏';
    myAvatarMood.textContent = '🐱';
  }

  function launch(team, ang, pwr) {
    if (isSliding || gameOver) return;
    isSliding = true;
    playSlide();

    var st = {
      x: W / 2,
      y: H - 35,
      vx: Math.cos(ang) * pwr,
      vy: Math.sin(ang) * pwr,
      team: team,
      r: 12
    };
    stones.push(st);

    if (team === 1) stonesLeftP1--;
    else stonesLeftP2--;
  }

  function update() {
    if (!isSliding) return;
    var allStopped = true;

    for (var i = 0; i < stones.length; i++) {
      var s = stones[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vx *= 0.985;
      s.vy *= 0.985;

      if (Math.abs(s.vx) > 0.05 || Math.abs(s.vy) > 0.05) allStopped = false;
      else { s.vx = 0; s.vy = 0; }

      // Wall bounce
      if (s.x - s.r < 0) { s.x = s.r; s.vx *= -0.7; }
      if (s.x + s.r > W) { s.x = W - s.r; s.vx *= -0.7; }
      if (s.y - s.r < 0) { s.y = s.r; s.vy *= -0.7; }
      if (s.y + s.r > H) { s.y = H - s.r; s.vy *= -0.7; }
    }

    // Collisions between stones
    for (var i = 0; i < stones.length; i++) {
      for (var j = i + 1; j < stones.length; j++) {
        var s1 = stones[i], s2 = stones[j];
        var dx = s2.x - s1.x;
        var dy = s2.y - s1.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < s1.r + s2.r) {
          playClack();
          var nx = dx / (dist || 1);
          var ny = dy / (dist || 1);
          var p = 2 * (s1.vx * nx + s1.vy * ny - s2.vx * nx - s2.vy * ny) / 2;
          s1.vx -= p * nx;
          s1.vy -= p * ny;
          s2.vx += p * nx;
          s2.vy += p * ny;
          s1.x -= nx * 2;
          s1.y -= ny * 2;
          s2.x += nx * 2;
          s2.y += ny * 2;
        }
      }
    }

    if (allStopped) {
      isSliding = false;
      checkRoundProgress();
    }
  }

  function checkRoundProgress() {
    if (stonesLeftP1 === 0 && stonesLeftP2 === 0) {
      evaluateWinner();
    } else {
      turn = turn === 1 ? 2 : 1;
      statusBanner.textContent = turn === 1 ? '🔵 轮到蓝方（你）推射！' : '🔴 轮到红方推射！';

      if (turn === 2 && mode === 'ai') {
        setTimeout(aiLaunch, 800);
      }
    }
  }

  function aiLaunch() {
    if (gameOver) return;
    var targetDist = targetHouse.y - (H - 35);
    var pwr = 5.2 + (Math.random() - 0.5) * 0.8;
    var ang = -Math.PI / 2 + (Math.random() - 0.5) * 0.15;
    launch(2, ang, pwr);
  }

  function evaluateWinner() {
    gameOver = true;
    var minDist1 = Infinity, minDist2 = Infinity;

    stones.forEach(function(s) {
      var d = Math.sqrt((s.x - targetHouse.x) * (s.x - targetHouse.x) + (s.y - targetHouse.y) * (s.y - targetHouse.y));
      if (s.team === 1) minDist1 = Math.min(minDist1, d);
      else minDist2 = Math.min(minDist2, d);
    });

    var p1Won = minDist1 < minDist2;
    if (p1Won) {
      p1Score++;
      p1ScoreEl.textContent = p1Score;
      statusBanner.textContent = '🎉 冰壶更靠近圆心！你夺得了胜利！';
      myAvatarMood.textContent = '🏆';
      myAvatarMood.classList.add('celebrate');
      oppAvatarMood.textContent = '😭';
    } else {
      p2Score++;
      p2ScoreEl.textContent = p2Score;
      statusBanner.textContent = '💥 对手冰壶绝妙停位，你惜败！';
      oppAvatarMood.textContent = '👑';
      oppAvatarMood.classList.add('celebrate');
      myAvatarMood.textContent = '😵';
    }

    setTimeout(function() {
      penaltyTitle.textContent = p1Won ? '冰壶大获全胜！' : '冰壶碰撞惜败！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 900);
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    // House Rings (Red outer, Blue inner, White bullseye)
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(targetHouse.x, targetHouse.y, targetHouse.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(targetHouse.x, targetHouse.y, targetHouse.r * 0.65, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(targetHouse.x, targetHouse.y, targetHouse.r * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Center Cross
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(targetHouse.x, 0); ctx.lineTo(targetHouse.x, H);
    ctx.moveTo(0, targetHouse.y); ctx.lineTo(W, targetHouse.y);
    ctx.stroke();

    // Aim Guide Line
    if (!isSliding && !gameOver && turn === 1) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(W / 2, H - 35);
      ctx.lineTo(W / 2 + Math.cos(currentAim.angle) * 70, H - 35 + Math.sin(currentAim.angle) * 70);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Stones
    stones.forEach(function(s) {
      ctx.save();
      ctx.fillStyle = s.team === 1 ? '#0284c7' : '#dc2626';
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();

      // Stone handle
      ctx.fillStyle = '#facc15';
      ctx.fillRect(s.x - 4, s.y - 2, 8, 4);
      ctx.restore();
    });
  }

  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  canvas.addEventListener('mousemove', function(e) {
    if (isSliding || gameOver) return;
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    currentAim.angle = Math.atan2(y - (H - 35), x - W / 2);
  });

  launchBtn.addEventListener('click', function() {
    if (turn === 1 && !isSliding) launch(1, currentAim.angle, 5.5);
  });

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
      window.OmniNetUI.openLobby('curling-clash', '桌面冰壶碰撞', function(session) {
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

  initGame();
  loop();
})();