// Chess (国际象棋) - OmniGame High Performance Clean Implementation
(function () {
  'use strict';

  // --- Sound Synthesizer ---
  var audioCtx = null;
  var soundEnabled = true;

  function initAudio() {
    if (!audioCtx) {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, duration, type, startGain) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;
    try {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(startGain || 0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  function playMoveSound() {
    playTone(480, 0.08, 'triangle', 0.12);
  }

  function playCaptureSound() {
    playTone(280, 0.15, 'sawtooth', 0.2);
    setTimeout(function () { playTone(560, 0.12, 'triangle', 0.15); }, 50);
  }

  function playCheckSound() {
    playTone(660, 0.12, 'square', 0.15);
    setTimeout(function () { playTone(880, 0.2, 'square', 0.2); }, 120);
  }

  function playWinSound() {
    var notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach(function (f, i) {
      setTimeout(function () { playTone(f, 0.25, 'triangle', 0.2); }, i * 120);
    });
  }

  // --- Piece Representation ---
  // White pieces uppercase: 'P', 'N', 'B', 'R', 'Q', 'K'
  // Black pieces lowercase: 'p', 'n', 'b', 'r', 'q', 'k'
  var PIECE_SYMBOLS = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
  };

  var INITIAL_BOARD = [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
  ];

  var PIECE_VALUES = {
    'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000,
    'p': -100, 'n': -320, 'b': -330, 'r': -500, 'q': -900, 'k': -20000
  };

  // Positional weight bonuses (8x8)
  var PAWN_PST = [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5,  5, 10, 25, 25, 10,  5,  5],
    [0,  0,  0, 20, 20,  0,  0,  0],
    [5, -5,-10,  0,  0,-10, -5,  5],
    [5, 10, 10,-20,-20, 10, 10,  5],
    [0,  0,  0,  0,  0,  0,  0,  0]
  ];

  var KNIGHT_PST = [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50]
  ];

  // --- Game State ---
  var board = [];
  var currentTurn = 'white'; // 'white' or 'black'
  var selectedCell = null;
  var legalMoves = [];
  var history = [];
  var moveCount = 0;
  var isGameOver = false;
  var lastMove = null;

  // DOM elements
  var boardEl = document.getElementById('board');
  var turnTextEl = document.getElementById('turnText');
  var movesTextEl = document.getElementById('movesText');
  var soundBtn = document.getElementById('soundBtn');
  var undoBtn = document.getElementById('undoBtn');
  var restartBtn = document.getElementById('restartBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalTitleEl = document.getElementById('modalTitle');
  var modalDescEl = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  function cloneBoard(b) {
    return b.map(function (row) { return row.slice(); });
  }

  function isWhitePiece(piece) {
    return piece && piece === piece.toUpperCase();
  }

  function isBlackPiece(piece) {
    return piece && piece === piece.toLowerCase();
  }

  function initGame() {
    board = cloneBoard(INITIAL_BOARD);
    currentTurn = 'white';
    selectedCell = null;
    legalMoves = [];
    history = [];
    moveCount = 0;
    isGameOver = false;
    lastMove = null;
    hideModal();
    updateUI();
    renderBoard();
  }

  function updateUI() {
    movesTextEl.textContent = moveCount;
    if (currentTurn === 'white') {
      turnTextEl.textContent = '白方走子 (你)';
      turnTextEl.className = 'turn-white';
    } else {
      turnTextEl.textContent = '黑方思考中 (电脑)...';
      turnTextEl.className = 'turn-black';
    }
  }

  function getRawMoves(b, r, c) {
    var piece = b[r][c];
    if (!piece) return [];
    var isWhite = isWhitePiece(piece);
    var moves = [];
    var type = piece.toUpperCase();

    function addIfValid(tr, tc) {
      if (tr < 0 || tr >= 8 || tc < 0 || tc >= 8) return false;
      var target = b[tr][tc];
      if (!target) {
        moves.push({ r: tr, c: tc });
        return true;
      }
      if ((isWhite && isBlackPiece(target)) || (!isWhite && isWhitePiece(target))) {
        moves.push({ r: tr, c: tc });
      }
      return false; // hit piece, stop ray
    }

    if (type === 'P') {
      var dir = isWhite ? -1 : 1;
      var startRow = isWhite ? 6 : 1;
      // forward 1
      if (r + dir >= 0 && r + dir < 8 && !b[r + dir][c]) {
        moves.push({ r: r + dir, c: c });
        // forward 2
        if (r === startRow && !b[r + 2 * dir][c]) {
          moves.push({ r: r + 2 * dir, c: c });
        }
      }
      // diagonal captures
      var capCols = [c - 1, c + 1];
      for (var i = 0; i < capCols.length; i++) {
        var cc = capCols[i];
        if (cc >= 0 && cc < 8 && r + dir >= 0 && r + dir < 8) {
          var target = b[r + dir][cc];
          if (target && (isWhite ? isBlackPiece(target) : isWhitePiece(target))) {
            moves.push({ r: r + dir, c: cc });
          }
        }
      }
    } else if (type === 'N') {
      var nDeltas = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ];
      nDeltas.forEach(function (d) { addIfValid(r + d[0], c + d[1]); });
    } else if (type === 'B') {
      var bDeltas = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      bDeltas.forEach(function (d) {
        var step = 1;
        while (addIfValid(r + d[0] * step, c + d[1] * step)) { step++; }
      });
    } else if (type === 'R') {
      var rDeltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      rDeltas.forEach(function (d) {
        var step = 1;
        while (addIfValid(r + d[0] * step, c + d[1] * step)) { step++; }
      });
    } else if (type === 'Q') {
      var qDeltas = [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];
      qDeltas.forEach(function (d) {
        var step = 1;
        while (addIfValid(r + d[0] * step, c + d[1] * step)) { step++; }
      });
    } else if (type === 'K') {
      var kDeltas = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
      kDeltas.forEach(function (d) { addIfValid(r + d[0], c + d[1]); });
    }

    return moves;
  }

  // Find King position
  function findKing(b, isWhite) {
    var target = isWhite ? 'K' : 'k';
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        if (b[r][c] === target) return { r: r, c: c };
      }
    }
    return null;
  }

  // Check if square is under attack by opponent
  function isSquareAttacked(b, targetR, targetC, byWhite) {
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var piece = b[r][c];
        if (!piece) continue;
        if (byWhite && isWhitePiece(piece)) {
          var moves = getRawMoves(b, r, c);
          for (var m = 0; m < moves.length; m++) {
            if (moves[m].r === targetR && moves[m].c === targetC) return true;
          }
        } else if (!byWhite && isBlackPiece(piece)) {
          var bMoves = getRawMoves(b, r, c);
          for (var bm = 0; bm < bMoves.length; bm++) {
            if (bMoves[bm].r === targetR && bMoves[bm].c === targetC) return true;
          }
        }
      }
    }
    return false;
  }

  // Check if player is in check
  function isInCheck(b, isWhite) {
    var king = findKing(b, isWhite);
    if (!king) return true; // king captured
    return isSquareAttacked(b, king.r, king.c, !isWhite);
  }

  // Filter legal moves so king is not left in check
  function getSafeMoves(b, r, c) {
    var piece = b[r][c];
    if (!piece) return [];
    var isWhite = isWhitePiece(piece);
    var raw = getRawMoves(b, r, c);
    var safe = [];

    for (var i = 0; i < raw.length; i++) {
      var dest = raw[i];
      // simulate move
      var temp = cloneBoard(b);
      temp[dest.r][dest.c] = temp[r][c];
      temp[r][c] = null;
      // promotion preview
      if (temp[dest.r][dest.c] === 'P' && dest.r === 0) temp[dest.r][dest.c] = 'Q';
      if (temp[dest.r][dest.c] === 'p' && dest.r === 7) temp[dest.r][dest.c] = 'q';

      if (!isInCheck(temp, isWhite)) {
        safe.push(dest);
      }
    }
    return safe;
  }

  function getAllLegalMoves(b, isWhite) {
    var all = [];
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var p = b[r][c];
        if (!p) continue;
        if ((isWhite && isWhitePiece(p)) || (!isWhite && isBlackPiece(p))) {
          var moves = getSafeMoves(b, r, c);
          for (var i = 0; i < moves.length; i++) {
            all.push({ from: { r: r, c: c }, to: moves[i] });
          }
        }
      }
    }
    return all;
  }

  function applyMove(from, to) {
    history.push({
      board: cloneBoard(board),
      lastMove: lastMove,
      currentTurn: currentTurn,
      moveCount: moveCount
    });

    var movingPiece = board[from.r][from.c];
    var capturedPiece = board[to.r][to.c];

    board[to.r][to.c] = movingPiece;
    board[from.r][from.c] = null;

    // Pawn Promotion to Queen
    if (movingPiece === 'P' && to.r === 0) {
      board[to.r][to.c] = 'Q';
    } else if (movingPiece === 'p' && to.r === 7) {
      board[to.r][to.c] = 'q';
    }

    lastMove = { from: from, to: to };
    moveCount++;

    if (capturedPiece) {
      playCaptureSound();
    } else {
      playMoveSound();
    }

    selectedCell = null;
    legalMoves = [];

    // Switch turn
    currentTurn = (currentTurn === 'white') ? 'black' : 'white';
    updateUI();
    renderBoard();

    // Check game over
    var nextMoves = getAllLegalMoves(board, currentTurn === 'white');
    var inCheck = isInCheck(board, currentTurn === 'white');

    if (inCheck && nextMoves.length > 0) {
      playCheckSound();
    }

    if (nextMoves.length === 0) {
      isGameOver = true;
      if (inCheck) {
        if (currentTurn === 'white') {
          showModal('💀 遗憾落败', '黑方将死胜出！已坚持 ' + moveCount + ' 步。');
        } else {
          playWinSound();
          showModal('👑 胜利凯旋！', '你成功将死黑方电脑！共耗时 ' + moveCount + ' 步。');
        }
      } else {
        showModal('🤝 逼和成和', '无子可动，双方握手言和！');
      }
      return;
    }

    // Bot move if black's turn
    if (currentTurn === 'black' && !isGameOver) {
      setTimeout(makeBotMove, 250);
    }
  }

  // Evaluation heuristic for Bot
  function evaluateBoard(b) {
    var score = 0;
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var p = b[r][c];
        if (!p) continue;
        var val = PIECE_VALUES[p] || 0;
        score += val;
        // Positional bonus
        if (p === 'P') score += PAWN_PST[r][c];
        else if (p === 'p') score -= PAWN_PST[7 - r][c];
        else if (p === 'N') score += KNIGHT_PST[r][c];
        else if (p === 'n') score -= KNIGHT_PST[7 - r][c];
      }
    }
    return score;
  }

  // Minimax with Alpha-Beta
  function minimax(b, depth, alpha, beta, isMaximizing) {
    if (depth === 0) {
      return evaluateBoard(b);
    }

    var moves = getAllLegalMoves(b, isMaximizing);
    if (moves.length === 0) {
      if (isInCheck(b, isMaximizing)) {
        return isMaximizing ? -99999 + (3 - depth) : 99999 - (3 - depth);
      }
      return 0; // Stalemate
    }

    if (isMaximizing) {
      var maxEval = -Infinity;
      for (var i = 0; i < moves.length; i++) {
        var m = moves[i];
        var sim = cloneBoard(b);
        sim[m.to.r][m.to.c] = sim[m.from.r][m.from.c];
        sim[m.from.r][m.from.c] = null;
        if (sim[m.to.r][m.to.c] === 'P' && m.to.r === 0) sim[m.to.r][m.to.c] = 'Q';
        var ev = minimax(sim, depth - 1, alpha, beta, false);
        maxEval = Math.max(maxEval, ev);
        alpha = Math.max(alpha, ev);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      var minEval = Infinity;
      for (var j = 0; j < moves.length; j++) {
        var mv = moves[j];
        var sim2 = cloneBoard(b);
        sim2[mv.to.r][mv.to.c] = sim2[mv.from.r][mv.from.c];
        sim2[mv.from.r][mv.from.c] = null;
        if (sim2[mv.to.r][mv.to.c] === 'p' && mv.to.r === 7) sim2[mv.to.r][mv.to.c] = 'q';
        var ev2 = minimax(sim2, depth - 1, alpha, beta, true);
        minEval = Math.min(minEval, ev2);
        beta = Math.min(beta, ev2);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  function makeBotMove() {
    if (isGameOver || currentTurn !== 'black') return;

    var moves = getAllLegalMoves(board, false);
    if (moves.length === 0) return;

    // Shuffle moves slightly for non-deterministic variety
    moves.sort(function () { return 0.5 - Math.random(); });

    var bestMove = null;
    var bestValue = Infinity;

    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var sim = cloneBoard(board);
      sim[m.to.r][m.to.c] = sim[m.from.r][m.from.c];
      sim[m.from.r][m.from.c] = null;
      if (sim[m.to.r][m.to.c] === 'p' && m.to.r === 7) sim[m.to.r][m.to.c] = 'q';

      var val = minimax(sim, 2, -Infinity, Infinity, true);
      if (val < bestValue) {
        bestValue = val;
        bestMove = m;
      }
    }

    if (bestMove) {
      applyMove(bestMove.from, bestMove.to);
    }
  }

  function handleCellClick(r, c) {
    if (isGameOver || currentTurn !== 'white') return;
    initAudio();

    var clickedPiece = board[r][c];

    // Check if clicked cell is a valid move destination for selected piece
    if (selectedCell) {
      for (var i = 0; i < legalMoves.length; i++) {
        if (legalMoves[i].r === r && legalMoves[i].c === c) {
          applyMove(selectedCell, { r: r, c: c });
          return;
        }
      }
    }

    // Select piece
    if (clickedPiece && isWhitePiece(clickedPiece)) {
      selectedCell = { r: r, c: c };
      legalMoves = getSafeMoves(board, r, c);
      renderBoard();
    } else {
      selectedCell = null;
      legalMoves = [];
      renderBoard();
    }
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    var whiteKingInCheck = isInCheck(board, true);
    var blackKingInCheck = isInCheck(board, false);

    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var cell = document.createElement('div');
        var isLight = (r + c) % 2 === 0;
        cell.className = 'chess-cell ' + (isLight ? 'light' : 'dark');

        var piece = board[r][c];

        // Last move highlight
        if (lastMove && ((lastMove.from.r === r && lastMove.from.c === c) || (lastMove.to.r === r && lastMove.to.c === c))) {
          cell.classList.add('last-move');
        }

        // Selection highlight
        if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
          cell.classList.add('selected');
        }

        // Check highlight
        if ((piece === 'K' && whiteKingInCheck) || (piece === 'k' && blackKingInCheck)) {
          cell.classList.add('in-check');
        }

        // Move destination hints
        if (selectedCell) {
          for (var i = 0; i < legalMoves.length; i++) {
            if (legalMoves[i].r === r && legalMoves[i].c === c) {
              if (piece) {
                cell.classList.add('hint-capture');
              } else {
                cell.classList.add('hint');
              }
              break;
            }
          }
        }

        // Render piece glyph
        if (piece) {
          var pSpan = document.createElement('span');
          pSpan.className = 'chess-piece ' + (isWhitePiece(piece) ? 'white' : 'black');
          pSpan.textContent = PIECE_SYMBOLS[piece] || '';
          cell.appendChild(pSpan);
        }

        (function (row, col) {
          cell.addEventListener('click', function () {
            handleCellClick(row, col);
          });
        })(r, c);

        boardEl.appendChild(cell);
      }
    }
  }

  function undoMove() {
    if (history.length === 0 || isGameOver) return;
    // Undo both bot and human move if bot had already replied
    var prev = history.pop();
    if (prev.currentTurn === 'black' && history.length > 0) {
      prev = history.pop();
    }
    board = prev.board;
    lastMove = prev.lastMove;
    currentTurn = prev.currentTurn;
    moveCount = prev.moveCount;
    selectedCell = null;
    legalMoves = [];
    isGameOver = false;
    hideModal();
    updateUI();
    renderBoard();
    playTone(320, 0.1, 'sine', 0.1);
  }

  function showModal(title, desc) {
    modalTitleEl.textContent = title;
    modalDescEl.textContent = desc;
    modalEl.classList.add('active');
  }

  function hideModal() {
    modalEl.classList.remove('active');
  }

  // --- Event Listeners ---
  undoBtn.addEventListener('click', undoMove);
  restartBtn.addEventListener('click', initGame);
  modalRestartBtn.addEventListener('click', initGame);

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  // Start initial game
  initGame();
})();
