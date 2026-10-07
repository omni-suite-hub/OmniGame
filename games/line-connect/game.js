// Line Connect (色线连接 / Flow Free) - OmniGame Engine
(function () {
  'use strict';

  var audioCtx = null;
  var soundEnabled = true;

  function initAudio() {
    if (!audioCtx) {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playTone(freq, dur, type, gain) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;
    try {
      var osc = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      g.gain.setValueAtTime(gain || 0.12, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (e) {}
  }

  function playFlowSound() { playTone(440 + Math.random() * 100, 0.04, 'sine', 0.08); }
  function playConnectedSound() {
    playTone(587.33, 0.1, 'triangle', 0.15);
    setTimeout(function () { playTone(880, 0.15, 'triangle', 0.18); }, 60);
  }
  function playWinSound() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { playTone(f, 0.25, 'triangle', 0.2); }, i * 110);
    });
  }

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var levelTextEl = document.getElementById('levelText');
  var flowTextEl = document.getElementById('flowText');
  var coverageTextEl = document.getElementById('coverageText');
  var resetLevelBtn = document.getElementById('resetLevelBtn');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalNextBtn = document.getElementById('modalNextBtn');

  var COLOR_MAP = {
    red: '#ef4444',
    blue: '#3b82f6',
    green: '#10b981',
    yellow: '#f59e0b',
    orange: '#ea580c',
    purple: '#a855f7'
  };

  var LEVELS = [
    // Level 1: 5x5
    {
      size: 5,
      pairs: [
        { color: 'red', p1: [0, 0], p2: [4, 1] },
        { color: 'blue', p1: [0, 4], p2: [3, 3] },
        { color: 'green', p1: [1, 1], p2: [4, 4] },
        { color: 'yellow', p1: [1, 2], p2: [3, 1] },
        { color: 'orange', p1: [2, 2], p2: [4, 2] }
      ]
    },
    // Level 2: 5x5
    {
      size: 5,
      pairs: [
        { color: 'red', p1: [0, 1], p2: [4, 3] },
        { color: 'blue', p1: [0, 3], p2: [3, 0] },
        { color: 'green', p1: [1, 2], p2: [4, 1] },
        { color: 'yellow', p1: [1, 4], p2: [4, 4] },
        { color: 'purple', p1: [2, 1], p2: [3, 3] }
      ]
    },
    // Level 3: 6x6
    {
      size: 6,
      pairs: [
        { color: 'red', p1: [0, 0], p2: [5, 1] },
        { color: 'blue', p1: [0, 5], p2: [4, 4] },
        { color: 'green', p1: [1, 1], p2: [5, 5] },
        { color: 'yellow', p1: [1, 3], p2: [4, 1] },
        { color: 'orange', p1: [2, 2], p2: [5, 3] },
        { color: 'purple', p1: [2, 4], p2: [4, 2] }
      ]
    }
  ];

  var currentLevelIdx = 0;
  var gridSize = 5;
  var cellSize = 64;
  var currentPairs = [];

  // paths[color] = [ [r, c], [r, c], ... ]
  var paths = {};
  var isDrawing = false;
  var activeColor = null;

  function initLevel(lvlIdx) {
    currentLevelIdx = lvlIdx % LEVELS.length;
    var lvl = LEVELS[currentLevelIdx];
    gridSize = lvl.size;
    cellSize = canvas.width / gridSize;
    currentPairs = lvl.pairs;

    paths = {};
    currentPairs.forEach(function (pair) {
      paths[pair.color] = [];
    });

    isDrawing = false;
    activeColor = null;

    levelTextEl.textContent = '第 ' + (currentLevelIdx + 1) + ' 关 (' + gridSize + '×' + gridSize + ')';
    modalEl.classList.remove('active');
    updateStatsUI();
    render();
  }

  function getEndpointAt(r, c) {
    for (var i = 0; i < currentPairs.length; i++) {
      var p = currentPairs[i];
      if ((p.p1[0] === r && p.p1[1] === c) || (p.p2[0] === r && p.p2[1] === c)) {
        return p;
      }
    }
    return null;
  }

  function getPathOwner(r, c) {
    for (var col in paths) {
      var arr = paths[col];
      for (var k = 0; k < arr.length; k++) {
        if (arr[k][0] === r && arr[k][1] === c) return col;
      }
    }
    return null;
  }

  function isConnected(color) {
    var p = currentPairs.find(function (pr) { return pr.color === color; });
    if (!p) return false;
    var arr = paths[color];
    if (arr.length < 2) return false;

    var head = arr[0];
    var tail = arr[arr.length - 1];

    var match1 = (head[0] === p.p1[0] && head[1] === p.p1[1] && tail[0] === p.p2[0] && tail[1] === p.p2[1]);
    var match2 = (head[0] === p.p2[0] && head[1] === p.p2[1] && tail[0] === p.p1[0] && tail[1] === p.p1[1]);
    return match1 || match2;
  }

  function updateStatsUI() {
    var connCount = 0;
    currentPairs.forEach(function (p) {
      if (isConnected(p.color)) connCount++;
    });

    var coveredCells = 0;
    for (var r = 0; r < gridSize; r++) {
      for (var c = 0; c < gridSize; c++) {
        if (getPathOwner(r, c) || getEndpointAt(r, c)) {
          coveredCells++;
        }
      }
    }

    var totalCells = gridSize * gridSize;
    var pct = Math.min(100, Math.floor((coveredCells / totalCells) * 100));

    flowTextEl.textContent = connCount + '/' + currentPairs.length;
    coverageTextEl.textContent = pct + '%';

    // Win condition: All pairs connected AND 100% coverage
    if (connCount === currentPairs.length && pct === 100) {
      setTimeout(function () {
        playWinSound();
        modalEl.classList.add('active');
      }, 200);
    }
  }

  function startDraw(e) {
    initAudio();
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var c = Math.floor(x / cellSize);
    var r = Math.floor(y / cellSize);

    if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) return;

    var ep = getEndpointAt(r, c);
    var owner = getPathOwner(r, c);

    if (ep) {
      activeColor = ep.color;
      isDrawing = true;
      paths[activeColor] = [[r, c]];
      playFlowSound();
      render();
    } else if (owner) {
      activeColor = owner;
      isDrawing = true;
      // Truncate path up to this cell
      var arr = paths[activeColor];
      var idx = arr.findIndex(function (pt) { return pt[0] === r && pt[1] === c; });
      if (idx >= 0) {
        paths[activeColor] = arr.slice(0, idx + 1);
      }
      playFlowSound();
      render();
    }
  }

  function continueDraw(e) {
    if (!isDrawing || !activeColor) return;
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var c = Math.floor(x / cellSize);
    var r = Math.floor(y / cellSize);

    if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) return;

    var path = paths[activeColor];
    if (path.length === 0) return;
    var last = path[path.length - 1];

    if (last[0] === r && last[1] === c) return; // Same cell

    // Must be adjacent (manhattan distance = 1)
    var dr = Math.abs(last[0] - r);
    var dc = Math.abs(last[1] - c);
    if (dr + dc !== 1) return;

    // If backtracking
    if (path.length >= 2 && path[path.length - 2][0] === r && path[path.length - 2][1] === c) {
      path.pop();
      playFlowSound();
      render();
      updateStatsUI();
      return;
    }

    // Check if cell already belongs to another path -> erase other path
    var otherOwner = getPathOwner(r, c);
    if (otherOwner && otherOwner !== activeColor) {
      paths[otherOwner] = [];
    }

    // Check endpoint
    var ep = getEndpointAt(r, c);
    if (ep && ep.color !== activeColor) return; // Cannot cross other endpoint

    // Add to path
    path.push([r, c]);
    playFlowSound();

    if (ep && ep.color === activeColor) {
      // Reached destination endpoint!
      isDrawing = false;
      playConnectedSound();
    }

    render();
    updateStatsUI();
  }

  function endDraw() {
    isDrawing = false;
    activeColor = null;
    updateStatsUI();
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Grid Lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (var i = 0; i <= gridSize; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, canvas.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(canvas.width, i * cellSize);
      ctx.stroke();
    }

    // Draw Paths (Pipes)
    for (var color in paths) {
      var arr = paths[color];
      if (arr.length >= 2) {
        ctx.strokeStyle = COLOR_MAP[color] || '#fff';
        ctx.lineWidth = cellSize * 0.35;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        for (var p = 0; p < arr.length; p++) {
          var px = arr[p][1] * cellSize + cellSize / 2;
          var py = arr[p][0] * cellSize + cellSize / 2;
          if (p === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }

    // Draw Endpoints (Glowing Circles)
    currentPairs.forEach(function (pair) {
      var hex = COLOR_MAP[pair.color] || '#fff';
      [pair.p1, pair.p2].forEach(function (pt) {
        var ex = pt[1] * cellSize + cellSize / 2;
        var ey = pt[0] * cellSize + cellSize / 2;
        var rad = cellSize * 0.32;

        ctx.fillStyle = hex;
        ctx.beginPath();
        ctx.arc(ex, ey, rad, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
      });
    });
  }

  // Pointer Events
  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    startDraw(e);
  });
  canvas.addEventListener('pointermove', continueDraw);
  canvas.addEventListener('pointerup', function (e) {
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    endDraw();
  });
  canvas.addEventListener('pointercancel', endDraw);

  resetLevelBtn.addEventListener('click', function () { initLevel(currentLevelIdx); });
  restartBtn.addEventListener('click', function () { initLevel(currentLevelIdx + 1); });
  modalNextBtn.addEventListener('click', function () { initLevel(currentLevelIdx + 1); });

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  initLevel(0);
})();
