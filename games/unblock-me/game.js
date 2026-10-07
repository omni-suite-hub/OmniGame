(function () {
  'use strict';

  var STORAGE_KEY = 'omg:save:unblock-me';

  var LEVELS = {
    1: {
      optMoves: 8,
      blocks: [
        { id: 'T', r: 2, c: 0, len: 2, dir: 'H', target: true },
        { id: '1', r: 0, c: 2, len: 3, dir: 'V' },
        { id: '2', r: 0, c: 3, len: 2, dir: 'H' },
        { id: '3', r: 1, c: 5, len: 3, dir: 'V' },
        { id: '4', r: 3, c: 2, len: 2, dir: 'H' },
        { id: '5', r: 4, c: 1, len: 2, dir: 'V' },
        { id: '6', r: 5, c: 2, len: 3, dir: 'H' }
      ]
    },
    2: {
      optMoves: 14,
      blocks: [
        { id: 'T', r: 2, c: 1, len: 2, dir: 'H', target: true },
        { id: '1', r: 0, c: 0, len: 3, dir: 'V' },
        { id: '2', r: 0, c: 1, len: 3, dir: 'H' },
        { id: '3', r: 1, c: 3, len: 3, dir: 'V' },
        { id: '4', r: 3, c: 0, len: 2, dir: 'H' },
        { id: '5', r: 3, c: 4, len: 2, dir: 'V' },
        { id: '6', r: 4, c: 1, len: 2, dir: 'V' },
        { id: '7', r: 5, c: 2, len: 3, dir: 'H' }
      ]
    },
    3: {
      optMoves: 21,
      blocks: [
        { id: 'T', r: 2, c: 0, len: 2, dir: 'H', target: true },
        { id: '1', r: 0, c: 0, len: 2, dir: 'H' },
        { id: '2', r: 0, c: 2, len: 3, dir: 'V' },
        { id: '3', r: 0, c: 3, len: 2, dir: 'V' },
        { id: '4', r: 1, c: 4, len: 2, dir: 'H' },
        { id: '5', r: 2, c: 5, len: 3, dir: 'V' },
        { id: '6', r: 3, c: 0, len: 2, dir: 'V' },
        { id: '7', r: 3, c: 3, len: 2, dir: 'H' },
        { id: '8', r: 4, c: 2, len: 2, dir: 'H' },
        { id: '9', r: 5, c: 1, len: 3, dir: 'H' }
      ]
    },
    4: {
      optMoves: 28,
      blocks: [
        { id: 'T', r: 2, c: 1, len: 2, dir: 'H', target: true },
        { id: '1', r: 0, c: 0, len: 2, dir: 'V' },
        { id: '2', r: 0, c: 1, len: 2, dir: 'H' },
        { id: '3', r: 0, c: 3, len: 3, dir: 'V' },
        { id: '4', r: 1, c: 4, len: 2, dir: 'H' },
        { id: '5', r: 2, c: 0, len: 2, dir: 'V' },
        { id: '6', r: 3, c: 1, len: 2, dir: 'V' },
        { id: '7', r: 3, c: 4, len: 3, dir: 'V' },
        { id: '8', r: 4, c: 2, len: 2, dir: 'H' },
        { id: '9', r: 5, c: 0, len: 3, dir: 'H' }
      ]
    }
  };

  // DOM
  var boardEl = document.getElementById('board');
  var levelSelect = document.getElementById('levelSelect');
  var movesText = document.getElementById('movesText');
  var optText = document.getElementById('optText');
  var undoBtn = document.getElementById('undoBtn');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');

  var modal = document.getElementById('ubModal');
  var modalEmoji = document.getElementById('modalEmoji');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalActionBtn = document.getElementById('modalActionBtn');

  // State
  var currentLevel = 1;
  var blocks = [];
  var moveCount = 0;
  var history = [];
  var isGameOver = false;
  var soundEnabled = true;

  // Audio Context
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
    var ctxA = getAudioCtx();
    if (!ctxA) return;
    var t = ctxA.currentTime;

    if (type === 'slide') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.08);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.09);
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (freq, i) {
        var osc = ctxA.createOscillator();
        var gain = ctxA.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + i * 0.1);
        gain.gain.setValueAtTime(0.3, t + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.1 + 0.2);
        osc.connect(gain);
        gain.connect(ctxA.destination);
        osc.start(t + i * 0.1);
        osc.stop(t + i * 0.1 + 0.22);
      });
    }
  }

  function cloneBlocks(bList) {
    return bList.map(function (b) {
      return { id: b.id, r: b.r, c: b.c, len: b.len, dir: b.dir, target: !!b.target };
    });
  }

  function initLevel(lvl) {
    currentLevel = lvl || 1;
    var def = LEVELS[currentLevel] || LEVELS[1];
    blocks = cloneBlocks(def.blocks);
    moveCount = 0;
    history = [];
    isGameOver = false;

    levelSelect.value = currentLevel;
    optText.textContent = def.optMoves;
    movesText.textContent = '0';

    renderBoard();
    hideModal();
    saveState();
  }

  function getOccupiedGrid(excludeId) {
    var grid = Array(6).fill(null).map(function () { return Array(6).fill(null); });
    blocks.forEach(function (b) {
      if (b.id === excludeId) return;
      for (var i = 0; i < b.len; i++) {
        var r = b.dir === 'V' ? b.r + i : b.r;
        var c = b.dir === 'H' ? b.c + i : b.c;
        if (r >= 0 && r < 6 && c >= 0 && c < 6) {
          grid[r][c] = b.id;
        }
      }
    });
    return grid;
  }

  function renderBoard() {
    boardEl.innerHTML = '';

    blocks.forEach(function (b) {
      var blockEl = document.createElement('div');
      blockEl.className = 'ub-block ' + (b.target ? 'target' : 'wood');
      blockEl.dataset.id = b.id;

      var step = 100 / 6;
      blockEl.style.left = (b.c * step) + '%';
      blockEl.style.top = (b.r * step) + '%';

      if (b.dir === 'H') {
        blockEl.style.width = (b.len * step) + '%';
        blockEl.style.height = step + '%';
      } else {
        blockEl.style.width = step + '%';
        blockEl.style.height = (b.len * step) + '%';
      }

      setupDrag(blockEl, b);
      boardEl.appendChild(blockEl);
    });
  }

  function setupDrag(el, block) {
    var startX = 0;
    var startY = 0;
    var initPos = 0;
    var isDragging = false;

    function onPointerDown(e) {
      if (isGameOver) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initPos = (block.dir === 'H') ? block.c : block.r;
      el.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
      if (!isDragging) return;
      var boardRect = boardEl.getBoundingClientRect();
      var cellSize = boardRect.width / 6;

      var delta = (block.dir === 'H') ? (e.clientX - startX) : (e.clientY - startY);
      var deltaCells = delta / cellSize;

      // Calculate legal sliding range
      var grid = getOccupiedGrid(block.id);
      var minPos = initPos;
      var maxPos = initPos;

      if (block.dir === 'H') {
        while (minPos > 0 && grid[block.r][minPos - 1] === null) minPos--;
        while (maxPos + block.len < 6 && grid[block.r][maxPos + block.len] === null) maxPos++;
      } else {
        while (minPos > 0 && grid[minPos - 1][block.c] === null) minPos--;
        while (maxPos + block.len < 6 && grid[maxPos + block.len][block.c] === null) maxPos++;
      }

      var proposedPos = initPos + deltaCells;
      var clampedPos = Math.max(minPos, Math.min(maxPos, proposedPos));

      var step = 100 / 6;
      if (block.dir === 'H') {
        el.style.left = (clampedPos * step) + '%';
      } else {
        el.style.top = (clampedPos * step) + '%';
      }
    }

    function onPointerUp(e) {
      if (!isDragging) return;
      isDragging = false;
      el.releasePointerCapture(e.pointerId);

      var boardRect = boardEl.getBoundingClientRect();
      var cellSize = boardRect.width / 6;
      var delta = (block.dir === 'H') ? (e.clientX - startX) : (e.clientY - startY);
      var deltaCells = Math.round(delta / cellSize);

      var grid = getOccupiedGrid(block.id);
      var minPos = initPos;
      var maxPos = initPos;

      if (block.dir === 'H') {
        while (minPos > 0 && grid[block.r][minPos - 1] === null) minPos--;
        while (maxPos + block.len < 6 && grid[block.r][maxPos + block.len] === null) maxPos++;
      } else {
        while (minPos > 0 && grid[minPos - 1][block.c] === null) minPos--;
        while (maxPos + block.len < 6 && grid[maxPos + block.len][block.c] === null) maxPos++;
      }

      var finalPos = Math.max(minPos, Math.min(maxPos, initPos + deltaCells));

      if (finalPos !== initPos) {
        history.push({
          blocks: cloneBlocks(blocks),
          moves: moveCount
        });

        if (block.dir === 'H') block.c = finalPos;
        else block.r = finalPos;

        moveCount++;
        movesText.textContent = moveCount;
        playSound('slide');
        saveState();

        // Check victory (target red block reaches exit at c = 4)
        if (block.target && block.c === 4) {
          handleVictory();
        }
      }

      renderBoard();
    }

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
  }

  function handleVictory() {
    isGameOver = true;
    playSound('win');

    var def = LEVELS[currentLevel] || LEVELS[1];
    var perfect = (moveCount <= def.optMoves);

    modalEmoji.textContent = '🚗';
    modalTitle.textContent = '解围脱困！顺利出关！';
    modalDesc.textContent = (perfect ? '🌟 完美！最少 ' : '共完成 ') + moveCount + ' 步成功移出红色主车！';
    modalActionBtn.textContent = (currentLevel < 4) ? '进入第 ' + (currentLevel + 1) + ' 关' : '重玩此关';
    modalActionBtn.onclick = function () {
      if (currentLevel < 4) initLevel(currentLevel + 1);
      else initLevel(currentLevel);
    };

    setTimeout(function () {
      modal.classList.add('show');
    }, 400);
  }

  function hideModal() {
    modal.classList.remove('show');
  }

  function undoMove() {
    if (history.length === 0 || isGameOver) return;
    var last = history.pop();
    blocks = last.blocks;
    moveCount = last.moves;
    movesText.textContent = moveCount;
    renderBoard();
    saveState();
  }

  function saveState() {
    try {
      var state = {
        currentLevel: currentLevel,
        blocks: blocks,
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
        if (state && Array.isArray(state.blocks)) {
          currentLevel = state.currentLevel || 1;
          blocks = state.blocks;
          moveCount = state.moveCount || 0;
          isGameOver = !!state.isGameOver;

          levelSelect.value = currentLevel;
          var def = LEVELS[currentLevel] || LEVELS[1];
          optText.textContent = def.optMoves;
          movesText.textContent = moveCount;

          renderBoard();
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // Event Listeners
  levelSelect.addEventListener('change', function () {
    initLevel(parseInt(levelSelect.value, 10));
  });

  restartBtn.addEventListener('click', function () { initLevel(currentLevel); });
  undoBtn.addEventListener('click', undoMove);

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  // Init
  if (!loadState()) {
    initLevel(1);
  }
})();
