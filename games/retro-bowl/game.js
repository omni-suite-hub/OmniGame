(function () {
  'use strict';

  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var container = document.getElementById('container');

  var playerScoreEl = document.getElementById('player-score');
  var oppScoreEl = document.getElementById('opp-score');
  var downDisplayEl = document.getElementById('down-display');
  var clockDisplayEl = document.getElementById('clock-display');
  var modalEl = document.getElementById('game-modal');
  var modalHeadingEl = document.getElementById('modal-heading');
  var modalSubtextEl = document.getElementById('modal-subtext');
  var modalBtn = document.getElementById('modal-btn');

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
      if (type === 'whistle') {
        var osc = actx.createOscillator();
        var gain = actx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2400, now);
        osc.frequency.setValueAtTime(2600, now + 0.05);
        osc.frequency.setValueAtTime(2400, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(actx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'throw') {
        var o = actx.createOscillator();
        var g = actx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(200, now);
        o.frequency.exponentialRampToValueAtTime(600, now + 0.15);
        g.gain.setValueAtTime(0.15, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        o.connect(g);
        g.connect(actx.destination);
        o.start(now);
        o.stop(now + 0.15);
      } else if (type === 'catch') {
        var oc = actx.createOscillator();
        var gc = actx.createGain();
        oc.type = 'square';
        oc.frequency.setValueAtTime(440, now);
        gc.gain.setValueAtTime(0.18, now);
        gc.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        oc.connect(gc);
        gc.connect(actx.destination);
        oc.start(now);
        oc.stop(now + 0.1);
      } else if (type === 'tackle') {
        var bufferSize = actx.sampleRate * 0.15;
        var buffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.25;
        }
        var noise = actx.createBufferSource();
        noise.buffer = buffer;
        var filter = actx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, now);
        var gn = actx.createGain();
        gn.gain.setValueAtTime(0.2, now);
        gn.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        noise.connect(filter);
        filter.connect(gn);
        gn.connect(actx.destination);
        noise.start(now);
      } else if (type === 'td') {
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, idx) {
          var ot = actx.createOscillator();
          var gt = actx.createGain();
          ot.type = 'triangle';
          ot.frequency.setValueAtTime(f, now + idx * 0.1);
          gt.gain.setValueAtTime(0.25, now + idx * 0.1);
          gt.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.3);
          ot.connect(gt);
          gt.connect(actx.destination);
          ot.start(now + idx * 0.1);
          ot.stop(now + idx * 0.1 + 0.3);
        });
      }
    } catch (e) {}
  }

  var V_WIDTH = 800;
  var V_HEIGHT = 450;

  function resize() {
    var rect = container.getBoundingClientRect();
    var scale = Math.min(rect.width / V_WIDTH, rect.height / V_HEIGHT, 1.2);
    canvas.width = V_WIDTH;
    canvas.height = V_HEIGHT;
    canvas.style.width = (V_WIDTH * scale) + 'px';
    canvas.style.height = (V_HEIGHT * scale) + 'px';
  }
  window.addEventListener('resize', resize);

  // Game States
  var playerScore = 0;
  var oppScore = 7;
  var gameClock = 120; // seconds
  var clockTimer = null;

  var currentDown = 1;
  var yardsToGain = 10;
  var ballYard = 20; // 0 is own goal, 100 is opponent end zone

  // Field conversion: 0..100 yards maps to screen X: 80px to 720px
  function yardToX(yd) {
    return 80 + (yd / 100) * 640;
  }

  // Entities
  var qb = { x: 0, y: 225, vx: 0, vy: 0 };
  var ball = {
    active: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    carrier: null, // pointer to entity holding ball
    isAirborne: false
  };

  var receivers = [];
  var defenders = [];

  var playState = 'AIMING'; // 'AIMING', 'PASSING', 'RUNNING', 'PLAY_OVER', 'GAME_OVER'
  var dragStart = null;
  var dragCurrent = null;

  function startDrive() {
    currentDown = 1;
    yardsToGain = 10;
    setupPlay();
  }

  function setupPlay() {
    playState = 'AIMING';
    ball.active = false;
    ball.carrier = null;
    ball.isAirborne = false;
    dragStart = null;
    dragCurrent = null;

    var scrX = yardToX(ballYard);

    // QB position
    qb.x = scrX - 35;
    qb.y = 225;
    qb.vx = 0;
    qb.vy = 0;

    // Receivers
    receivers = [
      { id: 'WR1', x: scrX - 10, y: 90,  speed: 2.8, route: 'streak', caught: false, vx: 0, vy: 0 },
      { id: 'WR2', x: scrX - 10, y: 180, speed: 2.6, route: 'slant',  caught: false, vx: 0, vy: 0 },
      { id: 'WR3', x: scrX - 10, y: 360, speed: 2.7, route: 'post',   caught: false, vx: 0, vy: 0 }
    ];

    // Defenders
    defenders = [
      { id: 'CB1', x: scrX + 80,  y: 90,  speed: 2.4, target: receivers[0] },
      { id: 'LB',  x: scrX + 70,  y: 225, speed: 2.3, target: receivers[1] },
      { id: 'CB2', x: scrX + 80,  y: 360, speed: 2.5, target: receivers[2] },
      { id: 'FS',  x: scrX + 160, y: 225, speed: 2.7, target: null }
    ];

    updateHUD();
  }

  function updateHUD() {
    playerScoreEl.textContent = playerScore;
    oppScoreEl.textContent = oppScore;
    var suffix = ['th', 'st', 'nd', 'rd', 'th'][currentDown] || 'th';
    downDisplayEl.textContent = currentDown + suffix + ' & ' + yardsToGain;
    var mins = Math.floor(gameClock / 60);
    var secs = gameClock % 60;
    clockDisplayEl.textContent = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  function getCanvasCoords(e) {
    var rect = canvas.getBoundingClientRect();
    var clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    var clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    var scaleX = V_WIDTH / rect.width;
    var scaleY = V_HEIGHT / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  function setupInput() {
    var onDown = function (e) {
      e.preventDefault();
      getAudioCtx();
      var pos = getCanvasCoords(e);
      if (playState === 'AIMING') {
        dragStart = pos;
        dragCurrent = pos;
      } else if (playState === 'RUNNING' && ball.carrier) {
        // Juke up or down
        if (pos.y < ball.carrier.y - 20) ball.carrier.y -= 25;
        else if (pos.y > ball.carrier.y + 20) ball.carrier.y += 25;
      }
    };

    var onMove = function (e) {
      if (!dragStart || playState !== 'AIMING') return;
      dragCurrent = getCanvasCoords(e);
    };

    var onUp = function (e) {
      if (!dragStart || playState !== 'AIMING') return;
      var dx = dragStart.x - dragCurrent.x;
      var dy = dragStart.y - dragCurrent.y;
      var power = Math.hypot(dx, dy);

      if (power > 20) {
        // Throw ball!
        playState = 'PASSING';
        ball.active = true;
        ball.x = qb.x;
        ball.y = qb.y;
        ball.z = 10;
        var pFactor = Math.min(power / 10, 14);
        var angle = Math.atan2(dy, dx);
        ball.vx = Math.cos(angle) * pFactor;
        ball.vy = Math.sin(angle) * pFactor;
        ball.vz = 5.5; // arc height velocity
        ball.isAirborne = true;
        playSound('throw');
      }
      dragStart = null;
      dragCurrent = null;
    };

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    canvas.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp, { passive: false });
  }

  function endPlay(result) {
    playState = 'PLAY_OVER';
    playSound('whistle');

    var endYard = Math.max(0, Math.min(100, Math.round(((ball.x - 80) / 640) * 100)));
    var gained = endYard - ballYard;

    if (endYard >= 100) {
      // Touchdown!
      playSound('td');
      playerScore += 7;
      modalHeadingEl.textContent = '🏈 TOUCHDOWN!';
      modalSubtextEl.textContent = '势如破竹！达阵得分 +7 分！';
      modalEl.classList.remove('hidden');
      ballYard = 20;
      currentDown = 1;
      yardsToGain = 10;
      updateHUD();
      return;
    }

    if (gained >= yardsToGain) {
      // First down!
      currentDown = 1;
      yardsToGain = 10;
      ballYard = endYard;
      modalHeadingEl.textContent = '✨ FIRST DOWN!';
      modalSubtextEl.textContent = '推进 ' + gained + ' 码，成功拿下首攻！';
      modalEl.classList.remove('hidden');
    } else {
      currentDown++;
      yardsToGain -= Math.max(0, gained);
      ballYard = Math.max(5, endYard);
      if (currentDown > 4) {
        // Turnover on downs!
        modalHeadingEl.textContent = '❌ 四攻未果，交出球权';
        modalSubtextEl.textContent = '防守组登场，对方反推 7 分';
        oppScore += 7;
        ballYard = 20;
        currentDown = 1;
        yardsToGain = 10;
        modalEl.classList.remove('hidden');
      } else {
        setTimeout(setupPlay, 1000);
      }
    }
    updateHUD();
  }

  modalBtn.addEventListener('click', function () {
    modalEl.classList.add('hidden');
    setupPlay();
  });

  function update() {
    if (playState === 'PLAY_OVER' || playState === 'GAME_OVER') return;

    // Receivers routes
    receivers.forEach(function (r) {
      if (playState === 'AIMING' || playState === 'PASSING') {
        r.x += r.speed;
        if (r.route === 'slant') {
          r.y += (r.y < 225 ? 0.7 : -0.7);
        } else if (r.route === 'post') {
          if (r.x > yardToX(ballYard) + 80) r.y -= 1.2;
        }
      }
    });

    // Defenders tracking
    defenders.forEach(function (d) {
      if (playState === 'RUNNING' && ball.carrier) {
        // Chase ball carrier
        var angle = Math.atan2(ball.carrier.y - d.y, ball.carrier.x - d.x);
        d.x += Math.cos(angle) * d.speed;
        d.y += Math.sin(angle) * d.speed;
      } else if (playState === 'PASSING' && ball.isAirborne) {
        // Shadow towards ball landing area
        var angleB = Math.atan2(ball.y - d.y, ball.x - d.x);
        d.x += Math.cos(angleB) * d.speed * 0.9;
        d.y += Math.sin(angleB) * d.speed * 0.9;
      } else if (d.target) {
        // Man coverage
        var dist = Math.hypot(d.target.x - d.x, d.target.y - d.y);
        if (dist > 20) {
          var ang = Math.atan2(d.target.y - d.y, d.target.x - d.x);
          d.x += Math.cos(ang) * d.speed;
          d.y += Math.sin(ang) * d.speed;
        }
      }
    });

    // Ball airborne physics
    if (ball.isAirborne) {
      ball.x += ball.vx;
      ball.y += ball.vy;
      ball.z += ball.vz;
      ball.vz -= 0.22; // gravity

      if (ball.z <= 0) {
        ball.z = 0;
        ball.isAirborne = false;

        // Check if any receiver caught it
        var caughtBy = null;
        receivers.forEach(function (r) {
          if (Math.hypot(r.x - ball.x, r.y - ball.y) < 32) {
            caughtBy = r;
          }
        });

        if (caughtBy) {
          // Complete pass!
          playSound('catch');
          ball.carrier = caughtBy;
          caughtBy.caught = true;
          playState = 'RUNNING';
        } else {
          // Incomplete pass!
          endPlay('incomplete');
        }
      }
    }

    // Ball carrier running
    if (playState === 'RUNNING' && ball.carrier) {
      ball.carrier.x += ball.carrier.speed * 1.1;
      ball.x = ball.carrier.x;
      ball.y = ball.carrier.y;

      // Touchdown check
      if (ball.carrier.x >= yardToX(100)) {
        endPlay('touchdown');
        return;
      }

      // Tackle check
      defenders.forEach(function (d) {
        if (Math.hypot(d.x - ball.carrier.x, d.y - ball.carrier.y) < 18) {
          playSound('tackle');
          endPlay('tackled');
        }
      });
    }
  }

  function drawField() {
    // Green Turf
    ctx.fillStyle = '#15803d';
    ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

    // End Zones
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(0, 0, 80, V_HEIGHT);
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(720, 0, 80, V_HEIGHT);

    // Endzone lettering
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(760, V_HEIGHT / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('OMNI TD', 0, 0);
    ctx.restore();

    // Yard Lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    for (var yd = 10; yd <= 90; yd += 10) {
      var x = yardToX(yd);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, V_HEIGHT);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '12px monospace';
      var num = yd <= 50 ? yd : (100 - yd);
      ctx.fillText(num, x, 24);
      ctx.fillText(num, x, V_HEIGHT - 12);
    }

    // Line of Scrimmage (Blue)
    var losX = yardToX(ballYard);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(losX, 0);
    ctx.lineTo(losX, V_HEIGHT);
    ctx.stroke();

    // Line to Gain (Yellow)
    var ltgX = yardToX(ballYard + yardsToGain);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ltgX, 0);
    ctx.lineTo(ltgX, V_HEIGHT);
    ctx.stroke();
  }

  function drawPlayer(x, y, color, helmetColor, num) {
    ctx.save();
    ctx.translate(x, y);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = color;
    ctx.fillRect(-6, -6, 12, 12);

    // Helmet
    ctx.fillStyle = helmetColor;
    ctx.beginPath();
    ctx.arc(0, -7, 6, 0, Math.PI * 2);
    ctx.fill();

    // Visor
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(2, -9, 4, 3);

    ctx.restore();
  }

  function draw() {
    drawField();

    // Draw QB
    drawPlayer(qb.x, qb.y, '#3b82f6', '#ffffff', '12');

    // Draw Receivers
    receivers.forEach(function (r) {
      drawPlayer(r.x, r.y, '#3b82f6', '#ffffff', '88');
    });

    // Draw Defenders
    defenders.forEach(function (d) {
      drawPlayer(d.x, d.y, '#ef4444', '#facc15', '54');
    });

    // Aiming trajectory line
    if (playState === 'AIMING' && dragStart && dragCurrent) {
      var dx = dragStart.x - dragCurrent.x;
      var dy = dragStart.y - dragCurrent.y;
      var dist = Math.hypot(dx, dy);
      var angle = Math.atan2(dy, dx);

      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(qb.x, qb.y);
      var leadX = qb.x + Math.cos(angle) * dist * 2;
      var leadY = qb.y + Math.sin(angle) * dist * 2;
      ctx.lineTo(leadX, leadY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(leadX, leadY, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Ball
    if (ball.active) {
      // Ball Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(ball.x, ball.y, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Football
      ctx.save();
      ctx.translate(ball.x, ball.y - ball.z);
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 4, 0.4, 0, Math.PI * 2);
      ctx.fill();

      // White stitches
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-2, -1);
      ctx.lineTo(2, 1);
      ctx.stroke();
      ctx.restore();
    }
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // Timer loop
  clockTimer = setInterval(function () {
    if (gameClock > 0 && playState !== 'GAME_OVER') {
      gameClock--;
      updateHUD();
      if (gameClock <= 0) {
        playState = 'GAME_OVER';
        modalHeadingEl.textContent = '比赛结束！🏁';
        modalSubtextEl.textContent = '最终比分: 你 ' + playerScore + ' - ' + oppScore + ' 对手';
        modalEl.classList.remove('hidden');
      }
    }
  }, 1000);

  setupInput();
  resize();
  startDrive();
  requestAnimationFrame(loop);
})();
