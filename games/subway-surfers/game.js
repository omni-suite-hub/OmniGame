// Subway Surfers (地铁跑酷) - OmniGame Pseudo-3D Runner Engine
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

  function playCoinSound() {
    playTone(987.77, 0.08, 'sine', 0.12);
    setTimeout(function () { playTone(1318.5, 0.12, 'triangle', 0.15); }, 50);
  }
  function playJumpSound() { playTone(380, 0.12, 'triangle', 0.12); }
  function playRollSound() { playTone(240, 0.1, 'sine', 0.1); }
  function playCrashSound() {
    playTone(110, 0.3, 'sawtooth', 0.25);
    setTimeout(function () { playTone(60, 0.4, 'square', 0.3); }, 80);
  }

  // DOM
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var distTextEl = document.getElementById('distText');
  var coinsTextEl = document.getElementById('coinsText');
  var scoreTextEl = document.getElementById('scoreText');
  var overlayHintEl = document.getElementById('overlayHint');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalDescEl = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  var btnLeft = document.getElementById('btnLeft');
  var btnRight = document.getElementById('btnRight');
  var btnJump = document.getElementById('btnJump');
  var btnRoll = document.getElementById('btnRoll');

  // Pseudo-3D Geometry
  var HORIZON_Y = 120;
  var BOTTOM_Y = 380;
  var CENTER_X = 180;

  var isPlaying = false;
  var isDead = false;
  var distance = 0;
  var coins = 0;
  var baseSpeed = 6;
  var speed = 6;
  var magnetTimer = 0;

  // Player
  var player = {
    targetLane: 1, // 0: left, 1: center, 2: right
    currentLane: 1,
    yOffset: 0,
    vy: 0,
    isJumping: false,
    isRolling: false,
    rollTimer: 0
  };

  var items = []; // obstacles, coins, powerups
  var spawnTimer = 0;

  function initGame() {
    isPlaying = false;
    isDead = false;
    distance = 0;
    coins = 0;
    speed = baseSpeed;
    magnetTimer = 0;

    player.targetLane = 1;
    player.currentLane = 1;
    player.yOffset = 0;
    player.vy = 0;
    player.isJumping = false;
    player.isRolling = false;
    player.rollTimer = 0;

    items = [];
    spawnTimer = 0;

    overlayHintEl.style.display = 'block';
    modalEl.classList.remove('active');
    updateStatsUI();
  }

  function updateStatsUI() {
    distTextEl.textContent = Math.floor(distance) + 'm';
    coinsTextEl.textContent = coins;
    scoreTextEl.textContent = Math.floor(distance + coins * 10);
  }

  function project(lane, z) {
    // z ranges from 600 (far) down to 0 (near)
    var scale = 200 / (z + 200); // 0.25 (far) to 1.0 (near)
    var y = HORIZON_Y + (BOTTOM_Y - HORIZON_Y) * scale;
    var laneSpread = 90 * scale;
    var x = CENTER_X + (lane - 1) * laneSpread;
    return { x: x, y: y, scale: scale };
  }

  function spawnItems() {
    spawnTimer++;
    if (spawnTimer < 45) return;
    spawnTimer = 0;

    var lane = Math.floor(Math.random() * 3);
    var rand = Math.random();

    if (rand < 0.4) {
      // Coins row
      for (var c = 0; c < 3; c++) {
        items.push({ type: 'coin', lane: lane, z: 600 + c * 40, collected: false });
      }
    } else if (rand < 0.65) {
      // Low hurdle (can jump or dodge)
      items.push({ type: 'hurdle', lane: lane, z: 600 });
    } else if (rand < 0.85) {
      // Overhead sign (can roll or dodge)
      items.push({ type: 'overhead', lane: lane, z: 600 });
    } else {
      // Subway train
      items.push({ type: 'train', lane: lane, z: 600 });
      // add coins on other lane
      var otherLane = (lane + 1) % 3;
      items.push({ type: 'coin', lane: otherLane, z: 620, collected: false });
    }
  }

  function moveLeft() {
    if (!isPlaying) startGame();
    if (player.targetLane > 0) player.targetLane--;
  }

  function moveRight() {
    if (!isPlaying) startGame();
    if (player.targetLane < 2) player.targetLane++;
  }

  function jump() {
    if (!isPlaying) startGame();
    if (!player.isJumping && !player.isRolling) {
      player.isJumping = true;
      player.vy = -10;
      playJumpSound();
    }
  }

  function roll() {
    if (!isPlaying) startGame();
    if (player.isJumping) {
      player.vy = 12; // Fast fall
    }
    player.isRolling = true;
    player.rollTimer = 25;
    playRollSound();
  }

  function startGame() {
    if (isDead) return;
    initAudio();
    isPlaying = true;
    overlayHintEl.style.display = 'none';
  }

  function gameOver() {
    isDead = true;
    isPlaying = false;
    playCrashSound();
    modalDescEl.textContent = '总奔跑 ' + Math.floor(distance) + ' 米，收获 ' + coins + ' 枚金币！';
    modalEl.classList.add('active');
  }

  function update() {
    if (!isPlaying || isDead) return;

    distance += speed * 0.05;
    speed = baseSpeed + Math.min(6, distance * 0.005);
    updateStatsUI();

    // Smooth lane transition
    player.currentLane += (player.targetLane - player.currentLane) * 0.25;

    // Jump Physics
    if (player.isJumping) {
      player.yOffset += player.vy;
      player.vy += 0.65; // gravity
      if (player.yOffset >= 0) {
        player.yOffset = 0;
        player.vy = 0;
        player.isJumping = false;
      }
    }

    // Roll Timer
    if (player.isRolling) {
      player.rollTimer--;
      if (player.rollTimer <= 0) {
        player.isRolling = false;
      }
    }

    // Magnet timer
    if (magnetTimer > 0) magnetTimer--;

    spawnItems();

    // Move & Check Items
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      it.z -= speed;

      // Magnet pull
      if (it.type === 'coin' && !it.collected && magnetTimer > 0 && it.z < 300) {
        it.lane += (player.currentLane - it.lane) * 0.15;
      }

      // Collision range: z between -10 and 30
      if (it.z < 30 && it.z > -10) {
        var laneDist = Math.abs(it.lane - player.currentLane);
        if (laneDist < 0.5) {
          if (it.type === 'coin' && !it.collected) {
            it.collected = true;
            coins++;
            playCoinSound();
          } else if (it.type === 'hurdle') {
            if (!player.isJumping || player.yOffset > -15) {
              gameOver();
              return;
            }
          } else if (it.type === 'overhead') {
            if (!player.isRolling) {
              gameOver();
              return;
            }
          } else if (it.type === 'train') {
            gameOver();
            return;
          }
        }
      }

      // Remove behind camera
      if (it.z < -40) {
        items.splice(i, 1);
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Sky & Buildings
    var grad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#334155');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, HORIZON_Y);

    // Distant city silhouette
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(20, 50, 40, 70);
    ctx.fillRect(70, 70, 30, 50);
    ctx.fillRect(120, 30, 50, 90);
    ctx.fillRect(200, 60, 45, 60);
    ctx.fillRect(260, 40, 55, 80);
    ctx.fillRect(320, 65, 30, 55);

    // Ground Track
    ctx.fillStyle = '#1e1b4b';
    ctx.beginPath();
    ctx.moveTo(CENTER_X - 40, HORIZON_Y);
    ctx.lineTo(CENTER_X + 40, HORIZON_Y);
    ctx.lineTo(canvas.width, BOTTOM_Y + 40);
    ctx.lineTo(0, BOTTOM_Y + 40);
    ctx.closePath();
    ctx.fill();

    // 3 Subway Track Rails
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    [-1, -0.33, 0.33, 1].forEach(function (offset) {
      ctx.beginPath();
      ctx.moveTo(CENTER_X + offset * 35, HORIZON_Y);
      ctx.lineTo(CENTER_X + offset * 140, BOTTOM_Y + 40);
      ctx.stroke();
    });

    // Railway sleepers (horizontal ties)
    var tieOffset = (distance * 6) % 30;
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.25)';
    ctx.lineWidth = 2;
    for (var tz = 30; tz < 400; tz += 25) {
      var pLeft = project(0, tz - tieOffset);
      var pRight = project(2, tz - tieOffset);
      if (pLeft.y > HORIZON_Y && pLeft.y < BOTTOM_Y + 20) {
        ctx.beginPath();
        ctx.moveTo(pLeft.x - 20 * pLeft.scale, pLeft.y);
        ctx.lineTo(pRight.x + 20 * pRight.scale, pRight.y);
        ctx.stroke();
      }
    }

    // Sort items by Z (descending so far draws first)
    var sorted = items.slice().sort(function (a, b) { return b.z - a.z; });

    sorted.forEach(function (it) {
      if (it.z > 600 || it.z < -20) return;
      var p = project(it.lane, it.z);

      if (it.type === 'coin' && !it.collected) {
        var r = 10 * p.scale;
        ctx.fillStyle = '#fbbf24';
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y - 12 * p.scale, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (it.type === 'hurdle') {
        var hw = 50 * p.scale;
        var hh = 20 * p.scale;
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(p.x - hw / 2, p.y - hh, hw, hh);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(p.x - hw / 2, p.y - hh, hw, hh);
      } else if (it.type === 'overhead') {
        var ow = 60 * p.scale;
        var oh = 12 * p.scale;
        var postH = 40 * p.scale;
        // Pillars
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x - ow / 2, p.y - postH, ow, oh);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(p.x - ow / 2, p.y - postH, ow, oh);
      } else if (it.type === 'train') {
        var tw = 58 * p.scale;
        var th = 70 * p.scale;
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(p.x - tw / 2, p.y - th, tw, th);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x - tw / 2, p.y - th, tw, th);
        // Train windshield
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(p.x - tw / 3, p.y - th + 8 * p.scale, tw * 0.66, 16 * p.scale);
      }
    });

    // Draw Player Runner
    var pp = project(player.currentLane, 0);
    var pSize = 34;
    var ph = player.isRolling ? pSize * 0.5 : pSize;
    var py = pp.y - ph + player.yOffset;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(pp.x, pp.y, pSize * 0.4, pSize * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = player.isRolling ? '#f59e0b' : '#38bdf8';
    ctx.fillRect(pp.x - pSize * 0.35, py, pSize * 0.7, ph);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(pp.x - pSize * 0.35, py, pSize * 0.7, ph);

    // Cap / Head
    if (!player.isRolling) {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(pp.x - pSize * 0.3, py - 8, pSize * 0.6, 8);
    }
  }

  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  // Input Listeners
  window.addEventListener('keydown', function (e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); moveLeft(); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); moveRight(); }
    if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') { e.preventDefault(); jump(); }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); roll(); }
  });

  btnLeft.addEventListener('click', moveLeft);
  btnRight.addEventListener('click', moveRight);
  btnJump.addEventListener('click', jump);
  btnRoll.addEventListener('click', roll);

  // Swipe gesture support
  var touchStartX = 0;
  var touchStartY = 0;
  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length > 0) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  canvas.addEventListener('touchend', function (e) {
    if (e.changedTouches.length > 0) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      var dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 30) moveRight();
        else if (dx < -30) moveLeft();
      } else {
        if (dy < -30) jump();
        else if (dy > 30) roll();
      }
    }
  }, { passive: true });

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
