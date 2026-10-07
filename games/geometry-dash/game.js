// Geometry Dash (几何冲刺) - OmniGame High Polish Engine
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

  function playJumpSound() { playTone(440, 0.08, 'square', 0.12); }
  function playPadSound() {
    playTone(550, 0.1, 'sawtooth', 0.15);
    setTimeout(function () { playTone(880, 0.12, 'square', 0.15); }, 50);
  }
  function playCrashSound() {
    playTone(120, 0.25, 'sawtooth', 0.3);
    setTimeout(function () { playTone(60, 0.35, 'square', 0.3); }, 80);
  }
  function playWinSound() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { playTone(f, 0.25, 'triangle', 0.2); }, i * 110);
    });
  }

  // --- Background Synth Rhythm Beat ---
  var beatTimer = null;
  var beatStep = 0;
  var BEAT_FREQS = [110, 165, 110, 220, 110, 165, 130, 220];

  function startMusic() {
    stopMusic();
    beatStep = 0;
    beatTimer = setInterval(function () {
      if (!soundEnabled || !isPlaying) return;
      playTone(BEAT_FREQS[beatStep % BEAT_FREQS.length], 0.06, 'triangle', 0.04);
      beatStep++;
    }, 180);
  }

  function stopMusic() {
    if (beatTimer) {
      clearInterval(beatTimer);
      beatTimer = null;
    }
  }

  // Canvas
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var progressTextEl = document.getElementById('progressText');
  var attemptsTextEl = document.getElementById('attemptsText');
  var bestTextEl = document.getElementById('bestText');
  var progressBarEl = document.getElementById('progressBar');
  var startHintEl = document.getElementById('startHint');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  var GRAVITY = 0.65;
  var JUMP_FORCE = -10.2;
  var SPEED = 4.8;
  var FLOOR_Y = 240;
  var TOTAL_COURSE_LENGTH = 3600;

  var isPlaying = false;
  var isDead = false;
  var attempts = 1;
  var bestPercent = 0;

  var player = {
    x: 60,
    y: FLOOR_Y - 24,
    w: 24,
    h: 24,
    vy: 0,
    rotation: 0,
    onGround: true
  };

  var cameraX = 0;
  var particles = [];

  // Course Obstacles:
  // spikes: { type: 'spike', x: ... }
  // blocks: { type: 'block', x: ..., y: ..., w: ..., h: ... }
  // pads:   { type: 'pad', x: ..., y: ... }
  function generateLevel() {
    var obs = [];

    // Section 1: Intro spikes
    obs.push({ type: 'spike', x: 300 });
    obs.push({ type: 'spike', x: 500 });
    obs.push({ type: 'spike', x: 524 });

    // Section 2: Stepping stones
    obs.push({ type: 'block', x: 700, y: FLOOR_Y - 30, w: 60, h: 30 });
    obs.push({ type: 'spike', x: 760 });
    obs.push({ type: 'block', x: 820, y: FLOOR_Y - 50, w: 60, h: 50 });

    // Section 3: Jump pads
    obs.push({ type: 'pad', x: 1000, y: FLOOR_Y - 6, w: 28, h: 6 });
    obs.push({ type: 'spike', x: 1050 });
    obs.push({ type: 'spike', x: 1074 });
    obs.push({ type: 'spike', x: 1098 });
    obs.push({ type: 'block', x: 1140, y: FLOOR_Y - 60, w: 80, h: 60 });

    // Section 4: Rhythm triple jumps
    obs.push({ type: 'spike', x: 1350 });
    obs.push({ type: 'spike', x: 1500 });
    obs.push({ type: 'spike', x: 1650 });
    obs.push({ type: 'spike', x: 1674 });

    // Section 5: High stair run
    obs.push({ type: 'block', x: 1850, y: FLOOR_Y - 30, w: 50, h: 30 });
    obs.push({ type: 'block', x: 1950, y: FLOOR_Y - 60, w: 50, h: 60 });
    obs.push({ type: 'block', x: 2050, y: FLOOR_Y - 90, w: 50, h: 90 });
    obs.push({ type: 'spike', x: 2150 });
    obs.push({ type: 'spike', x: 2174 });

    // Section 6: Double pads & air glide
    obs.push({ type: 'pad', x: 2350, y: FLOOR_Y - 6, w: 28, h: 6 });
    obs.push({ type: 'block', x: 2450, y: FLOOR_Y - 70, w: 90, h: 70 });
    obs.push({ type: 'spike', x: 2480, y: FLOOR_Y - 94, onBlock: true });
    obs.push({ type: 'pad', x: 2650, y: FLOOR_Y - 6, w: 28, h: 6 });

    // Section 7: Final sprint
    obs.push({ type: 'spike', x: 2850 });
    obs.push({ type: 'spike', x: 2874 });
    obs.push({ type: 'block', x: 2950, y: FLOOR_Y - 40, w: 70, h: 40 });
    obs.push({ type: 'spike', x: 3070 });
    obs.push({ type: 'spike', x: 3094 });
    obs.push({ type: 'spike', x: 3118 });

    // Finish portal / pedestal
    obs.push({ type: 'block', x: 3350, y: FLOOR_Y - 40, w: 250, h: 40, isGoal: true });

    return obs;
  }

  var obstacles = generateLevel();

  function resetGame(fullReset) {
    if (fullReset) {
      attempts = 1;
    } else {
      attempts++;
    }
    attemptsTextEl.textContent = attempts;

    player.x = 60;
    player.y = FLOOR_Y - 24;
    player.vy = 0;
    player.rotation = 0;
    player.onGround = true;
    cameraX = 0;
    particles = [];
    isDead = false;
    isPlaying = false;
    stopMusic();
    modalEl.classList.remove('active');
    startHintEl.style.display = 'block';
    render();
  }

  function triggerJump() {
    initAudio();
    if (isDead) return;

    if (!isPlaying) {
      isPlaying = true;
      startHintEl.style.display = 'none';
      startMusic();
    }

    if (player.onGround) {
      player.vy = JUMP_FORCE;
      player.onGround = false;
      playJumpSound();
    }
  }

  function createExplosion(x, y) {
    for (var i = 0; i < 24; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = Math.random() * 5 + 2;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 5 + 3,
        alpha: 1,
        color: ['#38bdf8', '#a855f7', '#fbbf24', '#f43f5e'][Math.floor(Math.random() * 4)]
      });
    }
  }

  function crash() {
    if (isDead) return;
    isDead = true;
    isPlaying = false;
    stopMusic();
    playCrashSound();
    createExplosion(player.x + 12, player.y + 12);

    setTimeout(function () {
      resetGame(false);
    }, 600);
  }

  function win() {
    isPlaying = false;
    stopMusic();
    playWinSound();
    modalEl.classList.add('active');
  }

  function update() {
    if (!isPlaying || isDead) {
      // update particles
      particles.forEach(function (p) {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.04;
      });
      particles = particles.filter(function (p) { return p.alpha > 0; });
      return;
    }

    // Move forward
    player.x += SPEED;
    cameraX = player.x - 60;

    // Gravity
    player.vy += GRAVITY;
    player.y += player.vy;

    // Rotation while in air
    if (!player.onGround) {
      player.rotation += 0.15;
    } else {
      player.rotation = Math.round(player.rotation / (Math.PI / 2)) * (Math.PI / 2);
    }

    // Floor collision
    if (player.y >= FLOOR_Y - player.h) {
      player.y = FLOOR_Y - player.h;
      player.vy = 0;
      player.onGround = true;
    }

    // Check progress
    var percent = Math.min(100, Math.floor((player.x / TOTAL_COURSE_LENGTH) * 100));
    progressTextEl.textContent = percent + '%';
    progressBarEl.style.width = percent + '%';
    if (percent > bestPercent) {
      bestPercent = percent;
      bestTextEl.textContent = bestPercent + '%';
    }

    if (player.x >= TOTAL_COURSE_LENGTH) {
      win();
      return;
    }

    // Obstacle Collisions
    for (var i = 0; i < obstacles.length; i++) {
      var obs = obstacles[i];
      if (obs.x + 100 < cameraX || obs.x - 100 > cameraX + 400) continue;

      if (obs.type === 'spike') {
        var sy = obs.y !== undefined ? obs.y : FLOOR_Y - 22;
        var sw = 22;
        var sh = 22;
        // Bounding box + tip test
        if (player.x + player.w > obs.x + 4 && player.x < obs.x + sw - 4 &&
            player.y + player.h > sy + 4 && player.y < sy + sh) {
          crash();
          return;
        }
      } else if (obs.type === 'block') {
        // Landing on top vs hitting side
        var px = player.x;
        var py = player.y;
        var pw = player.w;
        var ph = player.h;

        if (px + pw > obs.x && px < obs.x + obs.w && py + ph > obs.y && py < obs.y + obs.h) {
          // Check if landed from above
          if (py + ph - player.vy <= obs.y + 6 && player.vy >= 0) {
            player.y = obs.y - ph;
            player.vy = 0;
            player.onGround = true;
          } else {
            // Hit wall!
            crash();
            return;
          }
        }
      } else if (obs.type === 'pad') {
        if (player.x + player.w > obs.x && player.x < obs.x + obs.w &&
            player.y + player.h >= obs.y - 4 && player.y + player.h <= obs.y + 10) {
          player.vy = -14.5;
          player.onGround = false;
          playPadSound();
        }
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background scrolling neon grid
    var gridOffset = -(cameraX * 0.4) % 40;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    for (var gx = gridOffset; gx < canvas.width; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, FLOOR_Y);
      ctx.stroke();
    }
    for (var gy = 0; gy < FLOOR_Y; gy += 40) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(canvas.width, gy);
      ctx.stroke();
    }

    // Floor
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, FLOOR_Y, canvas.width, canvas.height - FLOOR_Y);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, FLOOR_Y);
    ctx.lineTo(canvas.width, FLOOR_Y);
    ctx.stroke();

    // Floor neon pattern
    var fOffset = -(cameraX % 30);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1;
    for (var fx = fOffset; fx < canvas.width; fx += 30) {
      ctx.beginPath();
      ctx.moveTo(fx, FLOOR_Y);
      ctx.lineTo(fx - 15, canvas.height);
      ctx.stroke();
    }

    // Draw Obstacles
    obstacles.forEach(function (obs) {
      var screenX = obs.x - cameraX;
      if (screenX < -100 || screenX > canvas.width + 100) return;

      if (obs.type === 'spike') {
        var sy = obs.y !== undefined ? obs.y : FLOOR_Y - 22;
        ctx.fillStyle = '#f43f5e';
        ctx.strokeStyle = '#ffe4e6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screenX, sy + 22);
        ctx.lineTo(screenX + 11, sy);
        ctx.lineTo(screenX + 22, sy + 22);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (obs.type === 'block') {
        ctx.fillStyle = '#0284c7';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.fillRect(screenX, obs.y, obs.w, obs.h);
        ctx.strokeRect(screenX, obs.y, obs.w, obs.h);
      } else if (obs.type === 'pad') {
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(screenX, obs.y, obs.w, obs.h);
      }
    });

    // Draw Particles
    particles.forEach(function (p) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.fillRect(p.x - cameraX, p.y, p.size, p.size);
      ctx.globalAlpha = 1.0;
    });

    // Draw Player Cube
    if (!isDead) {
      var px = player.x - cameraX;
      var py = player.y;

      ctx.save();
      ctx.translate(px + player.w / 2, py + player.h / 2);
      ctx.rotate(player.rotation);

      // Cube body
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(-player.w / 2, -player.h / 2, player.w, player.h);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.strokeRect(-player.w / 2, -player.h / 2, player.w, player.h);

      // Inner face/symbol
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-4, -6, 3, 3);
      ctx.fillRect(1, -6, 3, 3);
      ctx.fillRect(-4, 2, 8, 2);

      ctx.restore();
    }
  }

  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  // --- Input ---
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      triggerJump();
    }
  });

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    triggerJump();
  });

  restartBtn.addEventListener('click', function () { resetGame(true); });
  modalRestartBtn.addEventListener('click', function () { resetGame(true); });

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
    if (!soundEnabled) stopMusic();
  });

  resetGame(true);
  loop();
})();
