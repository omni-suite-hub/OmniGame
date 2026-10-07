// games/tower-defense/game.js - Minimalist Tower Defense (极简塔防)
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

      if (type === 'shoot') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.06);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
      } else if (type === 'cannon') {
        var bufferSize = ctx.sampleRate * 0.25;
        var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        var noise = ctx.createBufferSource();
        noise.buffer = buffer;
        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, now);
        filter.frequency.exponentialRampToValueAtTime(30, now + 0.25);
        noise.connect(filter);
        filter.connect(gain);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
        noise.start(now);
        noise.stop(now + 0.25);
      } else if (type === 'frost') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.linearRampToValueAtTime(400, now + 0.12);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'coin') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(987, now);
        osc.frequency.exponentialRampToValueAtTime(1318, now + 0.06);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
      } else if (type === 'basehit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.linearRampToValueAtTime(70, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
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
      }
    } catch(e) {}
  }

  // DOM
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var goldEl = document.getElementById('gold-el');
  var hpEl = document.getElementById('hp-el');
  var waveEl = document.getElementById('wave-el');
  var creepsEl = document.getElementById('creeps-el');
  var towerBar = document.getElementById('tower-bar');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc = document.getElementById('modal-desc');
  var btnRestart = document.getElementById('btn-restart');

  var COLS = 10;
  var ROWS = 8;
  var CELL_SIZE = 48;

  var COSTS = { arrow: 100, cannon: 125, frost: 75 };

  function resizeCanvas() {
    var container = document.getElementById('container');
    var maxW = container.clientWidth - 20;
    var maxH = container.clientHeight - 20;
    var scale = Math.min(maxW / (COLS * 48), maxH / (ROWS * 48), 1.25);
    scale = Math.max(0.65, scale);
    CELL_SIZE = Math.floor(48 * scale);
    canvas.width = COLS * CELL_SIZE;
    canvas.height = ROWS * CELL_SIZE;
  }
  window.addEventListener('resize', resizeCanvas);

  // Path grid coordinates
  var PATH_COORDS = [
    { c: 0, r: 1 }, { c: 2, r: 1 }, { c: 2, r: 4 },
    { c: 5, r: 4 }, { c: 5, r: 2 }, { c: 7, r: 2 },
    { c: 7, r: 6 }, { c: 9, r: 6 }
  ];

  var gold = 150;
  var crystalHp = 10;
  var currentWave = 1;
  var maxWaves = 5;
  var selectedTower = 'arrow';
  var isGameOver = false;
  var lastTime = 0;

  var towers = []; // placed towers
  var creeps = []; // marching enemies
  var projectiles = [];
  var particles = [];
  var waveRemaining = 0;
  var spawnTimer = 0;

  function initGame() {
    gold = 150;
    crystalHp = 10;
    currentWave = 1;
    selectedTower = 'arrow';
    isGameOver = false;
    towers = [];
    creeps = [];
    projectiles = [];
    particles = [];

    startWave(1);
    updateHUD();
  }

  function startWave(wNum) {
    currentWave = wNum;
    waveRemaining = 8 + wNum * 4;
    spawnTimer = 1.0;
    updateHUD();
  }

  function updateHUD() {
    goldEl.textContent = gold;
    hpEl.textContent = crystalHp;
    waveEl.textContent = currentWave + ' / ' + maxWaves;
    creepsEl.textContent = waveRemaining + creeps.length;

    var cards = document.querySelectorAll('.tower-card');
    cards.forEach(function(card) {
      var tType = card.getAttribute('data-type');
      if (COSTS[tType] > gold) card.classList.add('disabled');
      else card.classList.remove('disabled');

      if (tType === selectedTower) card.classList.add('selected');
      else card.classList.remove('selected');
    });
  }

  function isPathCell(c, r) {
    for (var i = 0; i < PATH_COORDS.length - 1; i++) {
      var p1 = PATH_COORDS[i];
      var p2 = PATH_COORDS[i + 1];
      var minC = Math.min(p1.c, p2.c);
      var maxC = Math.max(p1.c, p2.c);
      var minR = Math.min(p1.r, p2.r);
      var maxR = Math.max(p1.r, p2.r);
      if (c >= minC && c <= maxC && r >= minR && r <= maxR) return true;
    }
    return false;
  }

  function spawnCreep() {
    if (waveRemaining <= 0) return;
    var roll = Math.random();
    var type = 'scout';
    var hp = 45 + currentWave * 20;
    var spd = 50;
    var reward = 15;

    if (currentWave === 5 && waveRemaining === 1) {
      // Final Boss
      type = 'boss';
      hp = 800;
      spd = 25;
      reward = 100;
    } else if (roll > 0.65) {
      type = 'ogre';
      hp = 120 + currentWave * 35;
      spd = 30;
      reward = 25;
    }

    var startPt = PATH_COORDS[0];
    creeps.push({
      x: (startPt.c + 0.5) * CELL_SIZE,
      y: (startPt.r + 0.5) * CELL_SIZE,
      hp: hp,
      maxHp: hp,
      speed: spd,
      type: type,
      reward: reward,
      pathIndex: 0,
      slowTimer: 0
    });

    waveRemaining--;
    updateHUD();
  }

  function placeTower(c, r) {
    if (isPathCell(c, r)) return;
    for (var i = 0; i < towers.length; i++) {
      if (towers[i].c === c && towers[i].r === r) return;
    }

    var cost = COSTS[selectedTower];
    if (gold < cost) return;

    gold -= cost;
    var range = selectedTower === 'arrow' ? CELL_SIZE * 2.5 : (selectedTower === 'cannon' ? CELL_SIZE * 3.0 : CELL_SIZE * 2.2);
    var rate = selectedTower === 'arrow' ? 0.35 : (selectedTower === 'cannon' ? 1.2 : 0.8);

    towers.push({
      c: c,
      r: r,
      x: (c + 0.5) * CELL_SIZE,
      y: (r + 0.5) * CELL_SIZE,
      type: selectedTower,
      range: range,
      cooldown: 0,
      rate: rate
    });

    playSound('shoot');
    updateHUD();
  }

  function updatePhysics(dt) {
    if (isGameOver) return;

    // Spawning creeps
    spawnTimer -= dt;
    if (spawnTimer <= 0 && waveRemaining > 0) {
      spawnTimer = Math.max(0.8, 2.2 - currentWave * 0.3);
      spawnCreep();
    }

    // Creeps movement along path
    for (var ci = creeps.length - 1; ci >= 0; ci--) {
      var cr = creeps[ci];
      if (cr.slowTimer > 0) cr.slowTimer -= dt;
      var curSpeed = cr.slowTimer > 0 ? cr.speed * 0.5 : cr.speed;

      var targetPt = PATH_COORDS[cr.pathIndex + 1];
      if (targetPt) {
        var tx = (targetPt.c + 0.5) * CELL_SIZE;
        var ty = (targetPt.r + 0.5) * CELL_SIZE;
        var dist = Math.hypot(tx - cr.x, ty - cr.y);

        if (dist < 4) {
          cr.pathIndex++;
          if (cr.pathIndex >= PATH_COORDS.length - 1) {
            // Reached crystal!
            crystalHp--;
            playSound('basehit');
            creeps.splice(ci, 1);
            updateHUD();
            if (crystalHp <= 0) {
              gameOver(false, '基地水晶已被魔物彻底击碎！');
              return;
            }
            continue;
          }
        } else {
          cr.x += ((tx - cr.x) / dist) * curSpeed * dt;
          cr.y += ((ty - cr.y) / dist) * curSpeed * dt;
        }
      }
    }

    // Towers AI & Shooting
    towers.forEach(function(t) {
      if (t.cooldown > 0) t.cooldown -= dt;

      if (t.cooldown <= 0) {
        // Find nearest creep in range
        var target = null;
        var minDist = t.range;
        for (var i = 0; i < creeps.length; i++) {
          var d = Math.hypot(creeps[i].x - t.x, creeps[i].y - t.y);
          if (d <= minDist) {
            minDist = d;
            target = creeps[i];
          }
        }

        if (target) {
          t.cooldown = t.rate;
          if (t.type === 'arrow') {
            projectiles.push({
              x: t.x, y: t.y, target: target, type: 'arrow', speed: 380, dmg: 22
            });
            playSound('shoot');
          } else if (t.type === 'cannon') {
            projectiles.push({
              x: t.x, y: t.y, targetX: target.x, targetY: target.y, type: 'cannon', speed: 240, dmg: 65, splash: CELL_SIZE * 1.5
            });
            playSound('cannon');
          } else if (t.type === 'frost') {
            projectiles.push({
              x: t.x, y: t.y, target: target, type: 'frost', speed: 320, dmg: 8
            });
            playSound('frost');
          }
        }
      }
    });

    // Projectiles
    for (var pi = projectiles.length - 1; pi >= 0; pi--) {
      var p = projectiles[pi];
      if (p.type === 'arrow' || p.type === 'frost') {
        if (!p.target || creeps.indexOf(p.target) === -1) {
          projectiles.splice(pi, 1);
          continue;
        }
        var dx = p.target.x - p.x;
        var dy = p.target.y - p.y;
        var dist2 = Math.hypot(dx, dy);

        if (dist2 < 12) {
          p.target.hp -= p.dmg;
          if (p.type === 'frost') p.target.slowTimer = 2.0;

          if (p.target.hp <= 0) {
            killCreep(p.target);
          }
          projectiles.splice(pi, 1);
        } else {
          p.x += (dx / dist2) * p.speed * dt;
          p.y += (dy / dist2) * p.speed * dt;
        }
      } else if (p.type === 'cannon') {
        var cdx = p.targetX - p.x;
        var cdy = p.targetY - p.y;
        var cdist = Math.hypot(cdx, cdy);

        if (cdist < 14) {
          // Cannon Splash
          for (var ck = creeps.length - 1; ck >= 0; ck--) {
            var crm = creeps[ck];
            if (Math.hypot(crm.x - p.targetX, crm.y - p.targetY) <= p.splash) {
              crm.hp -= p.dmg;
              if (crm.hp <= 0) killCreep(crm);
            }
          }
          projectiles.splice(pi, 1);
        } else {
          p.x += (cdx / cdist) * p.speed * dt;
          p.y += (cdy / cdist) * p.speed * dt;
        }
      }
    }

    // Check Wave End
    if (waveRemaining <= 0 && creeps.length === 0) {
      if (currentWave < maxWaves) {
        startWave(currentWave + 1);
      } else {
        gameOver(true, '水晶安然无恙！所有魔物波次已被全部击溃！');
      }
    }
  }

  function killCreep(cr) {
    var idx = creeps.indexOf(cr);
    if (idx !== -1) {
      creeps.splice(idx, 1);
      gold += cr.reward;
      playSound('coin');
      updateHUD();
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Grid background (Grass)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var x = c * CELL_SIZE;
        var y = r * CELL_SIZE;

        if (isPathCell(c, r)) {
          ctx.fillStyle = '#334155';
          ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
        } else {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        }
      }
    }

    // 2. Crystal Base at end
    var endPt = PATH_COORDS[PATH_COORDS.length - 1];
    ctx.font = Math.floor(CELL_SIZE * 0.8) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💎', (endPt.c + 0.5) * CELL_SIZE, (endPt.r + 0.5) * CELL_SIZE);

    // Entrance at start
    var stPt = PATH_COORDS[0];
    ctx.fillText('🌀', (stPt.c + 0.5) * CELL_SIZE, (stPt.r + 0.5) * CELL_SIZE);

    // 3. Towers
    towers.forEach(function(t) {
      ctx.fillStyle = t.type === 'arrow' ? '#0284c7' : (t.type === 'cannon' ? '#b45309' : '#06b6d4');
      ctx.beginPath();
      ctx.arc(t.x, t.y, CELL_SIZE * 0.38, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = Math.floor(CELL_SIZE * 0.5) + 'px sans-serif';
      var icon = t.type === 'arrow' ? '🏹' : (t.type === 'cannon' ? '💣' : '❄️');
      ctx.fillText(icon, t.x, t.y);
    });

    // 4. Creeps
    creeps.forEach(function(cr) {
      ctx.font = Math.floor(CELL_SIZE * 0.55) + 'px sans-serif';
      var cIcon = cr.type === 'boss' ? '👑' : (cr.type === 'ogre' ? '👹' : '🏃');
      ctx.fillText(cIcon, cr.x, cr.y);

      // HP bar
      var barW = CELL_SIZE * 0.6;
      var hpRatio = Math.max(0, cr.hp / cr.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(cr.x - barW / 2, cr.y - CELL_SIZE * 0.38, barW, 4);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(cr.x - barW / 2, cr.y - CELL_SIZE * 0.38, barW * hpRatio, 4);
    });

    // 5. Projectiles
    projectiles.forEach(function(p) {
      ctx.fillStyle = p.type === 'arrow' ? '#facc15' : (p.type === 'cannon' ? '#ef4444' : '#38bdf8');
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.type === 'cannon' ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function gameOver(won, msg) {
    isGameOver = true;
    modalTitle.textContent = won ? '🏆 防守大捷！' : '💥 水晶破碎！';
    modalTitle.style.color = won ? '#facc15' : '#ef4444';
    modalDesc.textContent = msg;
    modal.classList.remove('hidden');
    playSound(won ? 'win' : 'basehit');
  }

  function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    var dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (dt > 0.1) dt = 0.1;

    updatePhysics(dt);
    render();
    requestAnimationFrame(gameLoop);
  }

  // Pointer grid placement
  canvas.addEventListener('click', function(e) {
    if (isGameOver) return;
    var rect = canvas.getBoundingClientRect();
    var clickX = e.clientX - rect.left;
    var clickY = e.clientY - rect.top;
    var col = Math.floor(clickX / CELL_SIZE);
    var row = Math.floor(clickY / CELL_SIZE);
    placeTower(col, row);
  });

  towerBar.addEventListener('click', function(e) {
    var card = e.target.closest('.tower-card');
    if (!card) return;
    selectedTower = card.getAttribute('data-type');
    updateHUD();
  });

  btnRestart.addEventListener('click', function() {
    modal.classList.add('hidden');
    initGame();
  });

  resizeCanvas();
  initGame();
  requestAnimationFrame(gameLoop);

})();
