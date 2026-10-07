/*!
 * 光棱织网 (Laser Prism Weave) — OmniGame 激光折射与分光织网
 */
(function() {
  'use strict';

  var GAME_ID = 'weave';

  // --- Web Audio 声音合成 ---
  var audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    var ctx = getAudioContext();
    if (!ctx) return;
    try {
      var t = ctx.currentTime;
      if (type === 'rotate') {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(620, t);
        osc.frequency.exponentialRampToValueAtTime(320, t + 0.08);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.09);
      } else if (type === 'hitTarget') {
        var oscH = ctx.createOscillator();
        var gainH = ctx.createGain();
        oscH.type = 'sine';
        oscH.frequency.setValueAtTime(880, t);
        gainH.gain.setValueAtTime(0.2, t);
        gainH.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        oscH.connect(gainH);
        gainH.connect(ctx.destination);
        oscH.start(t);
        oscH.stop(t + 0.16);
      } else if (type === 'win') {
        [523.25, 659.25, 783.99, 1046.5].forEach(function(freq, i) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, t + i * 0.08);
          g.gain.setValueAtTime(0.25, t + i * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.2);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t + i * 0.08);
          o.stop(t + i * 0.08 + 0.21);
        });
      }
    } catch (e) {}
  }

  // --- 关卡数据 (6列 x 7行 网格) ---
  var COLS = 6;
  var ROWS = 7;

  var CHAMBERS = [
    {
      id: 1,
      title: '第一室：折角聚焦',
      emitter: { col: 0, row: 2, dir: 'right' },
      targets: [
        { col: 4, row: 5, lit: false }
      ],
      elements: [
        { col: 4, row: 2, type: 'mirror', rot: 0 }, // \ 反射下
        { col: 2, row: 4, type: 'mirror', rot: 1 }
      ]
    },
    {
      id: 2,
      title: '第二室：双核共振',
      emitter: { col: 1, row: 0, dir: 'down' },
      targets: [
        { col: 5, row: 3, lit: false },
        { col: 1, row: 6, lit: false }
      ],
      elements: [
        { col: 1, row: 3, type: 'splitter', rot: 0 }, // 穿透下行 + 分光右行
        { col: 5, row: 1, type: 'mirror', rot: 0 }
      ]
    },
    {
      id: 3,
      title: '第三室：光棱织阵',
      emitter: { col: 0, row: 1, dir: 'right' },
      targets: [
        { col: 2, row: 5, lit: false },
        { col: 5, row: 5, lit: false }
      ],
      elements: [
        { col: 4, row: 1, type: 'mirror', rot: 0 },
        { col: 4, row: 3, type: 'splitter', rot: 1 },
        { col: 2, row: 3, type: 'mirror', rot: 1 }
      ]
    }
  ];

  // --- 游戏主状态 ---
  var state = {
    running: false,
    curChamberIdx: 0,
    startTime: 0,
    elements: [],
    targets: [],
    emitter: null,
    laserPaths: [],
    particles: []
  };

  // --- Canvas 渲染引擎 ---
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var cw = 0, ch = 0;

  function resizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    cw = rect.width;
    ch = rect.height;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.resetTransform && ctx.resetTransform();
    ctx.scale(dpr, dpr);
    recalculateLasers();
  }
  window.addEventListener('resize', resizeCanvas);

  var chamberVal = document.getElementById('chamberVal');
  var targetVal = document.getElementById('targetVal');

  function updateHUD() {
    if (chamberVal) chamberVal.textContent = '第 ' + (state.curChamberIdx + 1) + ' 关';
    var litCount = 0;
    for (var i = 0; i < state.targets.length; i++) {
      if (state.targets[i].lit) litCount++;
    }
    if (targetVal) targetVal.textContent = litCount + ' / ' + state.targets.length;
  }

  // --- 坐标换算 ---
  function getCellCenter(c, r) {
    var marginX = 20;
    var marginTop = 70;
    var marginBottom = 50;
    var w = (cw - marginX * 2) / COLS;
    var h = (ch - marginTop - marginBottom) / ROWS;
    return {
      x: marginX + (c + 0.5) * w,
      y: marginTop + (r + 0.5) * h,
      w: w,
      h: h
    };
  }

  // --- 光线追踪引擎 (Raycasting) ---
  function recalculateLasers() {
    if (!state.emitter) return;
    state.laserPaths = [];

    // 重置所有目标
    for (var t = 0; t < state.targets.length; t++) {
      state.targets[t].lit = false;
    }

    var rays = [{
      c: state.emitter.col,
      r: state.emitter.row,
      dir: state.emitter.dir
    }];

    var maxSteps = 40;
    var step = 0;

    while (rays.length > 0 && step < maxSteps) {
      step++;
      var ray = rays.shift();
      var startPos = getCellCenter(ray.c, ray.r);

      // 沿方向前进步进
      var nextC = ray.c;
      var nextR = ray.r;
      if (ray.dir === 'up') nextR -= 1;
      else if (ray.dir === 'down') nextR += 1;
      else if (ray.dir === 'left') nextC -= 1;
      else if (ray.dir === 'right') nextC += 1;

      if (nextC < 0 || nextC >= COLS || nextR < 0 || nextR >= ROWS) {
        // 出界，线段延伸至边界
        var endPosBorder = getCellCenter(Math.max(0, Math.min(COLS - 1, nextC)), Math.max(0, Math.min(ROWS - 1, nextR)));
        state.laserPaths.push({ x1: startPos.x, y1: startPos.y, x2: endPosBorder.x, y2: endPosBorder.y });
        continue;
      }

      var endPos = getCellCenter(nextC, nextR);
      state.laserPaths.push({ x1: startPos.x, y1: startPos.y, x2: endPos.x, y2: endPos.y });

      // 检查是否命中目标水晶
      for (var tg = 0; tg < state.targets.length; tg++) {
        var target = state.targets[tg];
        if (target.col === nextC && target.row === nextR) {
          target.lit = true;
        }
      }

      // 检查当前格是否有光学元件
      var elem = null;
      for (var e = 0; e < state.elements.length; e++) {
        if (state.elements[e].col === nextC && state.elements[e].row === nextR) {
          elem = state.elements[e];
          break;
        }
      }

      if (elem) {
        if (elem.type === 'mirror') {
          // 平面反射镜: 2 种对角线形态 (rot: 0 对应 \, rot: 1 对应 /)
          var newDir = null;
          if (elem.rot % 2 === 0) { // \ 对角线
            if (ray.dir === 'right') newDir = 'down';
            else if (ray.dir === 'up') newDir = 'left';
            else if (ray.dir === 'left') newDir = 'up';
            else if (ray.dir === 'down') newDir = 'right';
          } else { // / 对角线
            if (ray.dir === 'right') newDir = 'up';
            else if (ray.dir === 'down') newDir = 'left';
            else if (ray.dir === 'left') newDir = 'down';
            else if (ray.dir === 'up') newDir = 'right';
          }
          if (newDir) rays.push({ c: nextC, r: nextR, dir: newDir });
        } else if (elem.type === 'splitter') {
          // 分光棱镜: 一束直线穿透，一束直角折射
          rays.push({ c: nextC, r: nextR, dir: ray.dir }); // 穿透
          var splitDir = null;
          if (ray.dir === 'right' || ray.dir === 'left') splitDir = (elem.rot % 2 === 0) ? 'down' : 'up';
          else splitDir = (elem.rot % 2 === 0) ? 'right' : 'left';
          rays.push({ c: nextC, r: nextR, dir: splitDir }); // 分光
        }
      }
    }

    updateHUD();
    checkChamberClear();
  }

  function checkChamberClear() {
    var allLit = true;
    for (var i = 0; i < state.targets.length; i++) {
      if (!state.targets[i].lit) {
        allLit = false;
        break;
      }
    }

    if (allLit && state.running) {
      playSound('win');
      clearChamber();
    }
  }

  // --- 交互点击旋转元件 ---
  function handleCanvasClick(clientX, clientY) {
    if (!state.running) return;

    for (var i = 0; i < state.elements.length; i++) {
      var elem = state.elements[i];
      var pos = getCellCenter(elem.col, elem.row);
      if (Math.hypot(clientX - pos.x, clientY - pos.y) < pos.w * 0.45) {
        elem.rot = (elem.rot + 1) % 4;
        playSound('rotate');
        recalculateLasers();
        break;
      }
    }
  }

  // --- 画面渲染 ---
  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    // 1. 虚线插槽网格底盘
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.08)';
    ctx.lineWidth = 1;
    for (var c = 0; c < COLS; c++) {
      for (var r = 0; r < ROWS; r++) {
        var cell = getCellCenter(c, r);
        ctx.strokeRect(cell.x - cell.w / 2 + 3, cell.y - cell.h / 2 + 3, cell.w - 6, cell.h - 6);
      }
    }

    // 2. 绘制激光光束
    for (var l = 0; l < state.laserPaths.length; l++) {
      var lp = state.laserPaths[l];
      ctx.save();
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 4;
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#00f2fe';
      ctx.beginPath();
      ctx.moveTo(lp.x1, lp.y1);
      ctx.lineTo(lp.x2, lp.y2);
      ctx.stroke();

      // 光束中心亮白芯
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // 3. 绘制激光发射器
    if (state.emitter) {
      var emPos = getCellCenter(state.emitter.col, state.emitter.row);
      ctx.save();
      ctx.fillStyle = '#00f2fe';
      ctx.shadowBlur = 16;
      ctx.shadowColor = '#00f2fe';
      ctx.beginPath();
      ctx.arc(emPos.x, emPos.y, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(emPos.x, emPos.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 4. 绘制目标能量水晶
    for (var tg = 0; tg < state.targets.length; tg++) {
      var t = state.targets[tg];
      var tPos = getCellCenter(t.col, t.row);
      ctx.save();
      ctx.fillStyle = t.lit ? '#fbbf24' : '#334155';
      ctx.shadowBlur = t.lit ? 20 : 0;
      ctx.shadowColor = '#fbbf24';
      ctx.beginPath();
      // 菱形水晶轮廓
      ctx.moveTo(tPos.x, tPos.y - 14);
      ctx.lineTo(tPos.x + 12, tPos.y);
      ctx.lineTo(tPos.x, tPos.y + 14);
      ctx.lineTo(tPos.x - 12, tPos.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 5. 绘制光学棱镜/反射镜
    for (var e = 0; e < state.elements.length; e++) {
      var el = state.elements[e];
      var pos = getCellCenter(el.col, el.row);
      ctx.save();
      ctx.translate(pos.x, pos.y);

      // 底座外环
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, pos.w * 0.38, 0, Math.PI * 2);
      ctx.stroke();

      if (el.type === 'mirror') {
        // 反射镜面
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#38bdf8';
        ctx.beginPath();
        var ang = (el.rot % 2 === 0) ? Math.PI / 4 : -Math.PI / 4;
        var len = pos.w * 0.34;
        ctx.moveTo(Math.cos(ang) * -len, Math.sin(ang) * -len);
        ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
        ctx.stroke();
      } else if (el.type === 'splitter') {
        // 分光三棱镜 (半透明青色三角)
        ctx.fillStyle = 'rgba(0, 242, 254, 0.4)';
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -pos.w * 0.3);
        ctx.lineTo(pos.w * 0.28, pos.w * 0.24);
        ctx.lineTo(-pos.w * 0.28, pos.w * 0.24);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  function gameLoop() {
    render();
    requestAnimationFrame(gameLoop);
  }

  // --- 重置与通关 ---
  function clearChamber() {
    state.running = false;
    var clearOverlay = document.getElementById('clearOverlay');
    var finalChamber = document.getElementById('finalChamber');
    var finalTime = document.getElementById('finalTime');

    var durationSec = Math.round((performance.now() - state.startTime) / 1000);
    if (finalChamber) finalChamber.textContent = state.curChamberIdx + 1;
    if (finalTime) finalTime.textContent = durationSec + 's';

    if (clearOverlay) clearOverlay.classList.remove('hidden');

    if (window.GameStore) {
      var saved = window.GameStore.get(GAME_ID) || {};
      if (!saved.maxChamber || (state.curChamberIdx + 1) > saved.maxChamber) {
        window.GameStore.save(GAME_ID, {
          maxChamber: state.curChamberIdx + 1,
          date: Date.now()
        });
      }
    }
  }

  function loadChamber(idx) {
    getAudioContext();
    state.curChamberIdx = idx % CHAMBERS.length;
    var chm = CHAMBERS[state.curChamberIdx];
    state.emitter = { col: chm.emitter.col, row: chm.emitter.row, dir: chm.emitter.dir };
    state.targets = chm.targets.map(function(t) { return { col: t.col, row: t.row, lit: false }; });
    state.elements = chm.elements.map(function(e) { return { col: e.col, row: e.row, type: e.type, rot: e.rot }; });

    state.running = true;
    state.startTime = performance.now();
    recalculateLasers();

    var startOverlay = document.getElementById('startOverlay');
    var clearOverlay = document.getElementById('clearOverlay');
    if (startOverlay) startOverlay.classList.add('hidden');
    if (clearOverlay) clearOverlay.classList.add('hidden');
  }

  // --- 事件绑定 ---
  canvas.addEventListener('pointerdown', function(e) {
    var rect = canvas.getBoundingClientRect();
    handleCanvasClick(e.clientX - rect.left, e.clientY - rect.top);
  });

  window.addEventListener('keydown', function(e) {
    if (e.code === 'KeyZ') {
      loadChamber(state.curChamberIdx);
    }
  });

  var btnReset = document.getElementById('btnResetChamber');
  if (btnReset) {
    btnReset.addEventListener('click', function() {
      loadChamber(state.curChamberIdx);
    });
  }

  var startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.addEventListener('click', function() { loadChamber(0); });

  var nextBtn = document.getElementById('nextBtn');
  if (nextBtn) nextBtn.addEventListener('click', function() {
    loadChamber((state.curChamberIdx + 1) % CHAMBERS.length);
  });

  resizeCanvas();
  requestAnimationFrame(gameLoop);
})();
