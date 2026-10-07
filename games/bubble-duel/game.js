/* 泡泡龙攻防战 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '自罚原地做 5 个深蹲 🏃',
    '大喊一声“泡泡神枪手在此！” 📢'
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

  function playPop() { playTone(650, 'sine', 0.05, 0.25); }
  function playShoot() { playTone(300, 'triangle', 0.06, 0.2); }

  var canvas = document.getElementById('bubbleCanvas');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var BUBBLE_R = 14;
  var COLS = 10, ROWS = 12;
  var COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7'];

  var grid = [];
  var currentBubble = null;
  var nextColor = COLORS[0];
  var aimAngle = -Math.PI / 2;
  var isShooting = false;
  var shotBubble = null;
  var gameOver = false;
  var mode = 'ai';
  var net = null;
  var p1Score = 0, p2Score = 0;
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
  var penaltyModal = document.getElementById('penaltyModal');
  var penaltyTitle = document.getElementById('penaltyTitle');
  var penaltyResultText = document.getElementById('penaltyResultText');
  var reRollPenaltyBtn = document.getElementById('reRollPenaltyBtn');
  var nextRoundBtn = document.getElementById('nextRoundBtn');

  function initGame() {
    grid = [];
    for (var r = 0; r < ROWS; r++) {
      grid[r] = [];
      for (var c = 0; c < COLS; c++) {
        if (r < 5) {
          grid[r][c] = COLORS[Math.floor(Math.random() * COLORS.length)];
        } else {
          grid[r][c] = null;
        }
      }
    }

    currentBubble = COLORS[Math.floor(Math.random() * COLORS.length)];
    nextColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    shotBubble = null;
    isShooting = false;
    gameOver = false;
    statusBanner.textContent = '移动瞄准 · 点击发射泡泡 3消！';
    oppAvatarMood.textContent = '😏';
    myAvatarMood.textContent = '🐱';
  }

  function shoot() {
    if (isShooting || gameOver) return;
    isShooting = true;
    playShoot();

    shotBubble = {
      x: W / 2,
      y: H - 30,
      vx: Math.cos(aimAngle) * 7.5,
      vy: Math.sin(aimAngle) * 7.5,
      color: currentBubble
    };

    currentBubble = nextColor;
    nextColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  function update() {
    if (!isShooting || !shotBubble) return;

    shotBubble.x += shotBubble.vx;
    shotBubble.y += shotBubble.vy;

    // Walls
    if (shotBubble.x - BUBBLE_R < 0) { shotBubble.x = BUBBLE_R; shotBubble.vx *= -1; }
    if (shotBubble.x + BUBBLE_R > W) { shotBubble.x = W - BUBBLE_R; shotBubble.vx *= -1; }

    // Hit top or grid bubbles
    var hit = false;
    if (shotBubble.y - BUBBLE_R <= 0) hit = true;

    for (var r = 0; r < ROWS && !hit; r++) {
      for (var c = 0; c < COLS && !hit; c++) {
        if (grid[r][c]) {
          var bx = c * (BUBBLE_R * 2) + BUBBLE_R + (r % 2 === 1 ? BUBBLE_R : 0);
          var by = r * (BUBBLE_R * 1.8) + BUBBLE_R;
          var dist = Math.sqrt((shotBubble.x - bx) * (shotBubble.x - bx) + (shotBubble.y - by) * (shotBubble.y - by));
          if (dist < BUBBLE_R * 1.8) {
            hit = true;
          }
        }
      }
    }

    if (hit) {
      snapToGrid(shotBubble);
      shotBubble = null;
      isShooting = false;
    }
  }

  function snapToGrid(bubble) {
    var r = Math.max(0, Math.min(ROWS - 1, Math.floor(bubble.y / (BUBBLE_R * 1.8))));
    var c = Math.max(0, Math.min(COLS - 1, Math.floor((bubble.x - (r % 2 === 1 ? BUBBLE_R : 0)) / (BUBBLE_R * 2))));

    grid[r][c] = bubble.color;
    checkCluster(r, c, bubble.color);
  }

  function checkCluster(r, c, color) {
    var matched = [];
    var visited = {};

    function dfs(cr, cc) {
      var key = cr + ',' + cc;
      if (visited[key] || cr < 0 || cr >= ROWS || cc < 0 || cc >= COLS) return;
      if (grid[cr][cc] !== color) return;
      visited[key] = true;
      matched.push({ r: cr, c: cc });

      var neighbors = [
        [cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1],
        [cr - 1, cr % 2 === 0 ? cc - 1 : cc + 1],
        [cr + 1, cr % 2 === 0 ? cc - 1 : cc + 1]
      ];
      neighbors.forEach(function(n) { dfs(n[0], n[1]); });
    }

    dfs(r, c);

    if (matched.length >= 3) {
      playPop();
      matched.forEach(function(m) { grid[m.r][m.c] = null; });
      p1Score += matched.length;
      p1ScoreEl.textContent = p1Score;
      statusBanner.textContent = '🫧 连击消除！+' + matched.length + '分！';
      myAvatarMood.textContent = '🤩';
      myBubble.textContent = '大波消除！看招！';

      if (p1Score >= 18) {
        handleGameOver(true);
      }
    }
  }

  function handleGameOver(p1Won) {
    gameOver = true;
    if (p1Won) {
      statusBanner.textContent = '🎉 泡泡消除王者！你赢得了死斗！';
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
      penaltyTitle.textContent = p1Won ? '泡泡龙胜利！' : '泡泡龙惜败！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 800);
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    // Grid bubbles
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (grid[r][c]) {
          var bx = c * (BUBBLE_R * 2) + BUBBLE_R + (r % 2 === 1 ? BUBBLE_R : 0);
          var by = r * (BUBBLE_R * 1.8) + BUBBLE_R;
          ctx.save();
          ctx.fillStyle = grid[r][c];
          ctx.beginPath();
          ctx.arc(bx, by, BUBBLE_R - 1, 0, Math.PI * 2);
          ctx.fill();
          // Highlight shine
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.beginPath();
          ctx.arc(bx - 3, by - 3, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // Shot bubble in flight
    if (shotBubble) {
      ctx.fillStyle = shotBubble.color;
      ctx.beginPath();
      ctx.arc(shotBubble.x, shotBubble.y, BUBBLE_R, 0, Math.PI * 2);
      ctx.fill();
    }

    // Shooter cannon at bottom
    var sx = W / 2, sy = H - 25;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(aimAngle) * 35, sy + Math.sin(aimAngle) * 35);
    ctx.stroke();

    // Loaded bubble
    ctx.fillStyle = currentBubble;
    ctx.beginPath();
    ctx.arc(sx, sy, BUBBLE_R, 0, Math.PI * 2);
    ctx.fill();

    // Red danger baseline
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, H - 55); ctx.lineTo(W, H - 55);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  canvas.addEventListener('mousemove', function(e) {
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    aimAngle = Math.atan2(y - (H - 25), x - W / 2);
  });

  canvas.addEventListener('click', shoot);

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
    roundNum++;
    roundText.textContent = '第 ' + roundNum + ' 局';
    initGame();
  });

  onlineBtn.addEventListener('click', function() {
    if (window.OmniNetUI && window.OmniNetUI.openLobby) {
      window.OmniNetUI.openLobby('bubble-duel', '泡泡龙攻防战', function(session) {
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