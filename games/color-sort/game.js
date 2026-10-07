(function () {
  'use strict';

  var STORAGE_KEY = 'omg:save:color-sort';

  var COLOR_PALETTE = [
    '#f43f5e', // Red
    '#3b82f6', // Blue
    '#eab308', // Yellow
    '#10b981', // Green
    '#a855f7', // Purple
    '#f97316', // Orange
    '#06b6d4', // Cyan
    '#ec4899'  // Pink
  ];

  var TUBE_CAPACITY = 4;

  // DOM
  var tubesContainer = document.getElementById('tubesContainer');
  var levelText = document.getElementById('levelText');
  var moveText = document.getElementById('moveText');
  var addTubeBtn = document.getElementById('addTubeBtn');
  var undoBtn = document.getElementById('undoBtn');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');

  var modal = document.getElementById('csModal');
  var modalEmoji = document.getElementById('modalEmoji');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalActionBtn = document.getElementById('modalActionBtn');

  // State
  var level = 1;
  var tubes = []; // Array of arrays of color hex strings (bottom to top)
  var selectedTubeIndex = null;
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

    if (type === 'select') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.exponentialRampToValueAtTime(660, t + 0.05);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    } else if (type === 'pour') {
      [350, 480, 560].forEach(function (freq, i) {
        var osc = ctxA.createOscillator();
        var gain = ctxA.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.06);
        gain.gain.setValueAtTime(0.2, t + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.06 + 0.1);
        osc.connect(gain);
        gain.connect(ctxA.destination);
        osc.start(t + i * 0.06);
        osc.stop(t + i * 0.06 + 0.11);
      });
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

  function cloneTubes(tArr) {
    return tArr.map(function (tube) { return tube.slice(); });
  }

  // Solvable puzzle generator: starts solved, performs random reverse pours
  function generatePuzzle(lvl) {
    var numColors = Math.min(3 + Math.floor(lvl / 2), COLOR_PALETTE.length);
    var palette = COLOR_PALETTE.slice(0, numColors);

    // Initial state: N filled tubes of pure colors + 2 empty tubes
    var tList = [];
    for (var i = 0; i < numColors; i++) {
      tList.push(Array(TUBE_CAPACITY).fill(palette[i]));
    }
    tList.push([]);
    tList.push([]);

    // Scramble by random legal pours
    var numPours = 20 + lvl * 5;
    for (var step = 0; step < numPours; step++) {
      var srcIdx = Math.floor(Math.random() * tList.length);
      var dstIdx = Math.floor(Math.random() * tList.length);

      if (srcIdx !== dstIdx && tList[srcIdx].length > 0 && tList[dstIdx].length < TUBE_CAPACITY) {
        var seg = tList[srcIdx].pop();
        tList[dstIdx].push(seg);
      }
    }

    return tList;
  }

  function initLevel(lvl) {
    level = lvl || 1;
    tubes = generatePuzzle(level);
    selectedTubeIndex = null;
    moveCount = 0;
    history = [];
    isGameOver = false;

    updateUI();
    renderTubes();
    hideModal();
    saveState();
  }

  function updateUI() {
    levelText.textContent = level;
    moveText.textContent = moveCount;
  }

  function renderTubes() {
    tubesContainer.innerHTML = '';

    tubes.forEach(function (tube, idx) {
      var tubeEl = document.createElement('div');
      tubeEl.className = 'cs-tube';
      tubeEl.dataset.idx = idx;

      if (selectedTubeIndex === idx) {
        tubeEl.classList.add('selected');
      }

      // Render liquid segments from bottom to top
      tube.forEach(function (color) {
        var segEl = document.createElement('div');
        segEl.className = 'water-seg';
        segEl.style.backgroundColor = color;
        tubeEl.appendChild(segEl);
      });

      tubesContainer.appendChild(tubeEl);
    });
  }

  function canPour(srcIdx, dstIdx) {
    var src = tubes[srcIdx];
    var dst = tubes[dstIdx];

    if (src.length === 0) return false;
    if (dst.length >= TUBE_CAPACITY) return false;
    if (dst.length === 0) return true;

    var srcTop = src[src.length - 1];
    var dstTop = dst[dst.length - 1];
    return srcTop === dstTop;
  }

  function executePour(srcIdx, dstIdx) {
    var src = tubes[srcIdx];
    var dst = tubes[dstIdx];
    var targetColor = src[src.length - 1];

    // Count contiguous top segments in src
    var count = 0;
    for (var i = src.length - 1; i >= 0; i--) {
      if (src[i] === targetColor) count++;
      else break;
    }

    var available = TUBE_CAPACITY - dst.length;
    var transferCount = Math.min(count, available);

    if (transferCount <= 0) return;

    // Save history for undo
    history.push({
      tubes: cloneTubes(tubes),
      moves: moveCount
    });

    for (var k = 0; k < transferCount; k++) {
      dst.push(src.pop());
    }

    moveCount++;
    selectedTubeIndex = null;
    playSound('pour');

    updateUI();
    renderTubes();
    checkWinCondition();
    saveState();
  }

  function handleTubeClick(idx) {
    if (isGameOver) return;

    if (selectedTubeIndex === null) {
      // Pick source tube
      if (tubes[idx].length > 0) {
        selectedTubeIndex = idx;
        playSound('select');
        renderTubes();
      }
    } else if (selectedTubeIndex === idx) {
      // Deselect
      selectedTubeIndex = null;
      renderTubes();
    } else {
      // Trying to pour from selected to idx
      if (canPour(selectedTubeIndex, idx)) {
        executePour(selectedTubeIndex, idx);
      } else if (tubes[idx].length > 0) {
        // Switch selection to new tube
        selectedTubeIndex = idx;
        playSound('select');
        renderTubes();
      } else {
        selectedTubeIndex = null;
        renderTubes();
      }
    }
  }

  function checkWinCondition() {
    var won = true;

    for (var i = 0; i < tubes.length; i++) {
      var t = tubes[i];
      if (t.length === 0) continue;
      if (t.length !== TUBE_CAPACITY) {
        won = false;
        break;
      }
      var firstColor = t[0];
      for (var j = 1; j < t.length; j++) {
        if (t[j] !== firstColor) {
          won = false;
          break;
        }
      }
      if (!won) break;
    }

    if (won) {
      isGameOver = true;
      playSound('win');
      modalEmoji.textContent = '🧪';
      modalTitle.textContent = '纯化大捷！';
      modalDesc.textContent = '第 ' + level + ' 关通关！\n共用步数: ' + moveCount + ' 步';
      modalActionBtn.textContent = '进入第 ' + (level + 1) + ' 关';
      modalActionBtn.onclick = function () {
        initLevel(level + 1);
      };
      setTimeout(function () {
        modal.classList.add('show');
      }, 500);
    }
  }

  function hideModal() {
    modal.classList.remove('show');
  }

  function undoMove() {
    if (history.length === 0 || isGameOver) return;
    var last = history.pop();
    tubes = last.tubes;
    moveCount = last.moves;
    selectedTubeIndex = null;
    updateUI();
    renderTubes();
    saveState();
  }

  function addExtraTube() {
    if (isGameOver || tubes.length >= 10) return;
    history.push({
      tubes: cloneTubes(tubes),
      moves: moveCount
    });
    tubes.push([]);
    selectedTubeIndex = null;
    renderTubes();
    saveState();
  }

  function saveState() {
    try {
      var state = {
        level: level,
        tubes: tubes,
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
        if (state && Array.isArray(state.tubes)) {
          level = state.level || 1;
          tubes = state.tubes;
          moveCount = state.moveCount || 0;
          isGameOver = !!state.isGameOver;
          updateUI();
          renderTubes();
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // Event Listeners
  tubesContainer.addEventListener('click', function (e) {
    var tubeEl = e.target.closest('.cs-tube');
    if (!tubeEl) return;
    var idx = parseInt(tubeEl.dataset.idx, 10);
    handleTubeClick(idx);
  });

  undoBtn.addEventListener('click', undoMove);
  restartBtn.addEventListener('click', function () { initLevel(level); });
  addTubeBtn.addEventListener('click', addExtraTube);

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  // Init
  if (!loadState()) {
    initLevel(1);
  }
})();
