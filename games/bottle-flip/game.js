/**
 * OmniGame - 瓶子翻转 (Bottle Flip 3D)
 * Pure vanilla JS, charging jump physics, 360 degree rotation landing detection, Web Audio.
 */
(function () {
  'use strict';

  // --- Audio Synthesizer ---
  var AudioSys = {
    ctx: null,
    enabled: true,
    init: function () {
      if (!this.ctx) {
        try {
          var AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) this.ctx = new AudioCtx();
        } catch (e) {}
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(function () {});
      }
    },
    playTone: function (freq, type, duration, gainVal, startDelay) {
      if (!this.enabled || !this.ctx) return;
      try {
        var now = this.ctx.currentTime + (startDelay || 0);
        var osc = this.ctx.createOscillator();
        var gain = this.ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(gainVal || 0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration);
      } catch (e) {}
    },
    charge: function () {
      this.playTone(220, 'sine', 0.05, 0.08);
    },
    throwBottle: function () {
      this.playTone(440, 'triangle', 0.1, 0.18);
      this.playTone(300, 'sine', 0.12, 0.15, 0.03);
    },
    landSuccess: function () {
      this.playTone(523.25, 'triangle', 0.1, 0.22);
      this.playTone(659.25, 'sine', 0.15, 0.2, 0.04);
      this.playTone(783.99, 'sine', 0.2, 0.18, 0.08);
    },
    crash: function () {
      this.playTone(180, 'sawtooth', 0.25, 0.2);
      this.playTone(120, 'sawtooth', 0.35, 0.2, 0.08);
    }
  };

  // --- Canvas & DOM ---
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var wrapper = document.getElementById('canvasWrapper');

  var elements = {
    scoreText: document.getElementById('scoreText'),
    bestText: document.getElementById('bestText'),
    powerPercent: document.getElementById('powerPercent'),
    soundBtn: document.getElementById('soundBtn'),
    restartBtn: document.getElementById('restartBtn'),
    modal: document.getElementById('gameOverModal'),
    modalDesc: document.getElementById('modalDesc'),
    modalRestartBtn: document.getElementById('modalRestartBtn')
  };

  // --- Platform Types ---
  var PLATFORM_TYPES = [
    { name: '书桌', color: '#78350f', topColor: '#b45309' },
    { name: '书叠', color: '#0369a1', topColor: '#38bdf8' },
    { name: '收纳箱', color: '#4c1d95', topColor: '#a855f7' },
    { name: '音箱', color: '#1e293b', topColor: '#475569' },
    { name: '板凳', color: '#047857', topColor: '#10b981' }
  ];

  // --- Game State ---
  var state = {
    width: 360,
    height: 468,
    dpr: 1,
    score: 0,
    bestScore: 0,
    gameOver: false,
    charging: false,
    chargeTime: 0,
    cameraX: 0,
    targetCameraX: 0,
    bottle: {
      x: 80,
      y: 300,
      vx: 0,
      vy: 0,
      angle: 0,
      vAngle: 0,
      w: 18,
      h: 46,
      inAir: false,
      dead: false
    },
    platforms: [],
    currentPlatIndex: 0,
    particles: []
  };

  function resizeCanvas() {
    var rect = wrapper.getBoundingClientRect();
    state.width = rect.width;
    state.height = rect.height;
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = state.width * state.dpr;
    canvas.height = state.height * state.dpr;
    ctx.scale(state.dpr, state.dpr);
  }

  // --- Persistence ---
  var SAVE_KEY = 'omg:save:bottle-flip';

  function loadBest() {
    try {
      var saved = localStorage.getItem(SAVE_KEY);
      if (saved) state.bestScore = parseInt(saved, 10) || 0;
    } catch (e) {}
    elements.bestText.textContent = state.bestScore;
  }

  function saveBest() {
    if (state.score > state.bestScore) {
      state.bestScore = state.score;
      elements.bestText.textContent = state.bestScore;
      try {
        localStorage.setItem(SAVE_KEY, state.bestScore.toString());
      } catch (e) {}
    }
  }

  // --- Generate Platforms ---
  function createPlatform(x, y, w) {
    var type = PLATFORM_TYPES[Math.floor(Math.random() * PLATFORM_TYPES.length)];
    return {
      x: x,
      y: y,
      w: w || (65 + Math.random() * 25),
      h: 120,
      color: type.color,
      topColor: type.topColor
    };
  }

  function initPlatforms() {
    state.platforms = [];
    var p0 = createPlatform(50, 340, 85);
    state.platforms.push(p0);

    var curX = p0.x + p0.w;
    for (var i = 1; i < 20; i++) {
      var gap = 90 + Math.random() * 70;
      var p = createPlatform(curX + gap, 340, 65 + Math.random() * 20);
      state.platforms.push(p);
      curX = p.x + p.w;
    }
  }

  // --- Game Flow ---
  function initGame() {
    AudioSys.init();
    loadBest();
    state.score = 0;
    state.gameOver = false;
    state.charging = false;
    state.chargeTime = 0;
    state.currentPlatIndex = 0;
    state.cameraX = 0;
    state.targetCameraX = 0;
    state.particles = [];

    initPlatforms();

    var p0 = state.platforms[0];
    state.bottle.x = p0.x + p0.w / 2;
    state.bottle.y = p0.y - state.bottle.h / 2;
    state.bottle.vx = 0;
    state.bottle.vy = 0;
    state.bottle.angle = 0;
    state.bottle.vAngle = 0;
    state.bottle.inAir = false;
    state.bottle.dead = false;

    elements.scoreText.textContent = '0';
    elements.powerPercent.textContent = '0%';
    elements.modal.classList.remove('active');
  }

  function triggerGameOver() {
    state.gameOver = true;
    AudioSys.crash();
    saveBest();

    elements.modalDesc.textContent = '最终成功翻转: ' + state.score + ' 次 · 历史最高: ' + state.bestScore;
    elements.modal.classList.add('active');
  }

  // --- Launch Physics ---
  function launchBottle() {
    if (state.bottle.inAir || state.gameOver) return;
    AudioSys.init();
    AudioSys.throwBottle();

    var power = Math.min(1.0, state.chargeTime / 850);
    state.charging = false;
    state.chargeTime = 0;
    elements.powerPercent.textContent = '0%';

    var b = state.bottle;
    b.inAir = true;

    // Linear speed & Jump curve
    var nextPlat = state.platforms[state.currentPlatIndex + 1];
    var baseVx = 3.6 + power * 4.2;
    b.vx = baseVx;
    b.vy = -(8.2 + power * 4.5);

    // Calculate angular velocity to complete full 360 deg rotation during flight
    var estimatedFlightFrames = (-b.vy * 2) / 0.38;
    b.vAngle = (Math.PI * 2) / estimatedFlightFrames;
  }

  // --- Physics Update ---
  var GRAVITY = 0.38;

  function update() {
    // Camera follow smoothly
    state.cameraX += (state.targetCameraX - state.cameraX) * 0.1;

    // Charge power accumulation
    if (state.charging && !state.bottle.inAir && !state.gameOver) {
      state.chargeTime += 16;
      if (state.chargeTime % 100 < 20) AudioSys.charge();
      var pct = Math.min(100, Math.floor((state.chargeTime / 850) * 100));
      elements.powerPercent.textContent = pct + '%';
      if (pct >= 100) {
        launchBottle();
      }
    }

    var b = state.bottle;
    if (b.inAir) {
      b.vy += GRAVITY;
      b.x += b.vx;
      b.y += b.vy;
      b.angle += b.vAngle;

      // Check Landing on platforms
      for (var i = 0; i < state.platforms.length; i++) {
        var plat = state.platforms[i];
        var platSurfaceY = plat.y;
        var bottleBottomY = b.y + b.h / 2;

        if (b.vy > 0 && bottleBottomY >= platSurfaceY && bottleBottomY <= platSurfaceY + 22) {
          // Horizontal check
          var halfW = b.w / 2;
          if (b.x + halfW > plat.x && b.x - halfW < plat.x + plat.w) {
            // Angle check: must be near 0 (modulo 2PI)
            var normAngle = Math.abs(b.angle % (Math.PI * 2));
            if (normAngle > Math.PI) normAngle = Math.PI * 2 - normAngle;

            if (normAngle < 0.45) { // Within upright landing tolerance (~25 deg)
              // LANDED SUCCESSFULLY!
              b.inAir = false;
              b.y = platSurfaceY - b.h / 2;
              b.vx = 0;
              b.vy = 0;
              b.angle = 0;
              b.vAngle = 0;

              AudioSys.landSuccess();

              if (i > state.currentPlatIndex) {
                state.score++;
                state.currentPlatIndex = i;
                elements.scoreText.textContent = state.score;
                createSparkles(b.x, platSurfaceY);
                state.targetCameraX = plat.x - 60;
                saveBest();
              }
              return;
            }
          }
        }
      }

      // Fell into the void
      if (b.y > state.height + 60) {
        b.dead = true;
        triggerGameOver();
      }
    }

    // Update Particles
    for (var p = state.particles.length - 1; p >= 0; p--) {
      var pt = state.particles[p];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.alpha -= 0.04;
      if (pt.alpha <= 0) {
        state.particles.splice(p, 1);
      }
    }
  }

  function createSparkles(x, y) {
    for (var i = 0; i < 18; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 1.5 + Math.random() * 4;
      state.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 1.5,
        r: 2 + Math.random() * 2.5,
        alpha: 1,
        color: '#facc15'
      });
    }
  }

  // --- Rendering ---
  function draw() {
    ctx.save();
    ctx.clearRect(0, 0, state.width, state.height);

    ctx.translate(-state.cameraX, 0);

    // 1. Draw Platforms
    state.platforms.forEach(function (plat) {
      // Body
      ctx.fillStyle = plat.color;
      ctx.fillRect(plat.x, plat.y, plat.w, plat.h);

      // Top Table Edge
      ctx.fillStyle = plat.topColor;
      ctx.fillRect(plat.x, plat.y, plat.w, 10);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(plat.x, plat.y, plat.w, 10);
    });

    // 2. Draw Particles
    state.particles.forEach(function (p) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 3. Draw Water Bottle
    var b = state.bottle;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);

    // Charge squash effect
    if (state.charging && !b.inAir) {
      var squash = 1 - (state.chargeTime / 850) * 0.2;
      ctx.scale(1 / squash, squash);
    }

    // Bottle Shadow
    if (!b.inAir) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, b.h / 2 + 2, b.w / 2 + 2, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Transparent Plastic Body
    ctx.fillStyle = 'rgba(224, 242, 254, 0.75)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-b.w / 2, -b.h / 2 + 8, b.w, b.h - 8, 4);
    ctx.fill();
    ctx.stroke();

    // Water level inside bottle
    ctx.fillStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.beginPath();
    ctx.roundRect(-b.w / 2 + 1, -b.h / 2 + 18, b.w - 2, b.h - 20, 3);
    ctx.fill();

    // Bottle Cap
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.roundRect(-b.w * 0.3, -b.h / 2, b.w * 0.6, 8, 2);
    ctx.fill();

    ctx.restore();

    ctx.restore();
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // --- Input Handlers ---
  function onPointerDown() {
    if (state.gameOver || state.bottle.inAir) return;
    AudioSys.init();
    state.charging = true;
    state.chargeTime = 0;
  }

  function onPointerUp() {
    if (state.charging) {
      launchBottle();
    }
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'ArrowUp') {
      onPointerDown();
    }
  });

  window.addEventListener('keyup', function (e) {
    if (e.key === ' ' || e.key === 'ArrowUp') {
      onPointerUp();
    }
  });

  wrapper.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mouseup', onPointerUp);

  wrapper.addEventListener('touchstart', function (e) {
    e.preventDefault();
    onPointerDown();
  }, { passive: false });

  window.addEventListener('touchend', onPointerUp);

  elements.soundBtn.addEventListener('click', function () {
    AudioSys.enabled = !AudioSys.enabled;
    elements.soundBtn.textContent = AudioSys.enabled ? '🔊' : '🔇';
  });

  elements.restartBtn.addEventListener('click', initGame);
  elements.modalRestartBtn.addEventListener('click', initGame);

  window.addEventListener('resize', resizeCanvas);

  // Init
  resizeCanvas();
  initGame();
  requestAnimationFrame(loop);
})();
