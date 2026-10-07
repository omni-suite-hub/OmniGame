// Slope 3D (下坡疾驰) - OmniGame Downhill Rolling Engine
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
  var CY = 160;
  var RUNWAY_WIDTH = 120; // -60 to +60

  var isPlaying = false;
  var isDead = false;
  var distance = 0;
  var bestDist = 0;
  var baseSpeed = 6.0;
  var speed = 6.0;

  var ball = {
    x: 0,
    vx: 0,
    y: 0,
    z: 0,
    radius: 12,
    rollAngle: 0
  };

  var keyState = { left: false, right: false };
  var obstacles = [];
  var spawnZ = 200;

  function initGame() {
    isPlaying = false;
    isDead = false;
    distance = 0;
    speed = baseSpeed;

    ball.x = 0;
    ball.vx = 0;
    ball.y = 0;
    ball.z = 0;
    ball.rollAngle = 0;

    obstacles = [];
    spawnZ = 200;
    // Pre-populate obstacles ahead
    for (var k = 0; k < 12; k++) {
      spawnObstacleAhead();
    }

    overlayHintEl.style.display = 'block';
    modalEl.classList.remove('active');
    updateStatsUI();
  }

  function updateStatsUI() {
    distTextEl.textContent = Math.floor(distance) + 'm';
    speedTextEl.textContent = Math.floor(speed * 10) + 'km/h';
    if (distance > bestDist) {
      bestDist = distance;
      bestTextEl.textContent = Math.floor(bestDist) + 'm';
    }
  }

  function spawnObstacleAhead() {
    spawnZ += 60 + Math.random() * 40;
    var ox = (Math.random() - 0.5) * (RUNWAY_WIDTH - 24);
    obstacles.push({
      x: ox,
      z: spawnZ,
      w: 22,
      h: 22
    });
  }

  function project(x, y, relZ) {
    // relZ from 10 to 450
    var scale = 160 / (relZ + 160);
    var sx = CX + x * scale * 2.2;
    // Downhill pitch: y offset descends with relZ
    var sy = CY + (relZ * 0.45 + y) * scale * 2.2;
    return { x: sx, y: sy, scale: scale };
  }

  function startGame() {
    if (isDead) return;
    initAudio();
    isPlaying = true;
    overlayHintEl.style.display = 'none';
  }

  function crash(reason) {
    isDead = true;
    isPlaying = false;
    playCrashSound();
    modalDescEl.textContent = '极限疾驰 ' + Math.floor(distance) + ' 米！' + (reason ? ' (' + reason + ')' : '');
    modalEl.classList.add('active');
  }

  function update() {
    if (!isPlaying || isDead) return;

    distance += speed * 0.06;
    speed = baseSpeed + Math.min(8, distance * 0.005);
    updateStatsUI();

    ball.z += speed;
    ball.rollAngle += 0.2;

    // Steering
    var steer = 0.55;
    if (keyState.left) ball.vx -= steer;
    if (keyState.right) ball.vx += steer;
    ball.vx *= 0.88; // Damping
    ball.x += ball.vx;

    // Falling off the edge check
    if (Math.abs(ball.x) > RUNWAY_WIDTH / 2 + 10) {
      ball.y += 8; // Ball plunges down
      if (ball.y > 50) {
        crash('跌落悬崖');
        return;
      }
    }

    // Spawn more obstacles ahead
    while (spawnZ < ball.z + 500) {
      spawnObstacleAhead();
    }

    // Check Obstacle Collisions
    for (var i = obstacles.length - 1; i >= 0; i--) {
      var ob = obstacles[i];
      var relZ = ob.z - ball.z;

      // Close to ball
      if (relZ < 15 && relZ > -10) {
        if (Math.abs(ball.x - ob.x) < (ob.w / 2 + ball.radius * 0.6)) {
          crash('撞击红色障碍');
          return;
        }
      }

      if (relZ < -40) {
        obstacles.splice(i, 1);
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Deep neon wireframe void
    ctx.fillStyle = '#022c22';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid stars/lines in background
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.1)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < canvas.width; gx += 30) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, canvas.height);
      ctx.stroke();
    }

    // Draw Slope Runway Segments
    var numSegments = 16;
    var segLen = 30;
    var zOffset = ball.z % segLen;

    for (var s = 0; s < numSegments; s++) {
      var zNear = s * segLen - zOffset;
      var zFar = (s + 1) * segLen - zOffset;
      if (zNear < 0) continue;

      var pLeftNear = project(-RUNWAY_WIDTH / 2, 0, zNear);
      var pRightNear = project(RUNWAY_WIDTH / 2, 0, zNear);
      var pLeftFar = project(-RUNWAY_WIDTH / 2, 0, zFar);
      var pRightFar = project(RUNWAY_WIDTH / 2, 0, zFar);

      ctx.fillStyle = (s % 2 === 0) ? '#064e3b' : '#047857';
      ctx.beginPath();
      ctx.moveTo(pLeftNear.x, pLeftNear.y);
      ctx.lineTo(pRightNear.x, pRightNear.y);
      ctx.lineTo(pRightFar.x, pRightFar.y);
      ctx.lineTo(pLeftFar.x, pLeftFar.y);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Draw Obstacles (sorted by Z descending)
    var sorted = obstacles.slice().sort(function (a, b) { return b.z - a.z; });

    sorted.forEach(function (ob) {
      var relZ = ob.z - ball.z;
      if (relZ < 0 || relZ > 450) return;

      var p = project(ob.x, 0, relZ);
      var bw = ob.w * p.scale * 2.2;
      var bh = ob.h * p.scale * 2.2;

      // Red 3D Barrier Block
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(p.x - bw / 2, p.y - bh, bw, bh);

      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x - bw / 2, p.y - bh, bw, bh);

      // Top face
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.moveTo(p.x - bw / 2, p.y - bh);
      ctx.lineTo(p.x, p.y - bh - 6 * p.scale);
      ctx.lineTo(p.x + bw / 2, p.y - bh);
      ctx.closePath();
      ctx.fill();
    });

    // Draw Rolling Ball at near plane
    var bp = project(ball.x, ball.y, 25);
    var bRadius = ball.radius * bp.scale * 2.2;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(bp.x, bp.y + 2, bRadius * 0.9, bRadius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ball sphere gradient
    var bGrad = ctx.createRadialGradient(bp.x - bRadius * 0.3, bp.y - bRadius - bRadius * 0.3, bRadius * 0.2, bp.x, bp.y - bRadius, bRadius);
    bGrad.addColorStop(0, '#fef08a');
    bGrad.addColorStop(0.7, '#10b981');
    bGrad.addColorStop(1, '#047857');

    ctx.fillStyle = bGrad;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y - bRadius, bRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  // Input Listeners
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

  btnLeft.addEventListener('pointerdown', function () { keyState.left = true; startGame(); });
  btnLeft.addEventListener('pointerup', function () { keyState.left = false; });
  btnLeft.addEventListener('pointercancel', function () { keyState.left = false; });

  btnRight.addEventListener('pointerdown', function () { keyState.right = true; startGame(); });
  btnRight.addEventListener('pointerup', function () { keyState.right = false; });
  btnRight.addEventListener('pointercancel', function () { keyState.right = false; });

  canvas.addEventListener('pointerdown', function (e) {
    startGame();
    var rect = canvas.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width / 2) {
      keyState.left = true;
    } else {
      keyState.right = true;
    }
  });

  window.addEventListener('pointerup', function () {
    keyState.left = false;
    keyState.right = false;
  });

  restartBtn.addEventListener('click', initGame);
  modalRestartBtn.addEventListener('click', initGame);
  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  initGame();
  loop();
})();
