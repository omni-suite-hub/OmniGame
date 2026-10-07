/*
 * games/piano-tiles/game.js
 * 别踩白块儿 (Piano Tiles)
 *
 * 4-track rhythm reflex game featuring real-time Web Audio piano synthesis
 * playing Beethoven's "Für Elise" and Johann Pachelbel's "Canon in D".
 */
(function () {
  'use strict';

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('scoreVal');
  var bestEl = document.getElementById('bestVal');
  var soundBtn = document.getElementById('soundBtn');
  var restartBtn = document.getElementById('restartBtn');
  var startOverlay = document.getElementById('startOverlay');
  var modal = document.getElementById('modalOverlay');
  var modalTitle = document.getElementById('modalTitle');
  var finalScoreEl = document.getElementById('finalScore');
  var finalBestEl = document.getElementById('finalBest');
  var playAgainBtn = document.getElementById('playAgainBtn');
  var keyCaps = document.querySelectorAll('.key-cap');

  var LOGICAL_W = 360;
  var LOGICAL_H = 580;
  var NUM_COLS = 4;
  var COL_W = LOGICAL_W / NUM_COLS;
  var TILE_H = 145;

  var dpr = window.devicePixelRatio || 1;
  function setupDpr() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(LOGICAL_W * dpr);
    canvas.height = Math.round(LOGICAL_H * dpr);
  }
  setupDpr();
  window.addEventListener('resize', setupDpr);

  // ---- Audio Engine (Acoustic Piano Synthesizer) ----------------------------
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

  // Für Elise note frequencies
  var MELODY = [
    659.25, 622.25, 659.25, 622.25, 659.25, 493.88, 587.33, 523.25, 440.00,
    261.63, 329.63, 440.00, 493.88,
    329.63, 415.30, 493.88, 523.25,
    329.63, 659.25, 622.25, 659.25, 622.25, 659.25, 493.88, 587.33, 523.25, 440.00,
    261.63, 329.63, 440.00, 493.88,
    329.63, 523.25, 493.88, 440.00,
    493.88, 523.25, 587.33, 659.25,
    392.00, 698.46, 659.25, 587.33,
    349.23, 659.25, 587.33, 523.25,
    329.63, 587.33, 523.25, 493.88
  ];
  var noteIndex = 0;

  function playPianoNote(freq) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;

    var now = audioCtx.currentTime;

    // Voice 1 (Fundamental tone)
    var osc1 = audioCtx.createOscillator();
    var gain1 = audioCtx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, now);

    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(0.35, now + 0.008); // fast acoustic attack
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.65); // natural decay

    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.65);

    // Voice 2 (Gentle octave overtone for warmth)
    var osc2 = audioCtx.createOscillator();
    var gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, now);

    gain2.gain.setValueAtTime(0.001, now);
    gain2.gain.linearRampToValueAtTime(0.12, now + 0.006);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now);
    osc2.stop(now + 0.35);
  }

  function playErrorSound() {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;

    var now = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.linearRampToValueAtTime(40, now + 0.28);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  try {
    var storedSound = localStorage.getItem('omg:piano:sound');
    if (storedSound !== null) soundEnabled = storedSound === '1';
  } catch (e) {}
  soundBtn.textContent = soundEnabled ? '🔊' : '🔇';

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
    try {
      localStorage.setItem('omg:piano:sound', soundEnabled ? '1' : '0');
    } catch (e) {}
  });

  // ---- High Score Persistence -----------------------------------------------
  var bestScore = 0;
  function loadBestScore() {
    if (window.GameStore && typeof window.GameStore.getBest === 'function') {
      window.GameStore.getBest('piano-tiles').then(function (val) {
        bestScore = val || 0;
        bestEl.textContent = bestScore;
      });
    } else {
      try {
        bestScore = parseInt(localStorage.getItem('omg:best:piano-tiles') || '0', 10);
        bestEl.textContent = bestScore;
      } catch (e) {}
    }
  }

  function saveBestScore(sc) {
    if (sc > bestScore) {
      bestScore = sc;
      bestEl.textContent = bestScore;
      if (window.GameStore && typeof window.GameStore.saveBest === 'function') {
        window.GameStore.saveBest('piano-tiles', bestScore);
      } else {
        try {
          localStorage.setItem('omg:best:piano-tiles', String(bestScore));
        } catch (e) {}
      }
    }
  }

  // ---- Game State & Rows ----------------------------------------------------
  var gameState = 'ready'; // ready | playing | over
  var score = 0;
  var speed = 3.6;
  var rows = []; // array of { y, col, clicked, fail }
  var ripples = [];
  var nextRowId = 0;

  function initRows() {
    rows = [];
    nextRowId = 0;
    noteIndex = 0;
    // Initial 5 rows, from bottom to top
    // Bottom-most tile sits around y = LOGICAL_H - TILE_H - 40
    var startY = LOGICAL_H - TILE_H - 20;
    for (var r = 0; r < 6; r++) {
      var col = Math.floor(Math.random() * NUM_COLS);
      rows.push({
        id: nextRowId++,
        col: col,
        y: startY - r * TILE_H,
        h: TILE_H,
        clicked: false,
        fail: false
      });
    }
  }

  function resetGame() {
    gameState = 'ready';
    score = 0;
    speed = 3.6;
    scoreEl.textContent = '0';
    ripples = [];
    initRows();
    modal.classList.add('hidden');
    startOverlay.style.display = 'block';
  }

  // ---- User Hit Detection ---------------------------------------------------
  function handleColTap(colIndex) {
    // Flash keyboard hint UI
    if (keyCaps[colIndex]) {
      keyCaps[colIndex].classList.add('active');
      setTimeout(function () {
        keyCaps[colIndex].classList.remove('active');
      }, 120);
    }

    if (gameState === 'over') return;

    // Find the lowest unclicked black tile
    var targetTile = null;
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i].clicked) {
        targetTile = rows[i];
        break;
      }
    }

    if (!targetTile) return;

    if (targetTile.col === colIndex) {
      // SUCCESS HIT!
      targetTile.clicked = true;
      score += 1;
      scoreEl.textContent = score;

      // Play note
      var freq = MELODY[noteIndex % MELODY.length];
      noteIndex++;
      playPianoNote(freq);

      // Ripple particle
      ripples.push({
        x: colIndex * COL_W + COL_W / 2,
        y: targetTile.y + TILE_H / 2,
        r: 10,
        maxR: COL_W * 0.9,
        alpha: 0.8
      });

      if (gameState === 'ready') {
        gameState = 'playing';
        startOverlay.style.display = 'none';
      }

      // Smooth acceleration
      speed = Math.min(9.5, 3.6 + (score * 0.08));
    } else {
      // MISSED! Clicked the wrong column
      targetTile.fail = true;
      triggerGameOver('踩到白块了！');
    }
  }

  function triggerGameOver(reason) {
    if (gameState === 'over') return;
    gameState = 'over';
    playErrorSound();
    saveBestScore(score);

    modalTitle.textContent = reason || '游戏结束';
    finalScoreEl.textContent = score;
    finalBestEl.textContent = bestScore;
    modal.classList.remove('hidden');
  }

  // ---- Controls / Event Listeners -------------------------------------------
  window.addEventListener('keydown', function (e) {
    var key = e.key.toUpperCase();
    var code = e.code;
    if (code === 'KeyD' || key === 'D' || code === 'Digit1') handleColTap(0);
    else if (code === 'KeyF' || key === 'F' || code === 'Digit2') handleColTap(1);
    else if (code === 'KeyJ' || key === 'J' || code === 'Digit3') handleColTap(2);
    else if (code === 'KeyK' || key === 'K' || code === 'Digit4') handleColTap(3);
    else if (e.code === 'Enter' && gameState === 'over') resetGame();
  });

  function getColFromEvent(e) {
    var rect = canvas.getBoundingClientRect();
    var clientX = e.clientX;
    if (e.touches && e.touches.length > 0) clientX = e.touches[0].clientX;
    var scaleX = LOGICAL_W / rect.width;
    var localX = (clientX - rect.left) * scaleX;
    return Math.max(0, Math.min(NUM_COLS - 1, Math.floor(localX / COL_W)));
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (gameState === 'over') return;
    var col = getColFromEvent(e);
    handleColTap(col);
  });

  restartBtn.addEventListener('click', resetGame);
  playAgainBtn.addEventListener('click', resetGame);

  // ---- Update ---------------------------------------------------------------
  function update() {
    if (gameState === 'playing') {
      // Scroll rows down
      for (var i = 0; i < rows.length; i++) {
        rows[i].y += speed;

        // Check if unclicked black tile fell past bottom of screen
        if (!rows[i].clicked && rows[i].y > LOGICAL_H - 10) {
          rows[i].fail = true;
          triggerGameOver('漏掉黑块了！');
          return;
        }
      }

      // Remove bottom rows that have scrolled off-screen
      while (rows.length > 0 && rows[0].y > LOGICAL_H + 20) {
        rows.shift();
      }

      // Spawn new rows at top
      var topRow = rows[rows.length - 1];
      if (topRow && topRow.y > -TILE_H) {
        var newCol = Math.floor(Math.random() * NUM_COLS);
        rows.push({
          id: nextRowId++,
          col: newCol,
          y: topRow.y - TILE_H,
          h: TILE_H,
          clicked: false,
          fail: false
        });
      }
    }

    // Update ripples
    for (var r = ripples.length - 1; r >= 0; r--) {
      var rip = ripples[r];
      rip.r += 4.5;
      rip.alpha -= 0.04;
      if (rip.alpha <= 0) ripples.splice(r, 1);
    }
  }

  // ---- Rendering ------------------------------------------------------------
  function render() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

    // 1. Background White Keys
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // Vertical Divider Lines
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    for (var c = 1; c < NUM_COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * COL_W, 0);
      ctx.lineTo(c * COL_W, LOGICAL_H);
      ctx.stroke();
    }

    // 2. Render Tiles
    for (var i = 0; i < rows.length; i++) {
      var tile = rows[i];
      var tx = tile.col * COL_W;
      var ty = tile.y;
      var tw = COL_W;
      var th = tile.h;

      if (tile.fail) {
        // Red failed tile
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(tx + 2, ty + 2, tw - 4, th - 4);
      } else if (tile.clicked) {
        // Clicked state: soft translucent cyan
        ctx.fillStyle = '#e0f2fe';
        ctx.fillRect(tx + 2, ty + 2, tw - 4, th - 4);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(tx + 2, ty + 2, tw - 4, th - 4);
      } else {
        // Unclicked Black Piano Tile
        var grad = ctx.createLinearGradient(tx, ty, tx, ty + th);
        grad.addColorStop(0, '#1e293b');
        grad.addColorStop(1, '#090d16');
        ctx.fillStyle = grad;
        ctx.fillRect(tx + 2, ty + 2, tw - 4, th - 4);

        // Glossy bevel highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(tx + 4, ty + 4, tw - 8, 4);

        // First tile indicator if ready
        if (gameState === 'ready' && i === 0) {
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 15px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('开始', tx + tw / 2, ty + th / 2 + 5);
        }
      }

      // Horizontal Row Boundary Line
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, ty + th);
      ctx.lineTo(LOGICAL_W, ty + th);
      ctx.stroke();
    }

    // 3. Ripple Particles
    for (var rp = 0; rp < ripples.length; rp++) {
      var rip = ripples[rp];
      ctx.save();
      ctx.globalAlpha = rip.alpha;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  // ---- Main Loop ------------------------------------------------------------
  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  // ---- Bootstrap ------------------------------------------------------------
  loadBestScore();
  resetGame();
  requestAnimationFrame(loop);
})();
