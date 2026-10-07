/**
 * OmniGame - 水果忍者 (Fruit Ninja)
 * Pure vanilla JS, HTML5 Canvas, Web Audio SFX, Touch/Mouse Slice Physics.
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
    swish: function () {
      if (!this.enabled || !this.ctx) return;
      try {
        var now = this.ctx.currentTime;
        var osc = this.ctx.createOscillator();
        var gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
      } catch (e) {}
    },
    splat: function () {
      this.playTone(520, 'sine', 0.08, 0.2);
      this.playTone(780, 'triangle', 0.12, 0.18, 0.02);
      this.playTone(1040, 'sine', 0.15, 0.15, 0.04);
    },
    combo: function (count) {
      var self = this;
      var base = 440 + count * 60;
      [base, base * 1.25, base * 1.5].forEach(function (f, i) {
        self.playTone(f, 'triangle', 0.18, 0.2, i * 0.06);
      });
    },
    bomb: function () {
      if (!this.enabled || !this.ctx) return;
      try {
        var now = this.ctx.currentTime;
        var osc = this.ctx.createOscillator();
        var gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.6);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.6);
      } catch (e) {}
    },
    miss: function () {
      this.playTone(180, 'sawtooth', 0.18, 0.15);
      this.playTone(140, 'sine', 0.22, 0.15, 0.06);
    }
  };

  // --- Fruit Types Definition ---
  var FRUIT_TYPES = [
    { name: 'watermelon', emoji: '🍉', color: '#10b981', juice: '#ef4444', radius: 28, points: 1 },
    { name: 'apple', emoji: '🍎', color: '#ef4444', juice: '#f87171', radius: 24, points: 1 },
    { name: 'banana', emoji: '🍌', color: '#facc15', juice: '#fef08a', radius: 26, points: 1 },
    { name: 'orange', emoji: '🍊', color: '#f97316', juice: '#fed7aa', radius: 24, points: 1 },
    { name: 'strawberry', emoji: '🍓', color: '#e11d48', juice: '#f43f5e', radius: 20, points: 2 },
    { name: 'pineapple', emoji: '🍍', color: '#eab308', juice: '#fde047', radius: 28, points: 2 }
  ];

  // --- Canvas & Game State ---
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var wrapper = document.getElementById('canvasWrapper');

  var elements = {
    scoreText: document.getElementById('scoreText'),
    comboText: document.getElementById('comboText'),
    livesContainer: document.getElementById('livesContainer'),
    soundBtn: document.getElementById('soundBtn'),
    restartBtn: document.getElementById('restartBtn'),
    modal: document.getElementById('gameOverModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalDesc: document.getElementById('modalDesc'),
    modalRestartBtn: document.getElementById('modalRestartBtn')
  };

  var state = {
    score: 0,
    lives: 3,
    maxLives: 3,
    gameOver: false,
    fruits: [],
    halfFruits: [],
    particles: [],
    floatingTexts: [],
    bladeTrail: [], // [{ x, y, time }]
    isPointerDown: false,
    lastSpawnTime: 0,
    spawnInterval: 1400,
    comboCount: 0,
    lastSliceTime: 0,
    screenShake: 0,
    width: 360,
    height: 450,
    dpr: 1
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

  // --- Geometry / Intersection Helper ---
  function dist(p1, p2) {
    var dx = p1.x - p2.x;
    var dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function lineIntersectsCircle(p1, p2, cCenter, radius) {
    var dx = p2.x - p1.x;
    var dy = p2.y - p1.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return dist(p1, cCenter) <= radius;

    var u = ((cCenter.x - p1.x) * dx + (cCenter.y - p1.y) * dy) / (len * len);
    var clampedU = Math.max(0, Math.min(1, u));
    var nearestX = p1.x + clampedU * dx;
    var nearestY = p1.y + clampedU * dy;
    var d = Math.sqrt((cCenter.x - nearestX) * (cCenter.x - nearestX) + (cCenter.y - nearestY) * (cCenter.y - nearestY));
    return d <= radius;
  }

  // --- Spawning Logic ---
  function spawnFruits() {
    if (state.gameOver) return;
    var count = Math.random() < 0.4 ? 2 : (Math.random() < 0.15 ? 3 : 1);
    // Occasionally spawn bomb
    var hasBomb = Math.random() < 0.28;

    for (var i = 0; i < count; i++) {
      var isBomb = (i === 0 && hasBomb);
      var type;
      if (isBomb) {
        type = { name: 'bomb', emoji: '💣', color: '#334155', juice: '#64748b', radius: 26, isBomb: true };
      } else {
        type = FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];
      }

      var x = state.width * (0.2 + Math.random() * 0.6);
      var y = state.height + 30;
      var targetX = state.width * (0.3 + Math.random() * 0.4);
      var vx = (targetX - x) * 0.025 + (Math.random() - 0.5) * 1.5;
      var vy = -(11 + Math.random() * 4.2);

      state.fruits.push({
        type: type,
        x: x,
        y: y,
        vx: vx,
        vy: vy,
        radius: type.radius,
        angle: Math.random() * Math.PI * 2,
        vAngle: (Math.random() - 0.5) * 0.12,
        sliced: false
      });
    }

    state.spawnInterval = Math.max(750, 1400 - Math.floor(state.score / 20) * 80);
  }

  // --- Slice Fruit Execution ---
  function sliceFruit(fruit, sliceAngle) {
    fruit.sliced = true;
    AudioSys.init();

    if (fruit.type.isBomb) {
      AudioSys.bomb();
      state.screenShake = 20;
      createExplosion(fruit.x, fruit.y);
      triggerGameOver('💣 触碰炸弹爆炸！');
      return;
    }

    // Normal fruit sliced
    AudioSys.splat();
    var now = Date.now();
    if (now - state.lastSliceTime < 400) {
      state.comboCount++;
    } else {
      state.comboCount = 1;
    }
    state.lastSliceTime = now;

    var points = fruit.type.points;
    if (state.comboCount >= 3) {
      var bonus = (state.comboCount - 2) * 2;
      points += bonus;
      AudioSys.combo(state.comboCount);
      addFloatingText(fruit.x, fruit.y - 20, 'COMBO x' + state.comboCount + ' +' + bonus, '#38bdf8');
      elements.comboText.textContent = state.comboCount;
    } else {
      elements.comboText.textContent = '0';
    }

    state.score += points;
    elements.scoreText.textContent = state.score;
    addFloatingText(fruit.x, fruit.y, '+' + points, '#facc15');

    // Create Splatter Particles
    createSplatter(fruit.x, fruit.y, fruit.type.juice);

    // Create Two Halves
    var perp = sliceAngle + Math.PI / 2;
    var speed = 3.5;
    state.halfFruits.push({
      type: fruit.type,
      x: fruit.x,
      y: fruit.y,
      vx: fruit.vx + Math.cos(perp) * speed,
      vy: fruit.vy + Math.sin(perp) * speed,
      angle: fruit.angle,
      vAngle: fruit.vAngle - 0.1,
      side: 'left',
      alpha: 1
    });
    state.halfFruits.push({
      type: fruit.type,
      x: fruit.x,
      y: fruit.y,
      vx: fruit.vx - Math.cos(perp) * speed,
      vy: fruit.vy - Math.sin(perp) * speed,
      angle: fruit.angle,
      vAngle: fruit.vAngle + 0.1,
      side: 'right',
      alpha: 1
    });
  }

  function createSplatter(x, y, color) {
    for (var i = 0; i < 18; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 2 + Math.random() * 6;
      state.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        radius: 2.5 + Math.random() * 3.5,
        color: color,
        alpha: 1,
        decay: 0.025 + Math.random() * 0.03
      });
    }
  }

  function createExplosion(x, y) {
    for (var i = 0; i < 35; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 3 + Math.random() * 8;
      state.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        radius: 3 + Math.random() * 5,
        color: Math.random() < 0.5 ? '#f97316' : '#ef4444',
        alpha: 1,
        decay: 0.02
      });
    }
  }

  function addFloatingText(x, y, text, color) {
    state.floatingTexts.push({
      x: x,
      y: y,
      text: text,
      color: color,
      alpha: 1,
      vy: -1.2
    });
  }

  function loseLife() {
    state.lives--;
    AudioSys.miss();
    updateLivesUI();
    if (state.lives <= 0) {
      triggerGameOver('💔 水果掉落过多，游戏结束！');
    }
  }

  function updateLivesUI() {
    var hearts = elements.livesContainer.querySelectorAll('.heart');
    hearts.forEach(function (h, idx) {
      if (idx < state.lives) {
        h.classList.remove('lost');
      } else {
        h.classList.add('lost');
      }
    });
  }

  function triggerGameOver(reason) {
    state.gameOver = true;
    try {
      var best = parseInt(localStorage.getItem('omg:save:fruit-ninja') || '0', 10);
      if (state.score > best) {
        localStorage.setItem('omg:save:fruit-ninja', state.score.toString());
      }
    } catch (e) {}

    elements.modalTitle.textContent = reason;
    elements.modalDesc.textContent = '最终切击得分: ' + state.score + ' 分';
    elements.modal.classList.add('active');
  }

  function restartGame() {
    AudioSys.init();
    state.score = 0;
    state.lives = state.maxLives;
    state.gameOver = false;
    state.fruits = [];
    state.halfFruits = [];
    state.particles = [];
    state.floatingTexts = [];
    state.bladeTrail = [];
    state.comboCount = 0;
    state.screenShake = 0;
    state.lastSpawnTime = Date.now();
    elements.scoreText.textContent = '0';
    elements.comboText.textContent = '0';
    updateLivesUI();
    elements.modal.classList.remove('active');
  }

  // --- Pointer / Touch Input ---
  function getCanvasPos(e) {
    var rect = canvas.getBoundingClientRect();
    var clientX = e.clientX;
    var clientY = e.clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function onPointerDown(e) {
    AudioSys.init();
    state.isPointerDown = true;
    var pos = getCanvasPos(e);
    state.bladeTrail = [{ x: pos.x, y: pos.y, time: Date.now() }];
  }

  function onPointerMove(e) {
    if (!state.isPointerDown) return;
    var pos = getCanvasPos(e);
    var now = Date.now();
    var last = state.bladeTrail[state.bladeTrail.length - 1];

    if (last && dist(last, pos) > 6) {
      AudioSys.swish();
      // Check slice collision with active fruits
      var sliceAngle = Math.atan2(pos.y - last.y, pos.x - last.x);
      state.fruits.forEach(function (fruit) {
        if (!fruit.sliced && lineIntersectsCircle(last, pos, fruit, fruit.radius)) {
          sliceFruit(fruit, sliceAngle);
        }
      });
    }

    state.bladeTrail.push({ x: pos.x, y: pos.y, time: now });
  }

  function onPointerUp() {
    state.isPointerDown = false;
  }

  // Bind Listeners
  wrapper.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);

  wrapper.addEventListener('touchstart', onPointerDown, { passive: false });
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('touchend', onPointerUp);

  elements.soundBtn.addEventListener('click', function () {
    AudioSys.enabled = !AudioSys.enabled;
    elements.soundBtn.textContent = AudioSys.enabled ? '🔊' : '🔇';
  });

  elements.restartBtn.addEventListener('click', restartGame);
  elements.modalRestartBtn.addEventListener('click', restartGame);

  // --- Main Game Loop ---
  var GRAVITY = 0.34;

  function update() {
    var now = Date.now();

    // Spawn check
    if (!state.gameOver && now - state.lastSpawnTime > state.spawnInterval) {
      spawnFruits();
      state.lastSpawnTime = now;
    }

    // Screen Shake Decay
    if (state.screenShake > 0) {
      state.screenShake *= 0.88;
      if (state.screenShake < 0.5) state.screenShake = 0;
    }

    // Clean old blade trail points
    state.bladeTrail = state.bladeTrail.filter(function (p) {
      return now - p.time < 180;
    });

    // Update Fruits
    for (var i = state.fruits.length - 1; i >= 0; i--) {
      var f = state.fruits[i];
      f.x += f.vx;
      f.y += f.vy;
      f.vy += GRAVITY;
      f.angle += f.vAngle;

      // Drop check
      if (f.y > state.height + 60 && f.vy > 0) {
        if (!f.sliced && !f.type.isBomb && !state.gameOver) {
          loseLife();
        }
        state.fruits.splice(i, 1);
      } else if (f.sliced) {
        state.fruits.splice(i, 1);
      }
    }

    // Update Half Fruits
    for (var h = state.halfFruits.length - 1; h >= 0; h--) {
      var hf = state.halfFruits[h];
      hf.x += hf.vx;
      hf.y += hf.vy;
      hf.vy += GRAVITY * 1.1;
      hf.angle += hf.vAngle;
      hf.alpha -= 0.015;
      if (hf.alpha <= 0 || hf.y > state.height + 60) {
        state.halfFruits.splice(h, 1);
      }
    }

    // Update Particles
    for (var p = state.particles.length - 1; p >= 0; p--) {
      var part = state.particles[p];
      part.x += part.vx;
      part.y += part.vy;
      part.vy += GRAVITY * 0.4;
      part.alpha -= part.decay;
      if (part.alpha <= 0) {
        state.particles.splice(p, 1);
      }
    }

    // Update Floating Texts
    for (var t = state.floatingTexts.length - 1; t >= 0; t--) {
      var ft = state.floatingTexts[t];
      ft.y += ft.vy;
      ft.alpha -= 0.025;
      if (ft.alpha <= 0) {
        state.floatingTexts.splice(t, 1);
      }
    }
  }

  function draw() {
    ctx.save();
    ctx.clearRect(0, 0, state.width, state.height);

    if (state.screenShake > 0) {
      var sx = (Math.random() - 0.5) * state.screenShake;
      var sy = (Math.random() - 0.5) * state.screenShake;
      ctx.translate(sx, sy);
    }

    // 1. Draw Particles (Fruit Juice / Sparks)
    state.particles.forEach(function (part) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, part.alpha);
      ctx.fillStyle = part.color;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 2. Draw Active Fruits
    state.fruits.forEach(function (f) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      ctx.font = (f.radius * 2) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.type.emoji, 0, 0);
      ctx.restore();
    });

    // 3. Draw Halves
    state.halfFruits.forEach(function (hf) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, hf.alpha);
      ctx.translate(hf.x, hf.y);
      ctx.rotate(hf.angle);

      // Clip half
      ctx.beginPath();
      if (hf.side === 'left') {
        ctx.rect(-hf.type.radius * 2, -hf.type.radius * 2, hf.type.radius * 2, hf.type.radius * 4);
      } else {
        ctx.rect(0, -hf.type.radius * 2, hf.type.radius * 2, hf.type.radius * 4);
      }
      ctx.clip();

      ctx.font = (hf.type.radius * 2) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hf.type.emoji, 0, 0);
      ctx.restore();
    });

    // 4. Draw Blade Trail (Neon Glow)
    if (state.bladeTrail.length > 1) {
      ctx.save();
      for (var b = 1; b < state.bladeTrail.length; b++) {
        var p0 = state.bladeTrail[b - 1];
        var p1 = state.bladeTrail[b];
        var progress = b / state.bladeTrail.length;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = progress * 6 + 1;
        ctx.lineCap = 'round';
        ctx.shadowColor = '#0284c7';
        ctx.shadowBlur = 12;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 5. Draw Floating Texts
    state.floatingTexts.forEach(function (ft) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.font = 'bold 15px -apple-system, sans-serif';
      ctx.fillStyle = ft.color;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 6;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });

    ctx.restore();
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // --- Init ---
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  restartGame();
  requestAnimationFrame(loop);
})();
