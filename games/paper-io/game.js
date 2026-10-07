(function () {
  'use strict';

  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var container = document.getElementById('container');

  var pctEl = document.getElementById('pct-el');
  var killsEl = document.getElementById('kills-el');
  var deathModal = document.getElementById('death-modal');
  var deathStat = document.getElementById('death-stat');
  var btnRespawn = document.getElementById('btn-respawn');

  var audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playSound(type) {
    try {
      var actx = getAudioCtx();
      var now = actx.currentTime;
      var osc = actx.createOscillator();
      var gain = actx.createGain();
      osc.connect(gain);
      gain.connect(actx.destination);

      if (type === 'capture') {
        [523, 659, 784, 1046].forEach(function (f, i) {
          var o = actx.createOscillator();
          var g = actx.createGain();
          o.frequency.setValueAtTime(f, now + i * 0.06);
          g.gain.setValueAtTime(0.12, now + i * 0.06);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.2);
          o.connect(g);
          g.connect(actx.destination);
          o.start(now + i * 0.06);
          o.stop(now + i * 0.06 + 0.2);
        });
      } else if (type === 'kill') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch (e) {}
  }

  var GRID_SIZE = 60;
  var TILE_PIXELS = 10;

  var V_WIDTH = GRID_SIZE * TILE_PIXELS;
  var V_HEIGHT = GRID_SIZE * TILE_PIXELS;

  function resize() {
    var rect = container.getBoundingClientRect();
    var scale = Math.min(rect.width / V_WIDTH, rect.height / V_HEIGHT, 1.2);
    canvas.width = V_WIDTH;
    canvas.height = V_HEIGHT;
    canvas.style.width = (V_WIDTH * scale) + 'px';
    canvas.style.height = (V_HEIGHT * scale) + 'px';
  }
  window.addEventListener('resize', resize);

  var COLORS = {
    0: '#0f172a', // empty
    1: '#0284c7', // player
    2: '#dc2626', // bot 1
    3: '#eab308', // bot 2
    4: '#16a34a'  // bot 3
  };

  var TRAIL_COLORS = {
    1: '#38bdf8',
    2: '#f87171',
    3: '#fde047',
    4: '#4ade80'
  };

  var grid = [];
  var player = null;
  var bots = [];
  var kills = 0;
  var bestPct = 0;

  function initGrid() {
    grid = [];
    for (var r = 0; r < GRID_SIZE; r++) {
      var row = [];
      for (var c = 0; c < GRID_SIZE; c++) {
        row.push(0);
      }
      grid.push(row);
    }
  }

  function spawnEntity(id, startX, startY) {
    // Carve 4x4 initial territory
    for (var r = startY - 2; r <= startY + 2; r++) {
      for (var c = startX - 2; c <= startX + 2; c++) {
        if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
          grid[r][c] = id;
        }
      }
    }

    return {
      id: id,
      x: startX,
      y: startY,
      dx: 0,
      dy: -1,
      nextDx: 0,
      nextDy: -1,
      trail: [],
      alive: true
    };
  }

  function initGame() {
    initGrid();
    kills = 0;
    bestPct = 0;
    deathModal.classList.add('hidden');

    player = spawnEntity(1, 15, 15);
    bots = [
      spawnEntity(2, 45, 15),
      spawnEntity(3, 15, 45),
      spawnEntity(4, 45, 45)
    ];

    updateHUD();
  }

  function setupInput() {
    function setPlayerDir(dx, dy) {
      getAudioCtx();
      if (!player.alive) return;
      if (player.dx === -dx && player.dy === -dy) return; // cannot reverse 180
      player.nextDx = dx;
      player.nextDy = dy;
    }

    window.addEventListener('keydown', function (e) {
      if (['ArrowUp', 'KeyW'].indexOf(e.code) >= 0) setPlayerDir(0, -1);
      else if (['ArrowDown', 'KeyS'].indexOf(e.code) >= 0) setPlayerDir(0, 1);
      else if (['ArrowLeft', 'KeyA'].indexOf(e.code) >= 0) setPlayerDir(-1, 0);
      else if (['ArrowRight', 'KeyD'].indexOf(e.code) >= 0) setPlayerDir(1, 0);
    });

    document.getElementById('btn-up').addEventListener('click', function () { setPlayerDir(0, -1); });
    document.getElementById('btn-down').addEventListener('click', function () { setPlayerDir(0, 1); });
    document.getElementById('btn-left').addEventListener('click', function () { setPlayerDir(-1, 0); });
    document.getElementById('btn-right').addEventListener('click', function () { setPlayerDir(1, 0); });
    btnRespawn.addEventListener('click', initGame);
  }

  function updateEntity(ent) {
    if (!ent.alive) return;

    ent.dx = ent.nextDx;
    ent.dy = ent.nextDy;

    ent.x += ent.dx;
    ent.y += ent.dy;

    // Hit border
    if (ent.x < 0 || ent.x >= GRID_SIZE || ent.y < 0 || ent.y >= GRID_SIZE) {
      killEntity(ent);
      return;
    }

    // Current cell
    var onCell = grid[ent.y][ent.x];

    if (onCell === ent.id) {
      // Returned home!
      if (ent.trail.length > 0) {
        // Enclose and capture territory
        captureTerritory(ent);
        if (ent.id === 1) playSound('capture');
      }
    } else {
      // Outside territory, add to active trail
      // Self trail collision check
      var hitSelf = ent.trail.some(function (p) { return p.x === ent.x && p.y === ent.y; });
      if (hitSelf) {
        killEntity(ent);
        return;
      }
      ent.trail.push({ x: ent.x, y: ent.y });
    }
  }

  function captureTerritory(ent) {
    // Add all trail cells
    ent.trail.forEach(function (p) {
      grid[p.y][p.x] = ent.id;
    });

    // Fill bounding box
    var minX = ent.x;
    var maxX = ent.x;
    var minY = ent.y;
    var maxY = ent.y;

    ent.trail.forEach(function (p) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    for (var r = minY; r <= maxY; r++) {
      for (var c = minX; c <= maxX; c++) {
        if (Math.random() < 0.65) {
          grid[r][c] = ent.id;
        }
      }
    }

    ent.trail = [];
    updateHUD();
  }

  function killEntity(ent) {
    ent.alive = false;
    ent.trail = [];
    // Clear its territory
    for (var r = 0; r < GRID_SIZE; r++) {
      for (var c = 0; c < GRID_SIZE; c++) {
        if (grid[r][c] === ent.id) grid[r][c] = 0;
      }
    }

    if (ent.id === 1) {
      playSound('kill');
      deathStat.textContent = '最高占地: ' + bestPct.toFixed(1) + '% | 击杀: ' + kills;
      deathModal.classList.remove('hidden');
    }
  }

  function checkTrailCuts() {
    var all = [player].concat(bots);

    all.forEach(function (hunter) {
      if (!hunter.alive) return;

      all.forEach(function (target) {
        if (!target.alive || hunter.id === target.id) return;

        // If hunter head intersects target's active trail
        var cut = target.trail.some(function (pt) { return pt.x === hunter.x && pt.y === hunter.y; });
        if (cut) {
          killEntity(target);
          if (hunter.id === 1) {
            kills++;
            playSound('kill');
            killsEl.textContent = kills;
          }
        }
      });
    });
  }

  function updateHUD() {
    var pCount = 0;
    for (var r = 0; r < GRID_SIZE; r++) {
      for (var c = 0; c < GRID_SIZE; c++) {
        if (grid[r][c] === 1) pCount++;
      }
    }
    var pct = (pCount / (GRID_SIZE * GRID_SIZE)) * 100;
    if (pct > bestPct) bestPct = pct;
    pctEl.textContent = pct.toFixed(1) + '%';
  }

  function updateBotsAI() {
    bots.forEach(function (b) {
      if (!b.alive) return;

      // Smart turn: avoid borders, turn back home when trail gets long
      if (b.trail.length > 10) {
        // steer towards initial spawn
        var homeX = b.id === 2 ? 45 : (b.id === 3 ? 15 : 45);
        var homeY = b.id === 2 ? 15 : (b.id === 3 ? 45 : 45);
        if (homeX > b.x && b.dx !== -1) { b.nextDx = 1; b.nextDy = 0; }
        else if (homeX < b.x && b.dx !== 1) { b.nextDx = -1; b.nextDy = 0; }
        else if (homeY > b.y && b.dy !== -1) { b.nextDx = 0; b.nextDy = 1; }
        else if (homeY < b.y && b.dy !== 1) { b.nextDx = 0; b.nextDy = -1; }
      } else if (Math.random() < 0.15) {
        var dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
        var valid = dirs.filter(function (d) {
          return !(d.dx === -b.dx && d.dy === -b.dy);
        });
        var pick = valid[Math.floor(Math.random() * valid.length)];
        b.nextDx = pick.dx;
        b.nextDy = pick.dy;
      }
    });
  }

  function draw() {
    ctx.clearRect(0, 0, V_WIDTH, V_HEIGHT);

    // Draw territory grid
    for (var r = 0; r < GRID_SIZE; r++) {
      for (var c = 0; c < GRID_SIZE; c++) {
        var val = grid[r][c];
        ctx.fillStyle = COLORS[val] || '#0f172a';
        ctx.fillRect(c * TILE_PIXELS, r * TILE_PIXELS, TILE_PIXELS, TILE_PIXELS);
      }
    }

    // Draw trails
    var all = [player].concat(bots);
    all.forEach(function (ent) {
      if (ent.alive && ent.trail.length > 0) {
        ctx.fillStyle = TRAIL_COLORS[ent.id];
        ent.trail.forEach(function (p) {
          ctx.fillRect(p.x * TILE_PIXELS + 1, p.y * TILE_PIXELS + 1, TILE_PIXELS - 2, TILE_PIXELS - 2);
        });
      }
    });

    // Draw entity heads
    all.forEach(function (ent) {
      if (ent.alive) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ent.x * TILE_PIXELS - 1, ent.y * TILE_PIXELS - 1, TILE_PIXELS + 2, TILE_PIXELS + 2);
        ctx.fillStyle = COLORS[ent.id];
        ctx.fillRect(ent.x * TILE_PIXELS, ent.y * TILE_PIXELS, TILE_PIXELS, TILE_PIXELS);
      }
    });
  }

  var tickInterval = setInterval(function () {
    if (player && player.alive) {
      updateEntity(player);
      updateBotsAI();
      bots.forEach(updateEntity);
      checkTrailCuts();
      draw();
    }
  }, 120);

  resize();
  setupInput();
  initGame();
  draw();
})();
