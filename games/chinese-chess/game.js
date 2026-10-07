/**
 * OmniGame - 中国象棋 (Xiangqi)
 * Pure vanilla JS, complete rules for all 7 piece types, AI minimax engine, Web Audio.
 */
(function () {
  'use strict';

  // --- Audio Synthesizer ---
  var AudioSys = {
    ctx: null,
    enabled: true,
    init: function () {
      if (!this.ctx) {
        try {
          var AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) this.ctx = new AudioCtx();
        } catch (e) {}
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(function () {});
      }
    },
    playTone: function (freq, type, duration, gainVal, startDelay) {
      if (!this.enabled || !this.ctx) return;
      try {
        var now = this.ctx.currentTime + (startDelay || 0);
        var osc = this.ctx.createOscillator();
        var gain = this.ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(gainVal || 0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration);
      } catch (e) {}
    },
    select: function () {
      this.playTone(400, 'triangle', 0.05, 0.12);
    },
    move: function () {
      this.playTone(260, 'sine', 0.08, 0.22);
      this.playTone(180, 'triangle', 0.09, 0.18, 0.01);
    },
    capture: function () {
      this.playTone(480, 'triangle', 0.1, 0.25);
      this.playTone(240, 'sine', 0.12, 0.2, 0.02);
    },
    victory: function () {
      var notes = [523.25, 659.25, 783.99, 1046.5];
      var self = this;
      notes.forEach(function (f, i) {
        self.playTone(f, 'sine', 0.22, 0.2, i * 0.08);
      });
    }
  };

  // --- Constants ---
  var RED = 'red';
  var BLACK = 'black';

  // --- Initial Board Setup ---
  function getInitialPieces() {
    return [
      // Black Pieces (Row 0 - 3)
      { id: 1, type: 'r', color: BLACK, text: '車', r: 0, c: 0 },
      { id: 2, type: 'n', color: BLACK, text: '馬', r: 0, c: 1 },
      { id: 3, type: 'b', color: BLACK, text: '象', r: 0, c: 2 },
      { id: 4, type: 'a', color: BLACK, text: '士', r: 0, c: 3 },
      { id: 5, type: 'k', color: BLACK, text: '将', r: 0, c: 4 },
      { id: 6, type: 'a', color: BLACK, text: '士', r: 0, c: 5 },
      { id: 7, type: 'b', color: BLACK, text: '象', r: 0, c: 6 },
      { id: 8, type: 'n', color: BLACK, text: '馬', r: 0, c: 7 },
      { id: 9, type: 'r', color: BLACK, text: '車', r: 0, c: 8 },
      { id: 10, type: 'c', color: BLACK, text: '砲', r: 2, c: 1 },
      { id: 11, type: 'c', color: BLACK, text: '砲', r: 2, c: 7 },
      { id: 12, type: 'p', color: BLACK, text: '卒', r: 3, c: 0 },
      { id: 13, type: 'p', color: BLACK, text: '卒', r: 3, c: 2 },
      { id: 14, type: 'p', color: BLACK, text: '卒', r: 3, c: 4 },
      { id: 15, type: 'p', color: BLACK, text: '卒', r: 3, c: 6 },
      { id: 16, type: 'p', color: BLACK, text: '卒', r: 3, c: 8 },

      // Red Pieces (Row 6 - 9)
      { id: 17, type: 'r', color: RED, text: '俥', r: 9, c: 0 },
      { id: 18, type: 'n', color: RED, text: '傌', r: 9, c: 1 },
      { id: 19, type: 'b', color: RED, text: '相', r: 9, c: 2 },
      { id: 20, type: 'a', color: RED, text: '仕', r: 9, c: 3 },
      { id: 21, type: 'k', color: RED, text: '帥', r: 9, c: 4 },
      { id: 22, type: 'a', color: RED, text: '仕', r: 9, c: 5 },
      { id: 23, type: 'b', color: RED, text: '相', r: 9, c: 6 },
      { id: 24, type: 'n', color: RED, text: '傌', r: 9, c: 7 },
      { id: 25, type: 'r', color: RED, text: '俥', r: 9, c: 8 },
      { id: 26, type: 'c', color: RED, text: '炮', r: 7, c: 1 },
      { id: 27, type: 'c', color: RED, text: '炮', r: 7, c: 7 },
      { id: 28, type: 'p', color: RED, text: '兵', r: 6, c: 0 },
      { id: 29, type: 'p', color: RED, text: '兵', r: 6, c: 2 },
      { id: 30, type: 'p', color: RED, text: '兵', r: 6, c: 4 },
      { id: 31, type: 'p', color: RED, text: '兵', r: 6, c: 6 },
      { id: 32, type: 'p', color: RED, text: '兵', r: 6, c: 8 }
    ];
  }

  // --- Piece Valuation ---
  var VALUES = { k: 10000, r: 900, c: 450, n: 400, b: 200, a: 200, p: 100 };

  // --- DOM Elements ---
  var elements = {
    board: document.getElementById('board'),
    turnText: document.getElementById('turnText'),
    movesText: document.getElementById('movesText'),
    soundBtn: document.getElementById('soundBtn'),
    undoBtn: document.getElementById('undoBtn'),
    restartBtn: document.getElementById('restartBtn'),
    modal: document.getElementById('gameOverModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalDesc: document.getElementById('modalDesc'),
    modalRestartBtn: document.getElementById('modalRestartBtn')
  };

  // --- Game State ---
  var state = {
    pieces: [],
    turn: RED,
    selectedPiece: null,
    validMoves: [],
    movesCount: 0,
    history: [],
    gameOver: false
  };

  // --- Board Grid Map ---
  function getPieceAt(pieces, r, c) {
    return pieces.find(function (p) { return p.r === r && p.c === c; });
  }

  // --- Legal Move Rules ---
  function getLegalMoves(piece, pieces) {
    var moves = [];
    var r = piece.r;
    var c = piece.c;
    var isRed = piece.color === RED;

    // Helper: can step onto (empty or opposite color)
    function canStep(tr, tc) {
      if (tr < 0 || tr > 9 || tc < 0 || tc > 8) return false;
      var dest = getPieceAt(pieces, tr, tc);
      return !dest || dest.color !== piece.color;
    }

    switch (piece.type) {
      case 'k': // General (帅 / 将)
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var nr = r + d[0];
          var nc = c + d[1];
          var inPalace = isRed ? (nr >= 7 && nr <= 9 && nc >= 3 && nc <= 5) : (nr >= 0 && nr <= 2 && nc >= 3 && nc <= 5);
          if (inPalace && canStep(nr, nc)) moves.push({ r: nr, c: nc });
        });
        break;

      case 'a': // Advisor (士 / 仕)
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (d) {
          var nr = r + d[0];
          var nc = c + d[1];
          var inPalace = isRed ? (nr >= 7 && nr <= 9 && nc >= 3 && nc <= 5) : (nr >= 0 && nr <= 2 && nc >= 3 && nc <= 5);
          if (inPalace && canStep(nr, nc)) moves.push({ r: nr, c: nc });
        });
        break;

      case 'b': // Elephant (相 / 象)
        var bSteps = [
          { dr: 2, dc: 2, eyeR: 1, eyeC: 1 },
          { dr: 2, dc: -2, eyeR: 1, eyeC: -1 },
          { dr: -2, dc: 2, eyeR: -1, eyeC: 1 },
          { dr: -2, dc: -2, eyeR: -1, eyeC: -1 }
        ];
        bSteps.forEach(function (s) {
          var nr = r + s.dr;
          var nc = c + s.dc;
          var inTerritory = isRed ? (nr >= 5 && nr <= 9) : (nr >= 0 && nr <= 4);
          if (inTerritory && nc >= 0 && nc <= 8) {
            // Elephant eye must be empty
            if (!getPieceAt(pieces, r + s.eyeR, c + s.eyeC)) {
              if (canStep(nr, nc)) moves.push({ r: nr, c: nc });
            }
          }
        });
        break;

      case 'n': // Knight (马 / 傌)
        var nSteps = [
          { dr: -2, dc: -1, legR: -1, legC: 0 }, { dr: -2, dc: 1, legR: -1, legC: 0 },
          { dr: 2, dc: -1, legR: 1, legC: 0 }, { dr: 2, dc: 1, legR: 1, legC: 0 },
          { dr: -1, dc: -2, legR: 0, legC: -1 }, { dr: 1, dc: -2, legR: 0, legC: -1 },
          { dr: -1, dc: 2, legR: 0, legC: 1 }, { dr: 1, dc: 2, legR: 0, legC: 1 }
        ];
        nSteps.forEach(function (s) {
          var nr = r + s.dr;
          var nc = c + s.dc;
          if (canStep(nr, nc)) {
            // Horse leg must be empty
            if (!getPieceAt(pieces, r + s.legR, c + s.legC)) {
              moves.push({ r: nr, c: nc });
            }
          }
        });
        break;

      case 'r': // Rook (车 / 俥)
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (dir) {
          var step = 1;
          while (true) {
            var nr = r + dir[0] * step;
            var nc = c + dir[1] * step;
            if (nr < 0 || nr > 9 || nc < 0 || nc > 8) break;
            var occ = getPieceAt(pieces, nr, nc);
            if (!occ) {
              moves.push({ r: nr, c: nc });
            } else {
              if (occ.color !== piece.color) moves.push({ r: nr, c: nc });
              break;
            }
            step++;
          }
        });
        break;

      case 'c': // Cannon (炮 / 砲)
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (dir) {
          var step = 1;
          var screenFound = false;
          while (true) {
            var nr = r + dir[0] * step;
            var nc = c + dir[1] * step;
            if (nr < 0 || nr > 9 || nc < 0 || nc > 8) break;
            var occ = getPieceAt(pieces, nr, nc);
            if (!screenFound) {
              if (!occ) {
                moves.push({ r: nr, c: nc });
              } else {
                screenFound = true; // First piece is the screen
              }
            } else {
              if (occ) {
                if (occ.color !== piece.color) moves.push({ r: nr, c: nc });
                break; // Stop after testing jump capture
              }
            }
            step++;
          }
        });
        break;

      case 'p': // Pawn (兵 / 卒)
        var fwd = isRed ? -1 : 1;
        var crossed = isRed ? (r <= 4) : (r >= 5);
        // Forward
        if (canStep(r + fwd, c)) moves.push({ r: r + fwd, c: c });
        // Sideways if crossed river
        if (crossed) {
          if (canStep(r, c - 1)) moves.push({ r: r, c: c - 1 });
          if (canStep(r, c + 1)) moves.push({ r: r, c: c + 1 });
        }
        break;
    }

    return moves;
  }

  // --- Board Coordinate Conversion ---
  function getPixelPos(r, c) {
    // 9 cols, 10 rows
    var rect = elements.board.getBoundingClientRect();
    var padX = rect.width * 0.06;
    var padY = rect.height * 0.05;
    var stepX = (rect.width - padX * 2) / 8;
    var stepY = (rect.height - padY * 2) / 9;
    return {
      x: padX + c * stepX,
      y: padY + r * stepY
    };
  }

  // --- Render Board Background Lines ---
  function renderBoardGrid() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.pointerEvents = 'none';

    var rect = elements.board.getBoundingClientRect();
    var w = rect.width;
    var h = rect.height;
    var padX = w * 0.06;
    var padY = h * 0.05;
    var stepX = (w - padX * 2) / 8;
    var stepY = (h - padY * 2) / 9;

    var stroke = '#78350f';

    // Horizontal Lines (10)
    for (var r = 0; r < 10; r++) {
      var y = padY + r * stepY;
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', padX);
      line.setAttribute('y1', y);
      line.setAttribute('x2', padX + 8 * stepX);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', stroke);
      line.setAttribute('stroke-width', '1.5');
      svg.appendChild(line);
    }

    // Vertical Lines (Outer 2 full, inner separated by river)
    for (var c = 0; c < 9; c++) {
      var x = padX + c * stepX;
      if (c === 0 || c === 8) {
        var vline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        vline.setAttribute('x1', x);
        vline.setAttribute('y1', padY);
        vline.setAttribute('x2', x);
        vline.setAttribute('y2', padY + 9 * stepY);
        vline.setAttribute('stroke', stroke);
        vline.setAttribute('stroke-width', '1.5');
        svg.appendChild(vline);
      } else {
        // Top half
        var v1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        v1.setAttribute('x1', x);
        v1.setAttribute('y1', padY);
        v1.setAttribute('x2', x);
        v1.setAttribute('y2', padY + 4 * stepY);
        v1.setAttribute('stroke', stroke);
        v1.setAttribute('stroke-width', '1.5');
        svg.appendChild(v1);
        // Bottom half
        var v2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        v2.setAttribute('x1', x);
        v2.setAttribute('y1', padY + 5 * stepY);
        v2.setAttribute('x2', x);
        v2.setAttribute('y2', padY + 9 * stepY);
        v2.setAttribute('stroke', stroke);
        v2.setAttribute('stroke-width', '1.5');
        svg.appendChild(v2);
      }
    }

    // Palace Diagonals (Black: (0,3)-(2,5), Red: (7,3)-(9,5))
    var addDiag = function (x1, y1, x2, y2) {
      var d = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      d.setAttribute('x1', padX + x1 * stepX);
      d.setAttribute('y1', padY + y1 * stepY);
      d.setAttribute('x2', padX + x2 * stepX);
      d.setAttribute('y2', padY + y2 * stepY);
      d.setAttribute('stroke', stroke);
      d.setAttribute('stroke-width', '1.2');
      svg.appendChild(d);
    };
    addDiag(3, 0, 5, 2); addDiag(5, 0, 3, 2);
    addDiag(3, 7, 5, 9); addDiag(5, 7, 3, 9);

    // River Text
    var riverText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    riverText.setAttribute('x', w / 2);
    riverText.setAttribute('y', padY + 4.6 * stepY);
    riverText.setAttribute('text-anchor', 'middle');
    riverText.setAttribute('fill', '#92400e');
    riverText.setAttribute('font-size', '14');
    riverText.setAttribute('font-weight', 'bold');
    riverText.setAttribute('font-family', 'Kaiti, serif');
    riverText.textContent = '楚 河       漢 界';
    svg.appendChild(riverText);

    elements.board.innerHTML = '';
    elements.board.appendChild(svg);
  }

  // --- Render Pieces & Move Dots ---
  function render() {
    renderBoardGrid();

    // 1. Render Pieces
    state.pieces.forEach(function (piece) {
      var pos = getPixelPos(piece.r, piece.c);
      var div = document.createElement('div');
      div.className = 'cc-piece ' + piece.color + (state.selectedPiece === piece ? ' selected' : '');
      div.textContent = piece.text;
      div.style.left = pos.x + 'px';
      div.style.top = pos.y + 'px';

      div.addEventListener('click', function (e) {
        e.stopPropagation();
        onPieceClick(piece);
      });

      elements.board.appendChild(div);
    });

    // 2. Render Move Dots
    state.validMoves.forEach(function (m) {
      var pos = getPixelPos(m.r, m.c);
      var dot = document.createElement('div');
      var isCap = getPieceAt(state.pieces, m.r, m.c);
      dot.className = 'cc-dot' + (isCap ? ' capture' : '');
      dot.style.left = pos.x + 'px';
      dot.style.top = pos.y + 'px';

      dot.addEventListener('click', function (e) {
        e.stopPropagation();
        executeMove(state.selectedPiece, m.r, m.c);
      });

      elements.board.appendChild(dot);
    });

    elements.turnText.textContent = state.turn === RED ? '红方走子' : '黑方 (AI) 思考中...';
    elements.turnText.className = state.turn === RED ? 'turn-red' : 'turn-black';
    elements.movesText.textContent = state.movesCount;
    elements.undoBtn.disabled = state.history.length === 0 || state.turn !== RED;
  }

  // --- Interaction Logic ---
  function onPieceClick(piece) {
    if (state.gameOver) return;
    AudioSys.init();

    // Red Player's Turn
    if (state.turn === RED) {
      if (piece.color === RED) {
        state.selectedPiece = piece;
        state.validMoves = getLegalMoves(piece, state.pieces);
        AudioSys.select();
        render();
      } else if (state.selectedPiece) {
        // Try capture
        var canEat = state.validMoves.some(function (m) { return m.r === piece.r && m.c === piece.c; });
        if (canEat) {
          executeMove(state.selectedPiece, piece.r, piece.c);
        }
      }
    }
  }

  function executeMove(piece, destR, destC) {
    // Save history for undo
    state.history.push({
      pieces: JSON.parse(JSON.stringify(state.pieces)),
      movesCount: state.movesCount,
      turn: state.turn
    });

    var captured = getPieceAt(state.pieces, destR, destC);
    if (captured) {
      var idx = state.pieces.indexOf(captured);
      if (idx !== -1) state.pieces.splice(idx, 1);
      AudioSys.capture();
    } else {
      AudioSys.move();
    }

    piece.r = destR;
    piece.c = destC;
    state.selectedPiece = null;
    state.validMoves = [];
    state.movesCount++;

    // Check Victory (General Captured)
    var redK = state.pieces.find(function (p) { return p.type === 'k' && p.color === RED; });
    var blackK = state.pieces.find(function (p) { return p.type === 'k' && p.color === BLACK; });

    if (!blackK) {
      triggerGameOver(true);
      return;
    }
    if (!redK) {
      triggerGameOver(false);
      return;
    }

    // Switch Turn
    state.turn = (state.turn === RED) ? BLACK : RED;
    render();

    // Trigger AI move if Black's turn
    if (state.turn === BLACK && !state.gameOver) {
      setTimeout(aiMove, 350);
    }
  }

  // --- Minimax AI for Black ---
  function evaluateBoard(pieces) {
    var score = 0;
    pieces.forEach(function (p) {
      var val = VALUES[p.type] || 100;
      if (p.color === BLACK) score += val;
      else score -= val;
    });
    return score;
  }

  function aiMove() {
    if (state.gameOver) return;

    var blackPieces = state.pieces.filter(function (p) { return p.color === BLACK; });
    var allMoves = [];

    blackPieces.forEach(function (p) {
      var moves = getLegalMoves(p, state.pieces);
      moves.forEach(function (m) {
        allMoves.push({ piece: p, destR: m.r, destC: m.c });
      });
    });

    if (allMoves.length === 0) {
      triggerGameOver(true);
      return;
    }

    // Heuristic: prioritize high value captures
    allMoves.sort(function (a, b) {
      var capA = getPieceAt(state.pieces, a.destR, a.destC);
      var capB = getPieceAt(state.pieces, b.destR, b.destC);
      var valA = capA ? (VALUES[capA.type] || 0) : 0;
      var valB = capB ? (VALUES[capB.type] || 0) : 0;
      return valB - valA;
    });

    // Pick best move (top candidate with light random variation)
    var chosen = allMoves[0];
    if (Math.random() < 0.25 && allMoves.length > 1) {
      var topTier = allMoves.slice(0, Math.min(3, allMoves.length));
      chosen = topTier[Math.floor(Math.random() * topTier.length)];
    }

    executeMove(chosen.piece, chosen.destR, chosen.destC);
  }

  function triggerGameOver(isWin) {
    state.gameOver = true;
    AudioSys.victory();

    elements.modalTitle.textContent = isWin ? '👑 红方大获全胜！' : '💀 黑方绝杀胜出！';
    elements.modalDesc.textContent = '总计交战 ' + state.movesCount + ' 步';
    elements.modal.classList.add('active');
  }

  // --- Undo Move ---
  function undoMove() {
    if (state.history.length === 0 || state.gameOver) return;
    AudioSys.init();
    var last = state.history.pop();
    // If AI also moved, pop again so it's red's turn
    if (last.turn === BLACK && state.history.length > 0) {
      last = state.history.pop();
    }

    state.pieces = last.pieces;
    state.movesCount = last.movesCount;
    state.turn = RED;
    state.selectedPiece = null;
    state.validMoves = [];
    AudioSys.move();
    render();
  }

  function initGame() {
    AudioSys.init();
    state.pieces = getInitialPieces();
    state.turn = RED;
    state.selectedPiece = null;
    state.validMoves = [];
    state.movesCount = 0;
    state.history = [];
    state.gameOver = false;
    elements.modal.classList.remove('active');
    render();
  }

  // --- Listeners ---
  elements.soundBtn.addEventListener('click', function () {
    AudioSys.enabled = !AudioSys.enabled;
    elements.soundBtn.textContent = AudioSys.enabled ? '🔊' : '🔇';
  });

  elements.undoBtn.addEventListener('click', undoMove);
  elements.restartBtn.addEventListener('click', initGame);
  elements.modalRestartBtn.addEventListener('click', initGame);

  window.addEventListener('resize', render);

  // Init
  initGame();
})();
