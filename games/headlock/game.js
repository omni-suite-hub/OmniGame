/*!
 * 深空引力漂 (Gravity Slingshot) — OmniGame 天体轨道弹射
 */
(function() {
  'use strict';

  var GAME_ID = 'headlock';

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
      if (type === 'tether') {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.linearRampToValueAtTime(600, t + 0.12);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.13);
      } else if (type === 'slingshot') {
        var oscS = ctx.createOscillator();
        var gainS = ctx.createGain();
        oscS.type = 'sawtooth';
        oscS.frequency.setValueAtTime(400, t);
        oscS.frequency.exponentialRampToValueAtTime(120, t + 0.25);
        gainS.gain.setValueAtTime(0.35, t);
        gainS.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        oscS.connect(gainS);
        gainS.connect(ctx.destination);
        oscS.start(t);
        oscS.stop(t + 0.26);
      } else if (type === 'gate') {
        [523.25, 659.25, 1046.5].forEach(function(freq, i) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(freq, t + i * 0.07);
          g.gain.setValueAtTime(0.25, t + i * 0.07);
          g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.18);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t + i * 0.07);
          o.stop(t + i * 0.07 + 0.19);
        });
      } else if (type === 'star') {
        var oscSt = ctx.createOscillator();
        var gainSt = ctx.createGain();
        oscSt.type = 'sine';
        oscSt.frequency.setValueAtTime(880, t);
        oscSt.frequency.linearRampToValueAtTime(1320, t + 0.1);
        gainSt.gain.setValueAtTime(0.18, t);
        gainSt.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        oscSt.connect(gainSt);
        gainSt.connect(ctx.destination);
        oscSt.start(t);
        oscSt.stop(t + 0.11);
      } else if (type === 'crash') {
        var oscC = ctx.createOscillator();
        var gainC = ctx.createGain();
        oscC.type = 'sawtooth';
        oscC.frequency.setValueAtTime(180, t);
        oscC.frequency.exponentialRampToValueAtTime(40, t + 0.3);
        gainC.gain.setValueAtTime(0.4, t);
        gainC.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        oscC.connect(gainC);
        gainC.connect(ctx.destination);
        oscC.start(t);
        oscC.stop(t + 0.31);
      }
    } catch (e) {}
  }

  // --- 游戏主状态 ---
  var state = {
    running: false,
    score: 0,
    gatesPassed: 0,
    slingshotCount: 0,
    maxSpeed: 450,
    ship: {
      x: 100,
      y: 200,
      vx: 180,
      vy: 60,
      speed: 220,
      radius: 10,
      tetherPlanet: null,
      orbitR: 0,
      orbitAngle: 0,
      orbitDir: 1
    },
    planets: [],
    stargates: [],
    stars: [],
    asteroids: [],
    particles: [],
    trails: []
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

  var gatesVal = document.getElementById('gatesVal');
  var speedVal = document.getElementById('speedVal');
  var scoreVal = document.getElementById('scoreVal');

  function updateHUD() {
    if (gatesVal) gatesVal.textContent = state.gatesPassed + ' 门';
    var curSpd = Math.round(state.ship.speed * 2.5);
    if (speedVal) speedVal.textContent = curSpd + ' km/s';
    if (scoreVal) scoreVal.textContent = state.score + ' ⭐';
  }

  // --- 生成宇宙空间天体 ---
  function initGalaxy() {
    state.planets = [
      { x: cw * 0.25, y: ch * 0.3, radius: 32, color: '#00f2fe' },
      { x: cw * 0.75, y: ch * 0.35, radius: 40, color: '#f59e0b' },
      { x: cw * 0.35, y: ch * 0.7, radius: 36, color: '#a855f7' },
      { x: cw * 0.8, y: ch * 0.75, radius: 28, color: '#10b981' }
    ];

    state.stargates = [
      { x1: cw * 0.5 - 35, y1: ch * 0.35, x2: cw * 0.5 + 35, y2: ch * 0.35, passed: false },
      { x1: cw * 0.55 - 35, y1: ch * 0.65, x2: cw * 0.55 + 35, y2: ch * 0.65, passed: false }
    ];

    state.stars = [];
    for (var p = 0; p < state.planets.length; p++) {
      var pl = state.planets[p];
      for (var a = 0; a < 4; a++) {
        var ang = a * (Math.PI / 2);
        var r = pl.radius + 35;
        state.stars.push({
          x: pl.x + Math.cos(ang) * r,
          y: pl.y + Math.sin(ang) * r,
          radius: 6,
          collected: false
        });
      }
    }

    state.asteroids = [
      { x: cw * 0.5, y: ch * 0.5, radius: 14, vx: 20, vy: -15 }
    ];

    state.ship.x = cw * 0.15;
    state.ship.y = ch * 0.18;
    state.ship.vx = 200;
    state.ship.vy = 40;
    state.ship.speed = 220;
    state.ship.tetherPlanet = null;
  }

  // --- 缆绳锁定与弹射 ---
  var isTethering = false;

  function engageTether() {
    if (!state.running) return;
    var s = state.ship;
    if (s.tetherPlanet) return;

    // 寻找最近的行星
    var closestPlanet = null;
    var minDist = 999;
    for (var i = 0; i < state.planets.length; i++) {
      var pl = state.planets[i];
      var d = Math.hypot(s.x - pl.x, s.y - pl.y);
      if (d < pl.radius + 140 && d < minDist) {
        minDist = d;
        closestPlanet = pl;
      }
    }

    if (closestPlanet) {
      playSound('tether');
      s.tetherPlanet = closestPlanet;
      s.orbitR = minDist;
      s.orbitAngle = Math.atan2(s.y - closestPlanet.y, s.x - closestPlanet.x);

      // 判断旋转方向 (顺时针或逆时针)
      var cross = (s.x - closestPlanet.x) * s.vy - (s.y - closestPlanet.y) * s.vx;
      s.orbitDir = cross >= 0 ? 1 : -1;
    }
  }

  function releaseTether() {
    if (!state.running) return;
    var s = state.ship;
    if (!s.tetherPlanet) return;

    playSound('slingshot');
    state.slingshotCount++;

    // 弹射切线方向速度
    var tangentAngle = s.orbitAngle + (s.orbitDir * Math.PI / 2);
    s.speed = Math.min(480, s.speed * 1.25);
    s.vx = Math.cos(tangentAngle) * s.speed;
    s.vy = Math.sin(tangentAngle) * s.speed;

    if (s.speed * 2.5 > state.maxSpeed) {
      state.maxSpeed = Math.round(s.speed * 2.5);
    }

    s.tetherPlanet = null;

    // 弹射冲击波
    for (var i = 0; i < 16; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 60 + Math.random() * 120;
      state.particles.push({
        x: s.x,
        y: s.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.45,
        decay: 2.0,
        color: '#00f2fe',
        size: 3 + Math.random() * 3
      });
    }

    updateHUD();
  }

  // --- 更新与循环 ---
  function update(dt) {
    if (!state.running) return;

    var s = state.ship;

    if (s.tetherPlanet) {
      // 轨道引力回旋中
      var w = (s.speed / s.orbitR) * s.orbitDir;
      s.orbitAngle += w * dt;
      s.x = s.tetherPlanet.x + Math.cos(s.orbitAngle) * s.orbitR;
      s.y = s.tetherPlanet.y + Math.sin(s.orbitAngle) * s.orbitR;

      // 轨道持续蓄力微加速
      s.speed += 40 * dt;
    } else {
      // 惯性飞行
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      // 屏幕边缘弹射反射
      if (s.x < s.radius) { s.x = s.radius; s.vx *= -0.85; }
      if (s.x > cw - s.radius) { s.x = cw - s.radius; s.vx *= -0.85; }
      if (s.y < s.radius + 30) { s.y = s.radius + 30; s.vy *= -0.85; }
      if (s.y > ch - s.radius - 60) { s.y = ch - s.radius - 60; s.vy *= -0.85; }
    }

    // 记录航迹尾焰
    state.trails.push({ x: s.x, y: s.y, life: 0.35 });
    for (var tr = state.trails.length - 1; tr >= 0; tr--) {
      state.trails[tr].life -= dt;
      if (state.trails[tr].life <= 0) state.trails.splice(tr, 1);
    }

    // 1. 穿透星门判定
    for (var g = 0; g < state.stargates.length; g++) {
      var gate = state.stargates[g];
      var gMidX = (gate.x1 + gate.x2) / 2;
      var gMidY = (gate.y1 + gate.y2) / 2;

      if (Math.hypot(s.x - gMidX, s.y - gMidY) < 30 && !gate.passed) {
        gate.passed = true;
        state.gatesPassed++;
        state.score += 500;
        playSound('gate');
        setTimeout(function() { gate.passed = false; }, 3000);
        updateHUD();
      }
    }

    // 2. 收集星尘
    for (var st = state.stars.length - 1; st >= 0; st--) {
      var star = state.stars[st];
      if (Math.hypot(s.x - star.x, s.y - star.y) < s.radius + star.radius) {
        state.score += 60;
        playSound('star');
        state.stars.splice(st, 1);
        updateHUD();
      }
    }

    // 3. 行星撞击判定 (太靠近行星核心)
    for (var p = 0; p < state.planets.length; p++) {
      var pl = state.planets[p];
      if (Math.hypot(s.x - pl.x, s.y - pl.y) < pl.radius + s.radius - 4) {
        playSound('crash');
        endGame();
        return;
      }
    }

    // 4. 小行星撞击
    for (var a = 0; a < state.asteroids.length; a++) {
      var ast = state.asteroids[a];
      ast.x += ast.vx * dt;
      ast.y += ast.vy * dt;
      if (ast.x < 30 || ast.x > cw - 30) ast.vx *= -1;
      if (ast.y < 50 || ast.y > ch - 90) ast.vy *= -1;

      if (Math.hypot(s.x - ast.x, s.y - ast.y) < s.radius + ast.radius) {
        playSound('crash');
        endGame();
        return;
      }
    }

    // 粒子更新
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

    // 1. 深空黑幕
    ctx.fillStyle = '#050610';
    ctx.fillRect(0, 0, cw, ch);

    // 2. 绘制行星引力场与星体
    for (var p = 0; p < state.planets.length; p++) {
      var pl = state.planets[p];

      // 引力影响圈虚线
      ctx.save();
      ctx.strokeStyle = 'rgba(129, 140, 248, 0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, pl.radius + 80, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 行星本体
      ctx.fillStyle = pl.color;
      ctx.shadowBlur = 18;
      ctx.shadowColor = pl.color;
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, pl.radius, 0, Math.PI * 2);
      ctx.fill();

      // 行星光晕环
      ctx.strokeStyle = pl.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, pl.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 3. 绘制星门
    for (var g = 0; g < state.stargates.length; g++) {
      var gate = state.stargates[g];
      ctx.save();
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 4;
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#00f2fe';
      ctx.beginPath();
      ctx.moveTo(gate.x1, gate.y1);
      ctx.lineTo(gate.x2, gate.y2);
      ctx.stroke();

      // 星门两端发光端点
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(gate.x1, gate.y1, 6, 0, Math.PI * 2);
      ctx.arc(gate.x2, gate.y2, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 4. 绘制星尘
    for (var st = 0; st < state.stars.length; st++) {
      var star = state.stars[st];
      ctx.save();
      ctx.fillStyle = '#fbbf24';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#fbbf24';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 5. 绘制小行星
    for (var a = 0; a < state.asteroids.length; a++) {
      var ast = state.asteroids[a];
      ctx.save();
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(ast.x, ast.y, ast.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 6. 绘制引力缆绳 (能量光索)
    var s = state.ship;
    if (s.tetherPlanet) {
      ctx.save();
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#00f2fe';
      ctx.beginPath();
      ctx.moveTo(s.tetherPlanet.x, s.tetherPlanet.y);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      ctx.restore();
    }

    // 7. 绘制飞船尾焰
    for (var tr = 0; tr < state.trails.length; tr++) {
      var tObj = state.trails[tr];
      ctx.save();
      ctx.globalAlpha = tObj.life * 2;
      ctx.fillStyle = '#00f2fe';
      ctx.beginPath();
      ctx.arc(tObj.x, tObj.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 8. 绘制飞船 (三角形曲率战舰)
    ctx.save();
    ctx.translate(s.x, s.y);
    var heading = Math.atan2(s.vy, s.vx);
    if (s.tetherPlanet) {
      heading = s.orbitAngle + (s.orbitDir * Math.PI / 2);
    }
    ctx.rotate(heading);

    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#00f2fe';
    ctx.beginPath();
    ctx.moveTo(s.radius + 6, 0);
    ctx.lineTo(-s.radius, -s.radius * 0.8);
    ctx.lineTo(-s.radius * 0.5, 0);
    ctx.lineTo(-s.radius, s.radius * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 9. 粒子渲染
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
    var finalGates = document.getElementById('finalGates');
    var finalMaxSpeed = document.getElementById('finalMaxSpeed');
    var finalSling = document.getElementById('finalSling');

    if (finalScore) finalScore.textContent = state.score + ' ⭐';
    if (finalGates) finalGates.textContent = state.gatesPassed;
    if (finalMaxSpeed) finalMaxSpeed.textContent = state.maxSpeed;
    if (finalSling) finalSling.textContent = state.slingshotCount;

    if (overOverlay) overOverlay.classList.remove('hidden');

    if (window.GameStore) {
      var saved = window.GameStore.get(GAME_ID) || {};
      if (!saved.highScore || state.score > saved.highScore) {
        window.GameStore.save(GAME_ID, {
          highScore: state.score,
          gates: state.gatesPassed,
          maxSpeed: state.maxSpeed,
          date: Date.now()
        });
      }
    }
  }

  function startGame() {
    getAudioContext();
    state.running = true;
    state.score = 0;
    state.gatesPassed = 0;
    state.slingshotCount = 0;
    state.maxSpeed = 450;
    state.particles = [];
    state.trails = [];
    initGalaxy();

    updateHUD();

    var startOverlay = document.getElementById('startOverlay');
    var overOverlay = document.getElementById('overOverlay');
    if (startOverlay) startOverlay.classList.add('hidden');
    if (overOverlay) overOverlay.classList.add('hidden');
  }

  // --- 输入事件绑定 ---
  window.addEventListener('keydown', function(e) {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      engageTether();
    }
  });

  window.addEventListener('keyup', function(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      releaseTether();
    }
  });

  canvas.addEventListener('pointerdown', function(e) {
    e.preventDefault();
    engageTether();
  });
  window.addEventListener('pointerup', function() {
    releaseTether();
  });

  var btnTether = document.getElementById('btnTether');
  if (btnTether) {
    btnTether.addEventListener('pointerdown', function(e) { e.preventDefault(); engageTether(); });
    btnTether.addEventListener('pointerup', function() { releaseTether(); });
    btnTether.addEventListener('pointercancel', function() { releaseTether(); });
  }

  var startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.addEventListener('click', startGame);

  var retryBtn = document.getElementById('retryBtn');
  if (retryBtn) retryBtn.addEventListener('click', startGame);

  resizeCanvas();
  requestAnimationFrame(gameLoop);
})();