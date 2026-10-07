/* 大吃小井字棋 - Gobblet Monster Clash */
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
    '模仿怪兽嗷呜大叫一声！ 🦖'
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

  function playChomp() {
    playTone(180, 'sawtooth', 0.12, 0.25);
    setTimeout(function() { playTone(90, 'sine', 0.2, 0.3); }, 80);
  }

  function playPlace() {
    playTone(450, 'triangle', 0.08, 0.2);
  }

  var P1_MONSTERS = { 1: '🐥', 2: '🦊', 3: '🦁' };
  var P2_MONSTERS = { 1: '👾', 2: '👹', 3: '🐲' };

  var board = []; // 3x3 array of stacks: [{ player: 1, size: 2 }]
  var p1Reserve = [1, 1, 2, 2, 3, 3];
  var p2Reserve = [1, 1, 2, 2, 3, 3];

  var turn = 1;
  var myPlayer = 1;
  var mode = 'ai';
  var net = null;
  var isHost = true;
  var gameOver = false;
  var selected = null; // { from: 'reserve', index: 0, size: 2 } or { from: 'board', r: 0, c: 1, size: 2 }

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
  var oppReserveEl = document.getElementById('oppReserve');
  var myReserveEl = document.getElementById('myReserve');
  var cells = document.querySelectorAll('.gobblet-cell');
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
    board = [
      [[], [], []],
      [[], [], []],
      [[], [], []]
    ];
    p1Reserve = [1, 1, 2, 2, 3, 3];
    p2Reserve = [1, 1, 2, 2, 3, 3];
    turn = 1;
    gameOver = false;
    selected = null;
    renderAll();
    updateStatus();
    oppAvatarMood.textContent = '😏';
    myAvatarMood.textContent = '🐱';
    oppAvatarMood.classList.remove('celebrate');
    myAvatarMood.classList.remove('celebrate');
  }

  function renderAll() {
    renderReserves();
    renderBoard();
  }

  function renderReserves() {
    myReserveEl.innerHTML = '';
    oppReserveEl.innerHTML = '';

    p1Reserve.forEach(function(size, idx) {
      var chip = document.createElement('div');
      chip.className = 'monster-chip size-' + size + (selected && selected.from === 'reserve' && selected.index === idx ? ' selected' : '');
      chip.textContent = P1_MONSTERS[size];
      chip.onclick = function() {
        if (gameOver) return;
        if (mode === 'online' && turn !== myPlayer) return;
        if (mode === 'ai' && turn !== 1) return;
        if (turn !== 1) return;
        selected = { from: 'reserve', index: idx, size: size, player: 1 };
        renderAll();
      };
      myReserveEl.appendChild(chip);
    });

    p2Reserve.forEach(function(size, idx) {
      var chip = document.createElement('div');
      chip.className = 'monster-chip p2 size-' + size;
      chip.textContent = P2_MONSTERS[size];
      if (mode === 'local' && turn === 2) {
        chip.onclick = function() {
          if (gameOver) return;
          selected = { from: 'reserve', index: idx, size: size, player: 2 };
          renderAll();
        };
      }
      oppReserveEl.appendChild(chip);
    });
  }

  function renderBoard() {
    cells.forEach(function(cell) {
      var r = parseInt(cell.getAttribute('data-r'));
      var c = parseInt(cell.getAttribute('data-c'));
      var stack = board[r][c];
      cell.innerHTML = '';
      cell.classList.remove('highlight');

      if (stack.length > 0) {
        var topPiece = stack[stack.length - 1];
        var chip = document.createElement('div');
        chip.className = 'monster-chip ' + (topPiece.player === 2 ? 'p2 ' : '') + 'size-' + topPiece.size;
        chip.textContent = topPiece.player === 1 ? P1_MONSTERS[topPiece.size] : P2_MONSTERS[topPiece.size];
        cell.appendChild(chip);
      }

      if (selected && canPlace(r, c, selected.size)) {
        cell.classList.add('highlight');
      }

      cell.onclick = function() {
        if (gameOver) return;
        if (mode === 'online' && turn !== myPlayer) return;
        if (mode === 'ai' && turn !== 1) return;

        // If clicking top piece of own color to select moving it
        if (!selected && stack.length > 0 && stack[stack.length - 1].player === turn) {
          selected = { from: 'board', r: r, c: c, size: stack[stack.length - 1].size, player: turn };
          renderAll();
          return;
        }

        // Try placing selected
        if (selected) {
          if (canPlace(r, c, selected.size)) {
            executeMove(selected, r, c);
          } else {
            selected = null;
            renderAll();
          }
        }
      };
    });
  }

  function canPlace(r, c, size) {
    var stack = board[r][c];
    if (stack.length === 0) return true;
    return stack[stack.length - 1].size < size;
  }

  function executeMove(sel, r, c) {
    var stack = board[r][c];
    var isChomp = stack.length > 0;

    if (sel.from === 'reserve') {
      if (sel.player === 1) p1Reserve.splice(sel.index, 1);
      else p2Reserve.splice(sel.index, 1);
    } else {
      board[sel.r][sel.c].pop();
    }

    board[r][c].push({ player: sel.player, size: sel.size });

    if (isChomp) {
      playChomp();
      var targetCell = document.querySelector('[data-r="' + r + '"][data-c="' + c + '"]');
      if (targetCell) targetCell.classList.add('chomp-anim');
      if (sel.player === 1) {
        myBubble.textContent = '嗷呜！一口吞掉！';
        oppAvatarMood.textContent = '😱';
        oppBubble.textContent = '啊！我的小怪兽！';
      } else {
        oppBubble.textContent = '哈哈，大吃小！';
        myAvatarMood.textContent = '😨';
      }
    } else {
      playPlace();
    }

    if (mode === 'online' && net && sel.player === myPlayer) {
      net.send('move', { sel: sel, r: r, c: c });
    }

    selected = null;
    renderAll();

    var winner = checkBoardWin();
    if (winner) {
      gameOver = true;
      handleWin(winner);
      return;
    }

    turn = turn === 1 ? 2 : 1;
    updateStatus();

    if (!gameOver && mode === 'ai' && turn === 2) {
      setTimeout(aiTurn, 400);
    }
  }

  function checkBoardWin() {
    var lines = [
      [[0,0],[0,1],[0,2]], [[1,0],[1,1],[1,2]], [[2,0],[2,1],[2,2]],
      [[0,0],[1,0],[2,0]], [[0,1],[1,1],[2,1]], [[0,2],[1,2],[2,2]],
      [[0,0],[1,1],[2,2]], [[0,2],[1,1],[2,0]]
    ];

    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      var p1 = getTopPlayer(l[0][0], l[0][1]);
      var p2 = getTopPlayer(l[1][0], l[1][1]);
      var p3 = getTopPlayer(l[2][0], l[2][1]);
      if (p1 && p1 === p2 && p2 === p3) return p1;
    }
    return null;
  }

  function getTopPlayer(r, c) {
    var st = board[r][c];
    if (st.length === 0) return null;
    return st[st.length - 1].player;
  }

  function handleWin(winner) {
    var isMe = (mode === 'online' && winner === myPlayer) || (mode !== 'online' && winner === 1);
    if (isMe) {
      p1Score++;
      p1ScoreEl.textContent = p1Score;
      statusBanner.textContent = '🎉 吞噬全场！你赢了！';
      myAvatarMood.textContent = '🦖';
      myAvatarMood.classList.add('celebrate');
      oppAvatarMood.textContent = '😭';
      myBubble.textContent = '怪兽大乱斗，我是王者！';
    } else {
      p2Score++;
      p2ScoreEl.textContent = p2Score;
      statusBanner.textContent = '💥 对手连成一线，你被吞掉了！';
      oppAvatarMood.textContent = '👑';
      oppAvatarMood.classList.add('celebrate');
      myAvatarMood.textContent = '😵';
      oppBubble.textContent = '吞噬全局，毫无悬念！';
    }

    setTimeout(function() {
      penaltyTitle.textContent = isMe ? '你赢了！' : '对方赢了！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 1000);
  }

  function updateStatus() {
    if (gameOver) return;
    if (mode === 'online') {
      statusBanner.textContent = turn === myPlayer ? '🟢 轮到你派遣/移动怪兽' : '⏳ 等待对方出招…';
    } else if (mode === 'ai') {
      statusBanner.textContent = turn === 1 ? '🟢 轮到你：选怪兽下场或吞噬' : '🤖 怪兽大军思考中…';
    } else {
      statusBanner.textContent = turn === 1 ? '🐥 轮到玩家1 出招' : '👾 轮到玩家2 出招';
    }
  }

  function aiTurn() {
    if (gameOver) return;
    // Check valid moves from reserve
    var validMoves = [];
    p2Reserve.forEach(function(size, idx) {
      for (var r = 0; r < 3; r++) {
        for (var c = 0; c < 3; c++) {
          if (canPlace(r, c, size)) {
            validMoves.push({ sel: { from: 'reserve', index: idx, size: size, player: 2 }, r: r, c: c });
          }
        }
      }
    });

    if (validMoves.length === 0) return;

    // Prefer center or winning move
    var chosen = validMoves[0];
    for (var i = 0; i < validMoves.length; i++) {
      var m = validMoves[i];
      if (m.r === 1 && m.c === 1 && m.sel.size >= 2) { chosen = m; break; }
    }
    if (chosen) executeMove(chosen.sel, chosen.r, chosen.c);
  }

  opponentTypeBtn.addEventListener('click', function() {
    if (mode === 'ai') {
      mode = 'local';
      opponentTypeBtn.textContent = '👥 同屏双人';
      p2Name.textContent = '玩家2';
    } else {
      mode = 'ai';
      opponentTypeBtn.textContent = '🤖 智能人机';
      p2Name.textContent = '怪兽大师';
    }
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
      window.OmniNetUI.openLobby('tictactoe-ultimate', '大吃小井字棋', function(session) {
        if (!session) return;
        mode = session.mode;
        net = session.net;
        isHost = session.isHost;

        if (mode === 'online') {
          myPlayer = isHost ? 1 : 2;
          opponentTypeBtn.textContent = '🌐 联机对战';
          p1Name.textContent = '你 (' + (isHost ? '黄队/先手' : '紫队/后手') + ')';
          p2Name.textContent = (session.opponent && session.opponent.nickname) || '联机好友';

          net.on('msg:move', function(data) {
            executeMove(data.sel, data.r, data.c);
          });
          initGame();
        }
      });
    }
  });

  initGame();
})();