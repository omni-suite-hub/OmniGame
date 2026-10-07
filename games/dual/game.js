/*!
 * 双子镜像 (Twin Mirror) — OmniGame 镜像同步解谜
 */
(function() {
  'use strict';

  var GAME_ID = 'dual';

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
      if (type === 'jump') {
        // 双音和弦跳跃
        [440, 659.25].forEach(function(freq) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(freq, t);
          o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.09);
          g.gain.setValueAtTime(0.18, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t);
          o.stop(t + 0.1);
        });
      } else if (type === 'switch') {
        var oscS = ctx.createOscillator();
        var gainS = ctx.createGain();
        oscS.type = 'sine';
        oscS.frequency.setValueAtTime(580, t);
        gainS.gain.setValueAtTime(0.2, t);
        gainS.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        oscS.connect(gainS);
        gainS.connect(ctx.destination);
        oscS.start(t);
        oscS.stop(t + 0.09);
      } else if (type === 'clear') {
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

  // --- 关卡密室 ---
  var CHAMBERS = [
    {
      id: 1,
      title: '第一镜：初试对向',
      solarSpawn: { x: 60, y: 320 },
      lunarSpawn: { x: 460, y: 320 },
      platforms: [
        { x: 0, y: 360, w: 230, h: 40 },
        { x: 290, y: 360, w: 230, h: 40 }
      ],
      plates: [
        { x: 140, y: 352, w: 40, h: 8, targetGate: 0 }
      ],
      gates: [
        { x: 380, y: 270, w: 14, h: 90, open: false }
      ],
      solarExit: { x: 200, y: 310, w: 28, h: 50 },
      lunarExit: { x: 440, y: 310, w: 28, h: 50 }
    },
    {
      id: 2,
      title: '第二镜：双向互启',
      solarSpawn: { x: 40, y: 320 },
      lunarSpawn: { x: 480, y: 320 },
      platforms: [
        { x: 0, y: 360, w: 220, h: 40 },
        { x: 300, y: 360, w: 220, h: 40 },
        { x: 60, y: 250, w: 90, h: 18 },
        { x: 370, y: 250, w: 90, h: 18 }
      ],
      plates: [
        { x: 90, y: 242, w: 34, h: 8, targetGate: 0 },
        { x: 400, y: 242, w: 34, h: 8, targetGate: 1 }
      ],
      gates: [
        { x: 330, y: 270, w: 14, h: 90, open: false },
        { x: 180, y: 270, w: 14, h: 90, open: false }
      ],
      solarExit: { x: 200, y: 310, w: 28, h: 50 },
      lunarExit: { x: 310, y: 310, w: 28, h: 50 }
    },
    {
      id: 3,
      title: '第三镜：高台谐振',
      solarSpawn: { x: 50, y: 320 },
      lunarSpawn: { x: 470, y: 320 },
      platforms: [
        { x: 0, y: 360, w: 520, h: 40 },
        { x: 130, y: 240, w: 90, h: 18 },
        { x: 300, y: 240, w: 90, h: 18 }
      ],
      plates: [
        { x: 160, y: 232, w: 34, h: 8, targetGate: 0 }
      ],
      gates: [
        { x: 420, y: 270, w: 14, h: 90, open: false }
      ],
      solarExit: { x: 80, y: 310, w: 28, h: 50 },
      lunarExit: { x: 450, y: 310, w: 28, h: 50 }
    }
  ];

  // --- 游戏主状态 ---
  var state = {
    running: false,
    curChamberIdx: 0,
    startTime: 0,
    solar: { x: 60, y: 320, vx: 0, vy: 0, w: 20, h: 28, onGround: false },
    lunar: { x: 460, y: 320, vx: 0, vy: 0, w: 20, h: 28, onGround: false },
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
  }
  window.addEventListener('resize', resizeCanvas);

  var chamberVal = document.getElementById('chamberVal');

  function updateHUD() {
    if (chamberVal) chamberVal.textContent = '第 ' + (state.curChamberIdx + 1) + ' 关';
  }

  // --- 物理更新 ---
  var GRAVITY = 1100;
  var MOVE_SPEED = 200;
  var JUMP_FORCE = -460;

  function updatePhysics(dt) {
    var s = state.solar;
    var l = state.lunar;
    var chm = CHAMBERS[state.curChamberIdx];

    var mx = 0;
    if (keys['ArrowLeft'] || keys['KeyA'] || steerDir === -1) mx -= 1;
    if (keys['ArrowRight'] || keys['KeyD'] || steerDir === 1) mx += 1;

    // 日之子正向，月之女镜像反向
    s.vx = mx * MOVE_SPEED;
    l.vx = -mx * MOVE_SPEED;

    s.vy += GRAVITY * dt;
    l.vy += GRAVITY * dt;

    s.x += s.vx * dt;
    s.y += s.vy * dt;
    l.x += l.vx * dt;
    l.y += l.vy * dt;

    s.onGround = false;
    l.onGround = false;

    var midX = cw / 2;

    // 限制各自在自己的领域内，不可穿过中轴镜面
    s.x = Math.max(s.w / 2, Math.min(midX - s.w / 2, s.x));
    l.x = Math.max(midX + l.w / 2, Math.min(cw - l.w / 2, l.x));

    // 平台碰撞
    for (var i = 0; i < chm.platforms.length; i++) {
      var plat = chm.platforms[i];

      // 日之子碰撞
      if (
        s.x + s.w / 2 > plat.x && s.x - s.w / 2 < plat.x + plat.w &&
        s.y + s.h / 2 >= plat.y && s.y - s.h / 2 < plat.y &&
        s.vy >= 0
      ) {
        s.y = plat.y - s.h / 2;
        s.vy = 0;
        s.onGround = true;
      }

      // 月之女碰撞
      if (
        l.x + l.w / 2 > plat.x && l.x - l.w / 2 < plat.x + plat.w &&
        l.y + l.h / 2 >= plat.y && l.y - l.h / 2 < plat.y &&
        l.vy >= 0
      ) {
        l.y = plat.y - l.h / 2;
        l.vy = 0;
        l.onGround = true;
      }
    }

    // 结界门碰撞
    for (var g = 0; g < chm.gates.length; g++) {
      var gate = chm.gates[g];
      if (!gate.open) {
        // 日之子结界阻挡
        if (s.x + s.w / 2 > gate.x && s.x - s.w / 2 < gate.x + gate.w &&
            s.y + s.h / 2 > gate.y && s.y - s.h / 2 < gate.y + gate.h) {
          if (s.vx > 0) s.x = gate.x - s.w / 2;
          else if (s.vx < 0) s.x = gate.x + gate.w + s.w / 2;
        }
        // 月之女结界阻挡
        if (l.x + l.w / 2 > gate.x && l.x - l.w / 2 < gate.x + gate.w &&
            l.y + l.h / 2 > gate.y && l.y - l.h / 2 < gate.y + gate.h) {
          if (l.vx > 0) l.x = gate.x - l.w / 2;
          else if (l.vx < 0) l.x = gate.x + gate.w + l.w / 2;
        }
      }
    }

    // 机关踏板判定
    for (var pl = 0; pl < chm.plates.length; pl++) {
      var plate = chm.plates[pl];
      var pressed = false;

      if (
        (s.x + s.w / 2 > plate.x && s.x - s.w / 2 < plate.x + plate.w && Math.abs(s.y + s.h / 2 - plate.y) < 8) ||
        (l.x + l.w / 2 > plate.x && l.x - l.w / 2 < plate.x + plate.w && Math.abs(l.y + l.h / 2 - plate.y) < 8)
      ) {
        pressed = true;
      }

      var tgtGate = chm.gates[plate.targetGate];
      if (tgtGate) {
        if (pressed && !tgtGate.open) playSound('switch');
        tgtGate.open = pressed;
      }
    }

    // 检查日月祭坛同时到达
    var se = chm.solarExit;
    var le = chm.lunarExit;

    var solarAtAltar = (
      s.x + s.w / 2 > se.x && s.x - s.w / 2 < se.x + se.w &&
      s.y + s.h / 2 > se.y && s.y - s.h / 2 < se.y + se.h
    );
    var lunarAtAltar = (
      l.x + l.w / 2 > le.x && l.x - l.w / 2 < le.x + le.w &&
      l.y + l.h / 2 > le.y && l.y - l.h / 2 < le.y + le.h
    );

    if (solarAtAltar && lunarAtAltar) {
      clearChamber();
    }
  }

  function handleJump() {
    if (state.running) {
      if (state.solar.onGround) state.solar.vy = JUMP_FORCE;
      if (state.lunar.onGround) state.lunar.vy = JUMP_FORCE;
      playSound('jump');
    }
  }

  // --- 画面渲染 ---
  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    var midX = cw / 2;
    var chm = CHAMBERS[state.curChamberIdx];

    // 1. 左侧日界背景 & 右侧月界背景
    ctx.fillStyle = '#0a0d18';
    ctx.fillRect(0, 0, midX, ch);
    ctx.fillStyle = '#070a16';
    ctx.fillRect(midX, 0, midX, ch);

    // 2. 中央镜面分割光线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(midX, 0);
    ctx.lineTo(midX, ch);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. 绘制平台
    ctx.fillStyle = '#171c36';
    ctx.strokeStyle = '#2b3464';
    ctx.lineWidth = 2;
    for (var i = 0; i < chm.platforms.length; i++) {
      var plat = chm.platforms[i];
      ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
      ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);
    }

    // 4. 绘制机关踏板
    for (var pl = 0; pl < chm.plates.length; pl++) {
      var plate = chm.plates[pl];
      var isOpen = chm.gates[plate.targetGate].open;
      ctx.fillStyle = isOpen ? '#ffffff' : '#fbbf24';
      ctx.shadowBlur = isOpen ? 12 : 4;
      ctx.shadowColor = '#fbbf24';
      ctx.fillRect(plate.x, plate.y, plate.w, plate.h);
      ctx.shadowBlur = 0;
    }

    // 5. 绘制结界门
    for (var g = 0; g < chm.gates.length; g++) {
      var gate = chm.gates[g];
      if (!gate.open) {
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#f43f5e';
        ctx.beginPath();
        ctx.moveTo(gate.x + gate.w / 2, gate.y);
        ctx.lineTo(gate.x + gate.w / 2, gate.y + gate.h);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    // 6. 绘制日月祭坛
    var se = chm.solarExit;
    var le = chm.lunarExit;

    // 日之祭坛 (金色)
    ctx.save();
    ctx.fillStyle = '#fbbf24';
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#fbbf24';
    ctx.beginPath();
    ctx.roundRect(se.x, se.y, se.w, se.h, 12);
    ctx.fill();
    ctx.restore();

    // 月之祭坛 (青色)
    ctx.save();
    ctx.fillStyle = '#38bdf8';
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(le.x, le.y, le.w, le.h, 12);
    ctx.fill();
    ctx.restore();

    // 7. 绘制日之子 (金色灵体)
    var s = state.solar;
    ctx.save();
    ctx.fillStyle = '#fbbf24';
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#fbbf24';
    ctx.beginPath();
    ctx.roundRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h, 6);
    ctx.fill();
    ctx.restore();

    // 8. 绘制月之女 (青色灵体)
    var l = state.lunar;
    ctx.save();
    ctx.fillStyle = '#38bdf8';
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(l.x - l.w / 2, l.y - l.h / 2, l.w, l.h, 6);
    ctx.fill();
    ctx.restore();
  }

  var lastTime = 0;
  function gameLoop(time) {
    if (!lastTime) lastTime = time;
    var dt = (time - lastTime) / 1000;
    lastTime = time;
    if (dt > 0.1) dt = 0.1;

    if (state.running) {
      updatePhysics(dt);
    }

    render();
    requestAnimationFrame(gameLoop);
  }

  // --- 重置与通关 ---
  function resetChamber() {
    var chm = CHAMBERS[state.curChamberIdx];
    state.solar.x = chm.solarSpawn.x;
    state.solar.y = chm.solarSpawn.y;
    state.solar.vx = 0;
    state.solar.vy = 0;

    state.lunar.x = chm.lunarSpawn.x;
    state.lunar.y = chm.lunarSpawn.y;
    state.lunar.vx = 0;
    state.lunar.vy = 0;

    for (var g = 0; g < chm.gates.length; g++) {
      chm.gates[g].open = false;
    }
  }

  function clearChamber() {
    state.running = false;
    playSound('clear');

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

  function startChamber(idx) {
    getAudioContext();
    state.curChamberIdx = idx % CHAMBERS.length;
    state.running = true;
    state.startTime = performance.now();
    resetChamber();

    var startOverlay = document.getElementById('startOverlay');
    var clearOverlay = document.getElementById('clearOverlay');
    if (startOverlay) startOverlay.classList.add('hidden');
    if (clearOverlay) clearOverlay.classList.add('hidden');
  }

  // --- 输入事件绑定 ---
  var keys = {};
  var steerDir = 0;

  window.addEventListener('keydown', function(e) {
    keys[e.code] = true;
    if (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'Space') {
      e.preventDefault();
      handleJump();
    }
    if (e.code === 'KeyZ') {
      e.preventDefault();
      resetChamber();
    }
  });

  window.addEventListener('keyup', function(e) {
    keys[e.code] = false;
  });

  var btnLeft = document.getElementById('btnLeft');
  var btnRight = document.getElementById('btnRight');
  var btnJump = document.getElementById('btnJump');
  var btnReset = document.getElementById('btnResetChamber');

  if (btnLeft) {
    btnLeft.addEventListener('pointerdown', function(e) { e.preventDefault(); steerDir = -1; });
    btnLeft.addEventListener('pointerup', function() { steerDir = 0; });
    btnLeft.addEventListener('pointercancel', function() { steerDir = 0; });
  }
  if (btnRight) {
    btnRight.addEventListener('pointerdown', function(e) { e.preventDefault(); steerDir = 1; });
    btnRight.addEventListener('pointerup', function() { steerDir = 0; });
    btnRight.addEventListener('pointercancel', function() { steerDir = 0; });
  }
  if (btnJump) {
    btnJump.addEventListener('pointerdown', function(e) { e.preventDefault(); handleJump(); });
  }
  if (btnReset) {
    btnReset.addEventListener('click', resetChamber);
  }

  var startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.addEventListener('click', function() { startChamber(0); });

  var nextBtn = document.getElementById('nextBtn');
  if (nextBtn) nextBtn.addEventListener('click', function() {
    startChamber((state.curChamberIdx + 1) % CHAMBERS.length);
  });

  resizeCanvas();
  requestAnimationFrame(gameLoop);
})();