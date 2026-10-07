/*
 * 找马挑战 (Find The Horse) - OmniGame
 * 每天方块同款 · 萌趣扫雷找马益智游戏
 * 100% 离线单机运行 · 纯 Web Audio 音效 · 自适应侧边栏与悬浮窗
 */
(function () {
  'use strict';

  // ---- Level Configurations --------------------------------------------------
  var LEVELS = {
    '1': { id: '1', name: '第1关', cols: 5, rows: 5, horses: 3, carrots: 2, radars: 1 },
    '2': { id: '2', name: '第2关', cols: 6, rows: 6, horses: 5, carrots: 2, radars: 1 },
    '3': { id: '3', name: '第3关', cols: 7, rows: 7, horses: 8, carrots: 2, radars: 1 },
    '4': { id: '4', name: '第4关', cols: 8, rows: 8, horses: 11, carrots: 3, radars: 2 },
    '5': { id: '5', name: '第5关', cols: 9, rows: 9, horses: 14, carrots: 3, radars: 2 },
    'random': { id: 'random', name: '随机挑战', cols: 7, rows: 7, horses: 8, carrots: 2, radars: 1 }
  };

  // ---- Audio Synthesizer (Web Audio API) --------------------------------------
  var audioCtx = null;
  var soundEnabled = true;

  try {
    var storedSound = localStorage.getItem('omg:sound');
    if (storedSound !== null) {
      soundEnabled = storedSound === 'true';
    }
  } catch (e) {}

  function getAudioCtx() {
    if (!audioCtx) {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq, type, duration, gainVal, rampTo) {
    if (!soundEnabled) return;
    try {
      var ctx = getAudioCtx();
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (rampTo != null) {
        osc.frequency.exponentialRampToValueAtTime(rampTo, ctx.currentTime + duration);
      }
      gain.gain.setValueAtTime(gainVal || 0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  function playPop() {
    playTone(320, 'sine', 0.08, 0.2, 540);
  }

  function playHorseNeigh() {
    if (!soundEnabled) return;
    try {
      var ctx = getAudioCtx();
      if (!ctx) return;
      // Cheerful multi-note upward fanfare
      var notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach(function (freq, idx) {
        setTimeout(function () {
          playTone(freq, 'triangle', 0.18, 0.25);
        }, idx * 60);
      });
    } catch (e) {}
  }

  function playHeartBreak() {
    playTone(180, 'sawtooth', 0.25, 0.25, 80);
  }

  function playCascade() {
    playTone(660, 'sine', 0.06, 0.12, 880);
  }

  function playCarrotChime() {
    if (!soundEnabled) return;
    var notes = [440, 554.37, 659.25, 880];
    notes.forEach(function (f, i) {
      setTimeout(function () {
        playTone(f, 'sine', 0.2, 0.2);
      }, i * 70);
    });
  }

  function playRadarSonar() {
    playTone(900, 'sine', 0.35, 0.22, 1200);
  }

  function playVictory() {
    if (!soundEnabled) return;
    var melody = [
      { f: 523.25, d: 0.12 },
      { f: 659.25, d: 0.12 },
      { f: 783.99, d: 0.12 },
      { f: 1046.50, d: 0.35 }
    ];
    var time = 0;
    melody.forEach(function (item) {
      setTimeout(function () {
        playTone(item.f, 'triangle', item.d, 0.3);
      }, time * 1000);
      time += item.d + 0.04;
    });
  }

  // ---- Game State Variables --------------------------------------------------
  var currentLevelId = '1';
  var cfg = LEVELS[currentLevelId];
  var grid = []; // 2D array of cell objects: { r, c, isHorse, revealed, flagged, adjacentHorses, el }
  var rowHorseCounts = [];
  var colHorseCounts = [];
  var foundHorses = 0;
  var totalHorses = 0;
  var heartsRemaining = 3;
  var currentMode = 'catch'; // 'catch' | 'dig' | 'flag'
  var carrotsLeft = 2;
  var radarsLeft = 1;
  var radarActive = false;
  var isGameOver = false;
  var isGameWon = false;
  var timerInterval = null;
  var secondsElapsed = 0;
  var isTimerRunning = false;

  // DOM Elements
  var soundBtn = document.getElementById('soundBtn');
  var rulesBtn = document.getElementById('rulesBtn');
  var restartBtn = document.getElementById('restartBtn');
  var levelTabs = document.getElementById('levelTabs');
  var heartsContainer = document.getElementById('heartsContainer');
  var foundCountEl = document.getElementById('foundCount');
  var totalHorsesEl = document.getElementById('totalHorses');
  var timerTextEl = document.getElementById('timerText');

  var modeCatchBtn = document.getElementById('modeCatchBtn');
  var modeDigBtn = document.getElementById('modeDigBtn');
  var modeFlagBtn = document.getElementById('modeFlagBtn');
  var propCarrotBtn = document.getElementById('propCarrotBtn');
  var propRadarBtn = document.getElementById('propRadarBtn');
  var carrotCountEl = document.getElementById('carrotCount');
  var radarCountEl = document.getElementById('radarCount');

  var boardContainer = document.getElementById('boardContainer');
  var puzzleMatrix = document.getElementById('puzzleMatrix');
  var footerHint = document.getElementById('footerHint');

  // Modals
  var victoryModal = document.getElementById('victoryModal');
  var victoryDesc = document.getElementById('victoryDesc');
  var vicTime = document.getElementById('vicTime');
  var vicHearts = document.getElementById('vicHearts');
  var nextLevelBtn = document.getElementById('nextLevelBtn');
  var replayBtn = document.getElementById('replayBtn');

  var failModal = document.getElementById('failModal');
  var retryBtn = document.getElementById('retryBtn');
  var revealAnswerBtn = document.getElementById('revealAnswerBtn');

  var rulesModal = document.getElementById('rulesModal');
  var closeRulesBtn = document.getElementById('closeRulesBtn');
  var knowRulesBtn = document.getElementById('knowRulesBtn');

  // ---- Timer Logic -----------------------------------------------------------
  function startTimer() {
    if (isTimerRunning) return;
    isTimerRunning = true;
    timerInterval = setInterval(function () {
      secondsElapsed++;
      renderTimer();
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    isTimerRunning = false;
  }

  function resetTimer() {
    stopTimer();
    secondsElapsed = 0;
    renderTimer();
  }

  function renderTimer() {
    var m = Math.floor(secondsElapsed / 60);
    var s = secondsElapsed % 60;
    var str = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    if (timerTextEl) timerTextEl.textContent = str;
  }

  // ---- UI Sync & Hearts ------------------------------------------------------
  function updateHeartsUI(animate) {
    if (!heartsContainer) return;
    var heartsStr = '';
    for (var i = 0; i < 3; i++) {
      heartsStr += (i < heartsRemaining ? '❤️' : '💔');
    }
    heartsContainer.textContent = heartsStr;

    if (animate) {
      heartsContainer.classList.remove('hearts-shake');
      void heartsContainer.offsetWidth; // trigger reflow
      heartsContainer.classList.add('hearts-shake');
    }
  }

  function updateStatusCounters() {
    if (foundCountEl) foundCountEl.textContent = foundHorses;
    if (totalHorsesEl) totalHorsesEl.textContent = totalHorses;
    if (carrotCountEl) carrotCountEl.textContent = carrotsLeft;
    if (radarCountEl) radarCountEl.textContent = radarsLeft;

    if (propCarrotBtn) propCarrotBtn.disabled = carrotsLeft <= 0 || isGameOver || isGameWon;
    if (propRadarBtn) propRadarBtn.disabled = radarsLeft <= 0 || isGameOver || isGameWon;
  }

  function setMode(mode) {
    currentMode = mode;
    [modeCatchBtn, modeDigBtn, modeFlagBtn].forEach(function (btn) {
      if (btn) btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    if (mode === 'catch') {
      footerHint.textContent = '🐴 抓马模式：点击你推断出藏有小马的方格！';
    } else if (mode === 'dig') {
      footerHint.textContent = '🔍 探路模式：点击翻开安全草地，获取周围线索！';
    } else if (mode === 'flag') {
      footerHint.textContent = '🌱 标草模式：标记确定没有马的草地，防止误触！';
    }
  }

  // ---- Board Generation ------------------------------------------------------
  function initGame(levelId) {
    currentLevelId = levelId || currentLevelId;
    cfg = LEVELS[currentLevelId] || LEVELS['1'];

    // Update level pills
    var pills = levelTabs.querySelectorAll('.level-pill');
    pills.forEach(function (p) {
      p.classList.toggle('active', p.dataset.level === currentLevelId);
    });

    // Reset counters & state
    foundHorses = 0;
    totalHorses = cfg.horses;
    heartsRemaining = 3;
    carrotsLeft = cfg.carrots;
    radarsLeft = cfg.radars;
    radarActive = false;
    isGameOver = false;
    isGameWon = false;
    resetTimer();

    updateHeartsUI(false);
    updateStatusCounters();
    setMode('catch');

    // Hide modals
    victoryModal.classList.add('hidden');
    failModal.classList.add('hidden');

    // Generate grid data
    grid = [];
    var totalCells = cfg.cols * cfg.rows;
    var horsePositions = {};

    // Place horses randomly
    var placed = 0;
    while (placed < cfg.horses) {
      var idx = Math.floor(Math.random() * totalCells);
      if (!horsePositions[idx]) {
        horsePositions[idx] = true;
        placed++;
      }
    }

    // Build grid cells
    for (var r = 0; r < cfg.rows; r++) {
      grid[r] = [];
      for (var c = 0; c < cfg.cols; c++) {
        var cellIdx = r * cfg.cols + c;
        grid[r][c] = {
          r: r,
          c: c,
          isHorse: !!horsePositions[cellIdx],
          revealed: false,
          flagged: false,
          adjacentHorses: 0,
          el: null
        };
      }
    }

    // Compute adjacent horse counts & row/col totals
    rowHorseCounts = new Array(cfg.rows).fill(0);
    colHorseCounts = new Array(cfg.cols).fill(0);

    for (var r = 0; r < cfg.rows; r++) {
      for (var c = 0; c < cfg.cols; c++) {
        if (grid[r][c].isHorse) {
          rowHorseCounts[r]++;
          colHorseCounts[c]++;
        } else {
          // Count surrounding horses
          var adj = 0;
          for (var dr = -1; dr <= 1; dr++) {
            for (var dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              var nr = r + dr;
              var nc = c + dc;
              if (nr >= 0 && nr < cfg.rows && nc >= 0 && nc < cfg.cols) {
                if (grid[nr][nc].isHorse) adj++;
              }
            }
          }
          grid[r][c].adjacentHorses = adj;
        }
      }
    }

    renderBoardDOM();
  }

  // ---- Render Board DOM -------------------------------------------------------
  function renderBoardDOM() {
    puzzleMatrix.innerHTML = '';

    // Calculate dynamic responsive cell sizing
    var containerWidth = Math.min(boardContainer.clientWidth || 360, 440) - 24;
    var headerSize = Math.max(26, Math.min(32, Math.floor(containerWidth / (cfg.cols + 1.2))));
    var cellSize = Math.max(28, Math.min(48, Math.floor((containerWidth - headerSize - (cfg.cols * 4)) / cfg.cols)));

    // CSS Grid Template: Top corner + columns
    puzzleMatrix.style.gridTemplateColumns = headerSize + 'px repeat(' + cfg.cols + ', ' + cellSize + 'px)';

    // 1. Top-Left Corner cell (Shows 🐴 mini icon)
    var corner = document.createElement('div');
    corner.className = 'corner-cell col-header';
    corner.style.width = headerSize + 'px';
    corner.style.height = headerSize + 'px';
    corner.textContent = '🐴';
    corner.title = '行/列为该方向藏马总数';
    puzzleMatrix.appendChild(corner);

    // 2. Column Headers (Top)
    for (var c = 0; c < cfg.cols; c++) {
      var colHead = document.createElement('div');
      colHead.className = 'col-header';
      colHead.id = 'col-header-' + c;
      colHead.style.height = headerSize + 'px';
      colHead.textContent = colHorseCounts[c];
      colHead.title = '第 ' + (c + 1) + ' 列藏有 ' + colHorseCounts[c] + ' 匹小马';
      puzzleMatrix.appendChild(colHead);
    }

    // 3. Rows (Row Header on Left + Cells)
    for (var r = 0; r < cfg.rows; r++) {
      // Row Header
      var rowHead = document.createElement('div');
      rowHead.className = 'row-header';
      rowHead.id = 'row-header-' + r;
      rowHead.style.width = headerSize + 'px';
      rowHead.style.height = cellSize + 'px';
      rowHead.textContent = rowHorseCounts[r];
      rowHead.title = '第 ' + (r + 1) + ' 行藏有 ' + rowHorseCounts[r] + ' 匹小马';
      puzzleMatrix.appendChild(rowHead);

      // Grid Cells
      for (var c = 0; c < cfg.cols; c++) {
        var cell = grid[r][c];
        var cellEl = document.createElement('div');
        cellEl.className = 'cell hidden-tile';
        cellEl.style.width = cellSize + 'px';
        cellEl.style.height = cellSize + 'px';
        cellEl.dataset.r = r;
        cellEl.dataset.c = c;

        // Attach listeners
        (function (row, col, el) {
          el.addEventListener('click', function (e) {
            e.preventDefault();
            handleCellAction(row, col, false);
          });
          el.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            handleCellAction(row, col, true); // right click
          });
        })(r, c, cellEl);

        cell.el = cellEl;
        puzzleMatrix.appendChild(cellEl);
      }
    }

    checkHeaderSatisfaction();
  }

  // ---- Header Satisfaction Indicators ---------------------------------------
  function checkHeaderSatisfaction() {
    // Check Columns
    for (var c = 0; c < cfg.cols; c++) {
      var foundInCol = 0;
      for (var r = 0; r < cfg.rows; r++) {
        if (grid[r][c].isHorse && grid[r][c].revealed) foundInCol++;
      }
      var colHead = document.getElementById('col-header-' + c);
      if (colHead) {
        if (foundInCol >= colHorseCounts[c] && colHorseCounts[c] > 0) {
          colHead.classList.add('satisfied');
        } else if (colHorseCounts[c] === 0) {
          colHead.classList.add('satisfied');
        } else {
          colHead.classList.remove('satisfied');
        }
      }
    }

    // Check Rows
    for (var r = 0; r < cfg.rows; r++) {
      var foundInRow = 0;
      for (var c = 0; c < cfg.cols; c++) {
        if (grid[r][c].isHorse && grid[r][c].revealed) foundInRow++;
      }
      var rowHead = document.getElementById('row-header-' + r);
      if (rowHead) {
        if (foundInRow >= rowHorseCounts[r] && rowHorseCounts[r] > 0) {
          rowHead.classList.add('satisfied');
        } else if (rowHorseCounts[r] === 0) {
          rowHead.classList.add('satisfied');
        } else {
          rowHead.classList.remove('satisfied');
        }
      }
    }
  }

  // ---- Interaction & Actions -------------------------------------------------
  function handleCellAction(r, c, isRightClick) {
    if (isGameOver || isGameWon) return;
    startTimer();

    var cell = grid[r][c];
    if (!cell) return;

    // Handle Radar Target Mode
    if (radarActive) {
      applyRadarAt(r, c);
      radarActive = false;
      footerHint.textContent = '🧭 雷达侦测完成！';
      return;
    }

    // Determine intended action based on active tool & right-click
    var action = currentMode;
    if (isRightClick) {
      // Right click shortcut: If in catch mode, right click does dig. If in dig mode, right click does catch.
      action = currentMode === 'catch' ? 'dig' : 'catch';
    }

    if (action === 'flag') {
      toggleFlag(cell);
      return;
    }

    if (cell.flagged) {
      // Unflag on click or ignore
      toggleFlag(cell);
      return;
    }

    if (cell.revealed) {
      // Chording if already revealed safe cell
      if (!cell.isHorse && cell.adjacentHorses > 0) {
        handleChording(r, c);
      }
      return;
    }

    // Action Execution
    if (action === 'catch') {
      executeCatch(cell);
    } else if (action === 'dig') {
      executeDig(cell);
    }
  }

  function toggleFlag(cell) {
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
    playPop();
    if (cell.flagged) {
      cell.el.classList.add('flagged');
      cell.el.innerHTML = '<span class="flag-icon">🌱</span>';
    } else {
      cell.el.classList.remove('flagged');
      cell.el.innerHTML = '';
    }
  }

  function executeCatch(cell) {
    if (cell.isHorse) {
      // Success! Found a horse
      revealHorse(cell);
      playHorseNeigh();
      foundHorses++;
      updateStatusCounters();
      checkHeaderSatisfaction();
      checkVictory();
    } else {
      // Miss! No horse here
      handleMiss(cell);
    }
  }

  function executeDig(cell) {
    if (cell.isHorse) {
      // Mistake! Accidentally dug into horse
      handleMiss(cell);
      // Auto-reveal the horse so player gets the credit
      revealHorse(cell);
      foundHorses++;
      updateStatusCounters();
      checkHeaderSatisfaction();
      checkVictory();
    } else {
      // Safe reveal!
      revealSafe(cell);
      playPop();
    }
  }

  function revealHorse(cell) {
    cell.revealed = true;
    cell.flagged = false;
    cell.el.className = 'cell revealed-horse';
    cell.el.innerHTML = '<span class="horse-icon">🐴</span>';
  }

  function revealSafe(cell) {
    if (cell.revealed) return;
    cell.revealed = true;
    cell.flagged = false;
    cell.el.className = 'cell revealed-safe num-' + cell.adjacentHorses;
    cell.el.textContent = cell.adjacentHorses > 0 ? cell.adjacentHorses : '';

    // Cascade if zero adjacent horses
    if (cell.adjacentHorses === 0) {
      playCascade();
      for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          var nr = cell.r + dr;
          var nc = cell.c + dc;
          if (nr >= 0 && nr < cfg.rows && nc >= 0 && nc < cfg.cols) {
            var neighbor = grid[nr][nc];
            if (!neighbor.revealed && !neighbor.isHorse) {
              revealSafe(neighbor);
            }
          }
        }
      }
    }
  }

  function handleMiss(cell) {
    heartsRemaining--;
    playHeartBreak();
    updateHeartsUI(true);

    // Visual feedback on the missed cell
    cell.el.classList.add('error-shake');
    setTimeout(function () {
      if (cell && cell.el) cell.el.classList.remove('error-shake');
    }, 450);

    // Kindly reveal this cell as safe clue so turn is not wasted
    if (!cell.isHorse) {
      revealSafe(cell);
    }

    if (heartsRemaining <= 0) {
      triggerGameOver();
    } else {
      footerHint.textContent = '⚠️ 哎呀点错了！扣除1颗爱心，剩余 ' + heartsRemaining + ' 次机会！';
    }
  }

  // Chording: If number of flagged/found horses around cell == adjacentHorses, open remaining neighbors
  function handleChording(r, c) {
    var cell = grid[r][c];
    var markedCount = 0;
    var neighbors = [];

    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var nr = r + dr;
        var nc = c + dc;
        if (nr >= 0 && nr < cfg.rows && nc >= 0 && nc < cfg.cols) {
          var n = grid[nr][nc];
          neighbors.push(n);
          if ((n.revealed && n.isHorse) || n.flagged) {
            markedCount++;
          }
        }
      }
    }

    if (markedCount === cell.adjacentHorses) {
      neighbors.forEach(function (n) {
        if (!n.revealed && !n.flagged) {
          if (n.isHorse) {
            revealHorse(n);
            foundHorses++;
          } else {
            revealSafe(n);
          }
        }
      });
      playPop();
      updateStatusCounters();
      checkHeaderSatisfaction();
      checkVictory();
    }
  }

  // ---- Props -----------------------------------------------------------------
  // 1. Carrot Lure (Finds 1 random unrevealed horse)
  if (propCarrotBtn) {
    propCarrotBtn.addEventListener('click', function () {
      if (carrotsLeft <= 0 || isGameOver || isGameWon) return;
      startTimer();

      var hiddenHorses = [];
      for (var r = 0; r < cfg.rows; r++) {
        for (var c = 0; c < cfg.cols; c++) {
          if (grid[r][c].isHorse && !grid[r][c].revealed) {
            hiddenHorses.push(grid[r][c]);
          }
        }
      }

      if (hiddenHorses.length === 0) return;

      var target = hiddenHorses[Math.floor(Math.random() * hiddenHorses.length)];
      carrotsLeft--;
      playCarrotChime();
      revealHorse(target);
      foundHorses++;
      updateStatusCounters();
      checkHeaderSatisfaction();
      footerHint.textContent = '🥕 胡萝卜诱饵生效！一匹贪吃的小马探出了头！';
      checkVictory();
    });
  }

  // 2. Horse Radar (Safely scans a 3x3 area)
  if (propRadarBtn) {
    propRadarBtn.addEventListener('click', function () {
      if (radarsLeft <= 0 || isGameOver || isGameWon) return;
      startTimer();
      radarActive = true;
      footerHint.textContent = '🧭 雷达就绪：请点击棋盘上的任意方格作为探测中心！';
    });
  }

  function applyRadarAt(centerR, centerC) {
    radarsLeft--;
    updateStatusCounters();
    playRadarSonar();

    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        var nr = centerR + dr;
        var nc = centerC + dc;
        if (nr >= 0 && nr < cfg.rows && nc >= 0 && nc < cfg.cols) {
          var cell = grid[nr][nc];
          cell.el.classList.add('scanned-highlight');
          if (cell.isHorse) {
            revealHorse(cell);
            foundHorses++;
          } else {
            revealSafe(cell);
          }
        }
      }
    }

    updateStatusCounters();
    checkHeaderSatisfaction();
    checkVictory();
  }

  // ---- Game End & Modals -----------------------------------------------------
  function checkVictory() {
    if (foundHorses >= totalHorses && !isGameWon) {
      isGameWon = true;
      stopTimer();
      playVictory();

      // Save Best Progress
      try {
        if (window.GameStore && window.GameStore.setBest) {
          window.GameStore.setBest('find-horse:' + currentLevelId, secondsElapsed);
        }
      } catch (e) {}

      // Victory Stats
      var m = Math.floor(secondsElapsed / 60);
      var s = secondsElapsed % 60;
      var timeStr = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;

      vicTime.textContent = timeStr;
      var heartsStr = '';
      for (var i = 0; i < heartsRemaining; i++) heartsStr += '❤️';
      vicHearts.textContent = heartsStr;

      victoryDesc.textContent = '用时 ' + timeStr + ' · 剩余爱心 ' + heartsStr;
      setTimeout(function () {
        victoryModal.classList.remove('hidden');
      }, 500);
    }
  }

  function triggerGameOver() {
    isGameOver = true;
    stopTimer();
    failModal.classList.remove('hidden');
  }

  function revealAllAnswer() {
    for (var r = 0; r < cfg.rows; r++) {
      for (var c = 0; c < cfg.cols; c++) {
        var cell = grid[r][c];
        if (cell.isHorse) {
          revealHorse(cell);
        } else {
          revealSafe(cell);
        }
      }
    }
    failModal.classList.add('hidden');
    footerHint.textContent = '👁️ 答案已完整公布，点击“重置”即可再次挑战！';
  }

  // ---- Button & Modal Event Handlers ----------------------------------------
  if (soundBtn) {
    soundBtn.addEventListener('click', function () {
      soundEnabled = !soundEnabled;
      soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
      try {
        localStorage.setItem('omg:sound', soundEnabled ? 'true' : 'false');
      } catch (e) {}
    });
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  }

  if (restartBtn) {
    restartBtn.addEventListener('click', function () {
      initGame(currentLevelId);
    });
  }

  if (levelTabs) {
    levelTabs.addEventListener('click', function (e) {
      var pill = e.target.closest('.level-pill');
      if (pill && pill.dataset.level) {
        initGame(pill.dataset.level);
      }
    });
  }

  if (modeCatchBtn) {
    modeCatchBtn.addEventListener('click', function () { setMode('catch'); });
  }
  if (modeDigBtn) {
    modeDigBtn.addEventListener('click', function () { setMode('dig'); });
  }
  if (modeFlagBtn) {
    modeFlagBtn.addEventListener('click', function () { setMode('flag'); });
  }

  if (nextLevelBtn) {
    nextLevelBtn.addEventListener('click', function () {
      victoryModal.classList.add('hidden');
      var nextId = '1';
      if (currentLevelId === '1') nextId = '2';
      else if (currentLevelId === '2') nextId = '3';
      else if (currentLevelId === '3') nextId = '4';
      else if (currentLevelId === '4') nextId = '5';
      else nextId = 'random';
      initGame(nextId);
    });
  }

  if (replayBtn) {
    replayBtn.addEventListener('click', function () {
      victoryModal.classList.add('hidden');
      initGame(currentLevelId);
    });
  }

  if (retryBtn) {
    retryBtn.addEventListener('click', function () {
      failModal.classList.add('hidden');
      initGame(currentLevelId);
    });
  }

  if (revealAnswerBtn) {
    revealAnswerBtn.addEventListener('click', function () {
      revealAllAnswer();
    });
  }

  if (rulesBtn) {
    rulesBtn.addEventListener('click', function () {
      rulesModal.classList.remove('hidden');
    });
  }
  if (closeRulesBtn) {
    closeRulesBtn.addEventListener('click', function () {
      rulesModal.classList.add('hidden');
    });
  }
  if (knowRulesBtn) {
    knowRulesBtn.addEventListener('click', function () {
      rulesModal.classList.add('hidden');
    });
  }

  // Keyboard Shortcuts
  window.addEventListener('keydown', function (e) {
    if (e.key === '1') {
      setMode('catch');
    } else if (e.key === '2') {
      setMode('dig');
    } else if (e.key === '3') {
      setMode('flag');
    } else if (e.key === 'r' || e.key === 'R') {
      initGame(currentLevelId);
    } else if (e.key === 'Escape') {
      if (rulesModal) rulesModal.classList.add('hidden');
    }
  });

  // Responsive redraw on window resize
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      renderBoardDOM();
    }, 150);
  });

  // Start initial game
  initGame('1');
})();
