/* 五子棋巅峰对决 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '为赢家捶背捏肩 30 秒 💆',
    '主动把会议室白板擦干净 🧽',
    '自罚原地做 5 个深蹲 🏃',
    '大喊一声“摸鱼万岁！” 📢'
  ];

  var audioCtx = null;
  var soundEnabled = true;
  try { soundEnabled = localStorage.getItem('omg:sound') !== 'false'; } catch(e) {}

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

  function playClack() {
    playTone(800, 'triangle', 0.04, 0.25);
    setTimeout(function() { playTone(300, 'sine', 0.08, 0.2); }, 20);
  }

  function playWinSound() {
    [523, 659, 784, 1046].forEach(function(f, idx) {
      setTimeout(function() { playTone(f, 'sine', 0.18, 0.2); }, idx * 70);
    });
  }

  var BOARD_SIZE = 15;
  var CELL_SIZE = 21; // 15 * 21 = 315
  var canvas = document.getElementById('gomokuCanvas');
  var ctx = canvas.getContext('2d');

  var board = [];
  var moveHistory = [];
  var turn = 1; // 1: Black (P1), 2: White (P2)
  var myPiece = 1; // In online mode, 1 for host, 2 for guest
  var gameOver = false;
  var mode = 'ai'; // 'ai' | 'local' | 'online'
  var net = null;
  var isHost = true;
  var p1Score = 0;
  var p2Score = 0;
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
  var restartBtn = document.getElementById('restartBtn');
  var undoBtn = document.getElementById('undoBtn');

  var penaltyModal = document.getElementById('penaltyModal');
  var penaltyTitle = document.getElementById('penaltyTitle');
  var penaltyResultText = document.getElementById('penaltyResultText');
  var reRollPenaltyBtn = document.getElementById('reRollPenaltyBtn');
  var nextRoundBtn = document.getElementById('nextRoundBtn');

  function initBoard() {
    board = [];
    for (var r = 0; r < BOARD_SIZE; r++) {
      board[r] = [];
      for (var c = 0; c < BOARD_SIZE; c++) {
        board[r][c] = 0;
      }
    }
    moveHistory = [];
    turn = 1;
    gameOver = false;
    renderBoard();
    updateStatus();
    oppAvatarMood.textContent = '😏';
    myAvatarMood.textContent = '🐱';
    oppAvatarMood.classList.remove('celebrate');
    myAvatarMood.classList.remove('celebrate');
  }

  function renderBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid lines
    ctx.strokeStyle = '#5c3a21';
    ctx.lineWidth = 1;
    for (var i = 0; i < BOARD_SIZE; i++) {
      var pos = 10.5 + i * CELL_SIZE;
      // Horizontal
      ctx.beginPath();
      ctx.moveTo(10.5, pos);
      ctx.lineTo(10.5 + 14 * CELL_SIZE, pos);
      ctx.stroke();
      // Vertical
      ctx.beginPath();
      ctx.moveTo(pos, 10.5);
      ctx.lineTo(pos, 10.5 + 14 * CELL_SIZE);
      ctx.stroke();
    }

    // Star points (tengen & corners)
    var stars = [3, 7, 11];
    ctx.fillStyle = '#5c3a21';
    for (var sr = 0; sr < stars.length; sr++) {
      for (var sc = 0; sc < stars.length; sc++) {
        var x = 10.5 + stars[sr] * CELL_SIZE;
        var y = 10.5 + stars[sc] * CELL_SIZE;
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw placed stones
    for (var r = 0; r < BOARD_SIZE; r++) {
      for (var c = 0; c < BOARD_SIZE; c++) {
        var val = board[r][c];
        if (val !== 0) {
          drawStone(r, c, val);
        }
      }
    }

    // Highlight last move
    if (moveHistory.length > 0) {
      var last = moveHistory[moveHistory.length - 1];
      var lx = 10.5 + last.c * CELL_SIZE;
      var ly = 10.5 + last.r * CELL_SIZE;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawStone(r, c, val) {
    var x = 10.5 + c * CELL_SIZE;
    var y = 10.5 + r * CELL_SIZE;
    var rad = 9;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x + 1, y + 2, rad, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    var grad = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, rad);
    if (val === 1) { // Black
      grad.addColorStop(0, '#555555');
      grad.addColorStop(1, '#09090b');
    } else { // White
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, '#cbd5e1');
    }
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  function updateStatus() {
    if (gameOver) return;
    if (mode === 'online') {
      if (turn === myPiece) {
        statusBanner.textContent = '🟢 轮到你执子落子！';
      } else {
        statusBanner.textContent = '⏳ 等待对方思考落子…';
      }
    } else if (mode === 'ai') {
      if (turn === 1) {
        statusBanner.textContent = '🟢 轮到你执黑子落子！';
      } else {
        statusBanner.textContent = '🤖 人机正在推演棋局…';
      }
    } else {
      statusBanner.textContent = turn === 1 ? '⚫ 轮到黑方（你）落子' : '⚪ 轮到白方（同事）落子';
    }
  }

  function checkWin(r, c, piece) {
    var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (var d = 0; d < dirs.length; d++) {
      var dr = dirs[d][0], dc = dirs[d][1];
      var count = 1;
      var i = 1;
      while (r + dr * i >= 0 && r + dr * i < BOARD_SIZE && c + dc * i >= 0 && c + dc * i < BOARD_SIZE && board[r + dr * i][c + dc * i] === piece) {
        count++; i++;
      }
      i = 1;
      while (r - dr * i >= 0 && r - dr * i < BOARD_SIZE && c - dc * i >= 0 && c - dc * i < BOARD_SIZE && board[r - dr * i][c - dc * i] === piece) {
        count++; i++;
      }
      if (count >= 5) return true;
    }
    return false;
  }

  function placePiece(r, c) {
    if (gameOver || board[r][c] !== 0) return false;
    board[r][c] = turn;
    moveHistory.push({ r: r, c: c, piece: turn });
    playClack();
    renderBoard();

    if (checkWin(r, c, turn)) {
      gameOver = true;
      handleWin(turn);
      return true;
    }

    turn = turn === 1 ? 2 : 1;
    updateStatus();

    if (!gameOver && mode === 'ai' && turn === 2) {
      setTimeout(aiMove, 300);
    }
    return true;
  }

  function handleWin(winnerPiece) {
    playWinSound();
    var isMe = (mode === 'online' && winnerPiece === myPiece) || (mode !== 'online' && winnerPiece === 1);
    if (isMe) {
      p1Score++;
      p1ScoreEl.textContent = p1Score;
      statusBanner.textContent = '🎉 恭喜你！五子连珠获胜！';
      myAvatarMood.textContent = '😎';
      myAvatarMood.classList.add('celebrate');
      oppAvatarMood.textContent = '😭';
      myBubble.textContent = '五子连珠，承让承让！';
      oppBubble.textContent = '怎么可能！大意了…';
    } else {
      p2Score++;
      p2ScoreEl.textContent = p2Score;
      statusBanner.textContent = '💥 对方完成五子连珠，你惜败！';
      oppAvatarMood.textContent = '🤣';
      oppAvatarMood.classList.add('celebrate');
      myAvatarMood.textContent = '😵';
      oppBubble.textContent = '哈哈！棋艺见长吧！';
      myBubble.textContent = '算你厉害，再来一把！';
    }

    setTimeout(function() {
      showPenalty(isMe ? '你赢了！' : '对方赢了！');
    }, 1200);
  }

  function showPenalty(title) {
    penaltyTitle.textContent = title;
    var randomPenalty = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
    penaltyResultText.textContent = randomPenalty;
    penaltyModal.classList.remove('hidden');
  }

  function aiMove() {
    if (gameOver) return;
    var best = evaluateBestMove();
    if (best) {
      placePiece(best.r, best.c);
    }
  }

  function evaluateBestMove() {
    var bestScore = -Infinity;
    var bestMoves = [];

    for (var r = 0; r < BOARD_SIZE; r++) {
      for (var c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] === 0) {
          // Check neighbor has stones within 2 cells
          var hasNeighbor = false;
          for (var dr = -2; dr <= 2 && !hasNeighbor; dr++) {
            for (var dc = -2; dc <= 2 && !hasNeighbor; dc++) {
              var nr = r + dr, nc = c + dc;
              if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] !== 0) {
                hasNeighbor = true;
              }
            }
          }
          if (!hasNeighbor && moveHistory.length > 0) continue;

          var attack = getPatternScore(r, c, 2);
          var defense = getPatternScore(r, c, 1);
          var total = attack * 1.2 + defense;

          // Prefer center
          total += (7 - Math.abs(r - 7) + 7 - Math.abs(c - 7));

          if (total > bestScore) {
            bestScore = total;
            bestMoves = [{ r: r, c: c }];
          } else if (total === bestScore) {
            bestMoves.push({ r: r, c: c });
          }
        }
      }
    }

    if (bestMoves.length === 0) return { r: 7, c: 7 };
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  function getPatternScore(r, c, p) {
    var score = 0;
    var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (var d = 0; d < dirs.length; d++) {
      var dr = dirs[d][0], dc = dirs[d][1];
      var count = 1;
      var openEnds = 0;
      var i = 1;
      while (r + dr * i >= 0 && r + dr * i < BOARD_SIZE && c + dc * i >= 0 && c + dc * i < BOARD_SIZE && board[r + dr * i][c + dc * i] === p) {
        count++; i++;
      }
      if (r + dr * i >= 0 && r + dr * i < BOARD_SIZE && c + dc * i >= 0 && c + dc * i < BOARD_SIZE && board[r + dr * i][c + dc * i] === 0) openEnds++;

      i = 1;
      while (r - dr * i >= 0 && r - dr * i < BOARD_SIZE && c - dc * i >= 0 && c - dc * i < BOARD_SIZE && board[r - dr * i][c - dc * i] === p) {
        count++; i++;
      }
      if (r - dr * i >= 0 && r - dr * i < BOARD_SIZE && c - dc * i >= 0 && c - dc * i < BOARD_SIZE && board[r - dr * i][c - dc * i] === 0) openEnds++;

      if (count >= 5) score += 100000;
      else if (count === 4 && openEnds === 2) score += 10000;
      else if (count === 4 && openEnds === 1) score += 1000;
      else if (count === 3 && openEnds === 2) score += 1500;
      else if (count === 3 && openEnds === 1) score += 200;
      else if (count === 2 && openEnds === 2) score += 50;
    }
    return score;
  }

  canvas.addEventListener('click', function(e) {
    if (gameOver) return;
    if (mode === 'online' && turn !== myPiece) return;
    if (mode === 'ai' && turn !== 1) return;

    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var c = Math.round((x - 10.5) / CELL_SIZE);
    var r = Math.round((y - 10.5) / CELL_SIZE);

    if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === 0) {
      if (placePiece(r, c) && mode === 'online' && net) {
        net.send('move', { r: r, c: c });
      }
    }
  });

  restartBtn.addEventListener('click', function() {
    initBoard();
    if (mode === 'online' && net) net.send('restart', {});
  });

  undoBtn.addEventListener('click', function() {
    if (mode !== 'ai' || moveHistory.length < 2 || gameOver) return;
    var m1 = moveHistory.pop();
    var m2 = moveHistory.pop();
    board[m1.r][m1.c] = 0;
    board[m2.r][m2.c] = 0;
    turn = 1;
    renderBoard();
    updateStatus();
  });

  opponentTypeBtn.addEventListener('click', function() {
    if (mode === 'ai') {
      mode = 'local';
      opponentTypeBtn.textContent = '👥 同屏双人';
      p2Name.textContent = '玩家2(白子)';
    } else {
      mode = 'ai';
      opponentTypeBtn.textContent = '🤖 智能人机';
      p2Name.textContent = '阿尔法狗子';
    }
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
    try { localStorage.setItem('omg:sound', soundEnabled ? 'true' : 'false'); } catch (e) {}
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
      window.OmniNetUI.openLobby('gomoku-clash', '五子棋巅峰赛', function(session) {
        if (!session) return;
        mode = session.mode;
        net = session.net;
        isHost = session.isHost;

        if (mode === 'online') {
          myPiece = isHost ? 1 : 2;
          opponentTypeBtn.textContent = '🌐 联机对战';
          p1Name.textContent = '你 (' + (isHost ? '黑子/先手' : '白子/后手') + ')';
          p2Name.textContent = (session.opponent && session.opponent.nickname) || '联机好友';

          net.on('msg:move', function(data) {
            placePiece(data.r, data.c);
          });
          net.on('msg:restart', function() {
            initBoard();
          });
          initBoard();
        }
      });
    }
  });

  initBoard();
})();