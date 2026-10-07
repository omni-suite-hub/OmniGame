(function () {
  'use strict';

  var STORAGE_KEY = 'omg:save:bubble-shooter';

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');

  var scoreText = document.getElementById('scoreText');
  var foulDots = document.getElementById('foulDots');
  var soundBtn = document.getElementById('soundBtn');
  var restartBtn = document.getElementById('restartBtn');

  var modal = document.getElementById('bsModal');
  var modalEmoji = document.getElementById('modalEmoji');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  // Constants
  var WIDTH = 360;
  var HEIGHT = 480;
  var RADIUS = 18;
  var ROW_HEIGHT = Math.round(RADIUS * Math.sqrt(3)); // ~31px
  var COLS_EVEN = 10;
  var COLS_ODD = 9;
  var MAX_ROWS = 14;
  var DANGER_Y = 410;
  var SHOOTER_X = WIDTH / 2;
  var SHOOTER_Y = HEIGHT - 36;
  var BUBBLE_SPEED = 14;

  var COLORS = [
    { id: 1, name: 'red', light: '#fda4af', main: '#f43f5e', dark: '#9f1239' },
    { id: 2, name: 'green', light: '#6ee7b7', main: '#10b981', dark: '#065f46' },
    { id: 3, name: 'blue', light: '#93c5fd', main: '#3b82f6', dark: '#1e40af' },
    { id: 4, name: 'yellow', light: '#fde047', main: '#eab308', dark: '#854d0e' },
    { id: 5, name: 'purple', light: '#d8b4fe', main: '#a855f7', dark: '#6b21a8' }
  ];

  // Game state
  var grid = []; // 2D array of color IDs (0 = empty)
  var currentBubble = 1;
  var nextBubble = 2;
  var shootingBubble = null; // { x, y, vx, vy, color }
  var aimAngle = -Math.PI / 2; // radians pointing up
  var score = 0;
  var foulCount = 5;
  var isGameOver = false;
  var soundEnabled = true;
  var particles = [];
  var fallingBubbles = []; // detached floating bubbles dropping
  var animationId = null;

  // Web Audio Synth
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

  function playSound(type, extra) {
    if (!soundEnabled) return;
    var ctxAudio = getAudioCtx();
    if (!ctxAudio) return;
    var t = ctxAudio.currentTime;

    if (type === 'shoot') {
      var osc = ctxAudio.createOscillator();
      var gain = ctxAudio.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.exponentialRampToValueAtTime(700, t + 0.08);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
      osc.connect(gain);
      gain.connect(ctxAudio.destination);
      osc.start(t);
      osc.stop(t + 0.09);
    } else if (type === 'bounce') {
      var osc = ctxAudio.createOscillator();
      var gain = ctxAudio.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(450, t);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.04);
      osc.connect(gain);
      gain.connect(ctxAudio.destination);
      osc.start(t);
      osc.stop(t + 0.05);
    } else if (type === 'snap') {
      var osc = ctxAudio.createOscillator();
      var gain = ctxAudio.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, t);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
      osc.connect(gain);
      gain.connect(ctxAudio.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    } else if (type === 'pop') {
      var baseFreq = 400 + (extra || 0) * 60;
      var osc = ctxAudio.createOscillator();
      var gain = ctxAudio.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, t + 0.07);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.07);
      osc.connect(gain);
      gain.connect(ctxAudio.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    } else if (type === 'drop') {
      var osc = ctxAudio.createOscillator();
      var gain = ctxAudio.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(200, t + 0.15);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
      osc.connect(gain);
      gain.connect(ctxAudio.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (freq, i) {
        var osc = ctxAudio.createOscillator();
        var gain = ctxAudio.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + i * 0.1);
        gain.gain.setValueAtTime(0.3, t + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.1 + 0.2);
        osc.connect(gain);
        gain.connect(ctxAudio.destination);
        osc.start(t + i * 0.1);
        osc.stop(t + i * 0.1 + 0.22);
      });
    } else if (type === 'gameover') {
      [300, 240, 180, 120].forEach(function (freq, i) {
        var osc = ctxAudio.createOscillator();
        var gain = ctxAudio.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t + i * 0.12);
        gain.gain.setValueAtTime(0.25, t + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.12 + 0.15);
        osc.connect(gain);
        gain.connect(ctxAudio.destination);
        osc.start(t + i * 0.12);
        osc.stop(t + i * 0.12 + 0.18);
      });
    }
  }

  // Bubble coordinates
  function getBubbleCenter(r, c) {
    var isOdd = (r % 2 === 1);
    var x = isOdd ? (RADIUS * 2 + c * RADIUS * 2) : (RADIUS + c * RADIUS * 2);
    var y = RADIUS + r * ROW_HEIGHT;
    return { x: x, y: y };
  }

  function getAvailableColors() {
    var activeSet = {};
    for (var r = 0; r < grid.length; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        if (grid[r][c] > 0) activeSet[grid[r][c]] = true;
      }
    }
    var activeIds = Object.keys(activeSet).map(Number);
    return activeIds.length > 0 ? activeIds : [1, 2, 3, 4, 5];
  }

  function getRandomColor() {
    var avail = getAvailableColors();
    return avail[Math.floor(Math.random() * avail.length)];
  }

  // Initialize Board
  function initGame() {
    grid = [];
    var initialRows = 5;
    for (var r = 0; r < MAX_ROWS; r++) {
      var isOdd = (r % 2 === 1);
      var cols = isOdd ? COLS_ODD : COLS_EVEN;
      var row = [];
      for (var c = 0; c < cols; c++) {
        if (r < initialRows) {
          row.push(Math.floor(Math.random() * 5) + 1);
        } else {
          row.push(0);
        }
      }
      grid.push(row);
    }

    score = 0;
    foulCount = 5;
    isGameOver = false;
    shootingBubble = null;
    particles = [];
    fallingBubbles = [];
    currentBubble = getRandomColor();
    nextBubble = getRandomColor();

    updateStatusUI();
    hideModal();
    saveState();
  }

  function updateStatusUI() {
    scoreText.textContent = score.toLocaleString();
    var dots = '';
    for (var i = 0; i < 5; i++) {
      dots += (i < foulCount) ? '●' : '○';
    }
    foulDots.textContent = dots;
  }

  // Find Neighbors in hexagonal grid
  function getNeighbors(r, c) {
    var isOdd = (r % 2 === 1);
    var deltas = isOdd ? [
      { dr: -1, dc: 0 }, { dr: -1, dc: 1 },
      { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
      { dr: 1, dc: 0 },  { dr: 1, dc: 1 }
    ] : [
      { dr: -1, dc: -1 }, { dr: -1, dc: 0 },
      { dr: 0, dc: -1 },  { dr: 0, dc: 1 },
      { dr: 1, dc: -1 },  { dr: 1, dc: 0 }
    ];

    var neighbors = [];
    deltas.forEach(function (d) {
      var nr = r + d.dr;
      var nc = c + d.dc;
      if (nr >= 0 && nr < MAX_ROWS) {
        var cols = (nr % 2 === 1) ? COLS_ODD : COLS_EVEN;
        if (nc >= 0 && nc < cols) {
          neighbors.push({ r: nr, c: nc });
        }
      }
    });
    return neighbors;
  }

  // Shoot bubble
  function shootBubble() {
    if (shootingBubble || isGameOver) return;

    var vx = Math.cos(aimAngle) * BUBBLE_SPEED;
    var vy = Math.sin(aimAngle) * BUBBLE_SPEED;

    shootingBubble = {
      x: SHOOTER_X,
      y: SHOOTER_Y,
      vx: vx,
      vy: vy,
      color: currentBubble
    };

    playSound('shoot');
    currentBubble = nextBubble;
    nextBubble = getRandomColor();
  }

  // Check collision between flying bubble and grid
  function checkCollision(b) {
    // Ceiling collision
    if (b.y <= RADIUS) {
      return snapToGrid(b);
    }

    // Check against every occupied bubble
    for (var r = 0; r < MAX_ROWS; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        if (grid[r][c] > 0) {
          var center = getBubbleCenter(r, c);
          var dist = Math.hypot(b.x - center.x, b.y - center.y);
          if (dist <= RADIUS * 1.85) {
            return snapToGrid(b);
          }
        }
      }
    }
    return false;
  }

  // Snap bubble to nearest valid empty slot
  function snapToGrid(b) {
    var bestDist = Infinity;
    var bestR = -1;
    var bestC = -1;

    for (var r = 0; r < MAX_ROWS; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        if (grid[r][c] === 0) {
          var center = getBubbleCenter(r, c);
          var dist = Math.hypot(b.x - center.x, b.y - center.y);
          if (dist < bestDist) {
            bestDist = dist;
            bestR = r;
            bestC = c;
          }
        }
      }
    }

    if (bestR !== -1 && bestC !== -1) {
      grid[bestR][bestC] = b.color;
      shootingBubble = null;
      playSound('snap');
      resolveLanding(bestR, bestC, b.color);
      return true;
    }

    return false;
  }

  // Resolve match-3 popping and detached floating cluster dropping
  function resolveLanding(startR, startC, targetColor) {
    // BFS for connected same color
    var queue = [{ r: startR, c: startC }];
    var visited = {};
    visited[startR + ',' + startC] = true;
    var matched = [{ r: startR, c: startC }];

    while (queue.length > 0) {
      var curr = queue.shift();
      var nbrs = getNeighbors(curr.r, curr.c);
      for (var i = 0; i < nbrs.length; i++) {
        var n = nbrs[i];
        var key = n.r + ',' + n.c;
        if (!visited[key] && grid[n.r][n.c] === targetColor) {
          visited[key] = true;
          matched.push(n);
          queue.push(n);
        }
      }
    }

    if (matched.length >= 3) {
      // Pop matching bubbles
      matched.forEach(function (m, idx) {
        var pt = getBubbleCenter(m.r, m.c);
        spawnPopParticles(pt.x, pt.y, targetColor);
        grid[m.r][m.c] = 0;
        setTimeout(function () {
          playSound('pop', idx);
        }, idx * 30);
      });

      var popScore = matched.length * 10 * (matched.length - 1);
      score += popScore;

      // Drop detached floating bubbles
      dropFloatingBubbles();
    } else {
      // Foul! Count down fouls
      foulCount--;
      if (foulCount <= 0) {
        foulCount = 5;
        dropCeiling();
      }
    }

    updateStatusUI();
    checkGameOver();
    saveState();
  }

  // Drop ceiling down by 1 row
  function dropCeiling() {
    var newRow = [];
    var cols = COLS_EVEN;
    for (var c = 0; c < cols; c++) {
      newRow.push(Math.floor(Math.random() * 5) + 1);
    }

    grid.unshift(newRow);
    if (grid.length > MAX_ROWS) {
      grid.pop();
    }

    playSound('drop');
  }

  // Find bubbles disconnected from ceiling (r === 0)
  function dropFloatingBubbles() {
    var anchored = {};
    var queue = [];

    // All occupied bubbles at row 0 are anchored
    for (var c = 0; c < grid[0].length; c++) {
      if (grid[0][c] > 0) {
        var key = '0,' + c;
        anchored[key] = true;
        queue.push({ r: 0, c: c });
      }
    }

    // Traverse all reachable occupied bubbles
    while (queue.length > 0) {
      var curr = queue.shift();
      var nbrs = getNeighbors(curr.r, curr.c);
      for (var i = 0; i < nbrs.length; i++) {
        var n = nbrs[i];
        var nKey = n.r + ',' + n.c;
        if (!anchored[nKey] && grid[n.r][n.c] > 0) {
          anchored[nKey] = true;
          queue.push(n);
        }
      }
    }

    // Collect all unanchored bubbles
    var droppedCount = 0;
    for (var r = 0; r < MAX_ROWS; r++) {
      for (var col = 0; col < grid[r].length; col++) {
        if (grid[r][col] > 0 && !anchored[r + ',' + col]) {
          var center = getBubbleCenter(r, col);
          fallingBubbles.push({
            x: center.x,
            y: center.y,
            vx: (Math.random() - 0.5) * 4,
            vy: -2 + Math.random() * 2,
            color: grid[r][col]
          });
          grid[r][col] = 0;
          droppedCount++;
        }
      }
    }

    if (droppedCount > 0) {
      score += droppedCount * 50;
      playSound('drop');
    }
  }

  function spawnPopParticles(x, y, colorId) {
    var cInfo = COLORS[colorId - 1] || COLORS[0];
    for (var i = 0; i < 10; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 2 + Math.random() * 4;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 3,
        color: Math.random() > 0.4 ? cInfo.main : cInfo.light,
        alpha: 1,
        life: 1
      });
    }
  }

  // Check victory / game over
  function checkGameOver() {
    var hasBubbles = false;
    var hitDanger = false;

    for (var r = 0; r < MAX_ROWS; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        if (grid[r][c] > 0) {
          hasBubbles = true;
          var pt = getBubbleCenter(r, c);
          if (pt.y + RADIUS >= DANGER_Y) {
            hitDanger = true;
          }
        }
      }
    }

    if (!hasBubbles) {
      // Victory!
      isGameOver = true;
      playSound('win');
      modalEmoji.textContent = '🎉';
      modalTitle.textContent = '全盘清空 · 完美通关！';
      modalDesc.textContent = '最终得分: ' + score.toLocaleString();
      setTimeout(function () { modal.classList.add('show'); }, 600);
    } else if (hitDanger) {
      // Defeat!
      isGameOver = true;
      playSound('gameover');
      modalEmoji.textContent = '💥';
      modalTitle.textContent = '防线失守！';
      modalDesc.textContent = '泡泡触碰到底部防线 · 最终得分: ' + score.toLocaleString();
      setTimeout(function () { modal.classList.add('show'); }, 600);
    }
  }

  function hideModal() {
    modal.classList.remove('show');
  }

  // Drawing routines
  function drawBubble(x, y, colorId, scale) {
    if (!colorId || colorId <= 0) return;
    var cInfo = COLORS[colorId - 1] || COLORS[0];
    var r = RADIUS * (scale || 1);

    ctx.save();
    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;

    // Outer spherical gradient
    var grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    grad.addColorStop(0, cInfo.light);
    grad.addColorStop(0.65, cInfo.main);
    grad.addColorStop(1, cInfo.dark);

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Specular highlight
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x - r * 0.35, y - r * 0.35, r * 0.35, r * 0.2, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.fill();
    ctx.restore();
  }

  // Draw laser aim trajectory with 1 wall bounce
  function drawAimTrajectory() {
    if (shootingBubble || isGameOver) return;

    var curX = SHOOTER_X;
    var curY = SHOOTER_Y;
    var vx = Math.cos(aimAngle);
    var vy = Math.sin(aimAngle);
    var maxDist = 320;
    var step = 8;
    var traveled = 0;

    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';

    while (traveled < maxDist && curY > RADIUS) {
      curX += vx * step;
      curY += vy * step;
      traveled += step;

      // Bounce on side walls
      if (curX <= RADIUS) {
        curX = RADIUS;
        vx = -vx;
      } else if (curX >= WIDTH - RADIUS) {
        curX = WIDTH - RADIUS;
        vx = -vx;
      }

      if (traveled % 16 === 0) {
        ctx.beginPath();
        ctx.arc(curX, curY, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Main Render Loop
  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Danger line
    ctx.save();
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, DANGER_Y);
    ctx.lineTo(WIDTH, DANGER_Y);
    ctx.stroke();
    ctx.restore();

    // Draw grid bubbles
    for (var r = 0; r < MAX_ROWS; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        if (grid[r][c] > 0) {
          var pt = getBubbleCenter(r, c);
          drawBubble(pt.x, pt.y, grid[r][c]);
        }
      }
    }

    // Draw Aim trajectory
    drawAimTrajectory();

    // Update & Draw flying bubble
    if (shootingBubble) {
      shootingBubble.x += shootingBubble.vx;
      shootingBubble.y += shootingBubble.vy;

      // Wall bounce
      if (shootingBubble.x <= RADIUS) {
        shootingBubble.x = RADIUS;
        shootingBubble.vx = -shootingBubble.vx;
        playSound('bounce');
      } else if (shootingBubble.x >= WIDTH - RADIUS) {
        shootingBubble.x = WIDTH - RADIUS;
        shootingBubble.vx = -shootingBubble.vx;
        playSound('bounce');
      }

      drawBubble(shootingBubble.x, shootingBubble.y, shootingBubble.color);
      checkCollision(shootingBubble);
    }

    // Update & Draw falling detached bubbles
    for (var f = fallingBubbles.length - 1; f >= 0; f--) {
      var fb = fallingBubbles[f];
      fb.x += fb.vx;
      fb.y += fb.vy;
      fb.vy += 0.45; // gravity

      drawBubble(fb.x, fb.y, fb.color);
      if (fb.y > HEIGHT + RADIUS) {
        fallingBubbles.splice(f, 1);
      }
    }

    // Update & Draw particles
    for (var p = particles.length - 1; p >= 0; p--) {
      var ptc = particles[p];
      ptc.x += ptc.vx;
      ptc.y += ptc.vy;
      ptc.life -= 0.035;

      if (ptc.life <= 0) {
        particles.splice(p, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = ptc.life;
      ctx.fillStyle = ptc.color;
      ctx.beginPath();
      ctx.arc(ptc.x, ptc.y, ptc.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw Shooter cannon & bubbles
    ctx.save();
    // Shooter base ring
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(SHOOTER_X, SHOOTER_Y, RADIUS + 4, 0, Math.PI * 2);
    ctx.stroke();

    // Current bubble inside cannon
    if (!shootingBubble) {
      drawBubble(SHOOTER_X, SHOOTER_Y, currentBubble);
    }

    // Next bubble preview
    drawBubble(SHOOTER_X - 52, SHOOTER_Y, nextBubble, 0.75);
    ctx.fillStyle = '#64748b';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('下一发', SHOOTER_X - 52, SHOOTER_Y + 22);

    ctx.restore();

    animationId = requestAnimationFrame(render);
  }

  // Aiming input handlers
  function updateAim(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var targetX = (clientX - rect.left) * scaleX;
    var targetY = (clientY - rect.top) * scaleY;

    var dx = targetX - SHOOTER_X;
    var dy = targetY - SHOOTER_Y;
    var angle = Math.atan2(dy, dx);

    // Limit angle to avoid shooting straight down or horizontal
    if (angle > -0.15) angle = -0.15;
    if (angle < -Math.PI + 0.15) angle = -Math.PI + 0.15;

    aimAngle = angle;
  }

  // State save/restore
  function saveState() {
    try {
      var state = {
        grid: grid,
        score: score,
        foulCount: foulCount,
        currentBubble: currentBubble,
        nextBubble: nextBubble,
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
        if (state && Array.isArray(state.grid) && state.grid.length === MAX_ROWS) {
          grid = state.grid;
          score = state.score || 0;
          foulCount = state.foulCount || 5;
          currentBubble = state.currentBubble || 1;
          nextBubble = state.nextBubble || 2;
          isGameOver = !!state.isGameOver;
          updateStatusUI();
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // Event Listeners
  canvas.addEventListener('mousemove', function (e) {
    updateAim(e.clientX, e.clientY);
  });

  canvas.addEventListener('click', function (e) {
    updateAim(e.clientX, e.clientY);
    shootBubble();
  });

  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (e.touches.length > 0) {
      updateAim(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });

  canvas.addEventListener('touchend', function (e) {
    e.preventDefault();
    shootBubble();
  });

  restartBtn.addEventListener('click', initGame);
  modalRestartBtn.addEventListener('click', initGame);

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  // Init
  if (!loadState()) {
    initGame();
  }
  animationId = requestAnimationFrame(render);
})();
