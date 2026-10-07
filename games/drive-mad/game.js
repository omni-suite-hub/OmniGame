// Drive Mad (疯狂驾驶) - OmniGame Off-Road Truck Physics Engine
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

  function playEngineSound() { playTone(80 + Math.random() * 40, 0.05, 'sawtooth', 0.08); }
  function playCrashSound() {
    playTone(100, 0.35, 'sawtooth', 0.28);
    setTimeout(function () { playTone(50, 0.45, 'square', 0.3); }, 80);
  }
  function playWinSound() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { playTone(f, 0.25, 'triangle', 0.2); }, i * 110);
    });
  }

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var levelTextEl = document.getElementById('levelText');
  var retriesTextEl = document.getElementById('retriesText');
  var recordTextEl = document.getElementById('recordText');
  var overlayHintEl = document.getElementById('overlayHint');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalNextBtn = document.getElementById('modalNextBtn');

  var btnBack = document.getElementById('btnBack');
  var btnGas = document.getElementById('btnGas');

  var currentLevel = 1;
  var retries = 0;
  var maxUnlocked = 1;

  var isPlaying = false;
  var isDead = false;
  var isWon = false;

  var keyState = { gas: false, back: false };

  // Vehicle
  var truck = {
    x: 80,
    y: 180,
    vx: 0,
    vy: 0,
    angle: 0,
    vAngle: 0,
    wheelRadius: 13,
    wheelDist: 26,
    frontGrounded: false,
    backGrounded: false
  };

  // Level Definitions (Terrain waypoints [x, y])
  var LEVELS = [
    // Level 1: Gentle intro hills
    {
      length: 1200,
      points: [
        [0, 220], [200, 220], [350, 180], [500, 180], [650, 220], [800, 220], [950, 170], [1100, 170], [1250, 220]
      ]
    },
    // Level 2: Steeper stairs & small gap
    {
      length: 1400,
      points: [
        [0, 220], [200, 220], [300, 170], [420, 170], [500, 240], [600, 190], [750, 190], [850, 140], [1000, 140], [1150, 220], [1450, 220]
      ]
    },
    // Level 3: Extreme ramps & jumps
    {
      length: 1600,
      points: [
        [0, 220], [250, 220], [400, 130], [550, 130], [650, 240], [800, 150], [950, 150], [1100, 240], [1250, 170], [1650, 170]
      ]
    }
  ];

  function getTerrainY(x) {
    var lvl = LEVELS[(currentLevel - 1) % LEVELS.length];
    var pts = lvl.points;
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];

    for (var i = 0; i < pts.length - 1; i++) {
      var p1 = pts[i];
      var p2 = pts[i + 1];
      if (x >= p1[0] && x <= p2[0]) {
        var t = (x - p1[0]) / (p2[0] - p1[0]);
        return p1[1] + (p2[1] - p1[1]) * t;
      }
    }
    return 220;
  }

  function initLevel(lvlNum, incRetry) {
    currentLevel = lvlNum;
    if (incRetry) retries++;
    retriesTextEl.textContent = retries;
    levelTextEl.textContent = '第 ' + currentLevel + ' 关';
    recordTextEl.textContent = maxUnlocked + ' 关';

    truck.x = 80;
    truck.y = getTerrainY(80) - 25;
    truck.vx = 0;
    truck.vy = 0;
    truck.angle = 0;
    truck.vAngle = 0;
    truck.frontGrounded = false;
    truck.backGrounded = false;

    isPlaying = false;
    isDead = false;
    isWon = false;

    overlayHintEl.style.display = 'block';
    modalEl.classList.remove('active');
  }

  function startGame() {
    if (isDead || isWon) return;
    initAudio();
    isPlaying = true;
    overlayHintEl.style.display = 'none';
  }

  function crash() {
    if (isDead || isWon) return;
    isDead = true;
    isPlaying = false;
    playCrashSound();
    setTimeout(function () {
      initLevel(currentLevel, true);
    }, 700);
  }

  function win() {
    if (isWon) return;
    isWon = true;
    isPlaying = false;
    playWinSound();
    if (currentLevel >= maxUnlocked) maxUnlocked = currentLevel + 1;
    modalEl.classList.add('active');
  }

  function update() {
    if (!isPlaying || isDead || isWon) return;

    var GRAVITY = 0.42;
    truck.vy += GRAVITY;

    // Apply motor drive and torque
    var motorForce = 0.55;
    var airTorque = 0.045;

    if (keyState.gas) {
      playEngineSound();
      if (truck.frontGrounded || truck.backGrounded) {
        truck.vx += Math.cos(truck.angle) * motorForce;
        truck.vy += Math.sin(truck.angle) * motorForce;
        truck.vAngle -= 0.025; // front lifts
      } else {
        truck.vAngle -= airTorque; // tilt back in air
      }
    }

    if (keyState.back) {
      if (truck.frontGrounded || truck.backGrounded) {
        truck.vx -= Math.cos(truck.angle) * (motorForce * 0.7);
        truck.vy -= Math.sin(truck.angle) * (motorForce * 0.7);
        truck.vAngle += 0.025; // rear lifts
      } else {
        truck.vAngle += airTorque; // tilt forward in air
      }
    }

    // Move truck
    truck.x += truck.vx;
    truck.y += truck.vy;
    truck.angle += truck.vAngle;

    truck.vx *= 0.985;
    truck.vAngle *= 0.92;

    // Wheel positions in world space
    var cosA = Math.cos(truck.angle);
    var sinA = Math.sin(truck.angle);

    var backWx = truck.x - cosA * truck.wheelDist;
    var backWy = truck.y - sinA * truck.wheelDist + 12;

    var frontWx = truck.x + cosA * truck.wheelDist;
    var frontWy = truck.y + sinA * truck.wheelDist + 12;

    var backGroundY = getTerrainY(backWx);
    var frontGroundY = getTerrainY(frontWx);

    truck.backGrounded = false;
    truck.frontGrounded = false;

    // Back wheel collision
    if (backWy + truck.wheelRadius >= backGroundY) {
      var bPen = (backWy + truck.wheelRadius) - backGroundY;
      truck.y -= bPen * 0.5;
      truck.vy *= 0.5;
      truck.vAngle += bPen * 0.015;
      truck.backGrounded = true;
    }

    // Front wheel collision
    if (frontWy + truck.wheelRadius >= frontGroundY) {
      var fPen = (frontWy + truck.wheelRadius) - frontGroundY;
      truck.y -= fPen * 0.5;
      truck.vy *= 0.5;
      truck.vAngle -= fPen * 0.015;
      truck.frontGrounded = true;
    }

    // Roof collision / Flip Over Check
    var normAngle = Math.atan2(Math.sin(truck.angle), Math.cos(truck.angle));
    if (Math.abs(normAngle) > 2.2) {
      var roofY = truck.y - 18;
      var groundAtCenter = getTerrainY(truck.x);
      if (roofY >= groundAtCenter - 10) {
        crash();
        return;
      }
    }

    // Check Finish Line
    var lvl = LEVELS[(currentLevel - 1) % LEVELS.length];
    if (truck.x >= lvl.length) {
      win();
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var cameraX = truck.x - 120;

    // Sky
    var skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    skyGrad.addColorStop(0, '#0f172a');
    skyGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Distant mountain ranges
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(0, 180);
    ctx.lineTo(80, 130);
    ctx.lineTo(180, 170);
    ctx.lineTo(280, 110);
    ctx.lineTo(380, 190);
    ctx.lineTo(380, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    ctx.fill();

    // Draw Terrain
    var lvl = LEVELS[(currentLevel - 1) % LEVELS.length];
    var pts = lvl.points;

    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.moveTo(pts[0][0] - cameraX, canvas.height);
    for (var p = 0; p < pts.length; p++) {
      ctx.lineTo(pts[p][0] - cameraX, pts[p][1]);
    }
    ctx.lineTo(pts[pts.length - 1][0] - cameraX, canvas.height);
    ctx.closePath();
    ctx.fill();

    // Grass / Road Surface border
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (var p2 = 0; p2 < pts.length; p2++) {
      if (p2 === 0) ctx.moveTo(pts[p2][0] - cameraX, pts[p2][1]);
      else ctx.lineTo(pts[p2][0] - cameraX, pts[p2][1]);
    }
    ctx.stroke();

    // Finish Line Flag
    var flagX = lvl.length - cameraX;
    var flagY = getTerrainY(lvl.length);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(flagX, flagY);
    ctx.lineTo(flagX, flagY - 50);
    ctx.stroke();

    // Checkered flag banner
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(flagX, flagY - 50, 24, 16);
    ctx.fillStyle = '#000';
    ctx.fillRect(flagX + 12, flagY - 50, 12, 8);
    ctx.fillRect(flagX, flagY - 42, 12, 8);

    // Draw Monster Truck
    var tx = truck.x - cameraX;
    var ty = truck.y;

    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(truck.angle);

    // Truck Body (Chassis)
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2;
    ctx.fillRect(-24, -14, 48, 18);
    ctx.strokeRect(-24, -14, 48, 18);

    // Truck Cabin / Windshield
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-6, -24, 22, 12);
    ctx.strokeStyle = '#0284c7';
    ctx.strokeRect(-6, -24, 22, 12);

    // Roll cage bar
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-18, -14);
    ctx.lineTo(-6, -24);
    ctx.lineTo(16, -24);
    ctx.stroke();

    // Wheels
    function drawWheel(wx, wy) {
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(wx, wy, truck.wheelRadius, 0, Math.PI * 2);
      ctx.fill();

      // Rim
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(wx, wy, 5, 0, Math.PI * 2);
      ctx.fill();

      // Treads
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    drawWheel(-truck.wheelDist, 12);
    drawWheel(truck.wheelDist, 12);

    ctx.restore();
  }

  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  // Keyboard controls
  window.addEventListener('keydown', function (e) {
    if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      e.preventDefault(); keyState.gas = true; startGame();
    }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      e.preventDefault(); keyState.back = true; startGame();
    }
  });

  window.addEventListener('keyup', function (e) {
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keyState.gas = false;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyState.back = false;
  });

  btnGas.addEventListener('pointerdown', function () { keyState.gas = true; startGame(); });
  btnGas.addEventListener('pointerup', function () { keyState.gas = false; });
  btnGas.addEventListener('pointercancel', function () { keyState.gas = false; });

  btnBack.addEventListener('pointerdown', function () { keyState.back = true; startGame(); });
  btnBack.addEventListener('pointerup', function () { keyState.back = false; });
  btnBack.addEventListener('pointercancel', function () { keyState.back = false; });

  canvas.addEventListener('pointerdown', startGame);

  restartBtn.addEventListener('click', function () { initLevel(currentLevel, true); });
  modalNextBtn.addEventListener('click', function () { initLevel(currentLevel + 1, false); });

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  initLevel(1, false);
  loop();
})();
