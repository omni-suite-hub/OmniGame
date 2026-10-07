// games/whack-a-mole/game.js - Whack-A-Mole (打地鼠)
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

      if (type === 'bonk') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.09);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.09);
        osc.start(now);
        osc.stop(now + 0.09);
      } else if (type === 'gold') {
        [523, 659, 784, 1046].forEach(function(f, idx) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'sine';
          o.frequency.setValueAtTime(f, now + idx * 0.06);
          g.gain.setValueAtTime(0.18, now + idx * 0.06);
          g.gain.linearRampToValueAtTime(0.01, now + idx * 0.06 + 0.1);
          o.start(now + idx * 0.06);
          o.stop(now + idx * 0.06 + 0.1);
        });
      } else if (type === 'bomb') {
        var bufferSize = ctx.sampleRate * 0.3;
        var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        var noise = ctx.createBufferSource();
        noise.buffer = buffer;
        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, now);
        filter.frequency.exponentialRampToValueAtTime(30, now + 0.3);
        noise.connect(filter);
        filter.connect(gain);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
        noise.start(now);
        noise.stop(now + 0.3);
      } else if (type === 'miss') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.08);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'gameover') {
        [440, 392, 330, 262].forEach(function(f, idx) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'triangle';
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
  var timeEl = document.getElementById('time-el');
  var comboEl = document.getElementById('combo-el');
  var accEl = document.getElementById('acc-el');
  var scoreEl = document.getElementById('score-el');
  var modal = document.getElementById('game-modal');
  var finalScoreEl = document.getElementById('final-score');
  var btnRestart = document.getElementById('btn-restart');

  var timeLeft = 60;
  var score = 0;
  var combo = 0;
  var totalHits = 0;
  var totalClicks = 0;
  var isGameOver = false;
  var lastTime = 0;

  var holes = []; // 9 holes (3x3)
  var floatTexts = [];
  var particles = [];
  var hammer = null; // hammer swing effect

  function resizeCanvas() {
    var container = document.getElementById('container');
    var size = Math.min(container.clientWidth - 20, container.clientHeight - 20, 500);
    size = Math.max(280, size);
    canvas.width = size;
    canvas.height = size;
    initHoles();
  }
  window.addEventListener('resize', resizeCanvas);

  function initHoles() {
    holes = [];
    var cellW = canvas.width / 3;
    var cellH = canvas.height / 3;

    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 3; c++) {
        holes.push({
          x: (c + 0.5) * cellW,
          y: (r + 0.5) * cellH,
          radiusX: cellW * 0.36,
          radiusY: cellH * 0.22,
          state: 'empty', // empty, up, hit
          type: 'normal', // normal, golden, bomb, helmet
          timer: 0,
          hp: 1,
          heightRatio: 0 // 0 to 1 (0 = inside hole, 1 = fully popped up)
        });
      }
    }
  }

  function initGame() {
    timeLeft = 60;
    score = 0;
    combo = 0;
    totalHits = 0;
    totalClicks = 0;
    isGameOver = false;
    floatTexts = [];
    particles = [];
    hammer = null;

    initHoles();
    updateHUD();
  }

  function updateHUD() {
    timeEl.textContent = Math.ceil(timeLeft) + 's';
    comboEl.textContent = combo + 'x';
    var acc = totalClicks > 0 ? Math.round((totalHits / totalClicks) * 100) : 100;
    accEl.textContent = acc + '%';
    scoreEl.textContent = score;
  }

  function popMole() {
    var emptyHoles = holes.filter(function(h) { return h.state === 'empty'; });
    if (emptyHoles.length === 0) return;

    var h = emptyHoles[Math.floor(Math.random() * emptyHoles.length)];
    var roll = Math.random();
    var type = 'normal';
    var hp = 1;

    if (roll > 0.85) {
      type = 'golden';
    } else if (roll > 0.68) {
      type = 'bomb';
    } else if (roll > 0.50) {
      type = 'helmet';
      hp = 2;
    }

    h.state = 'rising';
    h.type = type;
    h.hp = hp;
    h.heightRatio = 0;
    // Stay duration decreases as game progresses
    h.timer = Math.max(0.6, 1.4 - (60 - timeLeft) * 0.012);
  }

  function addFloatText(text, x, y, color) {
    floatTexts.push({
      text: text,
      x: x,
      y: y,
      color: color || '#facc15',
      alpha: 1.0,
      vy: -40
    });
  }

  function addStarParticles(x, y, color) {
    for (var i = 0; i < 10; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = Math.random() * 80 + 30;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.35,
        color: color || '#facc15'
      });
    }
  }

  function whack(clientX, clientY) {
    if (isGameOver) return;
    var rect = canvas.getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;

    totalClicks++;
    var hitAny = false;

    // Show hammer animation at click position
    hammer = {
      x: x,
      y: y,
      angle: -0.6,
      timer: 0.15
    };

    holes.forEach(function(h) {
      if (h.state === 'rising' || h.state === 'up') {
        // Check hit within hole boundary and popped height
        var dx = (x - h.x) / h.radiusX;
        var dy = (y - (h.y - h.radiusY * 0.6 * h.heightRatio)) / (h.radiusY * 1.2);
        if (dx * dx + dy * dy <= 1.2) {
          hitAny = true;
          totalHits++;
          h.hp--;

          if (h.type === 'bomb') {
            // Hit Bomb!
            playSound('bomb');
            combo = 0;
            score = Math.max(0, score - 20);
            h.state = 'hit';
            h.timer = 0.3;
            addFloatText('-20 💣', h.x, h.y - 20, '#ef4444');
            addStarParticles(h.x, h.y, '#ef4444');
          } else if (h.hp > 0) {
            // Helmet first hit
            playSound('bonk');
            addFloatText('击破头盔!', h.x, h.y - 20, '#e2e8f0');
            addStarParticles(h.x, h.y, '#94a3b8');
          } else {
            // Mole defeat
            combo++;
            var mult = Math.min(4, Math.floor(combo / 5) + 1);
            var pts = (h.type === 'golden' ? 30 : (h.type === 'helmet' ? 25 : 10)) * mult;
            score += pts;

            h.state = 'hit';
            h.timer = 0.3;

            if (h.type === 'golden') {
              playSound('gold');
              addFloatText('+' + pts + ' ✨', h.x, h.y - 30, '#facc15');
              addStarParticles(h.x, h.y, '#facc15');
            } else {
              playSound('bonk');
              var txt = '+' + pts + (mult > 1 ? ' (' + mult + 'x)' : '');
              addFloatText(txt, h.x, h.y - 25, '#38bdf8');
              addStarParticles(h.x, h.y, '#38bdf8');
            }
          }
        }
      }
    });

    if (!hitAny) {
      playSound('miss');
      combo = 0;
    }

    updateHUD();
  }

  function update(dt) {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      gameOver();
      return;
    }

    // Spawn moles periodically
    if (Math.random() < 0.04 + (60 - timeLeft) * 0.0006) {
      popMole();
    }

    // Update holes
    holes.forEach(function(h) {
      if (h.state === 'rising') {
        h.heightRatio += dt * 4;
        if (h.heightRatio >= 1) {
          h.heightRatio = 1;
          h.state = 'up';
        }
      } else if (h.state === 'up') {
        h.timer -= dt;
        if (h.timer <= 0) {
          h.state = 'hiding';
        }
      } else if (h.state === 'hiding') {
        h.heightRatio -= dt * 3.5;
        if (h.heightRatio <= 0) {
          h.heightRatio = 0;
          h.state = 'empty';
        }
      } else if (h.state === 'hit') {
        h.timer -= dt;
        if (h.timer <= 0) {
          h.heightRatio -= dt * 4;
          if (h.heightRatio <= 0) {
            h.heightRatio = 0;
            h.state = 'empty';
          }
        }
      }
    });

    // Update Hammer
    if (hammer) {
      hammer.timer -= dt;
      hammer.angle += dt * 6;
      if (hammer.timer <= 0) hammer = null;
    }

    // Update float texts
    for (var i = floatTexts.length - 1; i >= 0; i--) {
      var ft = floatTexts[i];
      ft.y += ft.vy * dt;
      ft.alpha -= dt * 1.5;
      if (ft.alpha <= 0) floatTexts.splice(i, 1);
    }

    // Update particles
    for (var j = particles.length - 1; j >= 0; j--) {
      var p = particles[j];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(j, 1);
    }

    updateHUD();
  }

  function render() {
    ctx.fillStyle = '#065f46';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Holes and Moles
    holes.forEach(function(h) {
      // 1. Hole background (dark hole inside)
      ctx.fillStyle = '#022c22';
      ctx.beginPath();
      ctx.ellipse(h.x, h.y, h.radiusX, h.radiusY, 0, 0, Math.PI * 2);
      ctx.fill();

      // 2. Mole (clipped by hole)
      if (h.heightRatio > 0) {
        ctx.save();
        // Clipping region: upper half of hole
        ctx.beginPath();
        ctx.rect(h.x - h.radiusX * 1.2, h.y - h.radiusY * 2.5, h.radiusX * 2.4, h.radiusY * 2.5);
        ctx.clip();

        var moleY = h.y - (h.radiusY * 1.1) * h.heightRatio;

        ctx.font = Math.floor(h.radiusX * 1.3) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        var icon = '🐹';
        if (h.type === 'golden') icon = '⭐';
        else if (h.type === 'bomb') icon = '💣';
        else if (h.type === 'helmet') icon = h.hp > 1 ? '👷' : '🐹';

        if (h.state === 'hit') {
          icon = h.type === 'bomb' ? '💥' : '😵';
        }

        ctx.fillText(icon, h.x, moleY);
        ctx.restore();
      }

      // 3. Hole front rim (soil mound covering bottom)
      ctx.fillStyle = '#047857';
      ctx.beginPath();
      ctx.ellipse(h.x, h.y + h.radiusY * 0.35, h.radiusX * 1.05, h.radiusY * 0.7, 0, 0, Math.PI);
      ctx.fill();
    });

    // Hammer effect
    if (hammer) {
      ctx.save();
      ctx.translate(hammer.x, hammer.y);
      ctx.rotate(hammer.angle);
      ctx.font = '38px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔨', 10, -10);
      ctx.restore();
    }

    // Particles
    particles.forEach(function(p) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Float Texts
    floatTexts.forEach(function(ft) {
      ctx.save();
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });
  }

  function gameOver() {
    isGameOver = true;
    finalScoreEl.textContent = score;
    modal.classList.remove('hidden');
    playSound('gameover');
  }

  function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    var dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (dt > 0.1) dt = 0.1;

    if (!isGameOver) {
      update(dt);
    }
    render();
    requestAnimationFrame(gameLoop);
  }

  canvas.addEventListener('click', function(e) {
    whack(e.clientX, e.clientY);
  });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
      whack(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });

  btnRestart.addEventListener('click', function() {
    modal.classList.add('hidden');
    initGame();
  });

  resizeCanvas();
  initGame();
  requestAnimationFrame(gameLoop);

})();
