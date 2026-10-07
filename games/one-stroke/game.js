// games/one-stroke/game.js - One Stroke (一笔画)
(function() {
  'use strict';

  var audioCtx = null;
  function getAudio() {
    if (!audioCtx) {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  var PENTATONIC = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99];

  function playStepSound(stepIndex) {
    try {
      var ctx = getAudio();
      if (!ctx) return;
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      var freq = PENTATONIC[stepIndex % PENTATONIC.length];
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } catch(e) {}
  }

  function playBuzz() {
    try {
      var ctx = getAudio();
      if (!ctx) return;
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch(e) {}
  }

  function playWin() {
    try {
      var ctx = getAudio();
      if (!ctx) return;
      var now = ctx.currentTime;
      [392, 523, 659, 784, 1046].forEach(function(f, idx) {
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = 'triangle';
        o.frequency.setValueAtTime(f, now + idx * 0.08);
        g.gain.setValueAtTime(0.2, now + idx * 0.08);
        g.gain.linearRampToValueAtTime(0.01, now + idx * 0.08 + 0.15);
        o.start(now + idx * 0.08);
        o.stop(now + idx * 0.08 + 0.15);
      });
    } catch(e) {}
  }

  // DOM
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var progressEl = document.getElementById('progress-el');
  var levelEl = document.getElementById('level-el');
  var hintEl = document.getElementById('hint-el');
  var btnUndo = document.getElementById('btn-undo');
  var btnReset = document.getElementById('btn-reset');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc = document.getElementById('modal-desc');
  var btnRestart = document.getElementById('btn-restart');

  var currentLevel = 1;
  var maxLevels = 3;
  var isGameOver = false;

  var vertices = [];
  var edges = [];
  var currentVertex = null;
  var pathHistory = []; // array of { u, v, edgeIndex }
  var pointerPos = null;

  function resizeCanvas() {
    var container = document.getElementById('container');
    var size = Math.min(container.clientWidth - 20, container.clientHeight - 20, 480);
    size = Math.max(280, size);
    canvas.width = size;
    canvas.height = size;
    initLevel(currentLevel);
  }
  window.addEventListener('resize', resizeCanvas);

  function initLevel(lvl) {
    currentLevel = lvl;
    isGameOver = false;
    currentVertex = null;
    pathHistory = [];
    vertices = [];
    edges = [];

    var w = canvas.width;
    var h = canvas.height;
    var cx = w * 0.5;
    var cy = h * 0.5;

    if (lvl === 1) {
      // Level 1: Classic House with Roof (Eulerian Path starting from bottom corners)
      var s = w * 0.28;
      // 0: top roof, 1: top-left, 2: top-right, 3: bottom-left, 4: bottom-right
      vertices = [
        { id: 0, x: cx, y: cy - s * 1.5 },
        { id: 1, x: cx - s, y: cy - s * 0.4 },
        { id: 2, x: cx + s, y: cy - s * 0.4 },
        { id: 3, x: cx - s, y: cy + s * 1.1 },
        { id: 4, x: cx + s, y: cy + s * 1.1 }
      ];

      // Edges: roof (0-1, 0-2), square (1-2, 1-3, 2-4, 3-4), diagonals (1-4, 2-3)
      var edgePairs = [
        [0, 1], [0, 2],
        [1, 2], [1, 3], [2, 4], [3, 4],
        [1, 4], [2, 3]
      ];

      edges = edgePairs.map(function(p) {
        return { u: p[0], v: p[1], traversed: false };
      });
    } else if (lvl === 2) {
      // Level 2: Hexagonal Star / Star of David structure with outer bridges
      var r = w * 0.35;
      for (var i = 0; i < 6; i++) {
        var ang = (i * 60 - 30) * Math.PI / 180;
        vertices.push({
          id: i,
          x: cx + Math.cos(ang) * r,
          y: cy + Math.sin(ang) * r
        });
      }
      vertices.push({ id: 6, x: cx, y: cy }); // center

      // Edges: outer ring + spokes to center
      var pairs2 = [
        [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
        [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6]
      ];

      edges = pairs2.map(function(p) {
        return { u: p[0], v: p[1], traversed: false };
      });
    } else {
      // Level 3: Pentagram inside Pentagon
      var rOut = w * 0.38;
      var rIn = w * 0.19;

      // 5 outer vertices
      for (var j = 0; j < 5; j++) {
        var angOut = (j * 72 - 90) * Math.PI / 180;
        vertices.push({
          id: j,
          x: cx + Math.cos(angOut) * rOut,
          y: cy + Math.sin(angOut) * rOut
        });
      }
      // 5 inner star vertices
      for (var k = 0; k < 5; k++) {
        var angIn = (k * 72 - 90 + 36) * Math.PI / 180;
        vertices.push({
          id: 5 + k,
          x: cx + Math.cos(angIn) * rIn,
          y: cy + Math.sin(angIn) * rIn
        });
      }

      var pairs3 = [
        // Outer ring
        [0, 1], [1, 2], [2, 3], [3, 4], [4, 0],
        // Zigzag star connectors
        [0, 5], [5, 1], [1, 6], [6, 2], [2, 7], [7, 3], [3, 8], [8, 4], [4, 9], [9, 0]
      ];

      edges = pairs3.map(function(p) {
        return { u: p[0], v: p[1], traversed: false };
      });
    }

    updateHUD();
    render();
  }

  function updateHUD() {
    var completedCount = edges.filter(function(e) { return e.traversed; }).length;
    progressEl.textContent = completedCount + ' / ' + edges.length + ' 线';
    levelEl.textContent = currentLevel + ' / ' + maxLevels;

    if (currentVertex === null) {
      hintEl.textContent = '点击任意顶点作为起点';
      hintEl.style.color = '#facc15';
    } else {
      hintEl.textContent = '沿未连接的线条继续画';
      hintEl.style.color = '#38bdf8';
    }
  }

  function findVertexNear(x, y, threshold) {
    for (var i = 0; i < vertices.length; i++) {
      if (Math.hypot(vertices[i].x - x, vertices[i].y - y) <= threshold) {
        return vertices[i];
      }
    }
    return null;
  }

  function findUntraversedEdge(uId, vId) {
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i];
      if (!e.traversed && ((e.u === uId && e.v === vId) || (e.u === vId && e.v === uId))) {
        return { edge: e, index: i };
      }
    }
    return null;
  }

  function tryMoveToVertex(target) {
    if (isGameOver) return;

    if (currentVertex === null) {
      // Pick start node
      currentVertex = target;
      playStepSound(0);
      updateHUD();
      render();
      return;
    }

    if (target.id === currentVertex.id) return;

    // Check if there is an untraversed edge between current and target
    var match = findUntraversedEdge(currentVertex.id, target.id);
    if (match) {
      match.edge.traversed = true;
      pathHistory.push({
        from: currentVertex.id,
        to: target.id,
        edgeIndex: match.index
      });
      currentVertex = target;
      playStepSound(pathHistory.length);
      updateHUD();
      render();

      // Check win condition
      var allDone = edges.every(function(e) { return e.traversed; });
      if (allDone) {
        isGameOver = true;
        playWin();
        modalTitle.textContent = '🏆 一笔连成！';
        modalDesc.textContent = '完美贯穿欧拉通路，全线点亮！';
        btnRestart.textContent = currentLevel < maxLevels ? '进入下一关' : '重新挑战';
        modal.classList.remove('hidden');
      }
    } else {
      playBuzz();
    }
  }

  function undo() {
    if (pathHistory.length === 0 || isGameOver) return;
    var last = pathHistory.pop();
    edges[last.edgeIndex].traversed = false;

    if (pathHistory.length === 0) {
      currentVertex = null;
    } else {
      var prev = pathHistory[pathHistory.length - 1];
      currentVertex = vertices[prev.to];
    }

    updateHUD();
    render();
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw untraversed edges (faint grey-blue)
    edges.forEach(function(e) {
      if (!e.traversed) {
        var u = vertices[e.u];
        var v = vertices[e.v];
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(u.x, u.y);
        ctx.lineTo(v.x, v.y);
        ctx.stroke();
      }
    });

    // 2. Draw traversed edges (bright glowing cyan)
    pathHistory.forEach(function(step, idx) {
      var u = vertices[step.from];
      var v = vertices[step.to];

      // Glow outline
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.lineTo(v.x, v.y);
      ctx.stroke();

      // Core line
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.lineTo(v.x, v.y);
      ctx.stroke();
    });

    // 3. Elastic rubber line from current vertex to pointer (if dragging)
    if (currentVertex && pointerPos) {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(currentVertex.x, currentVertex.y);
      ctx.lineTo(pointerPos.x, pointerPos.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 4. Vertices
    vertices.forEach(function(v) {
      var isCurrent = currentVertex && currentVertex.id === v.id;

      ctx.fillStyle = isCurrent ? '#facc15' : '#1e293b';
      ctx.beginPath();
      ctx.arc(v.x, v.y, isCurrent ? 14 : 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isCurrent ? '#ffffff' : '#38bdf8';
      ctx.lineWidth = isCurrent ? 3 : 2;
      ctx.stroke();

      if (isCurrent) {
        // Pulsing ring
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(v.x, v.y, 18, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }

  // Pointer event handlers
  function getPos(e) {
    var rect = canvas.getBoundingClientRect();
    var cx = (e.clientX || (e.touches && e.touches[0].clientX));
    var cy = (e.clientY || (e.touches && e.touches[0].clientY));
    return { x: cx - rect.left, y: cy - rect.top };
  }

  function handlePointer(e) {
    var pos = getPos(e);
    pointerPos = pos;
    var near = findVertexNear(pos.x, pos.y, 24);
    if (near) {
      tryMoveToVertex(near);
    } else {
      render();
    }
  }

  canvas.addEventListener('mousedown', function(e) { handlePointer(e); });
  canvas.addEventListener('mousemove', function(e) {
    if (e.buttons > 0) handlePointer(e);
  });
  window.addEventListener('mouseup', function() {
    pointerPos = null;
    render();
  });

  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    handlePointer(e);
  }, { passive: false });
  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    handlePointer(e);
  }, { passive: false });
  window.addEventListener('touchend', function() {
    pointerPos = null;
    render();
  });

  btnUndo.addEventListener('click', undo);
  btnReset.addEventListener('click', function() { initLevel(currentLevel); });

  btnRestart.addEventListener('click', function() {
    modal.classList.add('hidden');
    if (modalTitle.textContent.indexOf('连成') !== -1 && currentLevel < maxLevels) {
      initLevel(currentLevel + 1);
    } else {
      initLevel(1);
    }
  });

  resizeCanvas();
  initLevel(1);

})();
