/* 双人贪吃蛇对决 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '自罚原地做 5 个深蹲 🏃',
    '大喊一声“秋名山蛇王就是我！” 📢'
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

  function playEat() { playTone(600, 'sine', 0.08, 0.2); }
  function playCrash() { playTone(120, 'square', 0.25, 0.35); }

  var canvas = document.getElementById('snakeCanvas');
  var ctx = canvas.getContext('2d');
  var GRID = 15; // 20x20
  var CELL = 15; // 300 / 20 = 15

  var snake1 = [];
  var dir1 = { x: 0, y: -1 };
  var snake2 = [];
  var dir2 = { x: 0, y: 1 };
  var food = { x: 10, y: 10 };

  var p1Score = 0, p2Score = 0;
  var isPlaying = true;
  var gameOver = false;
  var mode = 'ai';
  var net = null;
  var gameTimer = null;
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
    snake1 = [{ x: 5, y: 15 }, { x: 5, y: 16 }, { x: 5, y: 17 }];
    dir1 = { x: 0, y: -1 };
    snake2 = [{ x: 14, y: 4 }, { x: 14, y: 3 }, { x: 14, y: 2 }];
    dir2 = { x: 0, y: 1 };
    spawnFood();

    p1Score = 0; p2Score = 0;
    p1ScoreEl.textContent = '0'; p2ScoreEl.textContent = '0';
    isPlaying = true;
    gameOver = false;

    statusBanner.textContent = '抢吃能量豆 · 撞击任何身体出局！';
    oppAvatarMood.textContent = '😏';
    myAvatarMood.textContent = '🐱';

    clearInterval(gameTimer);
    gameTimer = setInterval(tick, 130);
  }

  function spawnFood() {
    food = {
      x: Math.floor(Math.random() * 20),
      y: Math.floor(Math.random() * 20)
    };
  }

  function tick() {
    if (!isPlaying || gameOver) return;

    // AI steering
    if (mode === 'ai') {
      var head2 = snake2[0];
      var dx = food.x - head2.x;
      var dy = food.y - head2.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0 && dir2.x !== -1) dir2 = { x: 1, y: 0 };
        else if (dx < 0 && dir2.x !== 1) dir2 = { x: -1, y: 0 };
      } else {
        if (dy > 0 && dir2.y !== -1) dir2 = { x: 0, y: 1 };
        else if (dy < 0 && dir2.y !== 1) dir2 = { x: 0, y: -1 };
      }
    }

    // Move heads
    var newHead1 = { x: snake1[0].x + dir1.x, y: snake1[0].y + dir1.y };
    var newHead2 = { x: snake2[0].x + dir2.x, y: snake2[0].y + dir2.y };

    // Check Wall Collisions
    var p1Dead = newHead1.x < 0 || newHead1.x >= 20 || newHead1.y < 0 || newHead1.y >= 20;
    var p2Dead = newHead2.x < 0 || newHead2.x >= 20 || newHead2.y < 0 || newHead2.y >= 20;

    // Body collisions
    if (!p1Dead) {
      if (snake1.some(function(s) { return s.x === newHead1.x && s.y === newHead1.y; })) p1Dead = true;
      if (snake2.some(function(s) { return s.x === newHead1.x && s.y === newHead1.y; })) p1Dead = true;
    }
    if (!p2Dead) {
      if (snake2.some(function(s) { return s.x === newHead2.x && s.y === newHead2.y; })) p2Dead = true;
      if (snake1.some(function(s) { return s.x === newHead2.x && s.y === newHead2.y; })) p2Dead = true;
    }

    if (p1Dead || p2Dead) {
      playCrash();
      handleCrash(p1Dead, p2Dead);
      return;
    }

    // Advance P1
    snake1.unshift(newHead1);
    if (newHead1.x === food.x && newHead1.y === food.y) {
      playEat();
      p1Score++;
      p1ScoreEl.textContent = p1Score;
      spawnFood();
    } else {
      snake1.pop();
    }

    // Advance P2
    snake2.unshift(newHead2);
    if (newHead2.x === food.x && newHead2.y === food.y) {
      playEat();
      p2Score++;
      p2ScoreEl.textContent = p2Score;
      spawnFood();
    } else {
      snake2.pop();
    }

    render();
  }

  function handleCrash(p1Dead, p2Dead) {
    gameOver = true;
    clearInterval(gameTimer);

    if (p1Dead && p2Dead) {
      statusBanner.textContent = '💥 两败俱伤！同时撞毁！';
    } else if (p1Dead) {
      p2Score += 3;
      p2ScoreEl.textContent = p2Score;
      statusBanner.textContent = '💥 你撞毁出局！对手胜出！';
      myAvatarMood.textContent = '😵';
      oppAvatarMood.textContent = '🤣';
      oppBubble.textContent = '哈哈！贪吃撞墙了吧！';
    } else {
      p1Score += 3;
      p1ScoreEl.textContent = p1Score;
      statusBanner.textContent = '🎉 完美包夹！对手撞毁出局！';
      myAvatarMood.textContent = '🏆';
      myAvatarMood.classList.add('celebrate');
      oppAvatarMood.textContent = '😭';
      myBubble.textContent = '走位风骚，拿捏了！';
    }

    setTimeout(function() {
      penaltyTitle.textContent = !p1Dead ? '蛇王登顶！' : '贪吃蛇惜败！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 900);
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Food
    ctx.fillStyle = '#facc15';
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Snake 1 (Blue)
    ctx.fillStyle = '#38bdf8';
    snake1.forEach(function(s, idx) {
      ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
    });

    // Snake 2 (Orange)
    ctx.fillStyle = '#f97316';
    snake2.forEach(function(s, idx) {
      ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
    });
  }

  window.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowUp' && dir1.y !== 1) dir1 = { x: 0, y: -1 };
    else if (e.key === 'ArrowDown' && dir1.y !== -1) dir1 = { x: 0, y: 1 };
    else if (e.key === 'ArrowLeft' && dir1.x !== 1) dir1 = { x: -1, y: 0 };
    else if (e.key === 'ArrowRight' && dir1.x !== -1) dir1 = { x: 1, y: 0 };
  });

  document.querySelectorAll('.d-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var d = btn.getAttribute('data-dir');
      if (d === 'up' && dir1.y !== 1) dir1 = { x: 0, y: -1 };
      else if (d === 'down' && dir1.y !== -1) dir1 = { x: 0, y: 1 };
      else if (d === 'left' && dir1.x !== 1) dir1 = { x: -1, y: 0 };
      else if (d === 'right' && dir1.x !== -1) dir1 = { x: 1, y: 0 };
    });
  });

  opponentTypeBtn.addEventListener('click', function() {
    mode = mode === 'ai' ? 'local' : 'ai';
    opponentTypeBtn.textContent = mode === 'ai' ? '🤖 智能人机' : '👥 同屏双蛇';
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
      window.OmniNetUI.openLobby('snake-clash', '双人贪吃蛇对决', function(session) {
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
})();