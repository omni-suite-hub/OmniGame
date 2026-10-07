// games/tank-battle/game.js - Classic Tank Battle (坦克大战)
(function() {
  'use strict';

  // --- Audio Synthesizer ---
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
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.08);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'hit') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(60, now + 0.09);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.09);
        osc.start(now);
        osc.stop(now + 0.09);
      } else if (type === 'boom') {
        // White noise-like explosion
        var bufferSize = ctx.sampleRate * 0.25;
        var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        var noise = ctx.createBufferSource();
        noise.buffer = buffer;
        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(50, now + 0.25);
        noise.connect(filter);
        filter.connect(gain);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
        noise.start(now);
        noise.stop(now + 0.25);
      } else if (type === 'powerup') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.linearRampToValueAtTime(700, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'win') {
        var notes = [262, 330, 392, 523];
        notes.forEach(function(freq, idx) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'triangle';
          o.frequency.setValueAtTime(freq, now + idx * 0.1);
          g.gain.setValueAtTime(0.2, now + idx * 0.1);
          g.gain.linearRampToValueAtTime(0.01, now + idx * 0.1 + 0.15);
          o.start(now + idx * 0.1);
          o.stop(now + idx * 0.1 + 0.15);
        });
      } else if (type === 'gameover') {
        var notes2 = [300, 240, 180, 120];
        notes2.forEach(function(freq, idx) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(freq, now + idx * 0.12);
          g.gain.setValueAtTime(0.2, now + idx * 0.12);
          g.gain.linearRampToValueAtTime(0.01, now + idx * 0.12 + 0.18);
          o.start(now + idx * 0.12);
          o.stop(now + idx * 0.12 + 0.18);
        });
      }
    } catch(e) {}
  }

  // --- DOM Elements ---
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var baseEl = document.getElementById('base-el');
  var enemiesEl = document.getElementById('enemies-el');
  var livesEl = document.getElementById('lives-el');
  var scoreEl = document.getElementById('score-el');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc = document.getElementById('modal-desc');
  var btnRestart = document.getElementById('btn-restart');

  var btnUp = document.getElementById('btn-up');
  var btnDown = document.getElementById('btn-down');
  var btnLeft = document.getElementById('btn-left');
  var btnRight = document.getElementById('btn-right');
  var btnFire = document.getElementById('btn-fire');

  // --- Constants & Grid ---
  var GRID_SIZE = 13;
  var TILE_SIZE = 32; // will scale with canvas
  var CANVAS_WIDTH = 416;
  var CANVAS_HEIGHT = 416;

  // Tile Types: 0: Empty, 1: Brick, 2: Steel, 3: Base, 4: DestroyedBase
  var EMPTY = 0;
  var BRICK = 1;
  var STEEL = 2;
  var BASE = 3;
  var DESTROYED_BASE = 4;

  // Directions: 0: Up, 1: Right, 2: Down, 3: Left
  var DIRS = [
    { x: 0, y: -1, angle: 0 },
    { x: 1, y: 0, angle: Math.PI / 2 },
    { x: 0, y: 1, angle: Math.PI },
    { x: -1, y: 0, angle: -Math.PI / 2 }
  ];

  // Game State
  var map = [];
  var player = null;
  var enemies = [];
  var bullets = [];
  var particles = [];
  var powerups = [];

  var lives = 3;
  var score = 0;
  var remainingEnemies = 12;
  var activeEnemyTarget = 3;
  var isGameOver = false;
  var lastTime = 0;
  var spawnTimer = 0;
  var freezeTimer = 0;

  var keys = {};

  // Resize canvas to fit container while maintaining 1:1 aspect ratio
  function resizeCanvas() {
    var container = document.getElementById('container');
    var size = Math.min(container.clientWidth - 20, container.clientHeight - 20, 520);
    size = Math.max(280, size);
    canvas.width = size;
    canvas.height = size;
    TILE_SIZE = size / GRID_SIZE;
  }

  window.addEventListener('resize', resizeCanvas);

  function initMap() {
    map = [];
    for (var r = 0; r < GRID_SIZE; r++) {
      var row = [];
      for (var c = 0; c < GRID_SIZE; c++) {
        row.push(EMPTY);
      }
      map.push(row);
    }

    // Classic map layout
    // Base at (6, 12)
    map[12][6] = BASE;
    // Brick walls protecting base
    map[11][5] = BRICK;
    map[11][6] = BRICK;
    map[11][7] = BRICK;
    map[12][5] = BRICK;
    map[12][7] = BRICK;

    // Interior walls (symmetric layout)
    var walls = [
      // row 2
      [2, 1], [2, 2], [2, 3], [2, 5], [2, 7], [2, 9], [2, 10], [2, 11],
      // row 4
      [4, 1], [4, 3], [4, 5], [4, 6], [4, 7], [4, 9], [4, 11],
      // row 6 (center steel & bricks)
      [6, 0], [6, 1], [6, 3], [6, 9], [6, 11], [6, 12],
      // row 8
      [8, 1], [8, 3], [8, 5], [8, 6], [8, 7], [8, 9], [8, 11],
      // row 10
      [10, 2], [10, 3], [10, 5], [10, 7], [10, 9], [10, 10]
    ];

    walls.forEach(function(pos) {
      map[pos[0]][pos[1]] = BRICK;
    });

    // A few steel blocks for tactical variety
    map[6][5] = STEEL;
    map[6][7] = STEEL;
    map[4][6] = STEEL;
    map[8][6] = STEEL;
  }

  function spawnPlayer() {
    player = {
      x: 4 * TILE_SIZE,
      y: 12 * TILE_SIZE,
      w: TILE_SIZE * 0.88,
      h: TILE_SIZE * 0.88,
      dir: 0,
      speed: TILE_SIZE * 3.5,
      cooldown: 0,
      invulnerable: 2.0, // seconds
      level: 1
    };
  }

  var SPAWN_POINTS = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 12, y: 0 }
  ];

  function spawnEnemy() {
    if (remainingEnemies <= 0 || enemies.length >= activeEnemyTarget) return;

    var pt = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
    // Check if spawn point is blocked by another enemy
    var px = pt.x * TILE_SIZE;
    var py = pt.y * TILE_SIZE;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (Math.abs(e.x - px) < TILE_SIZE && Math.abs(e.y - py) < TILE_SIZE) {
        return; // wait for point to clear
      }
    }

    var type = Math.random();
    var speed = TILE_SIZE * 2.2;
    var hp = 1;
    var color = '#ef4444';

    if (type > 0.75) {
      // Heavy Tank
      hp = 2;
      speed = TILE_SIZE * 1.6;
      color = '#eab308';
    } else if (type > 0.45) {
      // Fast Scout
      hp = 1;
      speed = TILE_SIZE * 3.2;
      color = '#06b6d4';
    }

    enemies.push({
      x: px,
      y: py,
      w: TILE_SIZE * 0.88,
      h: TILE_SIZE * 0.88,
      dir: 2, // facing down
      speed: speed,
      hp: hp,
      maxHp: hp,
      color: color,
      cooldown: Math.random() * 1.5,
      changeDirTimer: Math.random() * 2 + 1
    });

    remainingEnemies--;
    updateHUD();
  }

  function canMoveTo(x, y, w, h, excludeSelf) {
    // Canvas boundary check
    if (x < 0 || y < 0 || x + w > canvas.width || y + h > canvas.height) {
      return false;
    }

    // Grid tile collision
    var startCol = Math.floor(x / TILE_SIZE);
    var endCol = Math.floor((x + w - 0.1) / TILE_SIZE);
    var startRow = Math.floor(y / TILE_SIZE);
    var endRow = Math.floor((y + h - 0.1) / TILE_SIZE);

    for (var r = startRow; r <= endRow; r++) {
      for (var c = startCol; c <= endCol; c++) {
        if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
        var t = map[r][c];
        if (t === BRICK || t === STEEL || t === BASE || t === DESTROYED_BASE) {
          return false;
        }
      }
    }

    // Tank vs tank collision
    if (excludeSelf !== player && player) {
      if (checkRectOverlap(x, y, w, h, player.x, player.y, player.w, player.h)) {
        return false;
      }
    }

    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e === excludeSelf) continue;
      if (checkRectOverlap(x, y, w, h, e.x, e.y, e.w, e.h)) {
        return false;
      }
    }

    return true;
  }

  function checkRectOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
  }

  function fireBullet(owner, isPlayer) {
    var speed = TILE_SIZE * 8;
    var bx = owner.x + owner.w / 2 - 3;
    var by = owner.y + owner.h / 2 - 3;
    var d = DIRS[owner.dir];

    // Offset bullet to start from barrel
    bx += d.x * (owner.w / 2 + 4);
    by += d.y * (owner.h / 2 + 4);

    bullets.push({
      x: bx,
      y: by,
      vx: d.x * speed,
      vy: d.y * speed,
      isPlayer: isPlayer,
      power: isPlayer ? (owner.level || 1) : 1
    });

    if (isPlayer) playSound('shoot');
  }

  function addExplosion(x, y, count, color) {
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = Math.random() * 80 + 30;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35 + Math.random() * 0.2,
        maxLife: 0.5,
        color: color || (Math.random() > 0.5 ? '#f97316' : '#facc15')
      });
    }
  }

  function updateBullets(dt) {
    for (var i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Check bounds
      if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
        bullets.splice(i, 1);
        continue;
      }

      // Check map collision
      var col = Math.floor((b.x + 3) / TILE_SIZE);
      var row = Math.floor((b.y + 3) / TILE_SIZE);

      if (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE) {
        var tile = map[row][col];
        if (tile === BRICK) {
          map[row][col] = EMPTY;
          bullets.splice(i, 1);
          addExplosion((col + 0.5) * TILE_SIZE, (row + 0.5) * TILE_SIZE, 6, '#b45309');
          playSound('hit');
          continue;
        } else if (tile === STEEL) {
          bullets.splice(i, 1);
          addExplosion((col + 0.5) * TILE_SIZE, (row + 0.5) * TILE_SIZE, 4, '#94a3b8');
          playSound('hit');
          continue;
        } else if (tile === BASE) {
          map[row][col] = DESTROYED_BASE;
          bullets.splice(i, 1);
          addExplosion((col + 0.5) * TILE_SIZE, (row + 0.5) * TILE_SIZE, 20, '#ef4444');
          gameOver(false, '老鹰基地被摧毁！防守失败！');
          return;
        }
      }

      // Check bullet vs bullet collision
      var hitOther = false;
      for (var j = bullets.length - 1; j >= 0; j--) {
        if (i !== j && bullets[i] && bullets[j] && bullets[i].isPlayer !== bullets[j].isPlayer) {
          var b2 = bullets[j];
          if (Math.abs(b.x - b2.x) < 8 && Math.abs(b.y - b2.y) < 8) {
            bullets.splice(Math.max(i, j), 1);
            bullets.splice(Math.min(i, j), 1);
            hitOther = true;
            break;
          }
        }
      }
      if (hitOther) continue;

      // Check player bullet vs enemy tank
      if (b.isPlayer) {
        var hitEnemy = false;
        for (var eIdx = enemies.length - 1; eIdx >= 0; eIdx--) {
          var enemy = enemies[eIdx];
          if (checkRectOverlap(b.x, b.y, 6, 6, enemy.x, enemy.y, enemy.w, enemy.h)) {
            bullets.splice(i, 1);
            enemy.hp -= b.power;
            if (enemy.hp <= 0) {
              enemies.splice(eIdx, 1);
              score += 100;
              addExplosion(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, 16);
              playSound('boom');

              // Chance to spawn powerup
              if (Math.random() < 0.25) {
                spawnPowerup(enemy.x, enemy.y);
              }

              // Win condition
              if (remainingEnemies <= 0 && enemies.length === 0) {
                gameOver(true, '全歼敌方坦克部队！完美通关！');
                return;
              }
            } else {
              playSound('hit');
              addExplosion(b.x, b.y, 5);
            }
            updateHUD();
            hitEnemy = true;
            break;
          }
        }
        if (hitEnemy) continue;
      } else {
        // Enemy bullet vs player
        if (player && player.invulnerable <= 0) {
          if (checkRectOverlap(b.x, b.y, 6, 6, player.x, player.y, player.w, player.h)) {
            bullets.splice(i, 1);
            lives--;
            addExplosion(player.x + player.w / 2, player.y + player.h / 2, 20);
            playSound('boom');
            updateHUD();
            if (lives <= 0) {
              gameOver(false, '所有坦克已损毁！战败！');
              return;
            } else {
              spawnPlayer();
            }
            continue;
          }
        }
      }
    }
  }

  function spawnPowerup(x, y) {
    var types = ['star', 'bomb', 'freeze', 'shield', 'shovel'];
    var type = types[Math.floor(Math.random() * types.length)];
    powerups.push({
      x: x,
      y: y,
      type: type,
      timer: 15 // expires in 15s
    });
  }

  function applyPowerup(type) {
    playSound('powerup');
    if (type === 'star') {
      player.level = Math.min(3, (player.level || 1) + 1);
      score += 200;
    } else if (type === 'bomb') {
      score += enemies.length * 100;
      enemies.forEach(function(e) {
        addExplosion(e.x + e.w / 2, e.y + e.h / 2, 16);
      });
      enemies = [];
      playSound('boom');
      if (remainingEnemies <= 0) {
        gameOver(true, '引爆全图，敌军全灭！');
      }
    } else if (type === 'freeze') {
      freezeTimer = 6.0; // enemies frozen for 6s
    } else if (type === 'shield') {
      player.invulnerable = 6.0;
    } else if (type === 'shovel') {
      // Reinforce base with steel temporarily
      map[11][5] = STEEL;
      map[11][6] = STEEL;
      map[11][7] = STEEL;
      map[12][5] = STEEL;
      map[12][7] = STEEL;
    }
    updateHUD();
  }

  function updateHUD() {
    baseEl.textContent = map[12] && map[12][6] === BASE ? '完好' : '破损';
    baseEl.style.color = map[12] && map[12][6] === BASE ? '#22c55e' : '#ef4444';
    enemiesEl.textContent = remainingEnemies + enemies.length;
    livesEl.textContent = lives;
    scoreEl.textContent = score;
  }

  function updatePlayer(dt) {
    if (!player) return;
    if (player.invulnerable > 0) player.invulnerable -= dt;
    if (player.cooldown > 0) player.cooldown -= dt;

    var moveX = 0;
    var moveY = 0;
    var targetDir = -1;

    if (keys['ArrowUp'] || keys['KeyW'] || keys['btnUp']) {
      moveY = -1;
      targetDir = 0;
    } else if (keys['ArrowDown'] || keys['KeyS'] || keys['btnDown']) {
      moveY = 1;
      targetDir = 2;
    } else if (keys['ArrowLeft'] || keys['KeyA'] || keys['btnLeft']) {
      moveX = -1;
      targetDir = 3;
    } else if (keys['ArrowRight'] || keys['KeyD'] || keys['btnRight']) {
      moveX = 1;
      targetDir = 1;
    }

    if (targetDir !== -1) {
      player.dir = targetDir;
      var dist = player.speed * dt;
      var nextX = player.x + moveX * dist;
      var nextY = player.y + moveY * dist;

      // Align to grid perpendicular to movement for smoother sliding through narrow alleys
      if (moveX !== 0) {
        var alignedY = Math.round(player.y / TILE_SIZE) * TILE_SIZE;
        if (Math.abs(player.y - alignedY) < TILE_SIZE * 0.3) {
          player.y = alignedY;
        }
      }
      if (moveY !== 0) {
        var alignedX = Math.round(player.x / TILE_SIZE) * TILE_SIZE;
        if (Math.abs(player.x - alignedX) < TILE_SIZE * 0.3) {
          player.x = alignedX;
        }
      }

      if (canMoveTo(nextX, player.y, player.w, player.h, player)) {
        player.x = nextX;
      }
      if (canMoveTo(player.x, nextY, player.w, player.h, player)) {
        player.y = nextY;
      }
    }

    // Fire
    if ((keys['Space'] || keys['KeyJ'] || keys['btnFire']) && player.cooldown <= 0) {
      fireBullet(player, true);
      player.cooldown = player.level >= 2 ? 0.25 : 0.4;
    }

    // Collect powerups
    for (var pIdx = powerups.length - 1; pIdx >= 0; pIdx--) {
      var p = powerups[pIdx];
      if (checkRectOverlap(player.x, player.y, player.w, player.h, p.x, p.y, TILE_SIZE, TILE_SIZE)) {
        applyPowerup(p.type);
        powerups.splice(pIdx, 1);
      }
    }
  }

  function updateEnemies(dt) {
    if (freezeTimer > 0) {
      freezeTimer -= dt;
      return;
    }

    spawnTimer += dt;
    if (spawnTimer >= 2.5) {
      spawnTimer = 0;
      spawnEnemy();
    }

    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      e.changeDirTimer -= dt;
      e.cooldown -= dt;

      // Decide direction
      if (e.changeDirTimer <= 0) {
        e.changeDirTimer = Math.random() * 2 + 1;
        // Bias movement towards bottom (base/player)
        var roll = Math.random();
        if (roll < 0.45) e.dir = 2; // down
        else if (roll < 0.65) e.dir = 1; // right
        else if (roll < 0.85) e.dir = 3; // left
        else e.dir = 0; // up
      }

      var dir = DIRS[e.dir];
      var dist = e.speed * dt;
      var nx = e.x + dir.x * dist;
      var ny = e.y + dir.y * dist;

      if (canMoveTo(nx, ny, e.w, e.h, e)) {
        e.x = nx;
        e.y = ny;
      } else {
        // Change direction immediately if bumped
        e.changeDirTimer = 0;
        e.dir = Math.floor(Math.random() * 4);
      }

      // Shoot
      if (e.cooldown <= 0) {
        fireBullet(e, false);
        e.cooldown = Math.random() * 1.5 + 1.2;
      }
    }
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }

    for (var j = powerups.length - 1; j >= 0; j--) {
      powerups[j].timer -= dt;
      if (powerups[j].timer <= 0) {
        powerups.splice(j, 1);
      }
    }
  }

  // --- Rendering ---
  function render() {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Map Tiles
    for (var r = 0; r < GRID_SIZE; r++) {
      for (var c = 0; c < GRID_SIZE; c++) {
        var tile = map[r][c];
        var tx = c * TILE_SIZE;
        var ty = r * TILE_SIZE;

        if (tile === BRICK) {
          ctx.fillStyle = '#b45309';
          ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = '#78350f';
          // Brick seams
          ctx.fillRect(tx, ty + TILE_SIZE * 0.48, TILE_SIZE, 2);
          ctx.fillRect(tx + TILE_SIZE * 0.48, ty, 2, TILE_SIZE * 0.48);
          ctx.fillRect(tx + TILE_SIZE * 0.25, ty + TILE_SIZE * 0.5, 2, TILE_SIZE * 0.5);
          ctx.fillRect(tx + TILE_SIZE * 0.75, ty + TILE_SIZE * 0.5, 2, TILE_SIZE * 0.5);
        } else if (tile === STEEL) {
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = '#64748b';
          ctx.fillRect(tx + 2, ty + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(tx + 4, ty + 4, TILE_SIZE - 8, TILE_SIZE - 8);
        } else if (tile === BASE) {
          // Eagle icon
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
          ctx.font = Math.floor(TILE_SIZE * 0.8) + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🦅', tx + TILE_SIZE / 2, ty + TILE_SIZE / 2);
        } else if (tile === DESTROYED_BASE) {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
          ctx.font = Math.floor(TILE_SIZE * 0.8) + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('💥', tx + TILE_SIZE / 2, ty + TILE_SIZE / 2);
        }
      }
    }

    // 2. Draw Powerups
    powerups.forEach(function(p) {
      var icon = '⭐';
      if (p.type === 'bomb') icon = '💣';
      else if (p.type === 'freeze') icon = '⏱️';
      else if (p.type === 'shield') icon = '🛡️';
      else if (p.type === 'shovel') icon = '⛏️';

      ctx.save();
      ctx.font = Math.floor(TILE_SIZE * 0.8) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, p.x + TILE_SIZE / 2, p.y + TILE_SIZE / 2);
      ctx.restore();
    });

    // 3. Draw Player Tank
    if (player) {
      drawTank(player.x, player.y, player.w, player.h, player.dir, '#22c55e', '#15803d');
      if (player.invulnerable > 0) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x + player.w / 2, player.y + player.h / 2, player.w * 0.7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 4. Draw Enemies
    enemies.forEach(function(e) {
      drawTank(e.x, e.y, e.w, e.h, e.dir, e.color, '#991b1b');
    });

    // 5. Draw Bullets
    ctx.fillStyle = '#ffffff';
    bullets.forEach(function(b) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // 6. Draw Particles
    particles.forEach(function(p) {
      ctx.fillStyle = p.color;
      var r = (p.life / p.maxLife) * 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, r), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawTank(x, y, w, h, dir, bodyColor, barrelColor) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(DIRS[dir].angle);

    var hw = w / 2;
    var hh = h / 2;

    // Treads
    ctx.fillStyle = '#334155';
    ctx.fillRect(-hw, -hh, hw * 0.35, h);
    ctx.fillRect(hw * 0.65, -hh, hw * 0.35, h);

    // Tread lines
    ctx.fillStyle = '#1e293b';
    for (var i = -hh + 3; i < hh - 2; i += 5) {
      ctx.fillRect(-hw, i, hw * 0.35, 1.5);
      ctx.fillRect(hw * 0.65, i, hw * 0.35, 1.5);
    }

    // Chassis
    ctx.fillStyle = bodyColor;
    ctx.fillRect(-hw * 0.6, -hh * 0.7, w * 0.6, h * 0.75);

    // Turret
    ctx.fillStyle = barrelColor;
    ctx.beginPath();
    ctx.arc(0, 0, hw * 0.38, 0, Math.PI * 2);
    ctx.fill();

    // Barrel
    ctx.fillRect(-hw * 0.1, -hh * 0.95, hw * 0.2, hh * 0.95);

    ctx.restore();
  }

  function gameOver(won, message) {
    isGameOver = true;
    modalTitle.textContent = won ? '🏆 保卫大捷！' : '💥 战斗失败！';
    modalTitle.style.color = won ? '#facc15' : '#ef4444';
    modalDesc.textContent = message;
    modal.classList.remove('hidden');
    playSound(won ? 'win' : 'gameover');
  }

  function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    var dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    if (dt > 0.1) dt = 0.1; // clamp to prevent tunnel effect

    if (!isGameOver) {
      updatePlayer(dt);
      updateEnemies(dt);
      updateBullets(dt);
      updateParticles(dt);
    }

    render();
    requestAnimationFrame(gameLoop);
  }

  function restartGame() {
    isGameOver = false;
    modal.classList.add('hidden');
    lives = 3;
    score = 0;
    remainingEnemies = 12;
    enemies = [];
    bullets = [];
    particles = [];
    powerups = [];
    freezeTimer = 0;
    spawnTimer = 0;

    initMap();
    spawnPlayer();
    updateHUD();
  }

  // --- Input Bindings ---
  window.addEventListener('keydown', function(e) {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) !== -1) {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', function(e) {
    keys[e.code] = false;
  });

  function bindTouch(btn, keyName) {
    if (!btn) return;
    btn.addEventListener('touchstart', function(e) {
      e.preventDefault();
      keys[keyName] = true;
    }, { passive: false });
    btn.addEventListener('touchend', function(e) {
      e.preventDefault();
      keys[keyName] = false;
    }, { passive: false });
    btn.addEventListener('mousedown', function(e) {
      keys[keyName] = true;
    });
    btn.addEventListener('mouseup', function(e) {
      keys[keyName] = false;
    });
    btn.addEventListener('mouseleave', function(e) {
      keys[keyName] = false;
    });
  }

  bindTouch(btnUp, 'btnUp');
  bindTouch(btnDown, 'btnDown');
  bindTouch(btnLeft, 'btnLeft');
  bindTouch(btnRight, 'btnRight');
  bindTouch(btnFire, 'btnFire');

  btnRestart.addEventListener('click', restartGame);

  // Initialize
  resizeCanvas();
  restartGame();
  requestAnimationFrame(gameLoop);

})();
