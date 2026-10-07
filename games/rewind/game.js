/*!
 * 时空倒影 (Time Echoes) — OmniGame Braid风格时空解谜
 */
(function() {
  'use strict';

  var GAME_ID = 'rewind';

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
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, t);
        osc.frequency.exponentialRampToValueAtTime(520, t + 0.1);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.11);
      } else if (type === 'rewind') {
        // 时空倒流合成音：频率迅速倒退
        var oscR = ctx.createOscillator();
        var gainR = ctx.createGain();
        oscR.type = 'sawtooth';
        oscR.frequency.setValueAtTime(800, t);
        oscR.frequency.linearRampToValueAtTime(160, t + 0.35);
        gainR.gain.setValueAtTime(0.3, t);
        gainR.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        oscR.connect(gainR);
        gainR.connect(ctx.destination);
        oscR.start(t);
        oscR.stop(t + 0.36);
      } else if (type === 'switch') {
        var oscS = ctx.createOscillator();
        var gainS = ctx.createGain();
        oscS.type = 'sine';
        oscS.frequency.setValueAtTime(580, t);
        gainS.gain.setValueAtTime(0.25, t);
        gainS.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        oscS.connect(gainS);
        gainS.connect(ctx.destination);
        oscS.start(t);
        oscS.stop(t + 0.09);
      } else if (type === 'clear') {
        [440, 554.37, 659.25, 880].forEach(function(freq, i) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, t + i * 0.08);
          g.gain.setValueAtTime(0.2, t + i * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.2);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t + i * 0.08);
          o.stop(t + i * 0.08 + 0.21);
        });
      }
    } catch (e) {}
  }

  // --- 关卡密室设计 ---
  var CHAMBERS = [
    {
      id: 1,
      title: '第一密室：残影之始',
      playerSpawn: { x: 50, y: 320 },
      platforms: [
        { x: 0, y: 360, w: 540, h: 40 },
        { x: 340, y: 260, w: 180, h: 20 }
      ],
      plates: [
        { x: 180, y: 352, w: 44, h: 8, targetGate: 0 }
      ],
      gates: [
        { x: 380, y: 160, w: 16, h: 100, open: false }
      ],
      exit: { x: 470, y: 215, w: 32, h: 45 }
    },
    {
      id: 2,
      title: '第二密室：升降契机',
      playerSpawn: { x: 50, y: 320 },
      platforms: [
        { x: 0, y: 360, w: 200, h: 40 },
        { x: 340, y: 360, w: 200, h: 40 },
        { x: 0, y: 180, w: 160, h: 20 }
      ],
      plates: [
        { x: 420, y: 352, w: 44, h: 8, targetGate: 0 }
      ],
      gates: [
        { x: 120, y: 90, w: 16, h: 90, open: false }
      ],
      exit: { x: 40, y: 135, w: 32, h: 45 }
    },
    {
      id: 3,
      title: '第三密室：双重结界',
      playerSpawn: { x: 40, y: 320 },
      platforms: [
        { x: 0, y: 360, w: 540, h: 40 },
        { x: 150, y: 270, w: 100, h: 16 },
        { x: 310, y: 200, w: 120, h: 16 }
      ],
      plates: [
        { x: 180, y: 262, w: 40, h: 8, targetGate: 0 }
      ],
      gates: [
        { x: 360, y: 270, w: 16, h: 90, open: false }
      ],
      exit: { x: 480, y: 315, w: 32, h: 45 }
    },
    {
      id: 4,
      title: '第四密室：时空终章',
      playerSpawn: { x: 50, y: 320 },
      platforms: [
        { x: 0, y: 360, w: 540, h: 40 },
        { x: 80, y: 240, w: 120, h: 16 },
        { x: 260, y: 180, w: 140, h: 16 }
      ],
      plates: [
        { x: 310, y: 172, w: 40, h: 8, targetGate: 0 }
      ],
      gates: [
        { x: 440, y: 270, w: 16, h: 90, open: false }
      ],
      exit: { x: 480, y: 315, w: 32, h: 45 }
    }
  ];

  // --- 游戏状态 ---
  var state = {
    running: false,
    curChamberIdx: 0,
    startTime: 0,
    player: {
      x: 50,
      y: 320,
      vx: 0,
      vy: 0,
      w: 22,
      h: 30,
      onGround: false
    },
    history: [], // 记录当前运行的历史轨迹
    echo: null,  // { frames: [], curIdx: 0, x: 0, y: 0, active: true }
    rewindEffectTimer: 0,
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
  var echoVal = document.getElementById('echoVal');

  function updateHUD() {
    if (chamberVal) chamberVal.textContent = '第 ' + (state.curChamberIdx + 1) + ' 关';
    if (echoVal) echoVal.textContent = (state.echo ? '1' : '0') + ' / 1';
  }

  // --- 倒流操作 ---
  function triggerRewind() {
    if (!state.running || state.history.length < 10) return;

    playSound('rewind');
    state.rewindEffectTimer = 0.35;

    // 将刚才走过的历史帧赋予时空残影
    state.echo = {
      frames: state.history.slice(),
      curIdx: 0,
      x: state.history[0].x,
      y: state.history[0].y,
      active: true
    };

    // 玩家回到起点，开始重放与配合
    var chm = CHAMBERS[state.curChamberIdx];
    state.player.x = chm.playerSpawn.x;
    state.player.y = chm.playerSpawn.y;
    state.player.vx = 0;
    state.player.vy = 0;
    state.history = [];

    updateHUD();
  }

  // --- 物理与碰撞 ---
  var GRAVITY = 1100;
  var MOVE_SPEED = 210;
  var JUMP_FORCE = -460;

  function updatePhysics(dt) {
    var p = state.player;
    var chm = CHAMBERS[state.curChamberIdx];

    // 水平移动输入
    var moveDir = 0;
    if (keys['ArrowLeft'] || keys['KeyA'] || steerDir === -1) moveDir -= 1;
    if (keys['ArrowRight'] || keys['KeyD'] || steerDir === 1) moveDir += 1;

    p.vx = moveDir * MOVE_SPEED;
    p.vy += GRAVITY * dt;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.onGround = false;

    // 1. 平台碰撞
    for (var i = 0; i < chm.platforms.length; i++) {
      var plat = chm.platforms[i];
      if (
        p.x + p.w / 2 > plat.x &&
        p.x - p.w / 2 < plat.x + plat.w &&
        p.y + p.h / 2 >= plat.y &&
        p.y - p.h / 2 < plat.y &&
        p.vy >= 0
      ) {
        p.y = plat.y - p.h / 2;
        p.vy = 0;
        p.onGround = true;
      }
    }

    // 2. 能量门阻挡
    for (var g = 0; g < chm.gates.length; g++) {
      var gate = chm.gates[g];
      if (!gate.open) {
        if (
          p.x + p.w / 2 > gate.x &&
          p.x - p.w / 2 < gate.x + gate.w &&
          p.y + p.h / 2 > gate.y &&
          p.y - p.h / 2 < gate.y + gate.h
        ) {
          // 阻挡推开
          if (p.vx > 0) p.x = gate.x - p.w / 2;
          else if (p.vx < 0) p.x = gate.x + gate.w + p.w / 2;
        }
      }
    }

    // 3. 记录玩家轨迹
    state.history.push({ x: p.x, y: p.y, onGround: p.onGround });
    // 最多保留 10 秒记录 (600帧)
    if (state.history.length > 600) state.history.shift();

    // 4. 更新时空残影
    if (state.echo && state.echo.active) {
      if (state.echo.curIdx < state.echo.frames.length) {
        var frame = state.echo.frames[state.echo.curIdx];
        state.echo.x = frame.x;
        state.echo.y = frame.y;
        state.echo.curIdx++;
      } else {
        // 残影重演完毕消散
        state.echo.active = false;
        state.echo = null;
        updateHUD();
      }
    }

    // 5. 机关踏板判定
    for (var pl = 0; pl < chm.plates.length; pl++) {
      var plate = chm.plates[pl];
      var pressed = false;

      // 玩家踩踏
      if (
        p.x + p.w / 2 > plate.x &&
        p.x - p.w / 2 < plate.x + plate.w &&
        Math.abs((p.y + p.h / 2) - plate.y) < 10
      ) {
        pressed = true;
      }

      // 残影踩踏
      if (state.echo && state.echo.active) {
        if (
          state.echo.x + p.w / 2 > plate.x &&
          state.echo.x - p.w / 2 < plate.x + plate.w &&
          Math.abs((state.echo.y + p.h / 2) - plate.y) < 10
        ) {
          pressed = true;
        }
      }

      // 控制对应的能量门
      var targetGate = chm.gates[plate.targetGate];
      if (targetGate) {
        if (pressed && !targetGate.open) playSound('switch');
        targetGate.open = pressed;
      }
    }

    // 6. 检查传送门通关
    var ex = chm.exit;
    if (
      p.x + p.w / 2 > ex.x &&
      p.x - p.w / 2 < ex.x + ex.w &&
      p.y + p.h / 2 > ex.y &&
      p.y - p.h / 2 < ex.y + ex.h
    ) {
      clearChamber();
    }
  }

  function handleJump() {
    if (state.player.onGround && state.running) {
      state.player.vy = JUMP_FORCE;
      playSound('jump');
    }
  }

  // --- 渲染 ---
  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    var chm = CHAMBERS[state.curChamberIdx];

    // 1. 绘制背景网格
    ctx.strokeStyle = 'rgba(129, 140, 248, 0.05)';
    ctx.lineWidth = 1;
    for (var x = 0; x < cw; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ch);
      ctx.stroke();
    }

    // 2. 绘制平台
    ctx.fillStyle = '#1e2348';
    ctx.strokeStyle = '#3b427a';
    ctx.lineWidth = 2;
    for (var i = 0; i < chm.platforms.length; i++) {
      var plat = chm.platforms[i];
      ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
      ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);
    }

    // 3. 绘制机关踏板
    for (var pl = 0; pl < chm.plates.length; pl++) {
      var plate = chm.plates[pl];
      var isGateOpen = chm.gates[plate.targetGate].open;
      ctx.fillStyle = isGateOpen ? '#c084fc' : '#818cf8';
      ctx.shadowBlur = isGateOpen ? 12 : 4;
      ctx.shadowColor = '#c084fc';
      ctx.fillRect(plate.x, plate.y, plate.w, plate.h);
      ctx.shadowBlur = 0;
    }

    // 4. 绘制能量门
    for (var g = 0; g < chm.gates.length; g++) {
      var gate = chm.gates[g];
      if (!gate.open) {
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#f43f5e';
        ctx.beginPath();
        ctx.moveTo(gate.x + gate.w / 2, gate.y);
        ctx.lineTo(gate.x + gate.w / 2, gate.y + gate.h);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    // 5. 绘制传送出口
    var ex = chm.exit;
    ctx.fillStyle = '#38bdf8';
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(ex.x, ex.y, ex.w, ex.h, 16);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 6. 绘制时空残影 (紫色半透明时空克隆)
    if (state.echo && state.echo.active) {
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = '#c084fc';
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#c084fc';
      ctx.beginPath();
      ctx.roundRect(
        state.echo.x - state.player.w / 2,
        state.echo.y - state.player.h / 2,
        state.player.w,
        state.player.h,
        6
      );
      ctx.fill();
      ctx.restore();
    }

    // 7. 绘制玩家 (蓝绿色时空漫游者)
    var p = state.player;
    ctx.save();
    ctx.fillStyle = '#38bdf8';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 6);
    ctx.fill();

    // 眼睛
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p.x - 2, p.y - p.h / 2 + 6, 6, 4);
    ctx.restore();

    // 8. 倒流全屏扫描线滤镜
    if (state.rewindEffectTimer > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(192, 132, 252, 0.18)';
      ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      for (var y = 0; y < ch; y += 8) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cw, y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // --- 主循环 ---
  var lastTime = 0;
  function gameLoop(time) {
    if (!lastTime) lastTime = time;
    var dt = (time - lastTime) / 1000;
    lastTime = time;
    if (dt > 0.1) dt = 0.1;

    if (state.running) {
      updatePhysics(dt);
      if (state.rewindEffectTimer > 0) {
        state.rewindEffectTimer -= dt;
      }
    }

    render();
    requestAnimationFrame(gameLoop);
  }

  // --- 关卡重置与过关 ---
  function resetChamber() {
    var chm = CHAMBERS[state.curChamberIdx];
    state.player.x = chm.playerSpawn.x;
    state.player.y = chm.playerSpawn.y;
    state.player.vx = 0;
    state.player.vy = 0;
    state.history = [];
    state.echo = null;
    for (var g = 0; g < chm.gates.length; g++) {
      chm.gates[g].open = false;
    }
    updateHUD();
  }

  function clearChamber() {
    state.running = false;
    playSound('clear');

    var clearOverlay = document.getElementById('clearOverlay');
    var finalChamber = document.getElementById('finalChamber');
    var finalTime = document.getElementById('finalTime');

    var elapsedSec = Math.round((performance.now() - state.startTime) / 1000);
    if (finalChamber) finalChamber.textContent = state.curChamberIdx + 1;
    if (finalTime) finalTime.textContent = elapsedSec + 's';

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
    if (e.code === 'KeyR') {
      e.preventDefault();
      triggerRewind();
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
  var btnRewind = document.getElementById('btnRewind');
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
  if (btnRewind) {
    btnRewind.addEventListener('pointerdown', function(e) { e.preventDefault(); triggerRewind(); });
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
