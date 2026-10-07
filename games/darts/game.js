/**
 * OmniGame - 经典飞镖 (Darts 301)
 * Pure vanilla JS, official 20-sector dartboard geometry, tremor oscillation aim, Web Audio.
 */
(function () {
  'use strict';

  // --- Audio Synthesizer ---
  var AudioSys = {
    ctx: null,
    enabled: true,
    init: function () {
      if (!this.ctx) {
        try {
          var AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) this.ctx = new AudioCtx();
        } catch (e) {}
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(function () {});
      }
    },
    playTone: function (freq, type, duration, gainVal, startDelay) {
      if (!this.enabled || !this.ctx) return;
      try {
        var now = this.ctx.currentTime + (startDelay || 0);
        var osc = this.ctx.createOscillator();
        var gain = this.ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(gainVal || 0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration);
      } catch (e) {}
    },
    throwDart: function () {
      this.playTone(400, 'triangle', 0.08, 0.1);
      this.playTone(250, 'sine', 0.1, 0.08, 0.02);
    },
    hitBoard: function () {
      this.playTone(180, 'triangle', 0.06, 0.25);
      this.playTone(90, 'sine', 0.1, 0.3, 0.01);
    },
    bullseye: function () {
      var notes = [523.25, 659.25, 783.99, 1046.5];
      var self = this;
      notes.forEach(function (f, i) {
        self.playTone(f, 'triangle', 0.18, 0.2, i * 0.06);
      });
    },
    bust: function () {
      this.playTone(160, 'sawtooth', 0.25, 0.2);
      this.playTone(130, 'sawtooth', 0.3, 0.2, 0.08);
    },
    victory: function () {
      var notes = [440, 554.37, 659.25, 880, 1108.73];
      var self = this;
      notes.forEach(function (f, i) {
        self.playTone(f, 'sine', 0.25, 0.2, i * 0.08);
      });
    }
  };

  // --- Official Dartboard Constants ---
  var SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

  // --- Canvas & DOM ---
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var wrapper = document.getElementById('canvasWrapper');

  var elements = {
    targetScoreText: document.getElementById('targetScoreText'),
    roundHitText: document.getElementById('roundHitText'),
    dartsLeftContainer: document.getElementById('dartsLeftContainer'),
    soundBtn: document.getElementById('soundBtn'),
    restartBtn: document.getElementById('restartBtn'),
    modal: document.getElementById('gameOverModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalDesc: document.getElementById('modalDesc'),
    modalRestartBtn: document.getElementById('modalRestartBtn')
  };

  // --- Game State ---
  var state = {
    width: 360,
    height: 360,
    dpr: 1,
    currentScore: 301,
    turnStartScore: 301,
    dartsInTurn: 3,
    totalThrows: 0,
    gameOver: false,
    cursorX: 180,
    cursorY: 180,
    isAiming: false,
    dartsOnBoard: [], // [{ x, y, score, text }]
    flyingDart: null // { startX, startY, endX, endY, progress, score, text }
  };

  function resizeCanvas() {
    var rect = wrapper.getBoundingClientRect();
    state.width = rect.width;
    state.height = rect.height;
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = state.width * state.dpr;
    canvas.height = state.height * state.dpr;
    ctx.scale(state.dpr, state.dpr);

    state.cursorX = state.width / 2;
    state.cursorY = state.height / 2;
  }

  // --- Calculate Hit Points ---
  function calculateHit(x, y) {
    var cx = state.width / 2;
    var cy = state.height / 2;
    var R = Math.min(state.width, state.height) * 0.42;

    var dx = x - cx;
    var dy = y - cy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var ratio = dist / R;

    // Off board
    if (ratio > 1.0) {
      return { score: 0, text: '脱靶 (0分)' };
    }

    // Inner Bull (50 pts)
    if (ratio <= 0.05) {
      return { score: 50, text: '双倍红心 (50分)' };
    }

    // Outer Bull (25 pts)
    if (ratio <= 0.11) {
      return { score: 25, text: '外圈绿心 (25分)' };
    }

    // Calculate Sector angle
    var angle = Math.atan2(dy, dx); // [-PI, PI]
    // 20 is at -PI/2. Shift so 20 sector center is 0
    var shifted = angle + Math.PI / 2 + (Math.PI / 20);
    while (shifted < 0) shifted += Math.PI * 2;
    while (shifted >= Math.PI * 2) shifted -= Math.PI * 2;

    var sectorIndex = Math.floor(shifted / (Math.PI / 10)) % 20;
    var baseVal = SECTORS[sectorIndex];

    // Triple Ring
    if (ratio >= 0.52 && ratio <= 0.60) {
      return { score: baseVal * 3, text: '三倍区 ' + baseVal + ' (' + (baseVal * 3) + '分)' };
    }

    // Double Ring
    if (ratio >= 0.92 && ratio <= 1.0) {
      return { score: baseVal * 2, text: '双倍区 ' + baseVal + ' (' + (baseVal * 2) + '分)' };
    }

    // Single Bed
    return { score: baseVal, text: '单倍区 ' + baseVal + ' (' + baseVal + '分)' };
  }

  // --- Throw Dart ---
  function throwAtCursor() {
    if (state.gameOver || state.flyingDart) return;
    AudioSys.init();
    AudioSys.throwDart();

    state.totalThrows++;
    state.dartsInTurn--;
    updateDartsUI();

    // Natural jitter
    var jitterX = (Math.random() - 0.5) * 14;
    var jitterY = (Math.random() - 0.5) * 14;
    var targetX = state.cursorX + jitterX;
    var targetY = state.cursorY + jitterY;

    var hit = calculateHit(targetX, targetY);

    state.flyingDart = {
      startX: state.width / 2,
      startY: state.height + 40,
      endX: targetX,
      endY: targetY,
      progress: 0,
      hit: hit
    };
  }

  function onDartLanded(hit, landX, landY) {
    AudioSys.hitBoard();

    state.dartsOnBoard.push({
      x: landX,
      y: landY,
      score: hit.score,
      text: hit.text
    });

    elements.roundHitText.textContent = hit.text;

    if (hit.score === 50 || hit.score === 60) {
      AudioSys.bullseye();
    }

    // Check 301 Score Rules
    var newScore = state.currentScore - hit.score;
    if (newScore === 0) {
      // Victory!
      state.currentScore = 0;
      elements.targetScoreText.textContent = '0';
      triggerVictory();
      return;
    } else if (newScore < 0) {
      // Bust! Overthrown
      AudioSys.bust();
      elements.roundHitText.textContent = '爆镖！(分值恢复)';
      state.currentScore = state.turnStartScore;
      state.dartsInTurn = 0; // End turn immediately
    } else {
      // Valid hit
      state.currentScore = newScore;
      elements.targetScoreText.textContent = state.currentScore;
    }

    // Check if turn ends (3 darts thrown)
    if (state.dartsInTurn <= 0) {
      setTimeout(function () {
        state.dartsInTurn = 3;
        state.turnStartScore = state.currentScore;
        state.dartsOnBoard = [];
        updateDartsUI();
      }, 900);
    }
  }

  function updateDartsUI() {
    var icons = elements.dartsLeftContainer.querySelectorAll('.dart-icon');
    icons.forEach(function (ic, i) {
      if (i < state.dartsInTurn) {
        ic.classList.remove('thrown');
      } else {
        ic.classList.add('thrown');
      }
    });
  }

  function triggerVictory() {
    state.gameOver = true;
    AudioSys.victory();

    try {
      var best = parseInt(localStorage.getItem('omg:save:darts') || '999', 10);
      if (state.totalThrows < best) {
        localStorage.setItem('omg:save:darts', state.totalThrows.toString());
      }
    } catch (e) {}

    elements.modalTitle.textContent = '🎯 完美结镖！大获全胜！';
    elements.modalDesc.textContent = '总共投掷 ' + state.totalThrows + ' 镖清零 301 分！';
    elements.modal.classList.add('active');
  }

  function initGame() {
    AudioSys.init();
    state.currentScore = 301;
    state.turnStartScore = 301;
    state.dartsInTurn = 3;
    state.totalThrows = 0;
    state.gameOver = false;
    state.dartsOnBoard = [];
    state.flyingDart = null;

    elements.targetScoreText.textContent = '301';
    elements.roundHitText.textContent = '-';
    updateDartsUI();
    elements.modal.classList.remove('active');
  }

  // --- Rendering ---
  function drawDartboard() {
    var cx = state.width / 2;
    var cy = state.height / 2;
    var R = Math.min(state.width, state.height) * 0.42;

    // Outer Board Ring
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.15, 0, Math.PI * 2);
    ctx.fillStyle = '#0c0a09';
    ctx.fill();
    ctx.strokeStyle = '#292524';
    ctx.lineWidth = 4;
    ctx.stroke();

    // 20 Sectors
    var segAngle = Math.PI / 10;
    for (var i = 0; i < 20; i++) {
      var startA = -Math.PI / 2 - segAngle / 2 + i * segAngle;
      var endA = startA + segAngle;
      var isEven = i % 2 === 0;

      // Single bed (outer & inner)
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, startA, endA);
      ctx.closePath();
      ctx.fillStyle = isEven ? '#1c1917' : '#f5f5f4';
      ctx.fill();

      // Double ring arc
      ctx.beginPath();
      ctx.arc(cx, cy, R, startA, endA);
      ctx.arc(cx, cy, R * 0.92, endA, startA, true);
      ctx.closePath();
      ctx.fillStyle = isEven ? '#dc2626' : '#16a34a';
      ctx.fill();

      // Triple ring arc
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.60, startA, endA);
      ctx.arc(cx, cy, R * 0.52, endA, startA, true);
      ctx.closePath();
      ctx.fillStyle = isEven ? '#dc2626' : '#16a34a';
      ctx.fill();

      // Number labels on outer black ring
      var labelA = startA + segAngle / 2;
      var lx = cx + Math.cos(labelA) * (R * 1.07);
      var ly = cy + Math.sin(labelA) * (R * 1.07);
      ctx.save();
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(SECTORS[i], lx, ly);
      ctx.restore();
    }

    // Outer Bull (Green)
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.11, 0, Math.PI * 2);
    ctx.fillStyle = '#16a34a';
    ctx.fill();

    // Inner Bull (Red)
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = '#dc2626';
    ctx.fill();

    // Wire divider circles
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    [R, R * 0.92, R * 0.60, R * 0.52, R * 0.11, R * 0.05].forEach(function (r) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  function drawDarts() {
    // 1. Placed Darts
    state.dartsOnBoard.forEach(function (d) {
      ctx.save();
      ctx.translate(d.x, d.y);
      // Dart tip & shadow
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(12, 14);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Dart flight fins
      ctx.beginPath();
      ctx.moveTo(12, 14);
      ctx.lineTo(18, 12);
      ctx.lineTo(14, 20);
      ctx.closePath();
      ctx.fillStyle = '#facc15';
      ctx.fill();
      ctx.restore();
    });

    // 2. Flying Dart
    if (state.flyingDart) {
      var fd = state.flyingDart;
      fd.progress += 0.12;

      var curX = fd.startX + (fd.endX - fd.startX) * fd.progress;
      var curY = fd.startY + (fd.endY - fd.startY) * fd.progress;
      var scale = 2.0 - fd.progress * 1.0;

      ctx.save();
      ctx.translate(curX, curY);
      ctx.scale(scale, scale);

      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(14, 16);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.restore();

      if (fd.progress >= 1.0) {
        onDartLanded(fd.hit, fd.endX, fd.endY);
        state.flyingDart = null;
      }
    }
  }

  function drawCrosshair() {
    if (state.gameOver || state.flyingDart) return;
    var t = Date.now() * 0.003;
    var swayX = Math.sin(t) * 5;
    var swayY = Math.cos(t * 1.3) * 5;

    var aimX = state.cursorX + swayX;
    var aimY = state.cursorY + swayY;

    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(aimX, aimY, 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(aimX - 20, aimY);
    ctx.lineTo(aimX + 20, aimY);
    ctx.moveTo(aimX, aimY - 20);
    ctx.lineTo(aimX, aimY + 20);
    ctx.stroke();
    ctx.restore();
  }

  function loop() {
    ctx.save();
    ctx.clearRect(0, 0, state.width, state.height);
    drawDartboard();
    drawDarts();
    drawCrosshair();
    ctx.restore();
    requestAnimationFrame(loop);
  }

  // --- Input Handlers ---
  function updateCursorPos(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    state.cursorX = clientX - rect.left;
    state.cursorY = clientY - rect.top;
  }

  wrapper.addEventListener('mousemove', function (e) {
    updateCursorPos(e.clientX, e.clientY);
  });

  wrapper.addEventListener('click', function (e) {
    updateCursorPos(e.clientX, e.clientY);
    throwAtCursor();
  });

  wrapper.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches.length > 0) {
      updateCursorPos(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  wrapper.addEventListener('touchstart', function (e) {
    if (e.touches && e.touches.length > 0) {
      updateCursorPos(e.touches[0].clientX, e.touches[0].clientY);
      throwAtCursor();
    }
  }, { passive: true });

  elements.soundBtn.addEventListener('click', function () {
    AudioSys.enabled = !AudioSys.enabled;
    elements.soundBtn.textContent = AudioSys.enabled ? '🔊' : '🔇';
  });

  elements.restartBtn.addEventListener('click', initGame);
  elements.modalRestartBtn.addEventListener('click', initGame);

  window.addEventListener('resize', resizeCanvas);

  // Init
  resizeCanvas();
  initGame();
  requestAnimationFrame(loop);
})();
