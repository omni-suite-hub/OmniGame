(function () {
  'use strict';

  var STORAGE_KEY = 'omg:save:tic-tac-toe';
  var SCORE_KEY = 'omg:score:tic-tac-toe';

  // State
  var board = Array(9).fill(null);
  var currentTurn = 'X'; // 'X' or 'O'
  var isGameOver = false;
  var mode = 'ai'; // 'ai' or 'pvp'
  var difficulty = 'unbeatable'; // 'easy', 'medium', 'unbeatable'
  var soundEnabled = true;
  var scores = { X: 0, O: 0, ties: 0 };

  var WINNING_LINES = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
  ];

  // DOM elements
  var boardEl = document.getElementById('board');
  var cells = document.querySelectorAll('.cell');
  var statusText = document.getElementById('statusText');
  var scoreXEl = document.getElementById('scoreX');
  var scoreOEl = document.getElementById('scoreO');
  var scoreTieEl = document.getElementById('scoreTie');
  var cardX = document.getElementById('cardX');
  var cardO = document.getElementById('cardO');
  var winStrike = document.getElementById('winStrike');
  var restartBtn = document.getElementById('restartBtn');
  var resetScoreBtn = document.getElementById('resetScoreBtn');
  var soundBtn = document.getElementById('soundBtn');
  var modeControl = document.getElementById('modeControl');
  var diffSelect = document.getElementById('diffSelect');
  var diffControl = document.getElementById('diffControl');

  var modal = document.getElementById('gameOverModal');
  var modalEmoji = document.getElementById('modalEmoji');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  // Web Audio Context
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

    if (type === 'x') {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.08);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.09);
    } else if (type === 'o') {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, t);
      osc.frequency.exponentialRampToValueAtTime(293.66, t + 0.1);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.11);
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + i * 0.09);
        gain.gain.setValueAtTime(0.28, t + i * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.09 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.09);
        osc.stop(t + i * 0.09 + 0.22);
      });
    } else if (type === 'loss') {
      [440, 392, 349.23, 293.66].forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t + i * 0.1);
        gain.gain.setValueAtTime(0.2, t + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.1 + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.1);
        osc.stop(t + i * 0.1 + 0.2);
      });
    } else if (type === 'tie') {
      [440, 440].forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.12);
        gain.gain.setValueAtTime(0.25, t + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.12 + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.12);
        osc.stop(t + i * 0.12 + 0.09);
      });
    }
  }

  // Check winner
  function checkWinner(state) {
    for (var i = 0; i < WINNING_LINES.length; i++) {
      var line = WINNING_LINES[i];
      var a = line[0], b = line[1], c = line[2];
      if (state[a] && state[a] === state[b] && state[a] === state[c]) {
        return { winner: state[a], line: line };
      }
    }
    if (state.every(function (c) { return c !== null; })) {
      return { winner: 'tie', line: null };
    }
    return null;
  }

  // Draw SVG symbol
  function getXSymbolSVG() {
    return '<svg viewBox="0 0 100 100" class="mark-x"><line x1="20" y1="20" x2="80" y2="80"/><line x1="80" y1="20" x2="20" y2="80"/></svg>';
  }

  function getOSymbolSVG() {
    return '<svg viewBox="0 0 100 100" class="mark-o"><circle cx="50" cy="50" r="35"/></svg>';
  }

  // Update cell UI
  function renderBoard() {
    cells.forEach(function (cell, idx) {
      cell.innerHTML = '';
      cell.classList.remove('taken');
      if (board[idx] === 'X') {
        cell.innerHTML = getXSymbolSVG();
        cell.classList.add('taken');
      } else if (board[idx] === 'O') {
        cell.innerHTML = getOSymbolSVG();
        cell.classList.add('taken');
      }
    });

    updateTurnUI();
  }

  function updateTurnUI() {
    if (isGameOver) return;
    if (currentTurn === 'X') {
      cardX.classList.add('active');
      cardO.classList.remove('active');
      statusText.className = 'status-text x-turn';
      statusText.textContent = (mode === 'ai') ? '轮到你 (X) 落子' : '轮到 X 选手落子';
    } else {
      cardO.classList.add('active');
      cardX.classList.remove('active');
      statusText.className = 'status-text o-turn';
      statusText.textContent = (mode === 'ai') ? 'AI (O) 思考中...' : '轮到 O 选手落子';
    }
  }

  function drawStrike(line) {
    if (!line) return;
    var c0 = cells[line[0]].getBoundingClientRect();
    var c2 = cells[line[2]].getBoundingClientRect();
    var bRect = boardEl.getBoundingClientRect();

    var x1 = c0.left + c0.width / 2 - bRect.left;
    var y1 = c0.top + c0.height / 2 - bRect.top;
    var x2 = c2.left + c2.width / 2 - bRect.left;
    var y2 = c2.top + c2.height / 2 - bRect.top;

    var dist = Math.hypot(x2 - x1, y2 - y1);
    var angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);

    winStrike.style.width = '0px';
    winStrike.style.display = 'block';
    winStrike.style.left = x1 + 'px';
    winStrike.style.top = y1 + 'px';
    winStrike.style.transform = 'rotate(' + angle + 'deg)';

    // Trigger animation
    setTimeout(function () {
      winStrike.style.width = dist + 'px';
    }, 10);
  }

  // Minimax Algorithm
  function getBestMove(currentBoard, player) {
    var opponent = (player === 'X') ? 'O' : 'X';

    // Easy AI: purely random
    if (difficulty === 'easy') {
      var available = [];
      currentBoard.forEach(function (c, idx) {
        if (!c) available.push(idx);
      });
      return available[Math.floor(Math.random() * available.length)];
    }

    // Medium AI: 40% random, 60% optimal
    if (difficulty === 'medium' && Math.random() < 0.4) {
      var availableMoves = [];
      currentBoard.forEach(function (c, idx) {
        if (!c) availableMoves.push(idx);
      });
      return availableMoves[Math.floor(Math.random() * availableMoves.length)];
    }

    // Unbeatable AI: Minimax
    function minimax(tempBoard, depth, isMaximizing) {
      var result = checkWinner(tempBoard);
      if (result) {
        if (result.winner === player) return 10 - depth;
        if (result.winner === opponent) return depth - 10;
        if (result.winner === 'tie') return 0;
      }

      if (isMaximizing) {
        var maxEval = -Infinity;
        for (var i = 0; i < 9; i++) {
          if (!tempBoard[i]) {
            tempBoard[i] = player;
            var evaluation = minimax(tempBoard, depth + 1, false);
            tempBoard[i] = null;
            if (evaluation > maxEval) maxEval = evaluation;
          }
        }
        return maxEval;
      } else {
        var minEval = Infinity;
        for (var j = 0; j < 9; j++) {
          if (!tempBoard[j]) {
            tempBoard[j] = opponent;
            var evalScore = minimax(tempBoard, depth + 1, true);
            tempBoard[j] = null;
            if (evalScore < minEval) minEval = evalScore;
          }
        }
        return minEval;
      }
    }

    var bestVal = -Infinity;
    var bestMove = -1;

    for (var k = 0; k < 9; k++) {
      if (!currentBoard[k]) {
        currentBoard[k] = player;
        var moveVal = minimax(currentBoard, 0, false);
        currentBoard[k] = null;
        if (moveVal > bestVal) {
          bestVal = moveVal;
          bestMove = k;
        }
      }
    }

    return bestMove;
  }

  // Handle move
  function makeMove(idx) {
    if (isGameOver || board[idx] !== null) return;

    board[idx] = currentTurn;
    playSound(currentTurn === 'X' ? 'x' : 'o');
    renderBoard();

    var result = checkWinner(board);
    if (result) {
      handleGameOver(result);
      return;
    }

    currentTurn = (currentTurn === 'X') ? 'O' : 'X';
    updateTurnUI();
    saveState();

    if (mode === 'ai' && currentTurn === 'O' && !isGameOver) {
      setTimeout(aiTurn, 260);
    }
  }

  function aiTurn() {
    if (isGameOver) return;
    var move = getBestMove(board, 'O');
    if (move !== -1) {
      makeMove(move);
    }
  }

  function handleGameOver(result) {
    isGameOver = true;
    saveState();

    if (result.winner === 'tie') {
      scores.ties++;
      scoreTieEl.textContent = scores.ties;
      statusText.className = 'status-text';
      statusText.textContent = '平局！势均力敌！';
      playSound('tie');
      showModal('🤝', '平局！', '棋逢对手，旗鼓相当！');
    } else {
      scores[result.winner]++;
      scoreXEl.textContent = scores.X;
      scoreOEl.textContent = scores.O;
      drawStrike(result.line);

      if (mode === 'ai') {
        if (result.winner === 'X') {
          playSound('win');
          showModal('🎉', '你赢了！', '恭喜击败 AI，神机妙算！');
        } else {
          playSound('loss');
          showModal('🤖', 'AI 获胜！', '棋差一着，吸取经验再战！');
        }
      } else {
        playSound('win');
        showModal('🏆', result.winner + ' 选手获胜！', '精妙绝伦的对局！');
      }

      statusText.className = 'status-text ' + (result.winner === 'X' ? 'x-turn' : 'o-turn');
      statusText.textContent = result.winner + ' 获胜！';
    }

    saveScores();
  }

  function showModal(emoji, title, desc) {
    setTimeout(function () {
      modalEmoji.textContent = emoji;
      modalTitle.textContent = title;
      modalDesc.textContent = desc;
      modal.classList.add('show');
    }, 600);
  }

  function hideModal() {
    modal.classList.remove('show');
  }

  function resetGame() {
    board = Array(9).fill(null);
    currentTurn = 'X';
    isGameOver = false;
    winStrike.style.display = 'none';
    winStrike.style.width = '0px';
    hideModal();
    renderBoard();
    saveState();
  }

  function saveScores() {
    try {
      localStorage.setItem(SCORE_KEY, JSON.stringify(scores));
    } catch (e) {}
  }

  function loadScores() {
    try {
      var saved = localStorage.getItem(SCORE_KEY);
      if (saved) {
        var parsed = JSON.parse(saved);
        if (parsed && typeof parsed.X === 'number') {
          scores = parsed;
          scoreXEl.textContent = scores.X;
          scoreOEl.textContent = scores.O;
          scoreTieEl.textContent = scores.ties;
        }
      }
    } catch (e) {}
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
        if (state && Array.isArray(state.board) && state.board.length === 9) {
          board = state.board;
          currentTurn = state.currentTurn || 'X';
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
          var winRes = checkWinner(board);
          if (winRes && winRes.line) {
            drawStrike(winRes.line);
          }
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
    diffControl.style.display = (mode === 'ai') ? 'block' : 'none';
  }

  // Event Listeners
  cells.forEach(function (cell) {
    cell.addEventListener('click', function () {
      var idx = parseInt(cell.getAttribute('data-idx'), 10);
      if (mode === 'ai' && currentTurn === 'O') return;
      makeMove(idx);
    });
  });

  restartBtn.addEventListener('click', resetGame);
  modalRestartBtn.addEventListener('click', resetGame);

  resetScoreBtn.addEventListener('click', function () {
    scores = { X: 0, O: 0, ties: 0 };
    scoreXEl.textContent = '0';
    scoreOEl.textContent = '0';
    scoreTieEl.textContent = '0';
    saveScores();
  });

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
  loadScores();
  if (!loadState()) {
    resetGame();
  }
})();
