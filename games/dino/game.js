/*
 * games/dino/game.js
 * Chrome T-Rex Dino Run Clone
 *
 * Full-featured offline recreation of Chromium's offline dinosaur runner:
 * - Dynamic Day / Night cycle
 * - Ducking (俯身), Fast Drop, and Jumping
 * - Small/Large Cacti & Flapping Pterodactyls (翼龙)
 * - Authentic Web Audio sound synthesis
 * - HiDPI Retina canvas scaling
 */
(function () {
  'use strict';

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var appWrap = document.getElementById('appWrap');
  var curScoreEl = document.getElementById('curScore');
  var hiScoreEl = document.getElementById('hiScore');
  var soundBtn = document.getElementById('soundBtn');
  var restartBtn = document.getElementById('restartBtn');
  var startOverlay = document.getElementById('startOverlay');
  var modal = document.getElementById('modalOverlay');
  var finalScoreEl = document.getElementById('finalScore');
  var finalBestEl = document.getElementById('finalBest');
  var playAgainBtn = document.getElementById('playAgainBtn');

  var LOGICAL_W = 600;
  var LOGICAL_H = 220;
  var GROUND_Y = 185;

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

    if (type === 'jump') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(760, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'milestone') {
      // 100 pt double beep
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.setValueAtTime(0.001, now + 0.07);
      osc.start(now);
      osc.stop(now + 0.07);

      var osc2 = audioCtx.createOscillator();
      var gain2 = audioCtx.createGain();
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(1174, now + 0.09);
      gain2.gain.setValueAtTime(0.15, now + 0.09);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc2.start(now + 0.09);
      osc2.stop(now + 0.18);
    } else if (type === 'hit') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.linearRampToValueAtTime(60, now + 0.22);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    }
  }

  try {
    var storedSound = localStorage.getItem('omg:dino:sound');
    if (storedSound !== null) soundEnabled = storedSound === '1';
  } catch (e) {}
  soundBtn.textContent = soundEnabled ? '🔊' : '🔇';

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
    try {
      localStorage.setItem('omg:dino:sound', soundEnabled ? '1' : '0');
    } catch (e) {}
  });

  // ---- High Score Persistence -----------------------------------------------
  var bestScore = 0;
  function loadBestScore() {
    if (window.GameStore && typeof window.GameStore.getBest === 'function') {
      window.GameStore.getBest('dino').then(function (val) {
        bestScore = val || 0;
        hiScoreEl.textContent = padScore(bestScore);
      });
    } else {
      try {
        bestScore = parseInt(localStorage.getItem('omg:best:dino') || '0', 10);
        hiScoreEl.textContent = padScore(bestScore);
      } catch (e) {}
    }
  }

  function saveBestScore(finalSc) {
    if (finalSc > bestScore) {
      bestScore = finalSc;
      hiScoreEl.textContent = padScore(bestScore);
      if (window.GameStore && typeof window.GameStore.saveBest === 'function') {
        window.GameStore.saveBest('dino', bestScore);
      } else {
        try {
          localStorage.setItem('omg:best:dino', String(bestScore));
        } catch (e) {}
      }
    }
  }

  function padScore(n) {
    var s = String(Math.floor(n));
    while (s.length < 5) s = '0' + s;
    return s;
  }

  // ---- Game State & Entities ------------------------------------------------
  var isPlaying = false;
  var isGameOver = false;
  var score = 0;
  var lastMilestone = 0;
  var speed = 6;
  var groundOffset = 0;
  var isNight = false;

  var dino = {
    x: 48,
    y: GROUND_Y,
    w: 40,
    h: 44,
    vy: 0,
    isJumping: false,
    isDucking: false,
    legTimer: 0,
    legFrame: 0
  };

  var obstacles = [];
  var clouds = [];
  var horizonDots = [];
  var spawnTimer = 0;

  function initHorizon() {
    horizonDots = [];
    for (var i = 0; i < 30; i++) {
      horizonDots.push({
        x: Math.random() * LOGICAL_W,
        y: GROUND_Y + 4 + Math.random() * 24,
        w: 1 + Math.floor(Math.random() * 3)
      });
    }
    clouds = [
      { x: 120, y: 35, speed: 0.8 },
      { x: 340, y: 55, speed: 0.6 },
      { x: 520, y: 28, speed: 0.7 }
    ];
  }

  function resetGame() {
    score = 0;
    lastMilestone = 0;
    speed = 6;
    isNight = false;
    appWrap.classList.remove('night');
    curScoreEl.classList.remove('flash');
    curScoreEl.textContent = '00000';
    dino.y = GROUND_Y;
    dino.vy = 0;
    dino.isJumping = false;
    dino.isDucking = false;
    dino.h = 44;
    dino.w = 40;
    obstacles = [];
    spawnTimer = 50;
    initHorizon();
    isGameOver = false;
    isPlaying = true;
    modal.classList.add('hidden');
    startOverlay.style.display = 'none';
  }

  // ---- Obstacle Spawning ----------------------------------------------------
  function spawnObstacle() {
    // Determine type: cactus vs pterodactyl
    var allowPtero = score > 350;
    var isPtero = allowPtero && Math.random() < 0.32;

    if (isPtero) {
      // 3 heights: 0 = low (must jump), 1 = middle (must duck), 2 = high (fly over)
      var heightType = Math.floor(Math.random() * 3);
      var pY = GROUND_Y - 20; // low
      if (heightType === 1) pY = GROUND_Y - 42; // middle: duckable!
      else if (heightType === 2) pY = GROUND_Y - 65; // high

      obstacles.push({
        type: 'ptero',
        x: LOGICAL_W + 20,
        y: pY,
        w: 42,
        h: 28,
        wingTimer: 0,
        wingFrame: 0
      });
    } else {
      var isLarge = Math.random() < 0.45;
      var count = 1 + (Math.random() < 0.35 ? 1 : 0);
      var cW = isLarge ? 22 * count : 16 * count;
      var cH = isLarge ? 46 : 34;

      obstacles.push({
        type: 'cactus',
        isLarge: isLarge,
        count: count,
        x: LOGICAL_W + 20,
        y: GROUND_Y - cH + 4,
        w: cW,
        h: cH
      });
    }
  }

  // ---- Controls / Jump & Duck -----------------------------------------------
  var GRAVITY = 0.62;
  var JUMP_IMPULSE = -11.5;
  var FAST_DROP_GRAVITY = 1.6;

  function doJump() {
    if (isGameOver) {
      resetGame();
      return;
    }
    if (!isPlaying) {
      resetGame();
      return;
    }
    if (!dino.isJumping) {
      dino.isJumping = true;
      dino.vy = JUMP_IMPULSE;
      playSound('jump');
    }
  }

  function setDucking(val) {
    if (!isPlaying || isGameOver) return;
    dino.isDucking = val;
    if (val) {
      dino.w = 54;
      dino.h = 26;
      if (dino.isJumping) {
        // Fast drop!
        dino.vy += 3.5;
      }
    } else {
      dino.w = 40;
      dino.h = 44;
    }
  }

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      doJump();
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      setDucking(true);
    } else if (e.code === 'Enter' && isGameOver) {
      resetGame();
    }
  });

  window.addEventListener('keyup', function (e) {
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      setDucking(false);
    }
  });

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    doJump();
  });

  restartBtn.addEventListener('click', resetGame);
  playAgainBtn.addEventListener('click', resetGame);

  // ---- Collision Detection --------------------------------------------------
  function checkCollision(d, obs) {
    // Precise hitboxes with 3px forgiving grace margin
    var dLeft = d.x + 4;
    var dRight = d.x + d.w - 4;
    var dTop = (d.y - d.h) + 4;
    var dBottom = d.y - 2;

    var oLeft = obs.x + 3;
    var oRight = obs.x + obs.w - 3;
    var oTop = obs.y + 3;
    var oBottom = obs.y + obs.h - 2;

    return (dRight > oLeft && dLeft < oRight && dBottom > oTop && dTop < oBottom);
  }

  // ---- Update ---------------------------------------------------------------
  function update() {
    if (!isPlaying || isGameOver) return;

    // 1. Score & Speed
    score += 0.16;
    curScoreEl.textContent = padScore(score);

    // Day / Night cycle every 700 pts
    var cycle = Math.floor(score / 700);
    var nightState = (cycle % 2 === 1);
    if (nightState !== isNight) {
      isNight = nightState;
      if (isNight) appWrap.classList.add('night');
      else appWrap.classList.remove('night');
    }

    // Milestone sound every 100 pts
    var current100 = Math.floor(score / 100);
    if (current100 > lastMilestone) {
      lastMilestone = current100;
      playSound('milestone');
      curScoreEl.classList.add('flash');
      setTimeout(function () { curScoreEl.classList.remove('flash'); }, 900);
    }

    // Speed increases smoothly up to 13.5
    speed = Math.min(13.5, 6 + (score / 450));

    // 2. Dino Physics
    if (dino.isJumping) {
      var currentGrav = dino.isDucking ? FAST_DROP_GRAVITY : GRAVITY;
      dino.vy += currentGrav;
      dino.y += dino.vy;

      if (dino.y >= GROUND_Y) {
        dino.y = GROUND_Y;
        dino.vy = 0;
        dino.isJumping = false;
      }
    } else {
      // Animate running legs
      dino.legTimer += speed;
      if (dino.legTimer > 35) {
        dino.legTimer = 0;
        dino.legFrame = (dino.legFrame + 1) % 2;
      }
    }

    // 3. Move Horizon & Clouds
    groundOffset = (groundOffset + speed) % LOGICAL_W;
    for (var cl = 0; cl < clouds.length; cl++) {
      clouds[cl].x -= clouds[cl].speed;
      if (clouds[cl].x < -60) clouds[cl].x = LOGICAL_W + 30;
    }

    // 4. Move and Spawn Obstacles
    spawnTimer -= 1;
    if (spawnTimer <= 0) {
      spawnObstacle();
      // Variable distance between obstacles based on speed
      var minGap = 55;
      var randomGap = Math.floor(Math.random() * 50);
      spawnTimer = Math.round((minGap + randomGap) * (6.5 / speed));
    }

    for (var i = obstacles.length - 1; i >= 0; i--) {
      var obs = obstacles[i];
      obs.x -= speed;

      // Animate Pterodactyl wings
      if (obs.type === 'ptero') {
        obs.wingTimer += 1;
        if (obs.wingTimer > 10) {
          obs.wingTimer = 0;
          obs.wingFrame = (obs.wingFrame + 1) % 2;
        }
      }

      // Check collision
      if (checkCollision(dino, obs)) {
        triggerGameOver();
        return;
      }

      // Remove off-screen obstacles
      if (obs.x + obs.w < -20) {
        obstacles.splice(i, 1);
      }
    }
  }

  function triggerGameOver() {
    isGameOver = true;
    playSound('hit');
    var finalSc = Math.floor(score);
    saveBestScore(finalSc);

    finalScoreEl.textContent = padScore(finalSc);
    finalBestEl.textContent = padScore(bestScore);
    modal.classList.remove('hidden');
  }

  // ---- Pixel Art Canvas Rendering -------------------------------------------
  function drawDino() {
    ctx.fillStyle = isNight ? '#e2e8f0' : '#475569';
    var x = dino.x;
    var y = dino.y;

    if (dino.isDucking && !dino.isJumping) {
      // Ducking Dino Sprite
      var h = 26;
      var w = 54;
      // Body
      ctx.fillRect(x, y - h + 6, w - 16, h - 8);
      // Head extended forward
      ctx.fillRect(x + w - 24, y - h, 24, 16);
      // Eye
      ctx.fillStyle = isNight ? '#020617' : '#0f172a';
      ctx.fillRect(x + w - 10, y - h + 3, 3, 3);
      ctx.fillStyle = isNight ? '#e2e8f0' : '#475569';
      // Legs
      if (dino.legFrame === 0) {
        ctx.fillRect(x + 10, y - 6, 8, 6);
        ctx.fillRect(x + 28, y - 4, 8, 4);
      } else {
        ctx.fillRect(x + 10, y - 4, 8, 4);
        ctx.fillRect(x + 28, y - 6, 8, 6);
      }
    } else {
      // Standing / Running Dino
      var topY = y - dino.h;
      // Head & snout
      ctx.fillRect(x + 18, topY, 20, 16);
      ctx.fillRect(x + 24, topY + 16, 14, 4); // upper jaw
      // Eye
      ctx.fillStyle = isNight ? '#020617' : '#0f172a';
      ctx.fillRect(x + 22, topY + 3, 4, 4);
      ctx.fillStyle = isNight ? '#e2e8f0' : '#475569';
      // Body & belly
      ctx.fillRect(x + 12, topY + 16, 16, 18);
      // Back & tail
      ctx.fillRect(x, topY + 18, 12, 10);
      ctx.fillRect(x + 4, topY + 14, 10, 6);
      // Small arms
      ctx.fillRect(x + 28, topY + 22, 6, 4);
      ctx.fillRect(x + 32, topY + 24, 2, 4);

      // Running legs
      if (dino.isJumping) {
        // Legs tucked
        ctx.fillRect(x + 12, topY + 34, 4, 8);
        ctx.fillRect(x + 20, topY + 34, 4, 6);
      } else {
        if (dino.legFrame === 0) {
          ctx.fillRect(x + 12, topY + 34, 4, 10);
          ctx.fillRect(x + 20, topY + 34, 4, 6);
        } else {
          ctx.fillRect(x + 12, topY + 34, 4, 6);
          ctx.fillRect(x + 20, topY + 34, 4, 10);
        }
      }
    }
  }

  function drawCactus(obs) {
    ctx.fillStyle = isNight ? '#22c55e' : '#15803d';
    for (var c = 0; c < obs.count; c++) {
      var cx = obs.x + c * (obs.isLarge ? 20 : 14);
      var cy = obs.y;
      var w = obs.isLarge ? 12 : 8;
      var h = obs.h;

      // Main trunk
      ctx.fillRect(cx + 4, cy, w, h);
      // Left arm
      ctx.fillRect(cx, cy + h * 0.35, 4, h * 0.35);
      ctx.fillRect(cx, cy + h * 0.35, 6, 4);
      // Right arm
      ctx.fillRect(cx + w + 4, cy + h * 0.25, 4, h * 0.4);
      ctx.fillRect(cx + w + 2, cy + h * 0.55, 4, 4);
    }
  }

  function drawPtero(obs) {
    ctx.fillStyle = isNight ? '#94a3b8' : '#64748b';
    var x = obs.x;
    var y = obs.y;

    // Body
    ctx.fillRect(x + 8, y + 10, 18, 8);
    // Beak & Head
    ctx.fillRect(x + 24, y + 6, 14, 6);
    ctx.fillRect(x + 36, y + 8, 6, 2);

    // Wings
    if (obs.wingFrame === 0) {
      // Wings up
      ctx.fillRect(x + 12, y, 6, 12);
      ctx.fillRect(x + 8, y + 2, 4, 8);
    } else {
      // Wings down
      ctx.fillRect(x + 12, y + 16, 6, 10);
      ctx.fillRect(x + 8, y + 16, 4, 6);
    }
  }

  function drawClouds() {
    ctx.fillStyle = isNight ? 'rgba(148, 163, 184, 0.2)' : 'rgba(203, 213, 225, 0.4)';
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      ctx.fillRect(c.x, c.y + 4, 42, 8);
      ctx.fillRect(c.x + 8, c.y, 24, 6);
      ctx.fillRect(c.x + 14, c.y - 3, 14, 4);
    }
  }

  function drawMoonAndStars() {
    if (!isNight) return;
    // Crescent Moon
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(LOGICAL_W - 80, 45, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.arc(LOGICAL_W - 86, 41, 13, 0, Math.PI * 2);
    ctx.fill();

    // Stars
    ctx.fillStyle = '#f8fafc';
    var stars = [
      { x: 60, y: 30 }, { x: 190, y: 22 }, { x: 280, y: 40 },
      { x: 390, y: 20 }, { x: 480, y: 35 }
    ];
    for (var s = 0; s < stars.length; s++) {
      ctx.fillRect(stars[s].x, stars[s].y, 2, 2);
    }
  }

  function render() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

    // 1. Sky (Moon/Stars & Clouds)
    drawMoonAndStars();
    drawClouds();

    // 2. Ground line & bumps
    ctx.strokeStyle = isNight ? '#334155' : '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(LOGICAL_W, GROUND_Y);
    ctx.stroke();

    // Ground horizon moving bumps
    ctx.fillStyle = isNight ? '#475569' : '#64748b';
    for (var b = 0; b < horizonDots.length; b++) {
      var dot = horizonDots[b];
      var rx = (dot.x - groundOffset + LOGICAL_W * 2) % LOGICAL_W;
      ctx.fillRect(rx, dot.y, dot.w, 1.5);
    }

    // 3. Obstacles
    for (var o = 0; o < obstacles.length; o++) {
      var obs = obstacles[o];
      if (obs.type === 'cactus') {
        drawCactus(obs);
      } else if (obs.type === 'ptero') {
        drawPtero(obs);
      }
    }

    // 4. Dino
    drawDino();

    ctx.restore();
  }

  // ---- Main Game Loop -------------------------------------------------------
  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  // ---- Bootstrap ------------------------------------------------------------
  loadBestScore();
  initHorizon();
  requestAnimationFrame(loop);
})();
