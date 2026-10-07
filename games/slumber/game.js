/*!
 * 梦境潜行 (Dream Stealth) — OmniGame 唯美梦境潜行
 */
(function() {
  'use strict';

  var GAME_ID = 'slumber';

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
      if (type === 'star') {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(1320, t + 0.15);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.16);
      } else if (type === 'sleep') {
        var oscS = ctx.createOscillator();
        var gainS = ctx.createGain();
        oscS.type = 'sine';
        oscS.frequency.setValueAtTime(330, t);
        oscS.frequency.linearRampToValueAtTime(220, t + 0.2);
        gainS.gain.setValueAtTime(0.2, t);
        gainS.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        oscS.connect(gainS);
        gainS.connect(ctx.destination);
        oscS.start(t);
        oscS.stop(t + 0.21);
      } else if (type === 'caught') {
        var oscC = ctx.createOscillator();
        var gainC = ctx.createGain();
        oscC.type = 'sawtooth';
        oscC.frequency.setValueAtTime(220, t);
        oscC.frequency.linearRampToValueAtTime(80, t + 0.3);
        gainC.gain.setValueAtTime(0.35, t);
        gainC.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        oscC.connect(gainC);
        gainC.connect(ctx.destination);
        oscC.start(t);
        oscC.stop(t + 0.31);
      }
    } catch (e) {}
  }

  // --- 游戏状态 ---
  var state = {
    running: false,
    level: 1,
    score: 0,
    stealthSuccess: 0,
    startTime: 0,
    breath: 100, // 0 - 100%
    isSlumbering: false,
    player: {
      x: 100,
      y: 300,
      radius: 12,
      speed: 180
    },
    stars: [],
    watchers: [],
    particles: [],
    joy: { active: false, x: 0, y: 0 }
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
      state.player.x = cw / 2;
      state.player.y = ch / 2;
    }
  }
  window.addEventListener('resize', resizeCanvas);

  var levelVal = document.getElementById('levelVal');
  var scoreVal = document.getElementById('scoreVal');
  var breathFill = document.getElementById('breathFill');

  function updateHUD() {
    if (levelVal) levelVal.textContent = '第 ' + state.level + ' 层';
    if (scoreVal) scoreVal.textContent = state.score + ' ⭐';
    if (breathFill) {
      breathFill.style.width = Math.max(0, Math.min(100, state.breath)) + '%';
    }
  }

  // --- 生成关卡元素 ---
  function setupLevel(lvl) {
    state.stars = [];
    state.watchers = [];

    // 生成星辉 (8 + lvl * 2)
    var numStars = Math.min(18, 6 + lvl * 2);
    for (var i = 0; i < numStars; i++) {
      state.stars.push({
        x: 40 + Math.random() * (cw - 80),
        y: 60 + Math.random() * (ch - 180),
        radius: 7,
        collected: false
      });
    }

    // 生成梦魇巡查守卫 (1 + Math.floor(lvl / 2))
    var numWatchers = Math.min(4, 1 + Math.floor(lvl / 2));
    for (var w = 0; w < numWatchers; w++) {
      state.watchers.push({
        x: 60 + Math.random() * (cw - 120),
        y: 80 + Math.random() * (ch - 200),
        vx: (Math.random() - 0.5) * 80,
        vy: (Math.random() - 0.5) * 80,
        angle: Math.random() * Math.PI * 2,
        coneAngle: Math.PI * 0.45,
        coneRange: 130 + lvl * 10,
        rotSpeed: (Math.random() > 0.5 ? 1 : -1) * (1.2 + Math.random() * 0.8)
      });
    }

    state.player.x = 40;
    state.player.y = ch / 2;
  }

  // --- 更新与循环 ---
  function update(dt) {
    if (!state.running) return;

    var p = state.player;

    // 1. 判断假寐状态
    var wantSlumber = slumberActive || keys['Space'] || keys['KeyZ'];
    if (wantSlumber && state.breath > 0) {
      if (!state.isSlumbering) playSound('sleep');
      state.isSlumbering = true;
      state.breath = Math.max(0, state.breath - 24 * dt);
    } else {
      state.isSlumbering = false;
      state.breath = Math.min(100, state.breath + 32 * dt);
    }

    // 2. 玩家移动 (假寐中无法移动)
    if (!state.isSlumbering) {
      var mx = 0, my = 0;
      if (keys['ArrowLeft'] || keys['KeyA']) mx -= 1;
      if (keys['ArrowRight'] || keys['KeyD']) mx += 1;
      if (keys['ArrowUp'] || keys['KeyW']) my -= 1;
      if (keys['ArrowDown'] || keys['KeyS']) my += 1;

      if (state.joy.active) {
        mx = state.joy.x;
        my = state.joy.y;
      }

      var len = Math.hypot(mx, my);
      if (len > 0.05) {
        p.x += (mx / len) * p.speed * dt;
        p.y += (my / len) * p.speed * dt;
      }
    }

    p.x = Math.max(p.radius, Math.min(cw - p.radius, p.x));
    p.y = Math.max(p.radius + 30, Math.min(ch - p.radius - 80, p.y));

    // 3. 收集星辉
    for (var s = state.stars.length - 1; s >= 0; s--) {
      var st = state.stars[s];
      if (Math.hypot(p.x - st.x, p.y - st.y) < p.radius + st.radius) {
        state.score++;
        playSound('star');

        for (var i = 0; i < 8; i++) {
          state.particles.push({
            x: st.x,
            y: st.y,
            vx: (Math.random() - 0.5) * 120,
            vy: (Math.random() - 0.5) * 120,
            life: 0.4,
            decay: 2.2,
            color: '#fbbf24',
            size: 3
          });
        }

        state.stars.splice(s, 1);
        updateHUD();
      }
    }

    // 如果星辉全收集 -> 晋级下一层
    if (state.stars.length === 0) {
      state.level++;
      setupLevel(state.level);
      updateHUD();
      return;
    }

    // 4. 梦魇巡查者巡逻与视锥检测
    for (var w = 0; w < state.watchers.length; w++) {
      var wt = state.watchers[w];

      wt.angle += wt.rotSpeed * dt;
      wt.x += wt.vx * dt;
      wt.y += wt.vy * dt;

      if (wt.x < 40 || wt.x > cw - 40) wt.vx *= -1;
      if (wt.y < 50 || wt.y > ch - 120) wt.vy *= -1;

      // 视锥射线判定
      var dx = p.x - wt.x;
      var dy = p.y - wt.y;
      var distToPlayer = Math.hypot(dx, dy);

      if (distToPlayer < wt.coneRange) {
        var angleToP = Math.atan2(dy, dx);
        var diff = Math.abs(angleToP - wt.angle);
        while (diff > Math.PI) diff = Math.PI * 2 - diff;

        if (diff < wt.coneAngle / 2) {
          // 玩家在巡查灯照射范围内！
          if (state.isSlumbering) {
            // 成功假寐隐匿！避开探查
            state.stealthSuccess++;
          } else {
            // 被梦魇之眼捕获！游戏结束
            playSound('caught');
            endGame();
            return;
          }
        }
      }
    }

    // 5. 粒子更新
    for (var pt = state.particles.length - 1; pt >= 0; pt--) {
      var pObj = state.particles[pt];
      pObj.x += pObj.vx * dt;
      pObj.y += pObj.vy * dt;
      pObj.life -= pObj.decay * dt;
      if (pObj.life <= 0) state.particles.splice(pt, 1);
    }

    updateHUD();
  }

  // --- 画面渲染 ---
  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    // 1. 梦境星云背景
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.04)';
    ctx.lineWidth = 1;
    for (var y = 0; y < ch; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cw, y);
      ctx.stroke();
    }

    // 2. 绘制星辉
    for (var s = 0; s < state.stars.length; s++) {
      var st = state.stars[s];
      ctx.save();
      ctx.fillStyle = '#fbbf24';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#fbbf24';
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. 绘制梦魇视锥巡查灯
    for (var w = 0; w < state.watchers.length; w++) {
      var wt = state.watchers[w];

      ctx.save();
      ctx.translate(wt.x, wt.y);

      // 探照光束 (红光扇形)
      var grad = ctx.createRadialGradient(0, 0, 10, 0, 0, wt.coneRange);
      grad.addColorStop(0, 'rgba(244, 63, 94, 0.35)');
      grad.addColorStop(1, 'rgba(244, 63, 94, 0.02)');
      ctx.fillStyle = grad;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, wt.coneRange, wt.angle - wt.coneAngle / 2, wt.angle + wt.coneAngle / 2);
      ctx.closePath();
      ctx.fill();

      // 梦魇眼球核心
      ctx.fillStyle = '#f43f5e';
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#f43f5e';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#080a1c';
      ctx.beginPath();
      ctx.arc(Math.cos(wt.angle) * 4, Math.sin(wt.angle) * 4, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // 4. 绘制玩家角色 (梦境精灵)
    var p = state.player;
    ctx.save();
    ctx.translate(p.x, p.y);

    if (state.isSlumbering) {
      // 假寐入眠状态：蓝紫色半透明光茧
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#a78bfa';
      ctx.shadowBlur = 16;
      ctx.shadowColor = '#a78bfa';
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();

      // 闭眼睫毛弧线
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 2, 4, Math.PI, 0);
      ctx.stroke();
    } else {
      // 清醒游弋状态
      ctx.fillStyle = '#38bdf8';
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#38bdf8';
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();

      // 灵动眼睛
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(3, -2, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // 5. 粒子绘制
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

  // --- 结束与重开 ---
  function endGame() {
    state.running = false;
    var overOverlay = document.getElementById('overOverlay');
    var finalScore = document.getElementById('finalScore');
    var finalLevel = document.getElementById('finalLevel');
    var finalStealth = document.getElementById('finalStealth');
    var finalTime = document.getElementById('finalTime');

    var durationSec = Math.round((performance.now() - state.startTime) / 1000);
    if (finalScore) finalScore.textContent = state.score + ' ⭐';
    if (finalLevel) finalLevel.textContent = state.level;
    if (finalStealth) finalStealth.textContent = state.stealthSuccess;
    if (finalTime) finalTime.textContent = durationSec + 's';

    if (overOverlay) overOverlay.classList.remove('hidden');

    if (window.GameStore) {
      var saved = window.GameStore.get(GAME_ID) || {};
      if (!saved.highScore || state.score > saved.highScore) {
        window.GameStore.save(GAME_ID, {
          highScore: state.score,
          level: state.level,
          date: Date.now()
        });
      }
    }
  }

  function startGame() {
    getAudioContext();
    state.running = true;
    state.level = 1;
    state.score = 0;
    state.stealthSuccess = 0;
    state.breath = 100;
    state.isSlumbering = false;
    state.startTime = performance.now();
    setupLevel(1);

    updateHUD();

    var startOverlay = document.getElementById('startOverlay');
    var overOverlay = document.getElementById('overOverlay');
    if (startOverlay) startOverlay.classList.add('hidden');
    if (overOverlay) overOverlay.classList.add('hidden');
  }

  // --- 输入事件绑定 ---
  var keys = {};
  var slumberActive = false;

  window.addEventListener('keydown', function(e) {
    keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'KeyZ') {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', function(e) {
    keys[e.code] = false;
  });

  // 虚拟摇杆
  var joyZone = document.getElementById('joyZone');
  var joyKnob = document.getElementById('joyKnob');
  if (joyZone && joyKnob) {
    var joyRect = null;
    function handleJoyMove(e) {
      if (!joyRect) joyRect = joyZone.getBoundingClientRect();
      var cx = joyRect.left + joyRect.width / 2;
      var cy = joyRect.top + joyRect.height / 2;
      var dx = e.clientX - cx;
      var dy = e.clientY - cy;
      var dist = Math.hypot(dx, dy);
      var maxR = 30;
      if (dist > maxR) {
        dx = (dx / dist) * maxR;
        dy = (dy / dist) * maxR;
      }
      joyKnob.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
      state.joy.active = true;
      state.joy.x = dx / maxR;
      state.joy.y = dy / maxR;
    }
    function handleJoyEnd() {
      joyKnob.style.transform = 'translate(0px, 0px)';
      state.joy.active = false;
      state.joy.x = 0;
      state.joy.y = 0;
    }
    joyZone.addEventListener('pointerdown', function(e) {
      joyZone.setPointerCapture(e.pointerId);
      joyRect = joyZone.getBoundingClientRect();
      handleJoyMove(e);
    });
    joyZone.addEventListener('pointermove', function(e) {
      if (state.joy.active) handleJoyMove(e);
    });
    joyZone.addEventListener('pointerup', handleJoyEnd);
    joyZone.addEventListener('pointercancel', handleJoyEnd);
  }

  // 假寐按钮
  var btnSlumber = document.getElementById('btnSlumber');
  if (btnSlumber) {
    btnSlumber.addEventListener('pointerdown', function(e) { e.preventDefault(); slumberActive = true; });
    btnSlumber.addEventListener('pointerup', function() { slumberActive = false; });
    btnSlumber.addEventListener('pointercancel', function() { slumberActive = false; });
  }

  var startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.addEventListener('click', startGame);

  var retryBtn = document.getElementById('retryBtn');
  if (retryBtn) retryBtn.addEventListener('click', startGame);

  resizeCanvas();
  requestAnimationFrame(gameLoop);
})();
