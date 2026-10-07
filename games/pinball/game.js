/**
 * OmniGame - 街机弹珠台 (Pinball)
 * Pure vanilla JS, Canvas 2D Physics, neon bumpers, flippers, spring plunger, Web Audio.
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
    flipper: function () {
      this.playTone(320, 'triangle', 0.05, 0.12);
      this.playTone(460, 'sine', 0.04, 0.08, 0.01);
    },
    bumper: function (freq) {
      this.playTone(freq || 620, 'sine', 0.1, 0.22);
      this.playTone((freq || 620) * 1.5, 'triangle', 0.14, 0.16, 0.02);
    },
    plunger: function () {
      this.playTone(180, 'sine', 0.15, 0.2);
      this.playTone(380, 'triangle', 0.1, 0.15, 0.05);
    },
    drain: function () {
      this.playTone(160, 'sawtooth', 0.2, 0.15);
      this.playTone(120, 'sawtooth', 0.25, 0.15, 0.08);
    },
    gameover: function () {
      var notes = [330, 293.66, 261.63, 196];
      var self = this;
      notes.forEach(function (f, i) {
        self.playTone(f, 'sawtooth', 0.2, 0.15, i * 0.1);
      });
    }
  };

  // --- Canvas & DOM ---
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var wrapper = document.getElementById('canvasWrapper');

  var elements = {
    scoreText: document.getElementById('scoreText'),
    multText: document.getElementById('multText'),
    ballsContainer: document.getElementById('ballsContainer'),
    soundBtn: document.getElementById('soundBtn'),
    restartBtn: document.getElementById('restartBtn'),
    leftTouchBtn: document.getElementById('leftTouchBtn'),
    rightTouchBtn: document.getElementById('rightTouchBtn'),
    plungerTouchBtn: document.getElementById('plungerTouchBtn'),
    modal: document.getElementById('gameOverModal'),
    modalDesc: document.getElementById('modalDesc'),
    modalRestartBtn: document.getElementById('modalRestartBtn')
  };

  // --- Game State & Physics Variables ---
  var state = {
    width: 360,
    height: 468,
    dpr: 1,
    score: 0,
    multiplier: 1,
    ballsLeft: 3,
    gameOver: false,
    ball: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 7.5,
      inPlay: false
    },
    plunger: {
      charging: false,
      charge: 0 // 0 to 1
    },
    leftFlipper: {
      pivotX: 0,
      pivotY: 0,
      len: 44,
      restAngle: 0.48, // radians down
      activeAngle: -0.42, // radians up
      currentAngle: 0.48,
      active: false
    },
    rightFlipper: {
      pivotX: 0,
      pivotY: 0,
      len: 44,
      restAngle: Math.PI - 0.48,
      activeAngle: Math.PI + 0.42,
      currentAngle: Math.PI - 0.48,
      active: false
    },
    bumpers: [],
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

    // Setup Flipper Positions
    state.leftFlipper.pivotX = state.width * 0.28;
    state.leftFlipper.pivotY = state.height * 0.85;

    state.rightFlipper.pivotX = state.width * 0.64;
    state.rightFlipper.pivotY = state.height * 0.85;

    // Setup Bumpers
    state.bumpers = [
      { x: state.width * 0.34, y: state.height * 0.26, r: 18, color: '#ec4899', pts: 100, flash: 0, tone: 580 },
      { x: state.width * 0.60, y: state.height * 0.26, r: 18, color: '#38bdf8', pts: 100, flash: 0, tone: 680 },
      { x: state.width * 0.47, y: state.height * 0.42, r: 22, color: '#facc15', pts: 250, flash: 0, tone: 800 }
    ];
  }

  // --- Reset Ball to Plunger Lane ---
  function resetBallToPlunger() {
    state.ball.x = state.width - 15;
    state.ball.y = state.height - 40;
    state.ball.vx = 0;
    state.ball.vy = 0;
    state.ball.inPlay = false;
  }

  function launchBall(power) {
    if (state.ball.inPlay) return;
    AudioSys.init();
    AudioSys.plunger();
    state.ball.inPlay = true;
    var p = Math.max(0.6, power || 0.9);
    state.ball.vy = -14.5 * p;
    state.ball.vx = (Math.random() - 0.5) * 0.8;
  }

  // --- Game Flow ---
  function initGame() {
    AudioSys.init();
    state.score = 0;
    state.multiplier = 1;
    state.ballsLeft = 3;
    state.gameOver = false;
    state.particles = [];

    elements.scoreText.textContent = '0';
    elements.multText.textContent = 'x1';
    updateBallsUI();
    elements.modal.classList.remove('active');

    resetBallToPlunger();
  }

  function updateBallsUI() {
    var icons = elements.ballsContainer.querySelectorAll('.ball-icon');
    icons.forEach(function (ic, i) {
      if (i < state.ballsLeft) {
        ic.classList.remove('lost');
      } else {
        ic.classList.add('lost');
      }
    });
  }

  function onBallDrain() {
    AudioSys.drain();
    state.ballsLeft--;
    updateBallsUI();

    if (state.ballsLeft <= 0) {
      triggerGameOver();
    } else {
      setTimeout(resetBallToPlunger, 700);
    }
  }

  function triggerGameOver() {
    state.gameOver = true;
    AudioSys.gameover();

    try {
      var best = parseInt(localStorage.getItem('omg:save:pinball') || '0', 10);
      if (state.score > best) {
        localStorage.setItem('omg:save:pinball', state.score.toString());
      }
    } catch (e) {}

    elements.modalDesc.textContent = '获得街机总分: ' + state.score + ' 分';
    elements.modal.classList.add('active');
  }

  // --- Physics Update ---
  var GRAVITY = 0.24;
  var DAMPING = 0.995;

  function updatePhysics() {
    if (state.gameOver) return;

    // 1. Update Flippers
    var lf = state.leftFlipper;
    var targetL = lf.active ? lf.activeAngle : lf.restAngle;
    lf.currentAngle += (targetL - lf.currentAngle) * 0.42;

    var rf = state.rightFlipper;
    var targetR = rf.active ? rf.activeAngle : rf.restAngle;
    rf.currentAngle += (targetR - rf.currentAngle) * 0.42;

    if (!state.ball.inPlay) return;

    var b = state.ball;
    b.vy += GRAVITY;
    b.vx *= DAMPING;
    b.vy *= DAMPING;

    b.x += b.vx;
    b.y += b.vy;

    // 2. Playfield Outer Boundaries & Plunger Lane
    var rightWall = state.width - 5;
    var leftWall = 8;
    var topWall = 8;
    var laneWallX = state.width - 28;

    // Left Wall
    if (b.x - b.r < leftWall) {
      b.x = leftWall + b.r;
      b.vx = Math.abs(b.vx) * 0.75;
    }

    // Right Wall (Plunger outer wall)
    if (b.x + b.r > rightWall) {
      b.x = rightWall - b.r;
      b.vx = -Math.abs(b.vx) * 0.75;
    }

    // Top Curve & Plunger Gate
    if (b.y - b.r < topWall) {
      b.y = topWall + b.r;
      b.vy = Math.abs(b.vy) * 0.75;
      // Guide into playfield
      if (b.x > state.width * 0.6) {
        b.vx -= 3;
      }
    }

    // Plunger Dividing Wall
    if (b.y > 60 && b.x > laneWallX - b.r && b.x < laneWallX + 8) {
      if (b.x < laneWallX) {
        b.x = laneWallX - b.r;
        b.vx = -Math.abs(b.vx) * 0.75;
      } else {
        b.x = laneWallX + 8 + b.r;
        b.vx = Math.abs(b.vx) * 0.75;
      }
    }

    // Side Slanted Guides
    // Left slanted guide: from (8, H*0.62) to (leftPivot, H*0.85)
    checkLineCollision(b, 8, state.height * 0.62, lf.pivotX - 6, lf.pivotY);
    // Right slanted guide: from (laneWallX, H*0.62) to (rightPivot, H*0.85)
    checkLineCollision(b, laneWallX, state.height * 0.62, rf.pivotX + 6, rf.pivotY);

    // 3. Flipper Segment Collisions
    checkFlipperCollision(b, lf, true);
    checkFlipperCollision(b, rf, false);

    // 4. Bumpers Collision
    state.bumpers.forEach(function (bmp) {
      var dx = b.x - bmp.x;
      var dy = b.y - bmp.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var minDist = b.r + bmp.r;

      if (dist < minDist) {
        // Bounce impulse
        var nx = dx / (dist || 1);
        var ny = dy / (dist || 1);
        b.x = bmp.x + nx * (minDist + 1);

        var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        var boost = Math.max(8.5, speed * 1.25);
        b.vx = nx * boost;
        b.vy = ny * boost;

        bmp.flash = 12;
        AudioSys.bumper(bmp.tone);

        var pts = bmp.pts * state.multiplier;
        state.score += pts;
        elements.scoreText.textContent = state.score;

        createBumperParticles(bmp.x, bmp.y, bmp.color);
      }

      if (bmp.flash > 0) bmp.flash--;
    });

    // 5. Drain Check
    if (b.y > state.height + 25) {
      onBallDrain();
    }
  }

  function checkLineCollision(b, x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return;

    var u = ((b.x - x1) * dx + (b.y - y1) * dy) / lenSq;
    u = Math.max(0, Math.min(1, u));
    var nearestX = x1 + u * dx;
    var nearestY = y1 + u * dy;

    var distDx = b.x - nearestX;
    var distDy = b.y - nearestY;
    var dist = Math.sqrt(distDx * distDx + distDy * distDy);

    if (dist < b.r) {
      var nx = distDx / (dist || 1);
      var ny = distDy / (dist || 1);
      b.x = nearestX + nx * (b.r + 0.5);

      var dot = b.vx * nx + b.vy * ny;
      b.vx = (b.vx - 2 * dot * nx) * 0.78;
      b.vy = (b.vy - 2 * dot * ny) * 0.78;
    }
  }

  function checkFlipperCollision(b, flipper, isLeft) {
    var tipX = flipper.pivotX + Math.cos(flipper.currentAngle) * flipper.len;
    var tipY = flipper.pivotY + Math.sin(flipper.currentAngle) * flipper.len;

    var dx = tipX - flipper.pivotX;
    var dy = tipY - flipper.pivotY;
    var lenSq = dx * dx + dy * dy;

    var u = ((b.x - flipper.pivotX) * dx + (b.y - flipper.pivotY) * dy) / lenSq;
    if (u >= 0 && u <= 1) {
      var nearestX = flipper.pivotX + u * dx;
      var nearestY = flipper.pivotY + u * dy;
      var distDx = b.x - nearestX;
      var distDy = b.y - nearestY;
      var dist = Math.sqrt(distDx * distDx + distDy * distDy);

      if (dist < b.r + 4) {
        var nx = distDx / (dist || 1);
        var ny = distDy / (dist || 1);
        b.x = nearestX + nx * (b.r + 5);

        var normalSpeed = b.vx * nx + b.vy * ny;
        b.vx = (b.vx - 2 * normalSpeed * nx) * 0.75;
        b.vy = (b.vy - 2 * normalSpeed * ny) * 0.75;

        // Flipper kick upward if active
        if (flipper.active) {
          b.vy = -Math.abs(b.vy) - 9.5;
          b.vx += (isLeft ? 2.5 : -2.5);
          AudioSys.flipper();
        }
      }
    }
  }

  function createBumperParticles(x, y, color) {
    for (var i = 0; i < 12; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 1.5 + Math.random() * 4;
      state.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color: color,
        r: 2 + Math.random() * 2,
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
  }

  // --- Rendering ---
  function draw() {
    ctx.save();
    ctx.clearRect(0, 0, state.width, state.height);

    // 1. Draw Plunger Dividing Wall & Curve
    var laneX = state.width - 28;
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(laneX, state.height);
    ctx.lineTo(laneX, 70);
    ctx.stroke();

    // Side guides
    ctx.beginPath();
    ctx.moveTo(8, state.height * 0.62);
    ctx.lineTo(state.leftFlipper.pivotX - 6, state.leftFlipper.pivotY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(laneX, state.height * 0.62);
    ctx.lineTo(state.rightFlipper.pivotX + 6, state.rightFlipper.pivotY);
    ctx.stroke();

    // 2. Draw Bumpers
    state.bumpers.forEach(function (bmp) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(bmp.x, bmp.y, bmp.r, 0, Math.PI * 2);
      ctx.fillStyle = bmp.flash > 0 ? '#ffffff' : bmp.color;
      ctx.shadowColor = bmp.color;
      ctx.shadowBlur = bmp.flash > 0 ? 25 : 14;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(bmp.x, bmp.y, bmp.r * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = '#0f0728';
      ctx.fill();
      ctx.restore();
    });

    // 3. Draw Flippers
    var drawFlipper = function (fl, isLeft) {
      var tipX = fl.pivotX + Math.cos(fl.currentAngle) * fl.len;
      var tipY = fl.pivotY + Math.sin(fl.currentAngle) * fl.len;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(fl.pivotX, fl.pivotY);
      ctx.lineTo(tipX, tipY);
      ctx.strokeStyle = fl.active ? '#f472b6' : '#ec4899';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#ec4899';
      ctx.shadowBlur = 10;
      ctx.stroke();

      // Pivot cap
      ctx.beginPath();
      ctx.arc(fl.pivotX, fl.pivotY, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
      ctx.restore();
    };

    drawFlipper(state.leftFlipper, true);
    drawFlipper(state.rightFlipper, false);

    // 4. Draw Particles
    state.particles.forEach(function (p) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 5. Draw Silver Ball
    var b = state.ball;
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    var ballGrad = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, b.r);
    ballGrad.addColorStop(0, '#ffffff');
    ballGrad.addColorStop(0.5, '#cbd5e1');
    ballGrad.addColorStop(1, '#64748b');
    ctx.fillStyle = ballGrad;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  function loop() {
    updatePhysics();
    updateParticles();
    draw();
    requestAnimationFrame(loop);
  }

  // --- Input Handlers ---
  function setLeftFlipper(active) {
    AudioSys.init();
    if (active && !state.leftFlipper.active) AudioSys.flipper();
    state.leftFlipper.active = active;
  }

  function setRightFlipper(active) {
    AudioSys.init();
    if (active && !state.rightFlipper.active) AudioSys.flipper();
    state.rightFlipper.active = active;
  }

  // Keyboard controls
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      setLeftFlipper(true);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      setRightFlipper(true);
    } else if (e.key === ' ' || e.key === 'ArrowDown' || e.key === 's') {
      launchBall(1.0);
    }
  });

  window.addEventListener('keyup', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      setLeftFlipper(false);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      setRightFlipper(false);
    }
  });

  // Touch button controls
  elements.leftTouchBtn.addEventListener('touchstart', function (e) { e.preventDefault(); setLeftFlipper(true); });
  elements.leftTouchBtn.addEventListener('touchend', function (e) { e.preventDefault(); setLeftFlipper(false); });
  elements.leftTouchBtn.addEventListener('mousedown', function () { setLeftFlipper(true); });
  elements.leftTouchBtn.addEventListener('mouseup', function () { setLeftFlipper(false); });

  elements.rightTouchBtn.addEventListener('touchstart', function (e) { e.preventDefault(); setRightFlipper(true); });
  elements.rightTouchBtn.addEventListener('touchend', function (e) { e.preventDefault(); setRightFlipper(false); });
  elements.rightTouchBtn.addEventListener('mousedown', function () { setRightFlipper(true); });
  elements.rightTouchBtn.addEventListener('mouseup', function () { setRightFlipper(false); });

  elements.plungerTouchBtn.addEventListener('click', function () { launchBall(1.0); });

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
