// Tunnel Rush (隧道冲刺) - OmniGame 360° Cylindrical Engine
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

  function playPassSound() {
    playTone(660, 0.05, 'triangle', 0.1);
  }
  function playCrashSound() {
    playTone(130, 0.3, 'sawtooth', 0.3);
    setTimeout(function () { playTone(70, 0.4, 'square', 0.35); }, 80);
  }

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var distTextEl = document.getElementById('distText');
  var speedTextEl = document.getElementById('speedText');
  var bestTextEl = document.getElementById('bestText');
  var overlayHintEl = document.getElementById('overlayHint');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalDescEl = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  var btnLeft = document.getElementById('btnLeft');
  var btnRight = document.getElementById('btnRight');

  var CX = 180;
  var CY = 190;
  var MAX_RADIUS = 145;

  var isPlaying = false;
  var isDead = false;
  var distance = 0;
  var bestDist = 0;
  var baseSpeed = 5.0;
  var speed = 5.0;

  var playerAngle = -Math.PI / 2; // Starts at top
  var keyState = { left: false, right: false };

  var obstacles = [];
  var spawnTimer = 0;
  var tunnelSpin = 0;

  var COLORS = ['#ec4899', '#38bdf8', '#f59e0b', '#10b981', '#a855f7', '#f43f5e'];

  function initGame() {
    isPlaying = false;
    isDead = false;
    distance = 0;
    speed = baseSpeed;
    playerAngle = -Math.PI / 2;
    obstacles = [];
    spawnTimer = 0;
    tunnelSpin = 0;

    overlayHintEl.style.display = 'block';
    modalEl.classList.remove('active');
    updateStatsUI();
  }

  function updateStatsUI() {
    distTextEl.textContent = Math.floor(distance) + 'm';
    speedTextEl.textContent = (speed / baseSpeed).toFixed(1) + 'x';
    if (distance > bestDist) {
      bestDist = distance;
      bestTextEl.textContent = Math.floor(bestDist) + 'm';
    }
  }

  function spawnObstacle() {
    spawnTimer++;
    if (spawnTimer < 42) return;
    spawnTimer = 0;

    // Obstacle covers an arc of size (PI * 0.7 to PI * 1.3)
    var arcSpan = Math.PI * (0.8 + Math.random() * 0.5);
    var startAngle = Math.random() * Math.PI * 2;
    var rotSpeed = (Math.random() - 0.5) * 0.04;
    var color = COLORS[Math.floor(Math.random() * COLORS.length)];

    obstacles.push({
      z: 500,
      startAngle: startAngle,
      arcSpan: arcSpan,
      rotSpeed: rotSpeed,
      color: color,
      passed: false
    });
  }

  function normalizeAngle(a) {
    while (a < 0) a += Math.PI * 2;
    while (a >= Math.PI * 2) a -= Math.PI * 2;
    return a;
  }

  function isAngleInArc(angle, start, span) {
    var a = normalizeAngle(angle);
    var s = normalizeAngle(start);
    var end = s + span;

    if (end < Math.PI * 2) {
      return a >= s && a <= end;
    } else {
      return a >= s || a <= (end % (Math.PI * 2));
    }
  }

  function startGame() {
    if (isDead) return;
    initAudio();
    isPlaying = true;
    overlayHintEl.style.display = 'none';
  }

  function crash() {
    isDead = true;
    isPlaying = false;
    playCrashSound();
    modalDescEl.textContent = '极限冲刺 ' + Math.floor(distance) + ' 米！';
    modalEl.classList.add('active');
  }

  function update() {
    if (!isPlaying || isDead) return;

    distance += speed * 0.06;
    speed = baseSpeed + Math.min(6, distance * 0.005);
    tunnelSpin += 0.02;
    updateStatsUI();

    // Player Rotation
    var rotDelta = 0.065;
    if (keyState.left) playerAngle -= rotDelta;
    if (keyState.right) playerAngle += rotDelta;

    spawnObstacle();

    // Move Obstacles
    for (var i = obstacles.length - 1; i >= 0; i--) {
      var ob = obstacles[i];
      ob.z -= speed;
      ob.startAngle += ob.rotSpeed;

      // Pass check
      if (!ob.passed && ob.z < 20) {
        ob.passed = true;
        playPassSound();
      }

      // Collision range: z between -10 and 20
      if (ob.z < 20 && ob.z > -12) {
        if (isAngleInArc(playerAngle, ob.startAngle, ob.arcSpan)) {
          crash();
          return;
        }
      }

      if (ob.z < -40) {
        obstacles.splice(i, 1);
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Deep void center
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Concentric Tunnel Rings
    var numRings = 10;
    for (var r = 1; r <= numRings; r++) {
      var scale = r / numRings;
      var radius = MAX_RADIUS * scale;

      ctx.strokeStyle = 'rgba(56, 189, 248, ' + (0.1 + scale * 0.3) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(CX, CY, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Tunnel Radial Spokes (rotating with speed)
    var numSpokes = 8;
    for (var s = 0; s < numSpokes; s++) {
      var spokeAngle = tunnelSpin + (s * Math.PI * 2) / numSpokes;
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(spokeAngle) * 15, CY + Math.sin(spokeAngle) * 15);
      ctx.lineTo(CX + Math.cos(spokeAngle) * MAX_RADIUS, CY + Math.sin(spokeAngle) * MAX_RADIUS);
      ctx.stroke();
    }

    // Sort Obstacles by Z descending (far to near)
    var sorted = obstacles.slice().sort(function (a, b) { return b.z - a.z; });

    sorted.forEach(function (ob) {
      if (ob.z > 500 || ob.z < -20) return;
      var scale = 200 / (ob.z + 200);
      var radius = MAX_RADIUS * scale;

      ctx.fillStyle = ob.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(CX, CY, radius, ob.startAngle, ob.startAngle + ob.arcSpan);
      ctx.lineTo(CX, CY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    // Draw Player Craft on near ring
    var pr = MAX_RADIUS - 12;
    var px = CX + Math.cos(playerAngle) * pr;
    var py = CY + Math.sin(playerAngle) * pr;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(playerAngle + Math.PI / 2);

    // Neon triangle arrow
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(10, 10);
    ctx.lineTo(0, 6);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Engine exhaust glow
    ctx.fillStyle = '#ec4899';
    ctx.beginPath();
    ctx.arc(0, 9, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  // Keyboard controls
  window.addEventListener('keydown', function (e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      e.preventDefault();
      keyState.left = true;
      if (!isPlaying) startGame();
    }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      e.preventDefault();
      keyState.right = true;
      if (!isPlaying) startGame();
    }
  });

  window.addEventListener('keyup', function (e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyState.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keyState.right = false;
  });

  // Touch pad buttons
  btnLeft.addEventListener('pointerdown', function () { keyState.left = true; startGame(); });
  btnLeft.addEventListener('pointerup', function () { keyState.left = false; });
  btnLeft.addEventListener('pointercancel', function () { keyState.left = false; });

  btnRight.addEventListener('pointerdown', function () { keyState.right = true; startGame(); });
  btnRight.addEventListener('pointerup', function () { keyState.right = false; });
  btnRight.addEventListener('pointercancel', function () { keyState.right = false; });

  // Pointer drag on canvas
  canvas.addEventListener('pointerdown', function (e) {
    startGame();
    updatePointerAngle(e);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (e.buttons > 0) updatePointerAngle(e);
  });

  function updatePointerAngle(e) {
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left - CX;
    var y = e.clientY - rect.top - CY;
    playerAngle = Math.atan2(y, x);
  }

  restartBtn.addEventListener('click', initGame);
  modalRestartBtn.addEventListener('click', initGame);
  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  initGame();
  loop();
})();
