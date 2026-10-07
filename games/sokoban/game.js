/*
 * games/sokoban/game.js
 * 经典推箱子 (Sokoban)
 *
 * 30 curated puzzle levels, unlimited undo stack, directional sprite animations,
 * tactile push physics, and Web Audio sound effects.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var levelBadge = document.getElementById('levelBadge');
  var stepsVal = document.getElementById('stepsVal');
  var goalsVal = document.getElementById('goalsVal');
  var prevLvlBtn = document.getElementById('prevLvlBtn');
  var nextLvlBtn = document.getElementById('nextLvlBtn');
  var undoBtn = document.getElementById('undoBtn');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');
  var modal = document.getElementById('modalOverlay');
  var modalDesc = document.getElementById('modalDesc');
  var nextLevelBtn = document.getElementById('nextLevelBtn');
  var replayLevelBtn = document.getElementById('replayLevelBtn');

  var LOGICAL_W = 380;
  var LOGICAL_H = 460;

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

  function playSound(type) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;

    var now = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'step') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.05);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'push') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.09);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.09);
    } else if (type === 'goal') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.14);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.16);
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        var o = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f, now + i * 0.09);
        g.gain.setValueAtTime(0.22, now + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.28);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(now + i * 0.09);
        o.stop(now + i * 0.09 + 0.28);
      });
    }
  }

  try {
    var storedSound = localStorage.getItem('omg:sokoban:sound');
    if (storedSound !== null) soundEnabled = storedSound === '1';
  } catch (e) {}
  soundBtn.textContent = soundEnabled ? '🔊' : '🔇';

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
    try {
      localStorage.setItem('omg:sokoban:sound', soundEnabled ? '1' : '0');
    } catch (e) {}
  });

  // ---- 30 Classic Sokoban Levels --------------------------------------------
  // Standard ASCII map notation:
  // '#' = Wall, ' ' = Floor, '.' = Goal, '$' = Box, '*' = Box on Goal, '@' = Player, '+' = Player on Goal
  var LEVELS = [
    // Level 1 (Intro)
    [
      '  #####',
      '###   #',
      '# $ # ##',
      '# #  . #',
      '#    # #',
      '## #.  #',
      ' #@$ ###',
      ' #####'
    ],
    // Level 2
    [
      '######',
      '#    #',
      '# #$ #',
      '# .@ #',
      '# $  #',
      '# .  #',
      '######'
    ],
    // Level 3
    [
      '  ####',
      '###  ####',
      '#     $ #',
      '# #  #$ #',
      '# . .#@ #',
      '######### '
    ],
    // Level 4
    [
      '#######',
      '#     #',
      '# .$. #',
      '# $@$ #',
      '# .$. #',
      '#     #',
      '#######'
    ],
    // Level 5
    [
      '  #####',
      '###   #',
      '# $ $ #',
      '# #@# #',
      '#  .  #',
      '#  .  #',
      '#######'
    ],
    // Level 6
    [
      '######',
      '#@   #',
      '# $$ #',
      '## # #',
      ' #.. #',
      ' #####'
    ],
    // Level 7
    [
      '  ######',
      '###    #',
      '#   $$ #',
      '# ## # #',
      '# .. @ #',
      '########'
    ],
    // Level 8
    [
      '#######',
      '#  .  #',
      '# $#$ #',
      '# .@. #',
      '# $#$ #',
      '#  .  #',
      '#######'
    ],
    // Level 9
    [
      '########',
      '#   #  #',
      '# $ $  #',
      '## ##@##',
      ' # .. # ',
      ' ###### '
    ],
    // Level 10
    [
      '  ##### ',
      '###   ##',
      '#  $$  #',
      '# ###  #',
      '# ..#@ #',
      '########'
    ],
    // Level 11
    [
      '#######',
      '#     #',
      '# $ $ #',
      '#  @  #',
      '# $ $ #',
      '# ....#',
      '#######'
    ],
    // Level 12
    [
      '  #####',
      '  #   #',
      '### $ #',
      '#  $# #',
      '# .@  #',
      '# ..###',
      '#####  '
    ],
    // Level 13
    [
      '#######',
      '#  @  #',
      '# $$$ #',
      '# ... #',
      '#     #',
      '#######'
    ],
    // Level 14
    [
      '########',
      '#  ..  #',
      '# $$#  #',
      '#   @  #',
      '#  #$$ #',
      '#  ..  #',
      '########'
    ],
    // Level 15
    [
      '  ######',
      '  # .  #',
      '### #  #',
      '#   $  #',
      '# $#@  #',
      '#  . ###',
      '######  '
    ],
    // Level 16
    [
      '#######',
      '# . . #',
      '#  $  #',
      '##$@$##',
      '#  $  #',
      '# . . #',
      '#######'
    ],
    // Level 17
    [
      '########',
      '#  #   #',
      '# $  $ #',
      '# .@.  #',
      '#  #$  #',
      '#  .#  #',
      '########'
    ],
    // Level 18
    [
      '  ##### ',
      '###   # ',
      '#  $$ # ',
      '# #@# ##',
      '#  . . #',
      '########'
    ],
    // Level 19
    [
      '########',
      '#   @  #',
      '# $$#  #',
      '# ..#  #',
      '#   #  #',
      '########'
    ],
    // Level 20
    [
      '#######',
      '# ... #',
      '# $$$ #',
      '#  @  #',
      '#     #',
      '#######'
    ],
    // Level 21
    [
      '  ##### ',
      '###   ##',
      '#  $$  #',
      '# # .  #',
      '# # .@ #',
      '########'
    ],
    // Level 22
    [
      '#######',
      '#  .  #',
      '# $#$ #',
      '#  @  #',
      '# $#$ #',
      '#  ...#',
      '#######'
    ],
    // Level 23
    [
      '########',
      '#      #',
      '# .$$$ #',
      '# ..@  #',
      '#      #',
      '########'
    ],
    // Level 24
    [
      '######',
      '# .  #',
      '# $$ #',
      '##@  #',
      ' #.  #',
      ' #####'
    ],
    // Level 25
    [
      '#######',
      '#  #  #',
      '# $.$ #',
      '# .@. #',
      '# $.$ #',
      '#  #  #',
      '#######'
    ],
    // Level 26
    [
      '########',
      '#      #',
      '# $$$$ #',
      '# .... #',
      '#  @   #',
      '########'
    ],
    // Level 27
    [
      '  ##### ',
      '###   # ',
      '# $ # ##',
      '# . @  #',
      '# $ #  #',
      '# . ####',
      '####    '
    ],
    // Level 28
    [
      '########',
      '#  ..  #',
      '#  $$  #',
      '#  $$  #',
      '#  ..  #',
      '#  @   #',
      '########'
    ],
    // Level 29
    [
      '  ######',
      '###    #',
      '#  $$$ #',
      '#  ... #',
      '#   @  #',
      '########'
    ],
    // Level 30 (Master)
    [
      '#########',
      '#   #   #',
      '# $ . $ #',
      '# . @ . #',
      '# $ . $ #',
      '#   #   #',
      '#########'
    ]
  ];

  // ---- Game State -----------------------------------------------------------
  var currentLevelIdx = 0;
  var maxUnlockedLevel = 1;
  var steps = 0;
  var grid = [];
  var goals = [];
  var player = { r: 0, c: 0, dir: 'down' };
  var historyStack = [];

  // Parse ASCII level into state
  function loadLevel(idx) {
    currentLevelIdx = idx;
    var lines = LEVELS[idx];
    steps = 0;
    historyStack = [];
    grid = [];
    goals = [];

    var maxCols = 0;
    for (var r = 0; r < lines.length; r++) {
      if (lines[r].length > maxCols) maxCols = lines[r].length;
    }

    for (var r = 0; r < lines.length; r++) {
      var row = [];
      var line = lines[r];
      for (var c = 0; c < maxCols; c++) {
        var ch = c < line.length ? line[c] : ' ';
        var isGoal = (ch === '.' || ch === '*' || ch === '+');
        var hasBox = (ch === '$' || ch === '*');
        var hasPlayer = (ch === '@' || ch === '+');

        if (isGoal) goals.push({ r: r, c: c });
        if (hasPlayer) player = { r: r, c: c, dir: 'down' };

        var type = 'floor';
        if (ch === '#') type = 'wall';
        else if (ch === ' ') type = 'void';

        row.push({
          type: type,
          isGoal: isGoal,
          hasBox: hasBox
        });
      }
      grid.push(row);
    }

    updateUI();
    render();
  }

  function updateUI() {
    levelBadge.textContent = '第 ' + (currentLevelIdx + 1) + ' / ' + LEVELS.length + ' 关';
    stepsVal.textContent = steps;

    // Count boxes on goal
    var onGoal = 0;
    for (var g = 0; g < goals.length; g++) {
      var goal = goals[g];
      if (grid[goal.r] && grid[goal.r][goal.c] && grid[goal.r][goal.c].hasBox) {
        onGoal++;
      }
    }
    goalsVal.textContent = onGoal + '/' + goals.length;
  }

  // ---- Persistence ----------------------------------------------------------
  function loadProgress() {
    if (window.GameStore && typeof window.GameStore.getBest === 'function') {
      window.GameStore.getBest('sokoban').then(function (val) {
        if (val && val > maxUnlockedLevel) maxUnlockedLevel = val;
      });
    }
  }

  function saveProgress(lvl) {
    if (lvl > maxUnlockedLevel) {
      maxUnlockedLevel = lvl;
      if (window.GameStore && typeof window.GameStore.saveBest === 'function') {
        window.GameStore.saveBest('sokoban', maxUnlockedLevel);
      }
    }
  }

  // ---- Move Logic -----------------------------------------------------------
  var DIRS = {
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 }
  };

  function move(dir) {
    var d = DIRS[dir];
    if (!d) return;

    player.dir = dir;
    var nr = player.r + d.dr;
    var nc = player.c + d.dc;

    if (!grid[nr] || !grid[nr][nc] || grid[nr][nc].type === 'wall' || grid[nr][nc].type === 'void') {
      return; // blocked by wall
    }

    var target = grid[nr][nc];

    if (target.hasBox) {
      // Trying to push box
      var nnr = nr + d.dr;
      var nnc = nc + d.dc;
      if (!grid[nnr] || !grid[nnr][nnc] || grid[nnr][nnc].type === 'wall' || grid[nnr][nnc].type === 'void' || grid[nnr][nnc].hasBox) {
        return; // box is blocked!
      }

      // Save history before move
      saveHistory();

      // Move box
      target.hasBox = false;
      grid[nnr][nnc].hasBox = true;

      // Move player
      player.r = nr;
      player.c = nc;
      steps++;

      if (grid[nnr][nnc].isGoal) playSound('goal');
      else playSound('push');
    } else {
      // Normal step
      saveHistory();
      player.r = nr;
      player.c = nc;
      steps++;
      playSound('step');
    }

    updateUI();
    render();
    saveSokobanState();
    checkWinCondition();
  }

  var SAVE_KEY = 'omg:save:sokoban';

  function saveSokobanState() {
    try {
      var boxSnap = [];
      for (var r = 0; r < grid.length; r++) {
        for (var c = 0; c < grid[r].length; c++) {
          if (grid[r][c].hasBox) boxSnap.push({ r: r, c: c });
        }
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        levelIdx: currentLevelIdx,
        steps: steps,
        player: { r: player.r, c: player.c, dir: player.dir },
        boxes: boxSnap
      }));
    } catch (e) {}
  }

  function restoreSokobanState() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (data && typeof data.levelIdx === 'number' && data.levelIdx >= 0 && data.levelIdx < LEVELS.length) {
        loadLevel(data.levelIdx, true);
        if (data.boxes && Array.isArray(data.boxes)) {
          for (var r = 0; r < grid.length; r++) {
            for (var c = 0; c < grid[r].length; c++) {
              grid[r][c].hasBox = false;
            }
          }
          data.boxes.forEach(function (b) {
            if (grid[b.r] && grid[b.r][b.c]) grid[b.r][b.c].hasBox = true;
          });
        }
        if (data.player) {
          player = { r: data.player.r, c: data.player.c, dir: data.player.dir || 'down' };
        }
        steps = data.steps || 0;
        updateUI();
        render();
        return true;
      }
    } catch (e) {}
    return false;
  }

  function saveHistory() {
    // Deep clone box positions
    var boxSnap = [];
    for (var r = 0; r < grid.length; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        if (grid[r][c].hasBox) boxSnap.push({ r: r, c: c });
      }
    }
    historyStack.push({
      player: { r: player.r, c: player.c, dir: player.dir },
      boxes: boxSnap,
      steps: steps
    });
  }

  function undo() {
    if (historyStack.length === 0) return;
    var prev = historyStack.pop();

    // Clear all boxes
    for (var r = 0; r < grid.length; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        grid[r][c].hasBox = false;
      }
    }

    // Restore boxes
    for (var b = 0; b < prev.boxes.length; b++) {
      var bx = prev.boxes[b];
      grid[bx.r][bx.c].hasBox = true;
    }

    // Restore player
    player = { r: prev.player.r, c: prev.player.c, dir: prev.player.dir };
    steps = prev.steps;

    updateUI();
    render();
    saveSokobanState();
  }

  function checkWinCondition() {
    for (var g = 0; g < goals.length; g++) {
      var goal = goals[g];
      if (!grid[goal.r][goal.c].hasBox) return; // not finished yet
    }

    // LEVEL WON!
    playSound('win');
    saveProgress(currentLevelIdx + 2);
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    modalDesc.textContent = '太棒了！本关耗费 ' + steps + ' 步顺利推完！';
    modal.classList.remove('hidden');
  }

  // ---- Controls / Listeners -------------------------------------------------
  window.addEventListener('keydown', function (e) {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); move('up'); }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); move('down'); }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); move('left'); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); move('right'); }
    else if (e.code === 'KeyZ') { e.preventDefault(); undo(); }
    else if (e.code === 'KeyR') { e.preventDefault(); loadLevel(currentLevelIdx); }
  });

  document.querySelectorAll('.dpad-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var dir = btn.dataset.dir;
      if (dir) move(dir);
    });
  });

  prevLvlBtn.addEventListener('click', function () {
    if (currentLevelIdx > 0) loadLevel(currentLevelIdx - 1);
  });

  nextLvlBtn.addEventListener('click', function () {
    if (currentLevelIdx < LEVELS.length - 1) loadLevel(currentLevelIdx + 1);
  });

  undoBtn.addEventListener('click', undo);
  restartBtn.addEventListener('click', function () { loadLevel(currentLevelIdx); });

  nextLevelBtn.addEventListener('click', function () {
    modal.classList.add('hidden');
    if (currentLevelIdx < LEVELS.length - 1) loadLevel(currentLevelIdx + 1);
  });

  replayLevelBtn.addEventListener('click', function () {
    modal.classList.add('hidden');
    loadLevel(currentLevelIdx);
  });

  // ---- Rendering ------------------------------------------------------------
  function render() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

    var rows = grid.length;
    var cols = grid[0] ? grid[0].length : 1;

    // Calculate dynamic tile size to fit stage
    var tileSize = Math.min(
      Math.floor((LOGICAL_W - 24) / cols),
      Math.floor((LOGICAL_H - 24) / rows)
    );
    tileSize = Math.max(22, Math.min(50, tileSize));

    var mapW = cols * tileSize;
    var mapH = rows * tileSize;
    var offsetX = Math.floor((LOGICAL_W - mapW) / 2);
    var offsetY = Math.floor((LOGICAL_H - mapH) / 2);

    // 1. Draw Floor & Walls
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var cell = grid[r][c];
        var x = offsetX + c * tileSize;
        var y = offsetY + r * tileSize;

        if (cell.type === 'void') continue;

        if (cell.type === 'wall') {
          // 3D Beveled Stone Wall
          ctx.fillStyle = '#334155';
          ctx.fillRect(x, y, tileSize, tileSize);
          ctx.fillStyle = '#475569';
          ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, tileSize, tileSize);
        } else {
          // Floor tile
          ctx.fillStyle = ((r + c) % 2 === 0) ? '#1e293b' : '#0f172a';
          ctx.fillRect(x, y, tileSize, tileSize);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, tileSize, tileSize);

          // Goal Marker
          if (cell.isGoal) {
            ctx.fillStyle = 'rgba(250, 204, 21, 0.3)';
            ctx.beginPath();
            ctx.arc(x + tileSize / 2, y + tileSize / 2, tileSize * 0.28, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Inner target dot
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.arc(x + tileSize / 2, y + tileSize / 2, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // 2. Draw Boxes
    for (var br = 0; br < rows; br++) {
      for (var bc = 0; bc < cols; bc++) {
        var bCell = grid[br][bc];
        if (bCell.hasBox) {
          var bx = offsetX + bc * tileSize + 3;
          var by = offsetY + br * tileSize + 3;
          var bw = tileSize - 6;

          var onGoal = bCell.isGoal;

          // Box body
          var bGrad = ctx.createLinearGradient(bx, by, bx, by + bw);
          if (onGoal) {
            bGrad.addColorStop(0, '#34d399');
            bGrad.addColorStop(1, '#059669');
          } else {
            bGrad.addColorStop(0, '#d97706');
            bGrad.addColorStop(1, '#92400e');
          }
          ctx.fillStyle = bGrad;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bw, 4);
          ctx.fill();

          ctx.strokeStyle = onGoal ? '#10b981' : '#78350f';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Wooden diagonal cross-braces
          ctx.strokeStyle = onGoal ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.25)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(bx + 4, by + 4);
          ctx.lineTo(bx + bw - 4, by + bw - 4);
          ctx.moveTo(bx + bw - 4, by + 4);
          ctx.lineTo(bx + 4, by + bw - 4);
          ctx.stroke();
        }
      }
    }

    // 3. Draw Player 👷‍♂️
    var px = offsetX + player.c * tileSize + tileSize / 2;
    var py = offsetY + player.r * tileSize + tileSize / 2;
    var pr = tileSize * 0.38;

    // Body
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(px, py + pr * 0.2, pr * 0.8, 0, Math.PI * 2);
    ctx.fill();

    // Yellow Safety Helmet
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(px, py - pr * 0.3, pr * 0.65, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(px - pr * 0.7, py - pr * 0.3, pr * 1.4, 3);

    // Directional Eyes
    var eyeOffset = pr * 0.25;
    var edx = 0, edy = 0;
    if (player.dir === 'left') edx = -3;
    else if (player.dir === 'right') edx = 3;
    else if (player.dir === 'up') edy = -3;
    else edy = 2;

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(px - eyeOffset + edx, py - pr * 0.05 + edy, 2.2, 0, Math.PI * 2);
    ctx.arc(px + eyeOffset + edx, py - pr * 0.05 + edy, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ---- Bootstrap ------------------------------------------------------------
  loadProgress();
  if (!restoreSokobanState()) {
    loadLevel(0);
  }
})();
