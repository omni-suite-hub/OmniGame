/* 点格棋领地战 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '为赢家捶背捏肩 30 秒 💆',
    '自罚原地做 5 个深蹲 🏃',
    '大喊一声“摸鱼占地王在此！” 📢'
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

  var N = 4; // 4x4 boxes -> 5x5 dots
  var hEdges = []; // (N+1) x N
  var vEdges = []; // N x (N+1)
  var boxes = [];  // N x N, owner: 0, 1, 2

  var turn = 1;
  var myPlayer = 1;
  var p1Score = 0;
  var p2Score = 0;
  var gameOver = false;
  var mode = 'ai';
  var net = null;
  var roundNum = 1;

  var wrap = document.getElementById('dotsGridWrap');
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

  function initGrid() {
    hEdges = [];
    for (var r = 0; r <= N; r++) {
      hEdges[r] = [];
      for (var c = 0; c < N; c++) hEdges[r][c] = 0;
    }
    vEdges = [];
    for (var r = 0; r < N; r++) {
      vEdges[r] = [];
      for (var c = 0; c <= N; c++) vEdges[r][c] = 0;
    }
    boxes = [];
    for (var r = 0; r < N; r++) {
      boxes[r] = [];
      for (var c = 0; c < N; c++) boxes[r][c] = 0;
    }
    p1Score = 0; p2Score = 0;
    p1ScoreEl.textContent = '0'; p2ScoreEl.textContent = '0';
    turn = 1;
    gameOver = false;
    renderGrid();
    updateStatus();
    oppAvatarMood.textContent = '😏';
    myAvatarMood.textContent = '🐱';
  }

  function renderGrid() {
    wrap.innerHTML = '';
    for (var r = 0; r <= N; r++) {
      // Row with dots and hEdges
      var dRow = document.createElement('div');
      dRow.className = 'dots-row';
      for (var c = 0; c <= N; c++) {
        var dot = document.createElement('div');
        dot.className = 'dot';
        dRow.appendChild(dot);

        if (c < N) {
          (function(row, col) {
            var he = document.createElement('div');
            he.className = 'edge-h' + (hEdges[row][col] ? ' claimed-' + hEdges[row][col] : '');
            he.onclick = function() { claimEdge('h', row, col); };
            dRow.appendChild(he);
          })(r, c);
        }
      }
      wrap.appendChild(dRow);

      // Row with vEdges and box cells
      if (r < N) {
        var bRow = document.createElement('div');
        bRow.className = 'dots-row';
        for (var c = 0; c <= N; c++) {
          (function(row, col) {
            var ve = document.createElement('div');
            ve.className = 'edge-v' + (vEdges[row][col] ? ' claimed-' + vEdges[row][col] : '');
            ve.onclick = function() { claimEdge('v', row, col); };
            bRow.appendChild(ve);
          })(r, c);

          if (c < N) {
            var box = document.createElement('div');
            box.className = 'box-cell' + (boxes[r][c] ? ' claimed' : '');
            box.textContent = boxes[r][c] === 1 ? '🐱' : (boxes[r][c] === 2 ? '🐶' : '');
            bRow.appendChild(box);
          }
        }
        wrap.appendChild(bRow);
      }
    }
  }

  function claimEdge(type, r, c) {
    if (gameOver) return;
    if (mode === 'online' && turn !== myPlayer) return;
    if (mode === 'ai' && turn !== 1) return;

    if (type === 'h' && hEdges[r][c] !== 0) return;
    if (type === 'v' && vEdges[r][c] !== 0) return;

    applyEdge(type, r, c, turn);

    if (mode === 'online' && net) {
      net.send('edge', { type: type, r: r, c: c });
    }
  }

  function applyEdge(type, r, c, p) {
    if (type === 'h') hEdges[r][c] = p;
    else vEdges[r][c] = p;

    playTone(520, 'triangle', 0.08, 0.2);

    // Check completed boxes
    var completedCount = checkCompletedBoxes(p);
    renderGrid();

    if (completedCount > 0) {
      playTone(880, 'sine', 0.18, 0.3);
      if (p === 1) {
        p1Score += completedCount;
        p1ScoreEl.textContent = p1Score;
        myBubble.textContent = '占领地盘！继续连线！';
        myAvatarMood.textContent = '🤩';
      } else {
        p2Score += completedCount;
        p2ScoreEl.textContent = p2Score;
        oppBubble.textContent = '这片区域归我了！';
        oppAvatarMood.textContent = '😈';
      }

      if (isAllBoxesClaimed()) {
        gameOver = true;
        handleGameOver();
        return;
      }
      // Keeps turn!
    } else {
      turn = turn === 1 ? 2 : 1;
    }

    updateStatus();

    if (!gameOver && mode === 'ai' && turn === 2) {
      setTimeout(aiMove, 350);
    }
  }

  function checkCompletedBoxes(p) {
    var count = 0;
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        if (boxes[r][c] === 0) {
          if (hEdges[r][c] && hEdges[r + 1][c] && vEdges[r][c] && vEdges[r][c + 1]) {
            boxes[r][c] = p;
            count++;
          }
        }
      }
    }
    return count;
  }

  function isAllBoxesClaimed() {
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        if (boxes[r][c] === 0) return false;
      }
    }
    return true;
  }

  function handleGameOver() {
    var p1Won = p1Score > p2Score;
    var tie = p1Score === p2Score;
    if (tie) {
      statusBanner.textContent = '🤝 势均力敌！握手言和！';
    } else if (p1Won) {
      statusBanner.textContent = '🎉 领地领跑！你赢下了本局！';
      myAvatarMood.textContent = '👑';
      myAvatarMood.classList.add('celebrate');
      oppAvatarMood.textContent = '😭';
    } else {
      statusBanner.textContent = '💥 对手占领了多数领地！惜败！';
      oppAvatarMood.textContent = '😎';
      oppAvatarMood.classList.add('celebrate');
      myAvatarMood.textContent = '😵';
    }

    setTimeout(function() {
      penaltyTitle.textContent = p1Won ? '你占领了所有领地！' : '对方赢了！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 1000);
  }

  function aiMove() {
    if (gameOver) return;
    // 1. Find edge that completes a box
    var completingMove = findCompletingEdge();
    if (completingMove) {
      applyEdge(completingMove.type, completingMove.r, completingMove.c, 2);
      return;
    }

    // 2. Find safe edge (does not give opponent 3rd edge)
    var safeMoves = findSafeEdges();
    if (safeMoves.length > 0) {
      var m = safeMoves[Math.floor(Math.random() * safeMoves.length)];
      applyEdge(m.type, m.r, m.c, 2);
      return;
    }

    // 3. Fallback any edge
    var anyMoves = getAllEmptyEdges();
    if (anyMoves.length > 0) {
      var m = anyMoves[Math.floor(Math.random() * anyMoves.length)];
      applyEdge(m.type, m.r, m.c, 2);
    }
  }

  function findCompletingEdge() {
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        if (boxes[r][c] === 0) {
          var edges = [
            { type: 'h', r: r, c: c, filled: hEdges[r][c] !== 0 },
            { type: 'h', r: r + 1, c: c, filled: hEdges[r + 1][c] !== 0 },
            { type: 'v', r: r, c: c, filled: vEdges[r][c] !== 0 },
            { type: 'v', r: r, c: c + 1, filled: vEdges[r][c + 1] !== 0 }
          ];
          var empty = edges.filter(function(e) { return !e.filled; });
          if (empty.length === 1) return empty[0];
        }
      }
    }
    return null;
  }

  function findSafeEdges() {
    var all = getAllEmptyEdges();
    return all.filter(function(m) {
      // Simulate edge and see if any box now has 3 edges
      var bad = false;
      for (var r = 0; r < N && !bad; r++) {
        for (var c = 0; c < N && !bad; c++) {
          if (boxes[r][c] === 0) {
            var count = (hEdges[r][c] ? 1 : 0) + (hEdges[r + 1][c] ? 1 : 0) + (vEdges[r][c] ? 1 : 0) + (vEdges[r][c + 1] ? 1 : 0);
            var isThis = (m.type === 'h' && ((m.r === r && m.c === c) || (m.r === r + 1 && m.c === c))) ||
                         (m.type === 'v' && ((m.r === r && m.c === c) || (m.r === r && m.c === c + 1)));
            if (isThis && count === 2) bad = true;
          }
        }
      }
      return !bad;
    });
  }

  function getAllEmptyEdges() {
    var list = [];
    for (var r = 0; r <= N; r++) {
      for (var c = 0; c < N; c++) if (hEdges[r][c] === 0) list.push({ type: 'h', r: r, c: c });
    }
    for (var r = 0; r < N; r++) {
      for (var c = 0; c <= N; c++) if (vEdges[r][c] === 0) list.push({ type: 'v', r: r, c: c });
    }
    return list;
  }

  function updateStatus() {
    if (gameOver) return;
    if (mode === 'online') {
      statusBanner.textContent = turn === myPlayer ? '🟢 轮到你连线' : '⏳ 等待对方连线…';
    } else if (mode === 'ai') {
      statusBanner.textContent = turn === 1 ? '🟢 轮到你连线' : '🤖 人机推演中…';
    } else {
      statusBanner.textContent = turn === 1 ? '🐱 轮到玩家1 连线' : '🐶 轮到玩家2 连线';
    }
  }

  opponentTypeBtn.addEventListener('click', function() {
    mode = mode === 'ai' ? 'local' : 'ai';
    opponentTypeBtn.textContent = mode === 'ai' ? '🤖 智能人机' : '👥 同屏双人';
    initGrid();
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
    initGrid();
  });

  onlineBtn.addEventListener('click', function() {
    if (window.OmniNetUI && window.OmniNetUI.openLobby) {
      window.OmniNetUI.openLobby('dots-and-boxes', '点格棋领地战', function(session) {
        if (!session) return;
        mode = session.mode;
        net = session.net;
        isHost = session.isHost;
        if (mode === 'online') {
          myPlayer = isHost ? 1 : 2;
          opponentTypeBtn.textContent = '🌐 联机对战';
          p1Name.textContent = '你 (' + (isHost ? '蓝线' : '红线') + ')';
          p2Name.textContent = (session.opponent && session.opponent.nickname) || '联机好友';

          net.on('msg:edge', function(data) {
            applyEdge(data.type, data.r, data.c, myPlayer === 1 ? 2 : 1);
          });
          initGrid();
        }
      });
    }
  });

  initGrid();
})();