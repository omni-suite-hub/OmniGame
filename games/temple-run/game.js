// Temple Run (神庙逃亡) - OmniGame Engine
(function () {
  'use strict';

  var audioCtx = null;
  var soundEnabled = true;

  function initAudio() {
    if (!audioCtx) {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playTone(freq, dur, type, gain) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;
    try {
      var osc = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      g.gain.setValueAtTime(gain || 0.12, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (e) {}
  }

  function playCoinSound() {
    playTone(1046.5, 0.08, 'sine', 0.15);
    setTimeout(function () { playTone(1318.5, 0.1, 'triangle', 0.15); }, 50);
  }
  function playJumpSound() { playTone(320, 0.12, 'triangle', 0.12); }
  function playSlideSound() { playTone(180, 0.1, 'sawtooth', 0.1); }
  function playTurnSound() { playTone(440, 0.08, 'square', 0.1); }
  function playDemonRoar() {
    playTone(90, 0.4, 'sawtooth', 0.3);
    setTimeout(function () { playTone(60, 0.5, 'square', 0.35); }, 100);
  }

  // DOM
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var distTextEl = document.getElementById('distText');
  var coinsTextEl = document.getElementById('coinsText');
  var scoreTextEl = document.getElementById('scoreText');
  var overlayHintEl = document.getElementById('overlayHint');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalDescEl = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  var btnLeft = document.getElementById('btnLeft');
  var btnRight = document.getElementById('btnRight');
  var btnJump = document.getElementById('btnJump');
  var btnSlide = document.getElementById('btnSlide');

  var HORIZON_Y = 130;
  var BOTTOM_Y = 380;
  var CENTER_X = 180;

  var isPlaying = false;
  var isDead = false;
  var distance = 0;
  var coins = 0;
  var speed = 6.5;

  var player = {
    lane: 0, // -1: left, 0: center, 1: right
    currentLaneX: 0,
    yOffset: 0,
    vy: 0,
    isJumping: false,
    isSliding: false,
    slideTimer: 0
  };

  var cornerUpcoming = false;
  var cornerDir = 'left'; // 'left' or 'right'
  var cornerZ = -1;

  var items = [];
  var spawnTimer = 0;

  function initGame() {
    isPlaying = false;
    isDead = false;
    distance = 0;
    coins = 0;
    speed = 6.5;

    player.lane = 0;
    player.currentLaneX = 0;
    player.yOffset = 0;
    player.vy = 0;
    player.isJumping = false;
    player.isSliding = false;
    player.slideTimer = 0;

    cornerUpcoming = false;
    cornerZ = -1;
    items = [];
    spawnTimer = 0;

    overlayHintEl.style.display = 'block';
    modalEl.classList.remove('active');
    updateUI();
  }

  function updateUI() {
    distTextEl.textContent = Math.floor(distance) + 'm';
    coinsTextEl.textContent = coins;
    scoreTextEl.textContent = Math.floor(distance * 2 + coins * 15);
  }

  function project(laneOffset, z) {
    var scale = 220 / (z + 220);
    var y = HORIZON_Y + (BOTTOM_Y - HORIZON_Y) * scale;
    var pathHalfWidth = 75 * scale;
    var x = CENTER_X + laneOffset * pathHalfWidth * 0.7;
    return { x: x, y: y, scale: scale, pathHalfWidth: pathHalfWidth };
  }

  function spawnWorld() {
    spawnTimer++;
    if (spawnTimer < 50) return;
    spawnTimer = 0;

    // Corner turn chance
    if (!cornerUpcoming && Math.random() < 0.25) {
      cornerUpcoming = true;
      cornerDir = Math.random() < 0.5 ? 'left' : 'right';
      cornerZ = 600;
      return;
    }

    var lane = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
    var r = Math.random();

    if (r < 0.4) {
      // Ancient Coins row
      for (var k = 0; k < 3; k++) {
        items.push({ type: 'coin', lane: lane, z: 600 + k * 35, collected: false });
      }
    } else if (r < 0.65) {
      // Broken Chasm (requires Jump)
      items.push({ type: 'chasm', lane: 0, z: 600 });
    } else if (r < 0.85) {
      // Fire Arch (requires Slide)
      items.push({ type: 'arch', lane: 0, z: 600 });
    } else {
      // Tree roots on 1 lane
      items.push({ type: 'roots', lane: lane, z: 600 });
    }
  }

  function turnLeft() {
    if (!isPlaying) startGame();
    if (cornerUpcoming && cornerZ < 60 && cornerZ > -30) {
      if (cornerDir === 'left') {
        // Success corner drift!
        cornerUpcoming = false;
        cornerZ = -1;
        playTurnSound();
        distance += 20;
        return;
      }
    }
    if (player.lane > -1) player.lane--;
  }

  function turnRight() {
    if (!isPlaying) startGame();
    if (cornerUpcoming && cornerZ < 60 && cornerZ > -30) {
      if (cornerDir === 'right') {
        // Success corner drift!
        cornerUpcoming = false;
        cornerZ = -1;
        playTurnSound();
        distance += 20;
        return;
      }
    }
    if (player.lane < 1) player.lane++;
  }

  function jump() {
    if (!isPlaying) startGame();
    if (!player.isJumping && !player.isSliding) {
      player.isJumping = true;
      player.vy = -10.5;
      playJumpSound();
    }
  }

  function slide() {
    if (!isPlaying) startGame();
    if (player.isJumping) {
      player.vy = 12; // Fast fall
    }
    player.isSliding = true;
    player.slideTimer = 26;
    playSlideSound();
  }

  function startGame() {
    if (isDead) return;
    initAudio();
    isPlaying = true;
    overlayHintEl.style.display = 'none';
  }

  function gameOver(reason) {
    isDead = true;
    isPlaying = false;
    playDemonRoar();
    modalDescEl.textContent = '逃亡 ' + Math.floor(distance) + ' 米，斩获 ' + coins + ' 枚远古金币！' + (reason ? ' (' + reason + ')' : '');
    modalEl.classList.add('active');
  }

  function update() {
    if (!isPlaying || isDead) return;

    distance += speed * 0.05;
    speed = 6.5 + Math.min(5, distance * 0.004);
    updateUI();

    // Smooth lane
    player.currentLaneX += (player.lane - player.currentLaneX) * 0.22;

    // Jump
    if (player.isJumping) {
      player.yOffset += player.vy;
      player.vy += 0.68;
      if (player.yOffset >= 0) {
        player.yOffset = 0;
        player.vy = 0;
        player.isJumping = false;
      }
    }

    // Slide
    if (player.isSliding) {
      player.slideTimer--;
      if (player.slideTimer <= 0) player.isSliding = false;
    }

    // Corner turn progression
    if (cornerUpcoming) {
      cornerZ -= speed;
      // Missed turn!
      if (cornerZ < -35) {
        gameOver('未及时拐弯坠入深谷');
        return;
      }
    }

    spawnWorld();

    // Items
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      it.z -= speed;

      if (it.z < 28 && it.z > -10) {
        var laneDist = Math.abs(it.lane - player.lane);

        if (it.type === 'coin' && !it.collected && laneDist < 0.6) {
          it.collected = true;
          coins++;
          playCoinSound();
        } else if (it.type === 'chasm') {
          if (!player.isJumping || player.yOffset > -16) {
            gameOver('掉入断桥裂谷');
            return;
          }
        } else if (it.type === 'arch') {
          if (!player.isSliding) {
            gameOver('撞上神庙石拱');
            return;
          }
        } else if (it.type === 'roots') {
          if (laneDist < 0.6 && (!player.isJumping || player.yOffset > -14)) {
            gameOver('被巨型树根绊倒');
            return;
          }
        }
      }

      if (it.z < -40) {
        items.splice(i, 1);
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Ancient Jungle Temple Background
    var grad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
    grad.addColorStop(0, '#1c1033');
    grad.addColorStop(1, '#431407');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, HORIZON_Y);

    // Jungle trees & temple towers
    ctx.fillStyle = '#14532d';
    ctx.beginPath();
    ctx.arc(40, HORIZON_Y - 20, 50, 0, Math.PI * 2);
    ctx.arc(100, HORIZON_Y - 30, 60, 0, Math.PI * 2);
    ctx.arc(260, HORIZON_Y - 30, 60, 0, Math.PI * 2);
    ctx.arc(320, HORIZON_Y - 20, 50, 0, Math.PI * 2);
    ctx.fill();

    // Stone Pathway Perspective
    var pFar = project(0, 600);
    var pNear = project(0, 0);

    ctx.fillStyle = '#78350f'; // Ancient stone/brick
    ctx.beginPath();
    ctx.moveTo(pFar.x - pFar.pathHalfWidth, pFar.y);
    ctx.lineTo(pFar.x + pFar.pathHalfWidth, pFar.y);
    ctx.lineTo(pNear.x + pNear.pathHalfWidth * 1.3, pNear.y + 40);
    ctx.lineTo(pNear.x - pNear.pathHalfWidth * 1.3, pNear.y + 40);
    ctx.closePath();
    ctx.fill();

    // Stone pathway borders
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Pathway Flagstones
    var stoneOffset = (distance * 6) % 30;
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
    ctx.lineWidth = 2;
    for (var sz = 30; sz < 500; sz += 30) {
      var sp = project(0, sz - stoneOffset);
      if (sp.y > HORIZON_Y && sp.y < BOTTOM_Y + 30) {
        ctx.beginPath();
        ctx.moveTo(sp.x - sp.pathHalfWidth, sp.y);
        ctx.lineTo(sp.x + sp.pathHalfWidth, sp.y);
        ctx.stroke();
      }
    }

    // Corner Turn Indicator
    if (cornerUpcoming && cornerZ > -20 && cornerZ < 550) {
      var cp = project(0, cornerZ);
      ctx.fillStyle = '#ea580c';
      var dirArrow = cornerDir === 'left' ? '⬅️ 左急转！' : '急转右！➡️';
      ctx.font = 'bold ' + Math.max(10, Math.floor(18 * cp.scale)) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(dirArrow, cp.x, cp.y - 30 * cp.scale);
    }

    // Sort Items by Z descending
    var sorted = items.slice().sort(function (a, b) { return b.z - a.z; });

    sorted.forEach(function (it) {
      if (it.z > 600 || it.z < -20) return;
      var p = project(it.lane, it.z);

      if (it.type === 'coin' && !it.collected) {
        var cr = 9 * p.scale;
        ctx.fillStyle = '#fbbf24';
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y - 10 * p.scale, cr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (it.type === 'chasm') {
        var cw = p.pathHalfWidth * 2;
        var ch = 25 * p.scale;
        ctx.fillStyle = '#090314'; // Abyss hole
        ctx.fillRect(p.x - cw / 2, p.y - ch / 2, cw, ch);
        ctx.strokeStyle = '#ef4444';
        ctx.strokeRect(p.x - cw / 2, p.y - ch / 2, cw, ch);
      } else if (it.type === 'arch') {
        var aw = p.pathHalfWidth * 2;
        var ah = 14 * p.scale;
        var archH = 45 * p.scale;
        // Stone beam with torches
        ctx.fillStyle = '#b45309';
        ctx.fillRect(p.x - aw / 2, p.y - archH, aw, ah);
        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.arc(p.x, p.y - archH + ah / 2, 8 * p.scale, 0, Math.PI * 2);
        ctx.fill();
      } else if (it.type === 'roots') {
        var rw = 32 * p.scale;
        var rh = 18 * p.scale;
        ctx.fillStyle = '#451a03';
        ctx.fillRect(p.x - rw / 2, p.y - rh, rw, rh);
      }
    });

    // Draw Player Explorer
    var pp = project(player.currentLaneX, 0);
    var pW = 32;
    var pH = player.isSliding ? 18 : 36;
    var pY = pp.y - pH + player.yOffset;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(pp.x, pp.y, pW * 0.4, pW * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = player.isSliding ? '#ea580c' : '#fbbf24';
    ctx.fillRect(pp.x - pW * 0.35, pY, pW * 0.7, pH);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.strokeRect(pp.x - pW * 0.35, pY, pW * 0.7, pH);

    // Chasing Demon Monkey right behind
    var dY = pp.y + 15;
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🦍', pp.x, dY);
  }

  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  // Inputs
  window.addEventListener('keydown', function (e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); turnLeft(); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); turnRight(); }
    if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') { e.preventDefault(); jump(); }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); slide(); }
  });

  btnLeft.addEventListener('click', turnLeft);
  btnRight.addEventListener('click', turnRight);
  btnJump.addEventListener('click', jump);
  btnSlide.addEventListener('click', slide);

  canvas.addEventListener('pointerdown', startGame);

  restartBtn.addEventListener('click', initGame);
  modalRestartBtn.addEventListener('click', initGame);
  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  initGame();
  loop();
})();
