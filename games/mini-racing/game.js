(function () {
  'use strict';

  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var container = document.getElementById('container');

  var lapDisplay = document.getElementById('lap-display');
  var timeDisplay = document.getElementById('time-display');
  var speedDisplay = document.getElementById('speed-display');
  var bestDisplay = document.getElementById('best-display');
  var finishModal = document.getElementById('finish-modal');
  var modalTime = document.getElementById('modal-time');
  var modalBest = document.getElementById('modal-best');
  var btnRestart = document.getElementById('btn-restart');

  // Audio System
  var audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    try {
      var actx = getAudioCtx();
      var now = actx.currentTime;
      if (type === 'beep') {
        var osc = actx.createOscillator();
        var gain = actx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(actx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'lap') {
        var osc1 = actx.createOscillator();
        var gain1 = actx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(523.25, now);
        osc1.frequency.exponentialRampToValueAtTime(1046.5, now + 0.25);
        gain1.gain.setValueAtTime(0.2, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc1.connect(gain1);
        gain1.connect(actx.destination);
        osc1.start(now);
        osc1.stop(now + 0.3);
      } else if (type === 'skid') {
        var bufferSize = actx.sampleRate * 0.1;
        var buffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
        var output = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) {
          output[i] = (Math.random() * 2 - 1) * 0.1;
        }
        var whiteNoise = actx.createBufferSource();
        whiteNoise.buffer = buffer;
        var filter = actx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, now);
        filter.Q.setValueAtTime(3, now);
        var gain2 = actx.createGain();
        gain2.gain.setValueAtTime(0.12, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        whiteNoise.connect(filter);
        filter.connect(gain2);
        gain2.connect(actx.destination);
        whiteNoise.start(now);
      } else if (type === 'win') {
        [523.25, 659.25, 783.99, 1046.5].forEach(function (freq, idx) {
          var o = actx.createOscillator();
          var g = actx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, now + idx * 0.12);
          g.gain.setValueAtTime(0.2, now + idx * 0.12);
          g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.35);
          o.connect(g);
          g.connect(actx.destination);
          o.start(now + idx * 0.12);
          o.stop(now + idx * 0.12 + 0.35);
        });
      }
    } catch (e) {}
  }

  // Virtual Game World Coordinates: 800 x 600
  var V_WIDTH = 800;
  var V_HEIGHT = 600;

  function resize() {
    var rect = container.getBoundingClientRect();
    var scale = Math.min(rect.width / V_WIDTH, rect.height / V_HEIGHT, 1.2);
    canvas.width = V_WIDTH;
    canvas.height = V_HEIGHT;
    canvas.style.width = (V_WIDTH * scale) + 'px';
    canvas.style.height = (V_HEIGHT * scale) + 'px';
  }
  window.addEventListener('resize', resize);

  // Track Layout (Waypoints of center line)
  var trackPoints = [
    { x: 400, y: 500 }, // Start/finish
    { x: 650, y: 500 },
    { x: 720, y: 430 },
    { x: 720, y: 220 },
    { x: 620, y: 100 },
    { x: 450, y: 100 },
    { x: 380, y: 180 },
    { x: 320, y: 220 },
    { x: 220, y: 220 },
    { x: 140, y: 160 },
    { x: 80,  y: 240 },
    { x: 80,  y: 420 },
    { x: 180, y: 500 }
  ];
  var TRACK_WIDTH = 84;

  // Car Physics State
  var car = {
    x: 400,
    y: 500,
    angle: 0, // In radians, 0 is pointing right (East)
    speed: 0,
    maxSpeed: 8.5,
    accel: 0.18,
    brakeDecel: 0.3,
    friction: 0.985,
    offRoadFriction: 0.92,
    turnSpeed: 0.048,
    width: 22,
    height: 12
  };

  var skidMarks = [];
  var TOTAL_LAPS = 3;
  var currentLap = 1;
  var lapStartTime = 0;
  var totalStartTime = 0;
  var lapTimes = [];
  var bestLapTime = Infinity;
  var isRacing = false;
  var isFinished = false;

  var nextCheckpoint = 1; // Index in trackPoints
  var checkpointsPassed = 0;

  // Controls state
  var keys = {
    up: false,
    down: false,
    left: false,
    right: false
  };

  function setupInput() {
    window.addEventListener('keydown', function (e) {
      if (['ArrowUp', 'KeyW'].indexOf(e.code) >= 0) keys.up = true;
      if (['ArrowDown', 'KeyS'].indexOf(e.code) >= 0) keys.down = true;
      if (['ArrowLeft', 'KeyA'].indexOf(e.code) >= 0) keys.left = true;
      if (['ArrowRight', 'KeyD'].indexOf(e.code) >= 0) keys.right = true;
      if (e.code === 'Space') keys.up = true;
    });

    window.addEventListener('keyup', function (e) {
      if (['ArrowUp', 'KeyW'].indexOf(e.code) >= 0) keys.up = false;
      if (['ArrowDown', 'KeyS'].indexOf(e.code) >= 0) keys.down = false;
      if (['ArrowLeft', 'KeyA'].indexOf(e.code) >= 0) keys.left = false;
      if (['ArrowRight', 'KeyD'].indexOf(e.code) >= 0) keys.right = false;
    });

    function bindBtn(id, key) {
      var btn = document.getElementById(id);
      if (!btn) return;
      var on = function (e) {
        e.preventDefault();
        keys[key] = true;
        btn.classList.add('active');
        getAudioCtx();
      };
      var off = function (e) {
        e.preventDefault();
        keys[key] = false;
        btn.classList.remove('active');
      };
      btn.addEventListener('touchstart', on, { passive: false });
      btn.addEventListener('touchend', off, { passive: false });
      btn.addEventListener('mousedown', on);
      btn.addEventListener('mouseup', off);
      btn.addEventListener('mouseleave', off);
    }

    bindBtn('btn-gas', 'up');
    bindBtn('btn-brake', 'down');
    bindBtn('btn-left', 'left');
    bindBtn('btn-right', 'right');
  }

  function getDistanceToTrack(px, py) {
    var minDist = Infinity;
    for (var i = 0; i < trackPoints.length; i++) {
      var p1 = trackPoints[i];
      var p2 = trackPoints[(i + 1) % trackPoints.length];
      var dist = distToSegment({ x: px, y: py }, p1, p2);
      if (dist < minDist) minDist = dist;
    }
    return minDist;
  }

  function distToSegment(p, v, w) {
    var l2 = (w.x - v.x) * (w.x - v.x) + (w.y - v.y) * (w.y - v.y);
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    var t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  }

  function formatTime(ms) {
    var totalSec = ms / 1000;
    var mins = Math.floor(totalSec / 60);
    var secs = Math.floor(totalSec % 60);
    var tenths = Math.floor((ms % 1000) / 100);
    return (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs + '.' + tenths;
  }

  function resetGame() {
    car.x = trackPoints[0].x;
    car.y = trackPoints[0].y;
    car.angle = 0;
    car.speed = 0;
    currentLap = 1;
    lapTimes = [];
    isFinished = false;
    isRacing = true;
    totalStartTime = performance.now();
    lapStartTime = performance.now();
    nextCheckpoint = 1;
    checkpointsPassed = 0;
    skidMarks = [];
    finishModal.classList.add('hidden');
    lapDisplay.textContent = '1 / ' + TOTAL_LAPS;
  }

  btnRestart.addEventListener('click', function () {
    resetGame();
  });

  function update() {
    if (!isRacing || isFinished) return;

    var now = performance.now();
    var curTime = now - totalStartTime;
    timeDisplay.textContent = formatTime(curTime);

    // Car controls
    if (keys.up) {
      car.speed += car.accel;
    }
    if (keys.down) {
      car.speed -= car.brakeDecel;
    }

    // Steering
    if (Math.abs(car.speed) > 0.2) {
      var turnMult = car.speed > 0 ? 1 : -1;
      if (keys.left) car.angle -= car.turnSpeed * turnMult;
      if (keys.right) car.angle += car.turnSpeed * turnMult;
    }

    // Road friction check
    var distToCenter = getDistanceToTrack(car.x, car.y);
    var isOffRoad = distToCenter > TRACK_WIDTH / 2;

    if (isOffRoad) {
      car.speed *= car.offRoadFriction;
      if (car.speed > 3) car.speed = 3;
    } else {
      car.speed *= car.friction;
    }

    if (car.speed > car.maxSpeed) car.speed = car.maxSpeed;
    if (car.speed < -2.5) car.speed = -2.5;

    // Movement
    car.x += Math.cos(car.angle) * car.speed;
    car.y += Math.sin(car.angle) * car.speed;

    // Boundary bounce
    if (car.x < 15) { car.x = 15; car.speed *= -0.5; }
    if (car.x > V_WIDTH - 15) { car.x = V_WIDTH - 15; car.speed *= -0.5; }
    if (car.y < 15) { car.y = 15; car.speed *= -0.5; }
    if (car.y > V_HEIGHT - 15) { car.y = V_HEIGHT - 15; car.speed *= -0.5; }

    // Skid marks
    var isDrifting = (keys.left || keys.right) && Math.abs(car.speed) > 4.5;
    if (isDrifting || (isOffRoad && Math.abs(car.speed) > 2.5)) {
      skidMarks.push({
        x: car.x,
        y: car.y,
        life: 1.0,
        color: isOffRoad ? 'rgba(74, 122, 60, 0.4)' : 'rgba(30, 41, 59, 0.5)'
      });
      if (Math.random() < 0.25) playSound('skid');
    }

    // Update skid marks
    for (var i = skidMarks.length - 1; i >= 0; i--) {
      skidMarks[i].life -= 0.005;
      if (skidMarks[i].life <= 0) skidMarks.splice(i, 1);
    }

    // Checkpoints & Lap Detection
    var targetPt = trackPoints[nextCheckpoint];
    var distToCheckpoint = Math.hypot(car.x - targetPt.x, car.y - targetPt.y);
    if (distToCheckpoint < TRACK_WIDTH * 0.8) {
      nextCheckpoint = (nextCheckpoint + 1) % trackPoints.length;
      checkpointsPassed++;

      // Checked finish line
      if (nextCheckpoint === 1 && checkpointsPassed >= trackPoints.length - 1) {
        var thisLapTime = now - lapStartTime;
        lapTimes.push(thisLapTime);
        if (thisLapTime < bestLapTime) {
          bestLapTime = thisLapTime;
          bestDisplay.textContent = formatTime(bestLapTime);
        }

        if (currentLap >= TOTAL_LAPS) {
          // Finish race!
          isFinished = true;
          playSound('win');
          modalTime.textContent = '总用时: ' + formatTime(now - totalStartTime);
          modalBest.textContent = '最快单圈: ' + formatTime(bestLapTime);
          finishModal.classList.remove('hidden');
        } else {
          currentLap++;
          lapDisplay.textContent = currentLap + ' / ' + TOTAL_LAPS;
          lapStartTime = now;
          checkpointsPassed = 0;
          playSound('lap');
        }
      }
    }

    var kmh = Math.round(Math.abs(car.speed) * 18);
    speedDisplay.textContent = kmh + ' km/h';
  }

  function drawTrack() {
    // Grass background
    ctx.fillStyle = '#166534';
    ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

    // Track border (kerb)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    trackPoints.forEach(function (p, idx) {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();

    // Red/White curb
    ctx.lineWidth = TRACK_WIDTH + 14;
    ctx.strokeStyle = '#dc2626';
    ctx.stroke();

    // Track asphalt
    ctx.lineWidth = TRACK_WIDTH;
    ctx.strokeStyle = '#334155';
    ctx.stroke();

    // Center dashed line
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 16]);
    ctx.strokeStyle = '#facc15';
    ctx.stroke();
    ctx.setLineDash([]);

    // Finish line
    var startP = trackPoints[0];
    ctx.save();
    ctx.translate(startP.x, startP.y);
    ctx.fillStyle = '#ffffff';
    for (var r = -TRACK_WIDTH / 2; r < TRACK_WIDTH / 2; r += 10) {
      ctx.fillStyle = (Math.floor(r / 10) % 2 === 0) ? '#ffffff' : '#0f172a';
      ctx.fillRect(0, r, 10, 10);
    }
    ctx.restore();
  }

  function draw() {
    drawTrack();

    // Skid marks
    skidMarks.forEach(function (s) {
      ctx.fillStyle = s.color;
      ctx.globalAlpha = s.life;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Draw car
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);

    // Car shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(-car.width / 2 + 2, -car.height / 2 + 3, car.width, car.height);

    // Car body
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.roundRect(-car.width / 2, -car.height / 2, car.width, car.height, 4);
    ctx.fill();

    // Roof & windshield
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-2, -car.height / 2 + 2, car.width / 2 - 2, car.height - 4);

    // Headlights
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(car.width / 2 - 3, -car.height / 2 + 1, 3, 3);
    ctx.fillRect(car.width / 2 - 3, car.height / 2 - 4, 3, 3);

    // Rear spoiler
    ctx.fillStyle = '#991b1b';
    ctx.fillRect(-car.width / 2 - 2, -car.height / 2, 3, car.height);

    ctx.restore();
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  setupInput();
  resize();
  resetGame();
  requestAnimationFrame(loop);
})();
