// games/dancing-line/game.js - Dancing Line (跳舞的线)
(function() {
  'use strict';

  var audioCtx = null;
  function getAudio() {
    if (!audioCtx) {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Melodic scale for rhythmic turns
  var MELODY = [
    261.63, 329.63, 392.00, 523.25, 493.88, 392.00, 329.63, 293.66,
    329.63, 392.00, 440.00, 523.25, 659.25, 587.33, 523.25, 392.00
  ];

  function playTurnSound(index) {
    try {
      var ctx = getAudio();
      if (!ctx) return;
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      var freq = MELODY[index % MELODY.length];
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } catch(e) {}
  }

  function playGemSound() {
    try {
      var ctx = getAudio();
      if (!ctx) return;
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046, now);
      osc.frequency.exponentialRampToValueAtTime(1567, now + 0.1);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch(e) {}
  }

  function playCrashSound() {
    try {
      var ctx = getAudio();
      if (!ctx) return;
      var now = ctx.currentTime;
      var bufferSize = ctx.sampleRate * 0.25;
      var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      var noise = ctx.createBufferSource();
      noise.buffer = buffer;
      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(500, now);
      filter.frequency.exponentialRampToValueAtTime(40, now + 0.25);
      noise.connect(filter);
      var gain = ctx.createGain();
      filter.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
      noise.start(now);
      noise.stop(now + 0.25);
    } catch(e) {}
  }

  function playWinSound() {
    try {
      var ctx = getAudio();
      if (!ctx) return;
      var now = ctx.currentTime;
      [523, 659, 784, 1046].forEach(function(f, idx) {
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(f, now + idx * 0.08);
        g.gain.setValueAtTime(0.2, now + idx * 0.08);
        g.gain.linearRampToValueAtTime(0.01, now + idx * 0.08 + 0.16);
        o.start(now + idx * 0.08);
        o.stop(now + idx * 0.08 + 0.16);
      });
    } catch(e) {}
  }

  // DOM
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var progressEl = document.getElementById('progress-el');
  var gemsEl = document.getElementById('gems-el');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc = document.getElementById('modal-desc');
  var btnRestart = document.getElementById('btn-restart');

  var CANVAS_W = 420;
  var CANVAS_H = 600;

  function resizeCanvas() {
    var container = document.getElementById('container');
    var maxW = container.clientWidth - 20;
    var maxH = container.clientHeight - 20;
    var scale = Math.min(maxW / CANVAS_W, maxH / CANVAS_H, 1.25);
    scale = Math.max(0.65, scale);
    canvas.width = Math.floor(CANVAS_W * scale);
    canvas.height = Math.floor(CANVAS_H * scale);
  }
  window.addEventListener('resize', resizeCanvas);

  var isGameOver = false;
  var hasStarted = false;
  var gemsCount = 0;
  var turnCount = 0;
  var lastTime = 0;

  var lineHead = { x: 0, y: 0 };
  var currentDir = 1; // 1 = right-up (+x, -y), -1 = left-up (-x, -y)
  var linePath = []; // corners
  var speed = 190;
  var ROAD_HALF_WIDTH = 26;

  // Track waypoints definition
  var waypoints = [];
  var roadPolygons = [];
  var gems = [];
  var totalTrackLength = 0;

  function buildTrack() {
    waypoints = [
      { x: 0, y: 0 },
      { x: 120, y: -120 },
      { x: 0, y: -240 },
      { x: 140, y: -380 },
      { x: -40, y: -560 },
      { x: 120, y: -720 },
      { x: -20, y: -860 },
      { x: 160, y: -1040 },
      { x: 0, y: -1200 },
      { x: 120, y: -1320 },
      { x: -60, y: -1500 },
      { x: 100, y: -1660 } // Finish Line
    ];

    roadPolygons = [];
    gems = [];
    totalTrackLength = 0;

    for (var i = 0; i < waypoints.length - 1; i++) {
      var p1 = waypoints[i];
      var p2 = waypoints[i + 1];
      var dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      totalTrackLength += dist;

      // Add a gem near waypoint turn
      if (i > 0 && i < waypoints.length - 1) {
        gems.push({ x: p1.x, y: p1.y, collected: false });
      }
    }
  }

  function initGame() {
    isGameOver = false;
    hasStarted = false;
    gemsCount = 0;
    turnCount = 0;

    buildTrack();

    lineHead = { x: 0, y: 0 };
    currentDir = 1; // start moving towards (120, -120)
    linePath = [{ x: 0, y: 0 }];

    updateHUD();
  }

  function updateHUD() {
    var traveled = Math.abs(lineHead.y);
    var finishY = Math.abs(waypoints[waypoints.length - 1].y);
    var pct = Math.min(100, Math.floor((traveled / finishY) * 100));

    progressEl.textContent = pct + '%';
    gemsEl.textContent = gemsCount;
  }

  function turn() {
    if (isGameOver) return;
    if (!hasStarted) hasStarted = true;

    // Record corner
    linePath.push({ x: lineHead.x, y: lineHead.y });
    currentDir = -currentDir; // 90-degree turn
    turnCount++;
    playTurnSound(turnCount);
  }

  // Distance from point to line segment
  function distToSegment(px, py, x1, y1, x2, y2) {
    var l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    var t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }

  function isPointOnRoad(px, py) {
    // Check distance to any road centerline segment
    for (var i = 0; i < waypoints.length - 1; i++) {
      var p1 = waypoints[i];
      var p2 = waypoints[i + 1];
      if (distToSegment(px, py, p1.x, p1.y, p2.x, p2.y) <= ROAD_HALF_WIDTH) {
        return true;
      }
    }
    return false;
  }

  function updatePhysics(dt) {
    if (!hasStarted || isGameOver) return;

    var invSqrt2 = 0.7071;
    var vx = currentDir * speed * invSqrt2;
    var vy = -speed * invSqrt2;

    lineHead.x += vx * dt;
    lineHead.y += vy * dt;

    // Check collision off-road
    if (!isPointOnRoad(lineHead.x, lineHead.y)) {
      gameOver(false, '脱离赛道跌入虚空！');
      return;
    }

    // Check finish line
    var finish = waypoints[waypoints.length - 1];
    if (lineHead.y <= finish.y) {
      gameOver(true, '100% 舞动冲过终点！');
      return;
    }

    // Check gems
    gems.forEach(function(g) {
      if (!g.collected && Math.hypot(g.x - lineHead.x, g.y - lineHead.y) < 22) {
        g.collected = true;
        gemsCount += 10;
        playGemSound();
        updateHUD();
      }
    });

    updateHUD();
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var w = canvas.width;
    var h = canvas.height;

    // Camera follow line head
    var camX = lineHead.x - w * 0.5;
    var camY = lineHead.y - h * 0.68;

    ctx.save();
    ctx.translate(-camX, -camY);

    // 1. Draw Floating Road (corridor mesh)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Road shadow
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = ROAD_HALF_WIDTH * 2 + 10;
    ctx.beginPath();
    ctx.moveTo(waypoints[0].x, waypoints[0].y + 12);
    for (var r1 = 1; r1 < waypoints.length; r1++) {
      ctx.lineTo(waypoints[r1].x, waypoints[r1].y + 12);
    }
    ctx.stroke();

    // Road Surface
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = ROAD_HALF_WIDTH * 2;
    ctx.beginPath();
    ctx.moveTo(waypoints[0].x, waypoints[0].y);
    for (var r2 = 1; r2 < waypoints.length; r2++) {
      ctx.lineTo(waypoints[r2].x, waypoints[r2].y);
    }
    ctx.stroke();

    // Road border edges
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 2. Finish Arch
    var finish = waypoints[waypoints.length - 1];
    ctx.fillStyle = '#facc15';
    ctx.font = '32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏁', finish.x, finish.y - 10);

    // 3. Gems
    gems.forEach(function(g) {
      if (!g.collected) {
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💎', g.x, g.y);
      }
    });

    // 4. Dancing Line Body
    if (linePath.length > 0) {
      // Glow ribbon
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(linePath[0].x, linePath[0].y);
      for (var lp = 1; lp < linePath.length; lp++) {
        ctx.lineTo(linePath[lp].x, linePath[lp].y);
      }
      ctx.lineTo(lineHead.x, lineHead.y);
      ctx.stroke();

      // Main line
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(linePath[0].x, linePath[0].y);
      for (var lp2 = 1; lp2 < linePath.length; lp2++) {
        ctx.lineTo(linePath[lp2].x, linePath[lp2].y);
      }
      ctx.lineTo(lineHead.x, lineHead.y);
      ctx.stroke();

      // Line Head cursor
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(lineHead.x, lineHead.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function gameOver(won, msg) {
    isGameOver = true;
    if (won) playWinSound();
    else playCrashSound();

    modalTitle.textContent = won ? '🏆 完美合奏！' : '💥 节奏中断！';
    modalTitle.style.color = won ? '#38bdf8' : '#ef4444';
    modalDesc.textContent = msg;
    modal.classList.remove('hidden');
  }

  function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    var dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (dt > 0.1) dt = 0.1;

    updatePhysics(dt);
    render();
    requestAnimationFrame(gameLoop);
  }

  // Inputs
  canvas.addEventListener('click', turn);
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    turn();
  }, { passive: false });

  window.addEventListener('keydown', function(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      turn();
    }
  });

  btnRestart.addEventListener('click', function() {
    modal.classList.add('hidden');
    initGame();
  });

  resizeCanvas();
  initGame();
  requestAnimationFrame(gameLoop);

})();
