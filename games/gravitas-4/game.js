/*
 * games/gravitas-4/game.js
 * Gravitas 4 (重力方阵) — Original Turn-based Gravity Shift Connect-4.
 *
 * Supports:
 * - Smart AI with rotation foresight
 * - Local 2-Player mode
 * - Realtime P2P Online / LAN Multiplayer via OmniNet
 * - Battle history & Elo persistence via GameStore
 */
(function () {
  'use strict';

  var ROWS = 7;
  var COLS = 7;
  var P1 = 1; // Blue
  var P2 = 2; // Red

  var state = {
    grid: [], // [r][c], 0 empty, 1 P1, 2 P2
    turn: P1,
    mode: 'ai', // 'ai' | 'local' | 'online'
    net: null,
    myPlayerId: P1,
    rotationDeg: 0,
    gameOver: false,
    animating: false
  };

  // DOM elements
  var boardEl = document.getElementById('board');
  var boardFrameEl = document.getElementById('boardFrame');
  var dropRowEl = document.getElementById('dropRow');
  var p1Pill = document.getElementById('p1Pill');
  var p2Pill = document.getElementById('p2Pill');
  var p1Name = document.getElementById('p1Name');
  var p2Name = document.getElementById('p2Name');
  var turnIndicator = document.getElementById('turnIndicator');
  var rotLeftBtn = document.getElementById('rotLeftBtn');
  var rotRightBtn = document.getElementById('rotRightBtn');
  var modeSelectBtn = document.getElementById('modeSelectBtn');
  var onlineLobbyBtn = document.getElementById('onlineLobbyBtn');
  var overlay = document.getElementById('overlay');
  var winnerTitle = document.getElementById('winnerTitle');
  var winnerDesc = document.getElementById('winnerDesc');
  var matchStats = document.getElementById('matchStats');
  var playAgainBtn = document.getElementById('playAgainBtn');
  var changeModeBtn = document.getElementById('changeModeBtn');
  var backBtn = document.querySelector('[data-back]');

  /* ---------------- Responsive Sizing ---------------- */
  function fitStage() {
    var stage = document.querySelector('.board-stage');
    if (!stage) return;
    var rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var availW = rect.width - 24;
    var availH = rect.height - 40;
    var size = Math.floor(Math.min(availW, availH));
    size = Math.max(180, Math.min(size, 640));
    document.documentElement.style.setProperty('--bw', size + 'px');
  }
  window.addEventListener('resize', fitStage);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(fitStage).observe(document.querySelector('.board-stage'));
  }

  /* ---------------- Core Board Logic ---------------- */
  function initGrid() {
    var g = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) row.push(0);
      g.push(row);
    }
    return g;
  }

  function applyGravity(grid) {
    for (var c = 0; c < COLS; c++) {
      var chips = [];
      for (var r = 0; r < ROWS; r++) {
        if (grid[r][c] !== 0) chips.push(grid[r][c]);
      }
      for (var r = 0; r < ROWS; r++) {
        var emptySlots = ROWS - chips.length;
        if (r < emptySlots) grid[r][c] = 0;
        else grid[r][c] = chips[r - emptySlots];
      }
    }
    return grid;
  }

  function dropChip(grid, col, player) {
    for (var r = ROWS - 1; r >= 0; r--) {
      if (grid[r][col] === 0) {
        grid[r][col] = player;
        return r;
      }
    }
    return -1; // Column full
  }

  function rotateGrid(grid, dir) {
    var newGrid = initGrid();
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (dir === 'right') newGrid[c][ROWS - 1 - r] = grid[r][c];
        else newGrid[COLS - 1 - c][r] = grid[r][c];
      }
    }
    return applyGravity(newGrid);
  }

  function checkWin(grid) {
    var lines = [];
    // Horizontal
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c <= COLS - 4; c++) {
        var p = grid[r][c];
        if (p !== 0 && p === grid[r][c + 1] && p === grid[r][c + 2] && p === grid[r][c + 3]) {
          lines.push({ player: p, cells: [[r, c], [r, c + 1], [r, c + 2], [r, c + 3]] });
        }
      }
    }
    // Vertical
    for (var c = 0; c < COLS; c++) {
      for (var r = 0; r <= ROWS - 4; r++) {
        var p = grid[r][c];
        if (p !== 0 && p === grid[r + 1][c] && p === grid[r + 2][c] && p === grid[r + 3][c]) {
          lines.push({ player: p, cells: [[r, c], [r + 1, c], [r + 2, c], [r + 3, c]] });
        }
      }
    }
    // Diagonal \
    for (var r = 0; r <= ROWS - 4; r++) {
      for (var c = 0; c <= COLS - 4; c++) {
        var p = grid[r][c];
        if (p !== 0 && p === grid[r + 1][c + 1] && p === grid[r + 2][c + 2] && p === grid[r + 3][c + 3]) {
          lines.push({ player: p, cells: [[r, c], [r + 1, c + 1], [r + 2, c + 2], [r + 3, c + 3]] });
        }
      }
    }
    // Diagonal /
    for (var r = 3; r < ROWS; r++) {
      for (var c = 0; c <= COLS - 4; c++) {
        var p = grid[r][c];
        if (p !== 0 && p === grid[r - 1][c + 1] && p === grid[r - 2][c + 2] && p === grid[r - 3][c + 3]) {
          lines.push({ player: p, cells: [[r, c], [r - 1, c + 1], [r - 2, c + 2], [r - 3, c + 3]] });
        }
      }
    }
    return lines;
  }

  /* ---------------- UI Render ---------------- */
  function renderBoard(winningCells) {
    boardEl.innerHTML = '';
    var winMap = {};
    if (winningCells) {
      winningCells.forEach(function (pt) { winMap[pt[0] + '_' + pt[1]] = true; });
    }

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        var p = state.grid[r][c];
        if (p === P1) cell.classList.add('p1');
        else if (p === P2) cell.classList.add('p2');

        if (winMap[r + '_' + c]) cell.classList.add('win');

        var chip = document.createElement('div');
        chip.className = 'chip';
        cell.appendChild(chip);

        cell.addEventListener('click', onCellClick);
        boardEl.appendChild(cell);
      }
    }
  }

  function renderDropRow() {
    dropRowEl.innerHTML = '';
    for (var c = 0; c < COLS; c++) {
      var btn = document.createElement('button');
      btn.className = 'drop-btn';
      btn.textContent = '▼';
      btn.dataset.col = c;
      btn.addEventListener('click', function () {
        handleMove(parseInt(this.dataset.col, 10));
      });
      dropRowEl.appendChild(btn);
    }
  }

  function updateStatus() {
    if (state.turn === P1) {
      p1Pill.classList.add('active');
      p2Pill.classList.remove('active');
      if (state.mode === 'online') {
        turnIndicator.textContent = state.myPlayerId === P1 ? '🟢 你的回合' : '⏳ 等待对手…';
      } else {
        turnIndicator.textContent = '蓝方回合';
      }
    } else {
      p2Pill.classList.add('active');
      p1Pill.classList.remove('active');
      if (state.mode === 'online') {
        turnIndicator.textContent = state.myPlayerId === P2 ? '🟢 你的回合' : '⏳ 等待对手…';
      } else if (state.mode === 'ai') {
        turnIndicator.textContent = '🤖 AI 思考中…';
      } else {
        turnIndicator.textContent = '红方回合';
      }
    }

    var canAct = !state.gameOver && !state.animating && (state.mode !== 'online' || state.turn === state.myPlayerId) && (state.mode !== 'ai' || state.turn === P1);
    if (rotLeftBtn) { rotLeftBtn.disabled = !canAct; rotLeftBtn.style.opacity = canAct ? '1' : '0.4'; }
    if (rotRightBtn) { rotRightBtn.disabled = !canAct; rotRightBtn.style.opacity = canAct ? '1' : '0.4'; }
  }

  /* ---------------- Player Moves ---------------- */
  function onCellClick(e) {
    var c = parseInt(this.dataset.c, 10);
    handleMove(c);
  }

  function handleMove(col) {
    if (state.gameOver || state.animating) return;

    if (state.mode === 'online' && state.turn !== state.myPlayerId) return;
    if (state.mode === 'ai' && state.turn !== P1) return;

    executeDrop(col, state.turn, true);
  }

  function executeDrop(col, player, isLocalAction) {
    var r = dropChip(state.grid, col, player);
    if (r === -1) return; // Column was full

    renderBoard();

    if (isLocalAction && state.mode === 'online' && state.net) {
      state.net.send('move', { type: 'drop', col: col });
    }

    checkPostTurn();
  }

  function handleRotate(dir) {
    if (state.gameOver || state.animating) return;
    if (state.mode === 'online' && state.turn !== state.myPlayerId) return;
    if (state.mode === 'ai' && state.turn !== P1) return;

    executeRotate(dir, true);
  }

  function executeRotate(dir, isLocalAction) {
    state.animating = true;
    var delta = dir === 'right' ? 90 : -90;
    state.rotationDeg += delta;
    boardFrameEl.style.transform = 'rotate(' + state.rotationDeg + 'deg)';

    setTimeout(function () {
      state.grid = rotateGrid(state.grid, dir);
      renderBoard();
      state.animating = false;

      if (isLocalAction && state.mode === 'online' && state.net) {
        state.net.send('move', { type: 'rotate', dir: dir });
      }

      checkPostTurn();
    }, 600);
  }

  function checkPostTurn() {
    var wins = checkWin(state.grid);
    if (wins.length > 0) {
      var p1Wins = wins.some(function (w) { return w.player === P1; });
      var p2Wins = wins.some(function (w) { return w.player === P2; });
      var winCells = [];
      wins.forEach(function (w) { winCells = winCells.concat(w.cells); });

      renderBoard(winCells);
      state.gameOver = true;

      if (p1Wins && p2Wins) {
        endGame(state.turn, '翻转产生双重 4 连，主动翻转方绝杀！');
      } else if (p1Wins) {
        endGame(P1, '连成 4 子，达成胜利！');
      } else {
        endGame(P2, '连成 4 子，达成胜利！');
      }
      return;
    }

    // Switch turns
    state.turn = state.turn === P1 ? P2 : P1;
    updateStatus();

    // AI Turn trigger
    if (state.mode === 'ai' && state.turn === P2 && !state.gameOver) {
      setTimeout(makeAiMove, 400);
    }
  }

  /* ---------------- Intelligent AI ---------------- */
  function makeAiMove() {
    if (state.gameOver) return;

    // 1. Can AI win immediately with a drop?
    for (var c = 0; c < COLS; c++) {
      var copy = cloneGrid(state.grid);
      if (dropChip(copy, c, P2) !== -1) {
        if (checkWin(copy).some(function (w) { return w.player === P2; })) {
          executeDrop(c, P2, false);
          return;
        }
      }
    }

    // 2. Can AI win immediately with a rotation?
    var rotRight = rotateGrid(cloneGrid(state.grid), 'right');
    if (checkWin(rotRight).some(function (w) { return w.player === P2; })) {
      executeRotate('right', false);
      return;
    }
    var rotLeft = rotateGrid(cloneGrid(state.grid), 'left');
    if (checkWin(rotLeft).some(function (w) { return w.player === P2; })) {
      executeRotate('left', false);
      return;
    }

    // 3. Must AI block Player's immediate win?
    for (var c = 0; c < COLS; c++) {
      var copy = cloneGrid(state.grid);
      if (dropChip(copy, c, P1) !== -1) {
        if (checkWin(copy).some(function (w) { return w.player === P1; })) {
          executeDrop(c, P2, false);
          return;
        }
      }
    }

    // 4. Center-priority heuristic placement
    var colOrder = [3, 2, 4, 1, 5, 0, 6];
    for (var i = 0; i < colOrder.length; i++) {
      var c = colOrder[i];
      var copy = cloneGrid(state.grid);
      if (dropChip(copy, c, P2) !== -1) {
        // Ensure dropping here doesn't immediately hand Player a win next move
        var pCopy = cloneGrid(copy);
        if (dropChip(pCopy, c, P1) !== -1 && checkWin(pCopy).some(function (w) { return w.player === P1; })) {
          continue; // skip this trap
        }
        executeDrop(c, P2, false);
        return;
      }
    }

    // Fallback: first available column
    for (var c = 0; c < COLS; c++) {
      if (state.grid[0][c] === 0) {
        executeDrop(c, P2, false);
        return;
      }
    }
  }

  function cloneGrid(grid) {
    return grid.map(function (row) { return row.slice(); });
  }

  /* ---------------- End Game & Persistence ---------------- */
  function endGame(winner, reason) {
    var isWin = (state.mode === 'online' && winner === state.myPlayerId) ||
                (state.mode === 'ai' && winner === P1) ||
                (state.mode === 'local' && winner === P1);

    winnerTitle.textContent = (winner === P1 ? '🔵 蓝方获胜！' : '🔴 红方获胜！');
    winnerDesc.textContent = reason;

    overlay.hidden = false;

    // Record battle in GameStore
    if (window.GameStore && window.GameStore.recordBattle) {
      var opponentName = state.mode === 'ai' ? '🤖 智能AI' :
                         (state.mode === 'online' ? (state.opponentName || '远端玩家') : '本地双人');
      GameStore.recordBattle({
        gameId: 'gravitas-4',
        opponent: opponentName,
        result: isWin ? 'win' : 'loss',
        mode: state.mode
      }).then(function (record) {
        if (window.GameStore.getProfile) {
          window.GameStore.getProfile().then(function (prof) {
            matchStats.innerHTML = '<span>天梯分：<b>' + (prof.elo || 1200) + '</b></span>';
          });
        }
      });
    }
  }

  /* ---------------- Reset & Game Modes ---------------- */
  function resetGame() {
    state.grid = initGrid();
    state.turn = P1;
    state.gameOver = false;
    state.animating = false;
    state.rotationDeg = 0;
    boardFrameEl.style.transform = 'rotate(0deg)';
    overlay.hidden = true;
    renderBoard();
    renderDropRow();
    updateStatus();
    fitStage();
  }

  function setMode(mode, net, isHost, opponent) {
    state.mode = mode;
    state.net = net;

    if (mode === 'ai') {
      modeSelectBtn.textContent = '模式: 🤖 人机';
      p1Name.textContent = '你 (蓝)';
      p2Name.textContent = 'AI (红)';
    } else if (mode === 'local') {
      modeSelectBtn.textContent = '模式: 👥 本地';
      p1Name.textContent = '蓝方';
      p2Name.textContent = '红方';
    } else if (mode === 'online') {
      state.myPlayerId = isHost ? P1 : P2;
      state.opponentName = (opponent && opponent.nickname) || '网络好友';
      modeSelectBtn.textContent = '模式: 🌐 联机';
      p1Name.textContent = isHost ? '你 (蓝)' : state.opponentName;
      p2Name.textContent = isHost ? state.opponentName : '你 (红)';

      // Listen for peer moves
      net.on('msg:move', function (data) {
        if (data.type === 'drop') {
          executeDrop(data.col, state.turn, false);
        } else if (data.type === 'rotate') {
          executeRotate(data.dir, false);
        }
      });

      net.on('msg:rematch', function () {
        resetGame();
      });

      net.on('disconnected', function () {
        turnIndicator.textContent = '⚠️ 对手已离开房间';
        state.mode = 'ai';
        modeSelectBtn.textContent = '模式: 🤖 人机';
        p1Name.textContent = '你 (蓝)';
        p2Name.textContent = 'AI (红)';
      });
    }

    resetGame();
  }

  /* ---------------- Listeners ---------------- */
  rotLeftBtn.addEventListener('click', function () { handleRotate('left'); });
  rotRightBtn.addEventListener('click', function () { handleRotate('right'); });

  modeSelectBtn.addEventListener('click', function () {
    if (state.mode === 'ai') setMode('local');
    else setMode('ai');
  });

  onlineLobbyBtn.addEventListener('click', function () {
    if (window.OmniNetUI) {
      OmniNetUI.showLobby({
        gameId: 'gravitas-4',
        gameTitle: '重力方阵',
        onReady: function (res) {
          if (res.mode === 'online') {
            setMode('online', res.net, res.isHost, res.opponent);
          } else {
            setMode('local');
          }
        }
      });
    }
  });

  playAgainBtn.addEventListener('click', function () {
    if (state.mode === 'online' && state.net) {
      state.net.send('rematch', {});
    }
    resetGame();
  });

  changeModeBtn.addEventListener('click', function () {
    overlay.hidden = true;
    onlineLobbyBtn.click();
  });

  if (backBtn) {
    backBtn.addEventListener('click', function () {
      try { parent.postMessage({ type: 'omnigame:home' }, '*'); } catch (e) {}
      if (window.parent === window) {
        if (history.length > 1) history.back();
        else window.location.href = '../../index.html';
      }
    });
  }

  // Boot
  setMode('ai');
})();
