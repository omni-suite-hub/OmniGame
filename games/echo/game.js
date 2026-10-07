/*!
 * 声纳迷雾 (Sonar Fog) — OmniGame 深海声纳探测与回声定位
 */
(function() {
  'use strict';

  var GAME_ID = 'echo';

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
      if (type === 'sonar') {
        // 潜艇声纳典型 PING 纯音与残响
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1480, t);
        osc.frequency.exponentialRampToValueAtTime(880, t + 0.4);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.85);
      } else if (type === 'treasure') {
        var oscT = ctx.createOscillator();
        var gainT = ctx.createGain();
        oscT.type = 'triangle';
        oscT.frequency.setValueAtTime(659.25, t);
        oscT.frequency.linearRampToValueAtTime(1046.5, t + 0.15);
        gainT.gain.setValueAtTime(0.25, t);
        gainT.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        oscT.connect(gainT);
        gainT.connect(ctx.destination);
        oscT.start(t);
        oscT.stop(t + 0.16);
      } else if (type === 'oxygen') {
        var oscO = ctx.createOscillator();
        var gainO = ctx.createGain();
        oscO.type = 'sine';
        oscO.frequency.setValueAtTime(440, t);
        oscO.frequency.linearRampToValueAtTime(880, t + 0.18);
        gainO.gain.setValueAtTime(0.2, t);
        gainO.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        oscO.connect(gainO);
        gainO.connect(ctx.destination);
        oscO.start(t);
        oscO.stop(t + 0.19);
      }
    } catch (e) {}
  }

  // --- 游戏状态 ---
  var state = {
    running: false,
    depth: 0,
    score: 0,
    sonarCount: 0,
    oxygen: 100, // 0 - 100%
    startTime: 0,
    sub: {
      x: 200,
      y: 120,
      w: 26,
      h: 16,
      speed: 170
    },
    sonarWaves: [], // { x, y, r, maxR, life }
    rocks: [],      // 暗礁地形
    treasures: [],  // 宝藏
    oxygenBubbles: [], // 氧气泡
    leviathans: [], // 发光巡弋海兽
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
      state.sub.x = cw / 2;
      state.sub.y = ch * 0.3;
    }
  }
  window.addEventListener('resize', resizeCanvas);

  var depthVal = document.getElementById('depthVal');
  var scoreVal = document.getElementById('scoreVal');
  var oxygenFill = document.getElementById('oxygenFill');

  function updateHUD() {
    if (depthVal) depthVal.textContent = Math.floor(state.depth) + ' m';
    if (scoreVal) scoreVal.textContent = state.score + ' 💎';
    if (oxygenFill) {
      oxygenFill.style.width = Math.max(0, Math.min(100, state.oxygen)) + '%';
    }
  }

  // --- 生成海沟环境 ---
  function initTrenchWorld() {
    state.rocks = [];
    state.treasures = [];
    state.oxygenBubbles = [];
    state.leviathans = [];

    // 生成海沟暗礁立柱
    for (var r = 0; r < 7; r++) {
      state.rocks.push({
        x: 40 + Math.random() * (cw - 120),
        y: 80 + Math.random() * (ch - 180),
        w: 45 + Math.random() * 40,
        h: 45 + Math.random() * 40,
        revealedTimer: 0
      });
    }

    // 生成宝藏
    for (var t = 0; t < 5; t++) {
      state.treasures.push({
        x: 30 + Math.random() * (cw - 60),
        y: 70 + Math.random() * (ch - 170),
        radius: 10,
        revealedTimer: 0
      });
    }

    // 生成氧气泡
    for (var b = 0; b < 3; b++) {
      state.oxygenBubbles.push({
        x: 30 + Math.random() * (cw - 60),
        y: 70 + Math.random() * (ch - 170),
        radius: 11,
        revealedTimer: 0
      });
    }

    // 生成发光游弋海兽
    for (var l = 0; l < 2; l++) {
      state.leviathans.push({
        x: 50 + Math.random() * (cw - 100),
        y: 100 + Math.random() * (ch - 200),
        vx: (Math.random() - 0.5) * 60,
        vy: (Math.random() - 0.5) * 60,
        radius: 16,
        revealedTimer: 0
      });
    }
  }

  // --- 发射声纳脉冲 ---
  function triggerSonar() {
    if (!state.running) return;
    playSound('sonar');
    state.sonarCount++;

    state.sonarWaves.push({
      x: state.sub.x,
      y: state.sub.y,
      r: 10,
      maxR: 320,
      speed: 360
    });
  }

  // --- 更新与循环 ---
  function update(dt) {
    if (!state.running) return;

    var s = state.sub;

    // 1. 潜艇移动
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
      s.x += (mx / len) * s.speed * dt;
      s.y += (my / len) * s.speed * dt;
    }

    s.x = Math.max(s.w / 2, Math.min(cw - s.w / 2, s.x));
    s.y = Math.max(s.h / 2 + 30, Math.min(ch - s.h / 2 - 80, s.y));

    // 深度与氧气消耗
    state.depth += 6 * dt;
    state.oxygen -= 3.2 * dt;
    if (state.oxygen <= 0) {
      endGame();
      return;
    }

    // 2. 声纳脉冲扩展
    for (var w = state.sonarWaves.length - 1; w >= 0; w--) {
      var wv = state.sonarWaves[w];
      wv.r += wv.speed * dt;

      // 扫描照亮地形与宝藏
      for (var rk = 0; rk < state.rocks.length; rk++) {
        var rock = state.rocks[rk];
        if (Math.hypot(rock.x + rock.w / 2 - wv.x, rock.y + rock.h / 2 - wv.y) < wv.r + 30) {
          rock.revealedTimer = 3.5;
        }
      }
      for (var tr = 0; tr < state.treasures.length; tr++) {
        var treas = state.treasures[tr];
        if (Math.hypot(treas.x - wv.x, treas.y - wv.y) < wv.r + 20) {
          treas.revealedTimer = 3.5;
        }
      }
      for (var ob = 0; ob < state.oxygenBubbles.length; ob++) {
        var bubble = state.oxygenBubbles[ob];
        if (Math.hypot(bubble.x - wv.x, bubble.y - wv.y) < wv.r + 20) {
          bubble.revealedTimer = 3.5;
        }
      }
      for (var lv = 0; lv < state.leviathans.length; lv++) {
        var levi = state.leviathans[lv];
        if (Math.hypot(levi.x - wv.x, levi.y - wv.y) < wv.r + 25) {
          levi.revealedTimer = 3.5;
        }
      }

      if (wv.r >= wv.maxR) {
        state.sonarWaves.splice(w, 1);
      }
    }

    // 3. 拾取宝藏
    for (var t = state.treasures.length - 1; t >= 0; t--) {
      var tc = state.treasures[t];
      if (Math.hypot(s.x - tc.x, s.y - tc.y) < s.w / 2 + tc.radius) {
        state.score++;
        playSound('treasure');
        state.treasures.splice(t, 1);
        updateHUD();
      }
    }

    // 4. 拾取氧气泡
    for (var o = state.oxygenBubbles.length - 1; o >= 0; o--) {
      var oxy = state.oxygenBubbles[o];
      if (Math.hypot(s.x - oxy.x, s.y - oxy.y) < s.w / 2 + oxy.radius) {
        state.oxygen = Math.min(100, state.oxygen + 30);
        playSound('oxygen');
        state.oxygenBubbles.splice(o, 1);
        updateHUD();
      }
    }

    // 5. 海兽移动与撞击
    for (var l = 0; l < state.leviathans.length; l++) {
      var lev = state.leviathans[l];
      lev.x += lev.vx * dt;
      lev.y += lev.vy * dt;
      if (lev.x < 40 || lev.x > cw - 40) lev.vx *= -1;
      if (lev.y < 60 || lev.y > ch - 120) lev.vy *= -1;

      if (Math.hypot(s.x - lev.x, s.y - lev.y) < s.w / 2 + lev.radius) {
        state.oxygen -= 25 * dt; // 触碰海兽大量失氧
      }
    }

    // 暗礁、宝藏发光计时衰减
    for (var rk2 = 0; rk2 < state.rocks.length; rk2++) {
      if (state.rocks[rk2].revealedTimer > 0) state.rocks[rk2].revealedTimer -= dt;
    }
    for (var tr2 = 0; tr2 < state.treasures.length; tr2++) {
      if (state.treasures[tr2].revealedTimer > 0) state.treasures[tr2].revealedTimer -= dt;
    }
    for (var ob2 = 0; ob2 < state.oxygenBubbles.length; ob2++) {
      if (state.oxygenBubbles[ob2].revealedTimer > 0) state.oxygenBubbles[ob2].revealedTimer -= dt;
    }
    for (var lv2 = 0; lv2 < state.leviathans.length; lv2++) {
      if (state.leviathans[lv2].revealedTimer > 0) state.leviathans[lv2].revealedTimer -= dt;
    }

    updateHUD();
  }

  // --- 画面渲染 ---
  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    // 1. 深海全黑底色
    ctx.fillStyle = '#030a0e';
    ctx.fillRect(0, 0, cw, ch);

    // 2. 绘制声纳光圈波
    for (var w = 0; w < state.sonarWaves.length; w++) {
      var wv = state.sonarWaves[w];
      ctx.save();
      var alpha = Math.max(0, 1 - wv.r / wv.maxR);
      ctx.strokeStyle = 'rgba(16, 185, 129, ' + alpha + ')';
      ctx.lineWidth = 3;
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#10b981';
      ctx.beginPath();
      ctx.arc(wv.x, wv.y, wv.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 3. 绘制暗礁地形 (仅在被声纳照亮时显现)
    for (var r = 0; r < state.rocks.length; r++) {
      var rk = state.rocks[r];
      if (rk.revealedTimer > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, rk.revealedTimer / 1.5);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
        ctx.beginPath();
        ctx.roundRect(rk.x, rk.y, rk.w, rk.h, 8);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // 4. 绘制宝藏
    for (var t = 0; t < state.treasures.length; t++) {
      var tr = state.treasures[t];
      if (tr.revealedTimer > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, tr.revealedTimer / 1.5);
        ctx.fillStyle = '#fbbf24';
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#fbbf24';
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, tr.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 5. 绘制氧气泡
    for (var b = 0; b < state.oxygenBubbles.length; b++) {
      var oxy = state.oxygenBubbles[b];
      if (oxy.revealedTimer > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, oxy.revealedTimer / 1.5);
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(6, 182, 212, 0.3)';
        ctx.beginPath();
        ctx.arc(oxy.x, oxy.y, oxy.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // 6. 绘制海兽
    for (var l = 0; l < state.leviathans.length; l++) {
      var lev = state.leviathans[l];
      if (lev.revealedTimer > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, lev.revealedTimer / 1.5);
        ctx.fillStyle = '#ec4899';
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#ec4899';
        ctx.beginPath();
        ctx.arc(lev.x, lev.y, lev.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 7. 绘制潜水艇
    var s = state.sub;
    ctx.save();
    ctx.translate(s.x, s.y);

    // 艇首探照灯微光
    var gradLight = ctx.createRadialGradient(0, 0, 5, 0, -35, 60);
    gradLight.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    gradLight.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradLight;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 60, -Math.PI * 0.7, -Math.PI * 0.3);
    ctx.closePath();
    ctx.fill();

    // 潜水艇黄色胶囊壳体
    ctx.fillStyle = '#fbbf24';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#fbbf24';
    ctx.beginPath();
    ctx.roundRect(-s.w / 2, -s.h / 2, s.w, s.h, 8);
    ctx.fill();

    // 观测窗
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
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

  // --- 结束与重开 ---
  function endGame() {
    state.running = false;
    var overOverlay = document.getElementById('overOverlay');
    var finalDepth = document.getElementById('finalDepth');
    var finalScore = document.getElementById('finalScore');
    var finalSonar = document.getElementById('finalSonar');
    var finalTime = document.getElementById('finalTime');

    var durationSec = Math.round((performance.now() - state.startTime) / 1000);
    if (finalDepth) finalDepth.textContent = Math.floor(state.depth) + ' m';
    if (finalScore) finalScore.textContent = state.score + ' 💎';
    if (finalSonar) finalSonar.textContent = state.sonarCount;
    if (finalTime) finalTime.textContent = durationSec + 's';

    if (overOverlay) overOverlay.classList.remove('hidden');

    if (window.GameStore) {
      var saved = window.GameStore.get(GAME_ID) || {};
      if (!saved.highScore || state.score > saved.highScore) {
        window.GameStore.save(GAME_ID, {
          highScore: state.score,
          depth: Math.floor(state.depth),
          date: Date.now()
        });
      }
    }
  }

  function startGame() {
    getAudioContext();
    state.running = true;
    state.depth = 0;
    state.score = 0;
    state.sonarCount = 0;
    state.oxygen = 100;
    state.startTime = performance.now();
    state.sub.x = cw / 2;
    state.sub.y = ch * 0.3;
    state.sonarWaves = [];
    initTrenchWorld();

    updateHUD();

    var startOverlay = document.getElementById('startOverlay');
    var overOverlay = document.getElementById('overOverlay');
    if (startOverlay) startOverlay.classList.add('hidden');
    if (overOverlay) overOverlay.classList.add('hidden');
  }

  // --- 输入事件绑定 ---
  var keys = {};
  window.addEventListener('keydown', function(e) {
    keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'KeyE') {
      e.preventDefault();
      triggerSonar();
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

  // 声纳按钮
  var btnSonar = document.getElementById('btnSonar');
  if (btnSonar) {
    btnSonar.addEventListener('pointerdown', function(e) {
      e.preventDefault();
      triggerSonar();
    });
  }

  var startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.addEventListener('click', startGame);

  var retryBtn = document.getElementById('retryBtn');
  if (retryBtn) retryBtn.addEventListener('click', startGame);

  resizeCanvas();
  requestAnimationFrame(gameLoop);
})();
