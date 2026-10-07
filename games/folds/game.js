/*!
 * 空间折纸 (Paper Folds) — OmniGame 2D 折纸空间解谜
 */
(function() {
  'use strict';

  var GAME_ID = 'folds';

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
      if (type === 'paper') {
        // 逼真的纸张折叠沙沙声
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(350, t);
        osc.frequency.linearRampToValueAtTime(120, t + 0.16);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.17);
      } else if (type === 'jump') {
        var oscJ = ctx.createOscillator();
        var gainJ = ctx.createGain();
        oscJ.type = 'triangle';
        oscJ.frequency.setValueAtTime(260, t);
        oscJ.frequency.exponentialRampToValueAtTime(540, t + 0.09);
        gainJ.gain.setValueAtTime(0.2, t);
        gainJ.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        oscJ.connect(gainJ);
        gainJ.connect(ctx.destination);
        oscJ.start(t);
        oscJ.stop(t + 0.1);
      } else if (type === 'win') {
        [523.25, 659.25, 783.99, 1046.5].forEach(function(freq, i) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, t + i * 0.07);
          g.gain.setValueAtTime(0.2, t + i * 0.07);
          g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.18);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t + i * 0.07);
          o.stop(t + i * 0.07 + 0.19);
        });
      }
    } catch (e) {}
  }

  // --- 关卡密室 ---
  var CHAMBERS = [
    {
      id: 1,
      title: '第一卷：初探对折',
      spawn: { x: 60, y: 320 },
      // 左右两段平台隔着深渊：折叠后右平台平移贴合左平台
      platforms: [
        { x: 0, y: 360, w: 160, h: 40, side: 'left' },
        { x: 380, y: 360, w: 160, h: 40, side: 'right' }
      ],
      exit: { x: 460, y: 310, w: 32, h: 45, side: 'right' }
    },
    {
      id: 2,
      title: '第二卷：悬崖梯阶',
      spawn: { x: 50, y: 320 },
      platforms: [
        { x: 0, y: 360, w: 140, h: 40, side: 'left' },
        { x: 180, y: 260, w: 80, h: 20, side: 'left' },
        { x: 400, y: 260, w: 140, h: 40, side: 'right' }
      ],
      exit: { x: 470, y: 210, w: 32, h: 45, side: 'right' }
    },
    {
      id: 3,
      title: '第三卷：天堑通途',
      spawn: { x: 50, y: 320 },
      platforms: [
        { x: 0, y: 360, w: 130, h: 40, side: 'left' },
        { x: 170, y: 220, w: 90, h: 20, side: 'left' },
        { x: 370, y: 220, w: 80, h: 20, side: 'right' },
        { x: 440, y: 360, w: 100, h: 40, side: 'right' }
      ],
      exit: { x: 470, y: 310, w: 32, h: 45, side: 'right' }
    }
  ];

  // --- 游戏状态 ---
  var state = {
    running: false,
    curChamberIdx: 0,
    isFolded: false,
    foldAnim: 0, // 0 (平展) -> 1 (完全折叠)
    foldCount: 0,
    player: {
      x: 60,
      y: 320,
      vx: 0,
      vy: 0,
      w: 22,
      h: 28,
      onGround: false,
      currentSide: 'left'
    }
  };

  // --- Canvas 渲染 ---
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
  var foldStatusVal = document.getElementById('foldStatusVal');

  function updateHUD() {
    if (chamberVal) chamberVal.textContent = '第 ' + (state.curChamberIdx + 1) + ' 关';
    if (foldStatusVal) {
      foldStatusVal.textContent = state.isFolded ? '📄 已对折' : '平展';
      foldStatusVal.style.color = state.isFolded ? '#38bdf8' : '#f8fafc';
    }
  }

  // --- 折叠操作 ---
  function toggleFold() {
    if (!state.running) return;
    state.isFolded = !state.isFolded;
    state.foldCount++;
    playSound('paper');
    updateHUD();
  }

  // 计算空间折叠偏移量
  var FOLD_GAP = 220; // 折叠缩短的深渊跨度

  function getEffectivePlatform(plat) {
    var shift = state.foldAnim * FOLD_GAP;
    if (plat.side === 'right') {
      return {
        x: plat.x - shift,
        y: plat.y,
        w: plat.w,
        h: plat.h,
        side: plat.side
      };
    }
    return plat;
  }

  function getEffectiveExit(ex) {
    var shift = state.foldAnim * FOLD_GAP;
    return {
      x: ex.side === 'right' ? ex.x - shift : ex.x,
      y: ex.y,
      w: ex.w,
      h: ex.h
    };
  }

  // --- 物理更新 ---
  var GRAVITY = 1100;
  var MOVE_SPEED = 200;
  var JUMP_FORCE = -450;

  function update(dt) {
    if (!state.running) return;

    // 折叠平滑动画
    var targetAnim = state.isFolded ? 1.0 : 0.0;
    state.foldAnim += (targetAnim - state.foldAnim) * 12 * dt;
    if (Math.abs(targetAnim - state.foldAnim) < 0.01) {
      state.foldAnim = targetAnim;
    }

    var p = state.player;
    var chm = CHAMBERS[state.curChamberIdx];

    var mx = 0;
    if (keys['ArrowLeft'] || keys['KeyA'] || steerDir === -1) mx -= 1;
    if (keys['ArrowRight'] || keys['KeyD'] || steerDir === 1) mx += 1;

    p.vx = mx * MOVE_SPEED;
    p.vy += GRAVITY * dt;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.onGround = false;

    // 平台碰撞 (依据折叠状态后的等效位置)
    for (var i = 0; i < chm.platforms.length; i++) {
      var ep = getEffectivePlatform(chm.platforms[i]);
      if (
        p.x + p.w / 2 > ep.x &&
        p.x - p.w / 2 < ep.x + ep.w &&
        p.y + p.h / 2 >= ep.y &&
        p.y - p.h / 2 < ep.y &&
        p.vy >= 0
      ) {
        p.y = ep.y - p.h / 2;
        p.vy = 0;
        p.onGround = true;
      }
    }

    // 掉落深渊死亡重置
    if (p.y > ch + 40) {
      resetPlayer();
    }

    // 检查通关
    var ex = getEffectiveExit(chm.exit);
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

  // --- 画面渲染 ---
  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    var chm = CHAMBERS[state.curChamberIdx];

    // 1. 背景折纸纹理
    ctx.fillStyle = '#0f1224';
    ctx.fillRect(0, 0, cw, ch);

    // 2. 中央折痕虚线
    var creaseX = cw / 2;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(creaseX, 0);
    ctx.lineTo(creaseX, ch);
    ctx.stroke();
    ctx.setLineDash([]);

    // 折叠阴影层
    if (state.foldAnim > 0.05) {
      ctx.fillStyle = 'rgba(0, 0, 0, ' + (state.foldAnim * 0.45) + ')';
      ctx.fillRect(creaseX, 0, cw / 2, ch);
    }

    // 3. 绘制平台
    for (var i = 0; i < chm.platforms.length; i++) {
      var ep = getEffectivePlatform(chm.platforms[i]);
      ctx.save();
      ctx.fillStyle = ep.side === 'right' ? '#f59e0b' : '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath();
      ctx.roundRect(ep.x, ep.y, ep.w, ep.h, 6);
      ctx.fill();

      // 和纸纹理内芯
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(ep.x + 4, ep.y + 4, ep.w - 8, 4);
      ctx.restore();
    }

    // 4. 绘制终点千纸鹤目标
    var ex = getEffectiveExit(chm.exit);
    ctx.save();
    ctx.fillStyle = '#fbbf24';
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#fbbf24';
    ctx.beginPath();
    // 纸鹤三角轮廓
    ctx.moveTo(ex.x + ex.w / 2, ex.y);
    ctx.lineTo(ex.x + ex.w, ex.y + ex.h);
    ctx.lineTo(ex.x, ex.y + ex.h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 5. 绘制玩家 (折纸小船)
    var p = state.player;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - p.h / 2);
    ctx.lineTo(p.x + p.w / 2, p.y + p.h / 2);
    ctx.lineTo(p.x - p.w / 2, p.y + p.h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  var lastTime = 0;
  function gameLoop(time) {
    if (!lastTime) lastTime = time;
    var dt = (time - lastTime) / 1000;
    lastTime = time;
    if (dt > 0.1) dt = 0.1;

    update(dt);
    render();
    requestAnimationFrame(gameLoop);
  }

  // --- 重置与通关 ---
  function resetPlayer() {
    var chm = CHAMBERS[state.curChamberIdx];
    state.player.x = chm.spawn.x;
    state.player.y = chm.spawn.y;
    state.player.vx = 0;
    state.player.vy = 0;
  }

  function resetChamber() {
    resetPlayer();
    state.isFolded = false;
    state.foldAnim = 0;
    updateHUD();
  }

  function clearChamber() {
    state.running = false;
    playSound('win');

    var clearOverlay = document.getElementById('clearOverlay');
    var finalChamber = document.getElementById('finalChamber');
    var finalFolds = document.getElementById('finalFolds');

    if (finalChamber) finalChamber.textContent = state.curChamberIdx + 1;
    if (finalFolds) finalFolds.textContent = state.foldCount;

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
    state.foldCount = 0;
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
    if (e.code === 'KeyF') {
      e.preventDefault();
      toggleFold();
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
  var btnFold = document.getElementById('btnFold');
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
  if (btnFold) {
    btnFold.addEventListener('pointerdown', function(e) { e.preventDefault(); toggleFold(); });
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
