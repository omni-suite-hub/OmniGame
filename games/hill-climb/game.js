// games/hill-climb/game.js - Hill Climb Racing (登山赛车)
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

      if (type === 'engine') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(90, now);
        osc.frequency.linearRampToValueAtTime(160, now + 0.1);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'coin') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(987, now);
        osc.frequency.exponentialRampToValueAtTime(1318, now + 0.08);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'fuel') {
        [440, 554, 659, 880].forEach(function(f, idx) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'sine';
          o.frequency.setValueAtTime(f, now + idx * 0.06);
          g.gain.setValueAtTime(0.18, now + idx * 0.06);
          g.gain.linearRampToValueAtTime(0.01, now + idx * 0.06 + 0.1);
          o.start(now + idx * 0.06);
          o.stop(now + idx * 0.06 + 0.1);
        });
      } else if (type === 'crash') {
        var bufferSize = ctx.sampleRate * 0.35;
        var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        var noise = ctx.createBufferSource();
        noise.buffer = buffer;
        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, now);
        filter.frequency.exponentialRampToValueAtTime(30, now + 0.35);
        noise.connect(filter);
        filter.connect(gain);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.35);
        noise.start(now);
        noise.stop(now + 0.35);
      }
    } catch(e) {}
  }

  // DOM
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var distEl = document.getElementById('dist-el');
  var fuelBar = document.getElementById('fuel-bar');
  var coinsEl = document.getElementById('coins-el');
  var speedEl = document.getElementById('speed-el');
  var btnBrake = document.getElementById('btn-brake');
  var btnGas = document.getElementById('btn-gas');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc = document.getElementById('modal-desc');
  var finalDistEl = document.getElementById('final-dist');
  var btnRestart = document.getElementById('btn-restart');

  var CANVAS_W = 600;
  var CANVAS_H = 380;
  var GRAVITY = 650;

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

  // Terrain height function
  function getTerrainY(worldX) {
    var base = canvas.height * 0.72;
    // Layered harmonics for natural rolling hills and occasional steep ramps
    var y1 = Math.sin(worldX * 0.003) * 60;
    var y2 = Math.cos(worldX * 0.007) * 35;
    var y3 = Math.sin(worldX * 0.015) * 15;
    var ramp = Math.sin(worldX * 0.001) * 30;
    return base + y1 + y2 + y3 + ramp;
  }

  var car = null;
  var fuel = 100;
  var coins = 0;
  var distanceRecord = 0;
  var isGameOver = false;
  var lastTime = 0;

  var items = []; // coins and fuel cans
  var particles = [];
  var keys = {};

  function initGame() {
    fuel = 100;
    coins = 0;
    distanceRecord = 0;
    isGameOver = false;
    particles = [];

    // Spawn Car at x = 100
    var startX = 120;
    var groundY = getTerrainY(startX);
    car = {
      x: startX,
      y: groundY - 25,
      vx: 0,
      vy: 0,
      angle: 0,
      angVel: 0,
      wheelBase: 28,
      wheelR: 11,
      rearGrounded: false,
      frontGrounded: false
    };

    // Populate initial items along terrain for first 2000 meters
    items = [];
    for (var m = 180; m < 3500; m += 25) {
      if (m % 150 === 0) {
        items.push({ x: m, y: getTerrainY(m) - 26, type: 'fuel', collected: false });
      } else {
        items.push({ x: m, y: getTerrainY(m) - 22, type: 'coin', collected: false });
      }
    }

    updateHUD();
  }

  function updateHUD() {
    var d = Math.max(0, Math.floor((car.x - 120) / 10));
    distanceRecord = Math.max(distanceRecord, d);
    distEl.textContent = distanceRecord + 'm';

    fuelBar.style.width = Math.max(0, fuel) + '%';
    fuelBar.style.background = fuel > 30 ? '#22c55e' : '#ef4444';
    coinsEl.textContent = coins;

    var kmh = Math.round(Math.abs(car.vx) * 0.18);
    speedEl.textContent = kmh + ' km/h';
  }

  function updatePhysics(dt) {
    if (isGameOver) return;

    var isGas = keys['ArrowRight'] || keys['KeyD'] || keys['btnGas'];
    var isBrake = keys['ArrowLeft'] || keys['KeyA'] || keys['btnBrake'];

    // Fuel consumption
    if (isGas && fuel > 0) {
      fuel -= dt * 6.5;
      playSound('engine');
    } else {
      fuel -= dt * 1.5; // idle consumption
    }
    if (fuel <= 0) {
      fuel = 0;
      if (Math.abs(car.vx) < 5) {
        gameOver('⛽ 燃油耗尽！', '车辆失去动力停在半山腰！');
        return;
      }
    }

    // Wheel positions relative to car chassis
    var cosA = Math.cos(car.angle);
    var sinA = Math.sin(car.angle);

    var rwX = car.x - cosA * car.wheelBase;
    var rwY = car.y - sinA * car.wheelBase;
    var fwX = car.x + cosA * car.wheelBase;
    var fwY = car.y + sinA * car.wheelBase;

    var rwGround = getTerrainY(rwX);
    var fwGround = getTerrainY(fwX);

    car.rearGrounded = rwY + car.wheelR >= rwGround - 2;
    car.frontGrounded = fwY + car.wheelR >= fwGround - 2;

    // Chassis Gravity
    car.vy += GRAVITY * dt;

    // Ground Suspension / Reaction
    if (car.rearGrounded) {
      var rPenetration = (rwY + car.wheelR) - rwGround;
      if (rPenetration > 0) {
        car.vy -= rPenetration * 28;
        car.angVel += rPenetration * 1.2;
      }
      car.vy *= 0.88;
    }

    if (car.frontGrounded) {
      var fPenetration = (fwY + car.wheelR) - fwGround;
      if (fPenetration > 0) {
        car.vy -= fPenetration * 28;
        car.angVel -= fPenetration * 1.2;
      }
      car.vy *= 0.88;
    }

    // Engine Drive & Brakes
    if (car.rearGrounded || car.frontGrounded) {
      // Align car rotation with terrain slope
      var terrainSlope = Math.atan2(fwGround - rwGround, fwX - rwX);
      var angleDiff = terrainSlope - car.angle;
      car.angVel += angleDiff * 8 * dt;

      if (isGas && fuel > 0) {
        var driveForce = 480;
        car.vx += Math.cos(car.angle) * driveForce * dt;
        car.vy += Math.sin(car.angle) * driveForce * dt;
        car.angVel += 1.8 * dt; // wheelie pitch torque

        // Exhaust smoke particles
        if (Math.random() < 0.4) {
          particles.push({
            x: rwX,
            y: rwY,
            vx: -car.vx * 0.3 + (Math.random() - 0.5) * 30,
            vy: -20 - Math.random() * 20,
            life: 0.35,
            color: '#64748b'
          });
        }
      }

      if (isBrake) {
        car.vx *= 0.94;
        car.angVel -= 2.2 * dt;
      }
    } else {
      // In-Air Aerodynamic Control
      if (isGas) car.angVel += 4.5 * dt;
      if (isBrake) car.angVel -= 4.5 * dt;
    }

    // Friction & drag
    car.vx *= 0.992;
    car.angVel *= 0.92;

    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.angle += car.angVel * dt;

    // Driver Neck / Head Flip Collision Check
    var headDist = 20;
    var headX = car.x - sinA * headDist;
    var headY = car.y - cosA * headDist;
    var headGround = getTerrainY(headX);

    if (headY + 6 >= headGround) {
      playSound('crash');
      gameOver('💥 车辆侧翻！', '驾驶员颈部受到强烈撞击！');
      return;
    }

    // Pickups check
    items.forEach(function(item) {
      if (!item.collected && Math.hypot(item.x - car.x, item.y - car.y) < 38) {
        item.collected = true;
        if (item.type === 'coin') {
          coins += 10;
          playSound('coin');
        } else if (item.type === 'fuel') {
          fuel = Math.min(100, fuel + 70);
          playSound('fuel');
        }
        updateHUD();
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

    updateHUD();
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var w = canvas.width;
    var h = canvas.height;

    // Camera follow offset
    var camX = car ? car.x - w * 0.35 : 0;
    var camY = car ? car.y - h * 0.55 : 0;

    ctx.save();
    ctx.translate(-camX, -camY);

    // 1. Sky & Hills background
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(camX, camY, w, h);

    // Distant background mountains
    ctx.fillStyle = '#86efac';
    ctx.beginPath();
    ctx.moveTo(camX, camY + h);
    for (var bx = camX - 100; bx < camX + w + 100; bx += 80) {
      var by = h * 0.65 + Math.sin(bx * 0.001) * 80;
      ctx.lineTo(bx, by);
    }
    ctx.lineTo(camX + w + 100, camY + h);
    ctx.closePath();
    ctx.fill();

    // 2. Terrain mesh
    ctx.fillStyle = '#15803d'; // Grassy layer
    ctx.beginPath();
    ctx.moveTo(camX - 50, camY + h + 150);
    for (var tx = camX - 50; tx <= camX + w + 50; tx += 12) {
      ctx.lineTo(tx, getTerrainY(tx));
    }
    ctx.lineTo(camX + w + 50, camY + h + 150);
    ctx.closePath();
    ctx.fill();

    // Subsoil layer
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.moveTo(camX - 50, camY + h + 150);
    for (var tx2 = camX - 50; tx2 <= camX + w + 50; tx2 += 12) {
      ctx.lineTo(tx2, getTerrainY(tx2) + 16);
    }
    ctx.lineTo(camX + w + 50, camY + h + 150);
    ctx.closePath();
    ctx.fill();

    // 3. Items (Coins and Gas cans)
    items.forEach(function(item) {
      if (!item.collected && item.x > camX - 50 && item.x < camX + w + 50) {
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.type === 'coin' ? '🪙' : '⛽', item.x, item.y);
      }
    });

    // 4. Exhaust Particles
    particles.forEach(function(p) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // 5. Car Chassis & Wheels
    if (car) {
      var cosA = Math.cos(car.angle);
      var sinA = Math.sin(car.angle);

      var rwX = car.x - cosA * car.wheelBase;
      var rwY = car.y - sinA * car.wheelBase;
      var fwX = car.x + cosA * car.wheelBase;
      var fwY = car.y + sinA * car.wheelBase;

      // Draw Chassis
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);

      // Red Buggy Body
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.moveTo(-32, 4);
      ctx.lineTo(32, 4);
      ctx.lineTo(24, -10);
      ctx.lineTo(-14, -10);
      ctx.lineTo(-24, -18);
      ctx.lineTo(-32, -4);
      ctx.closePath();
      ctx.fill();

      // Roll cage frame
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-20, -10);
      ctx.lineTo(-14, -22);
      ctx.lineTo(8, -22);
      ctx.lineTo(16, -10);
      ctx.stroke();

      // Driver head
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(-4, -16, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Draw Wheels
      drawWheel(rwX, rwY, car.wheelR);
      drawWheel(fwX, fwY, car.wheelR);
    }

    ctx.restore();
  }

  function drawWheel(x, y, r) {
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  function gameOver(title, desc) {
    isGameOver = true;
    modalTitle.textContent = title;
    modalDesc.innerHTML = desc + '<br>最终行驶: <span style="color:#facc15;font-weight:bold;">' + distanceRecord + 'm</span>';
    modal.classList.remove('hidden');
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

  // Keyboard
  window.addEventListener('keydown', function(e) {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) !== -1) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', function(e) {
    keys[e.code] = false;
  });

  // Touch pedals
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

  bindTouch(btnBrake, 'btnBrake');
  bindTouch(btnGas, 'btnGas');

  btnRestart.addEventListener('click', function() {
    modal.classList.add('hidden');
    initGame();
  });

  resizeCanvas();
  initGame();
  requestAnimationFrame(gameLoop);

})();
