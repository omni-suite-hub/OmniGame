// games/slingshot-birds/game.js - Slingshot Birds (弹弓破坏)
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

      if (type === 'stretch') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.linearRampToValueAtTime(260, now + 0.1);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'launch') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(700, now + 0.18);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === 'hit') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.linearRampToValueAtTime(60, now + 0.08);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'pig') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.15);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'win') {
        [330, 415, 493, 659].forEach(function(f, idx) {
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
        [280, 220, 160, 110].forEach(function(f, idx) {
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
  var birdsEl = document.getElementById('birds-el');
  var pigsEl = document.getElementById('pigs-el');
  var levelEl = document.getElementById('level-el');
  var scoreEl = document.getElementById('score-el');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc = document.getElementById('modal-desc');
  var btnRestart = document.getElementById('btn-restart');

  var CANVAS_W = 600;
  var CANVAS_H = 380;
  var GRAVITY = 750;

  function resizeCanvas() {
    var container = document.getElementById('container');
    var maxW = container.clientWidth - 20;
    var maxH = container.clientHeight - 20;
    var scale = Math.min(maxW / CANVAS_W, maxH / CANVAS_H, 1.2);
    scale = Math.max(0.6, scale);
    canvas.width = Math.floor(CANVAS_W * scale);
    canvas.height = Math.floor(CANVAS_H * scale);
  }
  window.addEventListener('resize', resizeCanvas);

  // Slingshot anchor
  function getSling() {
    var groundY = canvas.height * 0.82;
    return {
      x: canvas.width * 0.18,
      y: groundY - canvas.height * 0.18,
      groundY: groundY
    };
  }

  var currentLevel = 1;
  var maxLevels = 3;
  var score = 0;
  var birdsRemaining = 3;
  var isGameOver = false;
  var lastTime = 0;

  var activeBird = null;
  var flyingBird = null;
  var blocks = [];
  var pigs = [];
  var particles = [];

  var isDragging = false;
  var dragPos = { x: 0, y: 0 };

  function initLevel(lvl) {
    currentLevel = lvl;
    birdsRemaining = 3;
    isGameOver = false;
    flyingBird = null;
    blocks = [];
    pigs = [];
    particles = [];

    var sling = getSling();
    var groundY = sling.groundY;
    var fortX = canvas.width * 0.7;

    if (lvl === 1) {
      // Level 1: Two pillars + beam + pig inside
      var bw = 16 * (canvas.width / 600);
      var bh = 60 * (canvas.height / 380);

      blocks.push({ x: fortX - 35, y: groundY - bh / 2, w: bw, h: bh, vx: 0, vy: 0, hp: 80, color: '#b45309' });
      blocks.push({ x: fortX + 35, y: groundY - bh / 2, w: bw, h: bh, vx: 0, vy: 0, hp: 80, color: '#b45309' });
      // Roof beam
      blocks.push({ x: fortX, y: groundY - bh - 8, w: 100 * (canvas.width / 600), h: 14 * (canvas.height / 380), vx: 0, vy: 0, hp: 70, color: '#d97706' });

      pigs.push({ x: fortX, y: groundY - 16, r: 16, hp: 50, vx: 0, vy: 0 });
      pigs.push({ x: fortX, y: groundY - bh - 24, r: 14, hp: 50, vx: 0, vy: 0 });
    } else if (lvl === 2) {
      // Level 2: Double deck tower
      var b2w = 18 * (canvas.width / 600);
      var b2h = 50 * (canvas.height / 380);

      blocks.push({ x: fortX - 40, y: groundY - b2h / 2, w: b2w, h: b2h, vx: 0, vy: 0, hp: 90, color: '#78716c' });
      blocks.push({ x: fortX + 40, y: groundY - b2h / 2, w: b2w, h: b2h, vx: 0, vy: 0, hp: 90, color: '#78716c' });
      blocks.push({ x: fortX, y: groundY - b2h - 8, w: 110 * (canvas.width / 600), h: 14 * (canvas.height / 380), vx: 0, vy: 0, hp: 70, color: '#b45309' });

      // Second floor
      blocks.push({ x: fortX - 25, y: groundY - b2h - 16 - b2h / 2, w: b2w, h: b2h, vx: 0, vy: 0, hp: 80, color: '#b45309' });
      blocks.push({ x: fortX + 25, y: groundY - b2h - 16 - b2h / 2, w: b2w, h: b2h, vx: 0, vy: 0, hp: 80, color: '#b45309' });
      blocks.push({ x: fortX, y: groundY - b2h * 2 - 24, w: 75 * (canvas.width / 600), h: 12 * (canvas.height / 380), vx: 0, vy: 0, hp: 60, color: '#d97706' });

      pigs.push({ x: fortX, y: groundY - 16, r: 16, hp: 50, vx: 0, vy: 0 });
      pigs.push({ x: fortX, y: groundY - b2h - 26, r: 15, hp: 50, vx: 0, vy: 0 });
      pigs.push({ x: fortX + 70, y: groundY - 14, r: 14, hp: 50, vx: 0, vy: 0 });
    } else {
      // Level 3: Heavy fortress pyramid
      for (var row = 0; row < 3; row++) {
        var count = 3 - row;
        var startX = fortX - (count - 1) * 25;
        for (var c = 0; c < count; c++) {
          blocks.push({
            x: startX + c * 50,
            y: groundY - 20 - row * 40,
            w: 38 * (canvas.width / 600),
            h: 36 * (canvas.height / 380),
            vx: 0,
            vy: 0,
            hp: 100,
            color: row === 0 ? '#64748b' : '#b45309'
          });
        }
      }
      pigs.push({ x: fortX - 25, y: groundY - 45, r: 15, hp: 50, vx: 0, vy: 0 });
      pigs.push({ x: fortX + 25, y: groundY - 45, r: 15, hp: 50, vx: 0, vy: 0 });
      pigs.push({ x: fortX, y: groundY - 110, r: 16, hp: 60, vx: 0, vy: 0 });
    }

    resetBirdToSling();
    updateHUD();
  }

  function resetBirdToSling() {
    var sling = getSling();
    activeBird = {
      x: sling.x,
      y: sling.y,
      r: 15,
      type: birdsRemaining === 2 ? 'yellow' : (birdsRemaining === 1 ? 'bomb' : 'red')
    };
  }

  function updateHUD() {
    birdsEl.textContent = birdsRemaining;
    pigsEl.textContent = pigs.length;
    levelEl.textContent = currentLevel + ' / ' + maxLevels;
    scoreEl.textContent = score;
  }

  function addExplosion(x, y, count, color) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = Math.random() * 120 + 30;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.2,
        color: color || '#facc15'
      });
    }
  }

  function launchBird() {
    if (!activeBird) return;
    var sling = getSling();
    var dx = sling.x - dragPos.x;
    var dy = sling.y - dragPos.y;

    var dist = Math.hypot(dx, dy);
    var power = Math.min(dist * 7.5, 750);
    var angle = Math.atan2(dy, dx);

    flyingBird = {
      x: sling.x,
      y: sling.y,
      vx: Math.cos(angle) * power,
      vy: Math.sin(angle) * power,
      r: activeBird.r,
      type: activeBird.type,
      activeSkill: true,
      stoppedTimer: 0
    };

    activeBird = null;
    birdsRemaining--;
    playSound('launch');
    updateHUD();
  }

  function triggerBirdSkill() {
    if (!flyingBird || !flyingBird.activeSkill) return;
    flyingBird.activeSkill = false;

    if (flyingBird.type === 'yellow') {
      flyingBird.vx *= 2.4;
      flyingBird.vy *= 0.5;
      playSound('launch');
      addExplosion(flyingBird.x, flyingBird.y, 8, '#facc15');
    } else if (flyingBird.type === 'bomb') {
      // Bomb bird explodes
      playSound('hit');
      addExplosion(flyingBird.x, flyingBird.y, 35, '#ef4444');

      // Blast all nearby blocks and pigs
      blocks.forEach(function(b) {
        var dist = Math.hypot(b.x - flyingBird.x, b.y - flyingBird.y);
        if (dist < 120) {
          b.hp -= 200;
          b.vx += ((b.x - flyingBird.x) / dist) * 240;
          b.vy += ((b.y - flyingBird.y) / dist) * 240 - 100;
        }
      });
      pigs.forEach(function(p) {
        var dist = Math.hypot(p.x - flyingBird.x, p.y - flyingBird.y);
        if (dist < 120) {
          p.hp -= 200;
          p.vx += ((p.x - flyingBird.x) / dist) * 260;
          p.vy -= 160;
        }
      });

      flyingBird.stoppedTimer = 1.0;
    }
  }

  function updatePhysics(dt) {
    var sling = getSling();
    var groundY = sling.groundY;

    // Flying bird
    if (flyingBird) {
      flyingBird.vy += GRAVITY * dt;
      flyingBird.x += flyingBird.vx * dt;
      flyingBird.y += flyingBird.vy * dt;

      // Ground collision
      if (flyingBird.y + flyingBird.r >= groundY) {
        flyingBird.y = groundY - flyingBird.r;
        flyingBird.vy = -flyingBird.vy * 0.45;
        flyingBird.vx *= 0.7;
      }

      // Check speed
      if (Math.hypot(flyingBird.vx, flyingBird.vy) < 25) {
        flyingBird.stoppedTimer += dt;
        if (flyingBird.stoppedTimer > 1.2) {
          flyingBird = null;
          checkLevelEnd();
        }
      }

      // Hit blocks
      if (flyingBird) {
        blocks.forEach(function(b) {
          if (Math.abs(flyingBird.x - b.x) < b.w / 2 + flyingBird.r &&
              Math.abs(flyingBird.y - b.y) < b.h / 2 + flyingBird.r) {
            var imp = Math.hypot(flyingBird.vx, flyingBird.vy);
            b.hp -= imp * 0.35;
            b.vx += flyingBird.vx * 0.35;
            b.vy += flyingBird.vy * 0.35;
            flyingBird.vx *= 0.5;
            flyingBird.vy *= 0.5;
            playSound('hit');
            addExplosion(flyingBird.x, flyingBird.y, 6, '#b45309');
          }
        });

        // Hit pigs
        pigs.forEach(function(p) {
          if (Math.hypot(flyingBird.x - p.x, flyingBird.y - p.y) < flyingBird.r + p.r) {
            p.hp -= Math.hypot(flyingBird.vx, flyingBird.vy) * 0.6;
            p.vx += flyingBird.vx * 0.5;
            p.vy -= 100;
            playSound('pig');
            addExplosion(p.x, p.y, 10, '#22c55e');
          }
        });
      }
    }

    // Blocks physics
    for (var bi = blocks.length - 1; bi >= 0; bi--) {
      var blk = blocks[bi];
      blk.vy += GRAVITY * dt;
      blk.x += blk.vx * dt;
      blk.y += blk.vy * dt;

      if (blk.y + blk.h / 2 >= groundY) {
        blk.y = groundY - blk.h / 2;
        blk.vy = 0;
        blk.vx *= 0.85;
      }

      if (blk.hp <= 0) {
        score += 150;
        addExplosion(blk.x, blk.y, 12, blk.color);
        blocks.splice(bi, 1);
        updateHUD();
      }
    }

    // Pigs physics
    for (var pi = pigs.length - 1; pi >= 0; pi--) {
      var pig = pigs[pi];
      pig.vy += GRAVITY * dt;
      pig.x += pig.vx * dt;
      pig.y += pig.vy * dt;

      if (pig.y + pig.r >= groundY) {
        pig.y = groundY - pig.r;
        pig.vy = -pig.vy * 0.3;
        pig.vx *= 0.8;
      }

      // Check falling block crush on pig
      blocks.forEach(function(b) {
        if (Math.abs(b.x - pig.x) < b.w / 2 + pig.r &&
            Math.abs(b.y - pig.y) < b.h / 2 + pig.r) {
          var impact = Math.hypot(b.vx, b.vy);
          if (impact > 30) {
            pig.hp -= impact * 0.4;
          }
        }
      });

      if (pig.hp <= 0 || pig.x > canvas.width + 50 || pig.x < -50) {
        score += 500;
        playSound('pig');
        addExplosion(pig.x, pig.y, 16, '#22c55e');
        pigs.splice(pi, 1);
        updateHUD();
        checkLevelEnd();
      }
    }

    // Particles
    for (var pti = particles.length - 1; pti >= 0; pti--) {
      var pt = particles[pti];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) particles.splice(pti, 1);
    }
  }

  function checkLevelEnd() {
    if (pigs.length === 0) {
      if (currentLevel < maxLevels) {
        score += birdsRemaining * 1000;
        updateHUD();
        gameOver(true, '第 ' + currentLevel + ' 关歼灭完成！即将前往下一关！');
      } else {
        score += birdsRemaining * 1000;
        updateHUD();
        gameOver(true, '全部 3 个堡垒完全击溃！完美通关！');
      }
    } else if (birdsRemaining <= 0 && !flyingBird) {
      gameOver(false, '小鸟已耗尽，堡垒依然屹立！');
    } else if (!flyingBird && activeBird === null) {
      resetBirdToSling();
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var sling = getSling();
    var groundY = sling.groundY;

    // 1. Sky & Sun
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(canvas.width * 0.85, canvas.height * 0.2, 28, 0, Math.PI * 2);
    ctx.fill();

    // 2. Hills in background
    ctx.fillStyle = '#86efac';
    ctx.beginPath();
    ctx.arc(canvas.width * 0.4, groundY + 80, 140, Math.PI, 0);
    ctx.fill();

    // 3. Ground
    ctx.fillStyle = '#15803d';
    ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
    ctx.fillStyle = '#166534';
    ctx.fillRect(0, groundY + 12, canvas.width, canvas.height - groundY - 12);

    // 4. Slingshot Stand
    ctx.fillStyle = '#78350f';
    ctx.fillRect(sling.x - 4, sling.y, 8, groundY - sling.y);
    ctx.fillRect(sling.x - 14, sling.y - 12, 6, 18);
    ctx.fillRect(sling.x + 8, sling.y - 12, 6, 18);

    // 5. Slingshot Elastic & Active Bird
    if (isDragging) {
      ctx.strokeStyle = '#3e2723';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sling.x - 10, sling.y - 8);
      ctx.lineTo(dragPos.x, dragPos.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(sling.x + 10, sling.y - 8);
      ctx.lineTo(dragPos.x, dragPos.y);
      ctx.stroke();

      // Dotted trajectory preview
      var dx = sling.x - dragPos.x;
      var dy = sling.y - dragPos.y;
      var dist = Math.hypot(dx, dy);
      var pwr = Math.min(dist * 7.5, 750);
      var ang = Math.atan2(dy, dx);
      var tvx = Math.cos(ang) * pwr;
      var tvy = Math.sin(ang) * pwr;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      var tx = sling.x;
      var ty = sling.y;
      for (var s = 0; s < 18; s++) {
        tvy += GRAVITY * 0.05;
        tx += tvx * 0.05;
        ty += tvy * 0.05;
        if (ty >= groundY) break;
        ctx.beginPath();
        ctx.arc(tx, ty, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      drawBird(dragPos.x, dragPos.y, activeBird.r, activeBird.type);
    } else if (activeBird) {
      drawBird(activeBird.x, activeBird.y, activeBird.r, activeBird.type);
    }

    // 6. Flying Bird
    if (flyingBird) {
      drawBird(flyingBird.x, flyingBird.y, flyingBird.r, flyingBird.type);
    }

    // 7. Blocks
    blocks.forEach(function(b) {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
    });

    // 8. Pigs
    pigs.forEach(function(p) {
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();

      // Snout
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 2, p.r * 0.45, p.r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      // Eyes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x - 5, p.y - 4, 3, 0, Math.PI * 2);
      ctx.arc(p.x + 5, p.y - 4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(p.x - 4, p.y - 4, 1.5, 0, Math.PI * 2);
      ctx.arc(p.x + 6, p.y - 4, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 9. Particles
    particles.forEach(function(pt) {
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawBird(x, y, r, type) {
    ctx.save();
    ctx.translate(x, y);

    var bColor = type === 'yellow' ? '#facc15' : (type === 'bomb' ? '#1e293b' : '#ef4444');
    ctx.fillStyle = bColor;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(r * 0.5, -2);
    ctx.lineTo(r * 1.1, 1);
    ctx.lineTo(r * 0.5, 4);
    ctx.closePath();
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(r * 0.2, -4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(r * 0.35, -4, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function gameOver(won, msg) {
    isGameOver = true;
    modalTitle.textContent = won ? '🏆 完美全歼！' : '💥 挑战结束';
    modalTitle.style.color = won ? '#facc15' : '#ef4444';
    modalDesc.textContent = msg;
    btnRestart.textContent = won && currentLevel < maxLevels ? '进入下一关' : '再来一次';
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

  // Pointer Drag
  function getPointerPos(e) {
    var rect = canvas.getBoundingClientRect();
    var cx = (e.clientX || (e.touches && e.touches[0].clientX));
    var cy = (e.clientY || (e.touches && e.touches[0].clientY));
    return { x: cx - rect.left, y: cy - rect.top };
  }

  function onPointerDown(e) {
    if (isGameOver) return;
    var pos = getPointerPos(e);
    var sling = getSling();

    if (flyingBird) {
      triggerBirdSkill();
      return;
    }

    if (activeBird && Math.hypot(pos.x - sling.x, pos.y - sling.y) < 50) {
      isDragging = true;
      dragPos = pos;
      playSound('stretch');
    }
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    var pos = getPointerPos(e);
    var sling = getSling();
    var dx = pos.x - sling.x;
    var dy = pos.y - sling.y;
    var dist = Math.hypot(dx, dy);
    var maxPull = 90;

    if (dist > maxPull) {
      dragPos.x = sling.x + (dx / dist) * maxPull;
      dragPos.y = sling.y + (dy / dist) * maxPull;
    } else {
      dragPos = pos;
    }
  }

  function onPointerUp() {
    if (!isDragging) return;
    isDragging = false;
    launchBird();
  }

  canvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);

  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    onPointerDown(e);
  }, { passive: false });
  window.addEventListener('touchmove', function(e) {
    if (isDragging) onPointerMove(e);
  }, { passive: false });
  window.addEventListener('touchend', onPointerUp);

  btnRestart.addEventListener('click', function() {
    modal.classList.add('hidden');
    if (modalTitle.textContent.indexOf('全歼') !== -1 && currentLevel < maxLevels) {
      initLevel(currentLevel + 1);
    } else {
      initLevel(1);
    }
  });

  resizeCanvas();
  initLevel(1);
  requestAnimationFrame(gameLoop);

})();
