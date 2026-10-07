/*!
 * 元素炼金塔 (Elemental Tower) — OmniGame 四象转灵平台解谜
 */
(function() {
  'use strict';

  var GAME_ID = 'elements';

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
      if (type === 'switch') {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, t);
        osc.frequency.linearRampToValueAtTime(880, t + 0.1);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.11);
      } else if (type === 'burn') {
        var oscB = ctx.createOscillator();
        var gainB = ctx.createGain();
        oscB.type = 'sawtooth';
        oscB.frequency.setValueAtTime(300, t);
        oscB.frequency.exponentialRampToValueAtTime(100, t + 0.2);
        gainB.gain.setValueAtTime(0.25, t);
        gainB.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        oscB.connect(gainB);
        gainB.connect(ctx.destination);
        oscB.start(t);
        oscB.stop(t + 0.21);
      } else if (type === 'smash') {
        var oscS = ctx.createOscillator();
        var gainS = ctx.createGain();
        oscS.type = 'triangle';
        oscS.frequency.setValueAtTime(120, t);
        oscS.frequency.exponentialRampToValueAtTime(30, t + 0.18);
        gainS.gain.setValueAtTime(0.35, t);
        gainS.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        oscS.connect(gainS);
        gainS.connect(ctx.destination);
        oscS.start(t);
        oscS.stop(t + 0.19);
      } else if (type === 'jump') {
        var oscJ = ctx.createOscillator();
        var gainJ = ctx.createGain();
        oscJ.type = 'triangle';
        oscJ.frequency.setValueAtTime(260, t);
        oscJ.frequency.exponentialRampToValueAtTime(520, t + 0.09);
        gainJ.gain.setValueAtTime(0.18, t);
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

  // --- 元素定义 ---
  var ELEMENTS = {
    fire: { name: '🔥 火之灵', color: '#ef4444', badgeBg: 'rgba(239, 68, 68, 0.25)', jump: -470, gravScale: 1.0 },
    water: { name: '💧 水之灵', color: '#06b6d4', badgeBg: 'rgba(6, 182, 212, 0.25)', jump: -440, gravScale: 1.0 },
    earth: { name: '🌿 土之灵', color: '#10b981', badgeBg: 'rgba(16, 185, 129, 0.25)', jump: -420, gravScale: 1.3 },
    wind: { name: '🌪️ 风之灵', color: '#a855f7', badgeBg: 'rgba(168, 85, 247, 0.25)', jump: -450, gravScale: 0.65 }
  };

  // --- 关卡数据 ---
  var FLOORS = [
    {
      id: 1,
      spawn: { x: 50, y: 320 },
      platforms: [
        { x: 0, y: 360, w: 180, h: 40 },
        { x: 340, y: 360, w: 200, h: 40 }
      ],
      // 荆棘藤蔓 (需用火焚烧)
      brambles: [
        { x: 130, y: 280, w: 30, h: 80, burned: false }
      ],
      // 水幕瀑布
      waterfalls: [],
      // 碎石板 (需土下坠碎裂)
      crackedStones: [],
      exit: { x: 470, y: 310, w: 34, h: 48 }
    },
    {
      id: 2,
      spawn: { x: 50, y: 320 },
      platforms: [
        { x: 0, y: 360, w: 220, h: 40 },
        { x: 0, y: 200, w: 160, h: 20 },
        { x: 300, y: 200, w: 240, h: 20 }
      ],
      brambles: [],
      waterfalls: [
        { x: 160, y: 140, w: 45, h: 220 } // 水幕通道
      ],
      crackedStones: [
        { x: 350, y: 195, w: 60, h: 25, broken: false }
      ],
      exit: { x: 480, y: 150, w: 34, h: 48 }
    },
    {
      id: 3,
      spawn: { x: 40, y: 320 },
      platforms: [
        { x: 0, y: 360, w: 140, h: 40 },
        { x: 220, y: 260, w: 100, h: 20 },
        { x: 400, y: 200, w: 140, h: 20 }
      ],
      brambles: [
        { x: 100, y: 280, w: 25, h: 80, burned: false }
      ],
      waterfalls: [
        { x: 170, y: 200, w: 40, h: 160 }
      ],
      crackedStones: [],
      exit: { x: 480, y: 150, w: 34, h: 48 }
    }
  ];

  // --- 游戏状态 ---
  var state = {
    running: false,
    curFloorIdx: 0,
    curElement: 'fire',
    score: 0,
    jumpCount: 0,
    player: {
      x: 50,
      y: 320,
      vx: 0,
      vy: 0,
      w: 22,
      h: 28,
      onGround: false,
      inWater: false
    },
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

  var floorVal = document.getElementById('floorVal');
  var elemBadge = document.getElementById('elemBadge');
  var scoreVal = document.getElementById('scoreVal');

  function updateHUD() {
    if (floorVal) floorVal.textContent = '第 ' + (state.curFloorIdx + 1) + ' 层';
    if (scoreVal) scoreVal.textContent = state.score + ' 💎';
    var elem = ELEMENTS[state.curElement];
    if (elemBadge && elem) {
      elemBadge.textContent = elem.name;
      elemBadge.style.borderColor = elem.color;
      elemBadge.style.backgroundColor = elem.badgeBg;
    }
    // 更新底部按键高亮
    var btns = document.querySelectorAll('.elem-btn');
    btns.forEach(function(b) {
      if (b.getAttribute('data-elem') === state.curElement) b.classList.add('active');
      else b.classList.remove('active');
    });
  }

  // --- 元素切换 ---
  function setElement(elKey) {
    if (!ELEMENTS[elKey] || state.curElement === elKey) return;
    state.curElement = elKey;
    playSound('switch');

    // 切换元素爆发粒子
    var p = state.player;
    var elem = ELEMENTS[elKey];
    for (var i = 0; i < 14; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 40 + Math.random() * 80;
      state.particles.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.4,
        decay: 2.2,
        color: elem.color,
        size: 3 + Math.random() * 3
      });
    }

    updateHUD();
  }

  // --- 物理更新 ---
  var BASE_GRAVITY = 1100;
  var MOVE_SPEED = 200;

  function update(dt) {
    if (!state.running) return;

    var p = state.player;
    var fl = FLOORS[state.curFloorIdx];
    var elem = ELEMENTS[state.curElement];

    var mx = 0;
    if (keys['ArrowLeft'] || keys['KeyA'] || steerDir === -1) mx -= 1;
    if (keys['ArrowRight'] || keys['KeyD'] || steerDir === 1) mx += 1;

    p.vx = mx * MOVE_SPEED;

    // 检查是否在瀑布水帘中
    p.inWater = false;
    for (var w = 0; w < fl.waterfalls.length; w++) {
      var wf = fl.waterfalls[w];
      if (
        p.x + p.w / 2 > wf.x && p.x - p.w / 2 < wf.x + wf.w &&
        p.y + p.h / 2 > wf.y && p.y - p.h / 2 < wf.y + wf.h
      ) {
        if (state.curElement === 'water') {
          p.inWater = true;
        }
      }
    }

    if (p.inWater) {
      // 水中浮力：向上游动
      p.vy = -180;
    } else {
      p.vy += BASE_GRAVITY * elem.gravScale * dt;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.onGround = false;

    // 1. 基础平台碰撞
    for (var i = 0; i < fl.platforms.length; i++) {
      var plat = fl.platforms[i];
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
        state.jumpCount = 0;
      }
    }

    // 2. 碎石板 (土元素可坠碎)
    for (var cs = 0; cs < fl.crackedStones.length; cs++) {
      var stone = fl.crackedStones[cs];
      if (!stone.broken) {
        if (
          p.x + p.w / 2 > stone.x &&
          p.x - p.w / 2 < stone.x + stone.w &&
          p.y + p.h / 2 >= stone.y &&
          p.y - p.h / 2 < stone.y + stone.h
        ) {
          if (state.curElement === 'earth' && p.vy > 250) {
            // 土元素高空坠落砸碎石板！
            stone.broken = true;
            playSound('smash');
            state.score += 150;
            updateHUD();
          } else if (p.vy >= 0) {
            p.y = stone.y - p.h / 2;
            p.vy = 0;
            p.onGround = true;
            state.jumpCount = 0;
          }
        }
      }
    }

    // 3. 荆棘藤蔓 (火元素靠近烧毁，其他元素阻挡)
    for (var b = 0; b < fl.brambles.length; b++) {
      var bm = fl.brambles[b];
      if (!bm.burned) {
        if (
          p.x + p.w / 2 > bm.x &&
          p.x - p.w / 2 < bm.x + bm.w &&
          p.y + p.h / 2 > bm.y &&
          p.y - p.h / 2 < bm.y + bm.h
        ) {
          if (state.curElement === 'fire') {
            bm.burned = true;
            playSound('burn');
            state.score += 150;
            updateHUD();
          } else {
            // 阻挡推开
            if (p.vx > 0) p.x = bm.x - p.w / 2;
            else if (p.vx < 0) p.x = bm.x + bm.w + p.w / 2;
          }
        }
      }
    }

    // 掉落深渊复活
    if (p.y > ch + 40) {
      resetPlayer();
    }

    // 检查通关法阵
    var ex = fl.exit;
    if (
      p.x + p.w / 2 > ex.x &&
      p.x - p.w / 2 < ex.x + ex.w &&
      p.y + p.h / 2 > ex.y &&
      p.y - p.h / 2 < ex.y + ex.h
    ) {
      clearFloor();
    }

    // 粒子更新
    for (var pt = state.particles.length - 1; pt >= 0; pt--) {
      var pObj = state.particles[pt];
      pObj.x += pObj.vx * dt;
      pObj.y += pObj.vy * dt;
      pObj.life -= pObj.decay * dt;
      if (pObj.life <= 0) state.particles.splice(pt, 1);
    }
  }

  function handleJump() {
    var elem = ELEMENTS[state.curElement];
    if (state.player.onGround) {
      state.player.vy = elem.jump;
      state.jumpCount = 1;
      playSound('jump');
    } else if (state.curElement === 'wind' && state.jumpCount < 2) {
      // 风之灵支持二段跳！
      state.player.vy = elem.jump * 0.9;
      state.jumpCount = 2;
      playSound('jump');
    }
  }

  // --- 画面渲染 ---
  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    var fl = FLOORS[state.curFloorIdx];

    // 1. 炼金背景
    ctx.fillStyle = '#090b16';
    ctx.fillRect(0, 0, cw, ch);

    // 2. 绘制瀑布水幕
    for (var w = 0; w < fl.waterfalls.length; w++) {
      var wf = fl.waterfalls[w];
      ctx.save();
      ctx.fillStyle = 'rgba(6, 182, 212, 0.35)';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#06b6d4';
      ctx.fillRect(wf.x, wf.y, wf.w, wf.h);
      ctx.restore();
    }

    // 3. 绘制平台
    ctx.fillStyle = '#1e2448';
    ctx.strokeStyle = '#384178';
    ctx.lineWidth = 2;
    for (var i = 0; i < fl.platforms.length; i++) {
      var plat = fl.platforms[i];
      ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
      ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);
    }

    // 4. 绘制碎石板
    for (var cs = 0; cs < fl.crackedStones.length; cs++) {
      var st = fl.crackedStones[cs];
      if (!st.broken) {
        ctx.save();
        ctx.fillStyle = '#10b981';
        ctx.fillRect(st.x, st.y, st.w, st.h);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        // 裂纹效果
        ctx.beginPath();
        ctx.moveTo(st.x + 10, st.y + 4);
        ctx.lineTo(st.x + 35, st.y + 18);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 5. 绘制荆棘藤蔓
    for (var b = 0; b < fl.brambles.length; b++) {
      var bm = fl.brambles[b];
      if (!bm.burned) {
        ctx.save();
        ctx.fillStyle = '#ef4444';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ef4444';
        ctx.fillRect(bm.x, bm.y, bm.w, bm.h);
        ctx.restore();
      }
    }

    // 6. 绘制通关法阵门
    var ex = fl.exit;
    ctx.save();
    ctx.fillStyle = '#fbbf24';
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#fbbf24';
    ctx.beginPath();
    ctx.roundRect(ex.x, ex.y, ex.w, ex.h, 12);
    ctx.fill();
    ctx.restore();

    // 7. 绘制玩家角色 (炼金灵体)
    var p = state.player;
    var elem = ELEMENTS[state.curElement];
    ctx.save();
    ctx.translate(p.x, p.y);

    ctx.fillStyle = elem.color;
    ctx.shadowBlur = 14;
    ctx.shadowColor = elem.color;
    ctx.beginPath();
    ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 8);
    ctx.fill();

    // 灵体面具眼眸
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, -6, 6, 4);

    ctx.restore();

    // 8. 绘制粒子
    for (var pt = 0; pt < state.particles.length; pt++) {
      var pObj = state.particles[pt];
      ctx.save();
      ctx.globalAlpha = Math.max(0, pObj.life);
      ctx.fillStyle = pObj.color;
      ctx.beginPath();
      ctx.arc(pObj.x, pObj.y, pObj.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
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
    var fl = FLOORS[state.curFloorIdx];
    state.player.x = fl.spawn.x;
    state.player.y = fl.spawn.y;
    state.player.vx = 0;
    state.player.vy = 0;
  }

  function resetFloor() {
    var fl = FLOORS[state.curFloorIdx];
    for (var b = 0; b < fl.brambles.length; b++) fl.brambles[b].burned = false;
    for (var cs = 0; cs < fl.crackedStones.length; cs++) fl.crackedStones[cs].broken = false;
    resetPlayer();
  }

  function clearFloor() {
    state.running = false;
    playSound('win');

    var clearOverlay = document.getElementById('clearOverlay');
    var finalFloor = document.getElementById('finalFloor');
    var finalScore = document.getElementById('finalScore');

    if (finalFloor) finalFloor.textContent = state.curFloorIdx + 1;
    if (finalScore) finalScore.textContent = state.score + ' 💎';

    if (clearOverlay) clearOverlay.classList.remove('hidden');

    if (window.GameStore) {
      var saved = window.GameStore.get(GAME_ID) || {};
      if (!saved.maxFloor || (state.curFloorIdx + 1) > saved.maxFloor) {
        window.GameStore.save(GAME_ID, {
          maxFloor: state.curFloorIdx + 1,
          score: state.score,
          date: Date.now()
        });
      }
    }
  }

  function startFloor(idx) {
    getAudioContext();
    state.curFloorIdx = idx % FLOORS.length;
    state.running = true;
    resetFloor();

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
    if (e.code === 'Digit1') setElement('fire');
    if (e.code === 'Digit2') setElement('water');
    if (e.code === 'Digit3') setElement('earth');
    if (e.code === 'Digit4') setElement('wind');
  });

  window.addEventListener('keyup', function(e) {
    keys[e.code] = false;
  });

  var btnLeft = document.getElementById('btnLeft');
  var btnRight = document.getElementById('btnRight');
  var btnJump = document.getElementById('btnJump');

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

  // 底部四象元素按钮
  var elemBtns = document.querySelectorAll('.elem-btn');
  elemBtns.forEach(function(b) {
    b.addEventListener('pointerdown', function(e) {
      e.preventDefault();
      var el = b.getAttribute('data-elem');
      setElement(el);
    });
  });

  var startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.addEventListener('click', function() { startFloor(0); });

  var nextBtn = document.getElementById('nextBtn');
  if (nextBtn) nextBtn.addEventListener('click', function() {
    startFloor((state.curFloorIdx + 1) % FLOORS.length);
  });

  resizeCanvas();
  requestAnimationFrame(gameLoop);
})();
