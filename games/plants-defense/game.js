// games/plants-defense/game.js - Plants Defense (植物防线 / PvZ-Lite)
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

      if (type === 'sun') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.exponentialRampToValueAtTime(1046, now + 0.12);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'plant') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(440, now + 0.1);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'shoot') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'splat') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.linearRampToValueAtTime(80, now + 0.06);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
      } else if (type === 'cherry') {
        var bufferSize = ctx.sampleRate * 0.35;
        var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        var noise = ctx.createBufferSource();
        noise.buffer = buffer;
        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(40, now + 0.35);
        noise.connect(filter);
        filter.connect(gain);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.35);
        noise.start(now);
        noise.stop(now + 0.35);
      } else if (type === 'mower') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.linearRampToValueAtTime(220, now + 0.3);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === 'win') {
        [330, 392, 523, 659].forEach(function(f, idx) {
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
        [240, 200, 160, 110].forEach(function(f, idx) {
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

  // DOM Elements
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var sunEl = document.getElementById('sun-el');
  var waveEl = document.getElementById('wave-el');
  var zombieLeftEl = document.getElementById('zombie-left-el');
  var cardsBar = document.getElementById('cards-bar');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc = document.getElementById('modal-desc');
  var btnRestart = document.getElementById('btn-restart');

  // Constants
  var ROWS = 5;
  var COLS = 8;
  var CELL_W = 60;
  var CELL_H = 68;

  var PLANT_COSTS = {
    sunflower: 50,
    peashooter: 100,
    wallnut: 50,
    cherrybomb: 150,
    shovel: 0
  };

  // State
  var sunCount = 150;
  var currentWave = 1;
  var maxWaves = 3;
  var selectedPlant = null;
  var isGameOver = false;
  var lastTime = 0;

  var grid = []; // 5 rows x 8 cols
  var zombies = [];
  var projectiles = [];
  var sunDrops = [];
  var particles = [];
  var lawnmowers = [];

  var skySunTimer = 0;
  var waveZombiesRemaining = 0;
  var spawnTimer = 0;

  function resizeCanvas() {
    var container = document.getElementById('container');
    var maxW = container.clientWidth - 20;
    var maxH = container.clientHeight - 20;
    var scale = Math.min(maxW / (COLS * 60 + 50), maxH / (ROWS * 68), 1.25);
    scale = Math.max(0.7, scale);

    CELL_W = Math.floor(60 * scale);
    CELL_H = Math.floor(68 * scale);
    canvas.width = COLS * CELL_W + Math.floor(40 * scale); // 40px left mower lane
    canvas.height = ROWS * CELL_H;
  }
  window.addEventListener('resize', resizeCanvas);

  function getMowerWidth() {
    return Math.floor(canvas.width - COLS * CELL_W);
  }

  function initGame() {
    sunCount = 150;
    currentWave = 1;
    selectedPlant = null;
    isGameOver = false;
    grid = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) {
        row.push(null);
      }
      grid.push(row);
    }

    zombies = [];
    projectiles = [];
    sunDrops = [];
    particles = [];
    lawnmowers = [];

    for (var i = 0; i < ROWS; i++) {
      lawnmowers.push({
        row: i,
        x: 4,
        active: false,
        used: false
      });
    }

    startWave(1);
    updateHUD();
  }

  function startWave(waveNum) {
    currentWave = waveNum;
    var totalZombies = waveNum * 5 + 3; // 8, 13, 18
    waveZombiesRemaining = totalZombies;
    spawnTimer = 2.0;
    updateHUD();
  }

  function updateHUD() {
    sunEl.textContent = sunCount;
    waveEl.textContent = currentWave + ' / ' + maxWaves;
    zombieLeftEl.textContent = waveZombiesRemaining + zombies.length;

    // Update card disabled status
    var cards = document.querySelectorAll('.plant-card');
    cards.forEach(function(card) {
      var pType = card.getAttribute('data-type');
      if (pType !== 'shovel' && PLANT_COSTS[pType] > sunCount) {
        card.classList.add('disabled');
      } else {
        card.classList.remove('disabled');
      }
    });
  }

  function spawnZombie() {
    if (waveZombiesRemaining <= 0) return;
    var row = Math.floor(Math.random() * ROWS);
    var roll = Math.random();
    var type = 'basic';
    var hp = 100;
    var speed = 14;

    if (currentWave >= 2 && roll > 0.65) {
      type = 'conehead';
      hp = 260;
      speed = 13;
    } else if (currentWave >= 3 && roll > 0.45) {
      type = 'buckethead';
      hp = 550;
      speed = 11;
    } else if (roll < 0.25) {
      type = 'runner';
      hp = 70;
      speed = 22;
    }

    zombies.push({
      row: row,
      x: canvas.width + 10,
      hp: hp,
      maxHp: hp,
      speed: speed,
      type: type,
      eatingPlant: null
    });

    waveZombiesRemaining--;
    updateHUD();
  }

  function plantAt(col, row, type) {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

    if (type === 'shovel') {
      if (grid[row][col]) {
        grid[row][col] = null;
        playSound('plant');
      }
      return;
    }

    var cost = PLANT_COSTS[type];
    if (sunCount < cost || grid[row][col] !== null) return;

    sunCount -= cost;
    playSound('plant');

    var pData = {
      type: type,
      col: col,
      row: row,
      hp: type === 'wallnut' ? 400 : 100,
      maxHp: type === 'wallnut' ? 400 : 100,
      timer: 0
    };

    if (type === 'cherrybomb') {
      pData.explodeTimer = 1.1; // explodes in 1.1s
    }

    grid[row][col] = pData;
    updateHUD();
  }

  function triggerCherryExplosion(centerCol, centerRow) {
    playSound('cherry');
    var mw = getMowerWidth();
    var cx = mw + (centerCol + 0.5) * CELL_W;
    var cy = (centerRow + 0.5) * CELL_H;

    // Explode in 3x3 tiles
    for (var z = zombies.length - 1; z >= 0; z--) {
      var zom = zombies[z];
      var zCol = Math.floor((zom.x - mw) / CELL_W);
      if (Math.abs(zom.row - centerRow) <= 1 && Math.abs(zCol - centerCol) <= 1) {
        zom.hp -= 1200;
        if (zom.hp <= 0) {
          zombies.splice(z, 1);
        }
      }
    }

    // Explosion particles
    for (var i = 0; i < 30; i++) {
      var ang = Math.random() * Math.PI * 2;
      var dist = Math.random() * 80;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * dist * 3,
        vy: Math.sin(ang) * dist * 3,
        color: Math.random() > 0.5 ? '#ef4444' : '#f97316',
        life: 0.4
      });
    }
  }

  // Updates
  function update(dt) {
    // 1. Sky Sun generator
    skySunTimer += dt;
    if (skySunTimer >= 6.5) {
      skySunTimer = 0;
      sunDrops.push({
        x: getMowerWidth() + Math.random() * (canvas.width - getMowerWidth() - 40),
        y: -20,
        targetY: 40 + Math.random() * (canvas.height - 100),
        vy: 45,
        collected: false
      });
    }

    // 2. Plants update
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var p = grid[r][c];
        if (!p) continue;

        if (p.type === 'sunflower') {
          p.timer += dt;
          if (p.timer >= 9.0) {
            p.timer = 0;
            var mw = getMowerWidth();
            sunDrops.push({
              x: mw + (c + 0.5) * CELL_W + (Math.random() * 20 - 10),
              y: (r + 0.5) * CELL_H,
              targetY: (r + 0.7) * CELL_H,
              vy: 20,
              collected: false
            });
          }
        } else if (p.type === 'peashooter') {
          p.timer += dt;
          if (p.timer >= 1.4) {
            // Check if any zombie in this row to right
            var hasZombieAhead = false;
            var mw2 = getMowerWidth();
            var px = mw2 + (c + 0.5) * CELL_W;
            for (var zi = 0; zi < zombies.length; zi++) {
              if (zombies[zi].row === r && zombies[zi].x > px) {
                hasZombieAhead = true;
                break;
              }
            }
            if (hasZombieAhead) {
              p.timer = 0;
              projectiles.push({
                row: r,
                x: px + 15,
                y: (r + 0.5) * CELL_H,
                vx: 240,
                damage: 20
              });
              playSound('shoot');
            }
          }
        } else if (p.type === 'cherrybomb') {
          p.explodeTimer -= dt;
          if (p.explodeTimer <= 0) {
            triggerCherryExplosion(c, r);
            grid[r][c] = null;
          }
        }
      }
    }

    // 3. Sun Drops
    for (var si = sunDrops.length - 1; si >= 0; si--) {
      var s = sunDrops[si];
      if (s.y < s.targetY) {
        s.y += s.vy * dt;
      }
    }

    // 4. Projectiles
    var mw3 = getMowerWidth();
    for (var pi = projectiles.length - 1; pi >= 0; pi--) {
      var proj = projectiles[pi];
      proj.x += proj.vx * dt;

      // Hit test vs zombies in same row
      var hit = false;
      for (var zj = 0; zj < zombies.length; zj++) {
        var zm = zombies[zj];
        if (zm.row === proj.row && Math.abs(zm.x - proj.x) < 18) {
          zm.hp -= proj.damage;
          playSound('splat');
          hit = true;
          // Splat particle
          for (var sp = 0; sp < 4; sp++) {
            particles.push({
              x: proj.x,
              y: proj.y,
              vx: (Math.random() - 0.5) * 80,
              vy: (Math.random() - 0.5) * 80,
              color: '#22c55e',
              life: 0.2
            });
          }
          if (zm.hp <= 0) {
            zombies.splice(zj, 1);
            updateHUD();
          }
          break;
        }
      }

      if (hit || proj.x > canvas.width) {
        projectiles.splice(pi, 1);
      }
    }

    // 5. Zombie Spawning & Movement
    spawnTimer -= dt;
    if (spawnTimer <= 0 && waveZombiesRemaining > 0) {
      spawnTimer = Math.max(1.8, 4.0 - currentWave * 0.7);
      spawnZombie();
    }

    for (var zk = zombies.length - 1; zk >= 0; zk--) {
      var z = zombies[zk];
      var zCol = Math.floor((z.x - mw3) / CELL_W);

      // Check eating plant in current cell
      var plantInCell = (zCol >= 0 && zCol < COLS) ? grid[z.row][zCol] : null;

      if (plantInCell && z.x > mw3 + zCol * CELL_W + 5 && z.x < mw3 + (zCol + 1) * CELL_W) {
        // Eating
        plantInCell.hp -= 20 * dt;
        if (plantInCell.hp <= 0) {
          grid[z.row][zCol] = null;
        }
      } else {
        // Walk left
        z.x -= z.speed * dt;
      }

      // Check reaching lawnmower or house
      if (z.x <= mw3) {
        var lm = lawnmowers[z.row];
        if (!lm.used && !lm.active) {
          lm.active = true;
          playSound('mower');
        } else if (lm.used && z.x <= 5) {
          // Zombies reached house!
          gameOver(false, '僵尸冲进了你的房间！脑子被吃掉了！');
          return;
        }
      }
    }

    // 6. Lawnmowers
    lawnmowers.forEach(function(lm) {
      if (lm.active) {
        lm.x += 350 * dt;
        // Kill any zombies in row
        for (var zx = zombies.length - 1; zx >= 0; zx--) {
          var zmb = zombies[zx];
          if (zmb.row === lm.row && zmb.x <= lm.x + 20) {
            zombies.splice(zx, 1);
            updateHUD();
          }
        }
        if (lm.x > canvas.width) {
          lm.active = false;
          lm.used = true;
        }
      }
    });

    // 7. Check Wave / Win
    if (waveZombiesRemaining <= 0 && zombies.length === 0) {
      if (currentWave < maxWaves) {
        startWave(currentWave + 1);
      } else {
        gameOver(true, '花园保卫战大获全胜！全部波次已击退！');
      }
    }

    // 8. Particles
    for (var pki = particles.length - 1; pki >= 0; pki--) {
      var pt = particles[pki];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) particles.splice(pki, 1);
    }
  }

  // Rendering
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var mw = getMowerWidth();

    // 1. Lawn grid
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var x = mw + c * CELL_W;
        var y = r * CELL_H;
        ctx.fillStyle = (r + c) % 2 === 0 ? '#15803d' : '#166534';
        ctx.fillRect(x, y, CELL_W, CELL_H);

        // Highlight selected cell
        if (selectedPlant) {
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.2)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, CELL_W, CELL_H);
        }
      }
    }

    // 2. Lawnmowers
    lawnmowers.forEach(function(lm) {
      if (!lm.used) {
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(lm.x, lm.row * CELL_H + CELL_H * 0.25, mw * 0.8, CELL_H * 0.5);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(lm.x + 4, lm.row * CELL_H + CELL_H * 0.35, mw * 0.4, CELL_H * 0.3);
      }
    });

    // 3. Plants
    for (var pr = 0; pr < ROWS; pr++) {
      for (var pc = 0; pc < COLS; pc++) {
        var plant = grid[pr][pc];
        if (!plant) continue;
        var px = mw + pc * CELL_W + CELL_W / 2;
        var py = pr * CELL_H + CELL_H / 2;

        ctx.font = Math.floor(CELL_H * 0.55) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        var icon = '🌻';
        if (plant.type === 'peashooter') icon = '🌱';
        else if (plant.type === 'wallnut') icon = '🌰';
        else if (plant.type === 'cherrybomb') icon = '🍒';

        ctx.fillText(icon, px, py);

        // Wallnut cracks
        if (plant.type === 'wallnut' && plant.hp < plant.maxHp * 0.5) {
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.fillText('⚡', px + 5, py - 5);
        }
      }
    }

    // 4. Projectiles
    ctx.fillStyle = '#4ade80';
    projectiles.forEach(function(proj) {
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, 6, 0, Math.PI * 2);
      ctx.fill();
    });

    // 5. Zombies
    zombies.forEach(function(z) {
      var zy = z.row * CELL_H + CELL_H / 2;
      ctx.font = Math.floor(CELL_H * 0.58) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      var zIcon = '🧟';
      if (z.type === 'conehead') zIcon = '🧟‍♂️';
      else if (z.type === 'buckethead') zIcon = '🪖';
      else if (z.type === 'runner') zIcon = '🏃';

      ctx.fillText(zIcon, z.x, zy);

      // Zombie HP bar
      var barW = CELL_W * 0.6;
      var hpRatio = Math.max(0, z.hp / z.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(z.x - barW / 2, zy - CELL_H * 0.4, barW, 4);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(z.x - barW / 2, zy - CELL_H * 0.4, barW * hpRatio, 4);
    });

    // 6. Sun Drops
    sunDrops.forEach(function(s) {
      ctx.font = Math.floor(CELL_H * 0.5) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☀️', s.x, s.y);
    });

    // 7. Particles
    particles.forEach(function(pt) {
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function gameOver(won, msg) {
    isGameOver = true;
    modalTitle.textContent = won ? '🌻 防守大捷！' : '🧟 脑子被吃掉了！';
    modalTitle.style.color = won ? '#facc15' : '#ef4444';
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

  // Interaction handlers
  cardsBar.addEventListener('click', function(e) {
    var card = e.target.closest('.plant-card');
    if (!card) return;
    var pType = card.getAttribute('data-type');
    if (pType !== 'shovel' && PLANT_COSTS[pType] > sunCount) return;

    document.querySelectorAll('.plant-card').forEach(function(c) { c.classList.remove('selected'); });
    if (selectedPlant === pType) {
      selectedPlant = null;
    } else {
      selectedPlant = pType;
      card.classList.add('selected');
    }
  });

  function handlePointer(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;

    // Check sun pickup first
    for (var i = sunDrops.length - 1; i >= 0; i--) {
      var s = sunDrops[i];
      if (Math.hypot(s.x - x, s.y - y) < 32) {
        sunCount += 25;
        sunDrops.splice(i, 1);
        playSound('sun');
        updateHUD();
        return;
      }
    }

    // Grid placement
    var mw = getMowerWidth();
    if (x >= mw && selectedPlant) {
      var col = Math.floor((x - mw) / CELL_W);
      var row = Math.floor(y / CELL_H);
      plantAt(col, row, selectedPlant);

      // Deselect card
      selectedPlant = null;
      document.querySelectorAll('.plant-card').forEach(function(c) { c.classList.remove('selected'); });
    }
  }

  canvas.addEventListener('click', function(e) {
    handlePointer(e.clientX, e.clientY);
  });

  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
      handlePointer(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });

  btnRestart.addEventListener('click', function() {
    modal.classList.add('hidden');
    initGame();
  });

  resizeCanvas();
  initGame();
  requestAnimationFrame(gameLoop);

})();
