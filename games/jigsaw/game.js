/**
 * OmniGame - 艺术拼图 (Jigsaw Puzzle)
 * Pure vanilla JS, procedural Canvas landscapes, drag-and-drop & tap placement, Web Audio.
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
    pick: function () {
      this.playTone(420, 'triangle', 0.05, 0.12);
    },
    snap: function () {
      this.playTone(523.25, 'sine', 0.08, 0.18);
      this.playTone(659.25, 'triangle', 0.12, 0.2, 0.03);
    },
    wrong: function () {
      this.playTone(240, 'sawtooth', 0.08, 0.1);
    },
    victory: function () {
      var notes = [440, 554.37, 659.25, 880];
      var self = this;
      notes.forEach(function (f, i) {
        self.playTone(f, 'triangle', 0.22, 0.2, i * 0.08);
      });
    }
  };

  // --- Procedural Artwork Generation ---
  var ART_SIZE = 600;

  function generateArtworkCanvas(theme) {
    var c = document.createElement('canvas');
    c.width = ART_SIZE;
    c.height = ART_SIZE;
    var g = c.getContext('2d');

    if (theme === 'sunset') {
      // Sky
      var skyGrad = g.createLinearGradient(0, 0, 0, ART_SIZE);
      skyGrad.addColorStop(0, '#f97316');
      skyGrad.addColorStop(0.35, '#fb923c');
      skyGrad.addColorStop(0.65, '#f43f5e');
      skyGrad.addColorStop(1, '#4c0519');
      g.fillStyle = skyGrad;
      g.fillRect(0, 0, ART_SIZE, ART_SIZE);

      // Golden Sun
      g.beginPath();
      g.arc(ART_SIZE * 0.5, ART_SIZE * 0.45, 90, 0, Math.PI * 2);
      g.fillStyle = '#fef08a';
      g.shadowColor = '#fbbf24';
      g.shadowBlur = 40;
      g.fill();
      g.shadowBlur = 0;

      // Distant Mountains
      g.fillStyle = '#831843';
      g.beginPath();
      g.moveTo(0, ART_SIZE * 0.65);
      g.lineTo(150, ART_SIZE * 0.48);
      g.lineTo(300, ART_SIZE * 0.62);
      g.lineTo(460, ART_SIZE * 0.44);
      g.lineTo(ART_SIZE, ART_SIZE * 0.68);
      g.lineTo(ART_SIZE, ART_SIZE);
      g.lineTo(0, ART_SIZE);
      g.fill();

      // Foreground Hills
      g.fillStyle = '#4a044e';
      g.beginPath();
      g.moveTo(0, ART_SIZE * 0.78);
      g.quadraticCurveTo(240, ART_SIZE * 0.62, ART_SIZE, ART_SIZE * 0.82);
      g.lineTo(ART_SIZE, ART_SIZE);
      g.lineTo(0, ART_SIZE);
      g.fill();

      // Flying Birds
      g.strokeStyle = '#2e1065';
      g.lineWidth = 4;
      g.lineCap = 'round';
      [[180, 160], [220, 140], [380, 190]].forEach(function (pt) {
        g.beginPath();
        g.arc(pt[0] - 12, pt[1], 12, Math.PI, Math.PI * 1.8);
        g.stroke();
        g.beginPath();
        g.arc(pt[0] + 12, pt[1], 12, Math.PI * 1.2, 0);
        g.stroke();
      });

    } else if (theme === 'galaxy') {
      // Cosmic Night
      var cosmicGrad = g.createLinearGradient(0, 0, ART_SIZE, ART_SIZE);
      cosmicGrad.addColorStop(0, '#030712');
      cosmicGrad.addColorStop(0.5, '#1e1b4b');
      cosmicGrad.addColorStop(1, '#3b0764');
      g.fillStyle = cosmicGrad;
      g.fillRect(0, 0, ART_SIZE, ART_SIZE);

      // Aurora Waves
      g.save();
      g.globalAlpha = 0.4;
      var aurora = g.createRadialGradient(280, 260, 40, 300, 300, 260);
      aurora.addColorStop(0, '#34d399');
      aurora.addColorStop(0.5, '#06b6d4');
      aurora.addColorStop(1, 'transparent');
      g.fillStyle = aurora;
      g.fillRect(0, 0, ART_SIZE, ART_SIZE);
      g.restore();

      // Giant Planet
      g.beginPath();
      g.arc(ART_SIZE * 0.72, ART_SIZE * 0.3, 75, 0, Math.PI * 2);
      var planetGrad = g.createLinearGradient(ART_SIZE * 0.6, ART_SIZE * 0.2, ART_SIZE * 0.8, ART_SIZE * 0.4);
      planetGrad.addColorStop(0, '#c084fc');
      planetGrad.addColorStop(1, '#4c1d95');
      g.fillStyle = planetGrad;
      g.shadowColor = '#c084fc';
      g.shadowBlur = 25;
      g.fill();
      g.shadowBlur = 0;

      // Stars
      g.fillStyle = '#ffffff';
      for (var s = 0; s < 70; s++) {
        var sx = (s * 73) % ART_SIZE;
        var sy = (s * 97) % ART_SIZE;
        var sr = (s % 3 === 0) ? 2.5 : 1.2;
        g.beginPath();
        g.arc(sx, sy, sr, 0, Math.PI * 2);
        g.fill();
      }

    } else { // 'mountain'
      // Morning Sky
      var mGrad = g.createLinearGradient(0, 0, 0, ART_SIZE);
      mGrad.addColorStop(0, '#38bdf8');
      mGrad.addColorStop(0.4, '#bae6fd');
      mGrad.addColorStop(0.7, '#fef08a');
      mGrad.addColorStop(1, '#fed7aa');
      g.fillStyle = mGrad;
      g.fillRect(0, 0, ART_SIZE, ART_SIZE);

      // Sun
      g.beginPath();
      g.arc(140, 120, 50, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.shadowColor = '#fed7aa';
      g.shadowBlur = 30;
      g.fill();
      g.shadowBlur = 0;

      // Snow Peak 1
      g.fillStyle = '#0284c7';
      g.beginPath();
      g.moveTo(120, ART_SIZE * 0.75);
      g.lineTo(320, ART_SIZE * 0.25);
      g.lineTo(520, ART_SIZE * 0.75);
      g.closePath();
      g.fill();

      // Snow Cap
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(270, ART_SIZE * 0.38);
      g.lineTo(320, ART_SIZE * 0.25);
      g.lineTo(370, ART_SIZE * 0.38);
      g.lineTo(340, ART_SIZE * 0.43);
      g.lineTo(320, ART_SIZE * 0.40);
      g.lineTo(300, ART_SIZE * 0.44);
      g.closePath();
      g.fill();

      // Lake Foreground
      var lake = g.createLinearGradient(0, ART_SIZE * 0.75, 0, ART_SIZE);
      lake.addColorStop(0, '#0369a1');
      lake.addColorStop(1, '#0c4a6e');
      g.fillStyle = lake;
      g.fillRect(0, ART_SIZE * 0.75, ART_SIZE, ART_SIZE * 0.25);
    }

    return c;
  }

  // --- DOM Elements ---
  var elements = {
    puzzleBoard: document.getElementById('puzzleBoard'),
    piecesTray: document.getElementById('piecesTray'),
    previewOverlay: document.getElementById('previewOverlay'),
    progressText: document.getElementById('progressText'),
    movesText: document.getElementById('movesText'),
    timerText: document.getElementById('timerText'),
    soundBtn: document.getElementById('soundBtn'),
    previewBtn: document.getElementById('previewBtn'),
    restartBtn: document.getElementById('restartBtn'),
    themeBtns: Array.from(document.querySelectorAll('.theme-btn')),
    modal: document.getElementById('victoryModal'),
    modalDesc: document.getElementById('modalDesc'),
    modalRestartBtn: document.getElementById('modalRestartBtn')
  };

  // --- Game State ---
  var state = {
    gridSize: 3, // 3x3 = 9 pieces
    theme: 'sunset',
    slots: [], // Array of 9 slot objects: { row, col, pieceId: null }
    pieces: [], // Array of 9 piece objects: { id, targetSlot, currentSlot, dataUrl }
    selectedPieceId: null,
    placedCount: 0,
    moves: 0,
    timer: 0,
    timerInterval: null,
    isWon: false,
    previewShown: false
  };

  // --- Game Initialization ---
  function initGame() {
    AudioSys.init();
    clearInterval(state.timerInterval);
    state.isWon = false;
    state.placedCount = 0;
    state.moves = 0;
    state.timer = 0;
    state.selectedPieceId = null;

    elements.progressText.textContent = '0 / 9';
    elements.movesText.textContent = '0';
    elements.timerText.textContent = '00:00';
    elements.modal.classList.remove('active');

    // Generate artwork
    var artCanvas = generateArtworkCanvas(state.theme);
    var artDataUrl = artCanvas.toDataURL('image/jpeg', 0.9);
    elements.previewOverlay.style.backgroundImage = 'url(' + artDataUrl + ')';

    // Slice into 3x3 pieces
    var tileSize = ART_SIZE / state.gridSize;
    state.pieces = [];
    state.slots = [];

    var pieceIdx = 0;
    for (var r = 0; r < state.gridSize; r++) {
      for (var c = 0; c < state.gridSize; c++) {
        var tileCanvas = document.createElement('canvas');
        tileCanvas.width = tileSize;
        tileCanvas.height = tileSize;
        var tg = tileCanvas.getContext('2d');
        tg.drawImage(artCanvas, c * tileSize, r * tileSize, tileSize, tileSize, 0, 0, tileSize, tileSize);

        state.pieces.push({
          id: pieceIdx,
          targetRow: r,
          targetCol: c,
          currentSlot: null, // null means in tray
          dataUrl: tileCanvas.toDataURL('image/jpeg', 0.9)
        });

        state.slots.push({
          id: pieceIdx,
          row: r,
          col: c,
          pieceId: null
        });

        pieceIdx++;
      }
    }

    // Shuffle pieces for tray
    state.pieces.sort(function () { return Math.random() - 0.5; });

    renderBoard();
    renderTray();

    state.timerInterval = setInterval(function () {
      if (!state.isWon) {
        state.timer++;
        var m = Math.floor(state.timer / 60);
        var s = state.timer % 60;
        elements.timerText.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      }
    }, 1000);
  }

  // --- Render Board & Tray ---
  function renderBoard() {
    elements.puzzleBoard.innerHTML = '';
    state.slots.forEach(function (slot, idx) {
      var slotEl = document.createElement('div');
      slotEl.className = 'board-slot';
      slotEl.dataset.slotId = idx;

      if (slot.pieceId !== null) {
        var piece = state.pieces.find(function (p) { return p.id === slot.pieceId; });
        if (piece) {
          var pImg = document.createElement('div');
          pImg.className = 'puzzle-piece placed';
          pImg.style.width = '100%';
          pImg.style.height = '100%';
          pImg.style.backgroundImage = 'url(' + piece.dataUrl + ')';
          pImg.style.backgroundSize = 'cover';
          slotEl.appendChild(pImg);
        }
      }

      slotEl.addEventListener('click', function () {
        onSlotClick(idx);
      });

      elements.puzzleBoard.appendChild(slotEl);
    });
  }

  function renderTray() {
    elements.piecesTray.innerHTML = '';
    state.pieces.forEach(function (piece) {
      if (piece.currentSlot === null) {
        var pEl = document.createElement('div');
        pEl.className = 'puzzle-piece' + (piece.id === state.selectedPieceId ? ' selected' : '');
        pEl.dataset.pieceId = piece.id;
        pEl.style.width = '70px';
        pEl.style.height = '70px';
        pEl.style.backgroundImage = 'url(' + piece.dataUrl + ')';
        pEl.style.backgroundSize = 'cover';

        pEl.addEventListener('click', function (e) {
          e.stopPropagation();
          onPieceSelect(piece.id);
        });

        elements.piecesTray.appendChild(pEl);
      }
    });
  }

  // --- Placement Logic ---
  function onPieceSelect(pieceId) {
    AudioSys.init();
    if (state.selectedPieceId === pieceId) {
      state.selectedPieceId = null;
    } else {
      state.selectedPieceId = pieceId;
      AudioSys.pick();
    }
    renderTray();
  }

  function onSlotClick(slotIdx) {
    if (state.isWon) return;
    AudioSys.init();

    var slot = state.slots[slotIdx];

    // If a piece is currently selected from tray
    if (state.selectedPieceId !== null) {
      var piece = state.pieces.find(function (p) { return p.id === state.selectedPieceId; });
      if (!piece) return;

      // Slot must be empty
      if (slot.pieceId === null) {
        state.moves++;
        elements.movesText.textContent = state.moves;

        // Check if correct slot
        if (slot.row === piece.targetRow && slot.col === piece.targetCol) {
          // Correct snap!
          slot.pieceId = piece.id;
          piece.currentSlot = slotIdx;
          state.selectedPieceId = null;
          state.placedCount++;
          AudioSys.snap();

          elements.progressText.textContent = state.placedCount + ' / 9';

          renderBoard();
          renderTray();

          if (state.placedCount === 9) {
            triggerVictory();
          }
        } else {
          // Wrong slot feedback
          AudioSys.wrong();
          var slotEl = elements.puzzleBoard.children[slotIdx];
          if (slotEl) {
            slotEl.style.borderColor = '#ef4444';
            setTimeout(function () {
              slotEl.style.borderColor = '';
            }, 300);
          }
        }
      }
    }
  }

  function triggerVictory() {
    state.isWon = true;
    clearInterval(state.timerInterval);
    AudioSys.victory();

    try {
      var key = 'omg:save:jigsaw_' + state.theme;
      var best = parseInt(localStorage.getItem(key) || '99999', 10);
      if (state.timer < best) {
        localStorage.setItem(key, state.timer.toString());
      }
    } catch (e) {}

    elements.modalDesc.textContent = '用时 ' + elements.timerText.textContent + ' · 步数 ' + state.moves + ' 步';
    elements.modal.classList.add('active');
  }

  // --- Attach Handlers ---
  elements.previewBtn.addEventListener('click', function () {
    state.previewShown = !state.previewShown;
    if (state.previewShown) {
      elements.previewOverlay.classList.add('visible');
      elements.previewBtn.textContent = '❌ 隐藏';
    } else {
      elements.previewOverlay.classList.remove('visible');
      elements.previewBtn.textContent = '👁️ 原图';
    }
  });

  elements.soundBtn.addEventListener('click', function () {
    AudioSys.enabled = !AudioSys.enabled;
    elements.soundBtn.textContent = AudioSys.enabled ? '🔊' : '🔇';
  });

  elements.restartBtn.addEventListener('click', initGame);
  elements.modalRestartBtn.addEventListener('click', initGame);

  elements.themeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      elements.themeBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      state.theme = btn.dataset.theme;
      initGame();
    });
  });

  // Init
  initGame();
})();
