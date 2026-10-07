(function () {
  'use strict';

  var canvas = document.getElementById('dungeon-canvas');
  var ctx = canvas.getContext('2d');
  var hpEl = document.getElementById('hp-el');
  var atkEl = document.getElementById('atk-el');
  var floorEl = document.getElementById('floor-el');
  var goldEl = document.getElementById('gold-el');
  var logEl = document.getElementById('combat-log');

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

      if (type === 'hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'potion') {
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.setValueAtTime(659, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'stairs') {
        [523, 659, 784, 1046].forEach(function (f, i) {
          var o = actx.createOscillator();
          var g = actx.createGain();
          o.frequency.setValueAtTime(f, now + i * 0.08);
          g.gain.setValueAtTime(0.15, now + i * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
          o.connect(g);
          g.connect(actx.destination);
          o.start(now + i * 0.08);
          o.stop(now + i * 0.08 + 0.25);
        });
      }
    } catch (e) {}
  }

  var COLS = 16;
  var ROWS = 12;
  var TILE_SIZE = 36;

  canvas.width = COLS * TILE_SIZE;
  canvas.height = ROWS * TILE_SIZE;

  var player = {
    x: 2,
    y: 2,
    hp: 100,
    maxHp: 100,
    atk: 15,
    gold: 0
  };

  var currentFloor = 1;
  var map = [];
  var seen = [];
  var monsters = [];
  var items = [];
  var stairs = { x: 14, y: 10 };

  function log(msg) {
    logEl.textContent = msg;
  }

  function generateDungeon() {
    map = [];
    seen = [];
    monsters = [];
    items = [];

    // Fill with walls
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      var sRow = [];
      for (var c = 0; c < COLS; c++) {
        row.push('#');
        sRow.push(false);
      }
      map.push(row);
      seen.push(sRow);
    }

    // Carve 3 interconnected rooms
    function carveRoom(x, y, w, h) {
      for (var rr = y; rr < y + h && rr < ROWS - 1; rr++) {
        for (var cc = x; cc < x + w && cc < COLS - 1; cc++) {
          map[rr][cc] = '.';
        }
      }
    }

    carveRoom(1, 1, 5, 4);
    carveRoom(6, 4, 5, 5);
    carveRoom(10, 7, 5, 4);

    // Corridors
    for (var c1 = 3; c1 <= 8; c1++) map[3][c1] = '.';
    for (var r1 = 3; r1 <= 6; r1++) map[r1][8] = '.';
    for (var c2 = 8; c2 <= 12; c2++) map[6][c2] = '.';
    for (var r2 = 6; r2 <= 9; r2++) map[r2][12] = '.';

    player.x = 2;
    player.y = 2;
    stairs = { x: 13, y: 9 };

    // Spawn monsters
    if (currentFloor === 3) {
      monsters.push({ x: 12, y: 8, name: '炎魔巨兽', icon: '🐉', hp: 90, atk: 15 });
    } else {
      monsters.push({ x: 8, y: 6, name: '哥布林', icon: '👺', hp: 25, atk: 6 });
      monsters.push({ x: 11, y: 8, name: '骷髅弓手', icon: '💀', hp: 35, atk: 8 });
    }

    // Spawn items
    items.push({ x: 4, y: 2, type: 'potion', icon: '🧪' });
    items.push({ x: 8, y: 4, type: 'chest', icon: '📦' });

    updateVisibility();
    updateHUD();
  }

  function updateVisibility() {
    var radius = 4;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (Math.hypot(c - player.x, r - player.y) <= radius) {
          seen[r][c] = true;
        }
      }
    }
  }

  function updateHUD() {
    hpEl.textContent = player.hp + ' / ' + player.maxHp;
    atkEl.textContent = player.atk;
    floorEl.textContent = currentFloor + ' 层';
    goldEl.textContent = player.gold;
  }

  function tryMove(dx, dy) {
    getAudioCtx();
    var nx = player.x + dx;
    var ny = player.y + dy;

    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || map[ny][nx] === '#') {
      return;
    }

    // Check monster attack
    var monster = monsters.find(function (m) { return m.x === nx && m.y === ny && m.hp > 0; });
    if (monster) {
      // Attack monster!
      monster.hp -= player.atk;
      playSound('hit');
      log('你挥剑对 ' + monster.name + ' 造成了 ' + player.atk + ' 点暴击伤害！');
      if (monster.hp <= 0) {
        log('你击败了 ' + monster.name + '！魔物灰飞烟灭。');
      }
    } else {
      // Step
      player.x = nx;
      player.y = ny;

      // Pick items
      for (var i = items.length - 1; i >= 0; i--) {
        var it = items[i];
        if (it.x === player.x && it.y === player.y) {
          if (it.type === 'potion') {
            player.hp = Math.min(player.maxHp, player.hp + 35);
            playSound('potion');
            log('咕嘟咕嘟！你饮用了治愈药水，恢复 35 HP！');
          } else if (it.type === 'chest') {
            player.gold += 30;
            playSound('potion');
            log('你打开了宝箱，搜得 30 枚金币！');
          }
          items.splice(i, 1);
        }
      }

      // Check stairs
      if (player.x === stairs.x && player.y === stairs.y) {
        if (currentFloor >= 3) {
          playSound('stairs');
          alert('🏆 凯旋！你消灭了地牢魔龙，完成了全部 3 层深渊冒险！');
          currentFloor = 1;
          player.hp = player.maxHp;
          player.gold = 0;
          generateDungeon();
          draw();
          return;
        } else {
          currentFloor++;
          playSound('stairs');
          log('你沿着幽暗石阶进入地下第 ' + currentFloor + ' 层！');
          generateDungeon();
          draw();
          return;
        }
      }
    }

    // Monsters turn
    monsters.forEach(function (m) {
      if (m.hp > 0) {
        var dist = Math.hypot(m.x - player.x, m.y - player.y);
        if (dist === 1) {
          // Attack player
          player.hp -= m.atk;
          playSound('hit');
          log(m.name + ' 反击命中！你受到 ' + m.atk + ' 点伤害！');
          if (player.hp <= 0) {
            alert('💀 英雄战死沙场！正在重返第 1 层地牢...');
            currentFloor = 1;
            player.hp = player.maxHp;
            generateDungeon();
          }
        } else if (dist < 4) {
          // Move towards player
          var mx = m.x + (player.x > m.x ? 1 : (player.x < m.x ? -1 : 0));
          var my = m.y + (player.y > m.y ? 1 : (player.y < m.y ? -1 : 0));
          if (map[my][mx] === '.' && !(mx === player.x && my === player.y)) {
            m.x = mx;
            m.y = my;
          }
        }
      }
    });

    updateVisibility();
    updateHUD();
    draw();
  }

  function draw() {
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var x = c * TILE_SIZE;
        var y = r * TILE_SIZE;

        if (!seen[r][c]) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          continue;
        }

        if (map[r][c] === '#') {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = '#334155';
          ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
        } else {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = '#1e293b';
          ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // Draw stairs
    if (seen[stairs.y][stairs.x]) {
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚪', stairs.x * TILE_SIZE + 18, stairs.y * TILE_SIZE + 26);
    }

    // Draw items
    items.forEach(function (it) {
      if (seen[it.y][it.x]) {
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(it.icon, it.x * TILE_SIZE + 18, it.y * TILE_SIZE + 26);
      }
    });

    // Draw monsters
    monsters.forEach(function (m) {
      if (m.hp > 0 && seen[m.y][m.x]) {
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(m.icon, m.x * TILE_SIZE + 18, m.y * TILE_SIZE + 26);
      }
    });

    // Draw player
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🧙‍♂️', player.x * TILE_SIZE + 18, player.y * TILE_SIZE + 27);
  }

  window.addEventListener('keydown', function (e) {
    if (['ArrowUp', 'KeyW'].indexOf(e.code) >= 0) tryMove(0, -1);
    else if (['ArrowDown', 'KeyS'].indexOf(e.code) >= 0) tryMove(0, 1);
    else if (['ArrowLeft', 'KeyA'].indexOf(e.code) >= 0) tryMove(-1, 0);
    else if (['ArrowRight', 'KeyD'].indexOf(e.code) >= 0) tryMove(1, 0);
  });

  document.getElementById('btn-up').addEventListener('click', function () { tryMove(0, -1); });
  document.getElementById('btn-down').addEventListener('click', function () { tryMove(0, 1); });
  document.getElementById('btn-left').addEventListener('click', function () { tryMove(-1, 0); });
  document.getElementById('btn-right').addEventListener('click', function () { tryMove(1, 0); });

  generateDungeon();
  draw();
})();
