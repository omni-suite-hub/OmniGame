(function () {
  'use strict';

  var STORAGE_KEY = 'omg:save:pipe-mania';

  // Directions: 0: Top, 1: Right, 2: Bottom, 3: Left
  var DIRS = [
    { dr: -1, dc: 0 }, // 0: Top
    { dr: 0, dc: 1 },  // 1: Right
    { dr: 1, dc: 0 },  // 2: Bottom
    { dr: 0, dc: -1 }  // 3: Left
  ];

  var OPPOSITE = [2, 3, 0, 1];

  // DOM elements
  var boardEl = document.getElementById('board');
  var levelText = document.getElementById('levelText');
  var rotText = document.getElementById('rotText');
  var countdownText = document.getElementById('countdownText');
  var flowNowBtn = document.getElementById('flowNowBtn');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');

  var modal = document.getElementById('pipeModal');
  var modalEmoji = document.getElementById('modalEmoji');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalActionBtn = document.getElementById('modalActionBtn');

  // State
  var level = 1;
  var gridSize = 5;
  var grid = []; // 2D array of tile objects
  var source = { r: 0, c: 0, outDir: 1 };
  var drain = { r: 4, c: 4, inDir: 3 };
  var rotationsCount = 0;
  var countdown = 15;
  var countdownInterval = null;
  var isFlowing = false;
  var isGameOver = false;
  var soundEnabled = true;

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
    var ctxA = getAudioCtx();
    if (!ctxA) return;
    var t = ctxA.currentTime;

    if (type === 'rotate') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(200, t + 0.05);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    } else if (type === 'flow') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.linearRampToValueAtTime(587.33, t + 0.1);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    } else if (type === 'leak') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, t);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.18);
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

  // Get active ports based on base ports and rotation (0, 1, 2, 3)
  function getActivePorts(basePorts, rotation) {
    return basePorts.map(function (p) {
      return (p + rotation) % 4;
    });
  }

  // Generate Solvable Level
  function generateLevel(lvl) {
    gridSize = (lvl <= 2) ? 5 : 6;
    source = { r: 0, c: 0, outDir: 1 };
    drain = { r: gridSize - 1, c: gridSize - 1, inDir: 3 };

    var b = [];
    for (var r = 0; r < gridSize; r++) {
      b[r] = [];
      for (var c = 0; c < gridSize; c++) {
        b[r][c] = {
          type: 'straight',
          basePorts: [0, 2],
          rotation: 0,
          filled: false
        };
      }
    }

    // Generate random walk path from Source to Drain
    var path = [{ r: source.r, c: source.c }];
    var curr = { r: source.r, c: source.c };
    var visited = {};
    visited[curr.r + '-' + curr.c] = true;

    while (curr.r !== drain.r || curr.c !== drain.c) {
      var possibleDirs = [];
      // Prefer moving towards drain
      if (curr.r < drain.r && !visited[(curr.r + 1) + '-' + curr.c]) possibleDirs.push(2);
      if (curr.c < drain.c && !visited[curr.r + '-' + (curr.c + 1)]) possibleDirs.push(1);
      if (curr.r > 0 && Math.random() < 0.2 && !visited[(curr.r - 1) + '-' + curr.c]) possibleDirs.push(0);
      if (curr.c > 0 && Math.random() < 0.2 && !visited[curr.r + '-' + (curr.c - 1)]) possibleDirs.push(3);

      if (possibleDirs.length === 0) {
        // Fallback step directly towards drain
        if (curr.r < drain.r) possibleDirs.push(2);
        else if (curr.c < drain.c) possibleDirs.push(1);
      }

      var chosenDir = possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
      var nextR = curr.r + DIRS[chosenDir].dr;
      var nextC = curr.c + DIRS[chosenDir].dc;
      curr = { r: nextR, c: nextC };
      path.push(curr);
      visited[curr.r + '-' + curr.c] = true;
    }

    // Configure tiles along path
    for (var i = 1; i < path.length - 1; i++) {
      var prevP = path[i - 1];
      var curP = path[i];
      var nextP = path[i + 1];

      // Entering port (opposite of dir from prev to cur)
      var inPort = -1;
      for (var d = 0; d < 4; d++) {
        if (prevP.r + DIRS[d].dr === curP.r && prevP.c + DIRS[d].dc === curP.c) {
          inPort = OPPOSITE[d];
          break;
        }
      }

      // Exiting port (dir from cur to next)
      var outPort = -1;
      for (var d2 = 0; d2 < 4; d2++) {
        if (curP.r + DIRS[d2].dr === nextP.r && curP.c + DIRS[d2].dc === nextP.c) {
          outPort = d2;
          break;
        }
      }

      // Assign pipe type
      if ((inPort + 2) % 4 === outPort) {
        // Straight
        b[curP.r][curP.c].type = 'straight';
        b[curP.r][curP.c].basePorts = [0, 2];
        b[curP.r][curP.c].rotation = (inPort === 1 || inPort === 3) ? 1 : 0;
      } else {
        // Elbow
        b[curP.r][curP.c].type = 'elbow';
        b[curP.r][curP.c].basePorts = [0, 1]; // Top + Right
        // Find rotation that matches inPort & outPort
        for (var rot = 0; rot < 4; rot++) {
          var ap = getActivePorts([0, 1], rot);
          if (ap.indexOf(inPort) !== -1 && ap.indexOf(outPort) !== -1) {
            b[curP.r][curP.c].rotation = rot;
            break;
          }
        }
      }
    }

    // Scramble rotations of all non-source/non-drain tiles
    for (var r2 = 0; r2 < gridSize; r2++) {
      for (var c2 = 0; c2 < gridSize; c2++) {
        if ((r2 !== source.r || c2 !== source.c) && (r2 !== drain.r || c2 !== drain.c)) {
          var randomRot = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
          b[r2][c2].rotation = (b[r2][c2].rotation + randomRot) % 4;
        }
      }
    }

    return b;
  }

  function initLevel(lvl) {
    clearInterval(countdownInterval);
    level = lvl || 1;
    grid = generateLevel(level);
    rotationsCount = 0;
    countdown = 15;
    isFlowing = false;
    isGameOver = false;

    updateUI();
    renderBoard();
    hideModal();
    startCountdown();
    saveState();
  }

  function startCountdown() {
    clearInterval(countdownInterval);
    countdownInterval = setInterval(function () {
      if (!isFlowing && !isGameOver) {
        countdown--;
        countdownText.textContent = countdown;
        if (countdown <= 0) {
          startWaterFlow();
        }
      }
    }, 1000);
  }

  function updateUI() {
    levelText.textContent = level;
    rotText.textContent = rotationsCount;
    countdownText.textContent = countdown;
  }

  // SVG Pipe graphics
  function getPipeSVG(type, filled) {
    var cls = filled ? 'water-filled' : '';
    if (type === 'straight') {
      return '<svg viewBox="0 0 100 100"><line x1="50" y1="0" x2="50" y2="100" class="pipe-path ' + cls + '"/><line x1="50" y1="0" x2="50" y2="100" class="pipe-path-inner ' + cls + '"/></svg>';
    } else if (type === 'elbow') {
      return '<svg viewBox="0 0 100 100"><path d="M 50,0 Q 50,50 100,50" class="pipe-path ' + cls + '"/><path d="M 50,0 Q 50,50 100,50" class="pipe-path-inner ' + cls + '"/></svg>';
    } else if (type === 'cross') {
      return '<svg viewBox="0 0 100 100"><line x1="50" y1="0" x2="50" y2="100" class="pipe-path ' + cls + '"/><line x1="0" y1="50" x2="100" y2="50" class="pipe-path ' + cls + '"/><line x1="50" y1="0" x2="50" y2="100" class="pipe-path-inner ' + cls + '"/><line x1="0" y1="50" x2="100" y2="50" class="pipe-path-inner ' + cls + '"/></svg>';
    }
    return '';
  }

  function renderBoard() {
    boardEl.style.gridTemplateColumns = 'repeat(' + gridSize + ', 1fr)';
    boardEl.style.gridTemplateRows = 'repeat(' + gridSize + ', 1fr)';
    boardEl.innerHTML = '';

    for (var r = 0; r < gridSize; r++) {
      for (var c = 0; c < gridSize; c++) {
        var tile = grid[r][c];
        var tileEl = document.createElement('div');
        tileEl.className = 'pipe-tile';
        tileEl.dataset.row = r;
        tileEl.dataset.col = c;

        var isSource = (r === source.r && c === source.c);
        var isDrain = (r === drain.r && c === drain.c);

        if (isSource || isDrain) {
          tileEl.classList.add('fixed');
        }

        var deg = tile.rotation * 90;
        tileEl.style.transform = 'rotate(' + deg + 'deg)';
        tileEl.innerHTML = getPipeSVG(tile.type, tile.filled);

        if (isSource) {
          var iconS = document.createElement('div');
          iconS.className = 'pipe-badge-icon';
          iconS.textContent = '💧';
          tileEl.appendChild(iconS);
        } else if (isDrain) {
          var iconD = document.createElement('div');
          iconD.className = 'pipe-badge-icon';
          iconD.textContent = '🏁';
          tileEl.appendChild(iconD);
        }

        boardEl.appendChild(tileEl);
      }
    }
  }

  function rotateTile(r, c) {
    if (isFlowing || isGameOver) return;
    if ((r === source.r && c === source.c) || (r === drain.r && c === drain.c)) return;

    var tile = grid[r][c];
    tile.rotation = (tile.rotation + 1) % 4;
    rotationsCount++;
    rotText.textContent = rotationsCount;
    playSound('rotate');

    renderBoard();
    saveState();
  }

  // Animated Water Flow Simulation
  function startWaterFlow() {
    if (isFlowing || isGameOver) return;
    isFlowing = true;
    clearInterval(countdownInterval);
    countdownText.textContent = '0';

    var currR = source.r;
    var currC = source.c;
    var incomingDir = source.outDir; // flow direction exiting source

    grid[currR][currC].filled = true;
    renderBoard();
    playSound('flow');

    var flowStepTimer = setInterval(function () {
      var nextR = currR + DIRS[incomingDir].dr;
      var nextC = currC + DIRS[incomingDir].dc;

      // Check bounds
      if (nextR < 0 || nextR >= gridSize || nextC < 0 || nextC >= gridSize) {
        clearInterval(flowStepTimer);
        handleLeak();
        return;
      }

      var nextTile = grid[nextR][nextC];
      var requiredPort = OPPOSITE[incomingDir];
      var activePorts = getActivePorts(nextTile.basePorts, nextTile.rotation);

      if (activePorts.indexOf(requiredPort) === -1) {
        // Misaligned pipe! Leak!
        clearInterval(flowStepTimer);
        handleLeak();
        return;
      }

      // Connected! Fill next tile
      nextTile.filled = true;
      playSound('flow');
      renderBoard();

      // Check if reached drain
      if (nextR === drain.r && nextC === drain.c) {
        clearInterval(flowStepTimer);
        handleVictory();
        return;
      }

      // Find exit port for next step
      var nextOutDir = activePorts.find(function (p) { return p !== requiredPort; });
      if (nextOutDir === undefined) {
        clearInterval(flowStepTimer);
        handleLeak();
        return;
      }

      currR = nextR;
      currC = nextC;
      incomingDir = nextOutDir;
    }, 220);
  }

  function handleVictory() {
    isGameOver = true;
    playSound('win');
    modalEmoji.textContent = '🌊';
    modalTitle.textContent = '管道畅通！顺利通关！';
    modalDesc.textContent = '清澈水流顺利流入终点！\n旋转步数: ' + rotationsCount + ' 步';
    modalActionBtn.textContent = '进入第 ' + (level + 1) + ' 关';
    modalActionBtn.onclick = function () {
      initLevel(level + 1);
    };
    setTimeout(function () {
      modal.classList.add('show');
    }, 400);
  }

  function handleLeak() {
    isGameOver = true;
    playSound('leak');
    modalEmoji.textContent = '💥';
    modalTitle.textContent = '管道漏水！未形成闭合水路！';
    modalDesc.textContent = '水流中途喷溅泄露，检查接头是否完全咬合。';
    modalActionBtn.textContent = '重试本关';
    modalActionBtn.onclick = function () {
      initLevel(level);
    };
    setTimeout(function () {
      modal.classList.add('show');
    }, 400);
  }

  function hideModal() {
    modal.classList.remove('show');
  }

  function saveState() {
    try {
      var state = {
        level: level,
        gridSize: gridSize,
        grid: grid,
        rotationsCount: rotationsCount,
        countdown: countdown,
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
        if (state && Array.isArray(state.grid)) {
          level = state.level || 1;
          gridSize = state.gridSize || 5;
          grid = state.grid;
          rotationsCount = state.rotationsCount || 0;
          countdown = state.countdown || 15;
          isGameOver = !!state.isGameOver;
          updateUI();
          renderBoard();
          if (!isGameOver) startCountdown();
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // Event Listeners
  boardEl.addEventListener('click', function (e) {
    var tile = e.target.closest('.pipe-tile');
    if (!tile) return;
    var r = parseInt(tile.dataset.row, 10);
    var c = parseInt(tile.dataset.col, 10);
    rotateTile(r, c);
  });

  flowNowBtn.addEventListener('click', startWaterFlow);
  restartBtn.addEventListener('click', function () { initLevel(level); });

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  // Init
  if (!loadState()) {
    initLevel(1);
  }
})();
