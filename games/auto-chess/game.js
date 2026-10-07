// games/auto-chess/game.js - Minimalist Auto Chess (极简自走棋)
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

      if (type === 'buy') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.exponentialRampToValueAtTime(1046, now + 0.08);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'upgrade') {
        [523, 659, 784, 1046].forEach(function(f, idx) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'triangle';
          o.frequency.setValueAtTime(f, now + idx * 0.06);
          g.gain.setValueAtTime(0.2, now + idx * 0.06);
          g.gain.linearRampToValueAtTime(0.01, now + idx * 0.06 + 0.1);
          o.start(now + idx * 0.06);
          o.stop(now + idx * 0.06 + 0.1);
        });
      } else if (type === 'slash') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'magic') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.2);
        gain.gain.setValueAtTime(0.25, now);
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
      }
    } catch(e) {}
  }

  // DOM
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var hpEl = document.getElementById('hp-el');
  var goldEl = document.getElementById('gold-el');
  var roundEl = document.getElementById('round-el');
  var phaseEl = document.getElementById('phase-el');
  var shopCardsEl = document.getElementById('shop-cards');
  var btnReroll = document.getElementById('btn-reroll');
  var btnFight = document.getElementById('btn-fight');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc = document.getElementById('modal-desc');
  var btnRestart = document.getElementById('btn-restart');

  var COLS = 4;
  var ROWS = 6; // Rows 0..2 = Enemy, Rows 3..5 = Player
  var CELL_SIZE = 64;

  var HERO_DEFS = {
    warrior:  { name: '重装战士', icon: '🛡️', hp: 380, atk: 28, range: 1, cost: 2 },
    ranger:   { name: '寒冰射手', icon: '🏹', hp: 220, atk: 40, range: 3, cost: 3 },
    mage:     { name: '元素法王', icon: '🧙', hp: 190, atk: 26, range: 2, cost: 2 },
    assassin: { name: '暗影刺客', icon: '🗡️', hp: 240, atk: 48, range: 1, cost: 3 }
  };

  function resizeCanvas() {
    var container = document.getElementById('container');
    var maxW = container.clientWidth - 20;
    var maxH = container.clientHeight - 20;
    var scale = Math.min(maxW / (COLS * 64), maxH / ((ROWS + 1.2) * 64), 1.2);
    scale = Math.max(0.65, scale);
    CELL_SIZE = Math.floor(64 * scale);
    canvas.width = COLS * CELL_SIZE;
    canvas.height = Math.floor((ROWS + 1.2) * CELL_SIZE);
  }
  window.addEventListener('resize', resizeCanvas);

  var playerHp = 100;
  var gold = 10;
  var currentRound = 1;
  var maxRounds = 5;
  var isCombatPhase = false;
  var isGameOver = false;
  var lastTime = 0;

  var shopOffers = [];
  var benchHeroes = []; // up to 4 heroes
  var boardHeroes = []; // placed on board rows 3..5
  var combatUnits = []; // runtime units during battle
  var particles = [];

  var selectedUnit = null; // for dragging / placing on board

  function initGame() {
    playerHp = 100;
    gold = 10;
    currentRound = 1;
    isCombatPhase = false;
    isGameOver = false;
    benchHeroes = [];
    boardHeroes = [];
    combatUnits = [];
    particles = [];

    rerollShop(true);
    setupEnemyUnitsForRound(1);
    updateHUD();
  }

  function rerollShop(isFree) {
    if (!isFree && gold < 2) return;
    if (!isFree) gold -= 2;

    var keys = Object.keys(HERO_DEFS);
    shopOffers = [];
    for (var i = 0; i < 3; i++) {
      var randType = keys[Math.floor(Math.random() * keys.length)];
      shopOffers.push(randType);
    }

    renderShop();
    updateHUD();
  }

  function renderShop() {
    shopCardsEl.innerHTML = '';
    shopOffers.forEach(function(type, idx) {
      if (!type) return;
      var def = HERO_DEFS[type];
      var card = document.createElement('div');
      card.className = 'hero-card';
      card.innerHTML = '<span class="icon">' + def.icon + '</span><span>' + def.name + '</span><span class="cost">$' + def.cost + '</span>';
      card.addEventListener('click', function() { buyHero(idx); });
      shopCardsEl.appendChild(card);
    });
  }

  function buyHero(shopIndex) {
    var type = shopOffers[shopIndex];
    if (!type || isCombatPhase) return;
    var def = HERO_DEFS[type];
    if (gold < def.cost || benchHeroes.length >= 4) return;

    gold -= def.cost;
    shopOffers[shopIndex] = null;
    playSound('buy');

    var newHero = {
      type: type,
      stars: 1,
      hp: def.hp,
      maxHp: def.hp,
      atk: def.atk,
      range: def.range,
      isPlayer: true
    };

    benchHeroes.push(newHero);
    checkStarCombination();
    renderShop();
    updateHUD();
    render();
  }

  function checkStarCombination() {
    // Collect all player units (bench + board)
    var allUnits = benchHeroes.concat(boardHeroes);
    var counts = {};

    allUnits.forEach(function(u) {
      if (u.stars === 1) {
        counts[u.type] = (counts[u.type] || 0) + 1;
      }
    });

    Object.keys(counts).forEach(function(t) {
      if (counts[t] >= 3) {
        // Upgrade to 2 stars!
        playSound('upgrade');
        var removed = 0;

        // Remove 2 units of this type
        for (var b = benchHeroes.length - 1; b >= 0 && removed < 2; b--) {
          if (benchHeroes[b].type === t && benchHeroes[b].stars === 1) {
            benchHeroes.splice(b, 1);
            removed++;
          }
        }
        for (var bd = boardHeroes.length - 1; bd >= 0 && removed < 2; bd--) {
          if (boardHeroes[bd].type === t && boardHeroes[bd].stars === 1) {
            boardHeroes.splice(bd, 1);
            removed++;
          }
        }

        // Upgrade remaining one unit
        var targetToUpgrade = allUnits.find(function(u) { return u.type === t && u.stars === 1; });
        if (targetToUpgrade) {
          targetToUpgrade.stars = 2;
          targetToUpgrade.maxHp = Math.floor(targetToUpgrade.maxHp * 2.2);
          targetToUpgrade.hp = targetToUpgrade.maxHp;
          targetToUpgrade.atk = Math.floor(targetToUpgrade.atk * 2.0);
        }
      }
    });
  }

  function setupEnemyUnitsForRound(rnd) {
    // Clear old enemies from combatUnits
    var enemies = [];

    if (rnd === 1) {
      enemies.push(createUnit('warrior', 1, 1, 1, false));
      enemies.push(createUnit('mage', 2, 0, 1, false));
    } else if (rnd === 2) {
      enemies.push(createUnit('warrior', 1, 1, 1, false));
      enemies.push(createUnit('assassin', 2, 1, 1, false));
      enemies.push(createUnit('ranger', 1, 0, 1, false));
    } else if (rnd === 3) {
      enemies.push(createUnit('warrior', 1, 1, 2, false)); // 2-star warrior!
      enemies.push(createUnit('ranger', 2, 0, 1, false));
      enemies.push(createUnit('mage', 3, 0, 1, false));
    } else if (rnd === 4) {
      enemies.push(createUnit('warrior', 0, 1, 2, false));
      enemies.push(createUnit('assassin', 2, 1, 2, false));
      enemies.push(createUnit('ranger', 1, 0, 2, false));
      enemies.push(createUnit('mage', 3, 0, 2, false));
    } else {
      // Final Boss Team
      enemies.push(createUnit('warrior', 1, 1, 2, false));
      enemies.push(createUnit('warrior', 2, 1, 2, false));
      enemies.push(createUnit('assassin', 0, 1, 2, false));
      enemies.push(createUnit('ranger', 1, 0, 2, false));
      enemies.push(createUnit('mage', 2, 0, 2, false));
    }

    combatUnits = enemies;
  }

  function createUnit(type, col, row, stars, isPlayer) {
    var def = HERO_DEFS[type];
    var hp = stars === 2 ? Math.floor(def.hp * 2.2) : def.hp;
    var atk = stars === 2 ? Math.floor(def.atk * 2.0) : def.atk;

    return {
      type: type,
      col: col,
      row: row,
      x: (col + 0.5) * CELL_SIZE,
      y: (row + 0.5) * CELL_SIZE,
      stars: stars,
      hp: hp,
      maxHp: hp,
      atk: atk,
      range: def.range,
      isPlayer: isPlayer,
      mana: 0,
      attackCooldown: 0.5
    };
  }

  function startCombat() {
    if (boardHeroes.length === 0 || isCombatPhase || isGameOver) return;
    isCombatPhase = true;
    btnFight.disabled = true;
    phaseEl.textContent = '战斗结算中...';
    phaseEl.style.color = '#ef4444';

    // Populate combat units with player board units
    var playerCombat = boardHeroes.map(function(h) {
      return createUnit(h.type, h.col, h.row, h.stars, true);
    });

    combatUnits = combatUnits.filter(function(u) { return !u.isPlayer; }).concat(playerCombat);
  }

  function updateCombatPhysics(dt) {
    if (!isCombatPhase) return;

    var playerUnits = combatUnits.filter(function(u) { return u.isPlayer && u.hp > 0; });
    var enemyUnits = combatUnits.filter(function(u) { return !u.isPlayer && u.hp > 0; });

    // Check battle outcome
    if (enemyUnits.length === 0) {
      endRound(true);
      return;
    }
    if (playerUnits.length === 0) {
      endRound(false, enemyUnits.length);
      return;
    }

    // AI logic for each living unit
    combatUnits.forEach(function(u) {
      if (u.hp <= 0) return;
      u.attackCooldown -= dt;

      var enemies = u.isPlayer ? enemyUnits : playerUnits;
      if (enemies.length === 0) return;

      // Find closest enemy
      var target = null;
      var minDist = 9999;
      enemies.forEach(function(em) {
        var d = Math.hypot(em.x - u.x, em.y - u.y);
        if (d < minDist) {
          minDist = d;
          target = em;
        }
      });

      var attackDist = u.range * CELL_SIZE;

      if (minDist <= attackDist) {
        // Attack target
        if (u.attackCooldown <= 0) {
          u.attackCooldown = 0.9;
          u.mana += 35;

          // Check Ultimate Cast
          if (u.mana >= 100) {
            u.mana = 0;
            castUltimate(u, target);
          } else {
            // Normal Attack
            target.hp -= u.atk;
            playSound('slash');
            addSlashParticles(target.x, target.y);
          }
        }
      } else {
        // Move towards target
        var speed = 70;
        var dx = target.x - u.x;
        var dy = target.y - u.y;
        u.x += (dx / minDist) * speed * dt;
        u.y += (dy / minDist) * speed * dt;
      }
    });

    // Update Particles
    for (var pi = particles.length - 1; pi >= 0; pi--) {
      var p = particles[pi];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(pi, 1);
    }
  }

  function castUltimate(caster, target) {
    playSound('magic');
    if (caster.type === 'warrior') {
      // AOE whirlwind spin
      combatUnits.forEach(function(oth) {
        if (oth.isPlayer !== caster.isPlayer && Math.hypot(oth.x - caster.x, oth.y - caster.y) < CELL_SIZE * 1.8) {
          oth.hp -= caster.atk * 2.5;
        }
      });
      addMagicParticles(caster.x, caster.y, '#f59e0b');
    } else if (caster.type === 'mage') {
      // Lightning storm
      target.hp -= caster.atk * 3.5;
      addMagicParticles(target.x, target.y, '#38bdf8');
    } else if (caster.type === 'ranger') {
      // Frost Arrow
      target.hp -= caster.atk * 2.8;
      addMagicParticles(target.x, target.y, '#06b6d4');
    } else if (caster.type === 'assassin') {
      // Shadow Strike
      caster.x = target.x + 10;
      caster.y = target.y + 10;
      target.hp -= caster.atk * 3.0;
      addMagicParticles(target.x, target.y, '#a855f7');
    }
  }

  function addSlashParticles(x, y) {
    for (var i = 0; i < 4; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 80,
        vy: (Math.random() - 0.5) * 80,
        color: '#ffffff', life: 0.2
      });
    }
  }

  function addMagicParticles(x, y, color) {
    for (var i = 0; i < 15; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = Math.random() * 100 + 40;
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color: color, life: 0.35
      });
    }
  }

  function endRound(won, survivingEnemyCount) {
    isCombatPhase = false;
    btnFight.disabled = false;
    phaseEl.textContent = '备战阶段';
    phaseEl.style.color = '#38bdf8';

    if (won) {
      gold += 5 + currentRound;
      playSound('win');
      if (currentRound >= maxRounds) {
        gameOver(true, '战胜全部敌方战队，登顶棋王王座！');
        return;
      }
      currentRound++;
    } else {
      playerHp = Math.max(0, playerHp - (12 + (survivingEnemyCount || 1) * 4));
      gold += 4;
      if (playerHp <= 0) {
        gameOver(false, '生命耗尽，棋阵沦陷！');
        return;
      }
    }

    setupEnemyUnitsForRound(currentRound);
    rerollShop(true);
    updateHUD();
    render();
  }

  function updateHUD() {
    hpEl.textContent = playerHp;
    goldEl.textContent = gold;
    roundEl.textContent = currentRound + ' / ' + maxRounds;
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Board Grid
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var x = c * CELL_SIZE;
        var y = r * CELL_SIZE;

        var isEnemyZone = r < 3;
        ctx.fillStyle = isEnemyZone ? ((r + c) % 2 === 0 ? '#1e293b' : '#0f172a') : ((r + c) % 2 === 0 ? '#1e3a8a' : '#172554');
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
      }
    }

    // 2. Bench Row at bottom
    var benchY = ROWS * CELL_SIZE + 6;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, benchY, canvas.width, CELL_SIZE * 1.1);

    for (var b = 0; b < 4; b++) {
      var bx = b * CELL_SIZE;
      ctx.strokeStyle = '#475569';
      ctx.strokeRect(bx + 4, benchY + 4, CELL_SIZE - 8, CELL_SIZE - 8);
    }

    // 3. Draw Bench Heroes (in preparation phase)
    if (!isCombatPhase) {
      benchHeroes.forEach(function(h, idx) {
        var hx = (idx + 0.5) * CELL_SIZE;
        var hy = benchY + CELL_SIZE * 0.5;
        drawHero(hx, hy, h, selectedUnit === h);
      });

      // Draw Placed Board Heroes
      boardHeroes.forEach(function(bh) {
        var px = (bh.col + 0.5) * CELL_SIZE;
        var py = (bh.row + 0.5) * CELL_SIZE;
        drawHero(px, py, bh, selectedUnit === bh);
      });

      // Draw Enemies in preparation
      combatUnits.forEach(function(en) {
        if (!en.isPlayer) {
          drawHero(en.x, en.y, en, false);
        }
      });
    } else {
      // Combat Phase units
      combatUnits.forEach(function(u) {
        if (u.hp > 0) {
          drawHero(u.x, u.y, u, false);
        }
      });
    }

    // 4. Particles
    particles.forEach(function(p) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawHero(x, y, hero, isSelected) {
    var def = HERO_DEFS[hero.type];
    var r = CELL_SIZE * 0.36;

    ctx.save();
    ctx.translate(x, y);

    // Hero Base Circle
    ctx.fillStyle = hero.isPlayer ? '#2563eb' : '#dc2626';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = hero.stars === 2 ? '#facc15' : '#ffffff';
    ctx.lineWidth = hero.stars === 2 ? 3 : 1.5;
    ctx.stroke();

    // Hero Icon
    ctx.font = Math.floor(CELL_SIZE * 0.4) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.icon, 0, 0);

    // Star Crown (2-star)
    if (hero.stars === 2) {
      ctx.font = '14px sans-serif';
      ctx.fillText('⭐⭐', 0, -r - 4);
    }

    // Health Bar
    var barW = CELL_SIZE * 0.65;
    var hpRatio = Math.max(0, hero.hp / hero.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-barW / 2, -r - 10, barW, 4);
    ctx.fillStyle = hero.isPlayer ? '#22c55e' : '#ef4444';
    ctx.fillRect(-barW / 2, -r - 10, barW * hpRatio, 4);

    // Mana Bar
    if (isCombatPhase && hero.mana !== undefined) {
      var manaRatio = Math.min(1, hero.mana / 100);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-barW / 2, -r - 6, barW * manaRatio, 2);
    }

    if (isSelected) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function handlePointer(clientX, clientY) {
    if (isCombatPhase || isGameOver) return;
    var rect = canvas.getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;

    var benchY = ROWS * CELL_SIZE + 6;

    // Check clicking bench hero
    if (y >= benchY) {
      var bIdx = Math.floor(x / CELL_SIZE);
      if (bIdx >= 0 && bIdx < benchHeroes.length) {
        selectedUnit = benchHeroes[bIdx];
        render();
        return;
      }
    }

    // Check clicking board
    var col = Math.floor(x / CELL_SIZE);
    var row = Math.floor(y / CELL_SIZE);

    if (col >= 0 && col < COLS && row >= 3 && row < ROWS) {
      if (selectedUnit) {
        // Place selected hero on board cell
        var benchIdx = benchHeroes.indexOf(selectedUnit);
        if (benchIdx !== -1) {
          benchHeroes.splice(benchIdx, 1);
          selectedUnit.col = col;
          selectedUnit.row = row;
          boardHeroes.push(selectedUnit);
        } else {
          // Move already placed hero
          selectedUnit.col = col;
          selectedUnit.row = row;
        }
        selectedUnit = null;
        render();
        return;
      } else {
        // Select placed hero
        var existing = boardHeroes.find(function(h) { return h.col === col && h.row === row; });
        if (existing) {
          selectedUnit = existing;
          render();
          return;
        }
      }
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

  btnReroll.addEventListener('click', function() { rerollShop(false); });
  btnFight.addEventListener('click', startCombat);

  function gameOver(won, msg) {
    isGameOver = true;
    modalTitle.textContent = won ? '🏆 登顶棋王！' : '💥 棋局惜败！';
    modalTitle.style.color = won ? '#facc15' : '#ef4444';
    modalDesc.textContent = msg;
    modal.classList.remove('hidden');
    playSound(won ? 'win' : 'magic');
  }

  btnRestart.addEventListener('click', function() {
    modal.classList.add('hidden');
    initGame();
  });

  function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    var dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (dt > 0.1) dt = 0.1;

    updateCombatPhysics(dt);
    render();
    requestAnimationFrame(gameLoop);
  }

  resizeCanvas();
  initGame();
  requestAnimationFrame(gameLoop);

})();
