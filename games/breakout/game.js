/*
 * games/breakout/game.js
 * 经典打砖块 (Breakout / Brick Breaker)
 *
 * Full-featured arcade brick breaker with angle physics, multi-durability bricks,
 * falling power-ups (Multi-ball, Wide Paddle, Laser Blaster, Floor Shield),
 * particle explosions, and Web Audio sound effects.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('scoreVal');
  var bestEl = document.getElementById('bestVal');
  var levelEl = document.getElementById('levelVal');
  var livesIcons = document.getElementById('livesIcons');
  var soundBtn = document.getElementById('soundBtn');
  var restartBtn = document.getElementById('restartBtn');
  var startOverlay = document.getElementById('startOverlay');
  var modal = document.getElementById('modalOverlay');
  var modalTitle = document.getElementById('modalTitle');
  var modalEmoji = document.getElementById('modalEmoji');
  var finalScoreEl = document.getElementById('finalScore');
  var finalBestEl = document.getElementById('finalBest');
  var playAgainBtn = document.getElementById('playAgainBtn');

  var LOGICAL_W = 380;
  var LOGICAL_H = 560;

  var dpr = window.devicePixelRatio || 1;
  function setupDpr() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(LOGICAL_W * dpr);
    canvas.height = Math.round(LOGICAL_H * dpr);
  }
  setupDpr();
  window.addEventListener('resize', setupDpr);

  // ---- Audio Engine (Web Audio API) -----------------------------------------
  var audioCtx = null;
  var soundEnabled = true;

  function initAudio() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      var AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function () {});
    }
  }

  function playSound(type, combo) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;

    var now = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'paddle') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'brick') {
      var freq = 350 + Math.min(12, (combo || 0)) * 60;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.4, now + 0.09);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'powerup') {
      [440, 554.37, 659.25].forEach(function (f, i) {
        var o = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f, now + i * 0.06);
        g.gain.setValueAtTime(0.18, now + i * 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.15);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(now + i * 0.06);
        o.stop(now + i * 0.06 + 0.15);
      });
    } else if (type === 'laser') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.09);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.09);
    } else if (type === 'lose') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.linearRampToValueAtTime(50, now + 0.3);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  }

  try {
    var storedSound = localStorage.getItem('omg:breakout:sound');
    if (storedSound !== null) soundEnabled = storedSound === '1';
  } catch (e) {}
  soundBtn.textContent = soundEnabled ? '🔊' : '🔇';

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
    try {
      localStorage.setItem('omg:breakout:sound', soundEnabled ? '1' : '0');
    } catch (e) {}
  });

  // ---- High Score Persistence -----------------------------------------------
  var bestScore = 0;
  function loadBestScore() {
    if (window.GameStore && typeof window.GameStore.getBest === 'function') {
      window.GameStore.getBest('breakout').then(function (val) {
        bestScore = val || 0;
        bestEl.textContent = bestScore;
      });
    } else {
      try {
        bestScore = parseInt(localStorage.getItem('omg:best:breakout') || '0', 10);
        bestEl.textContent = bestScore;
      } catch (e) {}
    }
  }

  function saveBestScore(sc) {
    if (sc > bestScore) {
      bestScore = sc;
      bestEl.textContent = bestScore;
      if (window.GameStore && typeof window.GameStore.saveBest === 'function') {
        window.GameStore.saveBest('breakout', bestScore);
      } else {
        try {
          localStorage.setItem('omg:best:breakout', String(bestScore));
        } catch (e) {}
      }
    }
  }

  // ---- Game State & Entities ------------------------------------------------
  var score = 0;
  var level = 1;
  var lives = 3;
  var isPlaying = false;
  var isGameOver = false;
  var comboCount = 0;
  var shakeTimer = 0;

  var paddle = {
    x: LOGICAL_W / 2 - 38,
    y: LOGICAL_H - 32,
    w: 76,
    h: 12,
    baseW: 76,
    hasLaser: false,
    laserTimer: 0,
    wideTimer: 0
  };

  var balls = [];
  var bricks = [];
  var powerups = [];
  var particles = [];
  var lasers = [];
  var floorShield = false;

  // Powerup definitions
  var POWERUP_TYPES = [
    { type: 'multi', emoji: '🎾', color: '#38bdf8' },
    { type: 'wide', emoji: '📏', color: '#4ade80' },
    { type: 'laser', emoji: '⚡', color: '#facc15' },
    { type: 'shield', emoji: '🛡️', color: '#ec4899' }
  ];

  function updateLivesUI() {
    var hearts = '';
    for (var i = 0; i < lives; i++) hearts += '❤️';
    livesIcons.textContent = hearts || '💀';
  }

  // ---- Level Generation -----------------------------------------------------
  function initLevel(lvl) {
    bricks = [];
    powerups = [];
    lasers = [];
    var rows = 5 + Math.min(3, Math.floor(lvl / 2));
    var cols = 8;
    var brickW = Math.floor((LOGICAL_W - 32) / cols);
    var brickH = 18;
    var startY = 45;

    var colors = [
      { fill: '#ef4444', stroke: '#dc2626', pts: 10, hits: 1 },
      { fill: '#f97316', stroke: '#ea580c', pts: 20, hits: 1 },
      { fill: '#eab308', stroke: '#ca8a04', pts: 30, hits: 2 },
      { fill: '#22c55e', stroke: '#16a34a', pts: 40, hits: 2 },
      { fill: '#06b6d4', stroke: '#0891b2', pts: 50, hits: 3 },
      { fill: '#8b5cf6', stroke: '#7c3aed', pts: 60, hits: 3 },
      { fill: '#ec4899', stroke: '#db2777', pts: 80, hits: 4 }
    ];

    for (var r = 0; r < rows; r++) {
      var colorIdx = (r + lvl - 1) % colors.length;
      var cDef = colors[colorIdx];

      for (var c = 0; c < cols; c++) {
        // Some levels have patterned gaps
        if (lvl === 2 && (r + c) % 2 === 1) continue;
        if (lvl === 3 && (c === 0 || c === cols - 1) && r > 2) continue;

        var hasItem = Math.random() < 0.22;
        var itemType = hasItem ? POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)].type : null;

        bricks.push({
          x: 16 + c * brickW,
          y: startY + r * (brickH + 4),
          w: brickW - 3,
          h: brickH,
          color: cDef.fill,
          stroke: cDef.stroke,
          hits: cDef.hits,
          maxHits: cDef.hits,
          pts: cDef.pts,
          item: itemType
        });
      }
    }
  }

  function resetBall() {
    balls = [{
      x: paddle.x + paddle.w / 2,
      y: paddle.y - 10,
      vx: 2.8 * (Math.random() > 0.5 ? 1 : -1),
      vy: -5.2,
      r: 6.5,
      stuck: true
    }];
    isPlaying = false;
    startOverlay.style.display = 'block';
  }

  function resetGame() {
    score = 0;
    level = 1;
    lives = 3;
    isGameOver = false;
    floorShield = false;
    paddle.w = paddle.baseW;
    paddle.hasLaser = false;
    scoreEl.textContent = '0';
    levelEl.textContent = '1';
    updateLivesUI();
    initLevel(level);
    resetBall();
    modal.classList.add('hidden');
  }

  function launchBall() {
    if (!isPlaying) {
      isPlaying = true;
      startOverlay.style.display = 'none';
      if (balls.length > 0 && balls[0].stuck) {
        balls[0].stuck = false;
      }
    } else if (paddle.hasLaser) {
      // Fire twin lasers!
      lasers.push({ x: paddle.x + 8, y: paddle.y - 4, vy: -9 });
      lasers.push({ x: paddle.x + paddle.w - 10, y: paddle.y - 4, vy: -9 });
      playSound('laser');
    }
  }

  // ---- Particle System ------------------------------------------------------
  function spawnBrickShards(x, y, color) {
    for (var i = 0; i < 10; i++) {
      var angle = Math.random() * Math.PI * 2;
      var spd = 1.5 + Math.random() * 3.5;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        r: 2 + Math.random() * 2.5,
        color: color,
        alpha: 1
      });
    }
  }

  // ---- Controls -------------------------------------------------------------
  function movePaddleToPointer(clientX) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = LOGICAL_W / rect.width;
    var x = (clientX - rect.left) * scaleX - paddle.w / 2;
    paddle.x = Math.max(8, Math.min(LOGICAL_W - paddle.w - 8, x));

    // If ball is stuck on paddle before launch
    if (!isPlaying && balls.length > 0 && balls[0].stuck) {
      balls[0].x = paddle.x + paddle.w / 2;
    }
  }

  canvas.addEventListener('mousemove', function (e) {
    movePaddleToPointer(e.clientX);
  });

  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (e.touches && e.touches.length > 0) {
      movePaddleToPointer(e.touches[0].clientX);
    }
  }, { passive: false });

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (isGameOver) {
      resetGame();
      return;
    }
    launchBall();
  });

  window.addEventListener('keydown', function (e) {
    var step = 26;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      paddle.x = Math.max(8, paddle.x - step);
      if (!isPlaying && balls.length > 0 && balls[0].stuck) balls[0].x = paddle.x + paddle.w / 2;
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      paddle.x = Math.min(LOGICAL_W - paddle.w - 8, paddle.x + step);
      if (!isPlaying && balls.length > 0 && balls[0].stuck) balls[0].x = paddle.x + paddle.w / 2;
    } else if (e.code === 'Space') {
      e.preventDefault();
      if (isGameOver) resetGame();
      else launchBall();
    } else if (e.code === 'Enter' && isGameOver) {
      resetGame();
    }
  });

  restartBtn.addEventListener('click', resetGame);
  playAgainBtn.addEventListener('click', resetGame);

  // ---- Update ---------------------------------------------------------------
  function update() {
    if (isGameOver) return;

    // Shake timer
    if (shakeTimer > 0) shakeTimer--;

    // Paddle buffs timers
    if (paddle.wideTimer > 0) {
      paddle.wideTimer--;
      if (paddle.wideTimer === 0) paddle.w = paddle.baseW;
    }
    if (paddle.laserTimer > 0) {
      paddle.laserTimer--;
      if (paddle.laserTimer === 0) paddle.hasLaser = false;
    }

    // 1. Update Lasers
    for (var lIdx = lasers.length - 1; lIdx >= 0; lIdx--) {
      var l = lasers[lIdx];
      l.y += l.vy;
      // Check laser hits bricks
      var laserHit = false;
      for (var bIdx = bricks.length - 1; bIdx >= 0; bIdx--) {
        var brk = bricks[bIdx];
        if (l.x > brk.x && l.x < brk.x + brk.w && l.y > brk.y && l.y < brk.y + brk.h) {
          brk.hits--;
          laserHit = true;
          if (brk.hits <= 0) {
            score += brk.pts;
            scoreEl.textContent = score;
            spawnBrickShards(brk.x + brk.w / 2, brk.y + brk.h / 2, brk.color);
            if (brk.item) powerups.push({ x: brk.x + brk.w / 2, y: brk.y, type: brk.item, vy: 2 });
            bricks.splice(bIdx, 1);
          }
          break;
        }
      }
      if (laserHit || l.y < -10) lasers.splice(lIdx, 1);
    }

    // 2. Update Power-ups
    for (var puIdx = powerups.length - 1; puIdx >= 0; puIdx--) {
      var pu = powerups[puIdx];
      pu.y += pu.vy;

      // Catch by paddle
      if (pu.y + 12 >= paddle.y && pu.y <= paddle.y + paddle.h &&
          pu.x >= paddle.x && pu.x <= paddle.x + paddle.w) {
        playSound('powerup');
        applyPowerup(pu.type);
        powerups.splice(puIdx, 1);
        continue;
      }

      if (pu.y > LOGICAL_H + 10) powerups.splice(puIdx, 1);
    }

    // 3. Update Balls
    if (isPlaying) {
      for (var i = balls.length - 1; i >= 0; i--) {
        var b = balls[i];
        if (b.stuck) continue;

        b.x += b.vx;
        b.y += b.vy;

        // Left / Right Walls
        if (b.x - b.r < 8) {
          b.x = 8 + b.r;
          b.vx = Math.abs(b.vx);
          playSound('paddle');
        } else if (b.x + b.r > LOGICAL_W - 8) {
          b.x = LOGICAL_W - 8 - b.r;
          b.vx = -Math.abs(b.vx);
          playSound('paddle');
        }

        // Top Wall
        if (b.y - b.r < 8) {
          b.y = 8 + b.r;
          b.vy = Math.abs(b.vy);
          playSound('paddle');
        }

        // Paddle Collision (Angle physics)
        if (b.vy > 0 && b.y + b.r >= paddle.y && b.y - b.r <= paddle.y + paddle.h &&
            b.x >= paddle.x - 4 && b.x <= paddle.x + paddle.w + 4) {
          b.y = paddle.y - b.r;
          // Calculate hit offset from center (-1 to 1)
          var hitOffset = (b.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
          hitOffset = Math.max(-0.95, Math.min(0.95, hitOffset));

          var speedMag = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
          speedMag = Math.min(8.5, speedMag + 0.05); // slight speed increase

          var angle = hitOffset * (Math.PI * 0.38); // max angle ~68 deg
          b.vx = speedMag * Math.sin(angle);
          b.vy = -speedMag * Math.cos(angle);

          comboCount = 0;
          playSound('paddle');
        }

        // Brick Collisions
        for (var k = bricks.length - 1; k >= 0; k--) {
          var brick = bricks[k];
          // Check collision between circle and brick AABB
          var closestX = Math.max(brick.x, Math.min(b.x, brick.x + brick.w));
          var closestY = Math.max(brick.y, Math.min(b.y, brick.y + brick.h));
          var distX = b.x - closestX;
          var distY = b.y - closestY;

          if (distX * distX + distY * distY < b.r * b.r) {
            // Determine collision normal
            var overlapLeft = (b.x + b.r) - brick.x;
            var overlapRight = (brick.x + brick.w) - (b.x - b.r);
            var overlapTop = (b.y + b.r) - brick.y;
            var overlapBottom = (brick.y + brick.h) - (b.y - b.r);

            var minOverlapX = Math.min(overlapLeft, overlapRight);
            var minOverlapY = Math.min(overlapTop, overlapBottom);

            if (minOverlapX < minOverlapY) {
              b.vx = -b.vx;
            } else {
              b.vy = -b.vy;
            }

            // Damage brick
            brick.hits--;
            comboCount++;
            playSound('brick', comboCount);

            if (brick.hits <= 0) {
              score += brick.pts * Math.min(3, Math.floor(1 + comboCount * 0.2));
              scoreEl.textContent = score;
              saveBestScore(score);
              spawnBrickShards(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color);

              // Spawn powerup?
              if (brick.item) {
                powerups.push({
                  x: brick.x + brick.w / 2,
                  y: brick.y,
                  type: brick.item,
                  vy: 2.2
                });
              }

              bricks.splice(k, 1);
              shakeTimer = 3;
            }
            break;
          }
        }

        // Bottom floor check
        if (b.y - b.r > LOGICAL_H) {
          if (floorShield) {
            floorShield = false;
            b.y = LOGICAL_H - 12;
            b.vy = -Math.abs(b.vy);
            playSound('paddle');
          } else {
            balls.splice(i, 1);
          }
        }
      }

      // Check if all balls lost
      if (balls.length === 0) {
        lives--;
        updateLivesUI();
        playSound('lose');
        if (lives <= 0) {
          triggerGameOver();
        } else {
          resetBall();
        }
      }

      // Check Level Clear!
      if (bricks.length === 0) {
        level++;
        levelEl.textContent = level;
        playSound('powerup');
        initLevel(level);
        resetBall();
      }
    }

    // 4. Update Particles
    for (var p = particles.length - 1; p >= 0; p--) {
      var part = particles[p];
      part.x += part.vx;
      part.y += part.vy;
      part.alpha -= 0.035;
      if (part.alpha <= 0) particles.splice(p, 1);
    }
  }

  function applyPowerup(type) {
    if (type === 'multi') {
      var curr = balls[0] || { x: paddle.x + paddle.w / 2, y: paddle.y - 12, vx: 3, vy: -5, r: 6.5 };
      balls.push({ x: curr.x, y: curr.y, vx: curr.vx * 0.8 - 2, vy: curr.vy, r: 6.5, stuck: false });
      balls.push({ x: curr.x, y: curr.y, vx: curr.vx * 0.8 + 2, vy: curr.vy, r: 6.5, stuck: false });
    } else if (type === 'wide') {
      paddle.w = Math.round(paddle.baseW * 1.45);
      paddle.wideTimer = 600; // ~10 seconds
    } else if (type === 'laser') {
      paddle.hasLaser = true;
      paddle.laserTimer = 480; // ~8 seconds
    } else if (type === 'shield') {
      floorShield = true;
    }
  }

  function triggerGameOver() {
    isGameOver = true;
    saveBestScore(score);
    finalScoreEl.textContent = score;
    finalBestEl.textContent = bestScore;
    modalTitle.textContent = 'GAME OVER';
    modalEmoji.textContent = '🧱';
    modal.classList.remove('hidden');
  }

  // ---- Rendering ------------------------------------------------------------
  function drawPaddle() {
    var px = paddle.x;
    var py = paddle.y;
    var pw = paddle.w;
    var ph = paddle.h;

    // Paddle body
    var pGrad = ctx.createLinearGradient(px, py, px, py + ph);
    if (paddle.hasLaser) {
      pGrad.addColorStop(0, '#facc15');
      pGrad.addColorStop(1, '#ca8a04');
    } else {
      pGrad.addColorStop(0, '#38bdf8');
      pGrad.addColorStop(1, '#0284c7');
    }
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 6);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Laser cannons
    if (paddle.hasLaser) {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(px + 4, py - 4, 6, 4);
      ctx.fillRect(px + pw - 10, py - 4, 6, 4);
    }
  }

  function drawBricks() {
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      var bGrad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      bGrad.addColorStop(0, '#ffffff');
      bGrad.addColorStop(0.2, b.color);
      bGrad.addColorStop(1, b.stroke);

      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 3);
      ctx.fill();

      ctx.strokeStyle = b.stroke;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Durability crack lines if damaged
      if (b.hits < b.maxHits) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(b.x + 4, b.y + 3);
        ctx.lineTo(b.x + b.w / 2, b.y + b.h / 2);
        ctx.lineTo(b.x + b.w - 6, b.y + b.h - 3);
        ctx.stroke();
      }

      // Subtle powerup dot indicator
      if (b.item) {
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawBalls() {
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      var bGrad = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, b.r);
      bGrad.addColorStop(0, '#ffffff');
      bGrad.addColorStop(0.5, '#f8fafc');
      bGrad.addColorStop(1, '#94a3b8');

      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  function drawPowerups() {
    for (var i = 0; i < powerups.length; i++) {
      var p = powerups[i];
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(p.x - 12, p.y - 8, 24, 16, 8);
      ctx.fill();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      var emoji = '⭐';
      if (p.type === 'multi') emoji = '🎾';
      else if (p.type === 'wide') emoji = '📏';
      else if (p.type === 'laser') emoji = '⚡';
      else if (p.type === 'shield') emoji = '🛡️';
      ctx.fillText(emoji, p.x, p.y + 4);
    }
  }

  function drawLasers() {
    ctx.fillStyle = '#ef4444';
    for (var i = 0; i < lasers.length; i++) {
      var l = lasers[i];
      ctx.fillRect(l.x, l.y, 3, 10);
    }
  }

  function drawFloorShield() {
    if (!floorShield) return;
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(8, LOGICAL_H - 6);
    ctx.lineTo(LOGICAL_W - 8, LOGICAL_H - 6);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function render() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Screen Shake
    if (shakeTimer > 0) {
      var sx = (Math.random() - 0.5) * 4;
      var sy = (Math.random() - 0.5) * 4;
      ctx.translate(sx, sy);
    }

    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

    // 1. Arena borders
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, LOGICAL_W - 12, LOGICAL_H - 6);

    // 2. Bricks
    drawBricks();

    // 3. Powerups & Lasers & Shield
    drawPowerups();
    drawLasers();
    drawFloorShield();

    // 4. Paddle & Balls
    drawPaddle();
    drawBalls();

    // 5. Particles
    for (var p = 0; p < particles.length; p++) {
      var part = particles[p];
      ctx.save();
      ctx.globalAlpha = part.alpha;
      ctx.fillStyle = part.color;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  // ---- Main Loop ------------------------------------------------------------
  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  // ---- Bootstrap ------------------------------------------------------------
  loadBestScore();
  resetGame();
  requestAnimationFrame(loop);
})();
