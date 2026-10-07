// Groovy Ski (酷滑滑雪) - OmniGame Downhill Slalom Engine
(function () {
  'use strict';

  var audioCtx = null;
  var soundEnabled = true;

  function initAudio() {
    if (!audioCtx) {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playTone(freq, dur, type, gain) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;
    try {
      var osc = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      g.gain.setValueAtTime(gain || 0.12, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (e) {}
  }

  function playCarveSound() { playTone(220 + Math.random() * 80, 0.05, 'triangle', 0.06); }
  function playGateSound() {
    playTone(880, 0.08, 'sine', 0.15);
    setTimeout(function () { playTone(1174.6, 0.1, 'sine', 0.15); }, 50);
  }
  function playJumpSound() { playTone(440, 0.15, 'triangle', 0.15); }
  function playCrashSound() {
    playTone(130, 0.3, 'sawtooth', 0.3);
    setTimeout(function () { playTone(70, 0.4, 'square', 0.35); }, 80);
  }

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var distTextEl = document.getElementById('distText');
  var scoreTextEl = document.getElementById('scoreText');
  var comboTextEl = document.getElementById('comboText');
  var overlayHintEl = document.getElementById('overlayHint');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalDescEl = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  var btnLeft = document.getElementById('btnLeft');
  var btnRight = document.getElementById('btnRight');
  var btnJump = document.getElementById('btnJump');

  var isPlaying = false;
  var isDead = false;
  var distance = 0;
  var score = 0;
  var combo = 0;
  var speed = 5.5;

  var skier = {
    x: 180,
    y: 90,
    vx: 0,
    angle: 0, // carving angle
    isJumping: false,
    jumpY: 0,
    vy: 0
  };

  var keyState = { left: false, right: false };
  var obstacles = [];
  var skiTracks = [];
  var spawnTimer = 0;

  function initGame() {
    isPlaying = false;
    isDead = false;
    distance = 0;
    score = 0;
    combo = 0;
    speed = 5.5;

    skier.x = 180;
    skier.y = 90;
    skier.vx = 0;
    skier.angle = 0;
    skier.isJumping = false;
    skier.jumpY = 0;
    skier.vy = 0;

    obstacles = [];
    skiTracks = [];
    spawnTimer = 0;

    overlayHintEl.style.display = 'block';
    modalEl.classList.remove('active');
    updateStatsUI();
  }

  function updateStatsUI() {
    distTextEl.textContent = Math.floor(distance) + 'm';
    scoreTextEl.textContent = score;
    comboTextEl.textContent = combo + 'x';
  }

  function spawnObstacle() {
    spawnTimer++;
    if (spawnTimer < 25) return;
    spawnTimer = 0;

    var r = Math.random();
    var ox = 30 + Math.random() * (canvas.width - 60);

    if (r < 0.45) {
      // Pine tree
      obstacles.push({ type: 'tree', x: ox, y: canvas.height + 40, w: 28, h: 36 });
    } else if (r < 0.65) {
      // Slalom Gate (Red & Blue poles)
      var gateW = 65;
      obstacles.push({ type: 'gate', x: ox, y: canvas.height + 40, w: gateW, passed: false });
    } else if (r < 0.82) {
      // Rock
      obstacles.push({ type: 'rock', x: ox, y: canvas.height + 40, w: 20, h: 14 });
    } else {
      // Snowman or Ramp
      if (Math.random() < 0.5) {
        obstacles.push({ type: 'snowman', x: ox, y: canvas.height + 40, w: 22, h: 30 });
      } else {
        obstacles.push({ type: 'ramp', x: ox, y: canvas.height + 40, w: 32, h: 16 });
      }
    }
  }

  function jump() {
    if (!isPlaying) startGame();
    if (!skier.isJumping) {
      skier.isJumping = true;
      skier.vy = -7.5;
      playJumpSound();
    }
  }

  function startGame() {
    if (isDead) return;
    initAudio();
    isPlaying = true;
    overlayHintEl.style.display = 'none';
  }

  function crash() {
    isDead = true;
    isPlaying = false;
    playCrashSound();
    modalDescEl.textContent = '总滑行 ' + Math.floor(distance) + ' 米，斩获 ' + score + ' 分！';
    modalEl.classList.add('active');
  }

  function update() {
    if (!isPlaying || isDead) return;

    distance += speed * 0.05;
    speed = 5.5 + Math.min(5, distance * 0.003);
    updateStatsUI();

    // Steering
    var carveForce = 0.45;
    if (keyState.left) {
      skier.vx -= carveForce;
      skier.angle = -0.35;
      playCarveSound();
    } else if (keyState.right) {
      skier.vx += carveForce;
      skier.angle = 0.35;
      playCarveSound();
    } else {
      skier.angle *= 0.85;
    }

    skier.vx *= 0.88;
    skier.x += skier.vx;
    skier.x = Math.max(20, Math.min(canvas.width - 20, skier.x));

    // Jump Physics
    if (skier.isJumping) {
      skier.jumpY += skier.vy;
      skier.vy += 0.45;
      if (skier.jumpY >= 0) {
        skier.jumpY = 0;
        skier.vy = 0;
        skier.isJumping = false;
      }
    }

    // Leave ski tracks
    if (!skier.isJumping && Math.random() < 0.6) {
      skiTracks.push({ x: skier.x - 5, y: skier.y + 10, alpha: 0.6 });
      skiTracks.push({ x: skier.x + 5, y: skier.y + 10, alpha: 0.6 });
    }

    // Move ski tracks upward
    for (var t = skiTracks.length - 1; t >= 0; t--) {
      skiTracks[t].y -= speed;
      skiTracks[t].alpha -= 0.01;
      if (skiTracks[t].y < 0 || skiTracks[t].alpha <= 0) {
        skiTracks.splice(t, 1);
      }
    }

    spawnObstacle();

    // Move obstacles upward towards skier
    for (var i = obstacles.length - 1; i >= 0; i--) {
      var ob = obstacles[i];
      ob.y -= speed;

      // Gate check
      if (ob.type === 'gate' && !ob.passed && ob.y <= skier.y + 10 && ob.y >= skier.y - 10) {
        if (skier.x >= ob.x && skier.x <= ob.x + ob.w) {
          ob.passed = true;
          combo++;
          score += 100 * combo;
          playGateSound();
        } else {
          // Missed gate
          combo = 0;
        }
      }

      // Ramp jump check
      if (ob.type === 'ramp' && Math.abs(skier.x - (ob.x + ob.w / 2)) < 18 && Math.abs(skier.y - ob.y) < 14) {
        skier.isJumping = true;
        skier.vy = -10;
        playJumpSound();
      }

      // Lethal collision check
      if (Math.abs(skier.y - ob.y) < 14) {
        if (ob.type === 'rock') {
          // Rocks can be jumped over!
          if (!skier.isJumping || skier.jumpY > -10) {
            if (Math.abs(skier.x - ob.x) < 14) {
              crash();
              return;
            }
          }
        } else if (ob.type === 'tree' || ob.type === 'snowman') {
          if (Math.abs(skier.x - ob.x) < 16) {
            crash();
            return;
          }
        }
      }

      if (ob.y < -50) {
        obstacles.splice(i, 1);
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Snowy slope background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Ski Tracks
    ctx.fillStyle = '#cbd5e1';
    skiTracks.forEach(function (tr) {
      ctx.globalAlpha = tr.alpha;
      ctx.fillRect(tr.x, tr.y, 2, 4);
      ctx.globalAlpha = 1.0;
    });

    // Draw Obstacles
    obstacles.forEach(function (ob) {
      if (ob.type === 'tree') {
        // Pine tree
        ctx.fillStyle = '#78350f';
        ctx.fillRect(ob.x - 3, ob.y + 12, 6, 12);

        ctx.fillStyle = '#15803d';
        ctx.beginPath();
        ctx.moveTo(ob.x, ob.y - 18);
        ctx.lineTo(ob.x - 14, ob.y + 12);
        ctx.lineTo(ob.x + 14, ob.y + 12);
        ctx.closePath();
        ctx.fill();

        // Snow top
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(ob.x, ob.y - 18);
        ctx.lineTo(ob.x - 6, ob.y - 6);
        ctx.lineTo(ob.x + 6, ob.y - 6);
        ctx.closePath();
        ctx.fill();
      } else if (ob.type === 'gate') {
        // Left Red Pole
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(ob.x, ob.y - 20, 4, 26);
        // Right Blue Pole
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(ob.x + ob.w, ob.y - 20, 4, 26);
        // Flags
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(ob.x - 12, ob.y - 20, 12, 10);
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(ob.x + ob.w, ob.y - 20, 12, 10);
      } else if (ob.type === 'rock') {
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.ellipse(ob.x, ob.y, 11, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.ellipse(ob.x - 2, ob.y - 3, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (ob.type === 'snowman') {
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.arc(ob.x, ob.y + 6, 10, 0, Math.PI * 2);
        ctx.arc(ob.x, ob.y - 8, 7, 0, Math.PI * 2);
        ctx.fill();
        // Nose
        ctx.fillStyle = '#f97316';
        ctx.fillRect(ob.x, ob.y - 9, 5, 2);
      } else if (ob.type === 'ramp') {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(ob.x + 2, ob.y + 2, ob.w - 4, 4);
      }
    });

    // Draw Skier
    var sy = skier.y + skier.jumpY;

    ctx.save();
    ctx.translate(skier.x, sy);
    ctx.rotate(skier.angle);

    // Skis
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-8, -12, 3, 28);
    ctx.fillRect(5, -12, 3, 28);

    // Body
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    // Helmet & Goggles
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, -3, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-4, -5, 8, 3);

    // Ski poles
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-7, 2);
    ctx.lineTo(-14, 12);
    ctx.moveTo(7, 2);
    ctx.lineTo(14, 12);
    ctx.stroke();

    ctx.restore();
  }

  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  // Keyboard controls
  window.addEventListener('keydown', function (e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      e.preventDefault(); keyState.left = true; startGame();
    }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      e.preventDefault(); keyState.right = true; startGame();
    }
    if (e.code === 'ArrowUp' || e.code === 'Space') {
      e.preventDefault(); jump();
    }
  });

  window.addEventListener('keyup', function (e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyState.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keyState.right = false;
  });

  btnLeft.addEventListener('pointerdown', function () { keyState.left = true; startGame(); });
  btnLeft.addEventListener('pointerup', function () { keyState.left = false; });
  btnLeft.addEventListener('pointercancel', function () { keyState.left = false; });

  btnRight.addEventListener('pointerdown', function () { keyState.right = true; startGame(); });
  btnRight.addEventListener('pointerup', function () { keyState.right = false; });
  btnRight.addEventListener('pointercancel', function () { keyState.right = false; });

  btnJump.addEventListener('click', jump);
  canvas.addEventListener('pointerdown', startGame);

  restartBtn.addEventListener('click', initGame);
  modalRestartBtn.addEventListener('click', initGame);
  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  initGame();
  loop();
})();
