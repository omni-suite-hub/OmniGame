/* 桌上空气曲棍球 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '为赢家捶背捏肩 30 秒 💆',
    '自罚原地做 5 个深蹲 🏃',
    '大喊一声“进球啦！乌拉！” 📢'
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

  function playHit() { playTone(600, 'sawtooth', 0.05, 0.25); }
  function playWall() { playTone(300, 'sine', 0.04, 0.2); }
  function playGoal() {
    playTone(150, 'sawtooth', 0.4, 0.4);
    setTimeout(function() { playTone(587, 'triangle', 0.2, 0.3); }, 150);
  }

  var canvas = document.getElementById('rinkCanvas');
  var ctx = canvas.getContext('2d');
  var W = canvas.width;
  var H = canvas.height;

  var puck = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 10 };
  var p1 = { x: W / 2, y: H - 40, r: 20 }; // Player (Bottom)
  var p2 = { x: W / 2, y: 40, r: 20 };     // Opponent (Top)

  var GOAL_W = 100;
  var WIN_SCORE = 5;
  var p1Score = 0;
  var p2Score = 0;
  var mode = 'ai';
  var net = null;
  var isHost = true;
  var isPlaying = false;
  var roundNum = 1;

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
  var serveBtn = document.getElementById('servePuckBtn');
  var penaltyModal = document.getElementById('penaltyModal');
  var penaltyTitle = document.getElementById('penaltyTitle');
  var penaltyResultText = document.getElementById('penaltyResultText');
  var reRollPenaltyBtn = document.getElementById('reRollPenaltyBtn');
  var nextRoundBtn = document.getElementById('nextRoundBtn');

  function resetPuck(toP1) {
    puck.x = W / 2;
    puck.y = H / 2;
    var angle = (toP1 ? 1 : -1) * (Math.PI / 4 + Math.random() * Math.PI / 2);
    puck.vx = Math.cos(angle) * 3.5;
    puck.vy = Math.sin(angle) * 3.5;
    isPlaying = true;
  }

  function update() {
    if (!isPlaying) return;

    // Move puck
    puck.x += puck.vx;
    puck.y += puck.vy;
    puck.vx *= 0.992;
    puck.vy *= 0.992;

    // Wall bounce
    if (puck.x - puck.r < 0) { puck.x = puck.r; puck.vx *= -1; playWall(); }
    if (puck.x + puck.r > W) { puck.x = W - puck.r; puck.vx *= -1; playWall(); }

    // Goal checks (Top & Bottom Center)
    if (puck.y < 0) {
      if (puck.x > (W - GOAL_W) / 2 && puck.x < (W + GOAL_W) / 2) {
        // P1 GOAL!
        scoreGoal(1);
        return;
      } else {
        puck.y = puck.r; puck.vy *= -1; playWall();
      }
    } else if (puck.y > H) {
      if (puck.x > (W - GOAL_W) / 2 && puck.x < (W + GOAL_W) / 2) {
        // P2 GOAL!
        scoreGoal(2);
        return;
      } else {
        puck.y = H - puck.r; puck.vy *= -1; playWall();
      }
    }

    // AI movement
    if (mode === 'ai') {
      var targetX = puck.x;
      var dx = targetX - p2.x;
      p2.x += Math.sign(dx) * Math.min(Math.abs(dx), 3.2);
      p2.x = Math.max(p2.r, Math.min(W - p2.r, p2.x));

      // Push forward if puck in top half
      if (puck.y < H / 2 - 10) {
        p2.y = Math.min(H / 2 - 30, p2.y + 1.2);
      } else {
        p2.y = Math.max(40, p2.y - 1.5);
      }
    }

    // Mallet collisions
    checkMalletHit(p1);
    checkMalletHit(p2);
  }

  function checkMalletHit(m) {
    var dx = puck.x - m.x;
    var dy = puck.y - m.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var minDist = puck.r + m.r;

    if (dist < minDist) {
      playHit();
      var nx = dx / (dist || 1);
      var ny = dy / (dist || 1);
      var speed = Math.max(5.5, Math.min(10, Math.sqrt(puck.vx * puck.vx + puck.vy * puck.vy) + 1.5));
      puck.vx = nx * speed;
      puck.vy = ny * speed;
      puck.x = m.x + nx * (minDist + 1);
      puck.y = m.y + ny * (minDist + 1);
    }
  }

  function scoreGoal(scorer) {
    playGoal();
    isPlaying = false;
    document.getElementById('arenaStage').classList.add('shake-screen');
    setTimeout(function() { document.getElementById('arenaStage').classList.remove('shake-screen'); }, 300);

    if (scorer === 1) {
      p1Score++;
      p1ScoreEl.textContent = p1Score;
      statusBanner.textContent = '⚡ 球进啦！精彩折射入网！';
      myAvatarMood.textContent = '🤩';
      myAvatarMood.classList.add('celebrate');
      oppAvatarMood.textContent = '😫';
      myBubble.textContent = '绝杀进球！挡不住吧！';
      oppBubble.textContent = '哎呀，球速太快了！';
    } else {
      p2Score++;
      p2ScoreEl.textContent = p2Score;
      statusBanner.textContent = '💥 对手破门得分！抓紧防守！';
      oppAvatarMood.textContent = '😏';
      oppAvatarMood.classList.add('celebrate');
      myAvatarMood.textContent = '🤦‍♂️';
      oppBubble.textContent = '防守漏勺，轻松拿下！';
      myBubble.textContent = '下一球我必防住！';
    }

    if (p1Score >= WIN_SCORE || p2Score >= WIN_SCORE) {
      handleMatchOver(p1Score >= WIN_SCORE);
    } else {
      setTimeout(function() { resetPuck(scorer === 2); }, 1200);
    }
  }

  function handleMatchOver(p1Won) {
    setTimeout(function() {
      penaltyTitle.textContent = p1Won ? '你夺得了曲棍球冠军！' : '对方赢得了比赛！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 800);
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    // Rink details
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2;
    // Center line
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    // Center circle
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 40, 0, Math.PI * 2);
    ctx.stroke();

    // Goal areas
    ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
    ctx.fillRect((W - GOAL_W) / 2, 0, GOAL_W, 10);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.fillRect((W - GOAL_W) / 2, H - 10, GOAL_W, 10);

    // Puck
    ctx.save();
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#f87171';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(puck.x, puck.y, puck.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Mallet P1 (Cyan)
    ctx.save();
    ctx.fillStyle = '#06b6d4';
    ctx.shadowColor = '#67e8f9';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, p1.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Mallet P2 (Orange)
    ctx.save();
    ctx.fillStyle = '#f97316';
    ctx.shadowColor = '#fdba74';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(p2.x, p2.y, p2.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
  }

  // Pointer controls
  canvas.addEventListener('mousemove', function(e) {
    var rect = canvas.getBoundingClientRect();
    p1.x = Math.max(p1.r, Math.min(W - p1.r, e.clientX - rect.left));
    p1.y = Math.max(H / 2 + p1.r, Math.min(H - p1.r, e.clientY - rect.top));
  });

  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    var touch = e.touches[0];
    var rect = canvas.getBoundingClientRect();
    p1.x = Math.max(p1.r, Math.min(W - p1.r, touch.clientX - rect.left));
    p1.y = Math.max(H / 2 + p1.r, Math.min(H - p1.r, touch.clientY - rect.top));
  }, { passive: false });

  serveBtn.addEventListener('click', function() {
    if (!isPlaying) resetPuck(true);
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
    roundNum++;
    roundText.textContent = '第 ' + roundNum + ' 局';
    resetPuck(true);
  });

  onlineBtn.addEventListener('click', function() {
    if (window.OmniNetUI && window.OmniNetUI.openLobby) {
      window.OmniNetUI.openLobby('air-hockey', '桌上空气曲棍球', function(session) {
        if (!session) return;
        mode = session.mode;
        net = session.net;
        isHost = session.isHost;
        if (mode === 'online') {
          opponentTypeBtn.textContent = '🌐 联机对战';
          p1Name.textContent = '你 (' + (isHost ? '主场' : '客场') + ')';
          p2Name.textContent = (session.opponent && session.opponent.nickname) || '联机好友';
        }
      });
    }
  });

  statusBanner.textContent = '点击“开球发球”或滑动推杆开始！';
  gameLoop();
})();