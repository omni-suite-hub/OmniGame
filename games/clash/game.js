/*!
 * 战舰装配对撞 (Ship Assembly Clash) — OmniGame 模块装配与角斗场死斗
 */
(function() {
  'use strict';

  var GAME_ID = 'clash';

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
      if (type === 'cannon') {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(620, t);
        osc.frequency.exponentialRampToValueAtTime(120, t + 0.1);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.11);
      } else if (type === 'ram') {
        // 重金属猛烈撞击音
        var oscR = ctx.createOscillator();
        var gainR = ctx.createGain();
        oscR.type = 'sawtooth';
        oscR.frequency.setValueAtTime(160, t);
        oscR.frequency.exponentialRampToValueAtTime(30, t + 0.22);
        gainR.gain.setValueAtTime(0.4, t);
        gainR.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        oscR.connect(gainR);
        gainR.connect(ctx.destination);
        oscR.start(t);
        oscR.stop(t + 0.23);
      } else if (type === 'shield') {
        var oscS = ctx.createOscillator();
        var gainS = ctx.createGain();
        oscS.type = 'sine';
        oscS.frequency.setValueAtTime(880, t);
        oscS.frequency.exponentialRampToValueAtTime(440, t + 0.15);
        gainS.gain.setValueAtTime(0.25, t);
        gainS.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        oscS.connect(gainS);
        gainS.connect(ctx.destination);
        oscS.start(t);
        oscS.stop(t + 0.16);
      } else if (type === 'win') {
        [523.25, 659.25, 783.99, 1046.5].forEach(function(freq, i) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(freq, t + i * 0.08);
          g.gain.setValueAtTime(0.25, t + i * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.2);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t + i * 0.08);
          o.stop(t + i * 0.08 + 0.21);
        });
      }
    } catch (e) {}
  }

  // --- 游戏主状态 ---
  var state = {
    running: false,
    inBattle: false,
    round: 1,
    score: 0,
    selectedMods: ['cannon', 'shield', 'spike'],
    player: {
      x: 100,
      y: 200,
      vx: 0,
      vy: 0,
      hp: 100,
      maxHp: 100,
      shield: 40,
      radius: 18,
      shootTimer: 0
    },
    enemy: {
      x: 300,
      y: 200,
      vx: 0,
      vy: 0,
      hp: 100,
      maxHp: 100,
      radius: 20,
      shootTimer: 0
    },
    projectiles: [],
    particles: [],
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
    if (!state.inBattle) {
      resetPositions();
    }
  }
  window.addEventListener('resize', resizeCanvas);

  var playerHpFill = document.getElementById('playerHpFill');
  var enemyHpFill = document.getElementById('enemyHpFill');
  var roundVal = document.getElementById('roundVal');
  var btnAction = document.getElementById('btnAction');

  function updateHUD() {
    if (playerHpFill) {
      var pPct = Math.max(0, Math.min(100, (state.player.hp / state.player.maxHp) * 100));
      playerHpFill.style.width = pPct + '%';
    }
    if (enemyHpFill) {
      var ePct = Math.max(0, Math.min(100, (state.enemy.hp / state.enemy.maxHp) * 100));
      enemyHpFill.style.width = ePct + '%';
    }
    if (roundVal) roundVal.textContent = '第 ' + state.round + ' 轮';
  }

  function resetPositions() {
    state.player.x = cw * 0.25;
    state.player.y = ch * 0.45;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.hp = state.player.maxHp;
    state.player.shield = state.selectedMods.indexOf('shield') !== -1 ? 40 : 0;

    state.enemy.x = cw * 0.75;
    state.enemy.y = ch * 0.45;
    state.enemy.vx = 0;
    state.enemy.vy = 0;
    state.enemy.maxHp = 90 + state.round * 25;
    state.enemy.hp = state.enemy.maxHp;

    state.projectiles = [];
    state.particles = [];
  }

  // --- 模块装备切换 ---
  var modBtns = document.querySelectorAll('.mod-btn');
  modBtns.forEach(function(b) {
    b.addEventListener('click', function() {
      if (state.inBattle) return;
      var mod = b.getAttribute('data-mod');
      var idx = state.selectedMods.indexOf(mod);
      if (idx !== -1) {
        if (state.selectedMods.length > 1) {
          state.selectedMods.splice(idx, 1);
          b.classList.remove('active');
        }
      } else {
        if (state.selectedMods.length < 3) {
          state.selectedMods.push(mod);
          b.classList.add('active');
        }
      }
      var countEl = document.getElementById('selectedCount');
      if (countEl) countEl.textContent = '已选: ' + state.selectedMods.length + '/3';
    });
  });

  // --- 战斗启动与冲撞 ---
  function engageBattle() {
    state.inBattle = true;
    resetPositions();

    // 赋予双方初速度对撞
    var pSpeed = state.selectedMods.indexOf('booster') !== -1 ? 280 : 200;
    state.player.vx = pSpeed;
    state.player.vy = (Math.random() - 0.5) * 60;

    state.enemy.vx = -180;
    state.enemy.vy = (Math.random() - 0.5) * 60;

    if (btnAction) {
      btnAction.className = 'btn-boost-ram';
      btnAction.textContent = '⚡ 涡轮过载冲撞！';
    }
    updateHUD();
  }

  function triggerOverdriveBoost() {
    if (!state.inBattle) return;
    playSound('ram');
    // 飞船直接瞄准敌舰暴冲
    var p = state.player;
    var e = state.enemy;
    var angle = Math.atan2(e.y - p.y, e.x - p.x);
    p.vx = Math.cos(angle) * 440;
    p.vy = Math.sin(angle) * 440;
  }

  // --- 战斗更新与物理 ---
  function update(dt) {
    if (!state.running || !state.inBattle) return;

    var p = state.player;
    var e = state.enemy;

    // 1. 移动与墙壁反弹
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    e.x += e.vx * dt;
    e.y += e.vy * dt;

    var arenaBottom = ch - 150;
    var arenaTop = 60;

    if (p.x < p.radius) { p.x = p.radius; p.vx *= -0.9; }
    if (p.x > cw - p.radius) { p.x = cw - p.radius; p.vx *= -0.9; }
    if (p.y < arenaTop + p.radius) { p.y = arenaTop + p.radius; p.vy *= -0.9; }
    if (p.y > arenaBottom - p.radius) { p.y = arenaBottom - p.radius; p.vy *= -0.9; }

    if (e.x < e.radius) { e.x = e.radius; e.vx *= -0.9; }
    if (e.x > cw - e.radius) { e.x = cw - e.radius; e.vx *= -0.9; }
    if (e.y < arenaTop + e.radius) { e.y = arenaTop + e.radius; e.vy *= -0.9; }
    if (e.y > arenaBottom - e.radius) { e.y = arenaBottom - e.radius; e.vy *= -0.9; }

    // 敌舰 AI 追踪
    var aimAngle = Math.atan2(p.y - e.y, p.x - e.x);
    e.vx += Math.cos(aimAngle) * 90 * dt;
    e.vy += Math.sin(aimAngle) * 90 * dt;

    // 2. 舰体撞击判定
    var dx = e.x - p.x;
    var dy = e.y - p.y;
    var dist = Math.hypot(dx, dy);

    if (dist < p.radius + e.radius) {
      playSound('ram');
      state.screenShake = 10;

      // 撞击伤害计算
      var hasSpike = state.selectedMods.indexOf('spike') !== -1;
      var pRamDmg = hasSpike ? 38 : 18;
      var eRamDmg = 16;

      e.hp -= pRamDmg;

      // 护盾抵扣
      if (p.shield > 0) {
        playSound('shield');
        p.shield = Math.max(0, p.shield - eRamDmg);
      } else {
        p.hp -= eRamDmg;
      }

      // 弹性反冲冲量
      var normX = dx / dist;
      var normY = dy / dist;
      var impulse = 260;
      p.vx = -normX * impulse;
      p.vy = -normY * impulse;
      e.vx = normX * impulse;
      e.vy = normY * impulse;

      // 碰撞金属火花
      for (var k = 0; k < 16; k++) {
        var a = Math.random() * Math.PI * 2;
        var sp = 50 + Math.random() * 120;
        state.particles.push({
          x: (p.x + e.x) / 2,
          y: (p.y + e.y) / 2,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0.4,
          decay: 2.2,
          color: '#f59e0b',
          size: 3 + Math.random() * 3
        });
      }

      updateHUD();
      checkBattleOver();
    }

    // 3. 炮火发射
    var hasCannon = state.selectedMods.indexOf('cannon') !== -1;
    if (hasCannon) {
      p.shootTimer -= dt;
      if (p.shootTimer <= 0) {
        p.shootTimer = 1.1;
        playSound('cannon');
        var cAng = Math.atan2(e.y - p.y, e.x - p.x);
        state.projectiles.push({
          x: p.x,
          y: p.y,
          vx: Math.cos(cAng) * 320,
          vy: Math.sin(cAng) * 320,
          fromPlayer: true,
          radius: 5
        });
      }
    }

    // 敌方定时开火
    e.shootTimer -= dt;
    if (e.shootTimer <= 0) {
      e.shootTimer = 1.4;
      var eAng = Math.atan2(p.y - e.y, p.x - p.x);
      state.projectiles.push({
        x: e.x,
        y: e.y,
        vx: Math.cos(eAng) * 260,
        vy: Math.sin(eAng) * 260,
        fromPlayer: false,
        radius: 5
      });
    }

    // 4. 炮弹移动与命中判定
    for (var pj = state.projectiles.length - 1; pj >= 0; pj--) {
      var proj = state.projectiles[pj];
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;

      if (proj.fromPlayer) {
        if (Math.hypot(proj.x - e.x, proj.y - e.y) < e.radius + proj.radius) {
          e.hp -= 15;
          state.projectiles.splice(pj, 1);
          updateHUD();
          checkBattleOver();
          continue;
        }
      } else {
        if (Math.hypot(proj.x - p.x, proj.y - p.y) < p.radius + proj.radius) {
          if (p.shield > 0) {
            playSound('shield');
            p.shield = Math.max(0, p.shield - 12);
          } else {
            p.hp -= 12;
          }
          state.projectiles.splice(pj, 1);
          updateHUD();
          checkBattleOver();
          continue;
        }
      }

      // 出界
      if (proj.x < 0 || proj.x > cw || proj.y < arenaTop || proj.y > arenaBottom) {
        state.projectiles.splice(pj, 1);
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

    if (state.screenShake > 0) {
      state.screenShake = Math.max(0, state.screenShake - dt * 25);
    }
  }

  function checkBattleOver() {
    if (state.enemy.hp <= 0) {
      // 玩家获胜！
      playSound('win');
      state.inBattle = false;
      state.score += 800 * state.round;
      showResultOverlay(true);
    } else if (state.player.hp <= 0) {
      // 玩家战败
      playSound('ram');
      state.inBattle = false;
      showResultOverlay(false);
    }
  }

  function showResultOverlay(isVictory) {
    var resOverlay = document.getElementById('resultOverlay');
    var resTitle = document.getElementById('resTitle');
    var resSub = document.getElementById('resSub');
    var finalScore = document.getElementById('finalScore');
    var finalRound = document.getElementById('finalRound');

    if (resTitle) resTitle.textContent = isVictory ? '胜利！敌舰解体' : '战败！战舰损毁';
    if (resSub) resSub.textContent = isVictory ? '我方战舰夺取角斗场冠军！' : '敌方战舰在激战中胜出';
    if (finalScore) finalScore.textContent = state.score;
    if (finalRound) finalRound.textContent = state.round;

    if (resOverlay) resOverlay.classList.remove('hidden');

    if (window.GameStore) {
      var saved = window.GameStore.get(GAME_ID) || {};
      if (!saved.highScore || state.score > saved.highScore) {
        window.GameStore.save(GAME_ID, {
          highScore: state.score,
          round: state.round,
          date: Date.now()
        });
      }
    }
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

    // 1. 角斗场金属网格
    var arenaTop = 60;
    var arenaBottom = ch - 150;
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.08)';
    ctx.strokeRect(10, arenaTop, cw - 20, arenaBottom - arenaTop);

    // 2. 绘制炮弹
    for (var i = 0; i < state.projectiles.length; i++) {
      var pr = state.projectiles[i];
      ctx.save();
      ctx.fillStyle = pr.fromPlayer ? '#00f2fe' : '#ff007f';
      ctx.shadowBlur = 10;
      ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. 绘制我方战舰
    var p = state.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    var pAng = Math.atan2(p.vy, p.vx);
    ctx.rotate(pAng);

    // 护盾光环
    if (p.shield > 0) {
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#00f2fe';
      ctx.beginPath();
      ctx.arc(0, 0, p.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 撞角尖刺
    if (state.selectedMods.indexOf('spike') !== -1) {
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.moveTo(p.radius, -6);
      ctx.lineTo(p.radius + 14, 0);
      ctx.lineTo(p.radius, 6);
      ctx.closePath();
      ctx.fill();
    }

    // 战舰船身
    ctx.fillStyle = '#00f2fe';
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#00f2fe';
    ctx.beginPath();
    ctx.roundRect(-p.radius, -p.radius * 0.7, p.radius * 2, p.radius * 1.4, 6);
    ctx.fill();
    ctx.restore();

    // 4. 绘制敌方战舰
    var e = state.enemy;
    ctx.save();
    ctx.translate(e.x, e.y);
    var eAng = Math.atan2(e.vy, e.vx);
    ctx.rotate(eAng);

    ctx.fillStyle = '#ff007f';
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#ff007f';
    ctx.beginPath();
    ctx.roundRect(-e.radius, -e.radius * 0.7, e.radius * 2, e.radius * 1.4, 6);
    ctx.fill();
    ctx.restore();

    // 5. 粒子渲染
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

  // --- 按钮事件绑定 ---
  btnAction.addEventListener('click', function() {
    if (!state.inBattle) {
      engageBattle();
    } else {
      triggerOverdriveBoost();
    }
  });

  var startBtn = document.getElementById('startBtn');
  if (startBtn) {
    startBtn.addEventListener('click', function() {
      getAudioContext();
      state.running = true;
      state.round = 1;
      state.score = 0;
      state.inBattle = false;
      resetPositions();
      updateHUD();
      var startOverlay = document.getElementById('startOverlay');
      if (startOverlay) startOverlay.classList.add('hidden');
    });
  }

  var nextRoundBtn = document.getElementById('nextRoundBtn');
  if (nextRoundBtn) {
    nextRoundBtn.addEventListener('click', function() {
      state.round++;
      state.inBattle = false;
      resetPositions();
      if (btnAction) {
        btnAction.className = 'btn-engage';
        btnAction.textContent = '🚀 战舰出港 · 开始对撞';
      }
      updateHUD();
      var resOverlay = document.getElementById('resultOverlay');
      if (resOverlay) resOverlay.classList.add('hidden');
    });
  }

  resizeCanvas();
  requestAnimationFrame(gameLoop);
})();
