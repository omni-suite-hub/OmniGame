/*!
 * 滚轮深钻 (Turbo Drill Miner) — OmniGame 极速地心钻探
 */
(function() {
  'use strict';

  var GAME_ID = 'pureroll';

  // --- Web Audio 音频合成 ---
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
      if (type === 'drill') {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(90, t);
        osc.frequency.linearRampToValueAtTime(140, t + 0.08);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.09);
      } else if (type === 'gem') {
        var oscG = ctx.createOscillator();
        var gainG = ctx.createGain();
        oscG.type = 'sine';
        oscG.frequency.setValueAtTime(880, t);
        oscG.frequency.linearRampToValueAtTime(1320, t + 0.12);
        gainG.gain.setValueAtTime(0.2, t);
        gainG.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        oscG.connect(gainG);
        gainG.connect(ctx.destination);
        oscG.start(t);
        oscG.stop(t + 0.13);
      } else if (type === 'fuel') {
        var oscF = ctx.createOscillator();
        var gainF = ctx.createGain();
        oscF.type = 'triangle';
        oscF.frequency.setValueAtTime(440, t);
        oscF.frequency.exponentialRampToValueAtTime(880, t + 0.2);
        gainF.gain.setValueAtTime(0.25, t);
        gainF.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        oscF.connect(gainF);
        gainF.connect(ctx.destination);
        oscF.start(t);
        oscF.stop(t + 0.21);
      } else if (type === 'tnt') {
        var oscT = ctx.createOscillator();
        var gainT = ctx.createGain();
        oscT.type = 'sawtooth';
        oscT.frequency.setValueAtTime(120, t);
        oscT.frequency.exponentialRampToValueAtTime(30, t + 0.25);
        gainT.gain.setValueAtTime(0.35, t);
        gainT.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        oscT.connect(gainT);
        gainT.connect(ctx.destination);
        oscT.start(t);
        oscT.stop(t + 0.26);
      }
    } catch (e) {}
  }

  // --- 游戏数据设定 ---
  var state = {
    running: false,
    score: 0,
    depth: 0,
    fuel: 100,
    gemsCollected: 0,
    frenzyCount: 0,
    frenzyTimer: 0,
    drill: {
      x: 200,
      y: 120, // 屏幕相对固定高度
      width: 32,
      height: 48,
      speedX: 0,
      boost: false,
      angle: 0
    },
    blocks: [],
    particles: [],
    nextRowY: 200,
    screenShake: 0
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
    if (!state.running) {
      state.drill.x = cw / 2;
    }
  }
  window.addEventListener('resize', resizeCanvas);

  var depthVal = document.getElementById('depthVal');
  var scoreVal = document.getElementById('scoreVal');
  var fuelFill = document.getElementById('fuelFill');

  function updateHUD() {
    if (depthVal) depthVal.textContent = Math.floor(state.depth / 10) + ' m';
    if (scoreVal) scoreVal.textContent = state.score;
    if (fuelFill) {
      var pct = Math.max(0, Math.min(100, state.fuel));
      fuelFill.style.width = pct + '%';
      if (pct < 20) {
        fuelFill.style.background = '#ef4444';
      } else {
        fuelFill.style.background = 'linear-gradient(90deg, #06b6d4, #10b981)';
      }
    }
  }

  // --- 地块行生成 ---
  var BLOCK_SIZE = 44;
  var BLOCK_TYPES = [
    { type: 'dirt', color: '#4b5563', hp: 1, points: 10 },
    { type: 'gold', color: '#f59e0b', hp: 1, points: 60, isGem: true },
    { type: 'gem', color: '#06b6d4', hp: 1, points: 150, isGem: true },
    { type: 'fuel', color: '#10b981', hp: 1, isFuel: true },
    { type: 'magma', color: '#ef4444', hp: 99, isHazard: true },
    { type: 'tnt', color: '#f97316', hp: 1, isTNT: true }
  ];

  function generateRow(worldY) {
    var cols = Math.floor(cw / BLOCK_SIZE);
    var startX = (cw - cols * BLOCK_SIZE) / 2;

    for (var c = 0; c < cols; c++) {
      var roll = Math.random();
      var bType = BLOCK_TYPES[0]; // dirt

      if (roll < 0.06) {
        bType = BLOCK_TYPES[3]; // fuel
      } else if (roll < 0.14) {
        bType = BLOCK_TYPES[4]; // magma hazard
      } else if (roll < 0.18) {
        bType = BLOCK_TYPES[5]; // tnt
      } else if (roll < 0.32) {
        bType = BLOCK_TYPES[1]; // gold
      } else if (roll < 0.40) {
        bType = BLOCK_TYPES[2]; // gem
      }

      state.blocks.push({
        x: startX + c * BLOCK_SIZE,
        y: worldY,
        w: BLOCK_SIZE - 2,
        h: BLOCK_SIZE - 2,
        type: bType.type,
        color: bType.color,
        hp: bType.hp,
        points: bType.points || 0,
        isGem: bType.isGem,
        isFuel: bType.isFuel,
        isHazard: bType.isHazard,
        isTNT: bType.isTNT
      });
    }
  }

  // --- 挖掘与碰撞 ---
  function mineBlock(b, bIndex) {
    if (b.isHazard && state.frenzyTimer <= 0) {
      state.fuel -= 15;
      state.screenShake = 6;
      playSound('tnt');
      updateHUD();
      state.blocks.splice(bIndex, 1);
      return;
    }

    if (b.isFuel) {
      state.fuel = Math.min(100, state.fuel + 30);
      playSound('fuel');
    } else if (b.isGem) {
      state.gemsCollected++;
      state.score += b.points;
      playSound('gem');
    } else if (b.isTNT) {
      triggerTNTExplosion(b.x + b.w / 2, b.y + b.h / 2);
    } else {
      state.score += b.points;
      playSound('drill');
    }

    // 粒子飞溅
    for (var i = 0; i < 6; i++) {
      state.particles.push({
        x: b.x + b.w / 2,
        y: b.y + b.h / 2,
        vx: (Math.random() - 0.5) * 120,
        vy: (Math.random() - 0.5) * 120,
        life: 0.4,
        decay: 2.0,
        color: b.color,
        size: 3 + Math.random() * 3
      });
    }

    state.blocks.splice(bIndex, 1);
    updateHUD();
  }

  function triggerTNTExplosion(cx, cy) {
    state.screenShake = 12;
    playSound('tnt');
    var blastR = 90;

    for (var i = state.blocks.length - 1; i >= 0; i--) {
      var bk = state.blocks[i];
      var bx = bk.x + bk.w / 2;
      var by = bk.y + bk.h / 2;
      if (Math.hypot(bx - cx, by - cy) < blastR) {
        state.score += 50;
        state.blocks.splice(i, 1);
      }
    }

    // 爆炸火花
    for (var p = 0; p < 18; p++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 60 + Math.random() * 100;
      state.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.6,
        decay: 1.5,
        color: '#f97316',
        size: 5
      });
    }
  }

  // --- 更新与循环 ---
  function update(dt) {
    if (!state.running) return;

    var d = state.drill;

    // 1. 水平转向
    var steerSpd = 260;
    if (keys['ArrowLeft'] || keys['KeyA'] || steerDir === -1) {
      d.x -= steerSpd * dt;
    }
    if (keys['ArrowRight'] || keys['KeyD'] || steerDir === 1) {
      d.x += steerSpd * dt;
    }
    d.x = Math.max(d.width / 2, Math.min(cw - d.width / 2, d.x));

    // 2. 下潜速度计算 (滚轮或涡轮按键激活超速)
    var isTurbo = d.boost || keys['ArrowDown'] || keys['Space'] || keys['KeyS'];
    var fallSpeed = isTurbo ? 320 : 130;
    if (state.frenzyTimer > 0) fallSpeed = 380;

    var scrollY = fallSpeed * dt;
    state.depth += scrollY;

    // 燃料扣除
    var fuelDrain = isTurbo ? 5.0 : 3.0;
    if (state.frenzyTimer > 0) fuelDrain = 0;
    state.fuel -= fuelDrain * dt;

    if (state.fuel <= 0) {
      endGame();
      return;
    }

    if (state.frenzyTimer > 0) {
      state.frenzyTimer -= dt;
    }

    // 钻头动画角度旋转
    d.angle += (isTurbo ? 30 : 15) * dt;

    // 3. 矿块相对向上位移
    for (var i = state.blocks.length - 1; i >= 0; i--) {
      var b = state.blocks[i];
      b.y -= scrollY;

      // 碰撞判定：钻头尖端是否触碰矿块
      var drillTipX = d.x;
      var drillTipY = d.y + d.height / 2;

      if (
        drillTipX >= b.x && drillTipX <= b.x + b.w &&
        drillTipY >= b.y && drillTipY <= b.y + b.h
      ) {
        mineBlock(b, i);
        continue;
      }

      // 超出屏幕顶端清除
      if (b.y < -BLOCK_SIZE) {
        state.blocks.splice(i, 1);
      }
    }

    // 4. 生成新地块行
    state.nextRowY -= scrollY;
    while (state.nextRowY < ch + BLOCK_SIZE) {
      generateRow(state.nextRowY);
      state.nextRowY += BLOCK_SIZE;
    }

    // 5. 粒子更新
    for (var p = state.particles.length - 1; p >= 0; p--) {
      var pt = state.particles[p];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt - scrollY * 0.5;
      pt.life -= pt.decay * dt;
      if (pt.life <= 0) state.particles.splice(p, 1);
    }

    if (state.screenShake > 0) {
      state.screenShake = Math.max(0, state.screenShake - dt * 30);
    }

    updateHUD();
  }

  // --- 画面渲染 ---
  function render() {
    if (!ctx) return;
    ctx.save();

    if (state.screenShake > 0) {
      var sx = (Math.random() - 0.5) * state.screenShake;
      var sy = (Math.random() - 0.5) * state.screenShake;
      ctx.translate(sx, sy);
    }

    ctx.clearRect(0, 0, cw, ch);

    // 1. 矿壁纹理与网格
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.04)';
    ctx.lineWidth = 1;
    for (var y = 0; y < ch; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cw, y);
      ctx.stroke();
    }

    // 2. 绘制矿石地块
    for (var b = 0; b < state.blocks.length; b++) {
      var bk = state.blocks[b];
      ctx.save();
      ctx.fillStyle = bk.color;
      ctx.beginPath();
      ctx.roundRect(bk.x, bk.y, bk.w, bk.h, 6);
      ctx.fill();

      // 矿块内部图标/高光
      if (bk.isGem) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(bk.x + bk.w / 2, bk.y + bk.h / 2, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (bk.isFuel) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚡', bk.x + bk.w / 2, bk.y + bk.h / 2);
      } else if (bk.isTNT) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TNT', bk.x + bk.w / 2, bk.y + bk.h / 2);
      } else if (bk.isHazard) {
        ctx.fillStyle = '#fca5a5';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔥', bk.x + bk.w / 2, bk.y + bk.h / 2);
      }
      ctx.restore();
    }

    // 3. 绘制钻探机
    var d = state.drill;
    ctx.save();
    ctx.translate(d.x, d.y);

    // 狂暴模式发光环
    if (state.frenzyTimer > 0) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 4;
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#f59e0b';
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 钻头机身
    ctx.fillStyle = '#374151';
    ctx.fillRect(-12, -18, 24, 20);

    // 旋转钻尖 (倒三角锯齿)
    ctx.fillStyle = state.frenzyTimer > 0 ? '#f59e0b' : '#06b6d4';
    ctx.beginPath();
    ctx.moveTo(-14, 2);
    ctx.lineTo(14, 2);
    ctx.lineTo(0, 24);
    ctx.closePath();
    ctx.fill();

    // 钻头螺旋条纹
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    var stripeOffset = Math.sin(d.angle) * 6;
    ctx.beginPath();
    ctx.moveTo(-8 + stripeOffset, 6);
    ctx.lineTo(8 + stripeOffset, 14);
    ctx.stroke();

    ctx.restore();

    // 4. 粒子更新绘制
    for (var p = 0; p < state.particles.length; p++) {
      var pt = state.particles[p];
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

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

  // --- 结束与重开 ---
  function endGame() {
    state.running = false;
    var overOverlay = document.getElementById('overOverlay');
    var finalDepth = document.getElementById('finalDepth');
    var finalScore = document.getElementById('finalScore');
    var finalGems = document.getElementById('finalGems');
    var finalFrenzy = document.getElementById('finalFrenzy');

    var meters = Math.floor(state.depth / 10);
    if (finalDepth) finalDepth.textContent = meters + ' m';
    if (finalScore) finalScore.textContent = state.score;
    if (finalGems) finalGems.textContent = state.gemsCollected;
    if (finalFrenzy) finalFrenzy.textContent = state.frenzyCount;

    if (overOverlay) overOverlay.classList.remove('hidden');

    if (window.GameStore) {
      var saved = window.GameStore.get(GAME_ID) || {};
      if (!saved.highScore || state.score > saved.highScore) {
        window.GameStore.save(GAME_ID, {
          highScore: state.score,
          depth: meters,
          gems: state.gemsCollected,
          date: Date.now()
        });
      }
    }
  }

  function startGame() {
    getAudioContext();
    state.running = true;
    state.score = 0;
    state.depth = 0;
    state.fuel = 100;
    state.gemsCollected = 0;
    state.frenzyCount = 0;
    state.frenzyTimer = 0;
    state.drill.x = cw / 2;
    state.drill.boost = false;
    state.blocks = [];
    state.particles = [];
    state.nextRowY = 180;

    // 初始化前几排矿石
    for (var r = 0; r < 8; r++) {
      generateRow(state.nextRowY);
      state.nextRowY += BLOCK_SIZE;
    }

    updateHUD();

    var startOverlay = document.getElementById('startOverlay');
    var overOverlay = document.getElementById('overOverlay');
    if (startOverlay) startOverlay.classList.add('hidden');
    if (overOverlay) overOverlay.classList.add('hidden');
  }

  // --- 输入事件绑定 ---
  var keys = {};
  var steerDir = 0;

  window.addEventListener('keydown', function(e) {
    keys[e.code] = true;
  });
  window.addEventListener('keyup', function(e) {
    keys[e.code] = false;
  });

  // 滚轮控制涡轮下钻
  window.addEventListener('wheel', function(e) {
    if (!state.running) return;
    if (e.deltaY > 0) {
      state.drill.boost = true;
      clearTimeout(window.__boostTimeout);
      window.__boostTimeout = setTimeout(function() {
        state.drill.boost = false;
      }, 250);
    }
  }, { passive: true });

  // 触摸与鼠标拖拽转向
  var isDragging = false;
  canvas.addEventListener('pointerdown', function(e) {
    if (!state.running) return;
    isDragging = true;
    var rect = canvas.getBoundingClientRect();
    state.drill.x = e.clientX - rect.left;
  });
  canvas.addEventListener('pointermove', function(e) {
    if (isDragging && state.running) {
      var rect = canvas.getBoundingClientRect();
      state.drill.x = e.clientX - rect.left;
    }
  });
  window.addEventListener('pointerup', function() { isDragging = false; });
  window.addEventListener('pointercancel', function() { isDragging = false; });

  // 底部触摸按键
  var btnLeft = document.getElementById('btnLeft');
  var btnRight = document.getElementById('btnRight');
  var btnBoost = document.getElementById('btnBoost');

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
  if (btnBoost) {
    btnBoost.addEventListener('pointerdown', function(e) { e.preventDefault(); state.drill.boost = true; });
    btnBoost.addEventListener('pointerup', function() { state.drill.boost = false; });
    btnBoost.addEventListener('pointercancel', function() { state.drill.boost = false; });
  }

  var startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.addEventListener('click', startGame);

  var retryBtn = document.getElementById('retryBtn');
  if (retryBtn) retryBtn.addEventListener('click', startGame);

  resizeCanvas();
  requestAnimationFrame(gameLoop);
})();
