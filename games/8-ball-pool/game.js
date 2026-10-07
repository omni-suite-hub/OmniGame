// 8-Ball Pool (经典台球) - OmniGame 2D Billiards Physics Engine
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

  function playStrikeSound(pwr) {
    playTone(180, 0.08, 'triangle', Math.min(0.25, 0.08 + pwr * 0.15));
  }
  function playClackSound(vol) {
    playTone(700 + Math.random() * 200, 0.04, 'triangle', Math.min(0.2, 0.05 + vol * 0.1));
  }
  function playPocketSound() {
    playTone(220, 0.15, 'sine', 0.2);
    setTimeout(function () { playTone(140, 0.2, 'triangle', 0.15); }, 50);
  }
  function playWinSound() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { playTone(f, 0.25, 'triangle', 0.2); }, i * 110);
    });
  }

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var ballsLeftTextEl = document.getElementById('ballsLeftText');
  var shotsTextEl = document.getElementById('shotsText');
  var scoreTextEl = document.getElementById('scoreText');
  var powerPercentEl = document.getElementById('powerPercent');
  var powerFillEl = document.getElementById('powerFill');
  var overlayHintEl = document.getElementById('overlayHint');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalTitleEl = document.getElementById('modalTitle');
  var modalDescEl = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  var TABLE = {
    x1: 20,
    y1: 20,
    x2: 340,
    y2: 240
  };

  var POCKETS = [
    { x: 22, y: 22, r: 16 },
    { x: 180, y: 16, r: 14 },
    { x: 338, y: 22, r: 16 },
    { x: 22, y: 238, r: 16 },
    { x: 180, y: 244, r: 14 },
    { x: 338, y: 238, r: 16 }
  ];

  var BALL_RADIUS = 7.5;
  var FRICTION = 0.985;

  var balls = [];
  var isAiming = false;
  var aimStartX = 0;
  var aimStartY = 0;
  var aimPower = 0;
  var aimAngle = 0;

  var shots = 0;
  var score = 0;
  var isGameOver = false;

  var BALL_COLORS = [
    '#ffffff', // 0: Cue ball
    '#facc15', // 1: Yellow
    '#2563eb', // 2: Blue
    '#dc2626', // 3: Red
    '#9333ea', // 4: Purple
    '#ea580c', // 5: Orange
    '#16a34a', // 6: Green
    '#b45309', // 7: Brown
    '#111827'  // 8: Black 8-Ball
  ];

  function initGame() {
    balls = [];
    shots = 0;
    score = 0;
    isGameOver = false;
    isAiming = false;
    aimPower = 0;

    modalEl.classList.remove('active');
    overlayHintEl.style.display = 'block';

    // Cue ball
    balls.push({
      id: 0,
      x: 90,
      y: 130,
      vx: 0,
      vy: 0,
      color: BALL_COLORS[0],
      potted: false
    });

    // Triangle rack for object balls (centered around x = 250, y = 130)
    var rackR = BALL_RADIUS * 2 + 1;
    var startX = 230;
    var startY = 130;

    var rackLayout = [
      [1],
      [2, 3],
      [4, 8, 5],
      [6, 7]
    ];

    var ballIdx = 1;
    for (var col = 0; col < rackLayout.length; col++) {
      var rowCount = rackLayout[col].length;
      var cx = startX + col * (rackR * 0.866);
      var topY = startY - ((rowCount - 1) * rackR) / 2;

      for (var r = 0; r < rowCount; r++) {
        var cy = topY + r * rackR;
        var bId = rackLayout[col][r];
        balls.push({
          id: bId,
          x: cx,
          y: cy,
          vx: 0,
          vy: 0,
          color: BALL_COLORS[bId],
          potted: false
        });
      }
    }

    updateStatsUI();
  }

  function areBallsMoving() {
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (!b.potted && (Math.abs(b.vx) > 0.05 || Math.abs(b.vy) > 0.05)) {
        return true;
      }
    }
    return false;
  }

  function updateStatsUI() {
    var objLeft = balls.filter(function (b) { return b.id > 0 && b.id !== 8 && !b.potted; }).length;
    ballsLeftTextEl.textContent = objLeft;
    shotsTextEl.textContent = shots;
    scoreTextEl.textContent = score;
    powerPercentEl.textContent = Math.floor(aimPower * 100) + '%';
    powerFillEl.style.width = Math.floor(aimPower * 100) + '%';
  }

  function updatePhysics() {
    var moving = false;

    // Move balls and apply friction
    balls.forEach(function (b) {
      if (b.potted) return;

      b.x += b.vx;
      b.y += b.vy;
      b.vx *= FRICTION;
      b.vy *= FRICTION;

      if (Math.abs(b.vx) < 0.02) b.vx = 0;
      if (Math.abs(b.vy) < 0.02) b.vy = 0;

      if (b.vx !== 0 || b.vy !== 0) moving = true;

      // Check cushions
      var r = BALL_RADIUS;
      if (b.x - r < TABLE.x1) { b.x = TABLE.x1 + r; b.vx = -b.vx * 0.85; }
      if (b.x + r > TABLE.x2) { b.x = TABLE.x2 - r; b.vx = -b.vx * 0.85; }
      if (b.y - r < TABLE.y1) { b.y = TABLE.y1 + r; b.vy = -b.vy * 0.85; }
      if (b.y + r > TABLE.y2) { b.y = TABLE.y2 - r; b.vy = -b.vy * 0.85; }

      // Check pockets
      POCKETS.forEach(function (p) {
        var dx = b.x - p.x;
        var dy = b.y - p.y;
        if (Math.sqrt(dx * dx + dy * dy) < p.r) {
          b.potted = true;
          b.vx = 0;
          b.vy = 0;
          playPocketSound();

          if (b.id === 0) {
            // White cue ball scratch -> respawn
            setTimeout(function () {
              b.x = 90;
              b.y = 130;
              b.vx = 0;
              b.vy = 0;
              b.potted = false;
            }, 600);
          } else if (b.id === 8) {
            // 8-Ball sunk!
            var remain = balls.filter(function (ob) { return ob.id > 0 && ob.id !== 8 && !ob.potted; }).length;
            if (remain === 0) {
              win();
            } else {
              scratchLose();
            }
          } else {
            score += 150;
            updateStatsUI();
          }
        }
      });
    });

    // Ball-to-Ball Collisions (Elastic)
    for (var i = 0; i < balls.length; i++) {
      var b1 = balls[i];
      if (b1.potted) continue;

      for (var j = i + 1; j < balls.length; j++) {
        var b2 = balls[j];
        if (b2.potted) continue;

        var dx = b2.x - b1.x;
        var dy = b2.y - b1.y;
        var dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < BALL_RADIUS * 2) {
          // Normal collision
          var nx = dx / (dist || 1);
          var ny = dy / (dist || 1);

          // Separate overlap
          var overlap = (BALL_RADIUS * 2 - dist) / 2;
          b1.x -= nx * overlap;
          b1.y -= ny * overlap;
          b2.x += nx * overlap;
          b2.y += ny * overlap;

          // Velocities along normal
          var kx = b1.vx - b2.vx;
          var ky = b1.vy - b2.vy;
          var p = 2 * (nx * kx + ny * ky) / 2;

          b1.vx -= p * nx;
          b1.vy -= p * ny;
          b2.vx += p * nx;
          b2.vy += p * ny;

          var relSpeed = Math.sqrt(kx * kx + ky * ky);
          playClackSound(relSpeed);
        }
      }
    }
  }

  function win() {
    isGameOver = true;
    playWinSound();
    modalTitleEl.textContent = '🎱 黑八完美收官！大获全胜！';
    modalDescEl.textContent = '总共出杆 ' + shots + ' 次，斩获高分 ' + (score + 500) + ' 分！';
    modalEl.classList.add('active');
  }

  function scratchLose() {
    isGameOver = true;
    playTone(180, 0.4, 'sawtooth', 0.25);
    modalTitleEl.textContent = '犯规！提前击落黑八！';
    modalDescEl.textContent = '必须先清空其他目标球才能打黑八！请重振旗鼓。';
    modalEl.classList.add('active');
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Green Baize Cloth
    ctx.fillStyle = '#047857';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Head string line & baulk
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(90, TABLE.y1);
    ctx.lineTo(90, TABLE.y2);
    ctx.stroke();

    // 6 Pockets (Black holes)
    POCKETS.forEach(function (p) {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Cushions Borders
    ctx.strokeStyle = '#065f46';
    ctx.lineWidth = 3;
    ctx.strokeRect(TABLE.x1, TABLE.y1, TABLE.x2 - TABLE.x1, TABLE.y2 - TABLE.y1);

    // Aim Trajectory Line & Cue Stick
    var cue = balls[0];
    if (isAiming && !cue.potted && !areBallsMoving()) {
      var dirX = Math.cos(aimAngle);
      var dirY = Math.sin(aimAngle);

      // White aiming guide line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cue.x, cue.y);
      ctx.lineTo(cue.x + dirX * 120, cue.y + dirY * 120);
      ctx.stroke();
      ctx.setLineDash([]);

      // Cue Stick (drawn behind white ball along backward vector)
      var stickDist = 18 + aimPower * 35;
      var stickStartX = cue.x - dirX * stickDist;
      var stickStartY = cue.y - dirY * stickDist;
      var stickEndX = cue.x - dirX * (stickDist + 110);
      var stickEndY = cue.y - dirY * (stickDist + 110);

      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(stickStartX, stickStartY);
      ctx.lineTo(stickEndX, stickEndY);
      ctx.stroke();

      // Cue tip
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(stickStartX, stickStartY);
      ctx.lineTo(stickStartX - dirX * 6, stickStartY - dirY * 6);
      ctx.stroke();
    }

    // Draw Balls
    balls.forEach(function (b) {
      if (b.potted) return;

      // Ball shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.arc(b.x + 2, b.y + 2, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Ball body
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Ball number circle for 8-ball
      if (b.id === 8) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 5px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('8', b.x, b.y);
      } else {
        // Specular highlight shine
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(b.x - 2, b.y - 2, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function loop() {
    updatePhysics();
    render();
    requestAnimationFrame(loop);
  }

  // Pointer interactions for Cue Stick
  function getCanvasPos(e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (isGameOver || areBallsMoving()) return;
    initAudio();
    var pos = getCanvasPos(e);
    var cue = balls[0];

    // Check if clicked near cue ball or anywhere to aim
    var dx = pos.x - cue.x;
    var dy = pos.y - cue.y;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 45) {
      isAiming = true;
      aimStartX = pos.x;
      aimStartY = pos.y;
      overlayHintEl.style.display = 'none';
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!isAiming) return;
    var pos = getCanvasPos(e);
    var cue = balls[0];

    var dx = cue.x - pos.x;
    var dy = cue.y - pos.y;
    var dist = Math.sqrt(dx * dx + dy * dy);

    aimAngle = Math.atan2(pos.y - cue.y, pos.x - cue.x) + Math.PI;
    aimPower = Math.min(1.0, Math.max(0.05, dist / 90));
    updateStatsUI();
  });

  canvas.addEventListener('pointerup', function (e) {
    if (!isAiming) return;
    isAiming = false;

    if (aimPower > 0.08) {
      var cue = balls[0];
      var maxSpeed = 13.5;
      cue.vx = Math.cos(aimAngle) * aimPower * maxSpeed;
      cue.vy = Math.sin(aimAngle) * aimPower * maxSpeed;

      shots++;
      playStrikeSound(aimPower);
      aimPower = 0;
      updateStatsUI();
    }
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
