/* 双人扫雷死斗 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '自罚原地做 5 个深蹲 🏃',
    '大喊一声“排雷先锋，舍我其谁！” 📢'
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

  function playClick() { playTone(500, 'triangle', 0.04, 0.2); }
  function playBoom() { playTone(100, 'square', 0.3, 0.4); }

  var R = 8, C = 8, MINES = 10;
  var board = [];
  var revealed = [];
  var turn = 1;
  var p1Score = 0, p2Score = 0;
  var gameOver = false;
  var mode = 'ai';
  var net = null;
  var roundNum = 1;

  var boardEl = document.getElementById('mineBoard');
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
    board = []; revealed = [];
    for (var r = 0; r < R; r++) {
      board[r] = []; revealed[r] = [];
      for (var c = 0; c < C; c++) {
        board[r][c] = 0; revealed[r][c] = false;
      }
    }

    // Place mines
    var placed = 0;
    while (placed < MINES) {
      var rr = Math.floor(Math.random() * R);
      var cc = Math.floor(Math.random() * C);
      if (board[rr][cc] !== -1) {
        board[rr][cc] = -1;
        placed++;
      }
    }

    // Calc neighbor numbers
    for (var r = 0; r < R; r++) {
      for (var c = 0; c < C; c++) {
        if (board[r][c] === -1) continue;
        var count = 0;
        for (var dr = -1; dr <= 1; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            var nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < R && nc >= 0 && nc < C && board[nr][nc] === -1) count++;
          }
        }
        board[r][c] = count;
      }
    }

    turn = 1;
    p1Score = 0; p2Score = 0;
    p1ScoreEl.textContent = '0'; p2ScoreEl.textContent = '0';
    gameOver = false;
    renderBoard();
    updateStatus();
    oppAvatarMood.textContent = '😏';
    myAvatarMood.textContent = '🐱';
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    for (var r = 0; r < R; r++) {
      for (var c = 0; c < C; c++) {
        (function(row, col) {
          var cell = document.createElement('div');
          cell.className = 'mine-cell';
          if (revealed[row][col]) {
            cell.classList.add('revealed');
            if (board[row][col] === -1) {
              cell.classList.add('mine');
              cell.textContent = '💣';
            } else if (board[row][col] > 0) {
              cell.classList.add('num-' + board[row][col]);
              cell.textContent = board[row][col];
            }
          }

          cell.onclick = function() {
            if (turn !== 1 || gameOver || revealed[row][col]) return;
            handleCellClick(row, col, true);
          };

          boardEl.appendChild(cell);
        })(r, c);
      }
    }
  }

  function handleCellClick(r, c, isP1) {
    if (revealed[r][c] || gameOver) return;
    revealed[r][c] = true;

    if (board[r][c] === -1) {
      // Hit mine!
      playBoom();
      if (isP1) {
        p1Score = Math.max(0, p1Score - 2);
        p1ScoreEl.textContent = p1Score;
        statusBanner.textContent = '💥 踩雷啦！扣2分并移交回合！';
        myAvatarMood.textContent = '😵';
        oppAvatarMood.textContent = '🤣';
        myBubble.textContent = '啊痛痛痛！踩响了！';
        oppBubble.textContent = '感谢老铁送地雷！';
      } else {
        p2Score = Math.max(0, p2Score - 2);
        p2ScoreEl.textContent = p2Score;
      }
      turn = turn === 1 ? 2 : 1;
    } else {
      // Safe
      playClick();
      if (isP1) {
        p1Score++;
        p1ScoreEl.textContent = p1Score;
        myBubble.textContent = '安全排查！继续！';
        myAvatarMood.textContent = '😎';
      } else {
        p2Score++;
        p2ScoreEl.textContent = p2Score;
      }
    }

    renderBoard();
    updateStatus();

    // Check complete
    var unrevealedSafe = 0;
    for (var i = 0; i < R; i++) {
      for (var j = 0; j < C; j++) {
        if (!revealed[i][j] && board[i][j] !== -1) unrevealedSafe++;
      }
    }

    if (unrevealedSafe === 0) {
      handleGameOver();
    } else if (turn === 2 && mode === 'ai') {
      setTimeout(aiMove, 600);
    }
  }

  function aiMove() {
    if (gameOver) return;
    var unrev = [];
    for (var r = 0; r < R; r++) {
      for (var c = 0; c < C; c++) {
        if (!revealed[r][c]) unrev.push({ r: r, c: c });
      }
    }
    if (unrev.length === 0) return;
    var chosen = unrev[Math.floor(Math.random() * unrev.length)];
    handleCellClick(chosen.r, chosen.c, false);
  }

  function handleGameOver() {
    gameOver = true;
    var p1Won = p1Score > p2Score;
    if (p1Won) {
      statusBanner.textContent = '🎉 扫雷英雄！你得分最高获胜！';
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
      penaltyTitle.textContent = p1Won ? '扫雷先锋登顶！' : '扫雷惜败！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 800);
  }

  function updateStatus() {
    if (gameOver) return;
    statusBanner.textContent = turn === 1 ? '🟢 轮到你探雷（安全翻开可连击）' : '⏳ 对手正在小心翼翼探雷…';
  }

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
      window.OmniNetUI.openLobby('minesweeper-clash', '双人扫雷死斗', function(session) {
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