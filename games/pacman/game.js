/*
 * games/pacman/game.js
 * 经典吃豆人 (Pac-Man)
 *
 * Full-featured arcade Pac-Man:
 * - 19x21 classic maze with wrap tunnels and ghost house
 * - 4 distinct AI ghosts (Blinky, Pinky, Inky, Clyde)
 * - Frightened blue ghost eating mode with point multipliers
 * - Smooth corner buffering & animated Pac-Man chomp
 * - Web Audio sound synthesis
 */
(function () {
  'use strict';

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('scoreVal');
  var bestEl = document.getElementById('bestVal');
  var livesIcons = document.getElementById('livesIcons');
  var soundBtn = document.getElementById('soundBtn');
  var restartBtn = document.getElementById('restartBtn');
  var modal = document.getElementById('modalOverlay');
  var modalTitle = document.getElementById('modalTitle');
  var modalEmoji = document.getElementById('modalEmoji');
  var finalScoreEl = document.getElementById('finalScore');
  var finalBestEl = document.getElementById('finalBest');
  var playAgainBtn = document.getElementById('playAgainBtn');

  var LOGICAL_W = 380;
  var LOGICAL_H = 440;
  var COLS = 19;
  var ROWS = 21;
  var CELL_SIZE = Math.floor(LOGICAL_W / COLS); // 20px

  var dpr = window.devicePixelRatio || 1;
  function setupDpr() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(LOGICAL_W * dpr);
    canvas.height = Math.round(LOGICAL_H * dpr);
  }
  setupDpr();
  window.addEventListener('resize', setupDpr);

  // ---- Audio Engine (Web Audio API) -----------------------------------------
  var audioCtx = null;
  var soundEnabled = true;

  function initAudio() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      var AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function () {});
    }
  }

  var wakaToggle = false;
  function playSound(type) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;

    var now = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'munch') {
      wakaToggle = !wakaToggle;
      osc.type = 'triangle';
      var f = wakaToggle ? 320 : 440;
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'energizer') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === 'eatghost') {
      [587, 880, 1174].forEach(function (freq, i) {
        var o = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(freq, now + i * 0.06);
        g.gain.setValueAtTime(0.15, now + i * 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.12);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(now + i * 0.06);
        o.stop(now + i * 0.06 + 0.12);
      });
    } else if (type === 'death') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.linearRampToValueAtTime(80, now + 0.4);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  }

  try {
    var storedSound = localStorage.getItem('omg:pacman:sound');
    if (storedSound !== null) soundEnabled = storedSound === '1';
  } catch (e) {}
  soundBtn.textContent = soundEnabled ? '🔊' : '🔇';

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
    try {
      localStorage.setItem('omg:pacman:sound', soundEnabled ? '1' : '0');
    } catch (e) {}
  });

  // ---- High Score Persistence -----------------------------------------------
  var bestScore = 0;
  function loadBestScore() {
    if (window.GameStore && typeof window.GameStore.getBest === 'function') {
      window.GameStore.getBest('pacman').then(function (val) {
        bestScore = val || 0;
        bestEl.textContent = bestScore;
      });
    } else {
      try {
        bestScore = parseInt(localStorage.getItem('omg:best:pacman') || '0', 10);
        bestEl.textContent = bestScore;
      } catch (e) {}
    }
  }

  function saveBestScore(sc) {
    if (sc > bestScore) {
      bestScore = sc;
      bestEl.textContent = bestScore;
      if (window.GameStore && typeof window.GameStore.saveBest === 'function') {
        window.GameStore.saveBest('pacman', bestScore);
      } else {
        try {
          localStorage.setItem('omg:best:pacman', String(bestScore));
        } catch (e) {}
      }
    }
  }

  // ---- Maze Definition (19 cols x 21 rows) ----------------------------------
  // 1 = Wall, 2 = Pellet, 3 = Energizer, 0 = Empty, 9 = Ghost Gate
  var BASE_MAZE = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,3,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,3,1],
    [1,2,1,1,2,1,1,1,2,1,2,1,1,1,2,1,1,2,1],
    [1,2,1,1,2,1,1,1,2,1,2,1,1,1,2,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,2,1,2,1,1,1,1,1,2,1,2,1,1,2,1],
    [1,2,2,2,2,1,2,2,2,1,2,2,2,1,2,2,2,2,1],
    [1,1,1,1,2,1,1,1,0,1,0,1,1,1,2,1,1,1,1],
    [0,0,0,1,2,1,0,0,0,0,0,0,0,1,2,1,0,0,0],
    [1,1,1,1,2,1,0,1,9,9,9,1,0,1,2,1,1,1,1],
    [0,0,0,0,2,0,0,1,0,0,0,1,0,0,2,0,0,0,0], // Wrap tunnel row
    [1,1,1,1,2,1,0,1,1,1,1,1,0,1,2,1,1,1,1],
    [0,0,0,1,2,1,0,0,0,0,0,0,0,1,2,1,0,0,0],
    [1,1,1,1,2,1,2,1,1,1,1,1,2,1,2,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,2,1,1,1,2,1,2,1,1,1,2,1,1,2,1],
    [1,3,2,1,2,2,2,2,2,0,2,2,2,2,2,1,2,3,1],
    [1,1,2,1,2,1,2,1,1,1,1,1,2,1,2,1,2,1,1],
    [1,2,2,2,2,1,2,2,2,1,2,2,2,1,2,2,2,2,1],
    [1,2,1,1,1,1,1,1,2,1,2,1,1,1,1,1,1,2,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
  ];

  var maze = [];
  var totalPellets = 0;
  var pelletsLeft = 0;

  function cloneMaze() {
    maze = [];
    totalPellets = 0;
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) {
        var v = BASE_MAZE[r][c];
        if (v === 2 || v === 3) totalPellets++;
        row.push(v);
      }
      maze.push(row);
    }
    pelletsLeft = totalPellets;
  }

  // ---- Game State & Characters ----------------------------------------------
  var score = 0;
  var lives = 3;
  var isGameOver = false;
  var frightenedTimer = 0;
  var ghostsEatenInStreak = 0;

  var pacman = {
    x: 9 * CELL_SIZE + CELL_SIZE / 2,
    y: 16 * CELL_SIZE + CELL_SIZE / 2,
    r: CELL_SIZE * 0.44,
    dir: 'left',
    nextDir: 'left',
    speed: 2.2,
    mouthAngle: 0.2,
    mouthDir: 1
  };

  var GHOST_CONFIGS = [
    { name: 'blinky', color: '#ef4444', homeCol: 9, homeRow: 8, scatterC: 17, scatterR: 1 },
    { name: 'pinky', color: '#f472b6', homeCol: 9, homeRow: 10, scatterC: 1, scatterR: 1 },
    { name: 'inky', color: '#38bdf8', homeCol: 8, homeRow: 10, scatterC: 17, scatterR: 19 },
    { name: 'clyde', color: '#fb923c', homeCol: 10, homeRow: 10, scatterC: 1, scatterR: 19 }
  ];

  var ghosts = [];

  function initGhosts() {
    ghosts = [];
    for (var i = 0; i < GHOST_CONFIGS.length; i++) {
      var cfg = GHOST_CONFIGS[i];
      ghosts.push({
        id: cfg.name,
        color: cfg.color,
        x: cfg.homeCol * CELL_SIZE + CELL_SIZE / 2,
        y: cfg.homeRow * CELL_SIZE + CELL_SIZE / 2,
        dir: 'up',
        speed: 1.8,
        mode: 'chase', // chase | frightened | eaten
        homeC: cfg.homeCol,
        homeR: cfg.homeRow,
        scatterC: cfg.scatterC,
        scatterR: cfg.scatterR
      });
    }
  }

  function updateLivesUI() {
    var hearts = '';
    for (var i = 0; i < lives; i++) hearts += '💛';
    livesIcons.textContent = hearts || '💀';
  }

  function resetPositions() {
    pacman.x = 9 * CELL_SIZE + CELL_SIZE / 2;
    pacman.y = 16 * CELL_SIZE + CELL_SIZE / 2;
    pacman.dir = 'left';
    pacman.nextDir = 'left';
    initGhosts();
  }

  function resetGame() {
    score = 0;
    lives = 3;
    isGameOver = false;
    frightenedTimer = 0;
    ghostsEatenInStreak = 0;
    scoreEl.textContent = '0';
    updateLivesUI();
    cloneMaze();
    resetPositions();
    modal.classList.add('hidden');
  }

  // ---- Direction & Movement Helpers -----------------------------------------
  var DIRS = {
    left: { dx: -1, dy: 0, opp: 'right' },
    right: { dx: 1, dy: 0, opp: 'left' },
    up: { dx: 0, dy: -1, opp: 'down' },
    down: { dx: 0, dy: 1, opp: 'up' }
  };

  function canMoveTo(c, r, allowGate) {
    if (r === 10 && (c < 0 || c >= COLS)) return true; // tunnel
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    var cell = maze[r][c];
    if (cell === 1) return false;
    if (cell === 9 && !allowGate) return false;
    return true;
  }

  function updatePacman() {
    // Animate mouth
    pacman.mouthAngle += 0.045 * pacman.mouthDir;
    if (pacman.mouthAngle > 0.45) pacman.mouthDir = -1;
    else if (pacman.mouthAngle < 0.02) pacman.mouthDir = 1;

    // Check buffered turn
    if (pacman.nextDir !== pacman.dir) {
      var testC = Math.floor(pacman.x / CELL_SIZE);
      var testR = Math.floor(pacman.y / CELL_SIZE);
      var nd = DIRS[pacman.nextDir];
      // Can turn if aligned with grid or reversing
      var isOpp = (nd.opp === pacman.dir);
      var alignX = Math.abs(pacman.x - (testC * CELL_SIZE + CELL_SIZE / 2)) < 3.5;
      var alignY = Math.abs(pacman.y - (testR * CELL_SIZE + CELL_SIZE / 2)) < 3.5;

      if (isOpp || ((alignX || nd.dy === 0) && (alignY || nd.dx === 0) && canMoveTo(testC + nd.dx, testR + nd.dy, false))) {
        pacman.dir = pacman.nextDir;
        if (!isOpp) {
          pacman.x = testC * CELL_SIZE + CELL_SIZE / 2;
          pacman.y = testR * CELL_SIZE + CELL_SIZE / 2;
        }
      }
    }

    // Move forward
    var curD = DIRS[pacman.dir];
    var currentC = Math.floor(pacman.x / CELL_SIZE);
    var currentR = Math.floor(pacman.y / CELL_SIZE);

    // Tunnel wrap
    if (currentR === 10) {
      if (pacman.x < 0) pacman.x = LOGICAL_W;
      else if (pacman.x > LOGICAL_W) pacman.x = 0;
    }

    var nextC = currentC + curD.dx;
    var nextR = currentR + curD.dy;

    var targetCenterC = currentC * CELL_SIZE + CELL_SIZE / 2;
    var targetCenterR = currentR * CELL_SIZE + CELL_SIZE / 2;

    if (!canMoveTo(nextC, nextR, false)) {
      // Heading into wall: clamp to center
      if (curD.dx > 0 && pacman.x >= targetCenterC) pacman.x = targetCenterC;
      else if (curD.dx < 0 && pacman.x <= targetCenterC) pacman.x = targetCenterC;
      else if (curD.dy > 0 && pacman.y >= targetCenterR) pacman.y = targetCenterR;
      else if (curD.dy < 0 && pacman.y <= targetCenterR) pacman.y = targetCenterR;
      else {
        pacman.x += curD.dx * pacman.speed;
        pacman.y += curD.dy * pacman.speed;
      }
    } else {
      pacman.x += curD.dx * pacman.speed;
      pacman.y += curD.dy * pacman.speed;
    }

    // Eat pellets
    var pCol = Math.floor(pacman.x / CELL_SIZE);
    var pRow = Math.floor(pacman.y / CELL_SIZE);
    if (pRow >= 0 && pRow < ROWS && pCol >= 0 && pCol < COLS) {
      if (maze[pRow][pCol] === 2) {
        maze[pRow][pCol] = 0;
        pelletsLeft--;
        score += 10;
        scoreEl.textContent = score;
        saveBestScore(score);
        playSound('munch');
      } else if (maze[pRow][pCol] === 3) {
        maze[pRow][pCol] = 0;
        pelletsLeft--;
        score += 50;
        scoreEl.textContent = score;
        saveBestScore(score);
        frightenedTimer = 480; // ~8 seconds
        ghostsEatenInStreak = 0;
        playSound('energizer');
        for (var g = 0; g < ghosts.length; g++) {
          if (ghosts[g].mode !== 'eaten') {
            ghosts[g].mode = 'frightened';
            // Reverse ghost direction
            ghosts[g].dir = DIRS[ghosts[g].dir].opp;
          }
        }
      }

      // Check level clear
      if (pelletsLeft <= 0) {
        triggerWin();
      }
    }
  }

  // ---- Ghost AI & Movement --------------------------------------------------
  function updateGhosts() {
    if (frightenedTimer > 0) frightenedTimer--;

    for (var i = 0; i < ghosts.length; i++) {
      var gh = ghosts[i];
      var gCol = Math.floor(gh.x / CELL_SIZE);
      var gRow = Math.floor(gh.y / CELL_SIZE);

      // Tunnel wrap
      if (gRow === 10) {
        if (gh.x < 0) gh.x = LOGICAL_W;
        else if (gh.x > LOGICAL_W) gh.x = 0;
      }

      // If eaten ghost returned home
      if (gh.mode === 'eaten') {
        if (Math.abs(gh.x - (gh.homeC * CELL_SIZE + CELL_SIZE / 2)) < 6 &&
            Math.abs(gh.y - (gh.homeR * CELL_SIZE + CELL_SIZE / 2)) < 6) {
          gh.mode = 'chase';
        }
      } else if (frightenedTimer === 0 && gh.mode === 'frightened') {
        gh.mode = 'chase';
      }

      // Grid-aligned intersection decision
      var centerX = gCol * CELL_SIZE + CELL_SIZE / 2;
      var centerY = gRow * CELL_SIZE + CELL_SIZE / 2;
      var atIntersection = Math.abs(gh.x - centerX) < 1.8 && Math.abs(gh.y - centerY) < 1.8;

      if (atIntersection) {
        gh.x = centerX;
        gh.y = centerY;

        // Determine target cell
        var targetC = 9, targetR = 10;
        if (gh.mode === 'eaten') {
          targetC = gh.homeC;
          targetR = gh.homeR;
        } else if (gh.mode === 'frightened') {
          // Random wandering
          targetC = Math.floor(Math.random() * COLS);
          targetR = Math.floor(Math.random() * ROWS);
        } else {
          // Chase mode target
          var pCol = Math.floor(pacman.x / CELL_SIZE);
          var pRow = Math.floor(pacman.y / CELL_SIZE);
          if (gh.id === 'blinky') {
            targetC = pCol;
            targetR = pRow;
          } else if (gh.id === 'pinky') {
            var pd = DIRS[pacman.dir];
            targetC = pCol + pd.dx * 4;
            targetR = pRow + pd.dy * 4;
          } else if (gh.id === 'inky') {
            targetC = pCol;
            targetR = pRow;
          } else { // clyde
            var distP = Math.hypot(gCol - pCol, gRow - pRow);
            if (distP > 7) { targetC = pCol; targetR = pRow; }
            else { targetC = gh.scatterC; targetR = gh.scatterR; }
          }
        }

        // Evaluate valid moves (cannot reverse 180 deg)
        var validDirs = [];
        var allowGate = (gh.mode === 'eaten' || gRow >= 8 && gRow <= 10);
        ['up', 'left', 'down', 'right'].forEach(function (d) {
          if (d === DIRS[gh.dir].opp) return; // no 180 reverse
          var nd = DIRS[d];
          if (canMoveTo(gCol + nd.dx, gRow + nd.dy, allowGate)) {
            validDirs.push(d);
          }
        });

        if (validDirs.length === 0) {
          validDirs.push(DIRS[gh.dir].opp);
        }

        // Pick direction closest to target
        var bestDir = validDirs[0];
        var bestDist = Infinity;
        for (var v = 0; v < validDirs.length; v++) {
          var testD = validDirs[v];
          var nextGC = gCol + DIRS[testD].dx;
          var nextGR = gRow + DIRS[testD].dy;
          var dSq = (nextGC - targetC) * (nextGC - targetC) + (nextGR - targetR) * (nextGR - targetR);
          if (dSq < bestDist) {
            bestDist = dSq;
            bestDir = testD;
          }
        }
        gh.dir = bestDir;
      }

      // Move ghost
      var gSpd = gh.speed;
      if (gh.mode === 'frightened') gSpd = 1.2;
      else if (gh.mode === 'eaten') gSpd = 3.6;

      var gd = DIRS[gh.dir];
      gh.x += gd.dx * gSpd;
      gh.y += gd.dy * gSpd;

      // Check collision with Pac-Man
      var distToPac = Math.hypot(gh.x - pacman.x, gh.y - pacman.y);
      if (distToPac < CELL_SIZE * 0.75) {
        if (gh.mode === 'frightened') {
          // Eat Ghost!
          gh.mode = 'eaten';
          ghostsEatenInStreak++;
          var pts = 200 * Math.pow(2, ghostsEatenInStreak - 1);
          score += pts;
          scoreEl.textContent = score;
          saveBestScore(score);
          playSound('eatghost');
        } else if (gh.mode === 'chase') {
          // Pac-Man hit!
          handlePacmanDeath();
          return;
        }
      }
    }
  }

  function handlePacmanDeath() {
    playSound('death');
    lives--;
    updateLivesUI();
    if (lives <= 0) {
      triggerGameOver();
    } else {
      resetPositions();
    }
  }

  function triggerGameOver() {
    isGameOver = true;
    saveBestScore(score);
    finalScoreEl.textContent = score;
    finalBestEl.textContent = bestScore;
    modalTitle.textContent = 'GAME OVER';
    modalEmoji.textContent = '👻';
    modal.classList.remove('hidden');
  }

  function triggerWin() {
    isGameOver = true;
    playSound('energizer');
    saveBestScore(score);
    finalScoreEl.textContent = score;
    finalBestEl.textContent = bestScore;
    modalTitle.textContent = '🎉 全清通关！';
    modalEmoji.textContent = '🟡';
    modal.classList.remove('hidden');
  }

  // ---- Controls -------------------------------------------------------------
  window.addEventListener('keydown', function (e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); pacman.nextDir = 'left'; }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); pacman.nextDir = 'right'; }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); pacman.nextDir = 'up'; }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); pacman.nextDir = 'down'; }
    else if (e.code === 'Space' && isGameOver) resetGame();
    else if (e.code === 'Enter' && isGameOver) resetGame();
  });

  document.querySelectorAll('.dpad-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var dir = btn.dataset.dir;
      if (dir) pacman.nextDir = dir;
    });
  });

  restartBtn.addEventListener('click', resetGame);
  playAgainBtn.addEventListener('click', resetGame);

  // ---- Rendering ------------------------------------------------------------
  function drawMaze() {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var cell = maze[r][c];
        var x = c * CELL_SIZE;
        var y = r * CELL_SIZE;

        if (cell === 1) {
          // Neon Blue Wall
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
          ctx.strokeStyle = '#2563eb';
          ctx.lineWidth = 1.8;
          ctx.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        } else if (cell === 9) {
          // Ghost Gate
          ctx.strokeStyle = '#f472b6';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x, y + CELL_SIZE / 2);
          ctx.lineTo(x + CELL_SIZE, y + CELL_SIZE / 2);
          ctx.stroke();
        } else if (cell === 2) {
          // Normal Pellet
          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          ctx.arc(x + CELL_SIZE / 2, y + CELL_SIZE / 2, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (cell === 3) {
          // Flashing Energizer
          var pulse = (Math.sin(Date.now() / 120) + 1) / 2;
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.arc(x + CELL_SIZE / 2, y + CELL_SIZE / 2, 5 + pulse * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawPacman() {
    ctx.save();
    ctx.translate(pacman.x, pacman.y);

    var rot = 0;
    if (pacman.dir === 'right') rot = 0;
    else if (pacman.dir === 'down') rot = Math.PI / 2;
    else if (pacman.dir === 'left') rot = Math.PI;
    else if (pacman.dir === 'up') rot = -Math.PI / 2;
    ctx.rotate(rot);

    var openAngle = pacman.mouthAngle;
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(0, 0, pacman.r, openAngle * Math.PI, (2 - openAngle) * Math.PI);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.restore();
  }

  function drawGhost(gh) {
    var x = gh.x;
    var y = gh.y;
    var r = CELL_SIZE * 0.44;

    ctx.save();
    ctx.translate(x, y);

    if (gh.mode === 'eaten') {
      // Only draw eyes racing back
      drawGhostEyes(gh.dir, r);
      ctx.restore();
      return;
    }

    // Determine Ghost Color
    var bodyColor = gh.color;
    if (gh.mode === 'frightened') {
      var isFlashing = (frightenedTimer < 140 && Math.floor(frightenedTimer / 15) % 2 === 1);
      bodyColor = isFlashing ? '#ffffff' : '#1d4ed8';
    }

    // Ghost Dome Head
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(0, -r * 0.2, r, Math.PI, 0);
    ctx.lineTo(r, r * 0.9);

    // Wavy skirt feet
    var wave = Math.sin(Date.now() / 100) > 0 ? 0 : 2;
    ctx.lineTo(r * 0.5, r * 0.6 + wave);
    ctx.lineTo(0, r * 0.9);
    ctx.lineTo(-r * 0.5, r * 0.6 + wave);
    ctx.lineTo(-r, r * 0.9);
    ctx.closePath();
    ctx.fill();

    // Eyes
    if (gh.mode === 'frightened') {
      // Scared tiny eyes & squiggly mouth
      ctx.fillStyle = '#facc15';
      ctx.fillRect(-5, -4, 3, 3);
      ctx.fillRect(2, -4, 3, 3);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-6, 3);
      ctx.lineTo(-3, 1);
      ctx.lineTo(0, 3);
      ctx.lineTo(3, 1);
      ctx.lineTo(6, 3);
      ctx.stroke();
    } else {
      drawGhostEyes(gh.dir, r);
    }

    ctx.restore();
  }

  function drawGhostEyes(dir, r) {
    var edx = 0, edy = 0;
    if (dir === 'left') edx = -2.5;
    else if (dir === 'right') edx = 2.5;
    else if (dir === 'up') edy = -2.5;
    else if (dir === 'down') edy = 2.5;

    // Eyeballs
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-4 + edx * 0.5, -3 + edy * 0.5, 3.8, 0, Math.PI * 2);
    ctx.arc(4 + edx * 0.5, -3 + edy * 0.5, 3.8, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = '#1e3a8a';
    ctx.beginPath();
    ctx.arc(-4 + edx, -3 + edy, 2, 0, Math.PI * 2);
    ctx.arc(4 + edx, -3 + edy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function render() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

    // 1. Maze Walls & Pellets
    drawMaze();

    // 2. Ghosts
    for (var g = 0; g < ghosts.length; g++) {
      drawGhost(ghosts[g]);
    }

    // 3. Pacman
    drawPacman();

    ctx.restore();
  }

  // ---- Main Loop ------------------------------------------------------------
  function loop() {
    if (!isGameOver) {
      updatePacman();
      updateGhosts();
    }
    render();
    requestAnimationFrame(loop);
  }

  // ---- Bootstrap ------------------------------------------------------------
  loadBestScore();
  resetGame();
  requestAnimationFrame(loop);
})();
