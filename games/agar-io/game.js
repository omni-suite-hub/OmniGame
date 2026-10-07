(function () {
  'use strict';

  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var container = document.getElementById('container');

  var massEl = document.getElementById('mass-el');
  var rankEl = document.getElementById('rank-el');
  var lbContent = document.getElementById('lb-content');
  var btnSplit = document.getElementById('btn-split');
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
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.05);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'gulp') {
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(500, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'split') {
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(250, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
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

  var COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#38bdf8', '#818cf8', '#ec4899'];
  var BOT_NAMES = ['Titan', 'Vortex', 'Shadow', 'Nova', 'Echo', 'Neon', 'Pixel', 'Ghost', 'Blaze', 'Swift', 'Apex', 'Fury'];

  var player = {
    x: WORLD_W / 2,
    y: WORLD_H / 2,
    r: 20,
    color: '#38bdf8',
    name: '你 (Player)',
    alive: true
  };

  var mouseX = 0;
  var mouseY = 0;
  var foods = [];
  var bots = [];

  function spawnFoods(count) {
    for (var i = 0; i < count; i++) {
      foods.push({
        x: Math.random() * WORLD_W,
        y: Math.random() * WORLD_H,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]
      });
    }
  }

  function spawnBot(idx) {
    return {
      x: Math.random() * WORLD_W,
      y: Math.random() * WORLD_H,
      r: 16 + Math.random() * 25,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      name: BOT_NAMES[idx % BOT_NAMES.length],
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      alive: true
    };
  }

  function initGame() {
    player.x = WORLD_W / 2;
    player.y = WORLD_H / 2;
    player.r = 20;
    player.alive = true;
    deathModal.classList.add('hidden');

    foods = [];
    spawnFoods(250);

    bots = [];
    for (var i = 0; i < 12; i++) {
      bots.push(spawnBot(i));
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

    function splitPlayer() {
      getAudioCtx();
      if (!player.alive || player.r < 30) return;
      playSound('split');
      player.r = Math.max(18, player.r * 0.7);
    }

    window.addEventListener('keydown', function (e) {
      if (e.code === 'Space') splitPlayer();
    });
    btnSplit.addEventListener('click', splitPlayer);
    btnRespawn.addEventListener('click', initGame);
  }

  function update() {
    if (!player.alive) return;

    // Player movement towards mouse relative to screen center
    var cx = canvas.width / 2;
    var cy = canvas.height / 2;
    var dx = mouseX - cx;
    var dy = mouseY - cy;
    var dist = Math.hypot(dx, dy);

    var speed = Math.max(1.8, 4.5 * (20 / player.r));
    if (dist > 10) {
      player.x += (dx / dist) * speed;
      player.y += (dy / dist) * speed;
    }

    // World boundary
    player.x = Math.max(player.r, Math.min(WORLD_W - player.r, player.x));
    player.y = Math.max(player.r, Math.min(WORLD_H - player.r, player.y));

    // Eat foods
    for (var f = foods.length - 1; f >= 0; f--) {
      var food = foods[f];
      if (Math.hypot(player.x - food.x, player.y - food.y) < player.r) {
        player.r += 0.25;
        playSound('eat');
        foods.splice(f, 1);
      }
    }
    if (foods.length < 200) spawnFoods(20);

    // Bots AI update
    bots.forEach(function (b, bIdx) {
      if (!b.alive) return;

      // Random wander
      if (Math.random() < 0.03) {
        b.vx = (Math.random() - 0.5) * 3;
        b.vy = (Math.random() - 0.5) * 3;
      }

      // Chase or flee player
      var pDist = Math.hypot(player.x - b.x, player.y - b.y);
      if (pDist < 250) {
        if (b.r > player.r * 1.15) {
          // Chase player
          b.vx = ((player.x - b.x) / pDist) * 2.5;
          b.vy = ((player.y - b.y) / pDist) * 2.5;
        } else if (player.r > b.r * 1.15) {
          // Flee player
          b.vx = -((player.x - b.x) / pDist) * 2.5;
          b.vy = -((player.y - b.y) / pDist) * 2.5;
        }
      }

      b.x += b.vx;
      b.y += b.vy;
      b.x = Math.max(b.r, Math.min(WORLD_W - b.r, b.x));
      b.y = Math.max(b.r, Math.min(WORLD_H - b.r, b.y));

      // Bot eat food
      foods.forEach(function (food, fIdx) {
        if (Math.hypot(b.x - food.x, b.y - food.y) < b.r) {
          b.r += 0.15;
        }
      });

      // Player eats bot
      if (pDist < player.r && player.r > b.r * 1.15) {
        player.r += b.r * 0.35;
        playSound('gulp');
        bots[bIdx] = spawnBot(bIdx);
      }

      // Bot eats player
      if (pDist < b.r && b.r > player.r * 1.15) {
        player.alive = false;
        playSound('gulp');
        deathStat.textContent = '最终质量: ' + Math.round(player.r) + ' | 竞技场活跃中';
        deathModal.classList.remove('hidden');
      }
    });

    massEl.textContent = Math.round(player.r);
    updateLeaderboard();
  }

  function updateLeaderboard() {
    var all = bots.concat([player]);
    all.sort(function (a, b) { return b.r - a.r; });

    var pRank = all.indexOf(player) + 1;
    rankEl.textContent = '#' + pRank;

    lbContent.innerHTML = '';
    all.slice(0, 5).forEach(function (c, idx) {
      var row = document.createElement('div');
      row.className = 'lb-row' + (c === player ? ' me' : '');
      row.innerHTML = '<span>' + (idx + 1) + '. ' + c.name + '</span><span>' + Math.round(c.r) + '</span>';
      lbContent.appendChild(row);
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Camera offset centered on player
    var offsetX = canvas.width / 2 - player.x;
    var offsetY = canvas.height / 2 - player.y;

    ctx.save();
    ctx.translate(offsetX, offsetY);

    // Draw grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (var x = 0; x <= WORLD_W; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD_H);
      ctx.stroke();
    }
    for (var y = 0; y <= WORLD_H; y += 100) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_W, y);
      ctx.stroke();
    }

    // World boundary
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, WORLD_W, WORLD_H);

    // Draw foods
    foods.forEach(function (f) {
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw bots
    bots.forEach(function (b) {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, b.x, b.y + 4);
    });

    // Draw player
    if (player.alive) {
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(player.name, player.x, player.y + 4);
    }

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
