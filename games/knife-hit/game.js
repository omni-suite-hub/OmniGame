// games/knife-hit/game.js - Knife Hit (飞刀打靶)
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

      if (type === 'throw') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'thud') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.07);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.07);
        osc.start(now);
        osc.stop(now + 0.07);
      } else if (type === 'apple') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'clash') {
        var bufferSize = ctx.sampleRate * 0.2;
        var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        var noise = ctx.createBufferSource();
        noise.buffer = buffer;
        var filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(1200, now);
        noise.connect(filter);
        filter.connect(gain);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
        noise.start(now);
        noise.stop(now + 0.2);
      } else if (type === 'win') {
        [440, 554, 659, 880].forEach(function(f, idx) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'triangle';
          o.frequency.setValueAtTime(f, now + idx * 0.08);
          g.gain.setValueAtTime(0.2, now + idx * 0.08);
          g.gain.linearRampToValueAtTime(0.01, now + idx * 0.08 + 0.15);
          o.start(now + idx * 0.08);
          o.stop(now + idx * 0.08 + 0.15);
        });
      }
    } catch(e) {}
  }

  // DOM
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var knivesEl = document.getElementById('knives-el');
  var applesEl = document.getElementById('apples-el');
  var stageEl = document.getElementById('stage-el');
  var scoreEl = document.getElementById('score-el');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc = document.getElementById('modal-desc');
  var btnRestart = document.getElementById('btn-restart');

  var CANVAS_W = 380;
  var CANVAS_H = 580;

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

  var currentStage = 1;
  var maxStages = 3;
  var score = 0;
  var applesCount = 0;
  var knivesRemaining = 7;
  var isGameOver = false;
  var lastTime = 0;

  var target = {
    x: 0,
    y: 0,
    r: 68,
    angle: 0,
    speed: 1.8,
    speedPatternTimer: 0
  };

  var embeddedKnives = []; // angles relative to target
  var apples = []; // { angle, sliced: false }
  var flyingKnife = null; // { y, vy, failed: false, rot: 0 }
  var particles = [];

  function initStage(stg) {
    currentStage = stg;
    isGameOver = false;
    flyingKnife = null;
    particles = [];

    target.x = canvas.width / 2;
    target.y = canvas.height * 0.32;
    target.angle = 0;
    target.speed = 1.8;
    target.speedPatternTimer = 0;

    embeddedKnives = [];
    apples = [];

    if (stg === 1) {
      knivesRemaining = 7;
      target.speed = 2.0;
    } else if (stg === 2) {
      knivesRemaining = 8;
      target.speed = 2.5;
      // 2 preexisting knives
      embeddedKnives.push(0);
      embeddedKnives.push(Math.PI);
      // 2 apples
      apples.push({ angle: Math.PI * 0.5, sliced: false });
      apples.push({ angle: Math.PI * 1.5, sliced: false });
    } else {
      // Stage 3: BOSS FIGHT
      knivesRemaining = 10;
      target.speed = 3.2;
      embeddedKnives.push(Math.PI * 0.3);
      embeddedKnives.push(Math.PI * 1.2);
      apples.push({ angle: 0, sliced: false });
      apples.push({ angle: Math.PI * 0.8, sliced: false });
    }

    updateHUD();
  }

  function updateHUD() {
    knivesEl.textContent = knivesRemaining;
    applesEl.textContent = applesCount;
    stageEl.textContent = currentStage === 3 ? 'BOSS 战' : 'Stage ' + currentStage;
    scoreEl.textContent = score;
  }

  function throwKnife() {
    if (knivesRemaining <= 0 || flyingKnife || isGameOver) return;

    knivesRemaining--;
    playSound('throw');
    flyingKnife = {
      y: canvas.height - 85,
      vy: -1800,
      failed: false,
      rot: 0
    };
    updateHUD();
  }

  function addSparks(x, y, count) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = Math.random() * 140 + 50;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.3,
        color: Math.random() > 0.5 ? '#facc15' : '#ef4444'
      });
    }
  }

  function addAppleSplats(x, y) {
    for (var i = 0; i < 12; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = Math.random() * 100 + 30;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.35,
        color: '#ef4444'
      });
    }
  }

  function updatePhysics(dt) {
    // 1. Target Rotation dynamics
    target.speedPatternTimer += dt;
    if (currentStage === 3) {
      // Erratic boss spin: reverses direction and speeds up
      target.speed = Math.sin(target.speedPatternTimer * 2.5) * 3.8;
    } else if (currentStage === 2) {
      target.speed = 2.2 + Math.sin(target.speedPatternTimer * 1.8) * 1.2;
    }
    target.angle += target.speed * dt;

    // 2. Flying Knife
    if (flyingKnife) {
      if (!flyingKnife.failed) {
        flyingKnife.y += flyingKnife.vy * dt;

        // Check impact with target log
        if (flyingKnife.y <= target.y + target.r + 20) {
          // Calculate impact angle relative to rotating target
          // Bottom of circle is angle Math.PI / 2
          var impactAngle = (Math.PI / 2 - target.angle) % (Math.PI * 2);
          if (impactAngle < 0) impactAngle += Math.PI * 2;

          // Check collision with embedded knives
          var clashed = false;
          for (var i = 0; i < embeddedKnives.length; i++) {
            var diff = Math.abs(impactAngle - embeddedKnives[i]);
            if (diff > Math.PI) diff = Math.PI * 2 - diff;

            if (diff < 0.22) { // Clash threshold
              clashed = true;
              break;
            }
          }

          if (clashed) {
            // Clash failure!
            flyingKnife.failed = true;
            flyingKnife.vy = 400;
            flyingKnife.vx = (Math.random() - 0.5) * 200;
            playSound('clash');
            addSparks(target.x, target.y + target.r, 20);
            setTimeout(function() {
              gameOver(false, '飞刀相互撞击弹飞！');
            }, 500);
          } else {
            // Success embed!
            embeddedKnives.push(impactAngle);
            playSound('thud');
            score += 10;
            addSparks(target.x, target.y + target.r, 6);

            // Check apple slicing
            apples.forEach(function(ap) {
              if (!ap.sliced) {
                var aDiff = Math.abs(impactAngle - ap.angle);
                if (aDiff > Math.PI) aDiff = Math.PI * 2 - aDiff;
                if (aDiff < 0.28) {
                  ap.sliced = true;
                  applesCount += 2;
                  score += 50;
                  playSound('apple');
                  addAppleSplats(target.x, target.y + target.r);
                }
              }
            });

            flyingKnife = null;
            updateHUD();

            // Check Stage Complete
            if (knivesRemaining <= 0) {
              addSparks(target.x, target.y, 40);
              playSound('win');
              if (currentStage < maxStages) {
                gameOver(true, '木靶碎裂！准备进入下一关卡！');
              } else {
                gameOver(true, '全关卡BOSS彻底粉碎！飞刀终极大师！');
              }
            }
          }
        }
      } else {
        // Tumble down after failure
        flyingKnife.y += flyingKnife.vy * dt;
        flyingKnife.rot += dt * 10;
      }
    }

    // 3. Particles
    for (var pi = particles.length - 1; pi >= 0; pi--) {
      var p = particles[pi];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(pi, 1);
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Center Rotating Target
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.rotate(target.angle);

    // Target Wood/Cheese Body
    ctx.fillStyle = currentStage === 3 ? '#ea580c' : '#78350f';
    ctx.beginPath();
    ctx.arc(0, 0, target.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = currentStage === 3 ? '#facc15' : '#b45309';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Wood concentric rings
    ctx.strokeStyle = currentStage === 3 ? '#c2410c' : '#92400e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, target.r * 0.65, 0, Math.PI * 2);
    ctx.arc(0, 0, target.r * 0.35, 0, Math.PI * 2);
    ctx.stroke();

    // 2. Draw Embedded Knives
    embeddedKnives.forEach(function(ang) {
      ctx.save();
      ctx.rotate(ang);
      drawKnifeBlade(0, target.r);
      ctx.restore();
    });

    // 3. Draw Apples attached
    apples.forEach(function(ap) {
      if (!ap.sliced) {
        ctx.save();
        ctx.rotate(ap.angle);
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🍎', 0, target.r + 14);
        ctx.restore();
      }
    });

    ctx.restore();

    // 4. Flying Knife (or waiting knife at bottom)
    if (flyingKnife) {
      ctx.save();
      ctx.translate(target.x + (flyingKnife.vx ? flyingKnife.vx * 0.1 : 0), flyingKnife.y);
      if (flyingKnife.rot) ctx.rotate(flyingKnife.rot);
      drawReadyKnife(0, 0);
      ctx.restore();
    } else if (knivesRemaining > 0 && !isGameOver) {
      drawReadyKnife(target.x, canvas.height - 85);
    }

    // 5. Left side knife ammunition icons
    for (var k = 0; k < knivesRemaining; k++) {
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(20, canvas.height - 50 - k * 14, 6, 10);
    }

    // 6. Particles
    particles.forEach(function(pt) {
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawReadyKnife(x, y) {
    ctx.save();
    ctx.translate(x, y);

    // Blade
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(0, -32);
    ctx.lineTo(6, -6);
    ctx.lineTo(-6, -6);
    ctx.closePath();
    ctx.fill();

    // Guard
    ctx.fillStyle = '#475569';
    ctx.fillRect(-10, -6, 20, 4);

    // Handle
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-4, -2, 8, 22);

    ctx.restore();
  }

  function drawKnifeBlade(x, y) {
    // Protruding from center target outward
    ctx.save();
    ctx.translate(x, y);

    // Blade embedded pointing inside, handle pointing outside
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(-4, 0, 8, 26);

    ctx.fillStyle = '#475569';
    ctx.fillRect(-10, 26, 20, 4);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-4, 30, 8, 22);

    ctx.restore();
  }

  function gameOver(won, msg) {
    isGameOver = true;
    modalTitle.textContent = won ? '🏆 飞刀大师！' : '💥 飞刀碎裂！';
    modalTitle.style.color = won ? '#facc15' : '#ef4444';
    modalDesc.textContent = msg;
    btnRestart.textContent = won && currentStage < maxStages ? '进入下一关' : '再次挑战';
    modal.classList.remove('hidden');
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

  canvas.addEventListener('click', throwKnife);
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    throwKnife();
  }, { passive: false });

  window.addEventListener('keydown', function(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      throwKnife();
    }
  });

  btnRestart.addEventListener('click', function() {
    modal.classList.add('hidden');
    if (modalTitle.textContent.indexOf('大师') !== -1 && currentStage < maxStages) {
      initStage(currentStage + 1);
    } else {
      initStage(1);
    }
  });

  resizeCanvas();
  initStage(1);
  requestAnimationFrame(gameLoop);

})();
