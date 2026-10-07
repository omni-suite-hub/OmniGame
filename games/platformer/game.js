(function () {
  'use strict';

  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var container = document.getElementById('container');

  var gemsEl = document.getElementById('gems-el');
  var levelEl = document.getElementById('level-el');
  var modalEl = document.getElementById('modal');
  var btnNext = document.getElementById('btn-next');

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

      if (type === 'jump') {
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'gem') {
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1174, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'win') {
        [523, 659, 784, 1046, 1318].forEach(function (f, i) {
          var o = actx.createOscillator();
          var gn = actx.createGain();
          o.frequency.setValueAtTime(f, now + i * 0.1);
          gn.gain.setValueAtTime(0.18, now + i * 0.1);
          gn.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);
          o.connect(gn);
          gn.connect(actx.destination);
          o.start(now + i * 0.1);
          o.stop(now + i * 0.1 + 0.35);
        });
      }
    } catch (e) {}
  }

  var V_WIDTH = 800;
  var V_HEIGHT = 450;

  function resize() {
    var rect = container.getBoundingClientRect();
    var scale = Math.min(rect.width / V_WIDTH, rect.height / V_HEIGHT, 1.2);
    canvas.width = V_WIDTH;
    canvas.height = V_HEIGHT;
    canvas.style.width = (V_WIDTH * scale) + 'px';
    canvas.style.height = (V_HEIGHT * scale) + 'px';
  }
  window.addEventListener('resize', resize);

  var player = {
    x: 40,
    y: 350,
    w: 22,
    h: 28,
    vx: 0,
    vy: 0,
    speed: 4.2,
    jumpPower: -10.5,
    onGround: false,
    jumpsLeft: 2
  };

  var platforms = [
    { x: 0, y: 400, w: 800, h: 50 }, // ground floor
    { x: 140, y: 320, w: 100, h: 18 },
    { x: 280, y: 250, w: 110, h: 18 },
    { x: 440, y: 220, w: 90, h: 18 },
    { x: 580, y: 170, w: 100, h: 18 },
    { x: 700, y: 120, w: 90, h: 18 }
  ];

  var spikes = [
    { x: 260, y: 382, w: 40, h: 18 },
    { x: 480, y: 382, w: 50, h: 18 }
  ];

  var gems = [
    { x: 180, y: 280, collected: false },
    { x: 330, y: 210, collected: false },
    { x: 480, y: 180, collected: false },
    { x: 620, y: 130, collected: false },
    { x: 740, y: 80, collected: false }
  ];

  var flag = { x: 750, y: 70, w: 20, h: 50 };

  var keys = { left: false, right: false };
  var currentLevel = 1;
  var isWon = false;

  function setupInput() {
    window.addEventListener('keydown', function (e) {
      if (['ArrowLeft', 'KeyA'].indexOf(e.code) >= 0) keys.left = true;
      if (['ArrowRight', 'KeyD'].indexOf(e.code) >= 0) keys.right = true;
      if (['ArrowUp', 'KeyW', 'Space'].indexOf(e.code) >= 0) handleJump();
    });

    window.addEventListener('keyup', function (e) {
      if (['ArrowLeft', 'KeyA'].indexOf(e.code) >= 0) keys.left = false;
      if (['ArrowRight', 'KeyD'].indexOf(e.code) >= 0) keys.right = false;
    });

    function bindBtn(id, onAction, offAction) {
      var btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('touchstart', function (e) { e.preventDefault(); onAction(); }, { passive: false });
      btn.addEventListener('touchend', function (e) { e.preventDefault(); offAction(); });
      btn.addEventListener('mousedown', onAction);
      btn.addEventListener('mouseup', offAction);
      btn.addEventListener('mouseleave', offAction);
    }

    bindBtn('btn-left', function () { keys.left = true; }, function () { keys.left = false; });
    bindBtn('btn-right', function () { keys.right = true; }, function () { keys.right = false; });
    document.getElementById('btn-jump').addEventListener('click', handleJump);
  }

  function handleJump() {
    getAudioCtx();
    if (player.jumpsLeft > 0) {
      player.vy = player.jumpPower;
      player.jumpsLeft--;
      playSound('jump');
    }
  }

  function resetPlayer() {
    player.x = 40;
    player.y = 350;
    player.vx = 0;
    player.vy = 0;
    player.jumpsLeft = 2;
  }

  function update() {
    if (isWon) return;

    // Horizontal movement
    if (keys.left) player.vx = -player.speed;
    else if (keys.right) player.vx = player.speed;
    else player.vx = 0;

    player.x += player.vx;

    // Horizontal boundaries
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > V_WIDTH) player.x = V_WIDTH - player.w;

    // Gravity
    player.vy += 0.52;
    player.y += player.vy;

    // Platform collisions
    player.onGround = false;
    platforms.forEach(function (p) {
      if (player.x + player.w > p.x && player.x < p.x + p.w) {
        if (player.y + player.h >= p.y && player.y + player.h <= p.y + p.h + 8 && player.vy >= 0) {
          player.y = p.y - player.h;
          player.vy = 0;
          player.onGround = true;
          player.jumpsLeft = 2;
        }
      }
    });

    // Spikes collision
    spikes.forEach(function (sp) {
      if (player.x + player.w > sp.x && player.x < sp.x + sp.w &&
          player.y + player.h > sp.y + 6 && player.y < sp.y + sp.h) {
        playSound('hit');
        resetPlayer();
      }
    });

    // Gems collection
    gems.forEach(function (g) {
      if (!g.collected) {
        if (Math.hypot(player.x + player.w / 2 - g.x, player.y + player.h / 2 - g.y) < 22) {
          g.collected = true;
          playSound('gem');
          var count = gems.filter(function (it) { return it.collected; }).length;
          gemsEl.textContent = count + ' / ' + gems.length;
        }
      }
    });

    // Flag reach
    if (player.x + player.w > flag.x && player.x < flag.x + flag.w &&
        player.y + player.h > flag.y && player.y < flag.y + flag.h) {
      isWon = true;
      playSound('win');
      modalEl.classList.remove('hidden');
    }
  }

  btnNext.addEventListener('click', function () {
    modalEl.classList.add('hidden');
    isWon = false;
    currentLevel++;
    levelEl.textContent = currentLevel;
    gems.forEach(function (g) { g.collected = false; });
    gemsEl.textContent = '0 / ' + gems.length;
    resetPlayer();
  });

  function draw() {
    // Sky gradient
    var sky = ctx.createLinearGradient(0, 0, 0, V_HEIGHT);
    sky.addColorStop(0, '#1e1b4b');
    sky.addColorStop(1, '#0f172a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

    // Platforms
    platforms.forEach(function (p) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(p.x, p.y, p.w, 4); // neon edge
    });

    // Spikes
    spikes.forEach(function (sp) {
      ctx.fillStyle = '#ef4444';
      var numSpikes = Math.floor(sp.w / 10);
      for (var i = 0; i < numSpikes; i++) {
        ctx.beginPath();
        ctx.moveTo(sp.x + i * 10, sp.y + sp.h);
        ctx.lineTo(sp.x + i * 10 + 5, sp.y);
        ctx.lineTo(sp.x + (i + 1) * 10, sp.y + sp.h);
        ctx.fill();
      }
    });

    // Gems
    gems.forEach(function (g) {
      if (!g.collected) {
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('💎', g.x, g.y + 6);
      }
    });

    // Flag pole
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(flag.x, flag.y, 4, flag.h);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(flag.x + 4, flag.y);
    ctx.lineTo(flag.x + 22, flag.y + 10);
    ctx.lineTo(flag.x + 4, flag.y + 20);
    ctx.fill();

    // Player
    ctx.save();
    ctx.translate(player.x, player.y);
    // Body
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(0, 0, player.w, player.h, 5);
    ctx.fill();
    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(player.vx < 0 ? 3 : 11, 6, 6, 6);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(player.vx < 0 ? 4 : 13, 8, 3, 3);
    ctx.restore();
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  setupInput();
  resize();
  resetPlayer();
  requestAnimationFrame(loop);
})();
