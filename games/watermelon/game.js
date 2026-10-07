/*
 * games/watermelon/game.js
 * 合成大西瓜 (Suika Game / Watermelon Merge)
 *
 * Lightweight, high-performance 2D circle physics simulation with Web Audio synthesis.
 * 100% offline, zero external dependencies.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('scoreVal');
  var bestEl = document.getElementById('bestVal');
  var nextWrap = document.getElementById('nextIconWrap');
  var soundBtn = document.getElementById('soundBtn');
  var restartBtn = document.getElementById('restartBtn');
  var modal = document.getElementById('modalOverlay');
  var modalTitle = document.getElementById('modalTitle');
  var finalScoreEl = document.getElementById('finalScore');
  var finalBestEl = document.getElementById('finalBest');
  var playAgainBtn = document.getElementById('playAgainBtn');

  var LOGICAL_W = 380;
  var LOGICAL_H = 620;
  var WALL_LEFT = 16;
  var WALL_RIGHT = LOGICAL_W - 16;
  var FLOOR_Y = LOGICAL_H - 18;
  var DANGER_Y = 115;

  var dpr = window.devicePixelRatio || 1;
  function setupDpr() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(LOGICAL_W * dpr);
    canvas.height = Math.round(LOGICAL_H * dpr);
  }
  setupDpr();
  window.addEventListener('resize', setupDpr);

  var FRUITS = [
    { level: 0, name: '葡萄', emoji: '🍇', r: 16, color: '#9333ea', stroke: '#7e22ce', score: 1 },
    { level: 1, name: '樱桃', emoji: '🍒', r: 23, color: '#f43f5e', stroke: '#e11d48', score: 2 },
    { level: 2, name: '橘子', emoji: '🍊', r: 31, color: '#fb923c', stroke: '#ea580c', score: 4 },
    { level: 3, name: '柠檬', emoji: '🍋', r: 39, color: '#facc15', stroke: '#eab308', score: 8 },
    { level: 4, name: '猕猴桃', emoji: '🥝', r: 47, color: '#84cc16', stroke: '#65a30d', score: 16 },
    { level: 5, name: '西红柿', emoji: '🍅', r: 56, color: '#ef4444', stroke: '#dc2626', score: 32 },
    { level: 6, name: '桃子', emoji: '🍑', r: 66, color: '#f472b6', stroke: '#db2777', score: 64 },
    { level: 7, name: '菠萝', emoji: '🍍', r: 78, color: '#eab308', stroke: '#ca8a04', score: 128 },
    { level: 8, name: '椰子', emoji: '🥥', r: 91, color: '#a16207', stroke: '#78350f', score: 256 },
    { level: 9, name: '半个西瓜', emoji: '🍉', r: 105, color: '#10b981', stroke: '#059669', score: 512 },
    { level: 10, name: '大西瓜', emoji: '🍉', r: 120, color: '#047857', stroke: '#064e3b', score: 1024 }
  ];

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

  function playSound(type, level) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;

    var now = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'drop') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.09);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.09);
    } else if (type === 'merge') {
      var baseFreq = 260 + (level || 0) * 55;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.12);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'watermelon') {
      // Fanfare chord
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        var o = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f, now + i * 0.08);
        g.gain.setValueAtTime(0.25, now + i * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.35);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(now + i * 0.08);
        o.stop(now + i * 0.08 + 0.35);
      });
    }
  }

  // Load sound preference
  try {
    var storedSound = localStorage.getItem('omg:watermelon:sound');
    if (storedSound !== null) soundEnabled = storedSound === '1';
  } catch (e) {}
  updateSoundBtn();

  function updateSoundBtn() {
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  }

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    updateSoundBtn();
    try {
      localStorage.setItem('omg:watermelon:sound', soundEnabled ? '1' : '0');
    } catch (e) {}
  });

  // ---- Game State -----------------------------------------------------------
  var score = 0;
  var bestScore = 0;
  var fruits = [];
  var particles = [];
  var currentFruit = null;
  var nextFruitLevel = 0;
  var canDrop = true;
  var dropCooldownTimer = null;
  var aimX = LOGICAL_W / 2;
  var gameOver = false;
  var dangerTimer = 0; // ms fruit has stayed above danger line

  // ---- High Score Persistence -----------------------------------------------
  function loadBestScore() {
    if (window.GameStore && typeof window.GameStore.getBest === 'function') {
      window.GameStore.getBest('watermelon').then(function (val) {
        bestScore = val || 0;
        bestEl.textContent = bestScore;
      });
    } else {
      try {
        bestScore = parseInt(localStorage.getItem('omg:best:watermelon') || '0', 10);
        bestEl.textContent = bestScore;
      } catch (e) {}
    }
  }

  function saveBestScore() {
    if (score > bestScore) {
      bestScore = score;
      bestEl.textContent = bestScore;
      if (window.GameStore && typeof window.GameStore.saveBest === 'function') {
        window.GameStore.saveBest('watermelon', bestScore);
      } else {
        try {
          localStorage.setItem('omg:best:watermelon', String(bestScore));
        } catch (e) {}
      }
    }
  }

  // ---- Fruit Entity ---------------------------------------------------------
  function createFruit(level, x, y, isStatic) {
    var def = FRUITS[level];
    return {
      id: Math.random().toString(36).substr(2, 9),
      level: level,
      x: x,
      y: y,
      vx: 0,
      vy: 0,
      r: def.r,
      color: def.color,
      stroke: def.stroke,
      score: def.score,
      isStatic: !!isStatic,
      scale: 0.1, // for pop spawn animation
      targetScale: 1,
      merging: false
    };
  }

  function rollDroppableLevel() {
    // Only spawn levels 0 to 4 (grape, cherry, orange, lemon, kiwi)
    var weights = [40, 30, 18, 9, 3];
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var rand = Math.random() * total;
    var acc = 0;
    for (var i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (rand <= acc) return i;
    }
    return 0;
  }

  function spawnNextDropFruit() {
    var lvl = nextFruitLevel;
    nextFruitLevel = rollDroppableLevel();
    updateNextPreview();

    var def = FRUITS[lvl];
    currentFruit = {
      level: lvl,
      x: clamp(aimX, WALL_LEFT + def.r, WALL_RIGHT - def.r),
      y: 54,
      r: def.r,
      color: def.color,
      stroke: def.stroke,
      scale: 1
    };
    canDrop = true;
  }

  function updateNextPreview() {
    var nextDef = FRUITS[nextFruitLevel];
    nextWrap.textContent = nextDef.emoji;
  }

  function dropCurrentFruit() {
    if (!canDrop || !currentFruit || gameOver) return;
    canDrop = false;

    var fruit = createFruit(currentFruit.level, currentFruit.x, currentFruit.y);
    fruit.scale = 1;
    fruit.vy = 2.5; // slight downward impulse
    fruits.push(fruit);
    currentFruit = null;
    playSound('drop');
    saveGameState();

    clearTimeout(dropCooldownTimer);
    dropCooldownTimer = setTimeout(function () {
      if (!gameOver) {
        spawnNextDropFruit();
      }
    }, 420);
  }

  // ---- Particle System ------------------------------------------------------
  function spawnMergeJuice(x, y, color, count) {
    count = count || 12;
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 1.5 + Math.random() * 4.5;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        r: 2.5 + Math.random() * 3.5,
        color: color,
        alpha: 1,
        life: 0.95
      });
    }
  }

  function updateParticles() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.16; // gravity
      p.alpha -= 0.024;
      if (p.alpha <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  // ---- Physics Engine -------------------------------------------------------
  var GRAVITY = 0.38;
  var RESTITUTION = 0.22;
  var FRICTION = 0.985;
  var FLOOR_FRICTION = 0.95;

  function updatePhysics() {
    if (gameOver) return;

    // 1. Integrate motion
    for (var i = 0; i < fruits.length; i++) {
      var f = fruits[i];
      if (f.merging) continue;

      if (f.scale < f.targetScale) {
        f.scale = Math.min(f.targetScale, f.scale + 0.18);
      }

      f.vy += GRAVITY;
      f.vx *= FRICTION;
      f.vy *= FRICTION;

      f.x += f.vx;
      f.y += f.vy;

      // Wall collisions
      if (f.x - f.r < WALL_LEFT) {
        f.x = WALL_LEFT + f.r;
        f.vx = -f.vx * RESTITUTION;
      } else if (f.x + f.r > WALL_RIGHT) {
        f.x = WALL_RIGHT - f.r;
        f.vx = -f.vx * RESTITUTION;
      }

      // Floor collision
      if (f.y + f.r > FLOOR_Y) {
        f.y = FLOOR_Y - f.r;
        f.vy = -f.vy * RESTITUTION;
        f.vx *= FLOOR_FRICTION;
        if (Math.abs(f.vy) < 0.25) f.vy = 0;
      }
    }

    // 2. Iterative Circle-to-Circle Collision Resolution (Relaxation)
    var iterations = 8;
    for (var iter = 0; iter < iterations; iter++) {
      for (var aIdx = 0; aIdx < fruits.length; aIdx++) {
        var a = fruits[aIdx];
        if (a.merging) continue;

        for (var bIdx = aIdx + 1; bIdx < fruits.length; bIdx++) {
          var b = fruits[bIdx];
          if (b.merging) continue;

          var dx = b.x - a.x;
          var dy = b.y - a.y;
          var distSq = dx * dx + dy * dy;
          var minDist = a.r + b.r;

          if (distSq < minDist * minDist) {
            // Check for identical fruit merge!
            if (a.level === b.level && a.level < FRUITS.length - 1 && !a.merging && !b.merging) {
              a.merging = true;
              b.merging = true;
              handleMerge(a, b);
              break;
            }

            // Normal elastic overlap push
            var dist = Math.sqrt(distSq) || 0.001;
            var overlap = minDist - dist;
            var nx = dx / dist;
            var ny = dy / dist;

            // Mass ratio proportional to radius
            var totalR = a.r + b.r;
            var ratioA = b.r / totalR;
            var ratioB = a.r / totalR;

            a.x -= nx * overlap * ratioA;
            a.y -= ny * overlap * ratioA;
            b.x += nx * overlap * ratioB;
            b.y += ny * overlap * ratioB;

            // Impulse response along normal
            var kx = a.vx - b.vx;
            var ky = a.vy - b.vy;
            var p = 2 * (nx * kx + ny * ky) / 2;

            if (p > 0) {
              a.vx -= p * nx * RESTITUTION * ratioA;
              a.vy -= p * ny * RESTITUTION * ratioA;
              b.vx += p * nx * RESTITUTION * ratioB;
              b.vy += p * ny * RESTITUTION * ratioB;
            }
          }
        }
      }
    }

    // 3. Check Danger Line condition
    var hasFruitInDanger = false;
    for (var d = 0; d < fruits.length; d++) {
      var df = fruits[d];
      if (!df.merging && df.y - df.r < DANGER_Y && Math.abs(df.vy) < 0.8 && df.y > 60) {
        hasFruitInDanger = true;
        break;
      }
    }

    if (hasFruitInDanger) {
      dangerTimer += 16;
      if (dangerTimer > 2800) {
        triggerGameOver();
      }
    } else {
      dangerTimer = Math.max(0, dangerTimer - 24);
    }
  }

  function handleMerge(a, b) {
    var midX = (a.x + b.x) / 2;
    var midY = (a.y + b.y) / 2;
    var nextLevel = a.level + 1;

    // Remove old fruits
    fruits = fruits.filter(function (f) { return f !== a && f !== b; });

    // Spawn upgraded fruit
    var newFruit = createFruit(nextLevel, midX, midY);
    newFruit.scale = 0.3;
    newFruit.vy = -1.2; // cute bounce up
    fruits.push(newFruit);

    // Score & juice effects
    score += newFruit.score;
    scoreEl.textContent = score;
    saveBestScore();
    saveGameState();

    spawnMergeJuice(midX, midY, newFruit.color, 14);

    if (nextLevel === FRUITS.length - 1) {
      playSound('watermelon');
      spawnMergeJuice(midX, midY, '#facc15', 30);
    } else {
      playSound('merge', nextLevel);
    }
  }

  var SAVE_KEY = 'omg:save:watermelon';

  function saveGameState() {
    if (gameOver) {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      return;
    }
    try {
      var serializedFruits = fruits.map(function (f) {
        return {
          level: f.level,
          x: Math.round(f.x * 10) / 10,
          y: Math.round(f.y * 10) / 10,
          vx: Math.round(f.vx * 10) / 10,
          vy: Math.round(f.vy * 10) / 10
        };
      });
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        score: score,
        nextFruitLevel: nextFruitLevel,
        fruits: serializedFruits
      }));
    } catch (e) {}
  }

  function restoreGameState() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (data && Array.isArray(data.fruits) && data.fruits.length > 0) {
        score = data.score || 0;
        scoreEl.textContent = score;
        if (typeof data.nextFruitLevel === 'number') {
          nextFruitLevel = data.nextFruitLevel;
        }
        fruits = data.fruits.map(function (sf) {
          var f = createFruit(sf.level, sf.x, sf.y);
          f.vx = sf.vx || 0;
          f.vy = sf.vy || 0;
          f.scale = 1;
          return f;
        });
        return true;
      }
    } catch (e) {}
    return false;
  }

  // ---- Game Over ------------------------------------------------------------
  function triggerGameOver() {
    if (gameOver) return;
    gameOver = true;
    saveBestScore();
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}

    finalScoreEl.textContent = score;
    finalBestEl.textContent = bestScore;

    // Pick top fruit achieved
    var maxLvl = 0;
    fruits.forEach(function (f) { if (f.level > maxLvl) maxLvl = f.level; });
    var topFruit = FRUITS[maxLvl] || FRUITS[0];
    document.getElementById('modalEmoji').textContent = topFruit.emoji;
    modalTitle.textContent = maxLvl >= 10 ? '🎉 达成大西瓜！' : '游戏结束';

    modal.classList.remove('hidden');
  }

  function restartGame() {
    modal.classList.add('hidden');
    fruits = [];
    particles = [];
    score = 0;
    dangerTimer = 0;
    gameOver = false;
    scoreEl.textContent = '0';
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    nextFruitLevel = rollDroppableLevel();
    spawnNextDropFruit();
  }

  restartBtn.addEventListener('click', restartGame);
  playAgainBtn.addEventListener('click', restartGame);

  // ---- Rendering ------------------------------------------------------------
  function drawFruit(f) {
    ctx.save();
    ctx.translate(f.x, f.y);
    var scale = f.scale || 1;
    ctx.scale(scale, scale);

    var r = f.r;

    // Body gradient
    var grad = ctx.createRadialGradient(-r * 0.25, -r * 0.35, r * 0.1, 0, 0, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.2, f.color);
    grad.addColorStop(0.9, f.stroke);
    grad.addColorStop(1, '#090d16');

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = f.stroke;
    ctx.stroke();

    // Fruit specific cute decorations
    if (f.level === 9 || f.level === 10) {
      // Watermelon stripes
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = '#022c22';
      ctx.lineWidth = 6;
      for (var st = -r; st <= r; st += 24) {
        ctx.beginPath();
        ctx.moveTo(st, -r);
        ctx.bezierCurveTo(st + 10, 0, st - 10, r * 0.6, st + 5, r);
        ctx.stroke();
      }
      ctx.restore();
    } else if (f.level === 4) {
      // Kiwi core ring
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(254, 240, 138, 0.45)';
      ctx.fill();
    } else if (f.level === 7) {
      // Pineapple diamond crisscross
      ctx.strokeStyle = 'rgba(180, 83, 9, 0.4)';
      ctx.lineWidth = 1.5;
      for (var px = -r * 0.6; px <= r * 0.6; px += 14) {
        ctx.beginPath();
        ctx.moveTo(px, -r * 0.6);
        ctx.lineTo(px + 20, r * 0.6);
        ctx.moveTo(px + 20, -r * 0.6);
        ctx.lineTo(px, r * 0.6);
        ctx.stroke();
      }
    }

    // Cute facial expressions
    var eyeOffset = r * 0.32;
    var eyeY = -r * 0.08;
    var eyeR = Math.max(2, r * 0.09);

    // Left eye
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-eyeOffset, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    // Eye shine
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-eyeOffset - eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Right eye
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(eyeOffset, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    // Eye shine
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(eyeOffset - eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Rosy blushed cheeks
    ctx.fillStyle = 'rgba(244, 63, 94, 0.35)';
    ctx.beginPath();
    ctx.arc(-eyeOffset - 3, eyeY + eyeR * 1.5, eyeR * 1.2, 0, Math.PI * 2);
    ctx.arc(eyeOffset + 3, eyeY + eyeR * 1.5, eyeR * 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Cute happy mouth
    ctx.beginPath();
    ctx.arc(0, eyeY + eyeR * 1.1, eyeR * 1.2, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.restore();
  }

  function render() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

    // 1. Container Walls & Floor
    ctx.fillStyle = 'rgba(30, 41, 59, 0.4)';
    ctx.fillRect(WALL_LEFT, 0, WALL_RIGHT - WALL_LEFT, FLOOR_Y);

    // Wall borders
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(WALL_LEFT, 0);
    ctx.lineTo(WALL_LEFT, FLOOR_Y);
    ctx.lineTo(WALL_RIGHT, FLOOR_Y);
    ctx.lineTo(WALL_RIGHT, 0);
    ctx.stroke();

    // 2. Danger Warning Line
    var pulse = (Math.sin(Date.now() / 180) + 1) / 2;
    var dangerRatio = dangerTimer / 2800;
    if (dangerRatio > 0.05) {
      ctx.strokeStyle = 'rgba(239, 68, 68, ' + (0.4 + dangerRatio * 0.5 * pulse) + ')';
      ctx.lineWidth = 2 + dangerRatio * 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(WALL_LEFT + 2, DANGER_Y);
      ctx.lineTo(WALL_RIGHT - 2, DANGER_Y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Warning text
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'right';
      var remainingSec = Math.max(1, Math.ceil((2800 - dangerTimer) / 1000));
      ctx.fillText('⚠️ 警戒线 (' + remainingSec + 's)', WALL_RIGHT - 8, DANGER_Y - 6);
    } else {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(WALL_LEFT + 2, DANGER_Y);
      ctx.lineTo(WALL_RIGHT - 2, DANGER_Y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 3. Dotted Aim Line
    if (canDrop && currentFruit && !gameOver) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(currentFruit.x, currentFruit.y + currentFruit.r);
      ctx.lineTo(currentFruit.x, FLOOR_Y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw current dropping fruit
      drawFruit(currentFruit);
    }

    // 4. Settled Fruits
    for (var i = 0; i < fruits.length; i++) {
      drawFruit(fruits[i]);
    }

    // 5. Juice Particles
    for (var pIdx = 0; pIdx < particles.length; pIdx++) {
      var p = particles[pIdx];
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
    updatePhysics();
    updateParticles();
    render();
    requestAnimationFrame(loop);
  }

  // ---- Input Handling -------------------------------------------------------
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function getCanvasPos(e) {
    var rect = canvas.getBoundingClientRect();
    var clientX = e.clientX;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
    }
    var scaleX = LOGICAL_W / rect.width;
    return (clientX - rect.left) * scaleX;
  }

  function handlePointerMove(e) {
    aimX = getCanvasPos(e);
    if (currentFruit) {
      currentFruit.x = clamp(aimX, WALL_LEFT + currentFruit.r, WALL_RIGHT - currentFruit.r);
    }
  }

  function handlePointerUp(e) {
    handlePointerMove(e);
    dropCurrentFruit();
  }

  canvas.addEventListener('mousemove', handlePointerMove);
  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    handlePointerMove(e);
  }, { passive: false });

  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('touchend', function (e) {
    e.preventDefault();
    handlePointerUp(e);
  }, { passive: false });

  // Keyboard controls: Arrow keys / A D to move, Space / Down arrow to drop
  window.addEventListener('keydown', function (e) {
    if (gameOver) return;
    var step = 18;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      aimX = Math.max(WALL_LEFT + 20, aimX - step);
      if (currentFruit) currentFruit.x = clamp(aimX, WALL_LEFT + currentFruit.r, WALL_RIGHT - currentFruit.r);
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      aimX = Math.min(WALL_RIGHT - 20, aimX + step);
      if (currentFruit) currentFruit.x = clamp(aimX, WALL_LEFT + currentFruit.r, WALL_RIGHT - currentFruit.r);
    } else if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      dropCurrentFruit();
    }
  });

  // ---- Bootstrap ------------------------------------------------------------
  loadBestScore();
  if (!restoreGameState()) {
    nextFruitLevel = rollDroppableLevel();
  }
  spawnNextDropFruit();
  requestAnimationFrame(loop);
})();
