// games/color-switch/game.js - Color Switch (色彩跳跃)
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

      if (type === 'bounce') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(700, now + 0.08);
        gain.gain.setValueAtTime(0.18, now);
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
      } else if (type === 'switch') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(600, now + 0.12);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'boom') {
        var bufferSize = ctx.sampleRate * 0.25;
        var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        var noise = ctx.createBufferSource();
        noise.buffer = buffer;
        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, now);
        filter.frequency.exponentialRampToValueAtTime(30, now + 0.25);
        noise.connect(filter);
        filter.connect(gain);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
        noise.start(now);
        noise.stop(now + 0.25);
      }
    } catch(e) {}
  }

  // DOM
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('score-el');
  var bestEl = document.getElementById('best-el');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc = document.getElementById('modal-desc');
  var finalScoreEl = document.getElementById('final-score');
  var btnRestart = document.getElementById('btn-restart');

  var CANVAS_W = 380;
  var CANVAS_H = 580;
  var GRAVITY = 1100;
  var JUMP_FORCE = -380;

  var COLORS = ['#06b6d4', '#facc15', '#ec4899', '#a855f7'];

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

  var score = 0;
  var bestScore = parseInt(localStorage.getItem('omnigame:colorswitch_best') || '0', 10);
  var isGameOver = false;
  var hasStarted = false;
  var lastTime = 0;

  var ball = null;
  var obstacles = [];
  var items = []; // stars and color switch orbs
  var particles = [];
  var camY = 0;
  var nextObstacleY = -240;

  function initGame() {
    score = 0;
    isGameOver = false;
    hasStarted = false;
    particles = [];
    obstacles = [];
    items = [];
    camY = 0;
    nextObstacleY = -240;

    var startColorIdx = Math.floor(Math.random() * 4);
    ball = {
      x: canvas.width / 2,
      y: 0,
      vy: 0,
      r: 10,
      colorIdx: startColorIdx
    };

    // Pre-generate 5 obstacles
    for (var i = 0; i < 5; i++) {
      spawnObstacle();
    }

    updateHUD();
  }

  function spawnObstacle() {
    var y = nextObstacleY;
    var type = Math.random() < 0.6 ? 'ring' : 'cross';

    obstacles.push({
      x: canvas.width / 2,
      y: y,
      type: type,
      radius: 65,
      thickness: 15,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random() * 0.8)
    });

    // Star at obstacle center
    items.push({
      x: canvas.width / 2,
      y: y,
      type: 'star',
      collected: false
    });

    // Color switcher between obstacles
    items.push({
      x: canvas.width / 2,
      y: y + 120,
      type: 'switcher',
      collected: false
    });

    nextObstacleY -= 260;
  }

  function updateHUD() {
    scoreEl.textContent = score;
    bestEl.textContent = bestScore;
  }

  function jump() {
    if (isGameOver) return;
    if (!hasStarted) hasStarted = true;
    ball.vy = JUMP_FORCE;
    playSound('bounce');
  }

  function addExplosion(x, y, count) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = Math.random() * 150 + 40;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.45,
        color: COLORS[Math.floor(Math.random() * 4)]
      });
    }
  }

  function checkCollision(obs) {
    var dx = ball.x - obs.x;
    var dy = ball.y - obs.y;
    var dist = Math.hypot(dx, dy);

    if (obs.type === 'ring') {
      var innerR = obs.radius - obs.thickness / 2;
      var outerR = obs.radius + obs.thickness / 2;

      // Check if ball touches ring band
      if (dist + ball.r >= innerR && dist - ball.r <= outerR) {
        // Angle from center to ball relative to ring rotation
        var ang = Math.atan2(dy, dx) - obs.rot;
        // Normalize angle to [0, 2*PI)
        ang = (ang % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);

        // 4 quadrants: [0..PI/2], [PI/2..PI], [PI..3PI/2], [3PI/2..2PI]
        var segIndex = Math.floor(ang / (Math.PI / 2)) % 4;

        if (segIndex !== ball.colorIdx) {
          return true; // Hit wrong color!
        }
      }
    } else if (obs.type === 'cross') {
      // 4 rotating arms
      for (var arm = 0; arm < 4; arm++) {
        var armAng = obs.rot + arm * (Math.PI / 2);
        var armLen = obs.radius * 1.3;
        var endX = obs.x + Math.cos(armAng) * armLen;
        var endY = obs.y + Math.sin(armAng) * armLen;

        // Check ball distance to arm line
        var distToArm = distToSegment(ball.x, ball.y, obs.x, obs.y, endX, endY);
        if (distToArm < ball.r + 7) {
          if (arm !== ball.colorIdx) {
            return true;
          }
        }
      }
    }

    return false;
  }

  function distToSegment(px, py, x1, y1, x2, y2) {
    var l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    var t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }

  function updatePhysics(dt) {
    if (!hasStarted || isGameOver) return;

    ball.vy += GRAVITY * dt;
    ball.y += ball.vy * dt;

    // Camera follow (moves up when ball ascends)
    var targetCamY = ball.y - canvas.height * 0.65;
    if (targetCamY < camY) {
      camY = targetCamY;
    }

    // Bottom screen fall out
    if (ball.y > camY + canvas.height + 20) {
      gameOver();
      return;
    }

    // Rotate obstacles
    obstacles.forEach(function(obs) {
      obs.rot += obs.rotSpeed * dt;

      // Check collision
      if (checkCollision(obs)) {
        gameOver();
      }
    });

    // Check items pickup
    items.forEach(function(it) {
      if (!it.collected && Math.hypot(it.x - ball.x, it.y - ball.y) < ball.r + 16) {
        it.collected = true;
        if (it.type === 'star') {
          score++;
          playSound('star');
          updateHUD();
          // Spawn more obstacles if ascending high
          if (ball.y < nextObstacleY + 900) {
            spawnObstacle();
          }
        } else if (it.type === 'switcher') {
          playSound('switch');
          // Pick a different color
          var nextColor = (ball.colorIdx + 1 + Math.floor(Math.random() * 3)) % 4;
          ball.colorIdx = nextColor;
        }
      }
    });

    // Update Particles
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

    ctx.save();
    ctx.translate(0, -camY);

    // 1. Obstacles
    obstacles.forEach(function(obs) {
      if (obs.type === 'ring') {
        var r = obs.radius;
        for (var i = 0; i < 4; i++) {
          ctx.strokeStyle = COLORS[i];
          ctx.lineWidth = obs.thickness;
          ctx.lineCap = 'butt';
          ctx.beginPath();
          var startA = obs.rot + i * (Math.PI / 2);
          var endA = startA + (Math.PI / 2);
          ctx.arc(obs.x, obs.y, r, startA, endA);
          ctx.stroke();
        }
      } else if (obs.type === 'cross') {
        for (var j = 0; j < 4; j++) {
          var armA = obs.rot + j * (Math.PI / 2);
          var len = obs.radius * 1.3;
          ctx.strokeStyle = COLORS[j];
          ctx.lineWidth = 14;
          ctx.beginPath();
          ctx.moveTo(obs.x, obs.y);
          ctx.lineTo(obs.x + Math.cos(armA) * len, obs.y + Math.sin(armA) * len);
          ctx.stroke();
        }
      }
    });

    // 2. Items (Stars & Switchers)
    items.forEach(function(it) {
      if (!it.collected) {
        if (it.type === 'star') {
          ctx.font = '22px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⭐', it.x, it.y);
        } else if (it.type === 'switcher') {
          // Multicolored 4-quadrant orb
          var orbR = 12;
          for (var q = 0; q < 4; q++) {
            ctx.fillStyle = COLORS[q];
            ctx.beginPath();
            ctx.moveTo(it.x, it.y);
            ctx.arc(it.x, it.y, orbR, q * (Math.PI / 2), (q + 1) * (Math.PI / 2));
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    });

    // 3. Player Ball
    if (ball) {
      ctx.fillStyle = COLORS[ball.colorIdx];
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();

      // Ball glow / highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(ball.x - 3, ball.y - 3, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Particles
    particles.forEach(function(p) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  function gameOver() {
    isGameOver = true;
    playSound('boom');
    addExplosion(ball.x, ball.y, 30);

    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem('omnigame:colorswitch_best', bestScore);
    }

    finalScoreEl.textContent = score;
    modal.classList.remove('hidden');
    updateHUD();
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

  // Inputs
  canvas.addEventListener('click', jump);
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    jump();
  }, { passive: false });

  window.addEventListener('keydown', function(e) {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      jump();
    }
  });

  btnRestart.addEventListener('click', function() {
    modal.classList.add('hidden');
    initGame();
  });

  resizeCanvas();
  initGame();
  requestAnimationFrame(gameLoop);

})();
