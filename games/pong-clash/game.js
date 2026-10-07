/* 霓虹乒乓死斗 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '为赢家捶背捏肩 30 秒 💆',
    '自罚原地做 5 个深蹲 🏃',
    '大喊一声“旋风扣杀！无懈可击！” 📢'
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

  function playPaddleHit() { playTone(500, 'triangle', 0.05, 0.25); }
  function playWallBounce() { playTone(300, 'sine', 0.04, 0.15); }
  function playScore() {
    [400, 600, 800].forEach(function(f, idx) {
      setTimeout(function() { playTone(f, 'sine', 0.12, 0.25); }, idx * 60);
    });
  }

  var canvas = document.getElementById('pongCanvas');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;

  var PADDLE_W = 68, PADDLE_H = 10;
  var p1 = { x: (W - PADDLE_W) / 2, y: H - 24 };
  var p2 = { x: (W - PADDLE_W) / 2, y: 14 };
  var ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 7 };

  var p1Score = 0, p2Score = 0;
  var WIN_SCORE = 5;
  var isPlaying = false;
  var gameOver = false;
  var mode = 'ai';
  var net = null;
  var roundNum = 1;

  var serveBtn = document.getElementById('servePongBtn');
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

  function resetBall(toP1) {
    ball.x = W / 2;
    ball.y = H / 2;
    var angle = (toP1 ? 1 : -1) * (Math.PI / 4 + Math.random() * Math.PI / 2);
    ball.vx = Math.cos(angle) * 3.8;
    ball.vy = Math.sin(angle) * 3.8;
    isPlaying = true;
  }

  function update() {
    if (!isPlaying || gameOver) return;

    ball.x += ball.vx;
    ball.y += ball.vy;

    // Walls
    if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx *= -1; playWallBounce(); }
    if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx *= -1; playWallBounce(); }

    // AI Tracking
    if (mode === 'ai') {
      var targetX = ball.x - PADDLE_W / 2;
      var diff = targetX - p2.x;
      p2.x += Math.sign(diff) * Math.min(Math.abs(diff), 3.4);
      p2.x = Math.max(0, Math.min(W - PADDLE_W, p2.x));
    }

    // Paddle 1 Collision (Bottom)
    if (ball.y + ball.r >= p1.y && ball.y - ball.r <= p1.y + PADDLE_H) {
      if (ball.x >= p1.x && ball.x <= p1.x + PADDLE_W) {
        ball.vy = -Math.abs(ball.vy) * 1.05;
        var hitOffset = (ball.x - (p1.x + PADDLE_W / 2)) / (PADDLE_W / 2);
        ball.vx += hitOffset * 2;
        playPaddleHit();
      }
    }

    // Paddle 2 Collision (Top)
    if (ball.y - ball.r <= p2.y + PADDLE_H && ball.y + ball.r >= p2.y) {
      if (ball.x >= p2.x && ball.x <= p2.x + PADDLE_W) {
        ball.vy = Math.abs(ball.vy) * 1.05;
        var hitOffset = (ball.x - (p2.x + PADDLE_W / 2)) / (PADDLE_W / 2);
        ball.vx += hitOffset * 2;
        playPaddleHit();
      }
    }

    // Score Bottom
    if (ball.y > H) {
      p2Score++;
      p2ScoreEl.textContent = p2Score;
      playScore();
      isPlaying = false;
      statusBanner.textContent = '💥 对手扣杀得分！抓紧接球！';
      oppAvatarMood.textContent = '😏';
      myAvatarMood.textContent = '🤦‍♂️';
      if (p2Score >= WIN_SCORE) handleGameOver(false);
      else setTimeout(function() { resetBall(true); }, 1000);
    }
    // Score Top
    else if (ball.y < 0) {
      p1Score++;
      p1ScoreEl.textContent = p1Score;
      playScore();
      isPlaying = false;
      statusBanner.textContent = '⚡ 精彩扣杀！你拿下 1 分！';
      myAvatarMood.textContent = '🤩';
      oppAvatarMood.textContent = '😫';
      if (p1Score >= WIN_SCORE) handleGameOver(true);
      else setTimeout(function() { resetBall(false); }, 1000);
    }
  }

  function handleGameOver(p1Won) {
    gameOver = true;
    if (p1Won) {
      statusBanner.textContent = '🎉 乒乓称王！你赢下了死斗！';
      myAvatarMood.textContent = '🏆';
      myAvatarMood.classList.add('celebrate');
      oppAvatarMood.textContent = '😭';
    } else {
      statusBanner.textContent = '💥 对手实力强劲，你惜败！';
      oppAvatarMood.textContent = '👑';
      oppAvatarMood.classList.add('celebrate');
      myAvatarMood.textContent = '😵';
    }

    setTimeout(function() {
      penaltyTitle.textContent = p1Won ? '乒乓巅峰胜利！' : '乒乓死斗惜败！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 800);
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    // Center Net
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Paddle 1
    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 10;
    ctx.fillRect(p1.x, p1.y, PADDLE_W, PADDLE_H);

    // Paddle 2
    ctx.fillStyle = '#f43f5e';
    ctx.shadowColor = '#f43f5e';
    ctx.shadowBlur = 10;
    ctx.fillRect(p2.x, p2.y, PADDLE_W, PADDLE_H);

    // Ball
    ctx.fillStyle = '#facc15';
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  canvas.addEventListener('mousemove', function(e) {
    var rect = canvas.getBoundingClientRect();
    p1.x = Math.max(0, Math.min(W - PADDLE_W, e.clientX - rect.left - PADDLE_W / 2));
  });

  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    var touch = e.touches[0];
    var rect = canvas.getBoundingClientRect();
    p1.x = Math.max(0, Math.min(W - PADDLE_W, touch.clientX - rect.left - PADDLE_W / 2));
  }, { passive: false });

  serveBtn.addEventListener('click', function() {
    if (!isPlaying) resetBall(true);
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
    gameOver = false;
    roundNum++;
    roundText.textContent = '第 ' + roundNum + ' 局';
    resetBall(true);
  });

  onlineBtn.addEventListener('click', function() {
    if (window.OmniNetUI && window.OmniNetUI.openLobby) {
      window.OmniNetUI.openLobby('pong-clash', '霓虹乒乓死斗', function(session) {
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

  statusBanner.textContent = '点击“发球开球”或滑动球拍开始！';
  loop();
})();