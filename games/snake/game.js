/* 贪吃蛇 — OmniGame
 * Canvas snake. Keyboard (arrows/WASD), on-screen d-pad, and touch swipe.
 * Speed ramps up by level as the snake eats (slow start, faster each level).
 * Score is awarded ONLY when eating food. Best score persisted via GameStore.
 */
(function () {
  'use strict';

  var N = 20; // grid cells per side
  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d');
  var scoreEl = document.getElementById('score');
  var bestEl = document.getElementById('best');
  var levelEl = document.getElementById('level');
  var overlay = document.getElementById('overlay');
  var ovTitle = document.getElementById('ovTitle');
  var ovText = document.getElementById('ovText');
  var ovBtn = document.getElementById('ovBtn');
  var pauseBtn = document.getElementById('pauseBtn');

  var snake, dir, nextDir, food, score, best, level, running, paused, rafId, lastStep, stepMs;

  // ---- Canvas sizing (crisp on HiDPI, fluid on resize) ----
  var cssW = 0;
  function resize() {
    var rect = cv.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    cssW = rect.width;
    cv.width = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // Fit the canvas to a square that fills the available stage. Enlarging the
  // float window / side panel grows the playfield; shrinking keeps it square.
  function fitStage() {
    var headH = (document.querySelector('.head') || {}).offsetHeight || 44;
    var ctrlH = (document.querySelector('.controls') || {}).offsetHeight || 120;
    var availH = window.innerHeight - headH - ctrlH - 46;
    var availW = Math.min(window.innerWidth - 32, 850);
    var s = Math.min(availW, availH);
    s = Math.max(260, Math.min(s, 720));
    cv.style.width = s + 'px';
    cv.style.height = s + 'px';
    resize();
  }
  window.addEventListener('resize', fitStage);

  function cell() {
    return cssW / N;
  }

  // Slow start, then speed up gradually by level. Level 1 ≈ 200ms/step,
  // each level -14ms, floored at 75ms so it never becomes unplayable.
  function stepMsForLevel(lv) {
    return Math.max(75, 200 - (lv - 1) * 14);
  }

  function reset() {
    var mid = Math.floor(N / 2);
    snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid }
    ];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    level = 1;
    stepMs = stepMsForLevel(level);
    placeFood();
    scoreEl.textContent = '0';
    if (levelEl) levelEl.textContent = '1';
  }

  function placeFood() {
    var free = [];
    var occ = {};
    snake.forEach(function (s) {
      occ[s.x + ',' + s.y] = 1;
    });
    // Don't spawn directly in front of the head — that would be a free instant
    // eat and make it feel like every step scores.
    var fx = snake[0].x + dir.x, fy = snake[0].y + dir.y;
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        if (occ[x + ',' + y]) continue;
        if (x === fx && y === fy) continue;
        free.push({ x: x, y: y });
      }
    }
    if (!free.length) {
      // Fallback: if the only free cell is the one in front, allow it.
      for (var y2 = 0; y2 < N; y2++) {
        for (var x2 = 0; x2 < N; x2++) {
          if (!occ[x2 + ',' + y2]) free.push({ x: x2, y: y2 });
        }
      }
    }
    food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  function setDir(nx, ny) {
    // prevent 180-degree reversal
    if (nx === -dir.x && ny === -dir.y) return;
    nextDir = { x: nx, y: ny };
  }

  function step() {
    dir = nextDir;
    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // wall collision
    if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N) {
      return gameOver();
    }
    // self collision (ignore tail cell which will move, unless growing)
    for (var i = 0; i < snake.length - 1; i++) {
      if (snake[i].x === head.x && snake[i].y === head.y) return gameOver();
    }

    snake.unshift(head);
    if (food && head.x === food.x && head.y === food.y) {
      score += 10; // scoring ONLY on eating food
      level = Math.floor((snake.length - 3) / 5) + 1; // +1 level every 5 foods
      stepMs = stepMsForLevel(level);
      if (levelEl) levelEl.textContent = level;
      scoreEl.textContent = score;
      placeFood();
    } else {
      snake.pop();
    }
  }

  function draw() {
    var c = cell();
    ctx.clearRect(0, 0, cssW, cssW);
    // subtle checkerboard
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#141831' : '#11142a';
        ctx.fillRect(x * c, y * c, c, c);
      }
    }
    // food
    if (food) {
      ctx.fillStyle = '#ff6b6b';
      roundRect(food.x * c + c * 0.18, food.y * c + c * 0.18, c * 0.64, c * 0.64, c * 0.2);
      ctx.fill();
    }
    // snake
    for (var i = 0; i < snake.length; i++) {
      var s = snake[i];
      ctx.fillStyle = i === 0 ? '#46d39a' : '#22c55e';
      roundRect(s.x * c + c * 0.08, s.y * c + c * 0.08, c * 0.84, c * 0.84, c * 0.28);
      ctx.fill();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function loop(ts) {
    if (!running) return;
    if (!paused) {
      if (lastStep == null) lastStep = ts;
      if (ts - lastStep >= stepMs) {
        lastStep = ts;
        step();
        draw();
      }
    }
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    fitStage();
    reset();
    draw();
    running = true;
    paused = false;
    lastStep = null;
    overlay.hidden = true;
    pauseBtn.textContent = '⏸ 暂停';
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function gameOver() {
    running = false;
    cancelAnimationFrame(rafId);
    if (score > best) {
      best = score;
      GameStore.setBest('snake', best);
      bestEl.textContent = best;
    }
    ovTitle.textContent = '游戏结束';
    ovText.textContent = '本局得分 ' + score + ' · 最佳 ' + best;
    ovBtn.textContent = '再来一局';
    overlay.hidden = false;
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    pauseBtn.textContent = paused ? '▶ 继续' : '⏸ 暂停';
  }

  // ---- Input: keyboard ----
  document.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'w') setDir(0, -1);
    else if (k === 'arrowdown' || k === 's') setDir(0, 1);
    else if (k === 'arrowleft' || k === 'a') setDir(-1, 0);
    else if (k === 'arrowright' || k === 'd') setDir(1, 0);
    else if (k === 'p') togglePause();
    else if (k === ' ' && !running) start();
    else return;
    e.preventDefault();
  });

  // ---- Input: d-pad ----
  document.querySelectorAll('.ctrl[data-dir]').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = b.dataset.dir;
      if (d === 'up') setDir(0, -1);
      else if (d === 'down') setDir(0, 1);
      else if (d === 'left') setDir(-1, 0);
      else if (d === 'right') setDir(1, 0);
    });
  });
  pauseBtn.addEventListener('click', togglePause);

  // ---- Input: swipe ----
  var sx = 0, sy = 0, tracking = false;
  cv.addEventListener('touchstart', function (e) {
    var t = e.touches[0]; sx = t.clientX; sy = t.clientY; tracking = true;
  }, { passive: true });
  cv.addEventListener('touchend', function (e) {
    if (!tracking) return; tracking = false;
    var t = e.changedTouches[0];
    var dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
    else setDir(0, dy > 0 ? 1 : -1);
  }, { passive: true });

  ovBtn.addEventListener('click', start);

  // ---- Boot ----
  GameStore.getBest('snake').then(function (b) {
    best = b || 0;
    bestEl.textContent = best;
  });
  fitStage();
  ovTitle.textContent = '贪吃蛇';
  ovText.textContent = '方向键 / 滑动控制，吃到苹果得分';
  ovBtn.textContent = '开始';
  overlay.hidden = false;
})();
