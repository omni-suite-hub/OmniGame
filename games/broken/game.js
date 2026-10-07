/*!
 * 断章战刃 (Broken Blade) — OmniGame 动作肉鸽割草
 */
(function() {
  'use strict';

  var GAME_ID = 'broken';

  // --- Web Audio 声音引擎 ---
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
      if (type === 'slash') {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.1);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.11);
      } else if (type === 'hit') {
        var oscH = ctx.createOscillator();
        var gainH = ctx.createGain();
        oscH.type = 'triangle';
        oscH.frequency.setValueAtTime(150, t);
        oscH.frequency.exponentialRampToValueAtTime(40, t + 0.08);
        gainH.gain.setValueAtTime(0.3, t);
        gainH.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        oscH.connect(gainH);
        gainH.connect(ctx.destination);
        oscH.start(t);
        oscH.stop(t + 0.09);
      } else if (type === 'shatter') {
        // 震撼的破碎爆破音
        var oscS = ctx.createOscillator();
        var gainS = ctx.createGain();
        oscS.type = 'sawtooth';
        oscS.frequency.setValueAtTime(450, t);
        oscS.frequency.exponentialRampToValueAtTime(50, t + 0.28);
        gainS.gain.setValueAtTime(0.4, t);
        gainS.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        oscS.connect(gainS);
        gainS.connect(ctx.destination);
        oscS.start(t);
        oscS.stop(t + 0.3);

        // 高频残卷鸣响
        var oscC = ctx.createOscillator();
        var gainC = ctx.createGain();
        oscC.type = 'sine';
        oscC.frequency.setValueAtTime(880, t);
        oscC.frequency.linearRampToValueAtTime(1320, t + 0.25);
        gainC.gain.setValueAtTime(0.2, t);
        gainC.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        oscC.connect(gainC);
        gainC.connect(ctx.destination);
        oscC.start(t);
        oscC.stop(t + 0.26);
      } else if (type === 'dash') {
        var oscD = ctx.createOscillator();
        var gainD = ctx.createGain();
        oscD.frequency.setValueAtTime(280, t);
        oscD.frequency.linearRampToValueAtTime(560, t + 0.09);
        gainD.gain.setValueAtTime(0.15, t);
        gainD.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        oscD.connect(gainD);
        gainD.connect(ctx.destination);
        oscD.start(t);
        oscD.stop(t + 0.1);
      }
    } catch (e) {}
  }

  // --- 武器数据设定 ---
  var WEAPON_TYPES = [
    {
      name: '🗡️ 残章大剑',
      range: 75,
      arc: Math.PI * 0.75,
      damage: 42,
      maxDurability: 6,
      color: '#ffa502'
    },
    {
      name: '⚡ 断空双匕',
      range: 48,
      arc: Math.PI * 0.45,
      damage: 22,
      multiHit: 2,
      maxDurability: 10,
      color: '#00d2d3'
    },
    {
      name: '🔨 碎渊战锤',
      range: 65,
      arc: Math.PI * 0.95,
      damage: 55,
      knockback: 90,
      maxDurability: 5,
      color: '#ff4757'
    },
    {
      name: '🔱 绝尘长枪',
      range: 95,
      arc: Math.PI * 0.35,
      damage: 36,
      pierce: true,
      maxDurability: 8,
      color: '#9b59b6'
    }
  ];

  // --- 游戏主状态 ---
  var state = {
    running: false,
    score: 0,
    wave: 1,
    kills: 0,
    breaks: 0,
    hero: {
      x: 200,
      y: 300,
      radius: 14,
      hp: 100,
      maxHp: 100,
      speed: 190,
      facing: 0, // 弧度
      isAttacking: false,
      attackTimer: 0,
      isDashing: false,
      dashTimer: 0,
      dashCooldown: 0,
      invulnerable: false,
      currentWeaponIdx: 0,
      durability: 6
    },
    enemies: [],
    particles: [],
    slashes: [],
    damageTexts: [],
    screenShake: 0,
    waveSpawned: 0,
    waveTarget: 8,
    waveSpawnTimer: 0,
    joy: { active: false, x: 0, y: 0 }
  };

  // --- Canvas 与 DOM ---
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
      state.hero.x = cw / 2;
      state.hero.y = ch / 2;
    }
  }
  window.addEventListener('resize', resizeCanvas);

  var hpFill = document.getElementById('hpFill');
  var durabilityFill = document.getElementById('durabilityFill');
  var weaponName = document.getElementById('weaponName');
  var scoreVal = document.getElementById('scoreVal');

  function updateHUD() {
    var h = state.hero;
    if (hpFill) {
      var hpPct = Math.max(0, Math.min(100, (h.hp / h.maxHp) * 100));
      hpFill.style.width = hpPct + '%';
    }
    var wp = WEAPON_TYPES[h.currentWeaponIdx];
    if (durabilityFill && wp) {
      var dPct = (h.durability / wp.maxDurability) * 100;
      durabilityFill.style.width = dPct + '%';
    }
    if (weaponName && wp) {
      weaponName.textContent = wp.name + ' (' + h.durability + '/' + wp.maxDurability + ')';
    }
    if (scoreVal) {
      scoreVal.textContent = state.wave + '波 · ' + state.score + '分';
    }
  }

  // --- 战斗逻辑 ---
  function changeWeapon(specificIdx) {
    var oldIdx = state.hero.currentWeaponIdx;
    var nextIdx = (oldIdx + 1 + Math.floor(Math.random() * (WEAPON_TYPES.length - 1))) % WEAPON_TYPES.length;
    if (typeof specificIdx === 'number') nextIdx = specificIdx;
    state.hero.currentWeaponIdx = nextIdx;
    state.hero.durability = WEAPON_TYPES[nextIdx].maxDurability;
    updateHUD();
  }

  function triggerShatterExplosion() {
    state.breaks++;
    state.screenShake = 16;
    playSound('shatter');

    var h = state.hero;
    // 冲击波伤害半径
    var burstRadius = 140;

    // 碎裂弹幕与残卷粒子
    for (var i = 0; i < 28; i++) {
      var angle = (Math.PI * 2 * i) / 28;
      var spd = 120 + Math.random() * 140;
      state.particles.push({
        x: h.x,
        y: h.y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 0.8,
        decay: 1.2,
        color: i % 2 === 0 ? '#ff4757' : '#ffa502',
        size: 4 + Math.random() * 4
      });
    }

    state.damageTexts.push({
      x: h.x,
      y: h.y - 30,
      text: '💥 断章爆破!!',
      color: '#ffa502',
      size: 20,
      life: 0.9
    });

    // 伤害所有范围内敌人
    for (var e = 0; e < state.enemies.length; e++) {
      var en = state.enemies[e];
      var dist = Math.hypot(en.x - h.x, en.y - h.y);
      if (dist < burstRadius) {
        var dmg = 65;
        en.hp -= dmg;
        var kbAngle = Math.atan2(en.y - h.y, en.x - h.x);
        en.x += Math.cos(kbAngle) * 80;
        en.y += Math.sin(kbAngle) * 80;

        state.damageTexts.push({
          x: en.x,
          y: en.y,
          text: '-' + dmg,
          color: '#ff4757',
          size: 16,
          life: 0.6
        });
      }
    }

    // 重铸神兵
    changeWeapon();
  }

  function performAttack() {
    var h = state.hero;
    if (h.isAttacking || !state.running) return;

    h.isAttacking = true;
    h.attackTimer = 0.22;
    playSound('slash');

    var wp = WEAPON_TYPES[h.currentWeaponIdx];
    h.durability--;

    // 斩击弧光视觉
    state.slashes.push({
      x: h.x,
      y: h.y,
      facing: h.facing,
      range: wp.range,
      arc: wp.arc,
      color: wp.color,
      life: 0.18
    });

    // 判定敌人受击
    var hitAny = false;
    for (var i = 0; i < state.enemies.length; i++) {
      var en = state.enemies[i];
      var dx = en.x - h.x;
      var dy = en.y - h.y;
      var dist = Math.hypot(dx, dy);

      if (dist <= wp.range + en.radius) {
        var angleToEnemy = Math.atan2(dy, dx);
        var angleDiff = Math.abs(angleToEnemy - h.facing);
        while (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;

        if (angleDiff <= wp.arc / 2) {
          hitAny = true;
          var totalDmg = wp.damage * (wp.multiHit || 1);
          en.hp -= totalDmg;

          var kb = wp.knockback || 35;
          en.x += Math.cos(angleToEnemy) * kb;
          en.y += Math.sin(angleToEnemy) * kb;

          // 受击粒子
          for (var p = 0; p < 6; p++) {
            state.particles.push({
              x: en.x,
              y: en.y,
              vx: (Math.random() - 0.5) * 160,
              vy: (Math.random() - 0.5) * 160,
              life: 0.4,
              decay: 2.5,
              color: wp.color,
              size: 3
            });
          }

          state.damageTexts.push({
            x: en.x,
            y: en.y - 10,
            text: '-' + totalDmg,
            color: '#fff',
            size: 15,
            life: 0.5
          });
        }
      }
    }

    if (hitAny) {
      playSound('hit');
      state.screenShake = 4;
    }

    // 武器耐久归零 -> 触发断章爆破
    if (h.durability <= 0) {
      triggerShatterExplosion();
    } else {
      updateHUD();
    }
  }

  function performDash() {
    var h = state.hero;
    if (h.isDashing || h.dashCooldown > 0 || !state.running) return;

    h.isDashing = true;
    h.dashTimer = 0.18;
    h.dashCooldown = 0.6;
    h.invulnerable = true;
    playSound('dash');

    // 瞬冲残影粒子
    for (var i = 0; i < 8; i++) {
      state.particles.push({
        x: h.x,
        y: h.y,
        vx: -Math.cos(h.facing) * 50,
        vy: -Math.sin(h.facing) * 50,
        life: 0.3,
        decay: 3.0,
        color: '#2ed573',
        size: 8
      });
    }
  }

  // --- 敌人生成与波次 ---
  function spawnEnemy() {
    var edge = Math.floor(Math.random() * 4);
    var ex = 0, ey = 0;
    if (edge === 0) { ex = Math.random() * cw; ey = -20; }
    else if (edge === 1) { ex = cw + 20; ey = Math.random() * ch; }
    else if (edge === 2) { ex = Math.random() * cw; ey = ch + 20; }
    else { ex = -20; ey = Math.random() * ch; }

    var isGolem = Math.random() < 0.2 && state.wave >= 2;
    var isStalker = !isGolem && Math.random() < 0.35 && state.wave >= 2;

    state.enemies.push({
      x: ex,
      y: ey,
      radius: isGolem ? 22 : (isStalker ? 11 : 14),
      hp: isGolem ? 120 : (isStalker ? 25 : 45),
      maxHp: isGolem ? 120 : (isStalker ? 25 : 45),
      speed: isGolem ? 55 : (isStalker ? 140 : 85),
      color: isGolem ? '#e67e22' : (isStalker ? '#9b59b6' : '#e74c3c'),
      points: isGolem ? 150 : (isStalker ? 80 : 50)
    });
  }

  // --- 更新与主循环 ---
  function update(dt) {
    if (!state.running) return;

    var h = state.hero;

    // 1. 移动输入计算
    var mx = 0, my = 0;
    if (keys['KeyW'] || keys['ArrowUp']) my -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) my += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) mx += 1;

    if (state.joy.active) {
      mx = state.joy.x;
      my = state.joy.y;
    }

    var moveLen = Math.hypot(mx, my);
    if (moveLen > 0.05) {
      var normX = mx / moveLen;
      var normY = my / moveLen;
      var curSpd = h.isDashing ? h.speed * 2.8 : h.speed;
      h.x += normX * curSpd * dt;
      h.y += normY * curSpd * dt;
      h.facing = Math.atan2(normY, normX);
    }

    // 限制玩家在屏幕内
    h.x = Math.max(h.radius, Math.min(cw - h.radius, h.x));
    h.y = Math.max(h.radius + 40, Math.min(ch - h.radius - 80, h.y));

    // 闪避冷却
    if (h.isDashing) {
      h.dashTimer -= dt;
      if (h.dashTimer <= 0) {
        h.isDashing = false;
        h.invulnerable = false;
      }
    }
    if (h.dashCooldown > 0) h.dashCooldown -= dt;

    // 攻击重置
    if (h.isAttacking) {
      h.attackTimer -= dt;
      if (h.attackTimer <= 0) h.isAttacking = false;
    }

    // 2. 波次与敌人生成
    if (state.waveSpawned < state.waveTarget) {
      state.waveSpawnTimer -= dt;
      if (state.waveSpawnTimer <= 0) {
        spawnEnemy();
        state.waveSpawned++;
        state.waveSpawnTimer = Math.max(0.4, 1.4 - state.wave * 0.1);
      }
    } else if (state.enemies.length === 0) {
      // 波次通关！进入下一波
      state.wave++;
      state.waveSpawned = 0;
      state.waveTarget = 8 + state.wave * 4;
      state.waveSpawnTimer = 1.0;
      state.score += 500;
      // 恢复部分生命
      h.hp = Math.min(h.maxHp, h.hp + 25);
      state.damageTexts.push({
        x: cw / 2,
        y: ch / 2 - 40,
        text: '第 ' + state.wave + ' 波来袭!',
        color: '#2ed573',
        size: 22,
        life: 1.2
      });
      updateHUD();
    }

    // 3. 敌人行为与碰撞
    for (var i = state.enemies.length - 1; i >= 0; i--) {
      var en = state.enemies[i];
      if (en.hp <= 0) {
        state.kills++;
        state.score += en.points;
        updateHUD();
        state.enemies.splice(i, 1);
        continue;
      }

      var edx = h.x - en.x;
      var edy = h.y - en.y;
      var edist = Math.hypot(edx, edy);

      if (edist > 2) {
        en.x += (edx / edist) * en.speed * dt;
        en.y += (edy / edist) * en.speed * dt;
      }

      // 攻击玩家碰撞
      if (edist < h.radius + en.radius && !h.invulnerable) {
        h.hp -= 18 * dt; // 持续触碰扣血
        state.screenShake = 3;
        updateHUD();
        if (h.hp <= 0) {
          endGame();
          return;
        }
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

    // 5. 弧光更新
    for (var s = state.slashes.length - 1; s >= 0; s--) {
      state.slashes[s].life -= dt;
      if (state.slashes[s].life <= 0) state.slashes.splice(s, 1);
    }

    // 6. 伤害飘字更新
    for (var d = state.damageTexts.length - 1; d >= 0; d--) {
      var dtObj = state.damageTexts[d];
      dtObj.y -= 30 * dt;
      dtObj.life -= dt;
      if (dtObj.life <= 0) state.damageTexts.splice(d, 1);
    }

    if (state.screenShake > 0) {
      state.screenShake = Math.max(0, state.screenShake - dt * 40);
    }
  }

  // --- 画面渲染 ---
  function render() {
    if (!ctx) return;
    ctx.save();

    // 震屏位移
    if (state.screenShake > 0) {
      var sx = (Math.random() - 0.5) * state.screenShake;
      var sy = (Math.random() - 0.5) * state.screenShake;
      ctx.translate(sx, sy);
    }

    ctx.clearRect(0, 0, cw, ch);

    // 背景网格地砖
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    var gridSize = 40;
    for (var x = 0; x < cw; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ch);
      ctx.stroke();
    }
    for (var y = 0; y < ch; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cw, y);
      ctx.stroke();
    }

    // 绘制敌人
    for (var e = 0; e < state.enemies.length; e++) {
      var en = state.enemies[e];
      ctx.save();
      ctx.translate(en.x, en.y);
      ctx.fillStyle = en.color;
      ctx.beginPath();
      ctx.arc(0, 0, en.radius, 0, Math.PI * 2);
      ctx.fill();

      // 血条
      var bw = en.radius * 2;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(-bw / 2, -en.radius - 8, bw, 4);
      ctx.fillStyle = '#ff4757';
      ctx.fillRect(-bw / 2, -en.radius - 8, bw * (en.hp / en.maxHp), 4);
      ctx.restore();
    }

    // 绘制斩击弧光
    for (var sl = 0; sl < state.slashes.length; sl++) {
      var slash = state.slashes[sl];
      ctx.save();
      ctx.translate(slash.x, slash.y);
      ctx.rotate(slash.facing);
      ctx.strokeStyle = slash.color;
      ctx.lineWidth = 6;
      ctx.shadowBlur = 15;
      ctx.shadowColor = slash.color;
      ctx.beginPath();
      ctx.arc(0, 0, slash.range, -slash.arc / 2, slash.arc / 2);
      ctx.stroke();
      ctx.restore();
    }

    // 绘制玩家角色
    var h = state.hero;
    ctx.save();
    ctx.translate(h.x, h.y);

    // 闪避半透明光环
    if (h.invulnerable) {
      ctx.fillStyle = 'rgba(46, 213, 115, 0.3)';
      ctx.beginPath();
      ctx.arc(0, 0, h.radius + 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // 英雄本体
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.shadowColor = WEAPON_TYPES[h.currentWeaponIdx].color;
    ctx.beginPath();
    ctx.arc(0, 0, h.radius, 0, Math.PI * 2);
    ctx.fill();

    // 朝向指针/剑尖指示
    ctx.strokeStyle = WEAPON_TYPES[h.currentWeaponIdx].color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(h.facing) * (h.radius + 12), Math.sin(h.facing) * (h.radius + 12));
    ctx.stroke();
    ctx.restore();

    // 绘制粒子
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

    // 绘制伤害浮字
    for (var d = 0; d < state.damageTexts.length; d++) {
      var dtObj = state.damageTexts[d];
      ctx.save();
      ctx.globalAlpha = Math.max(0, dtObj.life);
      ctx.textAlign = 'center';
      ctx.fillStyle = dtObj.color;
      ctx.font = 'bold ' + dtObj.size + 'px -apple-system, sans-serif';
      ctx.shadowBlur = 8;
      ctx.shadowColor = dtObj.color;
      ctx.fillText(dtObj.text, dtObj.x, dtObj.y);
      ctx.restore();
    }

    ctx.restore();
  }

  // --- 游戏循环 ---
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

  // --- 结束与重新开始 ---
  function endGame() {
    state.running = false;
    var overOverlay = document.getElementById('overOverlay');
    var finalScore = document.getElementById('finalScore');
    var finalWaves = document.getElementById('finalWaves');
    var finalKills = document.getElementById('finalKills');
    var finalBreaks = document.getElementById('finalBreaks');

    if (finalScore) finalScore.textContent = state.score;
    if (finalWaves) finalWaves.textContent = state.wave;
    if (finalKills) finalKills.textContent = state.kills;
    if (finalBreaks) finalBreaks.textContent = state.breaks;

    if (overOverlay) overOverlay.classList.remove('hidden');

    if (window.GameStore) {
      var saved = window.GameStore.get(GAME_ID) || {};
      if (!saved.highScore || state.score > saved.highScore) {
        window.GameStore.save(GAME_ID, {
          highScore: state.score,
          waves: state.wave,
          kills: state.kills,
          date: Date.now()
        });
      }
    }
  }

  function startGame() {
    getAudioContext();
    state.running = true;
    state.score = 0;
    state.wave = 1;
    state.kills = 0;
    state.breaks = 0;
    state.hero.hp = 100;
    state.hero.x = cw / 2;
    state.hero.y = ch / 2;
    state.hero.currentWeaponIdx = 0;
    state.hero.durability = WEAPON_TYPES[0].maxDurability;
    state.hero.dashCooldown = 0;
    state.enemies = [];
    state.particles = [];
    state.slashes = [];
    state.damageTexts = [];
    state.waveSpawned = 0;
    state.waveTarget = 8;
    state.waveSpawnTimer = 0.5;

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
    if (e.code === 'Space' || e.code === 'KeyJ') {
      e.preventDefault();
      performAttack();
    }
    if (e.code === 'KeyK' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      e.preventDefault();
      performDash();
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
      var maxR = 36;
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

  // 触摸攻击与闪避按钮
  var btnAttack = document.getElementById('btnAttack');
  if (btnAttack) {
    btnAttack.addEventListener('pointerdown', function(e) {
      e.preventDefault();
      performAttack();
    });
  }
  var btnDash = document.getElementById('btnDash');
  if (btnDash) {
    btnDash.addEventListener('pointerdown', function(e) {
      e.preventDefault();
      performDash();
    });
  }

  // 点击画布瞄准并攻击
  canvas.addEventListener('pointerdown', function(e) {
    if (!state.running) return;
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    state.hero.facing = Math.atan2(my - state.hero.y, mx - state.hero.x);
    performAttack();
  });

  var startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.addEventListener('click', startGame);

  var retryBtn = document.getElementById('retryBtn');
  if (retryBtn) retryBtn.addEventListener('click', startGame);

  resizeCanvas();
  requestAnimationFrame(gameLoop);
})();
