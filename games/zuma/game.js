/**
 * OmniGame - 经典祖玛 (Zuma)
 * Pure vanilla JS, HTML5 Canvas, Web Audio SFX, track path physics, chain reactions.
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
    shoot: function () {
      this.playTone(360, 'sine', 0.08, 0.15);
      this.playTone(520, 'triangle', 0.08, 0.1, 0.02);
    },
    insert: function () {
      this.playTone(280, 'triangle', 0.05, 0.12);
    },
    pop: function (count) {
      var base = 440 + Math.min(count, 8) * 40;
      this.playTone(base, 'triangle', 0.12, 0.2);
      this.playTone(base * 1.25, 'sine', 0.16, 0.18, 0.04);
      this.playTone(base * 1.5, 'sine', 0.2, 0.15, 0.08);
    },
    pullBack: function () {
      this.playTone(200, 'sine', 0.12, 0.1);
      this.playTone(300, 'triangle', 0.15, 0.1, 0.04);
    },
    win: function () {
      var notes = [523.25, 659.25, 783.99, 1046.5];
      var self = this;
      notes.forEach(function (f, i) {
        self.playTone(f, 'triangle', 0.22, 0.2, i * 0.08);
      });
    },
    lose: function () {
      this.playTone(220, 'sawtooth', 0.25, 0.2);
      this.playTone(160, 'sawtooth', 0.35, 0.2, 0.1);
    }
  };

  // --- Constants ---
  var COLORS = [
    { id: 'red', hex: '#ef4444', glow: '#f87171' },
    { id: 'blue', hex: '#3b82f6', glow: '#60a5fa' },
    { id: 'green', hex: '#10b981', glow: '#34d399' },
    { id: 'yellow', hex: '#facc15', glow: '#fde047' },
    { id: 'purple', hex: '#a855f7', glow: '#c084fc' }
  ];

  var BALL_RADIUS = 11;
  var BALL_DIAMETER = BALL_RADIUS * 2;

  // --- Canvas & DOM ---
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var wrapper = document.getElementById('canvasWrapper');

  var elements = {
    scoreText: document.getElementById('scoreText'),
    comboText: document.getElementById('comboText'),
    ballsLeftText: document.getElementById('ballsLeftText'),
    soundBtn: document.getElementById('soundBtn'),
    restartBtn: document.getElementById('restartBtn'),
    modal: document.getElementById('gameOverModal'),
    modalEmoji: document.getElementById('modalEmoji'),
    modalTitle: document.getElementById('modalTitle'),
    modalDesc: document.getElementById('modalDesc'),
    modalRestartBtn: document.getElementById('modalRestartBtn')
  };

  // --- State ---
  var state = {
    width: 360,
    height: 414,
    dpr: 1,
    score: 0,
    combo: 0,
    gameOver: false,
    gameWon: false,
    pathPoints: [],
    pathLength: 0,
    chain: [], // Array of ball objects: { color, d (distance along path) }
    bullets: [], // Active fired projectiles: { x, y, vx, vy, color }
    particles: [],
    shooter: { x: 180, y: 220, angle: 0, current: null, next: null },
    totalToSpawn: 45,
    spawnedCount: 0,
    chainSpeed: 0.72,
    pullSpeed: 0,
    lastPullTime: 0
  };

  // --- Generate Track Path (Looping S-Spiral) ---
  function generatePath() {
    state.pathPoints = [];
    var cx = state.width / 2;
    var cy = state.height / 2;

    // Parametric smooth path
    var steps = 600;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      // Start outer top-left, spiral inward towards cave
      var angle = t * Math.PI * 4.6;
      var r = (1 - t * 0.78) * (Math.min(state.width, state.height) * 0.44);
      var px = cx + Math.cos(angle) * r;
      var py = cy + Math.sin(angle) * (r * 0.88);
      state.pathPoints.push({ x: px, y: py });
    }

    // Precalculate cumulative distances along path
    var total = 0;
    state.pathPoints[0].dist = 0;
    for (var j = 1; j < state.pathPoints.length; j++) {
      var dx = state.pathPoints[j].x - state.pathPoints[j - 1].x;
      var dy = state.pathPoints[j].y - state.pathPoints[j - 1].y;
      total += Math.sqrt(dx * dx + dy * dy);
      state.pathPoints[j].dist = total;
    }
    state.pathLength = total;
  }

  function getPointAtDist(targetD) {
    if (targetD <= 0) return state.pathPoints[0];
    if (targetD >= state.pathLength) return state.pathPoints[state.pathPoints.length - 1];

    // Binary search or linear search for segment
    for (var i = 1; i < state.pathPoints.length; i++) {
      if (state.pathPoints[i].dist >= targetD) {
        var p0 = state.pathPoints[i - 1];
        var p1 = state.pathPoints[i];
        var segLen = p1.dist - p0.dist;
        var r = (targetD - p0.dist) / (segLen || 1);
        return {
          x: p0.x + (p1.x - p0.x) * r,
          y: p0.y + (p1.y - p0.y) * r
        };
      }
    }
    return state.pathPoints[state.pathPoints.length - 1];
  }

  // --- Resize ---
  function resizeCanvas() {
    var rect = wrapper.getBoundingClientRect();
    state.width = rect.width;
    state.height = rect.height;
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = state.width * state.dpr;
    canvas.height = state.height * state.dpr;
    ctx.scale(state.dpr, state.dpr);

    state.shooter.x = state.width / 2;
    state.shooter.y = state.height / 2;

    generatePath();
  }

  // --- Game Initialization ---
  function getRandomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  function initGame() {
    AudioSys.init();
    state.score = 0;
    state.combo = 0;
    state.gameOver = false;
    state.gameWon = false;
    state.chain = [];
    state.bullets = [];
    state.particles = [];
    state.totalToSpawn = 45;
    state.spawnedCount = 0;
    state.pullSpeed = 0;

    generatePath();

    state.shooter.current = getRandomColor();
    state.shooter.next = getRandomColor();

    elements.scoreText.textContent = '0';
    elements.comboText.textContent = '0';
    elements.ballsLeftText.textContent = state.totalToSpawn;
    elements.modal.classList.remove('active');
  }

  // --- Spawning Chain ---
  function updateChain() {
    if (state.gameOver || state.gameWon) return;

    // Spawn new balls at path start
    if (state.spawnedCount < state.totalToSpawn) {
      if (state.chain.length === 0 || state.chain[state.chain.length - 1].d > BALL_DIAMETER) {
        state.chain.push({
          color: getRandomColor(),
          d: 0
        });
        state.spawnedCount++;
        elements.ballsLeftText.textContent = (state.totalToSpawn - state.spawnedCount + state.chain.length);
      }
    }

    // Move Chain forward
    var advance = state.chainSpeed;
    if (state.pullSpeed < 0) {
      advance += state.pullSpeed;
      state.pullSpeed *= 0.88;
      if (Math.abs(state.pullSpeed) < 0.05) state.pullSpeed = 0;
    }

    if (state.chain.length > 0) {
      // Move front ball
      state.chain[0].d += advance;

      // Ensure following balls don't overlap, but stay closely packed
      for (var i = 1; i < state.chain.length; i++) {
        var desiredD = state.chain[i - 1].d - BALL_DIAMETER;
        if (state.chain[i].d > desiredD) {
          state.chain[i].d = desiredD;
        } else {
          // If there's a gap, back ball moves at standard advance
          state.chain[i].d += state.chainSpeed;
          // Magnet attraction if gap exists and colors match
          if (state.chain[i - 1].color.id === state.chain[i].color.id && desiredD - state.chain[i].d < 40) {
            state.chain[i].d += 1.8; // Accelerate back to reattach
          }
        }
      }

      // Check Skull Cave Entry
      if (state.chain[0].d >= state.pathLength - 10) {
        triggerGameOver(false);
      }
    } else if (state.spawnedCount >= state.totalToSpawn) {
      // Chain cleared!
      triggerGameOver(true);
    }
  }

  // --- Shoot Bullet ---
  function shootBullet() {
    if (state.gameOver || state.gameWon) return;
    AudioSys.init();
    AudioSys.shoot();

    var speed = 9.5;
    var bx = state.shooter.x;
    var by = state.shooter.y;
    var bvx = Math.cos(state.shooter.angle) * speed;
    var bvy = Math.sin(state.shooter.angle) * speed;

    state.bullets.push({
      x: bx,
      y: by,
      vx: bvx,
      vy: bvy,
      color: state.shooter.current
    });

    state.shooter.current = state.shooter.next;
    state.shooter.next = getRandomColor();
  }

  // --- Collision & Insertion ---
  function updateBullets() {
    for (var b = state.bullets.length - 1; b >= 0; b--) {
      var bullet = state.bullets[b];
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;

      // Check boundary
      if (bullet.x < -20 || bullet.x > state.width + 20 || bullet.y < -20 || bullet.y > state.height + 20) {
        state.bullets.splice(b, 1);
        continue;
      }

      // Check collision with balls in chain
      var collided = false;
      for (var c = 0; c < state.chain.length; c++) {
        var ball = state.chain[c];
        var bPos = getPointAtDist(ball.d);
        var dx = bullet.x - bPos.x;
        var dy = bullet.y - bPos.y;
        var distSq = dx * dx + dy * dy;

        if (distSq <= BALL_DIAMETER * BALL_DIAMETER) {
          // Collided! Insert bullet into chain
          collided = true;
          insertBallIntoChain(c, bullet.color);
          state.bullets.splice(b, 1);
          break;
        }
      }
    }
  }

  function insertBallIntoChain(index, color) {
    AudioSys.insert();
    var refD = state.chain[index].d;
    var newBall = {
      color: color,
      d: refD + BALL_RADIUS
    };

    state.chain.splice(index, 0, newBall);

    // Shift subsequent balls
    for (var i = index + 1; i < state.chain.length; i++) {
      state.chain[i].d -= BALL_DIAMETER;
    }

    checkMatches(index);
  }

  // --- Match 3 & Elimination ---
  function checkMatches(startIndex) {
    if (startIndex < 0 || startIndex >= state.chain.length) return;
    var targetColor = state.chain[startIndex].color.id;

    var left = startIndex;
    while (left > 0 && state.chain[left - 1].color.id === targetColor) {
      left--;
    }

    var right = startIndex;
    while (right < state.chain.length - 1 && state.chain[right + 1].color.id === targetColor) {
      right++;
    }

    var count = right - left + 1;
    if (count >= 3) {
      // Pop matching balls
      var poppedPos = [];
      for (var i = left; i <= right; i++) {
        poppedPos.push(getPointAtDist(state.chain[i].d));
      }

      state.chain.splice(left, count);
      AudioSys.pop(count);

      state.combo++;
      elements.comboText.textContent = state.combo;

      var pts = count * 10 * state.combo;
      state.score += pts;
      elements.scoreText.textContent = state.score;

      // Spawn particles
      poppedPos.forEach(function (pos) {
        createSparks(pos.x, pos.y, targetColor);
      });

      // Magnetic Pull-Back if ends have same color
      if (left > 0 && left < state.chain.length) {
        if (state.chain[left - 1].color.id === state.chain[left].color.id) {
          AudioSys.pullBack();
          state.pullSpeed = -2.5;
          setTimeout(function () {
            checkMatches(left);
          }, 240);
        }
      }

      elements.ballsLeftText.textContent = (state.totalToSpawn - state.spawnedCount + state.chain.length);
    } else {
      state.combo = 0;
      elements.comboText.textContent = '0';
    }
  }

  function createSparks(x, y, colorId) {
    var hex = COLORS.find(function (c) { return c.id === colorId; }) || COLORS[0];
    for (var i = 0; i < 14; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 1.5 + Math.random() * 4.5;
      state.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color: hex.hex,
        radius: 2 + Math.random() * 2.5,
        alpha: 1
      });
    }
  }

  function updateParticles() {
    for (var i = state.particles.length - 1; i >= 0; i--) {
      var p = state.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= 0.035;
      if (p.alpha <= 0) {
        state.particles.splice(i, 1);
      }
    }
  }

  // --- Game Over / Victory ---
  function triggerGameOver(isWin) {
    if (state.gameOver || state.gameWon) return;
    if (isWin) {
      state.gameWon = true;
      AudioSys.win();
      elements.modalEmoji.textContent = '👑';
      elements.modalTitle.textContent = '🎉 完美清盘！祖玛大师！';
      elements.modalDesc.textContent = '获得总分: ' + state.score + ' 分';
    } else {
      state.gameOver = true;
      AudioSys.lose();
      elements.modalEmoji.textContent = '💀';
      elements.modalTitle.textContent = '珠链沉入骷髅洞！';
      elements.modalDesc.textContent = '最终得分: ' + state.score + ' 分';
    }

    try {
      var best = parseInt(localStorage.getItem('omg:save:zuma') || '0', 10);
      if (state.score > best) {
        localStorage.setItem('omg:save:zuma', state.score.toString());
      }
    } catch (e) {}

    elements.modal.classList.add('active');
  }

  // --- Rendering ---
  function draw() {
    ctx.save();
    ctx.clearRect(0, 0, state.width, state.height);

    // 1. Draw Track
    if (state.pathPoints.length > 1) {
      ctx.beginPath();
      ctx.moveTo(state.pathPoints[0].x, state.pathPoints[0].y);
      for (var p = 1; p < state.pathPoints.length; p++) {
        ctx.lineTo(state.pathPoints[p].x, state.pathPoints[p].y);
      }
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.12)';
      ctx.lineWidth = BALL_DIAMETER + 6;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.strokeStyle = 'rgba(5, 150, 105, 0.28)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // 2. Draw Skull Cave at end of track
    var endPoint = state.pathPoints[state.pathPoints.length - 1];
    if (endPoint) {
      ctx.beginPath();
      ctx.arc(endPoint.x, endPoint.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💀', endPoint.x, endPoint.y);
    }

    // 3. Draw Chain Balls
    state.chain.forEach(function (ball) {
      var pt = getPointAtDist(ball.d);
      ctx.save();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = ball.color.hex;
      ctx.shadowColor = ball.color.glow;
      ctx.shadowBlur = 8;
      ctx.fill();

      // Shiny highlight
      ctx.beginPath();
      ctx.arc(pt.x - 3, pt.y - 3, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.fill();
      ctx.restore();
    });

    // 4. Draw Bullets
    state.bullets.forEach(function (b) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = b.color.hex;
      ctx.shadowColor = b.color.glow;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.restore();
    });

    // 5. Draw Particles
    state.particles.forEach(function (pt) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.alpha);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
      ctx.fillStyle = pt.color;
      ctx.fill();
      ctx.restore();
    });

    // 6. Draw Frog Shooter
    ctx.save();
    ctx.translate(state.shooter.x, state.shooter.y);
    ctx.rotate(state.shooter.angle);

    // Frog base
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#047857';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.fill();
    ctx.stroke();

    // Frog snout / cannon barrel
    ctx.beginPath();
    ctx.rect(0, -6, 26, 12);
    ctx.fillStyle = '#065f46';
    ctx.fill();

    // Loaded ball in frog mouth
    if (state.shooter.current) {
      ctx.beginPath();
      ctx.arc(14, 0, BALL_RADIUS - 1, 0, Math.PI * 2);
      ctx.fillStyle = state.shooter.current.hex;
      ctx.shadowColor = state.shooter.current.glow;
      ctx.shadowBlur = 8;
      ctx.fill();
    }

    // Next ammo ball on back
    if (state.shooter.next) {
      ctx.beginPath();
      ctx.arc(-8, 0, BALL_RADIUS - 3, 0, Math.PI * 2);
      ctx.fillStyle = state.shooter.next.hex;
      ctx.fill();
    }

    ctx.restore();

    ctx.restore();
  }

  // --- Loop ---
  function loop() {
    updateChain();
    updateBullets();
    updateParticles();
    draw();
    requestAnimationFrame(loop);
  }

  // --- Input Handlers ---
  function updateAimAngle(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var mouseX = clientX - rect.left;
    var mouseY = clientY - rect.top;
    state.shooter.angle = Math.atan2(mouseY - state.shooter.y, mouseX - state.shooter.x);
  }

  wrapper.addEventListener('mousemove', function (e) {
    updateAimAngle(e.clientX, e.clientY);
  });

  wrapper.addEventListener('click', function (e) {
    updateAimAngle(e.clientX, e.clientY);
    shootBullet();
  });

  wrapper.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches.length > 0) {
      updateAimAngle(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  wrapper.addEventListener('touchstart', function (e) {
    if (e.touches && e.touches.length > 0) {
      updateAimAngle(e.touches[0].clientX, e.touches[0].clientY);
      shootBullet();
    }
  }, { passive: true });

  elements.soundBtn.addEventListener('click', function () {
    AudioSys.enabled = !AudioSys.enabled;
    elements.soundBtn.textContent = AudioSys.enabled ? '🔊' : '🔇';
  });

  elements.restartBtn.addEventListener('click', initGame);
  elements.modalRestartBtn.addEventListener('click', initGame);

  window.addEventListener('resize', resizeCanvas);

  // Start
  resizeCanvas();
  initGame();
  requestAnimationFrame(loop);
})();
