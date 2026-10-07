(function () {
  'use strict';

  var STORAGE_KEY = 'omg:save:doodle-jump';
  var BEST_SCORE_KEY = 'omg:best:doodle-jump';

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');

  var scoreText = document.getElementById('scoreText');
  var bestScoreText = document.getElementById('bestScoreText');
  var soundBtn = document.getElementById('soundBtn');
  var restartBtn = document.getElementById('restartBtn');

  var modal = document.getElementById('djModal');
  var modalEmoji = document.getElementById('modalEmoji');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  // Constants
  var WIDTH = 360;
  var HEIGHT = 520;
  var GRAVITY = 0.42;
  var JUMP_SPEED = -10.5;
  var SPRING_JUMP_SPEED = -17.5;
  var PLATFORM_WIDTH = 60;
  var PLATFORM_HEIGHT = 12;

  // State
  var player = {
    x: WIDTH / 2 - 16,
    y: HEIGHT - 100,
    vx: 0,
    vy: JUMP_SPEED,
    w: 32,
    h: 32,
    facing: 'right'
  };

  var platforms = [];
  var score = 0;
  var bestScore = 0;
  var isGameOver = false;
  var soundEnabled = true;
  var keys = { left: false, right: false };
  var animationId = null;

  // Audio Context
  var audioCtx = null;
  function getAudioCtx() {
    if (!soundEnabled) return null;
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
    if (!soundEnabled) return;
    var ctxA = getAudioCtx();
    if (!ctxA) return;
    var t = ctxA.currentTime;

    if (type === 'bounce') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.exponentialRampToValueAtTime(650, t + 0.1);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.11);
    } else if (type === 'spring') {
      [440, 660, 880].forEach(function (freq, i) {
        var osc = ctxA.createOscillator();
        var gain = ctxA.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + i * 0.05);
        gain.gain.setValueAtTime(0.3, t + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.05 + 0.15);
        osc.connect(gain);
        gain.connect(ctxA.destination);
        osc.start(t + i * 0.05);
        osc.stop(t + i * 0.05 + 0.16);
      });
    } else if (type === 'break') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.09);
    } else if (type === 'fall') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(450, t);
      osc.frequency.exponentialRampToValueAtTime(100, t + 0.35);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    }
  }

  function spawnPlatform(y) {
    var typeRoll = Math.random();
    var type = 'standard';
    var hasSpring = false;

    if (score > 1000 && typeRoll < 0.25) {
      type = 'moving';
    } else if (score > 600 && typeRoll < 0.4) {
      type = 'broken';
    }

    if (type === 'standard' && Math.random() < 0.12) {
      hasSpring = true;
    }

    return {
      x: 20 + Math.random() * (WIDTH - PLATFORM_WIDTH - 40),
      y: y,
      w: PLATFORM_WIDTH,
      h: PLATFORM_HEIGHT,
      type: type,
      vx: (type === 'moving') ? (Math.random() > 0.5 ? 1.6 : -1.6) : 0,
      broken: false,
      hasSpring: hasSpring
    };
  }

  function initGame() {
    player.x = WIDTH / 2 - 16;
    player.y = HEIGHT - 100;
    player.vx = 0;
    player.vy = JUMP_SPEED;
    player.facing = 'right';

    platforms = [];
    // Base platform directly under player
    platforms.push({
      x: WIDTH / 2 - 30,
      y: HEIGHT - 60,
      w: PLATFORM_WIDTH,
      h: PLATFORM_HEIGHT,
      type: 'standard',
      vx: 0,
      broken: false,
      hasSpring: false
    });

    // Populate initial platforms upwards
    var curY = HEIGHT - 120;
    while (curY > -20) {
      platforms.push(spawnPlatform(curY));
      curY -= 55 + Math.random() * 20;
    }

    score = 0;
    isGameOver = false;

    updateUI();
    hideModal();
    saveState();
  }

  function updateUI() {
    scoreText.textContent = score.toLocaleString();
    if (score > bestScore) {
      bestScore = score;
      saveBestScore();
    }
    bestScoreText.textContent = bestScore.toLocaleString();
  }

  function updatePhysics() {
    if (isGameOver) return;

    // Player horizontal controls
    if (keys.left) {
      player.vx -= 0.8;
      player.facing = 'left';
    } else if (keys.right) {
      player.vx += 0.8;
      player.facing = 'right';
    }
    player.vx *= 0.86; // friction
    player.x += player.vx;

    // Screen wrap-around
    if (player.x < -player.w / 2) {
      player.x = WIDTH - player.w / 2;
    } else if (player.x > WIDTH - player.w / 2) {
      player.x = -player.w / 2;
    }

    // Player vertical gravity
    player.vy += GRAVITY;
    player.y += player.vy;

    // Moving platforms
    platforms.forEach(function (p) {
      if (p.type === 'moving') {
        p.x += p.vx;
        if (p.x <= 10) {
          p.x = 10;
          p.vx = -p.vx;
        } else if (p.x + p.w >= WIDTH - 10) {
          p.x = WIDTH - 10 - p.w;
          p.vx = -p.vx;
        }
      } else if (p.broken && p.breaking) {
        p.y += 6; // falling broken platform
      }
    });

    // Platform collision: only when falling downwards
    if (player.vy > 0) {
      platforms.forEach(function (p) {
        if (p.broken) return;

        var px = player.x + player.w / 2;
        var py = player.y + player.h;

        if (
          px >= p.x &&
          px <= p.x + p.w &&
          py >= p.y &&
          py <= p.y + p.h + 8 &&
          player.y + player.h - player.vy <= p.y + 4
        ) {
          if (p.type === 'broken') {
            p.broken = true;
            p.breaking = true;
            playSound('break');
          } else if (p.hasSpring) {
            player.vy = SPRING_JUMP_SPEED;
            playSound('spring');
          } else {
            player.vy = JUMP_SPEED;
            playSound('bounce');
          }
        }
      });
    }

    // Camera scrolling when player jumps high
    if (player.y < 240) {
      var delta = 240 - player.y;
      player.y = 240;
      score += Math.round(delta);
      updateUI();

      // Scroll platforms downwards
      platforms.forEach(function (p) {
        p.y += delta;
      });

      // Remove platforms off screen and generate new ones above
      platforms = platforms.filter(function (p) { return p.y < HEIGHT + 40; });

      var highestY = Math.min.apply(null, platforms.map(function (p) { return p.y; }));
      while (highestY > -40) {
        highestY -= 55 + Math.random() * 20;
        platforms.push(spawnPlatform(highestY));
      }
    }

    // Game Over check
    if (player.y > HEIGHT + 40) {
      handleGameOver();
    }
  }

  function handleGameOver() {
    isGameOver = true;
    playSound('fall');

    var isNewRecord = (score >= bestScore && score > 0);
    setTimeout(function () {
      modalEmoji.textContent = isNewRecord ? '🏆' : '🦘';
      modalTitle.textContent = isNewRecord ? '刷新最高纪录！' : '跌落深渊！';
      modalDesc.textContent = '最终高度: ' + score.toLocaleString() + ' 分' + (isNewRecord ? ' (新纪录！)' : ' · 历史最佳: ' + bestScore.toLocaleString());
      modal.classList.add('show');
    }, 450);
  }

  function hideModal() {
    modal.classList.remove('show');
  }

  function saveBestScore() {
    try {
      localStorage.setItem(BEST_SCORE_KEY, bestScore);
    } catch (e) {}
  }

  function loadBestScore() {
    try {
      var val = localStorage.getItem(BEST_SCORE_KEY);
      if (val) bestScore = parseInt(val, 10) || 0;
    } catch (e) {}
  }

  // Draw procedures
  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Notebook grid background
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (var x = 0; x < WIDTH; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
    for (var y = 0; y < HEIGHT; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }

    // Draw Platforms
    platforms.forEach(function (p) {
      ctx.save();
      if (p.type === 'standard') {
        ctx.fillStyle = '#10b981';
        ctx.strokeStyle = '#047857';
      } else if (p.type === 'moving') {
        ctx.fillStyle = '#3b82f6';
        ctx.strokeStyle = '#1d4ed8';
      } else if (p.type === 'broken') {
        ctx.fillStyle = '#b45309';
        ctx.strokeStyle = '#78350f';
      }

      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, p.w, p.h, 6);
      ctx.fill();
      ctx.stroke();

      // Spring coil
      if (p.hasSpring) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(p.x + p.w / 2 - 6, p.y - 8, 12, 8);
      }

      ctx.restore();
    });

    // Draw Doodle Player
    ctx.save();
    ctx.translate(player.x + player.w / 2, player.y + player.h / 2);
    if (player.facing === 'left') {
      ctx.scale(-1, 1);
    }

    // Body
    ctx.fillStyle = '#84cc16';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();

    // Snout
    ctx.fillStyle = '#65a30d';
    ctx.beginPath();
    ctx.arc(10, 4, 6, 0, Math.PI * 2);
    ctx.fill();

    // Big eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(4, -5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(6, -5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Springy feet
    ctx.strokeStyle = '#4d7c0f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-6, 12);
    ctx.lineTo(-6, 18);
    ctx.moveTo(4, 12);
    ctx.lineTo(4, 18);
    ctx.stroke();

    ctx.restore();
  }

  function loop() {
    updatePhysics();
    draw();
    animationId = requestAnimationFrame(loop);
  }

  function saveState() {
    try {
      var state = {
        score: score,
        isGameOver: isGameOver
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function loadState() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        var state = JSON.parse(saved);
        if (state && typeof state.score === 'number') {
          score = state.score;
          updateUI();
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // Keyboard
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      keys.left = true;
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      keys.right = true;
    }
  });

  window.addEventListener('keyup', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      keys.left = false;
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      keys.right = false;
    }
  });

  // Touch on Left/Right half of canvas
  canvas.addEventListener('touchstart', function (e) {
    var rect = canvas.getBoundingClientRect();
    for (var i = 0; i < e.touches.length; i++) {
      var touchX = e.touches[i].clientX - rect.left;
      if (touchX < rect.width / 2) {
        keys.left = true;
      } else {
        keys.right = true;
      }
    }
  }, { passive: true });

  canvas.addEventListener('touchend', function () {
    keys.left = false;
    keys.right = false;
  });

  restartBtn.addEventListener('click', initGame);
  modalRestartBtn.addEventListener('click', initGame);

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  // Init
  loadBestScore();
  initGame();
  animationId = requestAnimationFrame(loop);
})();
