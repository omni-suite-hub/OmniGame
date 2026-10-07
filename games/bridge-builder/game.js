// games/bridge-builder/game.js - Bridge Builder (造桥大师)
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

  function playSound(type) {
    try {
      var ctx = getAudio();
      if (!ctx) return;
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'click') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(880, now + 0.05);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'snap') {
        var bufferSize = ctx.sampleRate * 0.15;
        var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        var noise = ctx.createBufferSource();
        noise.buffer = buffer;
        var filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(1000, now);
        noise.connect(filter);
        filter.connect(gain);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        noise.start(now);
        noise.stop(now + 0.15);
      } else if (type === 'splash') {
        var bSize = ctx.sampleRate * 0.3;
        var bBuf = ctx.createBuffer(1, bSize, ctx.sampleRate);
        var bData = bBuf.getChannelData(0);
        for (var j = 0; j < bSize; j++) bData[j] = Math.random() * 2 - 1;
        var nSource = ctx.createBufferSource();
        nSource.buffer = bBuf;
        var nFilter = ctx.createBiquadFilter();
        nFilter.type = 'lowpass';
        nFilter.frequency.setValueAtTime(400, now);
        nSource.connect(nFilter);
        nFilter.connect(gain);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
        nSource.start(now);
        nSource.stop(now + 0.3);
      } else if (type === 'win') {
        [330, 415, 493, 659].forEach(function(f, idx) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'triangle';
          o.frequency.setValueAtTime(f, now + idx * 0.1);
          g.gain.setValueAtTime(0.2, now + idx * 0.1);
          g.gain.linearRampToValueAtTime(0.01, now + idx * 0.1 + 0.16);
          o.start(now + idx * 0.1);
          o.stop(now + idx * 0.1 + 0.16);
        });
      }
    } catch(e) {}
  }

  // DOM
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var budgetEl = document.getElementById('budget-el');
  var levelEl = document.getElementById('level-el');
  var statusEl = document.getElementById('status-el');
  var btnRoad = document.getElementById('btn-road');
  var btnWood = document.getElementById('btn-wood');
  var btnClear = document.getElementById('btn-clear');
  var btnSimulate = document.getElementById('btn-simulate');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc = document.getElementById('modal-desc');
  var btnNext = document.getElementById('btn-next');

  var CANVAS_W = 580;
  var CANVAS_H = 380;

  function resizeCanvas() {
    var container = document.getElementById('container');
    var maxW = container.clientWidth - 20;
    var maxH = container.clientHeight - 20;
    var scale = Math.min(maxW / CANVAS_W, maxH / CANVAS_H, 1.2);
    scale = Math.max(0.65, scale);
    canvas.width = Math.floor(CANVAS_W * scale);
    canvas.height = Math.floor(CANVAS_H * scale);
    initLevel(currentLevel);
  }
  window.addEventListener('resize', resizeCanvas);

  var currentLevel = 1;
  var maxLevels = 3;
  var totalBudget = 1200;
  var remainingBudget = 1200;
  var isSimulating = false;
  var selectedTool = 'road'; // 'road' ($100) or 'wood' ($50)
  var lastTime = 0;

  var nodes = [];
  var beams = [];
  var car = null;
  var cliffs = [];
  var targetGoalX = 0;

  var activeDragNode = null;
  var dragPos = { x: 0, y: 0 };

  var COSTS = { road: 100, wood: 50 };

  function initLevel(lvl) {
    currentLevel = lvl;
    isSimulating = false;
    btnSimulate.textContent = '🚗 开始测试';
    btnSimulate.className = 'tool-btn btn-test';
    statusEl.textContent = '设计中';
    statusEl.style.color = '#38bdf8';

    nodes = [];
    beams = [];
    car = null;

    var w = canvas.width;
    var h = canvas.height;
    var cliffH = h * 0.55;

    if (lvl === 1) {
      totalBudget = 1200;
      // Cliffs on left and right
      cliffs = [
        { x: 0, y: cliffH, w: w * 0.22, h: h - cliffH },
        { x: w * 0.78, y: cliffH, w: w * 0.22, h: h - cliffH }
      ];

      // Fixed Anchor Nodes
      nodes.push({ id: 0, x: w * 0.22, y: cliffH, fixed: true, vx: 0, vy: 0, origX: w * 0.22, origY: cliffH });
      nodes.push({ id: 1, x: w * 0.16, y: cliffH + 50, fixed: true, vx: 0, vy: 0, origX: w * 0.16, origY: cliffH + 50 });
      nodes.push({ id: 2, x: w * 0.78, y: cliffH, fixed: true, vx: 0, vy: 0, origX: w * 0.78, origY: cliffH });
      nodes.push({ id: 3, x: w * 0.84, y: cliffH + 50, fixed: true, vx: 0, vy: 0, origX: w * 0.84, origY: cliffH + 50 });

      targetGoalX = w * 0.82;
    } else if (lvl === 2) {
      totalBudget = 1800;
      // Wide gorge with island in center
      cliffs = [
        { x: 0, y: cliffH, w: w * 0.18, h: h - cliffH },
        { x: w * 0.44, y: cliffH + 60, w: w * 0.12, h: h - cliffH - 60 },
        { x: w * 0.82, y: cliffH, w: w * 0.18, h: h - cliffH }
      ];

      nodes.push({ id: 0, x: w * 0.18, y: cliffH, fixed: true, vx: 0, vy: 0, origX: w * 0.18, origY: cliffH });
      nodes.push({ id: 1, x: w * 0.12, y: cliffH + 50, fixed: true, vx: 0, vy: 0, origX: w * 0.12, origY: cliffH + 50 });
      nodes.push({ id: 2, x: w * 0.5, y: cliffH + 60, fixed: true, vx: 0, vy: 0, origX: w * 0.5, origY: cliffH + 60 });
      nodes.push({ id: 3, x: w * 0.82, y: cliffH, fixed: true, vx: 0, vy: 0, origX: w * 0.82, origY: cliffH });
      nodes.push({ id: 4, x: w * 0.88, y: cliffH + 50, fixed: true, vx: 0, vy: 0, origX: w * 0.88, origY: cliffH + 50 });

      targetGoalX = w * 0.86;
    } else {
      totalBudget = 2200;
      cliffs = [
        { x: 0, y: cliffH - 30, w: w * 0.16, h: h - cliffH + 30 },
        { x: w * 0.84, y: cliffH + 30, w: w * 0.16, h: h - cliffH - 30 }
      ];

      nodes.push({ id: 0, x: w * 0.16, y: cliffH - 30, fixed: true, vx: 0, vy: 0, origX: w * 0.16, origY: cliffH - 30 });
      nodes.push({ id: 1, x: w * 0.1, y: cliffH + 20, fixed: true, vx: 0, vy: 0, origX: w * 0.1, origY: cliffH + 20 });
      nodes.push({ id: 2, x: w * 0.84, y: cliffH + 30, fixed: true, vx: 0, vy: 0, origX: w * 0.84, origY: cliffH + 30 });
      nodes.push({ id: 3, x: w * 0.9, y: cliffH + 80, fixed: true, vx: 0, vy: 0, origX: w * 0.9, origY: cliffH + 80 });

      targetGoalX = w * 0.88;
    }

    calculateBudget();
  }

  function calculateBudget() {
    var spent = 0;
    beams.forEach(function(b) {
      spent += COSTS[b.type] || 50;
    });
    remainingBudget = totalBudget - spent;
    budgetEl.textContent = '$' + remainingBudget;
    budgetEl.style.color = remainingBudget < 0 ? '#ef4444' : '#facc15';
    levelEl.textContent = currentLevel + ' / ' + maxLevels;
  }

  function addBeam(n1, n2, type) {
    if (n1 === n2) return;
    // Check if beam already exists between them
    for (var i = 0; i < beams.length; i++) {
      var b = beams[i];
      if ((b.n1 === n1 && b.n2 === n2) || (b.n1 === n2 && b.n2 === n1)) {
        return;
      }
    }

    var cost = COSTS[type];
    if (remainingBudget < cost) return;

    var dist = Math.hypot(n2.x - n1.x, n2.y - n1.y);
    beams.push({
      n1: n1,
      n2: n2,
      type: type,
      restLen: dist,
      stress: 0,
      broken: false
    });

    playSound('click');
    calculateBudget();
  }

  function startSimulation() {
    if (isSimulating) {
      // Switch back to edit
      resetToEdit();
      return;
    }

    isSimulating = true;
    btnSimulate.textContent = '✏️ 返回设计';
    btnSimulate.className = 'tool-btn btn-edit';
    statusEl.textContent = '测试行驶中...';
    statusEl.style.color = '#eab308';

    // Reset node positions to original
    nodes.forEach(function(n) {
      n.x = n.origX;
      n.y = n.origY;
      n.vx = 0;
      n.vy = 0;
    });

    beams.forEach(function(b) {
      b.broken = false;
      b.stress = 0;
    });

    // Spawn Car at left cliff
    var startNode = nodes[0];
    car = {
      x: cliffs[0].w - 20,
      y: startNode.y - 12,
      vx: 65,
      vy: 0,
      w: 30,
      h: 16,
      crashed: false,
      completed: false
    };
  }

  function resetToEdit() {
    isSimulating = false;
    btnSimulate.textContent = '🚗 开始测试';
    btnSimulate.className = 'tool-btn btn-test';
    statusEl.textContent = '设计中';
    statusEl.style.color = '#38bdf8';
    car = null;

    nodes.forEach(function(n) {
      n.x = n.origX;
      n.y = n.origY;
      n.vx = 0;
      n.vy = 0;
    });

    beams.forEach(function(b) {
      b.broken = false;
      b.stress = 0;
    });
  }

  function updatePhysics(dt) {
    if (!isSimulating) return;

    var gravity = 480;

    // 1. Gravity on free nodes
    nodes.forEach(function(n) {
      if (!n.fixed) {
        n.vy += gravity * dt;
        n.vx *= 0.985;
        n.vy *= 0.985;
        n.x += n.vx * dt;
        n.y += n.vy * dt;
      }
    });

    // 2. Beam spring-damper relaxation
    for (var iter = 0; iter < 12; iter++) {
      beams.forEach(function(b) {
        if (b.broken) return;

        var dx = b.n2.x - b.n1.x;
        var dy = b.n2.y - b.n1.y;
        var dist = Math.hypot(dx, dy);
        var diff = (dist - b.restLen);
        var stressRatio = Math.abs(diff) / (b.restLen || 1);
        b.stress = stressRatio;

        // Snap beam if overstressed (wood snaps at 0.38, road at 0.48)
        var maxStress = b.type === 'wood' ? 0.38 : 0.48;
        if (stressRatio > maxStress) {
          b.broken = true;
          playSound('snap');
          return;
        }

        var stiffness = b.type === 'road' ? 0.45 : 0.4;
        var nx = (dx / (dist || 1)) * diff * stiffness;
        var ny = (dy / (dist || 1)) * diff * stiffness;

        if (!b.n1.fixed) {
          b.n1.x += nx;
          b.n1.y += ny;
        }
        if (!b.n2.fixed) {
          b.n2.x -= nx;
          b.n2.y -= ny;
        }
      });
    }

    // 3. Car driving & weight transfer
    if (car && !car.crashed && !car.completed) {
      car.x += car.vx * dt;
      car.vy += gravity * dt;
      car.y += car.vy * dt;

      var supported = false;

      // Check on road beams
      beams.forEach(function(b) {
        if (b.broken || b.type !== 'road') return;
        var minX = Math.min(b.n1.x, b.n2.x) - 4;
        var maxX = Math.max(b.n1.x, b.n2.x) + 4;

        if (car.x >= minX && car.x <= maxX) {
          var t = (car.x - b.n1.x) / ((b.n2.x - b.n1.x) || 1);
          var roadY = b.n1.y + (b.n2.y - b.n1.y) * t;

          if (car.y >= roadY - 14 && car.y <= roadY + 8) {
            car.y = roadY - 10;
            car.vy = 0;
            supported = true;

            // Apply car heavy weight force onto connected nodes
            var carWeight = 350;
            if (!b.n1.fixed) b.n1.vy += carWeight * (1 - t) * dt;
            if (!b.n2.fixed) b.n2.vy += carWeight * t * dt;
          }
        }
      });

      // Check landing on right cliff
      cliffs.forEach(function(c, idx) {
        if (idx > 0 && car.x >= c.x && car.x <= c.x + c.w) {
          if (car.y >= c.y - 14 && car.y <= c.y + 10) {
            car.y = c.y - 10;
            car.vy = 0;
            supported = true;
          }
        }
      });

      // Check Win Condition
      if (car.x >= targetGoalX) {
        car.completed = true;
        playSound('win');
        statusEl.textContent = '🎉 通关大捷！';
        statusEl.style.color = '#22c55e';
        gameOver(true, '大桥安然无恙，工程完美验收！');
      }

      // Check Crash (plunged into river)
      if (car.y > canvas.height - 30) {
        car.crashed = true;
        playSound('splash');
        statusEl.textContent = '💥 大桥塌陷！';
        statusEl.style.color = '#ef4444';
        gameOver(false, '桥梁结构承受不住压力断裂，小车坠入河底！');
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var w = canvas.width;
    var h = canvas.height;

    // 1. Sky & Sun
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(w * 0.85, 45, 22, 0, Math.PI * 2);
    ctx.fill();

    // 2. River Water at bottom
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(0, h * 0.85, w, h * 0.15);
    ctx.fillStyle = '#0369a1';
    ctx.fillRect(0, h * 0.88, w, h * 0.12);

    // 3. Cliffs / Rocks
    cliffs.forEach(function(c) {
      ctx.fillStyle = '#475569';
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.fillStyle = '#15803d'; // grassy top
      ctx.fillRect(c.x, c.y, c.w, 8);
    });

    // 4. Target Flag
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏁', targetGoalX, cliffs[cliffs.length - 1].y - 8);

    // 5. Beams
    beams.forEach(function(b) {
      if (b.broken) return;

      var color = b.type === 'road' ? '#1e293b' : '#b45309';
      if (isSimulating) {
        // Stress gradient (green -> yellow -> red)
        if (b.stress > 0.28) color = '#ef4444';
        else if (b.stress > 0.15) color = '#eab308';
        else color = '#22c55e';
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = b.type === 'road' ? 6 : 4;
      ctx.beginPath();
      ctx.moveTo(b.n1.x, b.n1.y);
      ctx.lineTo(b.n2.x, b.n2.y);
      ctx.stroke();

      if (b.type === 'road') {
        // Road dashed line
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(b.n1.x, b.n1.y);
        ctx.lineTo(b.n2.x, b.n2.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // 6. Nodes
    nodes.forEach(function(n) {
      ctx.fillStyle = n.fixed ? '#ef4444' : '#e2e8f0';
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.fixed ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // 7. Active Drag Line (in design mode)
    if (activeDragNode && !isSimulating) {
      ctx.strokeStyle = selectedTool === 'road' ? '#1e293b' : '#b45309';
      ctx.lineWidth = selectedTool === 'road' ? 5 : 3.5;
      ctx.beginPath();
      ctx.moveTo(activeDragNode.x, activeDragNode.y);
      ctx.lineTo(dragPos.x, dragPos.y);
      ctx.stroke();

      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(dragPos.x, dragPos.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 8. Car
    if (car) {
      ctx.save();
      ctx.translate(car.x, car.y);

      // Chassis
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-car.w / 2, -car.h / 2, car.w, car.h);

      // Cabin
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-car.w * 0.1, -car.h, car.w * 0.45, car.h * 0.6);

      // Wheels
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(-car.w * 0.35, car.h * 0.5, 5, 0, Math.PI * 2);
      ctx.arc(car.w * 0.35, car.h * 0.5, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  function gameOver(won, msg) {
    modalTitle.textContent = won ? '🏆 顺利通车！' : '💥 桥梁崩塌！';
    modalTitle.style.color = won ? '#facc15' : '#ef4444';
    modalDesc.textContent = msg;
    btnNext.textContent = won && currentLevel < maxLevels ? '进入下一关' : '重新设计';
    modal.classList.remove('hidden');
  }

  function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    var dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (dt > 0.1) dt = 0.1;

    updatePhysics(dt);
    render();
    requestAnimationFrame(gameLoop);
  }

  // Pointer Interaction
  function getPos(e) {
    var rect = canvas.getBoundingClientRect();
    var cx = (e.clientX || (e.touches && e.touches[0].clientX));
    var cy = (e.clientY || (e.touches && e.touches[0].clientY));
    return { x: cx - rect.left, y: cy - rect.top };
  }

  function findNodeNear(pos, threshold) {
    for (var i = 0; i < nodes.length; i++) {
      if (Math.hypot(nodes[i].x - pos.x, nodes[i].y - pos.y) <= threshold) {
        return nodes[i];
      }
    }
    return null;
  }

  function onPointerDown(e) {
    if (isSimulating) return;
    var pos = getPos(e);
    var near = findNodeNear(pos, 22);

    if (near) {
      activeDragNode = near;
      dragPos = pos;
    }
  }

  function onPointerMove(e) {
    if (!activeDragNode || isSimulating) return;
    var pos = getPos(e);

    // Limit max beam length to 75px
    var dx = pos.x - activeDragNode.x;
    var dy = pos.y - activeDragNode.y;
    var dist = Math.hypot(dx, dy);
    var maxLen = 75;

    if (dist > maxLen) {
      dragPos = {
        x: activeDragNode.x + (dx / dist) * maxLen,
        y: activeDragNode.y + (dy / dist) * maxLen
      };
    } else {
      dragPos = pos;
    }
  }

  function onPointerUp() {
    if (!activeDragNode || isSimulating) return;

    var near = findNodeNear(dragPos, 18);
    if (near && near !== activeDragNode) {
      // Connect to existing node
      addBeam(activeDragNode, near, selectedTool);
    } else if (!near) {
      // Create new node at drag position
      var dist = Math.hypot(dragPos.x - activeDragNode.x, dragPos.y - activeDragNode.y);
      if (dist > 18) {
        var newNode = {
          id: nodes.length,
          x: dragPos.x,
          y: dragPos.y,
          fixed: false,
          vx: 0,
          vy: 0,
          origX: dragPos.x,
          origY: dragPos.y
        };
        nodes.push(newNode);
        addBeam(activeDragNode, newNode, selectedTool);
      }
    }

    activeDragNode = null;
  }

  canvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);

  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    onPointerDown(e);
  }, { passive: false });
  window.addEventListener('touchmove', function(e) {
    if (activeDragNode) onPointerMove(e);
  }, { passive: false });
  window.addEventListener('touchend', onPointerUp);

  btnRoad.addEventListener('click', function() {
    selectedTool = 'road';
    btnRoad.classList.add('active');
    btnWood.classList.remove('active');
  });

  btnWood.addEventListener('click', function() {
    selectedTool = 'wood';
    btnWood.classList.add('active');
    btnRoad.classList.remove('active');
  });

  btnClear.addEventListener('click', function() {
    initLevel(currentLevel);
  });

  btnSimulate.addEventListener('click', startSimulation);

  btnNext.addEventListener('click', function() {
    modal.classList.add('hidden');
    if (modalTitle.textContent.indexOf('顺利') !== -1 && currentLevel < maxLevels) {
      initLevel(currentLevel + 1);
    } else {
      resetToEdit();
    }
  });

  resizeCanvas();
  initLevel(1);
  requestAnimationFrame(gameLoop);

})();
