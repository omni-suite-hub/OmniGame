/* 海战棋迷雾决战 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '自罚原地做 5 个深蹲 🏃',
    '大喊一声“击沉敌舰！大洋霸主！” 📢'
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

  function playHit() { playTone(120, 'square', 0.25, 0.4); }
  function playSplash() { playTone(400, 'sine', 0.08, 0.2); }

  var N = 6;
  var shipsGrid = [];
  var shots = [];
  var hits = 0;
  var TOTAL_SHIP_CELLS = 6; // 3 + 2 + 1
  var turn = 1;
  var p1Score = 0, p2Score = 0;
  var gameOver = false;
  var mode = 'ai';
  var net = null;
  var roundNum = 1;

  var gridEl = document.getElementById('battleshipGrid');
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

  function initOcean() {
    shipsGrid = []; shots = []; hits = 0;
    for (var r = 0; r < N; r++) {
      shipsGrid[r] = []; shots[r] = [];
      for (var c = 0; c < N; c++) {
        shipsGrid[r][c] = false; shots[r][c] = false;
      }
    }

    // Place 3 ships: 3-cell, 2-cell, 1-cell
    placeShip(3);
    placeShip(2);
    placeShip(1);

    turn = 1;
    p1Score = 0; p2Score = 0;
    p1ScoreEl.textContent = '0'; p2ScoreEl.textContent = '0';
    gameOver = false;
    renderGrid();
    statusBanner.textContent = '点击迷雾海域发射鱼雷！击沉全部战舰！';
    oppAvatarMood.textContent = '⚓';
    myAvatarMood.textContent = '🐱';
  }

  function placeShip(len) {
    var placed = false;
    while (!placed) {
      var horiz = Math.random() < 0.5;
      var r = Math.floor(Math.random() * (horiz ? N : N - len + 1));
      var c = Math.floor(Math.random() * (horiz ? N - len + 1 : N));
      var fits = true;

      for (var i = 0; i < len; i++) {
        var cr = horiz ? r : r + i;
        var cc = horiz ? c + i : c;
        if (shipsGrid[cr][cc]) fits = false;
      }

      if (fits) {
        for (var i = 0; i < len; i++) {
          var cr = horiz ? r : r + i;
          var cc = horiz ? c + i : c;
          shipsGrid[cr][cc] = true;
        }
        placed = true;
      }
    }
  }

  function renderGrid() {
    gridEl.innerHTML = '';
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        (function(row, col) {
          var cell = document.createElement('div');
          cell.className = 'sea-cell';
          if (shots[row][col]) {
            if (shipsGrid[row][col]) {
              cell.classList.add('hit');
              cell.textContent = '💥';
            } else {
              cell.classList.add('miss');
              cell.textContent = '💧';
            }
          }

          cell.onclick = function() {
            if (turn !== 1 || gameOver || shots[row][col]) return;
            fireAt(row, col, true);
          };

          gridEl.appendChild(cell);
        })(r, c);
      }
    }
  }

  function fireAt(r, c, isP1) {
    if (shots[r][c] || gameOver) return;
    shots[r][c] = true;

    if (shipsGrid[r][c]) {
      // HIT!
      playHit();
      hits++;
      p1Score++;
      p1ScoreEl.textContent = p1Score;
      statusBanner.textContent = '💥 正中敌舰装甲！剧烈爆炸！';
      myAvatarMood.textContent = '🤩';
      oppAvatarMood.textContent = '😱';
      myBubble.textContent = '精准命中！再来一炮！';
      oppBubble.textContent = '报告舰长！船体漏水啦！';

      if (hits >= TOTAL_SHIP_CELLS) {
        handleGameOver(true);
        renderGrid();
        return;
      }
    } else {
      // MISS
      playSplash();
      statusBanner.textContent = '💧 炮弹落空！溅起巨大水花！';
      turn = turn === 1 ? 2 : 1;
    }

    renderGrid();

    if (turn === 2 && mode === 'ai' && !gameOver) {
      setTimeout(aiFire, 700);
    }
  }

  function aiFire() {
    if (gameOver) return;
    // Simulate opponent firing
    if (Math.random() < 0.45) {
      p2Score++;
      p2ScoreEl.textContent = p2Score;
      oppAvatarMood.textContent = '😈';
      oppBubble.textContent = '哈哈！击中你的巡洋舰！';
      if (p2Score >= TOTAL_SHIP_CELLS) {
        handleGameOver(false);
        return;
      }
    }
    turn = 1;
    statusBanner.textContent = '🟢 轮到你指挥炮击！';
  }

  function handleGameOver(p1Won) {
    gameOver = true;
    if (p1Won) {
      statusBanner.textContent = '🎉 全歼敌舰队！你获得了海战大捷！';
      myAvatarMood.textContent = '🏆';
      myAvatarMood.classList.add('celebrate');
      oppAvatarMood.textContent = '😭';
    } else {
      statusBanner.textContent = '💥 我方舰队全部沉没，你惜败！';
      oppAvatarMood.textContent = '👑';
      oppAvatarMood.classList.add('celebrate');
      myAvatarMood.textContent = '😵';
    }

    setTimeout(function() {
      penaltyTitle.textContent = p1Won ? '海战大获全胜！' : '海战惜败！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 800);
  }

  opponentTypeBtn.addEventListener('click', function() {
    mode = mode === 'ai' ? 'local' : 'ai';
    opponentTypeBtn.textContent = mode === 'ai' ? '🤖 智能人机' : '👥 同屏双人';
    initOcean();
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
    initOcean();
  });

  onlineBtn.addEventListener('click', function() {
    if (window.OmniNetUI && window.OmniNetUI.openLobby) {
      window.OmniNetUI.openLobby('battleship-clash', '海战棋迷雾决战', function(session) {
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

  initOcean();
})();