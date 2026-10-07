// games/cut-the-rope/game.js - Cut the Rope (割绳子)
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

      if (type === 'cut') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'star') {
        [523, 659, 784, 1046].forEach(function(f, idx) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'sine';
          o.frequency.setValueAtTime(f, now + idx * 0.05);
          g.gain.setValueAtTime(0.18, now + idx * 0.05);
          g.gain.linearRampToValueAtTime(0.01, now + idx * 0.05 + 0.1);
          o.start(now + idx * 0.05);
          o.stop(now + idx * 0.05 + 0.1);
        });
      } else if (type === 'bubble') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.07);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.07);
        osc.start(now);
        osc.stop(now + 0.07);
      } else if (type === 'munch') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.linearRampToValueAtTime(140, now + 0.12);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
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
        [300, 240, 180, 120].forEach(function(f, idx) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(f, now + idx * 0.12);
          g.gain.setValueAtTime(0.2, now + idx * 0.12);
          g.gain.linearRampToValueAtTime(0.01, now + idx * 0.12 + 0.18);
          o.start(now + idx * 0.12);
          o.stop(now + idx * 0.12 + 0.18);
        });
      }
    } catch(e) {}
  }

  // DOM
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var starsEl = document.getElementById('stars-el');
  var levelEl = document.getElementById('level-el');
  var scoreEl = document.getElementById('score-el');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc = document.getElementById('modal-desc');
  var btnRestart = document.getElementById('btn-restart');

  var CANVAS_W = 420;
  var CANVAS_H = 580;
  var GRAVITY = 650;

  function resizeCanvas() {
    var container = document.getElementById('container');
    var maxW = container.clientWidth - 20;
    var maxH = container.clientHeight - 20;
    var scale = Math.min(maxW / CANVAS_W, maxH / CANVAS_H, 1.25);
    scale = Math.max(0.65, scale);
    canvas.width = Math.floor(CANVAS_W * scale);
    canvas.height = Math.floor(CANVAS_H * scale);
  }
  window.addEventListener('resize', resizeCanvas);

  var currentLevel = 1;
  var maxLevels = 3;
  var score = 0;
  var starsCollected = 0;
  var isGameOver = false;
  var lastTime = 0;

  var candy = null;
  var ropes = [];
  var stars = [];
  var bubbles = [];
  var monster = null;
  var particles = [];

  // Swipe slice trail
  var slicePoints = [];
  var isSwiping = false;

  function initLevel(lvl) {
    currentLevel = lvl;
    starsCollected = 0;
    isGameOver = false;
    particles = [];
    slicePoints = [];

    var w = canvas.width;
    var h = canvas.height;

    // Monster setup at bottom
    monster = {
      x: w * 0.5,
      y: h * 0.88,
      r: 28,
      mouthOpen: 0 // 0 to 1
    };

    if (lvl === 1) {
      candy = {
        x: w * 0.35,
        y: h * 0.3,
        vx: 0,
        vy: 0,
        r: 16,
        inBubble: false
      };

      ropes = [
        createRope(w * 0.5, h * 0.12, candy.x, candy.y, 8)
      ];

      stars = [
        { x: w * 0.5, y: h * 0.45, collected: false },
        { x: w * 0.65, y: h * 0.48, collected: false },
        { x: w * 0.5, y: h * 0.72, collected: false }
      ];

      bubbles = [];
    } else if (lvl === 2) {
      candy = {
        x: w * 0.5,
        y: h * 0.32,
        vx: 0,
        vy: 0,
        r: 16,
        inBubble: false
      };

      ropes = [
        createRope(w * 0.22, h * 0.15, candy.x, candy.y, 7),
        createRope(w * 0.78, h * 0.15, candy.x, candy.y, 7)
      ];

      stars = [
        { x: w * 0.35, y: h * 0.42, collected: false },
        { x: w * 0.65, y: h * 0.42, collected: false },
        { x: w * 0.5, y: h * 0.68, collected: false }
      ];

      bubbles = [
        { x: w * 0.5, y: h * 0.52, r: 24, popped: false }
      ];
    } else {
      candy = {
        x: w * 0.3,
        y: h * 0.28,
        vx: 0,
        vy: 0,
        r: 16,
        inBubble: false
      };

      ropes = [
        createRope(w * 0.25, h * 0.1, candy.x, candy.y, 6),
        createRope(w * 0.75, h * 0.18, candy.x, candy.y, 8)
      ];

      stars = [
        { x: w * 0.2, y: h * 0.45, collected: false },
        { x: w * 0.5, y: h * 0.25, collected: false },
        { x: w * 0.75, y: h * 0.55, collected: false }
      ];

      bubbles = [
        { x: w * 0.25, y: h * 0.52, r: 24, popped: false },
        { x: w * 0.75, y: h * 0.68, r: 24, popped: false }
      ];

      monster.x = w * 0.65;
    }

    updateHUD();
  }

  function createRope(ax, ay, bx, by, segmentsCount) {
    var points = [];
    for (var i = 0; i <= segmentsCount; i++) {
      var t = i / segmentsCount;
      points.push({
        x: ax + (bx - ax) * t,
        y: ay + (by - ay) * t,
        oldX: ax + (bx - ax) * t,
        oldY: ay + (by - ay) * t,
        isFixed: i === 0
      });
    }

    var segLen = Math.hypot(bx - ax, by - ay) / segmentsCount;
    return {
      anchorX: ax,
      anchorY: ay,
      points: points,
      segLen: segLen,
      cut: false
    };
  }

  function updateHUD() {
    starsEl.textContent = starsCollected + ' / 3';
    levelEl.textContent = currentLevel + ' / ' + maxLevels;
    scoreEl.textContent = score;
  }

  // Line segment intersection
  function linesIntersect(p1, p2, p3, p4) {
    function ccw(a, b, c) {
      return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
    }
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
  }

  function checkSliceIntersection(s1, s2) {
    // Check slice against each active rope segment
    ropes.forEach(function(rope) {
      if (rope.cut) return;
      for (var i = 0; i < rope.points.length - 1; i++) {
        var r1 = rope.points[i];
        var r2 = rope.points[i + 1];
        if (linesIntersect(s1, s2, r1, r2)) {
          rope.cut = true;
          playSound('cut');
          // Rope cut particles
          for (var p = 0; p < 8; p++) {
            particles.push({
              x: (r1.x + r2.x) / 2,
              y: (r1.y + r2.y) / 2,
              vx: (Math.random() - 0.5) * 80,
              vy: (Math.random() - 0.5) * 80,
              color: '#d97706',
              life: 0.25
            });
          }
          break;
        }
      }
    });

    // Check click/slice popping bubble
    bubbles.forEach(function(b) {
      if (!b.popped) {
        if (Math.hypot(b.x - s2.x, b.y - s2.y) < b.r + 10) {
          b.popped = true;
          candy.inBubble = false;
          playSound('bubble');
        }
      }
    });
  }

  function updatePhysics(dt) {
    if (!candy) return;

    // 1. Candy Gravity / Bubble float
    if (candy.inBubble) {
      candy.vy = -75; // float upwards gently
      candy.vx *= 0.95;
    } else {
      candy.vy += GRAVITY * dt;
    }

    candy.x += candy.vx * dt;
    candy.y += candy.vy * dt;

    // Air drag
    candy.vx *= 0.995;
    candy.vy *= 0.995;

    // 2. Rope Physics (Verlet & constraints)
    ropes.forEach(function(rope) {
      if (rope.cut) return;

      var pts = rope.points;
      // Last point attaches to candy
      var last = pts[pts.length - 1];
      last.x = candy.x;
      last.y = candy.y;

      // Verlet update intermediate points
      for (var i = 1; i < pts.length; i++) {
        var p = pts[i];
        var vx = (p.x - p.oldX) * 0.98;
        var vy = (p.y - p.oldY) * 0.98 + (GRAVITY * 0.4) * dt * dt;
        p.oldX = p.x;
        p.oldY = p.y;
        p.x += vx;
        p.y += vy;
      }

      // Relaxation iterations
      for (var iter = 0; iter < 5; iter++) {
        pts[0].x = rope.anchorX;
        pts[0].y = rope.anchorY;

        for (var j = 0; j < pts.length - 1; j++) {
          var p1 = pts[j];
          var p2 = pts[j + 1];
          var dx = p2.x - p1.x;
          var dy = p2.y - p1.y;
          var dist = Math.hypot(dx, dy);
          var diff = (dist - rope.segLen) / (dist || 1);

          if (!p1.isFixed) {
            p1.x += dx * 0.5 * diff;
            p1.y += dy * 0.5 * diff;
          }
          p2.x -= dx * 0.5 * diff;
          p2.y -= dy * 0.5 * diff;
        }

        // Apply rope pull to candy
        candy.x = last.x;
        candy.y = last.y;
        candy.vx = (last.x - last.oldX) / (dt || 0.016);
        candy.vy = (last.y - last.oldY) / (dt || 0.016);
      }
    });

    // 3. Bubbles interaction
    bubbles.forEach(function(b) {
      if (!b.popped && !candy.inBubble) {
        if (Math.hypot(candy.x - b.x, candy.y - b.y) < b.r + candy.r) {
          candy.inBubble = true;
          playSound('bubble');
        }
      }
      if (candy.inBubble) {
        b.x = candy.x;
        b.y = candy.y;
      }
    });

    // 4. Stars interaction
    stars.forEach(function(s) {
      if (!s.collected && Math.hypot(candy.x - s.x, candy.y - s.y) < candy.r + 14) {
        s.collected = true;
        starsCollected++;
        score += 300;
        playSound('star');
        updateHUD();
        // Star sparkle particles
        for (var sp = 0; sp < 12; sp++) {
          particles.push({
            x: s.x,
            y: s.y,
            vx: (Math.random() - 0.5) * 120,
            vy: (Math.random() - 0.5) * 120,
            color: '#facc15',
            life: 0.3
          });
        }
      }
    });

    // 5. Monster reaction & eating
    if (monster) {
      var distToMonster = Math.hypot(candy.x - monster.x, candy.y - monster.y);
      if (distToMonster < 90) {
        monster.mouthOpen = Math.min(1, monster.mouthOpen + dt * 4);
      } else {
        monster.mouthOpen = Math.max(0, monster.mouthOpen - dt * 2);
      }

      if (distToMonster < monster.r + candy.r * 0.5) {
        // Monster eats candy!
        playSound('munch');
        score += 1000 + starsCollected * 500;
        updateHUD();
        if (currentLevel < maxLevels) {
          gameOver(true, '第 ' + currentLevel + ' 关通关！成功喂饱小怪兽！');
        } else {
          gameOver(true, '全三星大圆满通关！小怪兽心满意足！');
        }
        candy = null;
        return;
      }
    }

    // 6. Out of bounds (fail condition)
    if (candy.y > canvas.height + 40 || candy.y < -40 || candy.x < -40 || candy.x > canvas.width + 40) {
      gameOver(false, '糖果掉落丢失！小怪兽伤心落泪！');
      candy = null;
      return;
    }

    // 7. Particles
    for (var pi = particles.length - 1; pi >= 0; pi--) {
      var pt = particles[pi];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) particles.splice(pi, 1);
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Background Pattern (cardboard box / striped wood)
    ctx.fillStyle = '#451a03';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#290e02';
    ctx.lineWidth = 1;
    for (var ly = 30; ly < canvas.height; ly += 35) {
      ctx.beginPath();
      ctx.moveTo(0, ly);
      ctx.lineTo(canvas.width, ly);
      ctx.stroke();
    }

    // 2. Ropes & Anchors
    ropes.forEach(function(rope) {
      // Anchor peg
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.arc(rope.anchorX, rope.anchorY, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(rope.anchorX, rope.anchorY, 3, 0, Math.PI * 2);
      ctx.fill();

      if (!rope.cut) {
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(rope.points[0].x, rope.points[0].y);
        for (var i = 1; i < rope.points.length; i++) {
          ctx.lineTo(rope.points[i].x, rope.points[i].y);
        }
        ctx.stroke();
      }
    });

    // 3. Bubbles
    bubbles.forEach(function(b) {
      if (!b.popped) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Bubble highlight
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // 4. Stars
    stars.forEach(function(s) {
      if (!s.collected) {
        ctx.save();
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⭐', s.x, s.y);
        ctx.restore();
      }
    });

    // 5. Monster Om Nom
    if (monster) {
      ctx.save();
      ctx.translate(monster.x, monster.y);

      // Body (cute green)
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.ellipse(0, 0, monster.r * 1.1, monster.r, 0, 0, Math.PI * 2);
      ctx.fill();

      // Mouth
      var mouthH = monster.mouthOpen * 20 + 4;
      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.ellipse(0, 6, monster.r * 0.7, mouthH, 0, 0, Math.PI * 2);
      ctx.fill();

      // Teeth
      if (monster.mouthOpen > 0.4) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-8, 6 - mouthH * 0.5, 3, 0, Math.PI * 2);
        ctx.arc(8, 6 - mouthH * 0.5, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Big Eyes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-10, -monster.r * 0.6, 9, 0, Math.PI * 2);
      ctx.arc(10, -monster.r * 0.6, 9, 0, Math.PI * 2);
      ctx.fill();

      // Pupils looking at candy
      var lookAngle = candy ? Math.atan2(candy.y - monster.y, candy.x - monster.x) : 0;
      var lookDist = 4;
      var pupilX = Math.cos(lookAngle) * lookDist;
      var pupilY = Math.sin(lookAngle) * lookDist;

      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(-10 + pupilX, -monster.r * 0.6 + pupilY, 4, 0, Math.PI * 2);
      ctx.arc(10 + pupilX, -monster.r * 0.6 + pupilY, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // 6. Candy
    if (candy) {
      ctx.save();
      ctx.translate(candy.x, candy.y);

      // Red/Yellow spiral peppermint candy
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(0, 0, candy.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fef08a';
      for (var a = 0; a < 4; a++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, candy.r, a * Math.PI / 2, a * Math.PI / 2 + Math.PI / 4);
        ctx.closePath();
        ctx.fill();
      }

      ctx.strokeStyle = '#991b1b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, candy.r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    // 7. Particles
    particles.forEach(function(pt) {
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // 8. Swipe Blade Slice Trail
    if (slicePoints.length > 1) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(slicePoints[0].x, slicePoints[0].y);
      for (var si = 1; si < slicePoints.length; si++) {
        ctx.lineTo(slicePoints[si].x, slicePoints[si].y);
      }
      ctx.stroke();
    }
  }

  function gameOver(won, msg) {
    isGameOver = true;
    modalTitle.textContent = won ? '🍬 饱餐一顿！' : '😢 糖果丢失！';
    modalTitle.style.color = won ? '#facc15' : '#ef4444';
    modalDesc.textContent = msg;
    btnRestart.textContent = won && currentLevel < maxLevels ? '进入下一关' : '重新挑战';
    modal.classList.remove('hidden');
    playSound(won ? 'win' : 'gameover');
  }

  function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    var dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (dt > 0.1) dt = 0.1;

    if (!isGameOver) {
      updatePhysics(dt);
    }
    render();
    requestAnimationFrame(gameLoop);
  }

  // Pointer Swipe
  function getPos(e) {
    var rect = canvas.getBoundingClientRect();
    var cx = (e.clientX || (e.touches && e.touches[0].clientX));
    var cy = (e.clientY || (e.touches && e.touches[0].clientY));
    return { x: cx - rect.left, y: cy - rect.top };
  }

  function onPointerDown(e) {
    if (isGameOver) return;
    isSwiping = true;
    var pt = getPos(e);
    slicePoints = [pt];
  }

  function onPointerMove(e) {
    if (!isSwiping) return;
    var pt = getPos(e);
    slicePoints.push(pt);

    if (slicePoints.length > 1) {
      var prev = slicePoints[slicePoints.length - 2];
      checkSliceIntersection(prev, pt);
    }

    if (slicePoints.length > 8) {
      slicePoints.shift();
    }
  }

  function onPointerUp() {
    isSwiping = false;
    slicePoints = [];
  }

  canvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);

  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    onPointerDown(e);
  }, { passive: false });
  window.addEventListener('touchmove', function(e) {
    if (isSwiping) onPointerMove(e);
  }, { passive: false });
  window.addEventListener('touchend', onPointerUp);

  btnRestart.addEventListener('click', function() {
    modal.classList.add('hidden');
    if (modalTitle.textContent.indexOf('饱餐') !== -1 && currentLevel < maxLevels) {
      initLevel(currentLevel + 1);
    } else {
      initLevel(1);
    }
  });

  resizeCanvas();
  initLevel(1);
  requestAnimationFrame(gameLoop);

})();
