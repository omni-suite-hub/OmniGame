(function () {
  'use strict';

  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var container = document.getElementById('container');

  var levelTitle = document.getElementById('level-title');
  var matchCountEl = document.getElementById('match-count');
  var btnRotate = document.getElementById('btn-rotate');
  var btnReset = document.getElementById('btn-reset');
  var btnNext = document.getElementById('btn-next');

  var audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playSound(type) {
    try {
      var actx = getAudioCtx();
      var now = actx.currentTime;
      var osc = actx.createOscillator();
      var gain = actx.createGain();
      osc.connect(gain);
      gain.connect(actx.destination);

      if (type === 'tap') {
        osc.frequency.setValueAtTime(400, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
      } else if (type === 'snap') {
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(1000, now + 0.1);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'win') {
        [523, 659, 784, 1046, 1318].forEach(function (f, i) {
          var o = actx.createOscillator();
          var gn = actx.createGain();
          o.frequency.setValueAtTime(f, now + i * 0.1);
          gn.gain.setValueAtTime(0.18, now + i * 0.1);
          gn.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);
          o.connect(gn);
          gn.connect(actx.destination);
          o.start(now + i * 0.1);
          o.stop(now + i * 0.1 + 0.35);
        });
      }
    } catch (e) {}
  }

  var V_WIDTH = 800;
  var V_HEIGHT = 500;

  function resize() {
    var rect = container.getBoundingClientRect();
    var scale = Math.min(rect.width / V_WIDTH, rect.height / V_HEIGHT, 1.2);
    canvas.width = V_WIDTH;
    canvas.height = V_HEIGHT;
    canvas.style.width = (V_WIDTH * scale) + 'px';
    canvas.style.height = (V_HEIGHT * scale) + 'px';
  }
  window.addEventListener('resize', resize);

  // 7 Tangram Pieces Definitions (Unit Polygon normalized around (0,0))
  // 1, 2: Large Triangles; 3: Medium Triangle; 4, 5: Small Triangles; 6: Square; 7: Parallelogram
  var PIECE_TYPES = [
    { id: 1, name: '大三角A', color: '#ef4444', pts: [[-50, -50], [50, -50], [-50, 50]] },
    { id: 2, name: '大三角B', color: '#3b82f6', pts: [[-50, -50], [50, 50], [-50, 50]] },
    { id: 3, name: '中三角',  color: '#10b981', pts: [[-35, -35], [35, 35], [-35, 35]] },
    { id: 4, name: '小三角A', color: '#facc15', pts: [[-25, -25], [25, -25], [-25, 25]] },
    { id: 5, name: '小三角B', color: '#a855f7', pts: [[-25, -25], [25, 25], [-25, 25]] },
    { id: 6, name: '正方形',  color: '#f97316', pts: [[-25, -25], [25, -25], [25, 25], [-25, 25]] },
    { id: 7, name: '平行四边形', color: '#06b6d4', pts: [[-35, -20], [15, -20], [35, 20], [-15, 20]] }
  ];

  var PUZZLES = [
    {
      name: '⛵ 帆船',
      targets: [
        { id: 1, x: 550, y: 160, rot: 0 },
        { id: 2, x: 620, y: 220, rot: 90 },
        { id: 3, x: 550, y: 280, rot: 180 },
        { id: 4, x: 480, y: 350, rot: 45 },
        { id: 5, x: 620, y: 350, rot: 135 },
        { id: 6, x: 550, y: 350, rot: 0 },
        { id: 7, x: 550, y: 400, rot: 0 }
      ]
    },
    {
      name: '🏠 房屋',
      targets: [
        { id: 1, x: 520, y: 180, rot: 45 },
        { id: 2, x: 580, y: 180, rot: 135 },
        { id: 3, x: 550, y: 260, rot: 0 },
        { id: 4, x: 500, y: 320, rot: 0 },
        { id: 5, x: 600, y: 320, rot: 90 },
        { id: 6, x: 550, y: 320, rot: 0 },
        { id: 7, x: 550, y: 380, rot: 0 }
      ]
    }
  ];

  var currentPuzzleIdx = 0;
  var pieces = [];
  var selectedPiece = null;
  var isDragging = false;
  var dragOffsetX = 0;
  var dragOffsetY = 0;

  function loadPuzzle(idx) {
    currentPuzzleIdx = idx % PUZZLES.length;
    var puzzle = PUZZLES[currentPuzzleIdx];
    levelTitle.textContent = puzzle.name;

    pieces = PIECE_TYPES.map(function (pt, i) {
      // Position them on the left workbench
      var col = i % 2;
      var row = Math.floor(i / 2);
      return {
        id: pt.id,
        name: pt.name,
        color: pt.color,
        pts: pt.pts,
        x: 100 + col * 120,
        y: 80 + row * 100,
        rot: 0,
        snapped: false
      };
    });

    selectedPiece = pieces[0];
    updateMatchCount();
  }

  function updateMatchCount() {
    var puzzle = PUZZLES[currentPuzzleIdx];
    var matched = 0;

    pieces.forEach(function (p) {
      var tgt = puzzle.targets.find(function (t) { return t.id === p.id; });
      if (tgt) {
        var d = Math.hypot(p.x - tgt.x, p.y - tgt.y);
        var rotDiff = Math.abs((p.rot % 360) - (tgt.rot % 360));
        if (d < 30 && (rotDiff === 0 || rotDiff === 360)) {
          p.snapped = true;
          p.x = tgt.x;
          p.y = tgt.y;
          p.rot = tgt.rot;
          matched++;
        } else {
          p.snapped = false;
        }
      }
    });

    matchCountEl.textContent = matched + ' / 7';

    if (matched === 7) {
      playSound('win');
      setTimeout(function () {
        alert('🎉 巧夺天工！七块板件严丝合缝，成功完成组装！');
      }, 200);
    }
  }

  function setupInput() {
    function getCoords(e) {
      var rect = canvas.getBoundingClientRect();
      var cx = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      var cy = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      var scaleX = V_WIDTH / rect.width;
      var scaleY = V_HEIGHT / rect.height;
      return { x: (cx - rect.left) * scaleX, y: (cy - rect.top) * scaleY };
    }

    var onDown = function (e) {
      e.preventDefault();
      getAudioCtx();
      var pos = getCoords(e);

      // Find top-most piece clicked
      for (var i = pieces.length - 1; i >= 0; i--) {
        var p = pieces[i];
        if (Math.hypot(pos.x - p.x, pos.y - p.y) < 50) {
          selectedPiece = p;
          isDragging = true;
          dragOffsetX = pos.x - p.x;
          dragOffsetY = pos.y - p.y;
          playSound('tap');
          // Bring to top
          pieces.splice(i, 1);
          pieces.push(p);
          break;
        }
      }
    };

    var onMove = function (e) {
      if (!isDragging || !selectedPiece) return;
      var pos = getCoords(e);
      selectedPiece.x = pos.x - dragOffsetX;
      selectedPiece.y = pos.y - dragOffsetY;
    };

    var onUp = function () {
      if (isDragging && selectedPiece) {
        isDragging = false;
        updateMatchCount();
        if (selectedPiece.snapped) playSound('snap');
      }
    };

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    canvas.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp, { passive: false });

    btnRotate.addEventListener('click', function () {
      getAudioCtx();
      if (selectedPiece) {
        selectedPiece.rot = (selectedPiece.rot + 45) % 360;
        playSound('tap');
        updateMatchCount();
      }
    });

    btnReset.addEventListener('click', function () {
      loadPuzzle(currentPuzzleIdx);
    });

    btnNext.addEventListener('click', function () {
      loadPuzzle(currentPuzzleIdx + 1);
    });
  }

  function draw() {
    ctx.clearRect(0, 0, V_WIDTH, V_HEIGHT);

    // Workbench line
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(350, 0);
    ctx.lineTo(350, V_HEIGHT);
    ctx.stroke();

    // Target Area Guide Silhouette
    var puzzle = PUZZLES[currentPuzzleIdx];
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);

    puzzle.targets.forEach(function (tgt) {
      var pt = PIECE_TYPES.find(function (p) { return p.id === tgt.id; });
      if (pt) {
        ctx.save();
        ctx.translate(tgt.x, tgt.y);
        ctx.rotate((tgt.rot * Math.PI) / 180);
        ctx.beginPath();
        pt.pts.forEach(function (v, idx) {
          if (idx === 0) ctx.moveTo(v[0], v[1]);
          else ctx.lineTo(v[0], v[1]);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    });
    ctx.setLineDash([]);

    // Draw Pieces
    pieces.forEach(function (p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      p.pts.forEach(function (v, idx) {
        if (idx === 0) ctx.moveTo(v[0] + 3, v[1] + 4);
        else ctx.lineTo(v[0] + 3, v[1] + 4);
      });
      ctx.closePath();
      ctx.fill();

      // Piece polygon
      ctx.fillStyle = p.color;
      ctx.beginPath();
      p.pts.forEach(function (v, idx) {
        if (idx === 0) ctx.moveTo(v[0], v[1]);
        else ctx.lineTo(v[0], v[1]);
      });
      ctx.closePath();
      ctx.fill();

      // Border / selection highlight
      ctx.strokeStyle = (selectedPiece === p) ? '#ffffff' : 'rgba(0,0,0,0.4)';
      ctx.lineWidth = (selectedPiece === p) ? 3 : 1.5;
      ctx.stroke();

      ctx.restore();
    });

    requestAnimationFrame(draw);
  }

  resize();
  setupInput();
  loadPuzzle(0);
  requestAnimationFrame(draw);
})();
