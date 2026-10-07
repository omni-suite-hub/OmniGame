/* 2048 竞速死斗 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '自罚原地做 5 个深蹲 🏃',
    '大喊一声“数学奇才！2048通关！” 📢'
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

  function playSlide() { playTone(350, 'triangle', 0.04, 0.2); }
  function playMerge() { playTone(600, 'sine', 0.08, 0.25); }

  var board = [];
  var p1Score = 0, p2Score = 0;
  var gameOver = false;
  var mode = 'ai';
  var net = null;
  var roundNum = 1;

  var gridEl = document.getElementById('c2048Grid');
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

  function initBoard() {
    board = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ];
    p1Score = 0; p2Score = 0;
    p1ScoreEl.textContent = '0'; p2ScoreEl.textContent = '0';
    gameOver = false;
    spawnTile();
    spawnTile();
    render();
    statusBanner.textContent = '滑动或按方向键合并数字 · 冲刺 2048！';
    oppAvatarMood.textContent = '😏';
    myAvatarMood.textContent = '🐱';
  }

  function spawnTile() {
    var empty = [];
    for (var r = 0; r < 4; r++) {
      for (var c = 0; c < 4; c++) {
        if (board[r][c] === 0) empty.push({ r: r, c: c });
      }
    }
    if (empty.length > 0) {
      var pos = empty[Math.floor(Math.random() * empty.length)];
      board[pos.r][pos.c] = Math.random() < 0.9 ? 2 : 4;
    }
  }

  function render() {
    gridEl.innerHTML = '';
    for (var r = 0; r < 4; r++) {
      for (var c = 0; c < 4; c++) {
        var tile = document.createElement('div');
        tile.className = 'c2048-tile' + (board[r][c] ? ' tile-' + board[r][c] : '');
        tile.textContent = board[r][c] ? board[r][c] : '';
        gridEl.appendChild(tile);
      }
    }
  }

  function move(dir) {
    if (gameOver) return;
    var moved = false;
    var merged = false;

    function slideRow(row) {
      var arr = row.filter(function(v) { return v !== 0; });
      for (var i = 0; i < arr.length - 1; i++) {
        if (arr[i] === arr[i + 1]) {
          arr[i] *= 2;
          p1Score += arr[i];
          arr[i + 1] = 0;
          merged = true;
          if (arr[i] >= 64) {
            myAvatarMood.textContent = '🤩';
            myBubble.textContent = '合成出 ' + arr[i] + '！暴击加分！';
          }
        }
      }
      arr = arr.filter(function(v) { return v !== 0; });
      while (arr.length < 4) arr.push(0);
      return arr;
    }

    if (dir === 'left') {
      for (var r = 0; r < 4; r++) {
        var old = board[r].slice();
        board[r] = slideRow(board[r]);
        if (old.some(function(v, i) { return v !== board[r][i]; })) moved = true;
      }
    } else if (dir === 'right') {
      for (var r = 0; r < 4; r++) {
        var old = board[r].slice();
        board[r] = slideRow(board[r].slice().reverse()).reverse();
        if (old.some(function(v, i) { return v !== board[r][i]; })) moved = true;
      }
    } else if (dir === 'up') {
      for (var c = 0; c < 4; c++) {
        var col = [board[0][c], board[1][c], board[2][c], board[3][c]];
        var res = slideRow(col);
        for (var r = 0; r < 4; r++) {
          if (board[r][c] !== res[r]) moved = true;
          board[r][c] = res[r];
        }
      }
    } else if (dir === 'down') {
      for (var c = 0; c < 4; c++) {
        var col = [board[3][c], board[2][c], board[1][c], board[0][c]];
        var res = slideRow(col);
        for (var r = 0; r < 4; r++) {
          if (board[3 - r][c] !== res[r]) moved = true;
          board[3 - r][c] = res[r];
        }
      }
    }

    if (moved) {
      if (merged) playMerge();
      else playSlide();
      spawnTile();
      p1ScoreEl.textContent = p1Score;
      render();

      // Check win 2048
      for (var r = 0; r < 4; r++) {
        for (var c = 0; c < 4; c++) {
          if (board[r][c] === 2048) {
            handleGameOver(true);
            return;
          }
        }
      }

      // Simulate opponent score in AI mode
      if (mode === 'ai') {
        p2Score += Math.floor(Math.random() * 8) * 2;
        p2ScoreEl.textContent = p2Score;
      }
    }
  }

  function handleGameOver(p1Won) {
    gameOver = true;
    if (p1Won) {
      statusBanner.textContent = '🎉 冲刺 2048 成功！你是数字大师！';
      myAvatarMood.textContent = '🏆';
      myAvatarMood.classList.add('celebrate');
      oppAvatarMood.textContent = '😭';
    } else {
      statusBanner.textContent = '💥 棋盘卡死，对手得分更高！';
      oppAvatarMood.textContent = '👑';
      oppAvatarMood.classList.add('celebrate');
      myAvatarMood.textContent = '😵';
    }

    setTimeout(function() {
      penaltyTitle.textContent = p1Won ? '2048登顶！' : '2048惜败！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 800);
  }

  window.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowUp') move('up');
    else if (e.key === 'ArrowDown') move('down');
    else if (e.key === 'ArrowLeft') move('left');
    else if (e.key === 'ArrowRight') move('right');
  });

  document.querySelectorAll('.d-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      move(btn.getAttribute('data-dir'));
    });
  });

  opponentTypeBtn.addEventListener('click', function() {
    mode = mode === 'ai' ? 'local' : 'ai';
    opponentTypeBtn.textContent = mode === 'ai' ? '🤖 智能人机' : '👥 同屏双人';
    initBoard();
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
    initBoard();
  });

  onlineBtn.addEventListener('click', function() {
    if (window.OmniNetUI && window.OmniNetUI.openLobby) {
      window.OmniNetUI.openLobby('2048-clash', '2048 竞速死斗', function(session) {
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

  initBoard();
})();