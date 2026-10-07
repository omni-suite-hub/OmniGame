(function () {
  'use strict';

  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var container = document.getElementById('container');

  var lengthEl = document.getElementById('length-el');
  var rankEl = document.getElementById('rank-el');
  var lbContent = document.getElementById('lb-content');
  var btnBoost = document.getElementById('btn-boost');
  var deathModal = document.getElementById('death-modal');
  var deathStat = document.getElementById('death-stat');
  var btnRespawn = document.getElementById('btn-respawn');

  var audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playSound(type) {
    try {
      var actx = getAudioCtx();
      var now = actx.currentTime;
      var osc = actx.createOscillator();
      var gain = actx.createGain();
      osc.connect(gain);
      gain.connect(actx.destination);

      if (type === 'eat') {
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(1000, now + 0.05);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'crash') {
        var buffer = actx.createBuffer(1, actx.sampleRate * 0.25, actx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.25;
        var src = actx.createBufferSource();
        src.buffer = buffer;
        var f = actx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(300, now);
        var g = actx.createGain();
        g.gain.setValueAtTime(0.2, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        src.connect(f);
        f.connect(g);
        g.connect(actx.destination);
        src.start(now);
      }
    } catch (e) {}
  }

  var WORLD_W = 2000;
  var WORLD_H = 2000;

  function resize() {
    var rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }
  window.addEventListener('resize', resize);

  var COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#38bdf8', '#a855f7', '#ec4899'];
  var BOT_NAMES = ['Dragon', 'Python', 'Viper', 'Cobra', 'Hydra', 'Anacond', 'Basilisk', 'Mamba'];

  var mouseX = 0;
  var mouseY = 0;
  var isBoosting = false;

  var player = {
    alive: true,
    name: '你 (Player)',
    color: '#38bdf8',
    body: [],
    targetLength: 25,
    angle: 0,
    speed: 3.2
  };

  var bots = [];
  var foods = [];

  function spawnFoods(count) {
    for (var i = 0; i < count; i++) {
      foods.push({
        x: Math.random() * WORLD_W,
        y: Math.random() * WORLD_H,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        r: 3 + Math.random() * 3
      });
    }
  }

  function createSnake(x, y, color, name, length) {
    var body = [];
    for (var i = 0; i < length; i++) {
      body.push({ x: x - i * 5, y: y });
    }
    return {
      alive: true,
      name: name,
      color: color,
      body: body,
      targetLength: length,
      angle: Math.random() * Math.PI * 2,
      speed: 2.8
    };
  }

  function initGame() {
    player.alive = true;
    player.body = [];
    player.targetLength = 25;
    player.angle = 0;
    deathModal.classList.add('hidden');

    var startX = WORLD_W / 2;
    var startY = WORLD_H / 2;
    for (var i = 0; i < player.targetLength; i++) {
      player.body.push({ x: startX - i * 5, y: startY });
    }

    foods = [];
    spawnFoods(250);

    bots = [];
    for (var b = 0; b < 8; b++) {
      bots.push(createSnake(
        Math.random() * WORLD_W,
        Math.random() * WORLD_H,
        COLORS[Math.floor(Math.random() * COLORS.length)],
        BOT_NAMES[b % BOT_NAMES.length],
        20 + Math.floor(Math.random() * 25)
      ));
    }
  }

  function setupInput() {
    window.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    });

    window.addEventListener('touchmove', function (e) {
      if (e.touches && e.touches[0]) {
        var rect = canvas.getBoundingClientRect();
        mouseX = e.touches[0].clientX - rect.left;
        mouseY = e.touches[0].clientY - rect.top;
      }
    }, { passive: false });

    window.addEventListener('mousedown', function () { isBoosting = true; });
    window.addEventListener('mouseup', function () { isBoosting = false; });
    window.addEventListener('keydown', function (e) { if (e.code === 'Space') isBoosting = true; });
    window.addEventListener('keyup', function (e) { if (e.code === 'Space') isBoosting = false; });

    btnBoost.addEventListener('touchstart', function (e) { e.preventDefault(); isBoosting = true; }, { passive: false });
    btnBoost.addEventListener('touchend', function (e) { e.preventDefault(); isBoosting = false; });
    btnRespawn.addEventListener('click', initGame);
  }

  function killSnake(snake) {
    snake.alive = false;
    playSound('crash');
    // Drop glowing foods along its body
    snake.body.forEach(function (pt) {
      foods.push({
        x: pt.x + (Math.random() - 0.5) * 8,
        y: pt.y + (Math.random() - 0.5) * 8,
        color: snake.color,
        r: 6
      });
    });
  }

  function update() {
    if (!player.alive) return;

    // Player angle
    var cx = canvas.width / 2;
    var cy = canvas.height / 2;
    var targetAngle = Math.atan2(mouseY - cy, mouseX - cx);

    // Smooth turn
    var diff = targetAngle - player.angle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    player.angle += diff * 0.12;

    var curSpeed = (isBoosting && player.targetLength > 15) ? 5.5 : player.speed;
    if (isBoosting && player.targetLength > 15 && Math.random() < 0.2) {
      player.targetLength -= 0.2;
    }

    var head = player.body[0];
    var newHead = {
      x: head.x + Math.cos(player.angle) * curSpeed,
      y: head.y + Math.sin(player.angle) * curSpeed
    };

    // Boundary wrap/clamp
    newHead.x = Math.max(10, Math.min(WORLD_W - 10, newHead.x));
    newHead.y = Math.max(10, Math.min(WORLD_H - 10, newHead.y));

    player.body.unshift(newHead);
    while (player.body.length > Math.round(player.targetLength)) {
      player.body.pop();
    }

    // Eat foods
    for (var f = foods.length - 1; f >= 0; f--) {
      var food = foods[f];
      if (Math.hypot(newHead.x - food.x, newHead.y - food.y) < 18) {
        player.targetLength += (food.r >= 6 ? 1.5 : 0.4);
        playSound('eat');
        foods.splice(f, 1);
      }
    }
    if (foods.length < 200) spawnFoods(20);

    // Bots update
    bots.forEach(function (b, bIdx) {
      if (!b.alive) return;

      // Bot wander or steer away
      if (Math.random() < 0.05) {
        b.angle += (Math.random() - 0.5) * 0.8;
      }

      var bHead = b.body[0];
      var nbHead = {
        x: bHead.x + Math.cos(b.angle) * b.speed,
        y: bHead.y + Math.sin(b.angle) * b.speed
      };

      nbHead.x = Math.max(10, Math.min(WORLD_W - 10, nbHead.x));
      nbHead.y = Math.max(10, Math.min(WORLD_H - 10, nbHead.y));

      b.body.unshift(nbHead);
      while (b.body.length > Math.round(b.targetLength)) {
        b.body.pop();
      }

      // Check if bot head hits player body
      for (var s = 5; s < player.body.length; s++) {
        if (Math.hypot(nbHead.x - player.body[s].x, nbHead.y - player.body[s].y) < 12) {
          killSnake(b);
          setTimeout(function () {
            bots[bIdx] = createSnake(Math.random() * WORLD_W, Math.random() * WORLD_H, COLORS[Math.floor(Math.random() * COLORS.length)], BOT_NAMES[bIdx % BOT_NAMES.length], 20);
          }, 2000);
          return;
        }
      }

      // Check if player head hits bot body
      for (var bs = 5; bs < b.body.length; bs++) {
        if (Math.hypot(newHead.x - b.body[bs].x, newHead.y - b.body[bs].y) < 12) {
          killSnake(player);
          deathStat.textContent = '最终长度: ' + Math.round(player.targetLength) + ' | 荣登蛇榜';
          deathModal.classList.remove('hidden');
          return;
        }
      }
    });

    lengthEl.textContent = Math.round(player.targetLength);
    updateLeaderboard();
  }

  function updateLeaderboard() {
    var all = bots.concat([player]);
    all.sort(function (a, b) { return b.targetLength - a.targetLength; });

    var pRank = all.indexOf(player) + 1;
    rankEl.textContent = '#' + pRank;

    lbContent.innerHTML = '';
    all.slice(0, 5).forEach(function (s, idx) {
      var row = document.createElement('div');
      row.className = 'lb-row' + (s === player ? ' me' : '');
      row.innerHTML = '<span>' + (idx + 1) + '. ' + s.name + '</span><span>' + Math.round(s.targetLength) + '</span>';
      lbContent.appendChild(row);
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var head = player.body[0] || { x: WORLD_W / 2, y: WORLD_H / 2 };
    var offsetX = canvas.width / 2 - head.x;
    var offsetY = canvas.height / 2 - head.y;

    ctx.save();
    ctx.translate(offsetX, offsetY);

    // World boundary
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, WORLD_W, WORLD_H);

    // Draw foods
    foods.forEach(function (f) {
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    });

    function drawSnake(s) {
      if (!s.alive || s.body.length === 0) return;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(s.body[0].x, s.body[0].y);
      for (var i = 1; i < s.body.length; i++) {
        ctx.lineTo(s.body[i].x, s.body[i].y);
      }
      ctx.stroke();

      // Eyes on head
      var hd = s.body[0];
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(hd.x - 3, hd.y - 4, 3, 0, Math.PI * 2);
      ctx.arc(hd.x + 3, hd.y - 4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(hd.x - 3, hd.y - 4, 1.5, 0, Math.PI * 2);
      ctx.arc(hd.x + 3, hd.y - 4, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    bots.forEach(drawSnake);
    if (player.alive) drawSnake(player);

    ctx.restore();
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  resize();
  setupInput();
  initGame();
  requestAnimationFrame(loop);
})();
