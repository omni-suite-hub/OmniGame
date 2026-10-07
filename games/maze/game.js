(function () {
  'use strict';

  var STORAGE_KEY = 'omg:save:maze';

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');

  var diffSelect = document.getElementById('diffSelect');
  var stepsText = document.getElementById('stepsText');
  var timerText = document.getElementById('timerText');
  var fogBtn = document.getElementById('fogBtn');
  var soundBtn = document.getElementById('soundBtn');
  var restartBtn = document.getElementById('restartBtn');

  var modal = document.getElementById('mzModal');
  var modalEmoji = document.getElementById('modalEmoji');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalActionBtn = document.getElementById('modalActionBtn');

  // State
  var mazeSize = 11; // 11, 17, or 23
  var grid = []; // 2D array: 1 = wall, 0 = path
  var player = { r: 1, c: 1 };
  var goal = { r: 9, c: 9 };
  var trail = []; // array of 'r-c'
  var steps = 0;
  var timerSeconds = 0;
  var timerInterval = null;
  var fogMode = false;
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

    if (type === 'step') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(360, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.04);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.04);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.05);
    } else if (type === 'bump') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, t);
      gain.gain.setValueAtTime(0.25, t);
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

  // Maze Generator (Recursive Backtracker)
  function generateMaze(size) {
    var b = [];
    for (var r = 0; r < size; r++) {
      b[r] = [];
      for (var c = 0; c < size; c++) {
        b[r][c] = 1; // wall
      }
    }

    var stack = [{ r: 1, c: 1 }];
    b[1][1] = 0;

    var dirs = [
      { dr: -2, dc: 0, wallR: -1, wallC: 0 },
      { dr: 2, dc: 0, wallR: 1, wallC: 0 },
      { dr: 0, dc: -2, wallR: 0, wallC: -1 },
      { dr: 0, dc: 2, wallR: 0, wallC: 1 }
    ];

    while (stack.length > 0) {
      var curr = stack[stack.length - 1];
      var validNeighbors = [];

      for (var i = 0; i < dirs.length; i++) {
        var d = dirs[i];
        var nr = curr.r + d.dr;
        var nc = curr.c + d.dc;

        if (nr > 0 && nr < size - 1 && nc > 0 && nc < size - 1 && b[nr][nc] === 1) {
          validNeighbors.push({ nr: nr, nc: nc, wr: curr.r + d.wallR, wc: curr.c + d.wallC });
        }
      }

      if (validNeighbors.length > 0) {
        var chosen = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
        b[chosen.wr][chosen.wc] = 0;
        b[chosen.nr][chosen.nc] = 0;
        stack.push({ r: chosen.nr, c: chosen.nc });
      } else {
        stack.pop();
      }
    }

    // Ensure goal is carved
    b[size - 2][size - 2] = 0;
    return b;
  }

  function initGame() {
    mazeSize = parseInt(diffSelect.value, 10);
    grid = generateMaze(mazeSize);
    player = { r: 1, c: 1 };
    goal = { r: mazeSize - 2, c: mazeSize - 2 };
    trail = ['1-1'];
    steps = 0;
    timerSeconds = 0;
    isGameOver = false;

    updateUI();
    render();
    hideModal();
    startTimer();
    saveState();
  }

  function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(function () {
      if (!isGameOver) {
        timerSeconds++;
        updateTimerDisplay();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    var m = Math.floor(timerSeconds / 60);
    var s = timerSeconds % 60;
    timerText.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function updateUI() {
    stepsText.textContent = steps;
    updateTimerDisplay();
  }

  function move(dr, dc) {
    if (isGameOver) return;
    var nr = player.r + dr;
    var nc = player.c + dc;

    if (nr >= 0 && nr < mazeSize && nc >= 0 && nc < mazeSize && grid[nr][nc] === 0) {
      player.r = nr;
      player.c = nc;
      steps++;
      var key = nr + '-' + nc;
      if (trail.indexOf(key) === -1) {
        trail.push(key);
      }
      playSound('step');
      updateUI();
      render();

      if (player.r === goal.r && player.c === goal.c) {
        handleVictory();
      }
      saveState();
    } else {
      playSound('bump');
    }
  }

  function handleVictory() {
    isGameOver = true;
    clearInterval(timerInterval);
    playSound('win');

    modalEmoji.textContent = '🏁';
    modalTitle.textContent = '走出迷宫！顺利通关！';
    modalDesc.textContent = '用时 ' + timerText.textContent + ' · 移动 ' + steps + ' 步抵达终点！';
    setTimeout(function () {
      modal.classList.add('show');
    }, 400);
  }

  function hideModal() {
    modal.classList.remove('show');
  }

  function render() {
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    var cellSize = w / mazeSize;

    // Draw paths & walls
    for (var r = 0; r < mazeSize; r++) {
      for (var c = 0; c < mazeSize; c++) {
        var x = c * cellSize;
        var y = r * cellSize;

        if (grid[r][c] === 1) {
          // Wall
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(x, y, cellSize, cellSize);
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, cellSize, cellSize);
        } else {
          // Path
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x, y, cellSize, cellSize);

          // Footsteps trail
          if (trail.indexOf(r + '-' + c) !== -1) {
            ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
            ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
          }
        }
      }
    }

    // Draw Goal (flag/portal)
    var gx = goal.c * cellSize;
    var gy = goal.r * cellSize;
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(gx + cellSize / 2, gy + cellSize / 2, cellSize * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = Math.round(cellSize * 0.5) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏁', gx + cellSize / 2, gy + cellSize / 2);

    // Draw Player
    var px = player.c * cellSize;
    var py = player.r * cellSize;
    ctx.save();
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Fog of War effect
    if (fogMode) {
      var playerCenterX = px + cellSize / 2;
      var playerCenterY = py + cellSize / 2;
      var visionRadius = cellSize * 2.8;

      var grad = ctx.createRadialGradient(
        playerCenterX, playerCenterY, visionRadius * 0.5,
        playerCenterX, playerCenterY, visionRadius
      );
      grad.addColorStop(0, 'rgba(15, 23, 42, 0)');
      grad.addColorStop(1, 'rgba(15, 23, 42, 0.96)');

      ctx.save();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Darken outside vision completely
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(playerCenterX, playerCenterY, visionRadius, 0, Math.PI * 2, true);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.restore();
    }
  }

  function saveState() {
    try {
      var state = {
        mazeSize: mazeSize,
        grid: grid,
        player: player,
        goal: goal,
        trail: trail,
        steps: steps,
        fogMode: fogMode,
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
          mazeSize = state.mazeSize || 11;
          grid = state.grid;
          player = state.player || { r: 1, c: 1 };
          goal = state.goal || { r: mazeSize - 2, c: mazeSize - 2 };
          trail = state.trail || [];
          steps = state.steps || 0;
          fogMode = !!state.fogMode;
          isGameOver = !!state.isGameOver;

          diffSelect.value = mazeSize;
          fogBtn.classList.toggle('active', fogMode);
          fogBtn.textContent = '🌫️ 迷雾: ' + (fogMode ? '开' : '关');
          updateUI();
          render();
          if (!isGameOver) startTimer();
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // Keyboard handlers
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      move(-1, 0);
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.preventDefault();
      move(1, 0);
    } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      move(0, -1);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      move(0, 1);
    }
  });

  // Touch Swipe
  var touchStartX = 0;
  var touchStartY = 0;
  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length > 0) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  canvas.addEventListener('touchend', function (e) {
    if (e.changedTouches.length > 0) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      var dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > 20 || Math.abs(dy) > 20) {
        if (Math.abs(dx) > Math.abs(dy)) {
          move(0, dx > 0 ? 1 : -1);
        } else {
          move(dy > 0 ? 1 : -1, 0);
        }
      }
    }
  });

  // D-Pad handlers
  document.querySelectorAll('.dpad-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var dir = btn.dataset.dir;
      if (dir === 'up') move(-1, 0);
      else if (dir === 'down') move(1, 0);
      else if (dir === 'left') move(0, -1);
      else if (dir === 'right') move(0, 1);
    });
  });

  diffSelect.addEventListener('change', initGame);
  restartBtn.addEventListener('click', initGame);
  modalActionBtn.addEventListener('click', function () {
    hideModal();
    initGame();
  });

  fogBtn.addEventListener('click', function () {
    fogMode = !fogMode;
    fogBtn.classList.toggle('active', fogMode);
    fogBtn.textContent = '🌫️ 迷雾: ' + (fogMode ? '开' : '关');
    render();
    saveState();
  });

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  // Init
  if (!loadState()) {
    initGame();
  }
})();
