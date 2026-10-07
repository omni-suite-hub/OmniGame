/**
 * OmniGame - 漂移老板 (Drift Boss)
 * Pure vanilla JS, Isometric procedural zigzag highway, one-touch steering, Web Audio SFX.
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
    screech: function () {
      if (!this.enabled || !this.ctx) return;
      try {
        var now = this.ctx.currentTime;
        var osc = this.ctx.createOscillator();
        var gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(700 + Math.random() * 100, now);
        osc.frequency.exponentialRampToValueAtTime(250, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
      } catch (e) {}
    },
    coin: function () {
      this.playTone(880, 'sine', 0.08, 0.2);
      this.playTone(1174.66, 'triangle', 0.12, 0.2, 0.04);
    },
    fall: function () {
      if (!this.enabled || !this.ctx) return;
      try {
        var now = this.ctx.currentTime;
        var osc = this.ctx.createOscillator();
        var gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.5);
      } catch (e) {}
    }
  };

  // --- Canvas & DOM ---
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var wrapper = document.getElementById('canvasWrapper');

  var elements = {
    distanceText: document.getElementById('distanceText'),
    coinsText: document.getElementById('coinsText'),
    bestText: document.getElementById('bestText'),
    soundBtn: document.getElementById('soundBtn'),
    restartBtn: document.getElementById('restartBtn'),
    modal: document.getElementById('gameOverModal'),
    modalDesc: document.getElementById('modalDesc'),
    modalRestartBtn: document.getElementById('modalRestartBtn')
  };

  // --- Geometry Constants ---
  // Isometric angles
  var ANGLE_LEFT = -Math.PI / 6;  // -30 deg (Up-Right)
  var ANGLE_RIGHT = Math.PI / 6;   // +30 deg (Down-Right)
  var ROAD_WIDTH = 48;

  // --- Game State ---
  var state = {
    width: 360,
    height: 468,
    dpr: 1,
    distance: 0,
    coins: 0,
    bestDist: 0,
    gameOver: false,
    holding: false,
    car: {
      x: 0,
      y: 0,
      angle: 0,
      targetAngle: 0,
      speed: 3.2,
      falling: false,
      fallY: 0,
      scale: 1
    },
    camera: { x: 0, y: 0 },
    roadTiles: [], // [{ x, y, dir, len }]
    coinsOnRoad: [],
    skidmarks: [],
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
  var SAVE_KEY = 'omg:save:drift-boss';

  function loadBest() {
    try {
      var saved = localStorage.getItem(SAVE_KEY);
      if (saved) state.bestDist = parseInt(saved, 10) || 0;
    } catch (e) {}
    elements.bestText.textContent = state.bestDist + 'm';
  }

  function saveBest() {
    if (state.distance > state.bestDist) {
      state.bestDist = state.distance;
      elements.bestText.textContent = state.bestDist + 'm';
      try {
        localStorage.setItem(SAVE_KEY, state.bestDist.toString());
      } catch (e) {}
    }
  }

  // --- Track Generation ---
  function generateInitialRoad() {
    state.roadTiles = [];
    state.coinsOnRoad = [];

    var curX = 0;
    var curY = 0;
    var curDir = 0; // 0: Left/Up-Right, 1: Right/Down-Right

    // Start with a long safe straight
    state.roadTiles.push({
      startX: -60,
      startY: 0,
      endX: 180,
      endY: 0,
      dir: 1,
      width: ROAD_WIDTH
    });

    curX = 180;
    curY = 0;

    for (var i = 0; i < 35; i++) {
      var len = 100 + Math.random() * 120;
      var nextDir = 1 - curDir;
      var angle = nextDir === 1 ? ANGLE_RIGHT : ANGLE_LEFT;

      var nextX = curX + Math.cos(angle) * len;
      var nextY = curY + Math.sin(angle) * len;

      state.roadTiles.push({
        startX: curX,
        startY: curY,
        endX: nextX,
        endY: nextY,
        dir: nextDir,
        width: ROAD_WIDTH
      });

      // Spawn coin
      if (Math.random() < 0.45) {
        state.coinsOnRoad.push({
          x: (curX + nextX) / 2,
          y: (curY + nextY) / 2,
          collected: false
        });
      }

      curX = nextX;
      curY = nextY;
      curDir = nextDir;
    }
  }

  function extendRoad() {
    var last = state.roadTiles[state.roadTiles.length - 1];
    var curX = last.endX;
    var curY = last.endY;
    var curDir = last.dir;

    for (var i = 0; i < 15; i++) {
      var len = 90 + Math.random() * 110;
      var nextDir = 1 - curDir;
      var angle = nextDir === 1 ? ANGLE_RIGHT : ANGLE_LEFT;

      var nextX = curX + Math.cos(angle) * len;
      var nextY = curY + Math.sin(angle) * len;

      state.roadTiles.push({
        startX: curX,
        startY: curY,
        endX: nextX,
        endY: nextY,
        dir: nextDir,
        width: ROAD_WIDTH
      });

      if (Math.random() < 0.5) {
        state.coinsOnRoad.push({
          x: (curX + nextX) / 2,
          y: (curY + nextY) / 2,
          collected: false
        });
      }

      curX = nextX;
      curY = nextY;
      curDir = nextDir;
    }
  }

  // --- Game Flow ---
  function initGame() {
    AudioSys.init();
    loadBest();
    state.distance = 0;
    state.coins = 0;
    state.gameOver = false;
    state.holding = false;
    state.skidmarks = [];
    state.particles = [];

    state.car.x = 0;
    state.car.y = 0;
    state.car.angle = ANGLE_LEFT;
    state.car.targetAngle = ANGLE_LEFT;
    state.car.speed = 3.3;
    state.car.falling = false;
    state.car.fallY = 0;
    state.car.scale = 1;

    elements.distanceText.textContent = '0m';
    elements.coinsText.textContent = '0';
    elements.modal.classList.remove('active');

    generateInitialRoad();
  }

  function triggerGameOver() {
    state.gameOver = true;
    AudioSys.fall();
    saveBest();

    elements.modalDesc.textContent = '行驶距离: ' + state.distance + 'm · 收集金币: ' + state.coins;
    elements.modal.classList.add('active');
  }

  // --- Point to Segment Distance Check ---
  function isCarOnRoad(cx, cy) {
    for (var i = 0; i < state.roadTiles.length; i++) {
      var t = state.roadTiles[i];
      var dx = t.endX - t.startX;
      var dy = t.endY - t.startY;
      var lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;

      var u = ((cx - t.startX) * dx + (cy - t.startY) * dy) / lenSq;
      if (u >= -0.1 && u <= 1.1) {
        var nx = t.startX + u * dx;
        var ny = t.startY + u * dy;
        var dist = Math.sqrt((cx - nx) * (cx - nx) + (cy - ny) * (cy - ny));
        if (dist <= t.width * 0.55) {
          return true;
        }
      }
    }
    return false;
  }

  // --- Main Update ---
  function update() {
    if (state.gameOver) {
      if (state.car.falling) {
        state.car.fallY += 7;
        state.car.scale *= 0.94;
      }
      return;
    }

    var car = state.car;

    // Steering
    car.targetAngle = state.holding ? ANGLE_RIGHT : ANGLE_LEFT;

    var diff = car.targetAngle - car.angle;
    car.angle += diff * 0.18;

    // Move car
    car.x += Math.cos(car.angle) * car.speed;
    car.y += Math.sin(car.angle) * car.speed;

    state.distance = Math.floor(car.x / 10);
    elements.distanceText.textContent = state.distance + 'm';

    // Camera follow car
    state.camera.x += (car.x - state.camera.x - state.width * 0.3) * 0.1;
    state.camera.y += (car.y - state.camera.y - state.height * 0.5) * 0.1;

    // Skid marks & Screech sound when turning
    if (Math.abs(diff) > 0.05) {
      AudioSys.screech();
      state.particles.push({
        x: car.x - Math.cos(car.angle) * 12,
        y: car.y - Math.sin(car.angle) * 12,
        alpha: 0.6,
        r: 3 + Math.random() * 2
      });
    }

    // Check Coin Collection
    state.coinsOnRoad.forEach(function (coin) {
      if (!coin.collected) {
        var cdx = car.x - coin.x;
        var cdy = car.y - coin.y;
        if (Math.sqrt(cdx * cdx + cdy * cdy) < 24) {
          coin.collected = true;
          state.coins++;
          elements.coinsText.textContent = state.coins;
          AudioSys.coin();
        }
      }
    });

    // Check Fall off road
    if (!isCarOnRoad(car.x, car.y)) {
      car.falling = true;
      triggerGameOver();
    }

    // Extend road if car near end
    var lastTile = state.roadTiles[state.roadTiles.length - 1];
    if (lastTile.endX - car.x < 600) {
      extendRoad();
    }

    // Clean old particles
    for (var p = state.particles.length - 1; p >= 0; p--) {
      state.particles[p].alpha -= 0.03;
      if (state.particles[p].alpha <= 0) {
        state.particles.splice(p, 1);
      }
    }
  }

  // --- Rendering ---
  function draw() {
    ctx.save();
    ctx.clearRect(0, 0, state.width, state.height);

    ctx.translate(-state.camera.x, -state.camera.y);

    // 1. Draw Road Tiles (Floating Highway with 3D Depth)
    state.roadTiles.forEach(function (t) {
      // 3D side edge
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = t.width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(t.startX, t.startY + 12);
      ctx.lineTo(t.endX, t.endY + 12);
      ctx.stroke();

      // Road surface
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = t.width - 2;
      ctx.beginPath();
      ctx.moveTo(t.startX, t.startY);
      ctx.lineTo(t.endX, t.endY);
      ctx.stroke();

      // Road border glow
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(t.startX, t.startY);
      ctx.lineTo(t.endX, t.endY);
      ctx.stroke();
    });

    // 2. Draw Skid Particles
    state.particles.forEach(function (pt) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.alpha);
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 3. Draw Coins
    state.coinsOnRoad.forEach(function (coin) {
      if (!coin.collected) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(coin.x, coin.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#facc15';
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.strokeStyle = '#ca8a04';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#78350f';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', coin.x, coin.y);
        ctx.restore();
      }
    });

    // 4. Draw Car
    var car = state.car;
    ctx.save();
    ctx.translate(car.x, car.y + car.fallY);
    ctx.rotate(car.angle);
    ctx.scale(car.scale, car.scale);

    // Car Shadow
    if (!car.falling) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 4, 14, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Car Body
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-14, -8, 28, 16, 4);
    ctx.fill();
    ctx.stroke();

    // Windshield
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(0, -6, 8, 12, 2);
    ctx.fill();

    // Spoiler
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-15, -9, 4, 18);

    ctx.restore();

    ctx.restore();
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // --- Input Handlers ---
  function onStartHold() {
    AudioSys.init();
    state.holding = true;
  }

  function onEndHold() {
    state.holding = false;
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      onStartHold();
    }
  });

  window.addEventListener('keyup', function (e) {
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      onEndHold();
    }
  });

  wrapper.addEventListener('mousedown', onStartHold);
  window.addEventListener('mouseup', onEndHold);

  wrapper.addEventListener('touchstart', function (e) {
    e.preventDefault();
    onStartHold();
  }, { passive: false });

  window.addEventListener('touchend', onEndHold);

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
