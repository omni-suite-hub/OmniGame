(function () {
  'use strict';

  var STORAGE_KEY = 'omg:save:hanoi';

  // Game state
  var numDiscs = 4;
  var pegs = [[], [], []];
  var selectedPeg = null; // index 0, 1, 2
  var moveCount = 0;
  var isGameOver = false;
  var soundEnabled = true;
  var history = [];
  var isAutoSolving = false;
  var autoSolveTimer = null;

  // DOM Elements
  var discCountSelect = document.getElementById('discCountSelect');
  var moveCountEl = document.getElementById('moveCount');
  var minMovesEl = document.getElementById('minMoves');
  var soundBtn = document.getElementById('soundBtn');
  var undoBtn = document.getElementById('undoBtn');
  var restartBtn = document.getElementById('restartBtn');
  var autoSolveBtn = document.getElementById('autoSolveBtn');
  var pegWraps = document.querySelectorAll('.hanoi-peg-wrap');
  var pegStacks = [
    document.getElementById('peg0'),
    document.getElementById('peg1'),
    document.getElementById('peg2')
  ];

  var modal = document.getElementById('hanoiModal');
  var modalEmoji = document.getElementById('modalEmoji');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalNextBtn = document.getElementById('modalNextBtn');

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

    if (type === 'pick') {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(350, t);
      osc.frequency.exponentialRampToValueAtTime(520, t + 0.06);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.07);
    } else if (type === 'drop') {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.exponentialRampToValueAtTime(220, t + 0.07);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    } else if (type === 'error') {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, t);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (freq, i) {
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

  function getMinMoves(n) {
    return Math.pow(2, n) - 1;
  }

  function initGame(count) {
    stopAutoSolve();
    numDiscs = count || parseInt(discCountSelect.value, 10);
    pegs = [[], [], []];
    // Peg 0 has all discs in descending order: e.g. [4, 3, 2, 1]
    for (var i = numDiscs; i >= 1; i--) {
      pegs[0].push(i);
    }
    selectedPeg = null;
    moveCount = 0;
    isGameOver = false;
    history = [];

    moveCountEl.textContent = '0';
    minMovesEl.textContent = getMinMoves(numDiscs);
    hideModal();
    renderPegs();
    saveState();
  }

  function renderPegs() {
    pegWraps.forEach(function (wrap, idx) {
      if (selectedPeg === idx) {
        wrap.classList.add('selected');
      } else {
        wrap.classList.remove('selected');
      }
    });

    for (var p = 0; p < 3; p++) {
      var stackEl = pegStacks[p];
      stackEl.innerHTML = '';
      var discs = pegs[p];

      for (var d = 0; d < discs.length; d++) {
        var discVal = discs[d];
        var discEl = document.createElement('div');
        discEl.className = 'hanoi-disc';
        discEl.dataset.size = discVal;
        discEl.textContent = discVal;

        // If top disc of selected peg
        if (selectedPeg === p && d === discs.length - 1) {
          discEl.classList.add('picked');
        }

        stackEl.appendChild(discEl);
      }
    }
  }

  function handlePegClick(pegIdx) {
    if (isGameOver || isAutoSolving) return;

    if (selectedPeg === null) {
      // Trying to select top disc
      if (pegs[pegIdx].length === 0) return;
      selectedPeg = pegIdx;
      playSound('pick');
      renderPegs();
    } else if (selectedPeg === pegIdx) {
      // Unselect
      selectedPeg = null;
      renderPegs();
    } else {
      // Trying to move from selectedPeg to pegIdx
      var fromPeg = selectedPeg;
      var toPeg = pegIdx;
      var disc = pegs[fromPeg][pegs[fromPeg].length - 1];

      // Check rule: target cannot have a smaller disc than current disc
      var targetTop = pegs[toPeg].length > 0 ? pegs[toPeg][pegs[toPeg].length - 1] : Infinity;

      if (disc < targetTop) {
        // Valid move
        pegs[fromPeg].pop();
        pegs[toPeg].push(disc);
        history.push({ from: fromPeg, to: toPeg });
        moveCount++;
        moveCountEl.textContent = moveCount;
        selectedPeg = null;
        playSound('drop');
        renderPegs();
        checkWin();
        saveState();
      } else {
        // Invalid move!
        playSound('error');
        // Flash peg red
        pegWraps[toPeg].animate([
          { transform: 'translateX(0)' },
          { transform: 'translateX(-6px)' },
          { transform: 'translateX(6px)' },
          { transform: 'translateX(0)' }
        ], { duration: 200 });
      }
    }
  }

  function checkWin() {
    // Win if all discs are on Peg 2 (C)
    if (pegs[2].length === numDiscs) {
      isGameOver = true;
      playSound('win');
      var minM = getMinMoves(numDiscs);
      modalEmoji.textContent = '🎉';
      modalTitle.textContent = '挑战成功！';
      var perfect = (moveCount === minM);
      modalDesc.textContent = (perfect ? '🌟 完美！以理论最少 ' : '共完成 ') + moveCount + ' 步顺利通关！';

      setTimeout(function () {
        modal.classList.add('show');
      }, 500);
    }
  }

  function hideModal() {
    modal.classList.remove('show');
  }

  function undoMove() {
    if (history.length === 0 || isGameOver || isAutoSolving) return;
    var last = history.pop();
    var disc = pegs[last.to].pop();
    pegs[last.from].push(disc);
    selectedPeg = null;
    if (moveCount > 0) moveCount--;
    moveCountEl.textContent = moveCount;
    renderPegs();
    saveState();
  }

  // Auto solve generator (Hanoi algorithm)
  function getAutoSolveMoves(n, from, to, aux) {
    var moves = [];
    function solve(count, src, dst, buffer) {
      if (count === 1) {
        moves.push({ from: src, to: dst });
        return;
      }
      solve(count - 1, src, buffer, dst);
      moves.push({ from: src, to: dst });
      solve(count - 1, buffer, dst, src);
    }
    solve(n, from, to, aux);
    return moves;
  }

  function startAutoSolve() {
    if (isAutoSolving) {
      stopAutoSolve();
      return;
    }

    initGame(numDiscs);
    isAutoSolving = true;
    autoSolveBtn.textContent = '⏹️ 停止演示';
    autoSolveBtn.style.color = '#f43f5e';

    var moves = getAutoSolveMoves(numDiscs, 0, 2, 1);
    var stepIndex = 0;

    autoSolveTimer = setInterval(function () {
      if (stepIndex >= moves.length) {
        stopAutoSolve();
        return;
      }
      var m = moves[stepIndex++];
      var disc = pegs[m.from].pop();
      pegs[m.to].push(disc);
      moveCount++;
      moveCountEl.textContent = moveCount;
      playSound('drop');
      renderPegs();
      if (stepIndex >= moves.length) {
        checkWin();
      }
    }, 450);
  }

  function stopAutoSolve() {
    if (autoSolveTimer) {
      clearInterval(autoSolveTimer);
      autoSolveTimer = null;
    }
    isAutoSolving = false;
    autoSolveBtn.textContent = '🤖 AI 演示解法';
    autoSolveBtn.style.color = '#38bdf8';
  }

  function saveState() {
    try {
      var state = {
        numDiscs: numDiscs,
        pegs: pegs,
        moveCount: moveCount,
        isGameOver: isGameOver
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function loadState() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        var state = JSON.parse(saved);
        if (state && Array.isArray(state.pegs) && state.pegs.length === 3) {
          numDiscs = state.numDiscs || 4;
          pegs = state.pegs;
          moveCount = state.moveCount || 0;
          isGameOver = !!state.isGameOver;

          discCountSelect.value = numDiscs;
          moveCountEl.textContent = moveCount;
          minMovesEl.textContent = getMinMoves(numDiscs);
          renderPegs();
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // Event Listeners
  pegWraps.forEach(function (wrap) {
    wrap.addEventListener('click', function () {
      var pegIdx = parseInt(wrap.dataset.peg, 10);
      handlePegClick(pegIdx);
    });
  });

  discCountSelect.addEventListener('change', function () {
    initGame(parseInt(discCountSelect.value, 10));
  });

  restartBtn.addEventListener('click', function () {
    initGame(numDiscs);
  });

  modalNextBtn.addEventListener('click', function () {
    hideModal();
    initGame(numDiscs);
  });

  undoBtn.addEventListener('click', undoMove);
  autoSolveBtn.addEventListener('click', startAutoSolve);

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  // Init
  if (!loadState()) {
    initGame(4);
  }
})();
