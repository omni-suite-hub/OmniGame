/**
 * OmniGame - 街头投篮 (Basketball Shootout)
 * Pure vanilla JS, Canvas 2D projectile physics, rim & backboard collisions, swish net, Web Audio.
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
    bounce: function () {
      this.playTone(180, 'sine', 0.08, 0.2);
    },
    backboard: function () {
      this.playTone(280, 'triangle', 0.08, 0.25);
      this.playTone(140, 'sine', 0.1, 0.2, 0.02);
    },
    rim: function () {
      this.playTone(580, 'triangle', 0.06, 0.22);
      this.playTone(880, 'sine', 0.08, 0.15, 0.01);
    },
    swish: function () {
      var notes = [587.33, 739.99, 880, 1174.66];
      var self = this;
      notes.forEach(function (f, i) {
        self.playTone(f, 'triangle', 0.16, 0.2, i * 0.04);
      });
    },
    buzzer: function () {
      this.playTone(140, 'sawtooth', 0.6, 0.25);
    }
  };

  // --- Canvas & DOM ---
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var wrapper = document.getElementById('canvasWrapper');

  var elements = {
    scoreText: document.getElementById('scoreText'),
    streakText: document.getElementById('streakText'),
    timerText: document.getElementById('timerText'),
    soundBtn: document.getElementById('soundBtn'),
    restartBtn: document.getElementById('restartBtn'),
    modal: document.getElementById('gameOverModal'),
    modalDesc: document.getElementById('modalDesc'),
    modalRestartBtn: document.getElementById('modalRestartBtn')
  };

  // --- Game State ---
  var state = {
    width: 360,
    height: 468,
    dpr: 1,
    score: 0,
    streak: 0,
    timeLeft: 60,
    timerInterval: null,
    gameOver: false,
    ball: {
      x: 80,
      y: 350,
      vx: 0,
      vy: 0,
      r: 16,
      inAir: false,
      touchedRim: false,
      scored: false
    },
    drag: {
      active: false,
      startX: 0,
      startY: 0,
      curX: 0,
      curY: 0
    },
    hoop: {
      backboardX: 280,
      backboardTopY: 90,
      backboardBottomY: 190,
      rimLeftX: 226,
      rimRightX: 278,
      rimY: 170
    },
    particles: [],
    netRipples: 0
  };

  function resizeCanvas() {
    var rect = wrapper.getBoundingClientRect();
    state.width = rect.width;
    state.height = rect.height;
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = state.width * state.dpr;
    canvas.height = state.height * state.dpr;
    ctx.scale(state.dpr, state.dpr);

    // Setup Hoop Geometry
    state.hoop.backboardX = state.width * 0.82;
    state.hoop.backboardTopY = state.height * 0.18;
    state.hoop.backboardBottomY = state.height * 0.38;
    state.hoop.rimRightX = state.hoop.backboardX;
    state.hoop.rimLeftX = state.hoop.backboardX - 52;
    state.hoop.rimY = state.height * 0.34;

    resetBall();
  }

  function resetBall() {
    state.ball.x = state.width * 0.22 + (Math.random() - 0.5) * 30;
    state.ball.y = state.height * 0.76;
    state.ball.vx = 0;
    state.ball.vy = 0;
    state.ball.inAir = false;
    state.ball.touchedRim = false;
    state.ball.scored = false;
  }

  // --- Game Flow ---
  function initGame() {
    AudioSys.init();
    clearInterval(state.timerInterval);
    state.score = 0;
    state.streak = 0;
    state.timeLeft = 60;
    state.gameOver = false;
    state.particles = [];
    state.netRipples = 0;

    elements.scoreText.textContent = '0';
    elements.streakText.textContent = '0';
    elements.timerText.textContent = '60s';
    elements.modal.classList.remove('active');

    resetBall();

    state.timerInterval = setInterval(function () {
      if (!state.gameOver) {
        state.timeLeft--;
        elements.timerText.textContent = state.timeLeft + 's';
        if (state.timeLeft <= 0) {
          triggerGameOver();
        }
      }
    }, 1000);
  }

  function triggerGameOver() {
    state.gameOver = true;
    clearInterval(state.timerInterval);
    AudioSys.buzzer();

    try {
      var best = parseInt(localStorage.getItem('omg:save:basketball') || '0', 10);
      if (state.score > best) {
        localStorage.setItem('omg:save:basketball', state.score.toString());
      }
    } catch (e) {}

    elements.modalDesc.textContent = '最终得分: ' + state.score + ' 分 · 最高连中: ' + state.streak + ' 球';
    elements.modal.classList.add('active');
  }

  // --- Physics Update ---
  var GRAVITY = 0.38;
  var AIR_RESISTANCE = 0.996;

  function updatePhysics() {
    if (state.gameOver) return;

    var b = state.ball;
    if (!b.inAir) return;

    var prevY = b.y;

    b.vy += GRAVITY;
    b.vx *= AIR_RESISTANCE;
    b.vy *= AIR_RESISTANCE;

    b.x += b.vx;
    b.y += b.vy;

    // 1. Check Score Passing Rim
    var h = state.hoop;
    if (!b.scored && prevY < h.rimY && b.y >= h.rimY && b.x > h.rimLeftX + 6 && b.x < h.rimRightX - 6 && b.vy > 0) {
      b.scored = true;
      state.netRipples = 15;
      AudioSys.swish();

      var points = b.touchedRim ? 2 : 3;
      state.streak++;
      if (state.streak >= 3) points += 2; // Flame streak bonus

      state.score += points;
      elements.scoreText.textContent = state.score;
      elements.streakText.textContent = state.streak;

      createFireParticles(h.rimLeftX + 26, h.rimY + 10, !b.touchedRim);
    }

    // 2. Backboard Collision
    if (b.x + b.r > h.backboardX && b.x - b.r < h.backboardX + 10 && b.y > h.backboardTopY && b.y < h.backboardBottomY) {
      b.x = h.backboardX - b.r;
      b.vx = -Math.abs(b.vx) * 0.72;
      b.touchedRim = true;
      AudioSys.backboard();
    }

    // 3. Rim Peg Collisions (Left & Right Pegs)
    checkRimPegCollision(b, h.rimLeftX, h.rimY);
    checkRimPegCollision(b, h.rimRightX, h.rimY);

    // 4. Floor / Screen Bottom Out of Bounds
    if (b.y > state.height + 40 || b.x < -30 || b.x > state.width + 30) {
      if (!b.scored) {
        state.streak = 0;
        elements.streakText.textContent = '0';
      }
      setTimeout(resetBall, 250);
    }
  }

  function checkRimPegCollision(b, px, py) {
    var dx = b.x - px;
    var dy = b.y - py;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var minDist = b.r + 3;

    if (dist < minDist) {
      var nx = dx / (dist || 1);
      var ny = dy / (dist || 1);
      b.x = px + nx * (minDist + 0.5);

      var normalSpeed = b.vx * nx + b.vy * ny;
      b.vx = (b.vx - 2 * normalSpeed * nx) * 0.68;
      b.vy = (b.vy - 2 * normalSpeed * ny) * 0.68;

      b.touchedRim = true;
      AudioSys.rim();
    }
  }

  function createFireParticles(x, y, isSwish) {
    var count = isSwish ? 24 : 14;
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 1.5 + Math.random() * 5;
      state.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 2,
        r: 2.5 + Math.random() * 3,
        color: Math.random() < 0.6 ? '#f97316' : '#facc15',
        alpha: 1
      });
    }
  }

  function updateParticles() {
    for (var i = state.particles.length - 1; i >= 0; i--) {
      var p = state.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= 0.04;
      if (p.alpha <= 0) {
        state.particles.splice(i, 1);
      }
    }
    if (state.netRipples > 0) state.netRipples--;
  }

  // --- Rendering ---
  function draw() {
    ctx.save();
    ctx.clearRect(0, 0, state.width, state.height);

    var h = state.hoop;

    // 1. Draw Backboard Pole & Board
    ctx.fillStyle = '#64748b';
    ctx.fillRect(h.backboardX + 8, h.backboardBottomY, 12, state.height);

    // Backboard
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(h.backboardX, h.backboardTopY, 8, h.backboardBottomY - h.backboardTopY);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(h.backboardX - 1, h.rimY - 26, 6, 32);

    // 2. Draw Rim
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(h.rimLeftX, h.rimY);
    ctx.lineTo(h.rimRightX, h.rimY);
    ctx.stroke();

    // 3. Draw Net (with ripple simulation)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 1.5;
    var netBottom = h.rimY + 34;
    var ripple = (state.netRipples > 0 ? Math.sin(Date.now() * 0.05) * 6 : 0);

    for (var n = 0; n <= 4; n++) {
      var topX = h.rimLeftX + (h.rimRightX - h.rimLeftX) * (n / 4);
      var botX = h.rimLeftX + 10 + (h.rimRightX - h.rimLeftX - 20) * (n / 4) + ripple;
      ctx.beginPath();
      ctx.moveTo(topX, h.rimY);
      ctx.lineTo(botX, netBottom);
      ctx.stroke();
    }

    // 4. Draw Trajectory Line when dragging
    if (state.drag.active && !state.ball.inAir) {
      var dx = state.ball.x - state.drag.curX;
      var dy = state.ball.y - state.drag.curY;
      var simVx = dx * 0.16;
      var simVy = dy * 0.16;

      ctx.save();
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      var simX = state.ball.x;
      var simY = state.ball.y;
      ctx.moveTo(simX, simY);

      for (var s = 0; s < 25; s++) {
        simVy += GRAVITY;
        simX += simVx;
        simY += simVy;
        ctx.lineTo(simX, simY);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 5. Draw Basketball
    var b = state.ball;
    ctx.save();
    ctx.translate(b.x, b.y);

    // Orange Ball
    ctx.beginPath();
    ctx.arc(0, 0, b.r, 0, Math.PI * 2);
    var ballGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, b.r);
    ballGrad.addColorStop(0, '#fb923c');
    ballGrad.addColorStop(0.7, '#ea580c');
    ballGrad.addColorStop(1, '#9a3412');
    ctx.fillStyle = ballGrad;
    ctx.shadowColor = '#ea580c';
    ctx.shadowBlur = state.streak >= 3 ? 16 : 6;
    ctx.fill();

    // Black Seams
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-b.r, 0);
    ctx.lineTo(b.r, 0);
    ctx.moveTo(0, -b.r);
    ctx.lineTo(0, b.r);
    ctx.arc(0, 0, b.r * 0.65, 0, Math.PI);
    ctx.stroke();

    ctx.restore();

    // 6. Draw Particles
    state.particles.forEach(function (p) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    ctx.restore();
  }

  function loop() {
    updatePhysics();
    updateParticles();
    draw();
    requestAnimationFrame(loop);
  }

  // --- Input Handlers ---
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
    if (state.gameOver || state.ball.inAir) return;
    AudioSys.init();
    var pos = getCanvasPos(e);
    state.drag.active = true;
    state.drag.startX = pos.x;
    state.drag.startY = pos.y;
    state.drag.curX = pos.x;
    state.drag.curY = pos.y;
  }

  function onPointerMove(e) {
    if (!state.drag.active) return;
    var pos = getCanvasPos(e);
    state.drag.curX = pos.x;
    state.drag.curY = pos.y;
  }

  function onPointerUp() {
    if (!state.drag.active) return;
    state.drag.active = false;

    if (!state.ball.inAir) {
      var dx = state.ball.x - state.drag.curX;
      var dy = state.ball.y - state.drag.curY;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 15) {
        state.ball.inAir = true;
        state.ball.vx = Math.max(-14, Math.min(14, dx * 0.16));
        state.ball.vy = Math.max(-17, Math.min(2, dy * 0.16));
      }
    }
  }

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

  elements.restartBtn.addEventListener('click', initGame);
  elements.modalRestartBtn.addEventListener('click', initGame);

  window.addEventListener('resize', resizeCanvas);

  // Init
  resizeCanvas();
  initGame();
  requestAnimationFrame(loop);
})();
