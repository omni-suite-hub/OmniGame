// Bowling 3D (经典保龄球) - OmniGame Engine
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

  function playRollSound() { playTone(120, 0.4, 'triangle', 0.15); }
  function playPinCrashSound(count) {
    playTone(340, 0.2, 'sawtooth', 0.25);
    setTimeout(function () { playTone(580, 0.25, 'square', 0.2); }, 50);
  }
  function playStrikeCheer() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { playTone(f, 0.25, 'triangle', 0.2); }, i * 100);
    });
  }

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var frameTextEl = document.getElementById('frameText');
  var ballTextEl = document.getElementById('ballText');
  var scoreTextEl = document.getElementById('scoreText');
  var scoreboardEl = document.getElementById('scoreboard');
  var powerBarEl = document.getElementById('powerBar');
  var powerLabelEl = document.getElementById('powerLabel');
  var overlayHintEl = document.getElementById('overlayHint');
  var throwBtn = document.getElementById('throwBtn');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalTitleEl = document.getElementById('modalTitle');
  var modalDescEl = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  var ALLEY_LEFT = 75;
  var ALLEY_RIGHT = 285;
  var FOUL_Y = 280;

  var currentFrame = 1;
  var currentBallInFrame = 1;
  var totalFrames = 5;
  var frameScores = []; // [{ b1: num, b2: num, total: num }]

  var isBallRolling = false;
  var isAiming = false;
  var dragStartY = 0;
  var power = 0.8;

  var ball = {
    x: 180,
    y: FOUL_Y,
    vx: 0,
    vy: 0,
    r: 12
  };

  var pins = [];

  var PIN_LAYOUT = [
    { id: 1, x: 180, y: 90 },
    { id: 2, x: 168, y: 76 }, { id: 3, x: 192, y: 76 },
    { id: 4, x: 156, y: 62 }, { id: 5, x: 180, y: 62 }, { id: 6, x: 204, y: 62 },
    { id: 7, x: 144, y: 48 }, { id: 8, x: 168, y: 48 }, { id: 9, x: 192, y: 48 }, { id: 10, x: 216, y: 48 }
  ];

  function resetPins() {
    pins = PIN_LAYOUT.map(function (p) {
      return {
        id: p.id,
        x: p.x,
        y: p.y,
        vx: 0,
        vy: 0,
        r: 6,
        down: false,
        angle: 0
      };
    });
  }

  function initGame() {
    currentFrame = 1;
    currentBallInFrame = 1;
    frameScores = [];
    for (var f = 0; f < totalFrames; f++) {
      frameScores.push({ b1: null, b2: null, score: null });
    }

    resetBall();
    resetPins();
    modalEl.classList.remove('active');
    overlayHintEl.style.display = 'block';

    updateStatsUI();
  }

  function resetBall() {
    isBallRolling = false;
    isAiming = false;
    ball.x = 180;
    ball.y = FOUL_Y;
    ball.vx = 0;
    ball.vy = 0;
  }

  function updateStatsUI() {
    frameTextEl.textContent = '第 ' + currentFrame + '/' + totalFrames + ' 轮';
    ballTextEl.textContent = '第 ' + currentBallInFrame + ' 投';

    // Calculate total score
    var total = 0;
    frameScores.forEach(function (fs) {
      if (fs.b1 !== null) total += fs.b1;
      if (fs.b2 !== null) total += fs.b2;
    });
    scoreTextEl.textContent = total;

    // Render scoreboard
    scoreboardEl.innerHTML = '';
    frameScores.forEach(function (fs, idx) {
      var box = document.createElement('div');
      box.className = 'frame-box';
      var s1 = fs.b1 !== null ? (fs.b1 === 10 ? 'X' : fs.b1) : '-';
      var s2 = fs.b2 !== null ? (fs.b1 + fs.b2 === 10 ? '/' : fs.b2) : '';
      box.innerHTML = '<div class="f-num">F' + (idx + 1) + '</div><div class="f-shots">' + s1 + (s2 ? ' ' + s2 : '') + '</div>';
      scoreboardEl.appendChild(box);
    });
  }

  function launchBall(aimVx, aimVy) {
    if (isBallRolling) return;
    initAudio();
    isBallRolling = true;
    overlayHintEl.style.display = 'none';

    ball.vx = aimVx;
    ball.vy = aimVy;
    playRollSound();
  }

  function checkTurnResolution() {
    var knockedThisBall = 0;
    pins.forEach(function (p) {
      if (p.down) knockedThisBall++;
    });

    var fs = frameScores[currentFrame - 1];

    if (currentBallInFrame === 1) {
      fs.b1 = knockedThisBall;
      if (knockedThisBall === 10) {
        // Strike!
        playStrikeCheer();
        advanceFrame();
      } else {
        // Prepare 2nd ball
        currentBallInFrame = 2;
        // Keep standing pins, remove knocked pins
        pins = pins.filter(function (p) { return !p.down; });
        resetBall();
        updateStatsUI();
      }
    } else {
      // 2nd ball
      var totalKnocked = (10 - pins.length) + (knockedThisBall);
      fs.b2 = knockedThisBall;
      if (fs.b1 + fs.b2 === 10) {
        playStrikeCheer(); // Spare!
      }
      advanceFrame();
    }
  }

  function advanceFrame() {
    if (currentFrame < totalFrames) {
      currentFrame++;
      currentBallInFrame = 1;
      resetPins();
      resetBall();
      updateStatsUI();
    } else {
      // Game Over
      isBallRolling = false;
      var finalScore = 0;
      frameScores.forEach(function (f) {
        if (f.b1 !== null) finalScore += f.b1;
        if (f.b2 !== null) finalScore += f.b2;
      });
      modalTitleEl.textContent = '保龄球局结束！';
      modalDescEl.textContent = '总共 5 轮累计斩获 ' + finalScore + ' 分！';
      modalEl.classList.add('active');
    }
  }

  function update() {
    if (!isBallRolling) return;

    ball.x += ball.vx;
    ball.y += ball.vy;

    // Gutter check
    if (ball.x < ALLEY_LEFT + 8 || ball.x > ALLEY_RIGHT - 8) {
      ball.vx = 0; // trapped in gutter
    }

    // Ball-to-Pin Collisions
    var anyPinHit = false;
    pins.forEach(function (p) {
      if (p.down) return;

      var dx = p.x - ball.x;
      var dy = p.y - ball.y;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < ball.r + p.r) {
        p.down = true;
        anyPinHit = true;
        p.vx = (dx / (dist || 1)) * 4 + (Math.random() - 0.5) * 3;
        p.vy = (dy / (dist || 1)) * 4 - 2;

        // Slow ball down slightly
        ball.vy *= 0.85;
      }
    });

    if (anyPinHit) {
      playPinCrashSound(1);
    }

    // Pin-to-Pin chain collisions
    for (var i = 0; i < pins.length; i++) {
      var p1 = pins[i];
      if (!p1.down) continue;

      p1.x += p1.vx;
      p1.y += p1.vy;
      p1.vx *= 0.9;
      p1.vy *= 0.9;

      for (var j = 0; j < pins.length; j++) {
        var p2 = pins[j];
        if (i === j || p2.down) continue;

        var pdx = p2.x - p1.x;
        var pdy = p2.y - p1.y;
        var pdist = Math.sqrt(pdx * pdx + pdy * pdy);

        if (pdist < p1.r * 2 + 4) {
          p2.down = true;
          p2.vx = (pdx / (pdist || 1)) * 3;
          p2.vy = (pdy / (pdist || 1)) * 3;
        }
      }
    }

    // Check when ball goes past pins pit
    if (ball.y < 30) {
      setTimeout(checkTurnResolution, 500);
      isBallRolling = false;
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Alley Gutters
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Wooden Bowling Lane (center strip)
    var laneGrad = ctx.createLinearGradient(ALLEY_LEFT, 0, ALLEY_RIGHT, 0);
    laneGrad.addColorStop(0, '#78350f');
    laneGrad.addColorStop(0.5, '#b45309');
    laneGrad.addColorStop(1, '#78350f');
    ctx.fillStyle = laneGrad;
    ctx.fillRect(ALLEY_LEFT, 0, ALLEY_RIGHT - ALLEY_LEFT, canvas.height);

    // Hardwood plank lines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1;
    for (var x = ALLEY_LEFT + 20; x < ALLEY_RIGHT; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Foul Line
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ALLEY_LEFT, FOUL_Y + 15);
    ctx.lineTo(ALLEY_RIGHT, FOUL_Y + 15);
    ctx.stroke();

    // Aim Guide line when not rolling
    if (!isBallRolling) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(180, 85);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw Pins
    pins.forEach(function (p) {
      if (p.down) {
        // Knocked down pin
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillRect(p.x - 3, p.y - 8, 6, 16);
      } else {
        // Standing pin
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 4, p.r * 0.7, 0, Math.PI * 2);
        ctx.arc(p.x, p.y + 4, p.r, 0, Math.PI * 2);
        ctx.fill();

        // Red neck stripes
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(p.x - 3, p.y - 2, 6, 2);
      }
    });

    // Draw Bowling Ball
    ctx.fillStyle = '#1e1b4b';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Finger holes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ball.x - 3, ball.y - 3, 1.5, 0, Math.PI * 2);
    ctx.arc(ball.x + 3, ball.y - 3, 1.5, 0, Math.PI * 2);
    ctx.arc(ball.x, ball.y + 3, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  // Pointer drag to aim & launch
  function getPos(e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (isBallRolling) return;
    initAudio();
    var p = getPos(e);
    if (Math.abs(p.x - ball.x) < 30) {
      isAiming = true;
      dragStartY = p.y;
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (isBallRolling) return;
    var p = getPos(e);
    if (!isAiming) {
      // Reposition ball along foul line
      ball.x = Math.max(ALLEY_LEFT + 15, Math.min(ALLEY_RIGHT - 15, p.x));
    }
  });

  canvas.addEventListener('pointerup', function (e) {
    if (!isAiming || isBallRolling) return;
    isAiming = false;
    var p = getPos(e);
    var dy = dragStartY - p.y;

    if (dy > 20) {
      var aimVx = (180 - ball.x) * 0.04;
      var aimVy = -Math.min(10, Math.max(5, dy * 0.12));
      launchBall(aimVx, aimVy);
    }
  });

  throwBtn.addEventListener('click', function () {
    if (isBallRolling) return;
    var aimVx = (180 - ball.x) * 0.04;
    launchBall(aimVx, -7.5);
  });

  restartBtn.addEventListener('click', initGame);
  modalRestartBtn.addEventListener('click', initGame);
  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  initGame();
  loop();
})();
