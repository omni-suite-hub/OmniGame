/*
 * games/space-invaders/game.js
 * 太空小蜜蜂 / 太空入侵者 (Space Invaders)
 *
 * Full-featured retro space arcade shooter:
 * - 5 rows of animated alien invaders with accelerating march tempo
 * - Destructible defensive bunkers
 * - Mystery red UFO flying saucers
 * - Explosive particle effects & Web Audio retro sound synthesis
 */
(function () {
  'use strict';

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('scoreVal');
  var bestEl = document.getElementById('bestVal');
  var waveEl = document.getElementById('waveVal');
  var livesIcons = document.getElementById('livesIcons');
  var soundBtn = document.getElementById('soundBtn');
  var restartBtn = document.getElementById('restartBtn');
  var leftBtn = document.getElementById('leftBtn');
  var rightBtn = document.getElementById('rightBtn');
  var fireBtn = document.getElementById('fireBtn');
  var modal = document.getElementById('modalOverlay');
  var modalTitle = document.getElementById('modalTitle');
  var modalEmoji = document.getElementById('modalEmoji');
  var finalScoreEl = document.getElementById('finalScore');
  var finalBestEl = document.getElementById('finalBest');
  var playAgainBtn = document.getElementById('playAgainBtn');

  var LOGICAL_W = 380;
  var LOGICAL_H = 480;

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

  var marchNote = 0;
  var MARCH_FREQS = [90, 82, 75, 68];

  function playSound(type) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;

    var now = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'march') {
      var f = MARCH_FREQS[marchNote % MARCH_FREQS.length];
      marchNote++;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'shoot') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.09);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.09);
    } else if (type === 'invader_die') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.linearRampToValueAtTime(80, now + 0.12);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'ufo') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(700, now);
      osc.frequency.linearRampToValueAtTime(950, now + 0.1);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'player_die') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(40, now + 0.4);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  }

  try {
    var storedSound = localStorage.getItem('omg:invaders:sound');
    if (storedSound !== null) soundEnabled = storedSound === '1';
  } catch (e) {}
  soundBtn.textContent = soundEnabled ? '🔊' : '🔇';

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
    try {
      localStorage.setItem('omg:invaders:sound', soundEnabled ? '1' : '0');
    } catch (e) {}
  });

  // ---- High Score Persistence -----------------------------------------------
  var bestScore = 0;
  function loadBestScore() {
    if (window.GameStore && typeof window.GameStore.getBest === 'function') {
      window.GameStore.getBest('space-invaders').then(function (val) {
        bestScore = val || 0;
        bestEl.textContent = bestScore;
      });
    } else {
      try {
        bestScore = parseInt(localStorage.getItem('omg:best:space-invaders') || '0', 10);
        bestEl.textContent = bestScore;
      } catch (e) {}
    }
  }

  function saveBestScore(sc) {
    if (sc > bestScore) {
      bestScore = sc;
      bestEl.textContent = bestScore;
      if (window.GameStore && typeof window.GameStore.saveBest === 'function') {
        window.GameStore.saveBest('space-invaders', bestScore);
      } else {
        try {
          localStorage.setItem('omg:best:space-invaders', String(bestScore));
        } catch (e) {}
      }
    }
  }

  // ---- Game State & Entities ------------------------------------------------
  var score = 0;
  var wave = 1;
  var lives = 3;
  var isGameOver = false;

  var player = {
    x: LOGICAL_W / 2 - 14,
    y: LOGICAL_H - 36,
    w: 28,
    h: 18,
    speed: 4.6,
    movingLeft: false,
    movingRight: false,
    shootCooldown: 0
  };

  var playerLasers = [];
  var alienBombs = [];
  var particles = [];
  var stars = [];
  var bunkers = [];
  var ufo = null;
  var ufoSpawnTimer = 600;

  // Invaders fleet state
  var invaders = [];
  var fleetDir = 1; // 1 = right, -1 = left
  var fleetStepTimer = 0;
  var fleetStepInterval = 45; // decreases as aliens die
  var fleetAnimFrame = 0;

  function initStars() {
    stars = [];
    for (var i = 0; i < 45; i++) {
      stars.push({
        x: Math.random() * LOGICAL_W,
        y: Math.random() * LOGICAL_H,
        size: Math.random() < 0.3 ? 1.8 : 1,
        speed: 0.3 + Math.random() * 0.6
      });
    }
  }

  function initBunkers() {
    bunkers = [];
    var count = 3;
    var bW = 44;
    var bH = 24;
    var spacing = (LOGICAL_W - (count * bW)) / (count + 1);

    for (var i = 0; i < count; i++) {
      var bx = spacing + i * (bW + spacing);
      var by = LOGICAL_H - 85;
      // 4x3 mini blocks inside each bunker
      var blocks = [];
      var cols = 5;
      var rows = 3;
      var blkW = bW / cols;
      var blkH = bH / rows;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          if (r === rows - 1 && (c === 1 || c === 2 || c === 3)) continue; // arch cutout
          blocks.push({
            x: bx + c * blkW,
            y: by + r * blkH,
            w: blkW,
            h: blkH,
            hp: 3
          });
        }
      }
      bunkers.push({ blocks: blocks });
    }
  }

  function initWave(w) {
    wave = w;
    waveEl.textContent = wave;
    invaders = [];
    fleetDir = 1;
    fleetAnimFrame = 0;
    playerLasers = [];
    alienBombs = [];

    var startY = 40 + Math.min(60, (w - 1) * 15);
    var rows = 5;
    var cols = 8;
    var invW = 24;
    var invH = 16;
    var spacingX = 14;
    var spacingY = 12;
    var totalW = cols * invW + (cols - 1) * spacingX;
    var startX = (LOGICAL_W - totalW) / 2;

    for (var r = 0; r < rows; r++) {
      var type = 'squid';
      var color = '#a855f7';
      var pts = 30;

      if (r === 1 || r === 2) {
        type = 'crab';
        color = '#38bdf8';
        pts = 20;
      } else if (r === 3 || r === 4) {
        type = 'octopus';
        color = '#22c55e';
        pts = 10;
      }

      for (var c = 0; c < cols; c++) {
        invaders.push({
          type: type,
          color: color,
          pts: pts,
          x: startX + c * (invW + spacingX),
          y: startY + r * (invH + spacingY),
          w: invW,
          h: invH
        });
      }
    }

    fleetStepInterval = Math.max(16, 42 - (w * 3));
    fleetStepTimer = fleetStepInterval;
  }

  function updateLivesUI() {
    var ships = '';
    for (var i = 0; i < lives; i++) ships += '🚀';
    livesIcons.textContent = ships || '💥';
  }

  function resetGame() {
    score = 0;
    wave = 1;
    lives = 3;
    isGameOver = false;
    ufo = null;
    ufoSpawnTimer = 600;
    scoreEl.textContent = '0';
    updateLivesUI();
    initBunkers();
    initWave(wave);
    player.x = LOGICAL_W / 2 - 14;
    modal.classList.add('hidden');
  }

  // ---- Player Actions -------------------------------------------------------
  function shoot() {
    if (isGameOver) return;
    if (player.shootCooldown <= 0 && playerLasers.length < 2) {
      playerLasers.push({
        x: player.x + player.w / 2 - 1.5,
        y: player.y - 6,
        w: 3,
        h: 10,
        vy: -7.5
      });
      player.shootCooldown = 14;
      playSound('shoot');
    }
  }

  // ---- Particle System ------------------------------------------------------
  function spawnExplosion(x, y, color, count) {
    count = count || 12;
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var spd = 1.2 + Math.random() * 3.8;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        r: 1.8 + Math.random() * 2,
        color: color,
        alpha: 1
      });
    }
  }

  // ---- Controls / Listeners -------------------------------------------------
  window.addEventListener('keydown', function (e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); player.movingLeft = true; }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); player.movingRight = true; }
    else if (e.code === 'Space') {
      e.preventDefault();
      if (isGameOver) resetGame();
      else shoot();
    } else if (e.code === 'Enter' && isGameOver) resetGame();
  });

  window.addEventListener('keyup', function (e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') player.movingLeft = false;
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') player.movingRight = false;
  });

  leftBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); player.movingLeft = true; });
  leftBtn.addEventListener('pointerup', function () { player.movingLeft = false; });
  leftBtn.addEventListener('pointercancel', function () { player.movingLeft = false; });

  rightBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); player.movingRight = true; });
  rightBtn.addEventListener('pointerup', function () { player.movingRight = false; });
  rightBtn.addEventListener('pointercancel', function () { player.movingRight = false; });

  fireBtn.addEventListener('click', shoot);
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (isGameOver) resetGame();
    else shoot();
  });

  restartBtn.addEventListener('click', resetGame);
  playAgainBtn.addEventListener('click', resetGame);

  // ---- Update ---------------------------------------------------------------
  function update() {
    if (isGameOver) return;

    // 1. Move Player
    if (player.movingLeft) player.x = Math.max(10, player.x - player.speed);
    if (player.movingRight) player.x = Math.min(LOGICAL_W - player.w - 10, player.x + player.speed);
    if (player.shootCooldown > 0) player.shootCooldown--;

    // 2. Stars
    for (var s = 0; s < stars.length; s++) {
      stars[s].y += stars[s].speed;
      if (stars[s].y > LOGICAL_H) {
        stars[s].y = 0;
        stars[s].x = Math.random() * LOGICAL_W;
      }
    }

    // 3. Move Player Lasers
    for (var l = playerLasers.length - 1; l >= 0; l--) {
      var pl = playerLasers[l];
      pl.y += pl.vy;

      // Hit Bunkers
      var hitBunker = false;
      for (var bk = 0; bk < bunkers.length; bk++) {
        var blocks = bunkers[bk].blocks;
        for (var bl = blocks.length - 1; bl >= 0; bl--) {
          var block = blocks[bl];
          if (pl.x >= block.x && pl.x <= block.x + block.w && pl.y >= block.y && pl.y <= block.y + block.h) {
            block.hp--;
            if (block.hp <= 0) blocks.splice(bl, 1);
            hitBunker = true;
            break;
          }
        }
        if (hitBunker) break;
      }

      if (hitBunker || pl.y < -10) {
        playerLasers.splice(l, 1);
        continue;
      }

      // Hit UFO
      if (ufo && pl.x >= ufo.x && pl.x <= ufo.x + ufo.w && pl.y >= ufo.y && pl.y <= ufo.y + ufo.h) {
        score += ufo.pts;
        scoreEl.textContent = score;
        saveBestScore(score);
        spawnExplosion(ufo.x + ufo.w / 2, ufo.y + ufo.h / 2, '#ef4444', 20);
        playSound('invader_die');
        ufo = null;
        playerLasers.splice(l, 1);
        continue;
      }

      // Hit Invaders
      var hitInv = false;
      for (var invIdx = invaders.length - 1; invIdx >= 0; invIdx--) {
        var inv = invaders[invIdx];
        if (pl.x >= inv.x && pl.x <= inv.x + inv.w && pl.y >= inv.y && pl.y <= inv.y + inv.h) {
          score += inv.pts;
          scoreEl.textContent = score;
          saveBestScore(score);
          spawnExplosion(inv.x + inv.w / 2, inv.y + inv.h / 2, inv.color, 12);
          playSound('invader_die');
          invaders.splice(invIdx, 1);
          hitInv = true;

          // Accelerate tempo as aliens die
          var ratio = invaders.length / 40;
          fleetStepInterval = Math.max(6, Math.floor(4 + ratio * 34));
          break;
        }
      }

      if (hitInv) {
        playerLasers.splice(l, 1);
      }
    }

    // 4. Wave Victory Check
    if (invaders.length === 0) {
      wave++;
      initWave(wave);
      return;
    }

    // 5. Fleet March Cadence
    fleetStepTimer--;
    if (fleetStepTimer <= 0) {
      fleetStepTimer = fleetStepInterval;
      fleetAnimFrame = (fleetAnimFrame + 1) % 2;
      playSound('march');

      // Check if any invader hits wall
      var hitWall = false;
      var stepX = fleetDir * 10;
      for (var ck = 0; ck < invaders.length; ck++) {
        var nx = invaders[ck].x + stepX;
        if (nx < 12 || nx + invaders[ck].w > LOGICAL_W - 12) {
          hitWall = true;
          break;
        }
      }

      if (hitWall) {
        fleetDir = -fleetDir;
        for (var d = 0; d < invaders.length; d++) {
          invaders[d].y += 12;
          // Invasion touchdown check
          if (invaders[d].y + invaders[d].h >= player.y) {
            triggerGameOver();
            return;
          }
        }
      } else {
        for (var m = 0; m < invaders.length; m++) {
          invaders[m].x += stepX;
        }
      }

      // Random alien bomb drop from bottom-most aliens
      if (Math.random() < 0.42 && alienBombs.length < 3) {
        var shooter = invaders[Math.floor(Math.random() * invaders.length)];
        alienBombs.push({
          x: shooter.x + shooter.w / 2,
          y: shooter.y + shooter.h,
          w: 3,
          h: 8,
          vy: 3.2
        });
      }
    }

    // 6. Alien Bombs Movement & Collision
    for (var b = alienBombs.length - 1; b >= 0; b--) {
      var ab = alienBombs[b];
      ab.y += ab.vy;

      // Hit Bunkers
      var bombHitBunker = false;
      for (var bk2 = 0; bk2 < bunkers.length; bk2++) {
        var blks = bunkers[bk2].blocks;
        for (var bki = blks.length - 1; bki >= 0; bki--) {
          var blk = blks[bki];
          if (ab.x >= blk.x && ab.x <= blk.x + blk.w && ab.y >= blk.y && ab.y <= blk.y + blk.h) {
            blk.hp--;
            if (blk.hp <= 0) blks.splice(bki, 1);
            bombHitBunker = true;
            break;
          }
        }
        if (bombHitBunker) break;
      }

      if (bombHitBunker || ab.y > LOGICAL_H + 10) {
        alienBombs.splice(b, 1);
        continue;
      }

      // Hit Player
      if (ab.x >= player.x && ab.x <= player.x + player.w && ab.y >= player.y && ab.y <= player.y + player.h) {
        alienBombs.splice(b, 1);
        handlePlayerHit();
      }
    }

    // 7. Mystery UFO Flying Saucer
    ufoSpawnTimer--;
    if (ufoSpawnTimer <= 0 && !ufo) {
      ufo = {
        x: -36,
        y: 18,
        w: 36,
        h: 16,
        vx: 2.2,
        pts: [100, 150, 200, 300][Math.floor(Math.random() * 4)]
      };
      playSound('ufo');
      ufoSpawnTimer = 900 + Math.floor(Math.random() * 600);
    }

    if (ufo) {
      ufo.x += ufo.vx;
      if (ufo.x > LOGICAL_W + 40) ufo = null;
    }

    // 8. Update Particles
    for (var pt = particles.length - 1; pt >= 0; pt--) {
      var part = particles[pt];
      part.x += part.vx;
      part.y += part.vy;
      part.alpha -= 0.035;
      if (part.alpha <= 0) particles.splice(pt, 1);
    }
  }

  function handlePlayerHit() {
    playSound('player_die');
    spawnExplosion(player.x + player.w / 2, player.y + player.h / 2, '#22c55e', 24);
    lives--;
    updateLivesUI();
    if (lives <= 0) {
      triggerGameOver();
    } else {
      player.x = LOGICAL_W / 2 - 14;
    }
  }

  function triggerGameOver() {
    isGameOver = true;
    saveBestScore(score);
    finalScoreEl.textContent = score;
    finalBestEl.textContent = bestScore;
    modalTitle.textContent = 'GAME OVER';
    modalEmoji.textContent = '👾';
    modal.classList.remove('hidden');
  }

  // ---- Rendering ------------------------------------------------------------
  function drawInvader(inv) {
    ctx.fillStyle = inv.color;
    var x = inv.x;
    var y = inv.y;
    var f = fleetAnimFrame;

    if (inv.type === 'squid') {
      // Top Squid
      ctx.fillRect(x + 8, y, 8, 4);
      ctx.fillRect(x + 4, y + 4, 16, 6);
      ctx.fillRect(x + 6, y + 10, 12, 4);
      // Tentacles
      if (f === 0) {
        ctx.fillRect(x + 4, y + 14, 4, 4);
        ctx.fillRect(x + 16, y + 14, 4, 4);
      } else {
        ctx.fillRect(x, y + 14, 4, 4);
        ctx.fillRect(x + 20, y + 14, 4, 4);
      }
    } else if (inv.type === 'crab') {
      // Middle Crab
      ctx.fillRect(x + 4, y + 2, 16, 8);
      ctx.fillRect(x + 2, y + 6, 20, 6);
      // Eyes
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x + 6, y + 4, 2, 2);
      ctx.fillRect(x + 16, y + 4, 2, 2);
      ctx.fillStyle = inv.color;
      // Claws
      if (f === 0) {
        ctx.fillRect(x, y, 4, 6);
        ctx.fillRect(x + 20, y, 4, 6);
      } else {
        ctx.fillRect(x, y + 8, 4, 6);
        ctx.fillRect(x + 20, y + 8, 4, 6);
      }
    } else {
      // Bottom Octopus
      ctx.fillRect(x + 6, y, 12, 4);
      ctx.fillRect(x + 2, y + 4, 20, 8);
      // Eyes
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x + 6, y + 5, 2, 3);
      ctx.fillRect(x + 16, y + 5, 2, 3);
      ctx.fillStyle = inv.color;
      // Legs
      if (f === 0) {
        ctx.fillRect(x + 4, y + 12, 4, 4);
        ctx.fillRect(x + 16, y + 12, 4, 4);
      } else {
        ctx.fillRect(x + 8, y + 12, 8, 4);
      }
    }
  }

  function drawPlayer() {
    var px = player.x;
    var py = player.y;

    // Green Neon Starfighter Tank
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(px + player.w / 2, py);
    ctx.lineTo(px + player.w, py + player.h);
    ctx.lineTo(px + player.w - 4, py + player.h);
    ctx.lineTo(px + player.w / 2, py + player.h - 4);
    ctx.lineTo(px + 4, py + player.h);
    ctx.lineTo(px, py + player.h);
    ctx.closePath();
    ctx.fill();

    // Cannon tip
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(px + player.w / 2 - 1.5, py - 3, 3, 4);
  }

  function drawBunkers() {
    for (var b = 0; b < bunkers.length; b++) {
      var blocks = bunkers[b].blocks;
      for (var k = 0; k < blocks.length; k++) {
        var blk = blocks[k];
        ctx.fillStyle = blk.hp === 3 ? '#22c55e' : (blk.hp === 2 ? '#84cc16' : '#eab308');
        ctx.fillRect(blk.x, blk.y, blk.w - 0.5, blk.h - 0.5);
      }
    }
  }

  function drawUFO() {
    if (!ufo) return;
    var x = ufo.x;
    var y = ufo.y;

    // Red Flying Saucer
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.ellipse(x + ufo.w / 2, y + ufo.h / 2, ufo.w / 2, ufo.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dome
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(x + ufo.w / 2, y + 4, 5, Math.PI, 0);
    ctx.fill();
  }

  function render() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

    // 1. Stars
    ctx.fillStyle = '#ffffff';
    for (var s = 0; s < stars.length; s++) {
      ctx.fillRect(stars[s].x, stars[s].y, stars[s].size, stars[s].size);
    }

    // 2. UFO
    drawUFO();

    // 3. Invaders
    for (var i = 0; i < invaders.length; i++) {
      drawInvader(invaders[i]);
    }

    // 4. Bunkers
    drawBunkers();

    // 5. Lasers & Bombs
    ctx.fillStyle = '#38bdf8';
    for (var l = 0; l < playerLasers.length; l++) {
      var pl = playerLasers[l];
      ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
    }

    ctx.fillStyle = '#f87171';
    for (var b = 0; b < alienBombs.length; b++) {
      var ab = alienBombs[b];
      ctx.fillRect(ab.x, ab.y, ab.w, ab.h);
    }

    // 6. Player
    drawPlayer();

    // 7. Particles
    for (var pt = 0; pt < particles.length; pt++) {
      var p = particles[pt];
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
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
  initStars();
  resetGame();
  requestAnimationFrame(loop);
})();
