(function () {
  'use strict';

  var STORAGE_KEY = 'omg:save:stack';
  var BEST_SCORE_KEY = 'omg:best:stack';

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');

  var scoreText = document.getElementById('scoreText');
  var bestScoreText = document.getElementById('bestScoreText');
  var comboBadge = document.getElementById('comboBadge');
  var soundBtn = document.getElementById('soundBtn');
  var restartBtn = document.getElementById('restartBtn');

  var modal = document.getElementById('stackModal');
  var modalEmoji = document.getElementById('modalEmoji');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  // Constants
  var WIDTH = 360;
  var HEIGHT = 480;
  var BLOCK_HEIGHT = 16;
  var INITIAL_WIDTH = 180;
  var BASE_Y = 400;

  // State
  var stack = []; // array of { x, y, width, hue }
  var currentBlock = null; // { x, y, width, vx, hue }
  var fallingDebris = []; // array of { x, y, width, vy, rot, vRot, hue }
  var score = 0;
  var bestScore = 0;
  var combo = 0;
  var cameraY = 0;
  var targetCameraY = 0;
  var isGameOver = false;
  var soundEnabled = true;
  var animationId = null;

  // Web Audio Context
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

  function playSound(type, noteIdx) {
    if (!soundEnabled) return;
    var ctxA = getAudioCtx();
    if (!ctxA) return;
    var t = ctxA.currentTime;

    if (type === 'place') {
      // Ascending musical scale
      var semitone = (noteIdx || 0) % 24;
      var freq = 261.63 * Math.pow(1.059463, semitone);
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    } else if (type === 'perfect') {
      [523.25, 659.25, 783.99].forEach(function (freq, i) {
        var osc = ctxA.createOscillator();
        var gain = ctxA.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.04);
        gain.gain.setValueAtTime(0.25, t + i * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.04 + 0.15);
        osc.connect(gain);
        gain.connect(ctxA.destination);
        osc.start(t + i * 0.04);
        osc.stop(t + i * 0.04 + 0.16);
      });
    } else if (type === 'gameover') {
      [220, 196, 174.61, 146.83].forEach(function (freq, i) {
        var osc = ctxA.createOscillator();
        var gain = ctxA.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t + i * 0.12);
        gain.gain.setValueAtTime(0.25, t + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.12 + 0.18);
        osc.connect(gain);
        gain.connect(ctxA.destination);
        osc.start(t + i * 0.12);
        osc.stop(t + i * 0.12 + 0.2);
      });
    }
  }

  function getHue(level) {
    return (180 + level * 7) % 360;
  }

  function initGame() {
    stack = [
      {
        x: (WIDTH - INITIAL_WIDTH) / 2,
        y: BASE_Y,
        width: INITIAL_WIDTH,
        hue: getHue(0)
      }
    ];

    score = 0;
    combo = 0;
    fallingDebris = [];
    isGameOver = false;
    cameraY = 0;
    targetCameraY = 0;

    spawnNextBlock();
    updateUI();
    hideModal();
    saveState();
  }

  function spawnNextBlock() {
    var prev = stack[stack.length - 1];
    var nextY = prev.y - BLOCK_HEIGHT;
    var speed = 3.2 + Math.min(stack.length * 0.08, 3.5);

    currentBlock = {
      x: 0,
      y: nextY,
      width: prev.width,
      vx: (Math.random() > 0.5 ? 1 : -1) * speed,
      hue: getHue(stack.length)
    };

    // If starting off right side
    if (currentBlock.vx < 0) {
      currentBlock.x = WIDTH - currentBlock.width;
    }
  }

  function placeBlock() {
    if (isGameOver || !currentBlock) return;

    var prev = stack[stack.length - 1];
    var overlapLeft = Math.max(currentBlock.x, prev.x);
    var overlapRight = Math.min(currentBlock.x + currentBlock.width, prev.x + prev.width);
    var overlapWidth = overlapRight - overlapLeft;

    // Check perfect placement
    var diff = Math.abs(currentBlock.x - prev.x);
    var isPerfect = (diff <= 3.5);

    if (isPerfect) {
      // Snap to perfect
      currentBlock.x = prev.x;
      currentBlock.width = prev.width;
      combo++;
      score++;

      // Width bonus on streak
      if (combo >= 5 && currentBlock.width < INITIAL_WIDTH) {
        currentBlock.width = Math.min(INITIAL_WIDTH, currentBlock.width + 8);
        currentBlock.x = Math.max(10, currentBlock.x - 4);
      }

      showComboBadge(combo);
      playSound('perfect');

      stack.push({
        x: currentBlock.x,
        y: currentBlock.y,
        width: currentBlock.width,
        hue: currentBlock.hue
      });

      checkCamera();
      spawnNextBlock();
    } else if (overlapWidth > 0) {
      // Overlap with slice
      combo = 0;
      hideComboBadge();
      score++;

      var cutX = (currentBlock.x < prev.x) ? currentBlock.x : overlapRight;
      var cutW = currentBlock.width - overlapWidth;

      // Spawn falling debris slice
      fallingDebris.push({
        x: cutX,
        y: currentBlock.y,
        width: cutW,
        vy: 1,
        rot: 0,
        vRot: (currentBlock.x < prev.x ? -1 : 1) * 0.05,
        hue: currentBlock.hue
      });

      playSound('place', score);

      stack.push({
        x: overlapLeft,
        y: currentBlock.y,
        width: overlapWidth,
        hue: currentBlock.hue
      });

      checkCamera();
      spawnNextBlock();
    } else {
      // Complete miss! Game Over!
      isGameOver = true;
      hideComboBadge();
      playSound('gameover');

      // The entire moving block falls off
      fallingDebris.push({
        x: currentBlock.x,
        y: currentBlock.y,
        width: currentBlock.width,
        vy: 2,
        rot: 0,
        vRot: (currentBlock.vx > 0 ? 1 : -1) * 0.08,
        hue: currentBlock.hue
      });
      currentBlock = null;

      handleGameOver();
    }

    updateUI();
    saveState();
  }

  function checkCamera() {
    if (stack.length > 8) {
      targetCameraY = (stack.length - 8) * BLOCK_HEIGHT;
    }
  }

  function showComboBadge(cnt) {
    comboBadge.textContent = 'PERFECT! x' + cnt;
    comboBadge.classList.add('show');
    clearTimeout(comboBadge._timer);
    comboBadge._timer = setTimeout(function () {
      comboBadge.classList.remove('show');
    }, 1200);
  }

  function hideComboBadge() {
    comboBadge.classList.remove('show');
  }

  function updateUI() {
    scoreText.textContent = score;
    if (score > bestScore) {
      bestScore = score;
      saveBestScore();
    }
    bestScoreText.textContent = bestScore;
  }

  function handleGameOver() {
    var isNewRecord = (score >= bestScore && score > 0);
    setTimeout(function () {
      modalEmoji.textContent = isNewRecord ? '🏆' : '🏗️';
      modalTitle.textContent = isNewRecord ? '打破最高纪录！' : '塔楼坍塌！';
      modalDesc.textContent = '最终高度: ' + score + ' 层' + (isNewRecord ? ' (新纪录！)' : ' · 历史最佳: ' + bestScore + ' 层');
      modal.classList.add('show');
    }, 600);
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

  // Draw 2.5D styled block
  function drawBlock(x, y, w, h, hue) {
    ctx.save();
    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;

    // Main Face
    ctx.fillStyle = 'hsl(' + hue + ', 80%, 55%)';
    ctx.fillRect(x, y, w, h);

    ctx.restore();

    // Top highlight rim
    ctx.fillStyle = 'hsl(' + hue + ', 85%, 72%)';
    ctx.fillRect(x, y, w, 3);

    // Bottom bevel shadow
    ctx.fillStyle = 'hsl(' + hue + ', 80%, 38%)';
    ctx.fillRect(x, y + h - 3, w, 3);
  }

  // Render loop
  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Smooth camera lerp
    cameraY += (targetCameraY - cameraY) * 0.1;

    ctx.save();
    ctx.translate(0, cameraY);

    // Draw stack blocks
    for (var i = 0; i < stack.length; i++) {
      var b = stack[i];
      drawBlock(b.x, b.y, b.width, BLOCK_HEIGHT, b.hue);
    }

    // Update & Draw current moving block
    if (currentBlock && !isGameOver) {
      currentBlock.x += currentBlock.vx;
      if (currentBlock.x <= 0) {
        currentBlock.x = 0;
        currentBlock.vx = -currentBlock.vx;
      } else if (currentBlock.x + currentBlock.width >= WIDTH) {
        currentBlock.x = WIDTH - currentBlock.width;
        currentBlock.vx = -currentBlock.vx;
      }

      drawBlock(currentBlock.x, currentBlock.y, currentBlock.width, BLOCK_HEIGHT, currentBlock.hue);
    }

    // Update & Draw falling debris
    for (var d = fallingDebris.length - 1; d >= 0; d--) {
      var deb = fallingDebris[d];
      deb.y += deb.vy;
      deb.vy += 0.55; // gravity
      deb.rot += deb.vRot;

      ctx.save();
      ctx.translate(deb.x + deb.width / 2, deb.y + BLOCK_HEIGHT / 2);
      ctx.rotate(deb.rot);
      drawBlock(-deb.width / 2, -BLOCK_HEIGHT / 2, deb.width, BLOCK_HEIGHT, deb.hue);
      ctx.restore();

      if (deb.y > HEIGHT + 100 - cameraY) {
        fallingDebris.splice(d, 1);
      }
    }

    ctx.restore();

    animationId = requestAnimationFrame(render);
  }

  function saveState() {
    try {
      var state = {
        stack: stack,
        score: score,
        combo: combo,
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
        if (state && Array.isArray(state.stack) && state.stack.length > 0) {
          stack = state.stack;
          score = state.score || 0;
          combo = state.combo || 0;
          isGameOver = !!state.isGameOver;
          checkCamera();
          if (!isGameOver) spawnNextBlock();
          updateUI();
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // Event Listeners
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    placeBlock();
  });

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space') {
      e.preventDefault();
      placeBlock();
    }
  });

  restartBtn.addEventListener('click', initGame);
  modalRestartBtn.addEventListener('click', initGame);

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  // Init
  loadBestScore();
  if (!loadState()) {
    initGame();
  }
  animationId = requestAnimationFrame(render);
})();
