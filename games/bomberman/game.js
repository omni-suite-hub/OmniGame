// games/bomberman/game.js - Classic Bomberman (炸弹人)
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

      if (type === 'plant') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'boom') {
        var bufferSize = ctx.sampleRate * 0.3;
        var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        var noise = ctx.createBufferSource();
        noise.buffer = buffer;
        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, now);
        filter.frequency.exponentialRampToValueAtTime(40, now + 0.3);
        noise.connect(filter);
        filter.connect(gain);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
        noise.start(now);
        noise.stop(now + 0.3);
      } else if (type === 'powerup') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'win') {
        [300, 400, 500, 600].forEach(function(f, idx) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'triangle';
          o.frequency.setValueAtTime(f, now + idx * 0.1);
          g.gain.setValueAtTime(0.2, now + idx * 0.1);
          g.gain.linearRampToValueAtTime(0.01, now + idx * 0.1 + 0.15);
          o.start(now + idx * 0.1);
          o.stop(now + idx * 0.1 + 0.15);
        });
      } else if (type === 'gameover') {
        [250, 200, 150, 100].forEach(function(f, idx) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(f, now + idx * 0.12);
          g.gain.setValueAtTime(0.2, now + idx * 0.12);
          g.gain.linearRampToValueAtTime(0.01, now + idx * 0.12 + 0.18);
          o.start(now + idx * 0.12);
          o.stop(now + idx * 0.12 + 0.18);
        });
      }
    } catch(e) {}
  }

  // DOM
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var monstersEl = document.getElementById('monsters-el');
  var bombsEl = document.getElementById('bombs-el');
  var fireEl = document.getElementById('fire-el');
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
  var btnBomb = document.getElementById('btn-bomb');

  // Grid setup: 13 cols x 11 rows
  var COLS = 13;
  var ROWS = 11;
  var TILE_SIZE = 36;

  var EMPTY = 0;
  var HARD_WALL = 1;
  var SOFT_WALL = 2;

  var map = [];
  var bombs = [];
  var flames = [];
  var powerups = [];
  var monsters = [];

  var player = null;
  var lives = 3;
  var score = 0;
  var isGameOver = false;
  var lastTime = 0;
  var keys = {};

  function resizeCanvas() {
    var container = document.getElementById('container');
    var maxW = container.clientWidth - 20;
    var maxH = container.clientHeight - 20;
    var scale = Math.min(maxW / (COLS * 36), maxH / (ROWS * 36), 1.3);
    scale = Math.max(0.7, scale);
    TILE_SIZE = Math.floor(36 * scale);
    canvas.width = COLS * TILE_SIZE;
    canvas.height = ROWS * TILE_SIZE;
  }
  window.addEventListener('resize', resizeCanvas);

  function initLevel() {
    map = [];
    bombs = [];
    flames = [];
    powerups = [];
    monsters = [];

    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) {
        if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
          row.push(HARD_WALL);
        } else if (r % 2 === 0 && c % 2 === 0) {
          row.push(HARD_WALL);
        } else {
          // Free area around start (1,1), (1,2), (2,1)
          if ((r <= 2 && c <= 2)) {
            row.push(EMPTY);
          } else {
            row.push(Math.random() < 0.65 ? SOFT_WALL : EMPTY);
          }
        }
      }
      map.push(row);
    }

    // Spawn player at (1, 1)
    player = {
      x: 1.5 * TILE_SIZE,
      y: 1.5 * TILE_SIZE,
      radius: TILE_SIZE * 0.38,
      speed: TILE_SIZE * 3.6,
      maxBombs: 1,
      fireRange: 1,
      invulnerable: 2.0
    };

    // Spawn 4 monsters in open areas away from player
    var monsterSpawnCandidates = [];
    for (var mr = 4; mr < ROWS - 1; mr++) {
      for (var mc = 4; mc < COLS - 1; mc++) {
        if (map[mr][mc] === EMPTY) {
          monsterSpawnCandidates.push({ r: mr, c: mc });
        }
      }
    }

    for (var m = 0; m < 4 && monsterSpawnCandidates.length > 0; m++) {
      var idx = Math.floor(Math.random() * monsterSpawnCandidates.length);
      var pos = monsterSpawnCandidates.splice(idx, 1)[0];
      monsters.push({
        x: (pos.c + 0.5) * TILE_SIZE,
        y: (pos.r + 0.5) * TILE_SIZE,
        radius: TILE_SIZE * 0.36,
        speed: TILE_SIZE * 1.8,
        dir: Math.floor(Math.random() * 4),
        changeTimer: 2.0
      });
    }

    updateHUD();
  }

  function updateHUD() {
    monstersEl.textContent = monsters.length;
    bombsEl.textContent = bombs.length + '/' + (player ? player.maxBombs : 1);
    fireEl.textContent = player ? player.fireRange : 1;
    livesEl.textContent = lives;
    scoreEl.textContent = score;
  }

  var DIRS = [
    { x: 0, y: -1 }, // 0: Up
    { x: 1, y: 0 },  // 1: Right
    { x: 0, y: 1 },  // 2: Down
    { x: -1, y: 0 }  // 3: Left
  ];

  function canMoveTo(x, y, radius, allowBombOverlap) {
    var minCol = Math.floor((x - radius) / TILE_SIZE);
    var maxCol = Math.floor((x + radius) / TILE_SIZE);
    var minRow = Math.floor((y - radius) / TILE_SIZE);
    var maxRow = Math.floor((y + radius) / TILE_SIZE);

    for (var r = minRow; r <= maxRow; r++) {
      for (var c = minCol; c <= maxCol; c++) {
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
        var t = map[r][c];
        if (t === HARD_WALL || t === SOFT_WALL) return false;

        // Bomb collision
        for (var b = 0; b < bombs.length; b++) {
          var bomb = bombs[b];
          if (bomb.col === c && bomb.row === r) {
            if (allowBombOverlap && bomb.allowPass) {
              // still walking out of planted bomb
              continue;
            }
            return false;
          }
        }
      }
    }
    return true;
  }

  function placeBomb() {
    if (!player || bombs.length >= player.maxBombs) return;
    var c = Math.floor(player.x / TILE_SIZE);
    var r = Math.floor(player.y / TILE_SIZE);

    // Check if bomb already at position
    for (var i = 0; i < bombs.length; i++) {
      if (bombs[i].col === c && bombs[i].row === r) return;
    }

    bombs.push({
      col: c,
      row: r,
      timer: 2.4,
      range: player.fireRange,
      allowPass: true
    });
    playSound('plant');
    updateHUD();
  }

  function explodeBomb(bomb) {
    playSound('boom');
    var cells = [{ c: bomb.col, r: bomb.row }];

    DIRS.forEach(function(d) {
      for (var step = 1; step <= bomb.range; step++) {
        var nc = bomb.col + d.x * step;
        var nr = bomb.row + d.y * step;

        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) break;
        var t = map[nr][nc];
        if (t === HARD_WALL) break; // blocked

        cells.push({ c: nc, r: nr });

        if (t === SOFT_WALL) {
          map[nr][nc] = EMPTY;
          score += 20;
          // Spawn powerup chance (30%)
          if (Math.random() < 0.35) {
            var pTypes = ['bomb', 'fire', 'speed'];
            var pType = pTypes[Math.floor(Math.random() * pTypes.length)];
            powerups.push({ col: nc, row: nr, type: pType });
          }
          break; // blast stops after destroying soft wall
        }
      }
    });

    flames.push({
      cells: cells,
      timer: 0.5
    });

    // Chain reaction with other bombs
    for (var i = bombs.length - 1; i >= 0; i--) {
      var other = bombs[i];
      if (other !== bomb) {
        for (var cIdx = 0; cIdx < cells.length; cIdx++) {
          if (cells[cIdx].c === other.col && cells[cIdx].r === other.row) {
            other.timer = 0.05; // explode almost immediately
          }
        }
      }
    }
  }

  function updateBombs(dt) {
    for (var i = bombs.length - 1; i >= 0; i--) {
      var b = bombs[i];
      b.timer -= dt;

      // Check if player has stepped outside bomb tile
      if (b.allowPass && player) {
        var pc = Math.floor(player.x / TILE_SIZE);
        var pr = Math.floor(player.y / TILE_SIZE);
        if (pc !== b.col || pr !== b.row) {
          b.allowPass = false;
        }
      }

      if (b.timer <= 0) {
        bombs.splice(i, 1);
        explodeBomb(b);
        updateHUD();
      }
    }
  }

  function updateFlames(dt) {
    for (var i = flames.length - 1; i >= 0; i--) {
      var f = flames[i];
      f.timer -= dt;

      // Check damage to player
      if (player && player.invulnerable <= 0) {
        var pc = Math.floor(player.x / TILE_SIZE);
        var pr = Math.floor(player.y / TILE_SIZE);
        for (var cIdx = 0; cIdx < f.cells.length; cIdx++) {
          if (f.cells[cIdx].c === pc && f.cells[cIdx].r === pr) {
            killPlayer();
            break;
          }
        }
      }

      // Check damage to monsters
      for (var mIdx = monsters.length - 1; mIdx >= 0; mIdx--) {
        var m = monsters[mIdx];
        var mc = Math.floor(m.x / TILE_SIZE);
        var mr = Math.floor(m.y / TILE_SIZE);
        for (var fc = 0; fc < f.cells.length; fc++) {
          if (f.cells[fc].c === mc && f.cells[fc].r === mr) {
            monsters.splice(mIdx, 1);
            score += 150;
            updateHUD();
            if (monsters.length === 0) {
              gameOver(true, '消灭所有怪物！迷宫已被彻底肃清！');
            }
            break;
          }
        }
      }

      // Flames destroy powerups
      for (var pIdx = powerups.length - 1; pIdx >= 0; pIdx--) {
        var pup = powerups[pIdx];
        for (var fc2 = 0; fc2 < f.cells.length; fc2++) {
          if (f.cells[fc2].c === pup.col && f.cells[fc2].r === pup.row) {
            powerups.splice(pIdx, 1);
            break;
          }
        }
      }

      if (f.timer <= 0) {
        flames.splice(i, 1);
      }
    }
  }

  function killPlayer() {
    lives--;
    playSound('gameover');
    updateHUD();
    if (lives <= 0) {
      gameOver(false, '生命耗尽，挑战失败！');
    } else {
      player.x = 1.5 * TILE_SIZE;
      player.y = 1.5 * TILE_SIZE;
      player.invulnerable = 2.5;
    }
  }

  function updatePlayer(dt) {
    if (!player) return;
    if (player.invulnerable > 0) player.invulnerable -= dt;

    var mx = 0;
    var my = 0;
    if (keys['ArrowUp'] || keys['KeyW'] || keys['btnUp']) my -= 1;
    if (keys['ArrowDown'] || keys['KeyS'] || keys['btnDown']) my += 1;
    if (keys['ArrowLeft'] || keys['KeyA'] || keys['btnLeft']) mx -= 1;
    if (keys['ArrowRight'] || keys['KeyD'] || keys['btnRight']) mx += 1;

    if (mx !== 0 || my !== 0) {
      var dist = player.speed * dt;
      var nx = player.x + mx * dist;
      var ny = player.y + my * dist;

      // Smart corner sliding
      if (mx !== 0 && my === 0) {
        var targetRowY = (Math.floor(player.y / TILE_SIZE) + 0.5) * TILE_SIZE;
        if (Math.abs(player.y - targetRowY) < TILE_SIZE * 0.35) {
          player.y += (targetRowY - player.y) * 0.2;
        }
      }
      if (my !== 0 && mx === 0) {
        var targetColX = (Math.floor(player.x / TILE_SIZE) + 0.5) * TILE_SIZE;
        if (Math.abs(player.x - targetColX) < TILE_SIZE * 0.35) {
          player.x += (targetColX - player.x) * 0.2;
        }
      }

      if (canMoveTo(nx, player.y, player.radius, true)) player.x = nx;
      if (canMoveTo(player.x, ny, player.radius, true)) player.y = ny;
    }

    if (keys['Space'] || keys['btnBomb']) {
      keys['Space'] = false; // fire once per keydown
      keys['btnBomb'] = false;
      placeBomb();
    }

    // Collect powerups
    var pc = Math.floor(player.x / TILE_SIZE);
    var pr = Math.floor(player.y / TILE_SIZE);
    for (var i = powerups.length - 1; i >= 0; i--) {
      var pup = powerups[i];
      if (pup.col === pc && pup.row === pr) {
        playSound('powerup');
        if (pup.type === 'bomb') player.maxBombs = Math.min(5, player.maxBombs + 1);
        else if (pup.type === 'fire') player.fireRange = Math.min(5, player.fireRange + 1);
        else if (pup.type === 'speed') player.speed = Math.min(TILE_SIZE * 5.2, player.speed + TILE_SIZE * 0.4);
        score += 50;
        powerups.splice(i, 1);
        updateHUD();
      }
    }
  }

  function updateMonsters(dt) {
    for (var i = 0; i < monsters.length; i++) {
      var m = monsters[i];
      m.changeTimer -= dt;

      if (m.changeTimer <= 0) {
        m.changeTimer = Math.random() * 2 + 1;
        m.dir = Math.floor(Math.random() * 4);
      }

      var dir = DIRS[m.dir];
      var nx = m.x + dir.x * m.speed * dt;
      var ny = m.y + dir.y * m.speed * dt;

      if (canMoveTo(nx, ny, m.radius, false)) {
        m.x = nx;
        m.y = ny;
      } else {
        m.changeTimer = 0;
        m.dir = (m.dir + 1 + Math.floor(Math.random() * 3)) % 4;
      }

      // Check collision with player
      if (player && player.invulnerable <= 0) {
        var dist = Math.hypot(m.x - player.x, m.y - player.y);
        if (dist < m.radius + player.radius) {
          killPlayer();
        }
      }
    }
  }

  // --- Rendering ---
  function render() {
    ctx.fillStyle = '#14532d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Map
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var t = map[r][c];
        var x = c * TILE_SIZE;
        var y = r * TILE_SIZE;

        if (t === HARD_WALL) {
          ctx.fillStyle = '#334155';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = '#64748b';
          ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        } else if (t === SOFT_WALL) {
          ctx.fillStyle = '#b45309';
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          ctx.fillStyle = '#d97706';
          ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
        }
      }
    }

    // Powerups
    powerups.forEach(function(pup) {
      var px = (pup.col + 0.5) * TILE_SIZE;
      var py = (pup.row + 0.5) * TILE_SIZE;
      ctx.font = Math.floor(TILE_SIZE * 0.7) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var icon = pup.type === 'bomb' ? '💣' : (pup.type === 'fire' ? '🔥' : '👟');
      ctx.fillText(icon, px, py);
    });

    // Bombs
    bombs.forEach(function(b) {
      var bx = (b.col + 0.5) * TILE_SIZE;
      var by = (b.row + 0.5) * TILE_SIZE;
      var pulse = 1 + 0.15 * Math.sin(Date.now() * 0.015);

      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(pulse, pulse);

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(0, 0, TILE_SIZE * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // Fuse spark
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(TILE_SIZE * 0.2, -TILE_SIZE * 0.25, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });

    // Flames
    flames.forEach(function(f) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
      f.cells.forEach(function(cell) {
        var fx = cell.c * TILE_SIZE;
        var fy = cell.r * TILE_SIZE;
        ctx.fillRect(fx + 2, fy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(fx + 6, fy + 6, TILE_SIZE - 12, TILE_SIZE - 12);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
      });
    });

    // Monsters
    monsters.forEach(function(m) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
      ctx.fill();

      // Eyes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(m.x - 4, m.y - 3, 3, 0, Math.PI * 2);
      ctx.arc(m.x + 4, m.y - 3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(m.x - 3, m.y - 3, 1.5, 0, Math.PI * 2);
      ctx.arc(m.x + 5, m.y - 3, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Player
    if (player) {
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(player.x, player.y - player.radius * 0.2, player.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      if (player.invulnerable > 0) {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius * 1.3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function gameOver(won, msg) {
    isGameOver = true;
    modalTitle.textContent = won ? '🏆 迷宫大捷！' : '💥 挑战结束';
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
      updatePlayer(dt);
      updateMonsters(dt);
      updateBombs(dt);
      updateFlames(dt);
    }

    render();
    requestAnimationFrame(gameLoop);
  }

  function restartGame() {
    isGameOver = false;
    modal.classList.add('hidden');
    lives = 3;
    score = 0;
    initLevel();
  }

  // Bindings
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
    btn.addEventListener('mousedown', function() { keys[keyName] = true; });
    btn.addEventListener('mouseup', function() { keys[keyName] = false; });
  }

  bindTouch(btnUp, 'btnUp');
  bindTouch(btnDown, 'btnDown');
  bindTouch(btnLeft, 'btnLeft');
  bindTouch(btnRight, 'btnRight');
  bindTouch(btnBomb, 'btnBomb');

  btnRestart.addEventListener('click', restartGame);

  resizeCanvas();
  restartGame();
  requestAnimationFrame(gameLoop);

})();
