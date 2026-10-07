// games/sky-fighter/game.js - Sky Fighter (雷霆战机 / 1942)
(function() {
  'use strict';

  var audioCtx = null;
  function getAudio() {
    if (!audioCtx) {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    try {
      var ctx = getAudio();
      if (!ctx) return;
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'laser') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.07);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.07);
        osc.start(now);
        osc.stop(now + 0.07);
      } else if (type === 'hit') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(80, now + 0.05);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'boom') {
        var bufferSize = ctx.sampleRate * 0.28;
        var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        var noise = ctx.createBufferSource();
        noise.buffer = buffer;
        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, now);
        filter.frequency.exponentialRampToValueAtTime(40, now + 0.28);
        noise.connect(filter);
        filter.connect(gain);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.28);
        noise.start(now);
        noise.stop(now + 0.28);
      } else if (type === 'bomb') {
        var bSize = ctx.sampleRate * 0.6;
        var bBuf = ctx.createBuffer(1, bSize, ctx.sampleRate);
        var bData = bBuf.getChannelData(0);
        for (var j = 0; j < bSize; j++) bData[j] = Math.random() * 2 - 1;
        var nSource = ctx.createBufferSource();
        nSource.buffer = bBuf;
        var nFilter = ctx.createBiquadFilter();
        nFilter.type = 'lowpass';
        nFilter.frequency.setValueAtTime(400, now);
        nFilter.frequency.exponentialRampToValueAtTime(30, now + 0.6);
        nSource.connect(nFilter);
        nFilter.connect(gain);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.6);
        nSource.start(now);
        nSource.stop(now + 0.6);
      } else if (type === 'powerup') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'alarm') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.linearRampToValueAtTime(950, now + 0.2);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'win') {
        [440, 554, 659, 880].forEach(function(f, idx) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'triangle';
          o.frequency.setValueAtTime(f, now + idx * 0.1);
          g.gain.setValueAtTime(0.2, now + idx * 0.1);
          g.gain.linearRampToValueAtTime(0.01, now + idx * 0.1 + 0.16);
          o.start(now + idx * 0.1);
          o.stop(now + idx * 0.1 + 0.16);
        });
      } else if (type === 'gameover') {
        [280, 220, 160, 100].forEach(function(f, idx) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(f, now + idx * 0.15);
          g.gain.setValueAtTime(0.2, now + idx * 0.15);
          g.gain.linearRampToValueAtTime(0.01, now + idx * 0.15 + 0.2);
          o.start(now + idx * 0.15);
          o.stop(now + idx * 0.15 + 0.2);
        });
      }
    } catch(e) {}
  }

  // DOM
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var livesEl = document.getElementById('lives-el');
  var bombsEl = document.getElementById('bombs-el');
  var powerEl = document.getElementById('power-el');
  var scoreEl = document.getElementById('score-el');
  var btnBomb = document.getElementById('btn-bomb');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc = document.getElementById('modal-desc');
  var btnRestart = document.getElementById('btn-restart');

  var CANVAS_W = 380;
  var CANVAS_H = 580;

  function resizeCanvas() {
    var container = document.getElementById('container');
    var maxW = container.clientWidth - 20;
    var maxH = container.clientHeight - 20;
    var scale = Math.min(maxW / CANVAS_W, maxH / CANVAS_H, 1.25);
    scale = Math.max(0.65, scale);
    canvas.width = Math.floor(CANVAS_W * scale);
    canvas.height = Math.floor(CANVAS_H * scale);
  }
  window.addEventListener('resize', resizeCanvas);

  // Entities
  var player = null;
  var playerBullets = [];
  var enemyBullets = [];
  var enemies = [];
  var items = [];
  var particles = [];
  var stars = [];
  var boss = null;

  var lives = 3;
  var bombs = 2;
  var score = 0;
  var powerLevel = 1;
  var hasShield = false;
  var isGameOver = false;
  var lastTime = 0;
  var shootTimer = 0;
  var spawnTimer = 0;
  var flashTimer = 0;
  var bossWarningTimer = 0;

  var keys = {};
  var isPointerDown = false;
  var pointerX = 0;
  var pointerY = 0;

  function initStars() {
    stars = [];
    for (var i = 0; i < 70; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        speed: Math.random() * 60 + 20,
        size: Math.random() * 2 + 1,
        color: Math.random() > 0.4 ? '#38bdf8' : '#e2e8f0'
      });
    }
  }

  function initGame() {
    lives = 3;
    bombs = 2;
    score = 0;
    powerLevel = 1;
    hasShield = false;
    isGameOver = false;
    boss = null;
    bossWarningTimer = 0;

    player = {
      x: canvas.width / 2,
      y: canvas.height * 0.85,
      radius: 18,
      speed: 280,
      invulnerable: 2.0
    };

    playerBullets = [];
    enemyBullets = [];
    enemies = [];
    items = [];
    particles = [];

    initStars();
    updateHUD();
  }

  function updateHUD() {
    livesEl.textContent = lives;
    bombsEl.textContent = bombs;
    powerEl.textContent = 'Lv.' + powerLevel;
    scoreEl.textContent = score;
  }

  function useBomb() {
    if (bombs <= 0 || isGameOver) return;
    bombs--;
    updateHUD();
    playSound('bomb');
    flashTimer = 0.35;

    // Destroy all enemy bullets
    enemyBullets = [];

    // Deal heavy damage to all enemies
    enemies.forEach(function(e) {
      e.hp -= 200;
      addExplosion(e.x, e.y, 10);
    });
    enemies = enemies.filter(function(e) { return e.hp > 0; });

    if (boss) {
      boss.hp -= 300;
      addExplosion(boss.x, boss.y, 20);
      if (boss.hp <= 0) {
        defeatBoss();
      }
    }
  }

  function defeatBoss() {
    score += 2000;
    updateHUD();
    addExplosion(boss.x, boss.y, 40, '#f59e0b');
    boss = null;
    gameOver(true, '星际旗舰已被彻底击沉，银河和平恢复！');
  }

  function spawnEnemies(dt) {
    if (boss) return;

    // Check boss spawn condition
    if (score >= 1200 && !boss && bossWarningTimer === 0) {
      bossWarningTimer = 3.0; // 3 seconds warning
      playSound('alarm');
      return;
    }

    if (bossWarningTimer > 0) {
      bossWarningTimer -= dt;
      if (bossWarningTimer <= 0) {
        // Spawn boss
        boss = {
          x: canvas.width / 2,
          y: -80,
          targetY: canvas.height * 0.22,
          w: canvas.width * 0.7,
          h: 80,
          hp: 1200,
          maxHp: 1200,
          attackTimer: 1.0,
          dir: 1
        };
      }
      return;
    }

    spawnTimer += dt;
    if (spawnTimer >= 1.2) {
      spawnTimer = 0;
      var type = Math.random();
      if (type < 0.6) {
        // Basic Scout
        enemies.push({
          type: 'scout',
          x: Math.random() * (canvas.width - 40) + 20,
          y: -20,
          vx: (Math.random() - 0.5) * 40,
          vy: 90 + Math.random() * 40,
          hp: 30,
          radius: 14,
          shootTimer: 1.0 + Math.random()
        });
      } else {
        // Heavy Cruiser
        enemies.push({
          type: 'cruiser',
          x: Math.random() * (canvas.width - 80) + 40,
          y: -40,
          vx: (Math.random() > 0.5 ? 1 : -1) * 35,
          vy: 45,
          hp: 120,
          radius: 24,
          shootTimer: 0.8
        });
      }
    }
  }

  function addExplosion(x, y, count, color) {
    for (var i = 0; i < count; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = Math.random() * 120 + 30;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.35 + Math.random() * 0.2,
        color: color || (Math.random() > 0.5 ? '#f97316' : '#facc15')
      });
    }
  }

  function spawnItem(x, y) {
    var roll = Math.random();
    var itype = 'P';
    if (roll > 0.8) itype = 'B';
    else if (roll > 0.55) itype = 'S';

    items.push({
      x: x,
      y: y,
      type: itype,
      vy: 60
    });
  }

  function firePlayer() {
    playSound('laser');
    var px = player.x;
    var py = player.y - 15;

    if (powerLevel === 1) {
      playerBullets.push({ x: px, y: py, vx: 0, vy: -520, dmg: 20 });
    } else if (powerLevel === 2) {
      playerBullets.push({ x: px - 8, y: py, vx: 0, vy: -520, dmg: 20 });
      playerBullets.push({ x: px + 8, y: py, vx: 0, vy: -520, dmg: 20 });
    } else if (powerLevel === 3) {
      playerBullets.push({ x: px, y: py, vx: 0, vy: -540, dmg: 25 });
      playerBullets.push({ x: px - 12, y: py, vx: -90, vy: -520, dmg: 20 });
      playerBullets.push({ x: px + 12, y: py, vx: 90, vy: -520, dmg: 20 });
    } else {
      // Lv 4: Heavy barrage
      playerBullets.push({ x: px - 6, y: py, vx: 0, vy: -560, dmg: 30 });
      playerBullets.push({ x: px + 6, y: py, vx: 0, vy: -560, dmg: 30 });
      playerBullets.push({ x: px - 16, y: py, vx: -130, vy: -520, dmg: 20 });
      playerBullets.push({ x: px + 16, y: py, vx: 130, vy: -520, dmg: 20 });
    }
  }

  function update(dt) {
    if (flashTimer > 0) flashTimer -= dt;

    // Stars
    stars.forEach(function(s) {
      s.y += s.speed * dt;
      if (s.y > canvas.height) {
        s.y = 0;
        s.x = Math.random() * canvas.width;
      }
    });

    if (player.invulnerable > 0) player.invulnerable -= dt;

    // Player Movement (keyboard or pointer drag)
    var mx = 0;
    var my = 0;
    if (keys['ArrowLeft'] || keys['KeyA']) mx -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) mx += 1;
    if (keys['ArrowUp'] || keys['KeyW']) my -= 1;
    if (keys['ArrowDown'] || keys['KeyS']) my += 1;

    if (mx !== 0 || my !== 0) {
      player.x += mx * player.speed * dt;
      player.y += my * player.speed * dt;
    } else if (isPointerDown) {
      player.x += (pointerX - player.x) * 0.25;
      player.y += (pointerY - player.y) * 0.25;
    }

    // Clamping
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));

    // Player Shooting
    shootTimer += dt;
    if (shootTimer >= 0.16) {
      shootTimer = 0;
      firePlayer();
    }

    // Player Bullets
    for (var bi = playerBullets.length - 1; bi >= 0; bi--) {
      var b = playerBullets[bi];
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.y < -10 || b.x < 0 || b.x > canvas.width) {
        playerBullets.splice(bi, 1);
        continue;
      }

      // Check hit vs enemies
      var hit = false;
      for (var ei = enemies.length - 1; ei >= 0; ei--) {
        var e = enemies[ei];
        if (Math.hypot(e.x - b.x, e.y - b.y) < e.radius + 6) {
          e.hp -= b.dmg;
          hit = true;
          playSound('hit');
          if (e.hp <= 0) {
            score += e.type === 'cruiser' ? 120 : 50;
            addExplosion(e.x, e.y, 14);
            playSound('boom');
            if (Math.random() < 0.3) spawnItem(e.x, e.y);
            enemies.splice(ei, 1);
            updateHUD();
          }
          break;
        }
      }

      // Check hit vs boss
      if (!hit && boss && boss.y > 0) {
        if (b.x >= boss.x - boss.w / 2 && b.x <= boss.x + boss.w / 2 &&
            b.y >= boss.y - boss.h / 2 && b.y <= boss.y + boss.h / 2) {
          boss.hp -= b.dmg;
          hit = true;
          playSound('hit');
          if (boss.hp <= 0) {
            defeatBoss();
          }
        }
      }

      if (hit) playerBullets.splice(bi, 1);
    }

    // Enemies
    spawnEnemies(dt);

    for (var ej = enemies.length - 1; ej >= 0; ej--) {
      var em = enemies[ej];
      em.x += em.vx * dt;
      em.y += em.vy * dt;

      if (em.x < em.radius || em.x > canvas.width - em.radius) {
        em.vx = -em.vx;
      }

      em.shootTimer -= dt;
      if (em.shootTimer <= 0) {
        em.shootTimer = em.type === 'cruiser' ? 1.5 : 2.0;
        if (em.type === 'scout') {
          enemyBullets.push({ x: em.x, y: em.y + 10, vx: 0, vy: 160 });
        } else {
          // Cruiser 3-way shot
          [-35, 0, 35].forEach(function(angleDeg) {
            var rad = (angleDeg + 90) * Math.PI / 180;
            enemyBullets.push({
              x: em.x,
              y: em.y + 15,
              vx: Math.cos(rad) * 160,
              vy: Math.sin(rad) * 160
            });
          });
        }
      }

      // Check collision with player
      if (player.invulnerable <= 0 && Math.hypot(em.x - player.x, em.y - player.y) < em.radius + player.radius) {
        hitPlayer();
        em.hp = 0;
        addExplosion(em.x, em.y, 15);
      }

      if (em.y > canvas.height + 40 || em.hp <= 0) {
        enemies.splice(ej, 1);
      }
    }

    // Boss logic
    if (boss) {
      if (boss.y < boss.targetY) {
        boss.y += 40 * dt;
      } else {
        boss.x += boss.dir * 45 * dt;
        if (boss.x < boss.w / 2 + 10) boss.dir = 1;
        if (boss.x > canvas.width - boss.w / 2 - 10) boss.dir = -1;

        boss.attackTimer -= dt;
        if (boss.attackTimer <= 0) {
          boss.attackTimer = 1.0;
          // Spiral / multi barrage
          for (var a = 0; a < 6; a++) {
            var ang = (a * 60 + Date.now() * 0.05) * Math.PI / 180;
            enemyBullets.push({
              x: boss.x,
              y: boss.y + boss.h / 2,
              vx: Math.cos(ang) * 140,
              vy: Math.sin(ang) * 140
            });
          }
        }
      }
    }

    // Enemy Bullets
    for (var ebi = enemyBullets.length - 1; ebi >= 0; ebi--) {
      var eb = enemyBullets[ebi];
      eb.x += eb.vx * dt;
      eb.y += eb.vy * dt;

      if (eb.y > canvas.height + 20 || eb.x < -20 || eb.x > canvas.width + 20) {
        enemyBullets.splice(ebi, 1);
        continue;
      }

      if (player.invulnerable <= 0 && Math.hypot(eb.x - player.x, eb.y - player.y) < player.radius + 4) {
        enemyBullets.splice(ebi, 1);
        hitPlayer();
      }
    }

    // Items
    for (var ii = items.length - 1; ii >= 0; ii--) {
      var item = items[ii];
      item.y += item.vy * dt;

      if (Math.hypot(item.x - player.x, item.y - player.y) < player.radius + 15) {
        playSound('powerup');
        if (item.type === 'P') {
          powerLevel = Math.min(4, powerLevel + 1);
          score += 100;
        } else if (item.type === 'B') {
          bombs = Math.min(5, bombs + 1);
          score += 150;
        } else if (item.type === 'S') {
          hasShield = true;
          score += 100;
        }
        updateHUD();
        items.splice(ii, 1);
        continue;
      }

      if (item.y > canvas.height + 20) {
        items.splice(ii, 1);
      }
    }

    // Particles
    for (var pi = particles.length - 1; pi >= 0; pi--) {
      var p = particles[pi];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(pi, 1);
    }
  }

  function hitPlayer() {
    if (hasShield) {
      hasShield = false;
      player.invulnerable = 1.0;
      playSound('hit');
      return;
    }

    lives--;
    addExplosion(player.x, player.y, 25);
    playSound('boom');
    updateHUD();

    if (lives <= 0) {
      gameOver(false, '战机损毁严重，任务宣告失败！');
    } else {
      player.x = canvas.width / 2;
      player.y = canvas.height * 0.85;
      player.invulnerable = 2.5;
      powerLevel = Math.max(1, powerLevel - 1);
      updateHUD();
    }
  }

  function render() {
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Stars
    stars.forEach(function(s) {
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    });

    // Boss Warning
    if (bossWarningTimer > 0) {
      ctx.fillStyle = Math.sin(Date.now() * 0.02) > 0 ? 'rgba(239, 68, 68, 0.4)' : 'transparent';
      ctx.fillRect(0, canvas.height * 0.4, canvas.width, 60);
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚠️ WARNING: BOSS DETECTED ⚠️', canvas.width / 2, canvas.height * 0.4 + 38);
    }

    // Boss
    if (boss) {
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(boss.x - boss.w / 2, boss.y - boss.h / 2, boss.w, boss.h);
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(boss.x - boss.w / 2 + 10, boss.y - boss.h / 2 + 10, boss.w - 20, boss.h - 20);

      // Boss HP Bar
      var barW = canvas.width * 0.8;
      var hpRatio = Math.max(0, boss.hp / boss.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(canvas.width * 0.1, 15, barW, 8);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(canvas.width * 0.1, 15, barW * hpRatio, 8);
    }

    // Enemies
    enemies.forEach(function(e) {
      ctx.save();
      ctx.translate(e.x, e.y);
      if (e.type === 'scout') {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(0, 14);
        ctx.lineTo(-12, -14);
        ctx.lineTo(12, -14);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = '#a855f7';
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3b0764';
        ctx.fillRect(-16, -6, 32, 12);
      }
      ctx.restore();
    });

    // Bullets
    ctx.fillStyle = '#38bdf8';
    playerBullets.forEach(function(b) {
      ctx.fillRect(b.x - 2, b.y - 8, 4, 16);
    });

    ctx.fillStyle = '#f87171';
    enemyBullets.forEach(function(eb) {
      ctx.beginPath();
      ctx.arc(eb.x, eb.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Items
    items.forEach(function(it) {
      ctx.save();
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = it.type === 'P' ? '#eab308' : (it.type === 'B' ? '#ef4444' : '#06b6d4');
      ctx.fillText('[' + it.type + ']', it.x, it.y);
      ctx.restore();
    });

    // Player Fighter
    if (player) {
      ctx.save();
      ctx.translate(player.x, player.y);

      // Jet exhaust flame
      ctx.fillStyle = Math.random() > 0.5 ? '#f97316' : '#facc15';
      ctx.beginPath();
      ctx.moveTo(-6, 16);
      ctx.lineTo(6, 16);
      ctx.lineTo(0, 26 + Math.random() * 8);
      ctx.closePath();
      ctx.fill();

      // Fuselage
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(-18, 14);
      ctx.lineTo(0, 8);
      ctx.lineTo(18, 14);
      ctx.closePath();
      ctx.fill();

      // Cockpit
      ctx.fillStyle = '#bae6fd';
      ctx.beginPath();
      ctx.arc(0, -6, 4, 0, Math.PI * 2);
      ctx.fill();

      // Shield effect
      if (hasShield) {
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, player.radius * 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (player.invulnerable > 0) {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, player.radius * 1.3, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }

    // Particles
    particles.forEach(function(p) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Screen flash (Bomb)
    if (flashTimer > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, ' + (flashTimer * 2) + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function gameOver(won, msg) {
    isGameOver = true;
    modalTitle.textContent = won ? '🏆 歼灭母舰！' : '💥 战机损毁！';
    modalTitle.style.color = won ? '#38bdf8' : '#ef4444';
    modalDesc.textContent = msg;
    modal.classList.remove('hidden');
    playSound(won ? 'win' : 'gameover');
  }

  function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    var dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (dt > 0.1) dt = 0.1;

    if (!isGameOver) {
      update(dt);
    }
    render();
    requestAnimationFrame(gameLoop);
  }

  // Pointer drag bindings
  function onPointerMove(e) {
    var rect = canvas.getBoundingClientRect();
    pointerX = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    pointerY = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
  }

  canvas.addEventListener('mousedown', function(e) {
    isPointerDown = true;
    onPointerMove(e);
  });
  window.addEventListener('mousemove', function(e) {
    if (isPointerDown) onPointerMove(e);
  });
  window.addEventListener('mouseup', function() { isPointerDown = false; });

  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    isPointerDown = true;
    onPointerMove(e);
  }, { passive: false });
  window.addEventListener('touchmove', function(e) {
    if (isPointerDown) onPointerMove(e);
  }, { passive: false });
  window.addEventListener('touchend', function() { isPointerDown = false; });

  // Keyboard
  window.addEventListener('keydown', function(e) {
    keys[e.code] = true;
    if (e.code === 'KeyB' || e.code === 'Space') {
      useBomb();
    }
  });
  window.addEventListener('keyup', function(e) {
    keys[e.code] = false;
  });

  btnBomb.addEventListener('click', useBomb);
  btnRestart.addEventListener('click', function() {
    modal.classList.add('hidden');
    initGame();
  });

  resizeCanvas();
  initGame();
  requestAnimationFrame(gameLoop);

})();
