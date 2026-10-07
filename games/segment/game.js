/*!
 * 切词狂潮 (Idiom Word Slasher) — OmniGame 水墨成语狂斩
 */
(function() {
  'use strict';

  var GAME_ID = 'segment';

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
      if (type === 'slice') {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(160, t + 0.1);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.11);
      } else if (type === 'idiomCombo') {
        // 华丽成语大暴击锣鼓与琶音
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function(freq, i) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(freq, t + i * 0.06);
          g.gain.setValueAtTime(0.3, t + i * 0.06);
          g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.25);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t + i * 0.06);
          o.stop(t + i * 0.06 + 0.26);
        });
      } else if (type === 'bomb') {
        var oscB = ctx.createOscillator();
        var gainB = ctx.createGain();
        oscB.type = 'sawtooth';
        oscB.frequency.setValueAtTime(140, t);
        oscB.frequency.exponentialRampToValueAtTime(30, t + 0.3);
        gainB.gain.setValueAtTime(0.4, t);
        gainB.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        oscB.connect(gainB);
        gainB.connect(ctx.destination);
        oscB.start(t);
        oscB.stop(t + 0.31);
      }
    } catch (e) {}
  }

  // --- 成语词库 ---
  var IDIOMS = [
    '一心一意', '风驰电掣', '龙飞凤舞', '气壮山河', '金榜题名',
    '势如破竹', '万象更新', '出神入化', '一骑当千', '所向披靡',
    '乘风破浪', '剑拔弩张', '炉火纯青', '水落石出', '如雷贯耳'
  ];

  // --- 游戏主状态 ---
  var state = {
    running: false,
    score: 0,
    combo: 0,
    maxCombo: 0,
    idiomsCompleted: 0,
    charsSliced: 0,
    lives: 3,
    activeIdiom: '',
    idiomProgress: 0,
    targets: [],
    halves: [],
    particles: [],
    slashTrail: [], // { x, y, time }
    spawnTimer: 0
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

  var scoreVal = document.getElementById('scoreVal');
  var comboVal = document.getElementById('comboVal');
  var livesVal = document.getElementById('livesVal');

  function updateHUD() {
    if (scoreVal) scoreVal.textContent = state.score;
    if (comboVal) comboVal.textContent = state.combo + ' 连斩';
    if (livesVal) {
      var hearts = '';
      for (var i = 0; i < state.lives; i++) hearts += '❤️';
      for (var j = state.lives; j < 3; j++) hearts += '🖤';
      livesVal.textContent = hearts;
    }
  }

  // --- 生成抛射字块 ---
  function spawnTargetBatch() {
    // 随机选一个成语
    var idiom = IDIOMS[Math.floor(Math.random() * IDIOMS.length)];
    var count = 4;

    for (var i = 0; i < count; i++) {
      var char = idiom[i];
      var startX = 60 + (cw - 120) * (i / (count - 1)) + (Math.random() - 0.5) * 40;
      var vx = (cw / 2 - startX) * 0.4 + (Math.random() - 0.5) * 60;
      var vy = -(580 + Math.random() * 120);

      state.targets.push({
        char: char,
        idiom: idiom,
        idiomCharIdx: i,
        x: startX,
        y: ch + 30 + i * 20,
        vx: vx,
        vy: vy,
        radius: 26,
        angle: 0,
        vRot: (Math.random() - 0.5) * 4,
        isBomb: false
      });
    }

    // 偶尔夹杂墨煞炸弹
    if (Math.random() < 0.35) {
      state.targets.push({
        char: '💣',
        x: Math.random() * (cw - 100) + 50,
        y: ch + 50,
        vx: (Math.random() - 0.5) * 100,
        vy: -(540 + Math.random() * 100),
        radius: 24,
        angle: 0,
        vRot: (Math.random() - 0.5) * 3,
        isBomb: true
      });
    }
  }

  // --- 刀光划线与碰撞判定 ---
  function sliceLine(x1, y1, x2, y2) {
    if (!state.running) return;

    for (var i = state.targets.length - 1; i >= 0; i--) {
      var tg = state.targets[i];

      // 线段到点距离
      var dx = x2 - x1;
      var dy = y2 - y1;
      var lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;

      var t = ((tg.x - x1) * dx + (tg.y - y1) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));

      var closeX = x1 + t * dx;
      var closeY = y1 + t * dy;
      var dist = Math.hypot(tg.x - closeX, tg.y - closeY);

      if (dist < tg.radius) {
        // 命中目标！
        hitTarget(tg, i);
      }
    }
  }

  function hitTarget(tg, index) {
    state.targets.splice(index, 1);

    if (tg.isBomb) {
      playSound('bomb');
      state.lives--;
      state.combo = 0;
      updateHUD();
      if (state.lives <= 0) {
        endGame();
        return;
      }
      return;
    }

    playSound('slice');
    state.charsSliced++;
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    state.score += 50 * state.combo;

    // 拆分为两个左右飞散的半块
    state.halves.push({
      char: tg.char,
      x: tg.x - 10,
      y: tg.y,
      vx: tg.vx - 90,
      vy: tg.vy * 0.4,
      angle: tg.angle,
      vRot: -6,
      side: 'left'
    });
    state.halves.push({
      char: tg.char,
      x: tg.x + 10,
      y: tg.y,
      vx: tg.vx + 90,
      vy: tg.vy * 0.4,
      angle: tg.angle,
      vRot: 6,
      side: 'right'
    });

    // 墨汁飞溅粒子
    for (var p = 0; p < 14; p++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 60 + Math.random() * 120;
      state.particles.push({
        x: tg.x,
        y: tg.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.5,
        decay: 2.0,
        color: '#f59e0b',
        size: 3 + Math.random() * 3
      });
    }

    // 成语连贯判定
    if (state.combo % 4 === 0) {
      state.idiomsCompleted++;
      state.score += 600;
      playSound('idiomCombo');
    }

    updateHUD();
  }

  // --- 更新与物理循环 ---
  var GRAVITY = 750;

  function update(dt) {
    if (!state.running) return;

    // 1. 批量生成
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnTargetBatch();
      state.spawnTimer = 2.8;
    }

    // 2. 目标移动与重力
    for (var i = state.targets.length - 1; i >= 0; i--) {
      var tg = state.targets[i];
      tg.vy += GRAVITY * dt;
      tg.x += tg.vx * dt;
      tg.y += tg.vy * dt;
      tg.angle += tg.vRot * dt;

      // 掉落出底端判定
      if (tg.y > ch + 60 && tg.vy > 0) {
        if (!tg.isBomb) {
          state.lives--;
          state.combo = 0;
          updateHUD();
          if (state.lives <= 0) {
            endGame();
            return;
          }
        }
        state.targets.splice(i, 1);
      }
    }

    // 3. 切开半块飞散
    for (var h = state.halves.length - 1; h >= 0; h--) {
      var half = state.halves[h];
      half.vy += GRAVITY * dt;
      half.x += half.vx * dt;
      half.y += half.vy * dt;
      half.angle += half.vRot * dt;

      if (half.y > ch + 60) {
        state.halves.splice(h, 1);
      }
    }

    // 4. 粒子更新
    for (var p = state.particles.length - 1; p >= 0; p--) {
      var pt = state.particles[p];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= pt.decay * dt;
      if (pt.life <= 0) state.particles.splice(p, 1);
    }

    // 5. 刀光轨迹清理
    var now = performance.now();
    for (var s = state.slashTrail.length - 1; s >= 0; s--) {
      if (now - state.slashTrail[s].time > 140) {
        state.slashTrail.splice(s, 1);
      }
    }
  }

  // --- 画面渲染 ---
  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    // 1. 背景宣纸纹理
    ctx.fillStyle = '#080912';
    ctx.fillRect(0, 0, cw, ch);

    // 2. 绘制完整目标字卷
    for (var i = 0; i < state.targets.length; i++) {
      var tg = state.targets[i];
      ctx.save();
      ctx.translate(tg.x, tg.y);
      ctx.rotate(tg.angle);

      if (tg.isBomb) {
        // 墨煞炸弹
        ctx.fillStyle = '#1e1b4b';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, 0, tg.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💣', 0, 0);
      } else {
        // 金色宣纸汉字
        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#f59e0b';
        ctx.beginPath();
        ctx.roundRect(-tg.radius, -tg.radius, tg.radius * 2, tg.radius * 2, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 24px -apple-system, "PingFang SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tg.char, 0, 0);
      }

      ctx.restore();
    }

    // 3. 绘制切开的字块残片
    for (var h = 0; h < state.halves.length; h++) {
      var half = state.halves[h];
      ctx.save();
      ctx.translate(half.x, half.y);
      ctx.rotate(half.angle);
      ctx.fillStyle = '#f8fafc';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#f59e0b';
      ctx.beginPath();
      var hw = 14;
      var hh = 26;
      ctx.roundRect(-hw / 2, -hh / 2, hw, hh, 4);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(half.char, 0, 0);
      ctx.restore();
    }

    // 4. 绘制水墨刀光轨迹
    if (state.slashTrail.length >= 2) {
      ctx.save();
      for (var s = 0; s < state.slashTrail.length - 1; s++) {
        var p1 = state.slashTrail[s];
        var p2 = state.slashTrail[s + 1];
        var width = (s / state.slashTrail.length) * 8 + 1;

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = width;
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 5. 粒子渲染
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
    var finalIdioms = document.getElementById('finalIdioms');
    var finalChars = document.getElementById('finalChars');
    var finalMaxCombo = document.getElementById('finalMaxCombo');

    if (finalScore) finalScore.textContent = state.score;
    if (finalIdioms) finalIdioms.textContent = state.idiomsCompleted;
    if (finalChars) finalChars.textContent = state.charsSliced;
    if (finalMaxCombo) finalMaxCombo.textContent = state.maxCombo;

    if (overOverlay) overOverlay.classList.remove('hidden');

    if (window.GameStore) {
      var saved = window.GameStore.get(GAME_ID) || {};
      if (!saved.highScore || state.score > saved.highScore) {
        window.GameStore.save(GAME_ID, {
          highScore: state.score,
          idioms: state.idiomsCompleted,
          chars: state.charsSliced,
          date: Date.now()
        });
      }
    }
  }

  function startGame() {
    getAudioContext();
    state.running = true;
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.idiomsCompleted = 0;
    state.charsSliced = 0;
    state.lives = 3;
    state.targets = [];
    state.halves = [];
    state.particles = [];
    state.slashTrail = [];
    state.spawnTimer = 0.8;

    updateHUD();

    var startOverlay = document.getElementById('startOverlay');
    var overOverlay = document.getElementById('overOverlay');
    if (startOverlay) startOverlay.classList.add('hidden');
    if (overOverlay) overOverlay.classList.add('hidden');
  }

  // --- 划屏交互事件 ---
  var isSlashing = false;
  var lastX = 0, lastY = 0;

  function handlePointerDown(e) {
    isSlashing = true;
    var rect = canvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
    state.slashTrail = [{ x: lastX, y: lastY, time: performance.now() }];
  }

  function handlePointerMove(e) {
    if (!isSlashing) return;
    var rect = canvas.getBoundingClientRect();
    var curX = e.clientX - rect.left;
    var curY = e.clientY - rect.top;

    state.slashTrail.push({ x: curX, y: curY, time: performance.now() });
    sliceLine(lastX, lastY, curX, curY);

    lastX = curX;
    lastY = curY;
  }

  function handlePointerUp() {
    isSlashing = false;
  }

  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
  window.addEventListener('pointercancel', handlePointerUp);

  var startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.addEventListener('click', startGame);

  var retryBtn = document.getElementById('retryBtn');
  if (retryBtn) retryBtn.addEventListener('click', startGame);

  resizeCanvas();
  requestAnimationFrame(gameLoop);
})();