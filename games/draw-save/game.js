// games/draw-save/game.js - Draw to Save (画线保卫 / 救救狗狗)
(function() {
  'use strict';

  var audioCtx = null;
  function getAudio() {
    if (!audioCtx) {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    try {
      var ctx = getAudio();
      if (!ctx) return;
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'draw') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.linearRampToValueAtTime(320, now + 0.05);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'buzz') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.linearRampToValueAtTime(220, now + 0.2);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'stung') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'win') {
        [392, 523, 659, 784].forEach(function(f, idx) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'triangle';
          o.frequency.setValueAtTime(f, now + idx * 0.1);
          g.gain.setValueAtTime(0.2, now + idx * 0.1);
          g.gain.linearRampToValueAtTime(0.01, now + idx * 0.1 + 0.16);
          o.start(now + idx * 0.1);
          o.stop(now + idx * 0.1 + 0.16);
        });
      } else if (type === 'gameover') {
        [240, 200, 160, 120].forEach(function(f, idx) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(f, now + idx * 0.14);
          g.gain.setValueAtTime(0.2, now + idx * 0.14);
          g.gain.linearRampToValueAtTime(0.01, now + idx * 0.14 + 0.2);
          o.start(now + idx * 0.14);
          o.stop(now + idx * 0.14 + 0.2);
        });
      }
    } catch(e) {}
  }

  // DOM
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var timerEl = document.getElementById('timer-el');
  var inkBar = document.getElementById('ink-bar');
  var levelEl = document.getElementById('level-el');
  var statusEl = document.getElementById('status-el');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc = document.getElementById('modal-desc');
  var btnRestart = document.getElementById('btn-restart');

  var CANVAS_W = 420;
  var CANVAS_H = 560;
  var GRAVITY = 550;
  var MAX_INK = 850;

  function resizeCanvas() {
    var container = document.getElementById('container');
    var maxW = container.clientWidth - 20;
    var maxH = container.clientHeight - 20;
    var scale = Math.min(maxW / CANVAS_W, maxH / CANVAS_H, 1.25);
    scale = Math.max(0.65, scale);
    canvas.width = Math.floor(CANVAS_W * scale);
    canvas.height = Math.floor(CANVAS_H * scale);
    initLevel(currentLevel);
  }
  window.addEventListener('resize', resizeCanvas);

  var currentLevel = 1;
  var maxLevels = 3;
  var isGameOver = false;
  var lastTime = 0;
  var surviveTimer = 8.0;
  var isSwarmActive = false;

  var doge = null;
  var beehive = null;
  var platforms = [];
  var spikes = [];
  var bees = [];

  // Drawing Line
  var isDrawing = false;
  var linePoints = [];
  var inkUsed = 0;
  var linePhysics = null; // rigid stroke body

  function initLevel(lvl) {
    currentLevel = lvl;
    isGameOver = false;
    isSwarmActive = false;
    surviveTimer = 8.0;
    linePoints = [];
    inkUsed = 0;
    linePhysics = null;
    bees = [];

    statusEl.textContent = '请画线防护小狗';
    statusEl.style.color = '#0284c7';
    timerEl.textContent = '8s';
    inkBar.style.width = '100%';

    var w = canvas.width;
    var h = canvas.height;

    if (lvl === 1) {
      doge = {
        x: w * 0.5,
        y: h * 0.55,
        vx: 0,
        vy: 0,
        r: 18,
        stung: false
      };

      beehive = { x: w * 0.5, y: h * 0.18, r: 24 };

      platforms = [
        { x: w * 0.35, y: h * 0.62, w: w * 0.3, h: 22 }
      ];

      spikes = [
        { x: 0, y: h - 25, w: w, h: 25 }
      ];
    } else if (lvl === 2) {
      doge = {
        x: w * 0.28,
        y: h * 0.52,
        vx: 0,
        vy: 0,
        r: 18,
        stung: false
      };

      beehive = { x: w * 0.75, y: h * 0.22, r: 24 };

      platforms = [
        { x: w * 0.15, y: h * 0.58, w: w * 0.26, h: 22 },
        { x: w * 0.6, y: h * 0.65, w: w * 0.26, h: 22 }
      ];

      spikes = [
        { x: w * 0.42, y: h - 30, w: w * 0.58, h: 30 }
      ];
    } else {
      doge = {
        x: w * 0.5,
        y: h * 0.48,
        vx: 0,
        vy: 0,
        r: 18,
        stung: false
      };

      beehive = { x: w * 0.2, y: h * 0.2, r: 24 };

      platforms = [
        { x: w * 0.38, y: h * 0.54, w: w * 0.24, h: 20 }
      ];

      spikes = [
        { x: 0, y: h - 30, w: w, h: 30 },
        { x: 0, y: h * 0.35, w: 25, h: h * 0.5 }
      ];
    }

    levelEl.textContent = currentLevel + ' / ' + maxLevels;
  }

  function startSwarm() {
    isSwarmActive = true;
    statusEl.textContent = '蜂群来袭！坚持 8 秒！';
    statusEl.style.color = '#ef4444';
    playSound('buzz');

    // Convert line points to linePhysics body
    if (linePoints.length > 1) {
      linePhysics = {
        points: JSON.parse(JSON.stringify(linePoints)),
        vx: 0,
        vy: 0
      };
    }

    // Spawn 18 bees
    bees = [];
    for (var i = 0; i < 18; i++) {
      bees.push({
        x: beehive.x + (Math.random() - 0.5) * 20,
        y: beehive.y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 100,
        vy: 50 + Math.random() * 80,
        speed: 120 + Math.random() * 60,
        angle: 0
      });
    }
  }

  // Distance from point to line segment
  function distToSegment(px, py, x1, y1, x2, y2) {
    var l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    var t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }

  function updatePhysics(dt) {
    if (!isSwarmActive || isGameOver) return;

    surviveTimer -= dt;
    timerEl.textContent = Math.max(0, Math.ceil(surviveTimer)) + 's';

    if (surviveTimer <= 0) {
      // Victory!
      gameOver(true, '坚持到底！蜜蜂无功而返，小狗成功脱险！');
      return;
    }

    // 1. Line physics gravity and settle
    if (linePhysics) {
      linePhysics.vy += GRAVITY * dt * 0.7;
      linePhysics.vx *= 0.96;
      linePhysics.vy *= 0.96;

      // Move points
      for (var lp = 0; lp < linePhysics.points.length; lp++) {
        var pt = linePhysics.points[lp];
        pt.x += linePhysics.vx * dt;
        pt.y += linePhysics.vy * dt;

        // Platform collision with line
        platforms.forEach(function(plat) {
          if (pt.x >= plat.x && pt.x <= plat.x + plat.w &&
              pt.y >= plat.y && pt.y <= plat.y + plat.h) {
            pt.y = plat.y;
            linePhysics.vy = 0;
          }
        });
      }
    }

    // 2. Doge physics
    doge.vy += GRAVITY * dt;
    doge.vx *= 0.95;
    doge.vy *= 0.98;

    doge.x += doge.vx * dt;
    doge.y += doge.vy * dt;

    // Platform collision for doge
    platforms.forEach(function(plat) {
      if (doge.x + doge.r > plat.x && doge.x - doge.r < plat.x + plat.w &&
          doge.y + doge.r >= plat.y && doge.y - doge.r < plat.y + plat.h) {
        doge.y = plat.y - doge.r;
        doge.vy = 0;
      }
    });

    // Line collision with Doge
    if (linePhysics) {
      var pts = linePhysics.points;
      for (var li = 0; li < pts.length - 1; li++) {
        var d = distToSegment(doge.x, doge.y, pts[li].x, pts[li].y, pts[li + 1].x, pts[li + 1].y);
        if (d < doge.r + 6) {
          doge.vy = -Math.abs(doge.vy) * 0.3;
          doge.y -= 2;
        }
      }
    }

    // Spikes collision for doge
    spikes.forEach(function(sp) {
      if (doge.x + doge.r > sp.x && doge.x - doge.r < sp.x + sp.w &&
          doge.y + doge.r > sp.y && doge.y - doge.r < sp.y + sp.h) {
        doge.stung = true;
        playSound('stung');
        gameOver(false, '小狗掉进了危险尖刺中！保卫失败！');
      }
    });

    // Out of bounds check
    if (doge.y > canvas.height + 30) {
      doge.stung = true;
      playSound('stung');
      gameOver(false, '小狗跌落悬崖深渊！');
      return;
    }

    // 3. Bees movement & collision
    bees.forEach(function(bee) {
      var dx = doge.x - bee.x;
      var dy = doge.y - bee.y;
      var dist = Math.hypot(dx, dy);

      if (dist > 0) {
        bee.vx += (dx / dist) * bee.speed * 2 * dt;
        bee.vy += (dy / dist) * bee.speed * 2 * dt;
      }

      // Max speed clamp
      var spd = Math.hypot(bee.vx, bee.vy);
      if (spd > bee.speed) {
        bee.vx = (bee.vx / spd) * bee.speed;
        bee.vy = (bee.vy / spd) * bee.speed;
      }

      var nextX = bee.x + bee.vx * dt;
      var nextY = bee.y + bee.vy * dt;

      // Line shield blocking bees!
      var blocked = false;
      if (linePhysics) {
        var lpts = linePhysics.points;
        for (var bLi = 0; bLi < lpts.length - 1; bLi++) {
          if (distToSegment(nextX, nextY, lpts[bLi].x, lpts[bLi].y, lpts[bLi + 1].x, lpts[bLi + 1].y) < 8) {
            blocked = true;
            // Bounce bee off line
            bee.vx = -bee.vx * 0.5 + (Math.random() - 0.5) * 60;
            bee.vy = -bee.vy * 0.5 + (Math.random() - 0.5) * 60;
            break;
          }
        }
      }

      if (!blocked) {
        bee.x = nextX;
        bee.y = nextY;
      }

      // Check stung doge
      if (Math.hypot(bee.x - doge.x, bee.y - doge.y) < doge.r + 4) {
        doge.stung = true;
        playSound('stung');
        gameOver(false, '小狗被凶猛的蜜蜂蛰伤了！满头大包！');
      }
    });
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Background grid
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (var x = 20; x < canvas.width; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (var y = 20; y < canvas.height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // 2. Platforms
    platforms.forEach(function(plat) {
      ctx.fillStyle = '#475569';
      ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(plat.x, plat.y, plat.w, 4);
    });

    // 3. Spikes
    spikes.forEach(function(sp) {
      ctx.fillStyle = '#ef4444';
      for (var sx = sp.x; sx < sp.x + sp.w; sx += 14) {
        ctx.beginPath();
        ctx.moveTo(sx, sp.y + sp.h);
        ctx.lineTo(sx + 7, sp.y);
        ctx.lineTo(sx + 14, sp.y + sp.h);
        ctx.closePath();
        ctx.fill();
      }
    });

    // 4. Beehive
    if (beehive) {
      ctx.font = '36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🪺', beehive.x, beehive.y);
    }

    // 5. Doge
    if (doge) {
      ctx.save();
      ctx.translate(doge.x, doge.y);

      // Doge face
      ctx.font = '36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(doge.stung ? '😵' : (isSwarmActive ? '🥺' : '🐶'), 0, 0);

      ctx.restore();
    }

    // 6. User Drawn Line
    var ptsToRender = (linePhysics && linePhysics.points) || linePoints;
    if (ptsToRender.length > 1) {
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(ptsToRender[0].x, ptsToRender[0].y);
      for (var pi = 1; pi < ptsToRender.length; pi++) {
        ctx.lineTo(ptsToRender[pi].x, ptsToRender[pi].y);
      }
      ctx.stroke();
    }

    // 7. Bees
    bees.forEach(function(bee) {
      ctx.save();
      ctx.translate(bee.x, bee.y);
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🐝', 0, 0);
      ctx.restore();
    });
  }

  function gameOver(won, msg) {
    isGameOver = true;
    modalTitle.textContent = won ? '🏆 成功护犬！' : '🐝 小狗被蛰了！';
    modalTitle.style.color = won ? '#facc15' : '#ef4444';
    modalDesc.textContent = msg;
    btnRestart.textContent = won && currentLevel < maxLevels ? '进入下一关' : '再试一次';
    modal.classList.remove('hidden');
    playSound(won ? 'win' : 'gameover');
  }

  function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    var dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (dt > 0.1) dt = 0.1;

    updatePhysics(dt);
    render();
    requestAnimationFrame(gameLoop);
  }

  // Pointer drawing handlers
  function getPos(e) {
    var rect = canvas.getBoundingClientRect();
    var cx = (e.clientX || (e.touches && e.touches[0].clientX));
    var cy = (e.clientY || (e.touches && e.touches[0].clientY));
    return { x: cx - rect.left, y: cy - rect.top };
  }

  function onPointerDown(e) {
    if (isSwarmActive || isGameOver) return;
    isDrawing = true;
    var p = getPos(e);
    linePoints = [p];
    inkUsed = 0;
  }

  function onPointerMove(e) {
    if (!isDrawing || isSwarmActive) return;
    var p = getPos(e);
    var last = linePoints[linePoints.length - 1];
    var dist = Math.hypot(p.x - last.x, p.y - last.y);

    if (dist > 6) {
      if (inkUsed + dist <= MAX_INK) {
        inkUsed += dist;
        linePoints.push(p);
        inkBar.style.width = Math.max(0, 100 - (inkUsed / MAX_INK) * 100) + '%';
        playSound('draw');
      } else {
        // Run out of ink! Finish drawing
        onPointerUp();
      }
    }
  }

  function onPointerUp() {
    if (!isDrawing || isSwarmActive) return;
    isDrawing = false;
    if (linePoints.length > 3) {
      startSwarm();
    } else {
      linePoints = [];
      inkUsed = 0;
      inkBar.style.width = '100%';
    }
  }

  canvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);

  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    onPointerDown(e);
  }, { passive: false });
  window.addEventListener('touchmove', function(e) {
    if (isDrawing) onPointerMove(e);
  }, { passive: false });
  window.addEventListener('touchend', onPointerUp);

  btnRestart.addEventListener('click', function() {
    modal.classList.add('hidden');
    if (modalTitle.textContent.indexOf('成功') !== -1 && currentLevel < maxLevels) {
      initLevel(currentLevel + 1);
    } else {
      initLevel(currentLevel);
    }
  });

  resizeCanvas();
  initLevel(1);
  requestAnimationFrame(gameLoop);

})();
