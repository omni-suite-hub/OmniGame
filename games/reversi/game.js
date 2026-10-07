(function () {
  'use strict';

  var STORAGE_KEY = 'omg:save:reversi';

  var EMPTY = 0;
  var BLACK = 1;
  var WHITE = 2;

  var DIRS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1]
  ];

  // Standard positional weight matrix for 8x8 Reversi
  var WEIGHTS = [
    [ 100, -20,  10,   5,   5,  10, -20,  100],
    [-20,  -40,  -5,  -5,  -5,  -5, -40,  -20],
    [  10,  -5,   3,   2,   2,   3,  -5,   10],
    [   5,  -5,   2,   1,   1,   2,  -5,    5],
    [   5,  -5,   2,   1,   1,   2,  -5,    5],
    [  10,  -5,   3,   2,   2,   3,  -5,   10],
    [-20,  -40,  -5,  -5,  -5,  -5, -40,  -20],
    [ 100, -20,  10,   5,   5,  10, -20,  100]
  ];

  // Game state
  var board = [];
  var currentTurn = BLACK; // Black goes first
  var isGameOver = false;
  var mode = 'ai'; // 'ai' or 'pvp'
  var difficulty = 'master'; // 'easy', 'medium', 'master'
  var soundEnabled = true;
  var history = [];
  var lastFlipped = [];

  // DOM Elements
  var boardEl = document.getElementById('board');
  var countBlackEl = document.getElementById('countBlack');
  var countWhiteEl = document.getElementById('countWhite');
  var cardBlack = document.getElementById('cardBlack');
  var cardWhite = document.getElementById('cardWhite');
  var nameBlack = document.getElementById('nameBlack');
  var nameWhite = document.getElementById('nameWhite');
  var statusText = document.getElementById('statusText');
  var soundBtn = document.getElementById('soundBtn');
  var undoBtn = document.getElementById('undoBtn');
  var restartBtn = document.getElementById('restartBtn');
  var modeControl = document.getElementById('modeControl');
  var diffSelect = document.getElementById('diffSelect');
  var diffControl = document.getElementById('diffControl');

  var modal = document.getElementById('gameOverModal');
  var modalEmoji = document.getElementById('modalEmoji');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  // Web Audio Synth
  var audioCtx = null;
  function getAudioCtx() {
    if (!soundEnabled) return null;
    if (!audioCtx) {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    if (!soundEnabled) return;
    var ctx = getAudioCtx();
    if (!ctx) return;
    var t = ctx.currentTime;

    if (type === 'place') {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(160, t + 0.06);
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.07);
    } else if (type === 'flip') {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, t);
      osc.frequency.exponentialRampToValueAtTime(360, t + 0.05);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    } else if (type === 'pass') {
      [300, 250].forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.1);
        gain.gain.setValueAtTime(0.2, t + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.1 + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.1);
        osc.stop(t + i * 0.1 + 0.09);
      });
    } else if (type === 'win') {
      [440, 554.37, 659.25, 880].forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + i * 0.1);
        gain.gain.setValueAtTime(0.3, t + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.1 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.1);
        osc.stop(t + i * 0.1 + 0.22);
      });
    }
  }

  // Board initialization
  function createInitialBoard() {
    var b = [];
    for (var r = 0; r < 8; r++) {
      b[r] = [];
      for (var c = 0; c < 8; c++) {
        b[r][c] = EMPTY;
      }
    }
    b[3][3] = WHITE;
    b[3][4] = BLACK;
    b[4][3] = BLACK;
    b[4][4] = WHITE;
    return b;
  }

  // Get flippable pieces in all directions for a given move
  function getFlippableDiscs(b, row, col, player) {
    if (b[row][col] !== EMPTY) return [];
    var opponent = (player === BLACK) ? WHITE : BLACK;
    var allFlips = [];

    for (var d = 0; d < DIRS.length; d++) {
      var dr = DIRS[d][0];
      var dc = DIRS[d][1];
      var r = row + dr;
      var c = col + dc;
      var flipsInDir = [];

      while (r >= 0 && r < 8 && c >= 0 && c < 8 && b[r][c] === opponent) {
        flipsInDir.push([r, c]);
        r += dr;
        c += dc;
      }

      if (flipsInDir.length > 0 && r >= 0 && r < 8 && c >= 0 && c < 8 && b[r][c] === player) {
        allFlips = allFlips.concat(flipsInDir);
      }
    }

    return allFlips;
  }

  // Get all valid moves for a player: [{ row, col, flips: [] }]
  function getValidMoves(b, player) {
    var moves = [];
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var flips = getFlippableDiscs(b, r, c, player);
        if (flips.length > 0) {
          moves.push({ row: r, col: c, flips: flips });
        }
      }
    }
    return moves;
  }

  // Count discs
  function countDiscs(b) {
    var black = 0;
    var white = 0;
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        if (b[r][c] === BLACK) black++;
        else if (b[r][c] === WHITE) white++;
      }
    }
    return { black: black, white: white };
  }

  // Render the board
  function renderBoard() {
    boardEl.innerHTML = '';
    var validMoves = isGameOver ? [] : getValidMoves(board, currentTurn);
    var validMap = {};
    validMoves.forEach(function (m) {
      validMap[m.row + '-' + m.col] = m;
    });

    var counts = countDiscs(board);
    countBlackEl.textContent = counts.black;
    countWhiteEl.textContent = counts.white;

    var starPoints = ['2-2', '2-6', '6-2', '6-6'];

    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var cell = document.createElement('div');
        cell.className = 'rev-cell';
        cell.dataset.row = r;
        cell.dataset.col = c;

        if (starPoints.indexOf(r + '-' + c) !== -1) {
          cell.classList.add('star-point');
        }

        var piece = board[r][c];
        if (piece !== EMPTY) {
          var disc = document.createElement('div');
          disc.className = 'rev-disc ' + (piece === BLACK ? 'black' : 'white');
          if (lastFlipped.some(function (pos) { return pos[0] === r && pos[1] === c; })) {
            disc.classList.add('flipped');
          }
          cell.appendChild(disc);
        } else if (validMap[r + '-' + c] && !(mode === 'ai' && currentTurn === WHITE)) {
          cell.classList.add('valid-move');
        }

        boardEl.appendChild(cell);
      }
    }

    updateTurnUI();
  }

  function updateTurnUI() {
    if (isGameOver) return;
    if (currentTurn === BLACK) {
      cardBlack.classList.add('active');
      cardWhite.classList.remove('active');
      statusText.textContent = (mode === 'ai') ? '轮到黑方 (你) 落子' : '轮到黑方落子';
      statusText.className = 'rev-status-text highlight';
    } else {
      cardWhite.classList.add('active');
      cardBlack.classList.remove('active');
      statusText.textContent = (mode === 'ai') ? '白方 (AI) 思考中...' : '轮到白方落子';
      statusText.className = 'rev-status-text';
    }
  }

  // Clone board
  function cloneBoard(b) {
    return b.map(function (row) { return row.slice(); });
  }

  // Apply move
  function applyMove(b, row, col, flips, player) {
    b[row][col] = player;
    flips.forEach(function (pos) {
      b[pos[0]][pos[1]] = player;
    });
  }

  // Evaluate board for Master AI
  function evaluateBoard(b, player) {
    var opponent = (player === BLACK) ? WHITE : BLACK;
    var score = 0;

    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        if (b[r][c] === player) {
          score += WEIGHTS[r][c];
        } else if (b[r][c] === opponent) {
          score -= WEIGHTS[r][c];
        }
      }
    }

    var myMoves = getValidMoves(b, player).length;
    var oppMoves = getValidMoves(b, opponent).length;
    score += (myMoves - oppMoves) * 5;

    return score;
  }

  // AI Move Selector
  function selectAIMove(b, player) {
    var validMoves = getValidMoves(b, player);
    if (validMoves.length === 0) return null;

    if (difficulty === 'easy') {
      return validMoves[Math.floor(Math.random() * validMoves.length)];
    }

    if (difficulty === 'medium') {
      // Greedy for max flips + simple corner check
      validMoves.sort(function (a, bMove) {
        var scoreA = a.flips.length + WEIGHTS[a.row][a.col];
        var scoreB = bMove.flips.length + WEIGHTS[bMove.row][bMove.col];
        return scoreB - scoreA;
      });
      return validMoves[0];
    }

    // Master AI: Minimax depth 3 with alpha-beta pruning
    function minimax(tempBoard, depth, alpha, beta, isMax, currentP) {
      var oppP = (currentP === BLACK) ? WHITE : BLACK;
      if (depth === 0) {
        return evaluateBoard(tempBoard, player);
      }

      var moves = getValidMoves(tempBoard, currentP);
      if (moves.length === 0) {
        // Pass
        var oppMoves = getValidMoves(tempBoard, oppP);
        if (oppMoves.length === 0) {
          // Terminal state
          var counts = countDiscs(tempBoard);
          var myCount = (player === BLACK) ? counts.black : counts.white;
          var oppCount = (player === BLACK) ? counts.white : counts.black;
          return (myCount > oppCount ? 10000 : (myCount < oppCount ? -10000 : 0));
        }
        return minimax(tempBoard, depth - 1, alpha, beta, !isMax, oppP);
      }

      if (isMax) {
        var maxEval = -Infinity;
        for (var i = 0; i < moves.length; i++) {
          var m = moves[i];
          var nextBoard = cloneBoard(tempBoard);
          applyMove(nextBoard, m.row, m.col, m.flips, currentP);
          var val = minimax(nextBoard, depth - 1, alpha, beta, false, oppP);
          if (val > maxEval) maxEval = val;
          if (val > alpha) alpha = val;
          if (beta <= alpha) break;
        }
        return maxEval;
      } else {
        var minEval = Infinity;
        for (var j = 0; j < moves.length; j++) {
          var mj = moves[j];
          var nextBoardJ = cloneBoard(tempBoard);
          applyMove(nextBoardJ, mj.row, mj.col, mj.flips, currentP);
          var valJ = minimax(nextBoardJ, depth - 1, alpha, beta, true, oppP);
          if (valJ < minEval) minEval = valJ;
          if (valJ < beta) beta = valJ;
          if (beta <= alpha) break;
        }
        return minEval;
      }
    }

    var bestVal = -Infinity;
    var bestMove = validMoves[0];

    for (var k = 0; k < validMoves.length; k++) {
      var cand = validMoves[k];
      var nb = cloneBoard(b);
      applyMove(nb, cand.row, cand.col, cand.flips, player);
      var moveScore = minimax(nb, 2, -Infinity, Infinity, false, (player === BLACK ? WHITE : BLACK));
      if (moveScore > bestVal) {
        bestVal = moveScore;
        bestMove = cand;
      }
    }

    return bestMove;
  }

  // Play move
  function makeMove(row, col) {
    if (isGameOver) return;
    var flips = getFlippableDiscs(board, row, col, currentTurn);
    if (flips.length === 0) return;

    // Save history for undo
    history.push({
      board: cloneBoard(board),
      turn: currentTurn
    });

    applyMove(board, row, col, flips, currentTurn);
    lastFlipped = flips.concat([[row, col]]);
    playSound('place');
    if (flips.length > 0) {
      setTimeout(function () { playSound('flip'); }, 120);
    }

    // Switch turn
    var nextTurn = (currentTurn === BLACK) ? WHITE : BLACK;
    var nextMoves = getValidMoves(board, nextTurn);

    if (nextMoves.length > 0) {
      currentTurn = nextTurn;
    } else {
      // Next player has no moves -> check if current player has moves
      var currentMoves = getValidMoves(board, currentTurn);
      if (currentMoves.length > 0) {
        playSound('pass');
        statusText.textContent = (nextTurn === BLACK ? '黑方' : '白方') + '无棋可走，跳过回合！';
      } else {
        // Neither has moves -> game over
        renderBoard();
        handleGameOver();
        saveState();
        return;
      }
    }

    renderBoard();
    saveState();

    if (mode === 'ai' && currentTurn === WHITE && !isGameOver) {
      setTimeout(aiTurn, 400);
    }
  }

  function aiTurn() {
    if (isGameOver || currentTurn !== WHITE) return;
    var move = selectAIMove(board, WHITE);
    if (move) {
      makeMove(move.row, move.col);
    }
  }

  function handleGameOver() {
    isGameOver = true;
    var counts = countDiscs(board);
    var emoji = '🏆';
    var title = '';
    var desc = '黑方 ' + counts.black + ' 颗 : 白方 ' + counts.white + ' 颗';

    if (counts.black > counts.white) {
      if (mode === 'ai') {
        title = '恭喜你！黑方获胜！';
        emoji = '🎉';
      } else {
        title = '黑方获胜！';
      }
      playSound('win');
    } else if (counts.white > counts.black) {
      if (mode === 'ai') {
        title = 'AI 白方获胜！';
        emoji = '🤖';
      } else {
        title = '白方获胜！';
      }
    } else {
      title = '双方平局！';
      emoji = '🤝';
    }

    statusText.textContent = title + ' ' + desc;

    setTimeout(function () {
      modalEmoji.textContent = emoji;
      modalTitle.textContent = title;
      modalDesc.textContent = desc;
      modal.classList.add('show');
    }, 700);
  }

  function hideModal() {
    modal.classList.remove('show');
  }

  function resetGame() {
    board = createInitialBoard();
    currentTurn = BLACK;
    isGameOver = false;
    history = [];
    lastFlipped = [];
    hideModal();
    renderBoard();
    saveState();
  }

  function undoMove() {
    if (history.length === 0 || isGameOver) return;

    if (mode === 'ai') {
      // In AI mode, undo until it is black's turn again
      while (history.length > 0) {
        var last = history.pop();
        if (last.turn === BLACK) {
          board = last.board;
          currentTurn = BLACK;
          break;
        }
      }
    } else {
      var lastStep = history.pop();
      board = lastStep.board;
      currentTurn = lastStep.turn;
    }

    lastFlipped = [];
    renderBoard();
    saveState();
  }

  function saveState() {
    try {
      var state = {
        board: board,
        currentTurn: currentTurn,
        isGameOver: isGameOver,
        mode: mode,
        difficulty: difficulty
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function loadState() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        var state = JSON.parse(saved);
        if (state && Array.isArray(state.board) && state.board.length === 8) {
          board = state.board;
          currentTurn = state.currentTurn || BLACK;
          isGameOver = !!state.isGameOver;
          if (state.mode) {
            mode = state.mode;
            updateModeUI();
          }
          if (state.difficulty) {
            difficulty = state.difficulty;
            diffSelect.value = difficulty;
          }
          renderBoard();
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function updateModeUI() {
    var btns = modeControl.querySelectorAll('.seg-btn');
    btns.forEach(function (btn) {
      if (btn.getAttribute('data-mode') === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (mode === 'ai') {
      nameBlack.textContent = '黑方 (玩家)';
      nameWhite.textContent = '白方 (AI)';
      diffControl.style.display = 'block';
    } else {
      nameBlack.textContent = '黑方 (选手1)';
      nameWhite.textContent = '白方 (选手2)';
      diffControl.style.display = 'none';
    }
  }

  // Event Listeners
  boardEl.addEventListener('click', function (e) {
    if (mode === 'ai' && currentTurn === WHITE) return;
    var cell = e.target.closest('.rev-cell');
    if (!cell) return;
    var r = parseInt(cell.dataset.row, 10);
    var c = parseInt(cell.dataset.col, 10);
    makeMove(r, c);
  });

  restartBtn.addEventListener('click', resetGame);
  modalRestartBtn.addEventListener('click', resetGame);
  undoBtn.addEventListener('click', undoMove);

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  modeControl.addEventListener('click', function (e) {
    var btn = e.target.closest('.seg-btn');
    if (!btn) return;
    var newMode = btn.getAttribute('data-mode');
    if (newMode !== mode) {
      mode = newMode;
      updateModeUI();
      resetGame();
    }
  });

  diffSelect.addEventListener('change', function () {
    difficulty = diffSelect.value;
    resetGame();
  });

  // Init
  if (!loadState()) {
    resetGame();
  }
})();
