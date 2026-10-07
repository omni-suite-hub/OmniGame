/*
 * games/flappy-bird/game.js
 * 像素鸟 (Flappy Bird)
 *
 * Silky 60fps canvas runner with authentic physics, procedural retro pipes,
 * city skyline parallax, animated bird wings, and Web Audio sound effects.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('scoreVal');
  var bestEl = document.getElementById('bestVal');
  var soundBtn = document.getElementById('soundBtn');
  var restartBtn = document.getElementById('restartBtn');
  var startOverlay = document.getElementById('startOverlay');
  var modal = document.getElementById('modalOverlay');
  var modalMedal = document.getElementById('modalMedal');
  var finalScoreEl = document.getElementById('finalScore');
  var finalBestEl = document.getElementById('finalBest');
  var playAgainBtn = document.getElementById('playAgainBtn');

  var LOGICAL_W = 360;
  var LOGICAL_H = 580;
  var GROUND_Y = 500;
  var PIPE_WIDTH = 54;
  var PIPE_GAP = 124;

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

  function playSound(type) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;

    var now = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'flap') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(740, now + 0.08);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'score') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(987.77, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.16);
    } else if (type === 'hit') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.linearRampToValueAtTime(50, now + 0.18);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    }
  }

  try {
    var storedSound = localStorage.getItem('omg:flappy:sound');
    if (storedSound !== null) soundEnabled = storedSound === '1';
  } catch (e) {}
  soundBtn.textContent = soundEnabled ? '🔊' : '🔇';

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
    try {
      localStorage.setItem('omg:flappy:sound', soundEnabled ? '1' : '0');
    } catch (e) {}
  });

  // ---- High Score Persistence -----------------------------------------------
  var bestScore = 0;
  function loadBestScore() {
    if (window.GameStore && typeof window.GameStore.getBest === 'function') {
      window.GameStore.getBest('flappy-bird').then(function (val) {
        bestScore = val || 0;
        bestEl.textContent = bestScore;
      });
    } else {
      try {
        bestScore = parseInt(localStorage.getItem('omg:best:flappy-bird') || '0', 10);
        bestEl.textContent = bestScore;
      } catch (e) {}
    }
  }

  function saveBestScore(sc) {
    if (sc > bestScore) {
      bestScore = sc;
      bestEl.textContent = bestScore;
      if (window.GameStore && typeof window.GameStore.saveBest === 'function') {
        window.GameStore.saveBest('flappy-bird', bestScore);
      } else {
        try {
          localStorage.setItem('omg:best:flappy-bird', String(bestScore));
        } catch (e) {}
      }
    }
  }

  // ---- Game State & Entities ------------------------------------------------
  var GRAVITY = 0.42;
  var FLAP_IMPULSE = -7.4;
  var SCROLL_SPEED = 2.4;

  var gameState = 'ready'; // ready | playing | over
  var score = 0;
  var groundOffset = 0;
  var flashTimer = 0;

  var bird = {
    x: 90,
    y: 240,
    r: 15,
    vy: 0,
    rotation: 0,
    wingTimer: 0,
    wingFrame: 0 // 0, 1, 2
  };

  var pipes = [];
  var pipeSpawnTimer = 0;

  function resetGame() {
    gameState = 'ready';
    score = 0;
    scoreEl.textContent = '0';
    bird.x = 90;
    bird.y = 240;
    bird.vy = 0;
    bird.rotation = 0;
    bird.wingFrame = 0;
    pipes = [];
    pipeSpawnTimer = 0;
    flashTimer = 0;
    modal.classList.add('hidden');
    startOverlay.style.display = 'block';
  }

  function startGame() {
    gameState = 'playing';
    startOverlay.style.display = 'none';
    bird.vy = FLAP_IMPULSE;
    playSound('flap');
  }

  function flap() {
    if (gameState === 'ready') {
      startGame();
    } else if (gameState === 'playing') {
      bird.vy = FLAP_IMPULSE;
      bird.rotation = -0.45;
      playSound('flap');
    } else if (gameState === 'over') {
      resetGame();
    }
  }

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      flap();
    } else if (e.code === 'Enter' && gameState === 'over') {
      resetGame();
    }
  });

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    flap();
  });

  restartBtn.addEventListener('click', resetGame);
  playAgainBtn.addEventListener('click', resetGame);

  // ---- Pipes Generation -----------------------------------------------------
  function spawnPipe() {
    var minTop = 60;
    var maxTop = GROUND_Y - PIPE_GAP - 60;
    var topH = Math.floor(minTop + Math.random() * (maxTop - minTop));

    pipes.push({
      x: LOGICAL_W + 10,
      topH: topH,
      bottomY: topH + PIPE_GAP,
      passed: false
    });
  }

  // ---- Collision Detection --------------------------------------------------
  function checkCollision() {
    // 1. Ground & Ceiling
    if (bird.y + bird.r >= GROUND_Y) {
      bird.y = GROUND_Y - bird.r;
      return true;
    }
    if (bird.y - bird.r <= 0) {
      bird.y = bird.r;
      bird.vy = 0;
    }

    // 2. Pipes (circle vs bounding boxes)
    for (var i = 0; i < pipes.length; i++) {
      var p = pipes[i];
      var px = p.x;
      var pw = PIPE_WIDTH;

      // Top pipe box: [px, 0] to [px + pw, p.topH]
      // Bottom pipe box: [px, p.bottomY] to [px + pw, GROUND_Y]
      var bx = bird.x;
      var by = bird.y;
      var br = bird.r - 2; // slight grace margin

      // Top pipe collision
      var closestX1 = Math.max(px, Math.min(bx, px + pw));
      var closestY1 = Math.max(0, Math.min(by, p.topH));
      var distSq1 = (bx - closestX1) * (bx - closestX1) + (by - closestY1) * (by - closestY1);
      if (distSq1 < br * br) return true;

      // Bottom pipe collision
      var closestX2 = Math.max(px, Math.min(bx, px + pw));
      var closestY2 = Math.max(p.bottomY, Math.min(by, GROUND_Y));
      var distSq2 = (bx - closestX2) * (bx - closestX2) + (by - closestY2) * (by - closestY2);
      if (distSq2 < br * br) return true;
    }
    return false;
  }

  function triggerGameOver() {
    gameState = 'over';
    playSound('hit');
    flashTimer = 8;
    saveBestScore(score);

    finalScoreEl.textContent = score;
    finalBestEl.textContent = bestScore;

    // Medals
    if (score >= 50) modalMedal.textContent = '💎';
    else if (score >= 35) modalMedal.textContent = '🥇';
    else if (score >= 20) modalMedal.textContent = '🥈';
    else if (score >= 10) modalMedal.textContent = '🥉';
    else modalMedal.textContent = '🐣';

    modal.classList.remove('hidden');
  }

  // ---- Update ---------------------------------------------------------------
  function update() {
    // Flapping wing animation
    bird.wingTimer += 1;
    if (bird.wingTimer > 6) {
      bird.wingTimer = 0;
      bird.wingFrame = (bird.wingFrame + 1) % 3;
    }

    if (gameState === 'ready') {
      // Gentle idle hovering bob
      bird.y = 240 + Math.sin(Date.now() / 240) * 8;
      bird.rotation = 0;
      groundOffset = (groundOffset + SCROLL_SPEED) % 24;
      return;
    }

    if (gameState === 'playing') {
      // Physics
      bird.vy += GRAVITY;
      bird.y += bird.vy;

      // Smooth rotation
      if (bird.vy < 0) {
        bird.rotation = -0.38;
      } else {
        bird.rotation = Math.min(1.2, bird.rotation + 0.05);
      }

      // Move ground
      groundOffset = (groundOffset + SCROLL_SPEED) % 24;

      // Pipes spawn & movement
      pipeSpawnTimer -= 1;
      if (pipeSpawnTimer <= 0) {
        spawnPipe();
        pipeSpawnTimer = Math.round(190 / SCROLL_SPEED);
      }

      for (var i = pipes.length - 1; i >= 0; i--) {
        var p = pipes[i];
        p.x -= SCROLL_SPEED;

        // Check scoring pass
        if (!p.passed && p.x + PIPE_WIDTH < bird.x) {
          p.passed = true;
          score += 1;
          scoreEl.textContent = score;
          playSound('score');
        }

        // Remove offscreen
        if (p.x + PIPE_WIDTH < -20) {
          pipes.splice(i, 1);
        }
      }

      // Check collision
      if (checkCollision()) {
        triggerGameOver();
      }
    } else if (gameState === 'over') {
      // Fall down to ground
      if (bird.y + bird.r < GROUND_Y) {
        bird.vy += GRAVITY * 1.5;
        bird.y += bird.vy;
        bird.rotation = Math.min(1.5, bird.rotation + 0.1);
        if (bird.y + bird.r >= GROUND_Y) {
          bird.y = GROUND_Y - bird.r;
          bird.vy = 0;
        }
      }
    }
  }

  // ---- Rendering ------------------------------------------------------------
  function drawSkyAndCity() {
    // Sky gradient
    var skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    skyGrad.addColorStop(0, '#0284c7');
    skyGrad.addColorStop(0.7, '#38bdf8');
    skyGrad.addColorStop(1, '#bae6fd');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, LOGICAL_W, GROUND_Y);

    // Clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillRect(40, 60, 60, 16);
    ctx.fillRect(52, 48, 36, 16);
    ctx.fillRect(210, 95, 75, 18);
    ctx.fillRect(225, 82, 45, 18);

    // City skyline silhouette
    ctx.fillStyle = '#67e8f9';
    var buildings = [
      { x: 0, w: 32, h: 70 }, { x: 34, w: 26, h: 95 }, { x: 62, w: 40, h: 60 },
      { x: 104, w: 35, h: 110 }, { x: 141, w: 45, h: 80 }, { x: 188, w: 30, h: 90 },
      { x: 220, w: 42, h: 75 }, { x: 264, w: 38, h: 105 }, { x: 304, w: 58, h: 65 }
    ];
    for (var b = 0; b < buildings.length; b++) {
      var bd = buildings[b];
      ctx.fillRect(bd.x, GROUND_Y - bd.h, bd.w, bd.h);
    }

    // Green rolling hills
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(60, GROUND_Y + 40, 110, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(220, GROUND_Y + 40, 130, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(340, GROUND_Y + 40, 100, Math.PI, 0);
    ctx.fill();
  }

  function drawPipes() {
    for (var i = 0; i < pipes.length; i++) {
      var p = pipes[i];
      var px = p.x;
      var pw = PIPE_WIDTH;

      // Pipe main colors
      var pipeGrad = ctx.createLinearGradient(px, 0, px + pw, 0);
      pipeGrad.addColorStop(0, '#15803d');
      pipeGrad.addColorStop(0.25, '#22c55e');
      pipeGrad.addColorStop(0.7, '#4ade80');
      pipeGrad.addColorStop(1, '#166534');

      // Top Pipe body
      ctx.fillStyle = pipeGrad;
      ctx.fillRect(px, 0, pw, p.topH);
      ctx.strokeStyle = '#14532d';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(px, -2, pw, p.topH + 2);

      // Top Pipe Collar
      ctx.fillRect(px - 3, p.topH - 24, pw + 6, 24);
      ctx.strokeRect(px - 3, p.topH - 24, pw + 6, 24);

      // Bottom Pipe body
      ctx.fillRect(px, p.bottomY, pw, GROUND_Y - p.bottomY);
      ctx.strokeRect(px, p.bottomY, pw, GROUND_Y - p.bottomY);

      // Bottom Pipe Collar
      ctx.fillRect(px - 3, p.bottomY, pw + 6, 24);
      ctx.strokeRect(px - 3, p.bottomY, pw + 6, 24);
    }
  }

  function drawGround() {
    // Dirt base
    ctx.fillStyle = '#e2b36e';
    ctx.fillRect(0, GROUND_Y, LOGICAL_W, LOGICAL_H - GROUND_Y);

    // Green grass top border
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(0, GROUND_Y, LOGICAL_W, 14);
    ctx.fillStyle = '#15803d';
    ctx.fillRect(0, GROUND_Y + 11, LOGICAL_W, 3);

    // Scrolling grass slash stripes
    ctx.fillStyle = '#16a34a';
    for (var x = -24; x < LOGICAL_W + 24; x += 20) {
      var rx = x - groundOffset;
      ctx.beginPath();
      ctx.moveTo(rx, GROUND_Y);
      ctx.lineTo(rx + 8, GROUND_Y);
      ctx.lineTo(rx + 2, GROUND_Y + 11);
      ctx.lineTo(rx - 6, GROUND_Y + 11);
      ctx.fill();
    }
  }

  function drawBird() {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rotation);

    var r = bird.r;

    // Body
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // White belly
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(-2, 4, r * 0.65, 0, Math.PI * 2);
    ctx.fill();

    // Big eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(6, -4, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Pupil
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(8, -4, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Orange Beak
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(19, 3);
    ctx.lineTo(9, 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#c2410c';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Wing with 3 flap states
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    if (bird.wingFrame === 0) {
      // Wings high
      ctx.ellipse(-7, -4, 7, 4, -0.4, 0, Math.PI * 2);
    } else if (bird.wingFrame === 1) {
      // Wings neutral
      ctx.ellipse(-7, 1, 7.5, 4.5, 0, 0, Math.PI * 2);
    } else {
      // Wings low
      ctx.ellipse(-7, 6, 7, 4, 0.4, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.restore();
  }

  function drawScoreHUD() {
    if (gameState === 'playing') {
      ctx.font = '900 38px "Arial Black", Impact, sans-serif';
      ctx.textAlign = 'center';
      var text = String(score);

      // Thick black stroke
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#0f172a';
      ctx.strokeText(text, LOGICAL_W / 2, 70);

      // Bright white fill
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, LOGICAL_W / 2, 70);
    }
  }

  function render() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

    // 1. Sky, city, rolling hills
    drawSkyAndCity();

    // 2. Pipes
    drawPipes();

    // 3. Ground
    drawGround();

    // 4. Bird
    drawBird();

    // 5. Big Score in flight
    drawScoreHUD();

    // Hit screen flash
    if (flashTimer > 0) {
      flashTimer -= 1;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
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
