/*!
 * 键位防线 (Key Defense) — OmniGame 赛博打字塔防
 */
(function() {
  'use strict';

  var GAME_ID = 'keylayout';

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
      if (type === 'laser') {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(200, t + 0.08);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.09);
      } else if (type === 'explode') {
        var oscE = ctx.createOscillator();
        var gainE = ctx.createGain();
        oscE.type = 'triangle';
        oscE.frequency.setValueAtTime(140, t);
        oscE.frequency.exponentialRampToValueAtTime(30, t + 0.15);
        gainE.gain.setValueAtTime(0.3, t);
        gainE.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        oscE.connect(gainE);
        gainE.connect(ctx.destination);
        oscE.start(t);
        oscE.stop(t + 0.16);
      } else if (type === 'emp') {
        var oscP = ctx.createOscillator();
        var gainP = ctx.createGain();
        oscP.type = 'sawtooth';
        oscP.frequency.setValueAtTime(180, t);
        oscP.frequency.linearRampToValueAtTime(40, t + 0.35);
        gainP.gain.setValueAtTime(0.4, t);
        gainP.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        oscP.connect(gainP);
        gainP.connect(ctx.destination);
        oscP.start(t);
        oscP.stop(t + 0.36);
      } else if (type === 'fever') {
        // 狂热和弦扫音
        [523.25, 659.25, 783.99, 1046.5].forEach(function(freq, i) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, t + i * 0.05);
          g.gain.setValueAtTime(0.2, t + i * 0.05);
          g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.15);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t + i * 0.05);
          o.stop(t + i * 0.05 + 0.16);
        });
      }
    } catch (e) {}
  }

  // --- 词库与敌人生成 ---
  var SINGLE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  var SHORT_WORDS = ['EXE', 'CMD', 'HEX', 'BUG', 'ZIP', 'RAM', 'NET', 'CSS', 'DOM', 'API', 'SQL', 'DEV', 'LOG', 'BOT'];
  var MEDIUM_WORDS = ['VIRUS', 'CYBER', 'ROBOT', 'PIXEL', 'STACK', 'REACT', 'LINUX', 'BLOCK', 'CLOUD'];
  var BOSS_WORDS = ['MALWARE', 'CORRUPT', 'TROJAN', 'EXPLOIT'];

  // --- 游戏状态 ---
  var state = {
    running: false,
    score: 0,
    combo: 0,
    maxCombo: 0,
    kills: 0,
    empCharges: 2,
    feverTimer: 0,
    startTime: 0,
    totalTyped: 0,
    hp: 100,
    maxHp: 100,
    viruses: [],
    lasers: [],
    particles: [],
    lockedVirus: null,
    turretAngle: -Math.PI / 2,
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

  var scoreEl = document.getElementById('scoreVal');
  var comboEl = document.getElementById('comboVal');
  var hpFill = document.getElementById('hpFill');

  function updateHUD() {
    if (scoreEl) scoreEl.textContent = state.score;
    if (comboEl) {
      if (state.feverTimer > 0) {
        comboEl.textContent = '🔥 FEVER ' + state.combo + 'x';
        comboEl.style.color = '#ff007f';
      } else {
        comboEl.textContent = state.combo + 'x';
        comboEl.style.color = '#fbc531';
      }
    }
    if (hpFill) {
      var pct = Math.max(0, Math.min(100, (state.hp / state.maxHp) * 100));
      hpFill.style.width = pct + '%';
    }
  }

  // --- 病毒生成 ---
  function spawnVirus() {
    var roll = Math.random();
    var word = '';
    var isBomb = false;
    var speed = 40 + Math.random() * 35;
    var color = '#00f2fe';

    if (roll < 0.35) {
      word = SINGLE_LETTERS[Math.floor(Math.random() * SINGLE_LETTERS.length)];
      speed = 60 + Math.random() * 45;
    } else if (roll < 0.75) {
      word = SHORT_WORDS[Math.floor(Math.random() * SHORT_WORDS.length)];
      speed = 40 + Math.random() * 25;
      color = '#a29bfe';
    } else if (roll < 0.9) {
      word = MEDIUM_WORDS[Math.floor(Math.random() * MEDIUM_WORDS.length)];
      speed = 30 + Math.random() * 20;
      color = '#fab1a0';
    } else {
      word = BOSS_WORDS[Math.floor(Math.random() * BOSS_WORDS.length)];
      speed = 22 + Math.random() * 15;
      color = '#ff7675';
    }

    var padding = 50;
    var vx = padding + Math.random() * (cw - padding * 2);

    state.viruses.push({
      x: vx,
      y: -20,
      word: word,
      typedIdx: 0,
      speed: speed,
      color: color,
      radius: Math.max(20, word.length * 9),
      isBomb: isBomb
    });
  }

  // --- 输入与射击 ---
  function handleKeyPress(keyChar) {
    if (!state.running) return;

    if (keyChar === 'SPACE') {
      triggerEMP();
      return;
    }

    state.totalTyped++;

    // 1. 如果已有锁定目标，且下一个字符匹配
    var target = state.lockedVirus;
    if (target && target.word[target.typedIdx] === keyChar) {
      hitVirusChar(target);
      return;
    }

    // 2. 否则在屏幕上寻找符合首字母匹配的最低（最接近防线）病毒
    var bestMatch = null;
    var lowestY = -999;
    for (var i = 0; i < state.viruses.length; i++) {
      var v = state.viruses[i];
      if (v.word[v.typedIdx] === keyChar && v.y > lowestY) {
        lowestY = v.y;
        bestMatch = v;
      }
    }

    if (bestMatch) {
      state.lockedVirus = bestMatch;
      hitVirusChar(bestMatch);
    } else {
      // 打错中断连击（除非在狂热中）
      if (state.feverTimer <= 0) {
        state.combo = 0;
        updateHUD();
      }
    }
  }

  function hitVirusChar(v) {
    v.typedIdx++;
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;

    // 检查狂热模式
    if (state.combo >= 15 && state.feverTimer <= 0) {
      state.feverTimer = 6.0;
      playSound('fever');
    }

    // 炮塔朝向锁定
    var turretX = cw / 2;
    var turretY = ch - 20;
    state.turretAngle = Math.atan2(v.y - turretY, v.x - turretX);

    // 发射高能激光
    state.lasers.push({
      x1: turretX,
      y1: turretY,
      x2: v.x,
      y2: v.y,
      color: state.feverTimer > 0 ? '#ff007f' : '#00f2fe',
      life: 0.12
    });
    playSound('laser');

    // 词汇全部输入完成，击毁病毒！
    if (v.typedIdx >= v.word.length) {
      destroyVirus(v);
    }

    updateHUD();
  }

  function destroyVirus(v) {
    state.kills++;
    var bonus = state.feverTimer > 0 ? 2 : 1;
    state.score += (v.word.length * 100 + state.combo * 10) * bonus;

    playSound('explode');

    // 爆炸粒子
    for (var i = 0; i < 20; i++) {
      var angle = Math.random() * Math.PI * 2;
      var spd = 60 + Math.random() * 120;
      state.particles.push({
        x: v.x,
        y: v.y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 0.6,
        decay: 1.8,
        color: v.color,
        size: 3 + Math.random() * 3
      });
    }

    if (state.lockedVirus === v) {
      state.lockedVirus = null;
    }

    var idx = state.viruses.indexOf(v);
    if (idx !== -1) {
      state.viruses.splice(idx, 1);
    }
  }

  function triggerEMP() {
    if (!state.running || state.empCharges <= 0) return;
    state.empCharges--;
    playSound('emp');

    // 全屏冲击波闪烁
    for (var i = state.viruses.length - 1; i >= 0; i--) {
      destroyVirus(state.viruses[i]);
    }

    state.particles.push({
      x: cw / 2,
      y: ch / 2,
      vx: 0,
      vy: 0,
      life: 0.4,
      decay: 1.0,
      color: '#ff007f',
      isShockwave: true,
      size: 10
    });
  }

  // --- 主循环与更新 ---
  function update(dt) {
    if (!state.running) return;

    if (state.feverTimer > 0) {
      state.feverTimer -= dt;
      if (state.feverTimer <= 0) updateHUD();
    }

    // 病毒下落与生成
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnVirus();
      state.spawnTimer = Math.max(0.6, 2.0 - state.kills * 0.04);
    }

    var speedMultiplier = state.feverTimer > 0 ? 0.6 : 1.0;

    for (var i = state.viruses.length - 1; i >= 0; i--) {
      var v = state.viruses[i];
      v.y += v.speed * speedMultiplier * dt;

      // 触底扣除防线生命值
      if (v.y > ch - 30) {
        state.hp -= 20;
        state.combo = 0;
        if (state.lockedVirus === v) state.lockedVirus = null;
        state.viruses.splice(i, 1);
        updateHUD();

        if (state.hp <= 0) {
          endGame();
          return;
        }
      }
    }

    // 激光衰减
    for (var l = state.lasers.length - 1; l >= 0; l--) {
      state.lasers[l].life -= dt;
      if (state.lasers[l].life <= 0) state.lasers.splice(l, 1);
    }

    // 粒子更新
    for (var p = state.particles.length - 1; p >= 0; p--) {
      var pt = state.particles[p];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.isShockwave) {
        pt.size += dt * 800;
      }
      pt.life -= pt.decay * dt;
      if (pt.life <= 0) state.particles.splice(p, 1);
    }
  }

  // --- 渲染 ---
  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    // 1. 背景流光矩阵线条
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.05)';
    ctx.lineWidth = 1;
    var step = 40;
    for (var x = 0; x < cw; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ch);
      ctx.stroke();
    }

    // 2. 绘制激光
    for (var l = 0; l < state.lasers.length; l++) {
      var lz = state.lasers[l];
      ctx.save();
      ctx.strokeStyle = lz.color;
      ctx.lineWidth = 4;
      ctx.shadowBlur = 15;
      ctx.shadowColor = lz.color;
      ctx.beginPath();
      ctx.moveTo(lz.x1, lz.y1);
      ctx.lineTo(lz.x2, lz.y2);
      ctx.stroke();
      ctx.restore();
    }

    // 3. 绘制病毒节点
    for (var i = 0; i < state.viruses.length; i++) {
      var v = state.viruses[i];
      var isTarget = state.lockedVirus === v;

      ctx.save();
      ctx.translate(v.x, v.y);

      // 外环光圈
      ctx.strokeStyle = isTarget ? '#ff007f' : v.color;
      ctx.lineWidth = isTarget ? 3 : 1.5;
      ctx.shadowBlur = isTarget ? 15 : 8;
      ctx.shadowColor = isTarget ? '#ff007f' : v.color;
      ctx.fillStyle = 'rgba(16, 21, 40, 0.85)';
      ctx.beginPath();
      var boxW = v.radius * 2;
      var boxH = 32;
      ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 8);
      ctx.fill();
      ctx.stroke();

      // 文本拆分 (已输入绿色，未输入高亮)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 15px monospace';

      var typedPart = v.word.substring(0, v.typedIdx);
      var untypedPart = v.word.substring(v.typedIdx);

      var fullWidth = ctx.measureText(v.word).width;
      var startX = -fullWidth / 2;

      var typedWidth = ctx.measureText(typedPart).width;
      if (typedPart) {
        ctx.fillStyle = '#00f2fe';
        ctx.fillText(typedPart, startX + typedWidth / 2, 0);
      }
      if (untypedPart) {
        ctx.fillStyle = '#ffffff';
        var untypedWidth = ctx.measureText(untypedPart).width;
        ctx.fillText(untypedPart, startX + typedWidth + untypedWidth / 2, 0);
      }

      ctx.restore();
    }

    // 4. 底部中央炮塔
    var turretX = cw / 2;
    var turretY = ch - 20;
    ctx.save();
    ctx.translate(turretX, turretY);
    ctx.rotate(state.turretAngle + Math.PI / 2);

    // 炮管
    ctx.fillStyle = '#00f2fe';
    ctx.fillRect(-4, -26, 8, 20);

    // 炮座底盘
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#101528';
    ctx.fill();
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // 5. 粒子
    for (var p = 0; p < state.particles.length; p++) {
      var pt = state.particles[p];
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life);
      if (pt.isShockwave) {
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
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
    var finalKills = document.getElementById('finalKills');
    var finalMaxCombo = document.getElementById('finalMaxCombo');
    var finalWpm = document.getElementById('finalWpm');

    var durationMinutes = (performance.now() - state.startTime) / 60000;
    var wpm = durationMinutes > 0 ? Math.round((state.totalTyped / 5) / durationMinutes) : 0;

    if (finalScore) finalScore.textContent = state.score;
    if (finalKills) finalKills.textContent = state.kills;
    if (finalMaxCombo) finalMaxCombo.textContent = state.maxCombo;
    if (finalWpm) finalWpm.textContent = wpm;

    if (overOverlay) overOverlay.classList.remove('hidden');

    if (window.GameStore) {
      var saved = window.GameStore.get(GAME_ID) || {};
      if (!saved.highScore || state.score > saved.highScore) {
        window.GameStore.save(GAME_ID, {
          highScore: state.score,
          kills: state.kills,
          wpm: wpm,
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
    state.kills = 0;
    state.empCharges = 2;
    state.feverTimer = 0;
    state.startTime = performance.now();
    state.totalTyped = 0;
    state.hp = 100;
    state.viruses = [];
    state.lasers = [];
    state.particles = [];
    state.lockedVirus = null;
    state.spawnTimer = 0.5;

    updateHUD();

    var startOverlay = document.getElementById('startOverlay');
    var overOverlay = document.getElementById('overOverlay');
    if (startOverlay) startOverlay.classList.add('hidden');
    if (overOverlay) overOverlay.classList.add('hidden');
  }

  // --- 输入事件绑定 ---
  window.addEventListener('keydown', function(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      highlightVirtualKey('SPACE');
      handleKeyPress('SPACE');
      return;
    }
    if (e.key && e.key.length === 1) {
      var char = e.key.toUpperCase();
      if (/^[A-Z]$/.test(char)) {
        highlightVirtualKey(char);
        handleKeyPress(char);
      }
    }
  });

  function highlightVirtualKey(key) {
    var btn = document.querySelector('.kb-key[data-key="' + key + '"]');
    if (btn) {
      btn.classList.add('active');
      setTimeout(function() {
        btn.classList.remove('active');
      }, 120);
    }
  }

  // 虚拟按键触摸点击绑定
  var kbKeys = document.querySelectorAll('.kb-key');
  kbKeys.forEach(function(btn) {
    var key = btn.getAttribute('data-key');
    btn.addEventListener('pointerdown', function(e) {
      e.preventDefault();
      highlightVirtualKey(key);
      handleKeyPress(key);
    });
  });

  var startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.addEventListener('click', startGame);

  var retryBtn = document.getElementById('retryBtn');
  if (retryBtn) retryBtn.addEventListener('click', startGame);

  resizeCanvas();
  requestAnimationFrame(gameLoop);
})();