/*!
 * 子弹缓冲 (Bullet Buffer) — OmniGame 赛博子弹时间穿梭
 */
(function() {
  'use strict';

  var GAME_ID = 'buffer';

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
      if (type === 'graze') {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.linearRampToValueAtTime(1800, t + 0.08);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.09);
      } else if (type === 'slowmo') {
        var oscS = ctx.createOscillator();
        var gainS = ctx.createGain();
        oscS.type = 'sawtooth';
        oscS.frequency.setValueAtTime(180, t);
        oscS.frequency.exponentialRampToValueAtTime(60, t + 0.25);
        gainS.gain.setValueAtTime(0.25, t);
        gainS.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        oscS.connect(gainS);
        gainS.connect(ctx.destination);
        oscS.start(t);
        oscS.stop(t + 0.26);
      } else if (type === 'crash') {
        var oscC = ctx.createOscillator();
        var gainC = ctx.createGain();
        oscC.type = 'sawtooth';
        oscC.frequency.setValueAtTime(220, t);
        oscC.frequency.exponentialRampToValueAtTime(30, t + 0.3);
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
    distance: 0,
    score: 0,
    grazes: 0,
    slowMoTimes: 0,
    bufferEnergy: 100, // 0 - 100%
    isSlowMo: false,
    player: {
      x: 200,
      y: 420,
      radius: 9,
      speed: 280
    },
    obstacles: [],
    particles: [],
    spawnTimer: 0,
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
      state.player.y = ch * 0.75;
    }
  }
  window.addEventListener('resize', resizeCanvas);

  var distVal = document.getElementById('distVal');
  var scoreVal = document.getElementById('scoreVal');
  var bufferFill = document.getElementById('bufferFill');

  function updateHUD() {
    if (distVal) distVal.textContent = Math.floor(state.distance) + ' m';
    if (scoreVal) scoreVal.textContent = state.score + ' (' + state.grazes + ' 擦弹)';
    if (bufferFill) {
      bufferFill.style.width = Math.max(0, Math.min(100, state.bufferEnergy)) + '%';
    }
  }

  // --- 障碍物生成 ---
  function spawnObstacle() {
    var roll = Math.random();

    if (roll < 0.45) {
      // 旋转双臂激光陷阱
      state.obstacles.push({
        type: 'spinner',
        x: Math.random() * (cw - 80) + 40,
        y: -40,
        speedY: 140,
        angle: 0,
        rotSpeed: (Math.random() > 0.5 ? 1 : -1) * (2.0 + Math.random() * 1.5),
        armLength: 55,
        grazed: false
      });
    } else if (roll < 0.8) {
      // 激光阻隔墙 (中间留缝隙)
      var gapWidth = 65;
      var gapX = Math.random() * (cw - gapWidth - 40) + 20;
      state.obstacles.push({
        type: 'wall',
        y: -20,
        speedY: 170,
        gapX: gapX,
        gapW: gapWidth,
        grazed: false
      });
    } else {
      // 追踪飞弹
      state.obstacles.push({
        type: 'mine',
        x: Math.random() * (cw - 60) + 30,
        y: -30,
        speedY: 190,
        radius: 14,
        grazed: false
      });
    }
  }

  // --- 更新与循环 ---
  function update(dt) {
    if (!state.running) return;

    var p = state.player;

    // 1. 判断子弹时间
    var wantSlow = bufferActive || keys['Space'] || keys['ShiftLeft'] || keys['ShiftRight'];
    if (wantSlow && state.bufferEnergy > 0) {
      if (!state.isSlowMo) {
        state.slowMoTimes++;
        playSound('slowmo');
      }
      state.isSlowMo = true;
      state.bufferEnergy = Math.max(0, state.bufferEnergy - 26 * dt);
    } else {
      state.isSlowMo = false;
      // 能量自然回复
      state.bufferEnergy = Math.min(100, state.bufferEnergy + 10 * dt);
    }

    var timeScale = state.isSlowMo ? 0.22 : 1.0;
    var worldDt = dt * timeScale;

    // 2. 玩家移动 (不受慢动作过度影响，保持敏捷操控)
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
      var normX = mx / len;
      var normY = my / len;
      var pSpd = p.speed * (state.isSlowMo ? 0.8 : 1.0);
      p.x += normX * pSpd * dt;
      p.y += normY * pSpd * dt;
    }

    p.x = Math.max(p.radius, Math.min(cw - p.radius, p.x));
    p.y = Math.max(p.radius + 30, Math.min(ch - p.radius - 80, p.y));

    // 3. 距离与得分积累
    state.distance += 40 * worldDt;
    state.score += Math.round(15 * worldDt);

    // 4. 障碍物生成
    state.spawnTimer -= worldDt;
    if (state.spawnTimer <= 0) {
      spawnObstacle();
      state.spawnTimer = Math.max(0.6, 1.6 - state.distance * 0.0008);
    }

    // 5. 障碍物移动与碰撞/擦弹
    for (var i = state.obstacles.length - 1; i >= 0; i--) {
      var ob = state.obstacles[i];
      ob.y += ob.speedY * worldDt;

      var collided = false;
      var grazed = false;

      if (ob.type === 'spinner') {
        ob.angle += ob.rotSpeed * worldDt;
        // 判定十字激光是否切到玩家
        var dx = p.x - ob.x;
        var dy = p.y - ob.y;
        var distToCenter = Math.hypot(dx, dy);

        if (distToCenter < ob.armLength) {
          for (var a = 0; a < 4; a++) {
            var armAngle = ob.angle + (a * Math.PI / 2);
            var armX = ob.x + Math.cos(armAngle) * ob.armLength;
            var armY = ob.y + Math.sin(armAngle) * ob.armLength;

            // 点到线段距离
            var proj = ((p.x - ob.x) * (armX - ob.x) + (p.y - ob.y) * (armY - ob.y)) / (ob.armLength * ob.armLength);
            proj = Math.max(0, Math.min(1, proj));
            var closeX = ob.x + proj * (armX - ob.x);
            var closeY = ob.y + proj * (armY - ob.y);
            var dLine = Math.hypot(p.x - closeX, p.y - closeY);

            if (dLine < p.radius + 4) collided = true;
            else if (dLine < p.radius + 20) grazed = true;
          }
        }
      } else if (ob.type === 'wall') {
        if (Math.abs(p.y - ob.y) < p.radius + 8) {
          if (p.x < ob.gapX || p.x > ob.gapX + ob.gapW) {
            collided = true;
          } else {
            // 穿过缝隙算擦弹
            grazed = true;
          }
        }
      } else if (ob.type === 'mine') {
        var mDist = Math.hypot(p.x - ob.x, p.y - ob.y);
        if (mDist < p.radius + ob.radius) collided = true;
        else if (mDist < p.radius + ob.radius + 18) grazed = true;
      }

      // 擦弹奖赏
      if (grazed && !ob.grazed) {
        ob.grazed = true;
        state.grazes++;
        state.score += 120;
        state.bufferEnergy = Math.min(100, state.bufferEnergy + 18);
        playSound('graze');

        for (var g = 0; g < 8; g++) {
          state.particles.push({
            x: p.x,
            y: p.y,
            vx: (Math.random() - 0.5) * 120,
            vy: (Math.random() - 0.5) * 120,
            life: 0.35,
            decay: 2.0,
            color: '#d8ff3e',
            size: 3
          });
        }
      }

      // 致命碰撞
      if (collided) {
        playSound('crash');
        endGame();
        return;
      }

      if (ob.y > ch + 60) {
        state.obstacles.splice(i, 1);
      }
    }

    // 6. 粒子更新
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

    // 1. 赛博网格背景
    ctx.strokeStyle = state.isSlowMo ? 'rgba(0, 242, 254, 0.1)' : 'rgba(216, 255, 62, 0.05)';
    ctx.lineWidth = 1;
    for (var x = 0; x < cw; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ch);
      ctx.stroke();
    }

    // 2. 绘制障碍物
    for (var i = 0; i < state.obstacles.length; i++) {
      var ob = state.obstacles[i];

      if (ob.type === 'spinner') {
        ctx.save();
        ctx.translate(ob.x, ob.y);
        ctx.strokeStyle = '#ff007f';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ff007f';

        for (var a = 0; a < 4; a++) {
          var ang = ob.angle + (a * Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(ang) * ob.armLength, Math.sin(ang) * ob.armLength);
          ctx.stroke();
        }

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (ob.type === 'wall') {
        ctx.save();
        ctx.fillStyle = '#ff007f';
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ff007f';

        // 左段
        ctx.fillRect(0, ob.y - 4, ob.gapX, 8);
        // 右段
        ctx.fillRect(ob.gapX + ob.gapW, ob.y - 4, cw - (ob.gapX + ob.gapW), 8);
        ctx.restore();
      } else if (ob.type === 'mine') {
        ctx.save();
        ctx.translate(ob.x, ob.y);
        ctx.fillStyle = '#ef4444';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, 0, ob.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 3. 绘制玩家角色
    var p = state.player;
    ctx.save();
    ctx.translate(p.x, p.y);

    // 慢动作残影光环
    if (state.isSlowMo) {
      ctx.fillStyle = 'rgba(0, 242, 254, 0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, p.radius + 10, 0, Math.PI * 2);
      ctx.fill();
    }

    // 核心光核
    ctx.fillStyle = '#d8ff3e';
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#d8ff3e';
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 4. 粒子更新
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

    // 5. 子弹时间全屏色差滤镜
    if (state.isSlowMo) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 242, 254, 0.08)';
      ctx.fillRect(0, 0, cw, ch);
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
    var finalDist = document.getElementById('finalDist');
    var finalScore = document.getElementById('finalScore');
    var finalGraze = document.getElementById('finalGraze');
    var finalSlows = document.getElementById('finalSlows');

    if (finalDist) finalDist.textContent = Math.floor(state.distance) + ' m';
    if (finalScore) finalScore.textContent = state.score;
    if (finalGraze) finalGraze.textContent = state.grazes;
    if (finalSlows) finalSlows.textContent = state.slowMoTimes;

    if (overOverlay) overOverlay.classList.remove('hidden');

    if (window.GameStore) {
      var saved = window.GameStore.get(GAME_ID) || {};
      if (!saved.highScore || state.score > saved.highScore) {
        window.GameStore.save(GAME_ID, {
          highScore: state.score,
          distance: Math.floor(state.distance),
          grazes: state.grazes,
          date: Date.now()
        });
      }
    }
  }

  function startGame() {
    getAudioContext();
    state.running = true;
    state.distance = 0;
    state.score = 0;
    state.grazes = 0;
    state.slowMoTimes = 0;
    state.bufferEnergy = 100;
    state.isSlowMo = false;
    state.player.x = cw / 2;
    state.player.y = ch * 0.75;
    state.obstacles = [];
    state.particles = [];
    state.spawnTimer = 0.5;

    updateHUD();

    var startOverlay = document.getElementById('startOverlay');
    var overOverlay = document.getElementById('overOverlay');
    if (startOverlay) startOverlay.classList.add('hidden');
    if (overOverlay) overOverlay.classList.add('hidden');
  }

  // --- 输入事件绑定 ---
  var keys = {};
  var bufferActive = false;

  window.addEventListener('keydown', function(e) {
    keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
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

  // 子弹时间触摸按键
  var btnBuffer = document.getElementById('btnBuffer');
  if (btnBuffer) {
    btnBuffer.addEventListener('pointerdown', function(e) { e.preventDefault(); bufferActive = true; });
    btnBuffer.addEventListener('pointerup', function() { bufferActive = false; });
    btnBuffer.addEventListener('pointercancel', function() { bufferActive = false; });
  }

  // 触摸屏幕直接拖拽移动玩家
  canvas.addEventListener('pointermove', function(e) {
    if (e.buttons > 0 && state.running && !state.joy.active) {
      var rect = canvas.getBoundingClientRect();
      state.player.x = e.clientX - rect.left;
      state.player.y = e.clientY - rect.top;
    }
  });

  var startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.addEventListener('click', startGame);

  var retryBtn = document.getElementById('retryBtn');
  if (retryBtn) retryBtn.addEventListener('click', startGame);

  resizeCanvas();
  requestAnimationFrame(gameLoop);
})();
