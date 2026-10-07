// Mini Golf (迷你高尔夫) - OmniGame Engine
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

  function playPuttSound(pwr) { playTone(520, 0.08, 'triangle', 0.1 + pwr * 0.15); }
  function playBounceSound() { playTone(300, 0.04, 'sine', 0.08); }
  function playCupSound() {
    playTone(660, 0.12, 'sine', 0.2);
    setTimeout(function () { playTone(990, 0.15, 'triangle', 0.2); }, 60);
  }
  function playWinSound() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { playTone(f, 0.25, 'triangle', 0.2); }, i * 110);
    });
  }

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var holeTextEl = document.getElementById('holeText');
  var strokesTextEl = document.getElementById('strokesText');
  var totalTextEl = document.getElementById('totalText');
  var powerPercentEl = document.getElementById('powerPercent');
  var powerFillEl = document.getElementById('powerFill');
  var overlayHintEl = document.getElementById('overlayHint');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalTitleEl = document.getElementById('modalTitle');
  var modalDescEl = document.getElementById('modalDesc');
  var modalNextBtn = document.getElementById('modalNextBtn');

  var currentHoleIdx = 0;
  var strokes = 0;
  var totalStrokes = 0;
  var isBallMoving = false;
  var isAiming = false;
  var aimPower = 0;
  var aimAngle = 0;

  var ball = {
    x: 60,
    y: 280,
    vx: 0,
    vy: 0,
    r: 6
  };

  var HOLES = [
    // Hole 1: Par 2
    {
      par: 2,
      start: [60, 280],
      cup: [270, 70],
      walls: [
        { x: 120, y: 140, w: 100, h: 18 }
      ],
      sands: [
        { x: 180, y: 220, w: 60, h: 40 }
      ],
      windmill: null
    },
    // Hole 2: Par 2
    {
      par: 2,
      start: [60, 270],
      cup: [280, 80],
      walls: [
        { x: 140, y: 30, w: 16, h: 180 },
        { x: 210, y: 130, w: 16, h: 180 }
      ],
      sands: [
        { x: 50, y: 110, w: 70, h: 50 }
      ],
      windmill: null
    },
    // Hole 3: Par 3 with Windmill
    {
      par: 3,
      start: [170, 300],
      cup: [170, 50],
      walls: [
        { x: 30, y: 170, w: 110, h: 16 },
        { x: 200, y: 170, w: 110, h: 16 }
      ],
      sands: [],
      windmill: { x: 170, y: 170, len: 45, angle: 0, speed: 0.04 }
    },
    // Hole 4: Par 3 Island
    {
      par: 3,
      start: [50, 170],
      cup: [280, 170],
      walls: [
        { x: 160, y: 40, w: 20, h: 90 },
        { x: 160, y: 210, w: 20, h: 90 }
      ],
      sands: [
        { x: 140, y: 130, w: 60, h: 80 }
      ],
      windmill: null
    }
  ];

  function initHole(idx) {
    currentHoleIdx = idx % HOLES.length;
    var h = HOLES[currentHoleIdx];
    strokes = 0;
    isBallMoving = false;
    isAiming = false;
    aimPower = 0;

    ball.x = h.start[0];
    ball.y = h.start[1];
    ball.vx = 0;
    ball.vy = 0;

    modalEl.classList.remove('active');
    overlayHintEl.style.display = 'block';

    updateStatsUI();
  }

  function updateStatsUI() {
    var h = HOLES[currentHoleIdx];
    holeTextEl.textContent = '第 ' + (currentHoleIdx + 1) + '/' + HOLES.length + ' 洞 (标准杆 ' + h.par + ')';
    strokesTextEl.textContent = strokes;
    totalTextEl.textContent = totalStrokes + strokes;
    powerPercentEl.textContent = Math.floor(aimPower * 100) + '%';
    powerFillEl.style.width = Math.floor(aimPower * 100) + '%';
  }

  function sinkCup() {
    isBallMoving = false;
    totalStrokes += strokes;
    playCupSound();

    var h = HOLES[currentHoleIdx];
    var diff = strokes - h.par;
    var title = '入洞！推杆成功！';
    if (strokes === 1) title = '⛳ HOLE IN ONE! 一杆进洞！';
    else if (diff <= -1) title = '🦅 小鸟球 (Birdie)!';
    else if (diff === 0) title = '保标准杆 (Par)!';

    modalTitleEl.textContent = title;
    modalDescEl.textContent = '本洞消耗 ' + strokes + ' 杆，累计总杆数 ' + totalStrokes + ' 杆！';
    setTimeout(function () {
      modalEl.classList.add('active');
    }, 300);
  }

  function updatePhysics() {
    var h = HOLES[currentHoleIdx];

    // Update windmill rotation
    if (h.windmill) {
      h.windmill.angle += h.windmill.speed;
    }

    if (!isBallMoving) return;

    var currentFriction = 0.982;

    // Check sand traps
    h.sands.forEach(function (s) {
      if (ball.x >= s.x && ball.x <= s.x + s.w && ball.y >= s.y && ball.y <= s.y + s.h) {
        currentFriction = 0.92; // heavy slowdown
      }
    });

    ball.vx *= currentFriction;
    ball.vy *= currentFriction;
    ball.x += ball.vx;
    ball.y += ball.vy;

    if (Math.abs(ball.vx) < 0.04) ball.vx = 0;
    if (Math.abs(ball.vy) < 0.04) ball.vy = 0;
    if (ball.vx === 0 && ball.vy === 0) isBallMoving = false;

    // Outer Boundary Collisions
    var bMin = 18 + ball.r;
    var bMax = 322 - ball.r;

    if (ball.x < bMin) { ball.x = bMin; ball.vx = -ball.vx * 0.85; playBounceSound(); }
    if (ball.x > bMax) { ball.x = bMax; ball.vx = -ball.vx * 0.85; playBounceSound(); }
    if (ball.y < bMin) { ball.y = bMin; ball.vy = -ball.vy * 0.85; playBounceSound(); }
    if (ball.y > bMax) { ball.y = bMax; ball.vy = -ball.vy * 0.85; playBounceSound(); }

    // Interior Wall Collisions
    h.walls.forEach(function (w) {
      if (ball.x + ball.r > w.x && ball.x - ball.r < w.x + w.w &&
          ball.y + ball.r > w.y && ball.y - ball.r < w.y + w.h) {
        // Nearest edge bounce
        var overlapLeft = (ball.x + ball.r) - w.x;
        var overlapRight = (w.x + w.w) - (ball.x - ball.r);
        var overlapTop = (ball.y + ball.r) - w.y;
        var overlapBottom = (w.y + w.h) - (ball.y - ball.r);

        var minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
        if (minOverlap === overlapLeft) { ball.x = w.x - ball.r; ball.vx = -ball.vx * 0.85; }
        else if (minOverlap === overlapRight) { ball.x = w.x + w.w + ball.r; ball.vx = -ball.vx * 0.85; }
        else if (minOverlap === overlapTop) { ball.y = w.y - ball.r; ball.vy = -ball.vy * 0.85; }
        else { ball.y = w.y + w.h + ball.r; ball.vy = -ball.vy * 0.85; }
        playBounceSound();
      }
    });

    // Windmill Blade Collision
    if (h.windmill) {
      var wm = h.windmill;
      // 4 blades
      for (var b = 0; b < 4; b++) {
        var bAngle = wm.angle + (b * Math.PI) / 2;
        var tipX = wm.x + Math.cos(bAngle) * wm.len;
        var tipY = wm.y + Math.sin(bAngle) * wm.len;

        // Line segment collision with circle
        var dx = tipX - wm.x;
        var dy = tipY - wm.y;
        var t = Math.max(0, Math.min(1, ((ball.x - wm.x) * dx + (ball.y - wm.y) * dy) / (wm.len * wm.len)));
        var closeX = wm.x + t * dx;
        var closeY = wm.y + t * dy;

        var distToBlade = Math.sqrt((ball.x - closeX) * (ball.x - closeX) + (ball.y - closeY) * (ball.y - closeY));
        if (distToBlade < ball.r + 4) {
          ball.vx = -ball.vx * 0.8 + Math.cos(bAngle + Math.PI / 2) * 3;
          ball.vy = -ball.vy * 0.8 + Math.sin(bAngle + Math.PI / 2) * 3;
          playBounceSound();
        }
      }
    }

    // Check Cup Hole
    var cdx = ball.x - h.cup[0];
    var cdy = ball.y - h.cup[1];
    var distToCup = Math.sqrt(cdx * cdx + cdy * cdy);

    if (distToCup < 8.5 && Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) < 4.5) {
      sinkCup();
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var h = HOLES[currentHoleIdx];

    // Green Fairway Carpet
    ctx.fillStyle = '#15803d';
    ctx.fillRect(18, 18, 304, 304);

    // Sand Traps
    h.sands.forEach(function (s) {
      ctx.fillStyle = '#fde047';
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x, s.y, s.w, s.h);
    });

    // Walls
    h.walls.forEach(function (w) {
      ctx.fillStyle = '#b45309';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2;
      ctx.strokeRect(w.x, w.y, w.w, w.h);
    });

    // Windmill
    if (h.windmill) {
      var wm = h.windmill;
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.arc(wm.x, wm.y, 8, 0, Math.PI * 2);
      ctx.fill();

      // Blades
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 4;
      for (var b = 0; b < 4; b++) {
        var bAngle = wm.angle + (b * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(wm.x, wm.y);
        ctx.lineTo(wm.x + Math.cos(bAngle) * wm.len, wm.y + Math.sin(bAngle) * wm.len);
        ctx.stroke();
      }
    }

    // Cup Hole & Flag
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(h.cup[0], h.cup[1], 10, 0, Math.PI * 2);
    ctx.fill();

    // Flag Pin
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(h.cup[0], h.cup[1]);
    ctx.lineTo(h.cup[0], h.cup[1] - 28);
    ctx.stroke();

    // Red Flag Banner
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(h.cup[0], h.cup[1] - 28);
    ctx.lineTo(h.cup[0] + 14, h.cup[1] - 21);
    ctx.lineTo(h.cup[0], h.cup[1] - 14);
    ctx.closePath();
    ctx.fill();

    // Aim Guide Line
    if (isAiming && !isBallMoving) {
      var dirX = Math.cos(aimAngle);
      var dirY = Math.sin(aimAngle);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(ball.x + dirX * 90, ball.y + dirY * 90);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Golf Ball
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(ball.x + 2, ball.y + 2, ball.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function loop() {
    updatePhysics();
    render();
    requestAnimationFrame(loop);
  }

  function getCanvasPos(e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (isBallMoving) return;
    initAudio();
    var p = getCanvasPos(e);
    var dx = p.x - ball.x;
    var dy = p.y - ball.y;
    if (Math.sqrt(dx * dx + dy * dy) < 40) {
      isAiming = true;
      overlayHintEl.style.display = 'none';
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!isAiming) return;
    var p = getCanvasPos(e);
    var dx = ball.x - p.x;
    var dy = ball.y - p.y;
    var dist = Math.sqrt(dx * dx + dy * dy);

    aimAngle = Math.atan2(dy, dx);
    aimPower = Math.min(1.0, Math.max(0.05, dist / 80));
    updateStatsUI();
  });

  canvas.addEventListener('pointerup', function (e) {
    if (!isAiming) return;
    isAiming = false;

    if (aimPower > 0.08) {
      var maxSpeed = 11.5;
      ball.vx = Math.cos(aimAngle) * aimPower * maxSpeed;
      ball.vy = Math.sin(aimAngle) * aimPower * maxSpeed;
      isBallMoving = true;
      strokes++;
      playPuttSound(aimPower);
      aimPower = 0;
      updateStatsUI();
    }
  });

  restartBtn.addEventListener('click', function () { initHole(currentHoleIdx); });
  modalNextBtn.addEventListener('click', function () { initHole(currentHoleIdx + 1); });

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  initHole(0);
  loop();
})();
