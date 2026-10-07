// Bad Time Simulator (地狱模拟 / 弹幕避险) - OmniGame Engine
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
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      g.gain.setValueAtTime(gain || 0.12, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (e) {}
  }

  function playHurtSound() {
    playTone(180, 0.15, 'sawtooth', 0.25);
    setTimeout(function () { playTone(90, 0.2, 'square', 0.3); }, 40);
  }

  function playLaserSound() {
    playTone(400, 0.08, 'sawtooth', 0.15);
    setTimeout(function () { playTone(120, 0.25, 'noise' || 'sawtooth', 0.25); }, 50);
  }

  function playShatterSound() {
    playTone(220, 0.1, 'sawtooth', 0.3);
    playTone(110, 0.3, 'square', 0.3);
  }

  // --- Megalovania 8-bit Synth Rhythm ---
  var bgmTimer = null;
  var bgmNotes = [
    293.66, 293.66, 587.33, 440.00, 415.30, 392.00, 349.23, 293.66, 349.23, 392.00,
    261.63, 261.63, 587.33, 440.00, 415.30, 392.00, 349.23, 293.66, 349.23, 392.00
  ];
  var bgmIndex = 0;

  function startBgm() {
    stopBgm();
    bgmIndex = 0;
    bgmTimer = setInterval(function () {
      if (!soundEnabled || !isPlaying) return;
      playTone(bgmNotes[bgmIndex % bgmNotes.length], 0.08, 'square', 0.04);
      bgmIndex++;
    }, 130);
  }

  function stopBgm() {
    if (bgmTimer) {
      clearInterval(bgmTimer);
      bgmTimer = null;
    }
  }

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var hpTextEl = document.getElementById('hpText');
  var timeTextEl = document.getElementById('timeText');
  var waveTextEl = document.getElementById('waveText');
  var hpBarEl = document.getElementById('hpBar');
  var sansDialogueEl = document.getElementById('sansDialogue');
  var overlayHintEl = document.getElementById('overlayHint');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalDescEl = document.getElementById('modalDesc');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  var btnUp = document.getElementById('btnUp');
  var btnDown = document.getElementById('btnDown');
  var btnLeft = document.getElementById('btnLeft');
  var btnRight = document.getElementById('btnRight');

  var BOX = { x: 40, y: 30, w: 240, h: 160 };
  var MAX_HP = 92;

  var isPlaying = false;
  var isDead = false;
  var hp = MAX_HP;
  var survivalTime = 0;
  var waveNum = 1;
  var invulnFrames = 0;

  // Soul Heart
  var soul = {
    x: BOX.x + BOX.w / 2,
    y: BOX.y + BOX.h / 2,
    size: 14,
    speed: 3.2
  };

  var keyState = { up: false, down: false, left: false, right: false };
  var bullets = []; // bones and lasers
  var attackTimer = 0;

  var DIALOGUES = [
    '外面天气真好，小鸟在歌唱，花儿在绽放...',
    '在这样的日子里，像你这样的孩子...',
    '就该在炽热地狱里受煎熬！',
    '你觉得你能逃掉多少波骨头？',
    '感觉到了吗？这才是真正的地狱难度！'
  ];

  function initGame() {
    isPlaying = false;
    isDead = false;
    hp = MAX_HP;
    survivalTime = 0;
    waveNum = 1;
    invulnFrames = 0;

    soul.x = BOX.x + BOX.w / 2;
    soul.y = BOX.y + BOX.h / 2;

    bullets = [];
    attackTimer = 0;

    overlayHintEl.style.display = 'block';
    modalEl.classList.remove('active');
    sansDialogueEl.textContent = DIALOGUES[0];
    updateStatsUI();
  }

  function updateStatsUI() {
    hpTextEl.textContent = Math.max(0, hp) + '/' + MAX_HP;
    timeTextEl.textContent = survivalTime.toFixed(1) + 's';
    waveTextEl.textContent = '第 ' + waveNum + ' 波';
    hpBarEl.style.width = Math.max(0, (hp / MAX_HP) * 100) + '%';
  }

  function startGame() {
    if (isDead) return;
    initAudio();
    isPlaying = true;
    overlayHintEl.style.display = 'none';
    startBgm();
  }

  function takeDamage(dmg) {
    if (invulnFrames > 0 || isDead) return;
    hp -= dmg;
    invulnFrames = 30; // 0.5s invulnerability
    playHurtSound();
    updateStatsUI();

    if (hp <= 0) {
      die();
    }
  }

  function die() {
    isDead = true;
    isPlaying = false;
    stopBgm();
    playShatterSound();
    modalDescEl.textContent = '极限坚持了 ' + survivalTime.toFixed(1) + ' 秒，突破至第 ' + waveNum + ' 波！';
    modalEl.classList.add('active');
  }

  function spawnWaveAttacks() {
    attackTimer++;

    // Wave cycling every 12 seconds
    var newWave = Math.floor(survivalTime / 12) + 1;
    if (newWave !== waveNum) {
      waveNum = newWave;
      sansDialogueEl.textContent = DIALOGUES[(waveNum - 1) % DIALOGUES.length];
    }

    // Pattern 1: Horizontal sweeping bones with gap
    if (attackTimer % 45 === 0) {
      var gapY = BOX.y + 20 + Math.random() * (BOX.h - 50);
      var fromLeft = Math.random() < 0.5;
      var bx = fromLeft ? BOX.x - 20 : BOX.x + BOX.w + 20;
      var bvx = fromLeft ? 2.8 : -2.8;

      // Top bone
      bullets.push({
        type: 'bone',
        x: bx,
        y: BOX.y,
        w: 12,
        h: gapY - BOX.y - 18,
        vx: bvx,
        vy: 0,
        color: '#ffffff'
      });

      // Bottom bone
      bullets.push({
        type: 'bone',
        x: bx,
        y: gapY + 18,
        w: 12,
        h: BOX.y + BOX.h - (gapY + 18),
        vx: bvx,
        vy: 0,
        color: '#ffffff'
      });
    }

    // Pattern 2: Gaster Blaster laser warning and blast
    if (waveNum >= 2 && attackTimer % 110 === 0) {
      var targetY = BOX.y + 15 + Math.random() * (BOX.h - 30);
      bullets.push({
        type: 'blaster',
        y: targetY,
        h: 22,
        timer: 35, // charge delay
        firing: 20 // active fire duration
      });
    }

    // Pattern 3: Blue Bones (move only when standing still)
    if (waveNum >= 3 && attackTimer % 90 === 0) {
      var bbx = BOX.x + Math.random() * (BOX.w - 15);
      bullets.push({
        type: 'blue_bone',
        x: bbx,
        y: BOX.y - 20,
        w: 14,
        h: 30,
        vx: 0,
        vy: 3.2,
        color: '#38bdf8'
      });
    }
  }

  function update() {
    if (!isPlaying || isDead) return;

    survivalTime += 1 / 60;
    updateStatsUI();

    if (invulnFrames > 0) invulnFrames--;

    // Move Soul
    var isMoving = false;
    if (keyState.up) { soul.y -= soul.speed; isMoving = true; }
    if (keyState.down) { soul.y += soul.speed; isMoving = true; }
    if (keyState.left) { soul.x -= soul.speed; isMoving = true; }
    if (keyState.right) { soul.x += soul.speed; isMoving = true; }

    // Clamp inside Box
    var half = soul.size / 2;
    soul.x = Math.max(BOX.x + half, Math.min(BOX.x + BOX.w - half, soul.x));
    soul.y = Math.max(BOX.y + half, Math.min(BOX.y + BOX.h - half, soul.y));

    spawnWaveAttacks();

    // Update Bullets
    for (var i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];

      if (b.type === 'bone' || b.type === 'blue_bone') {
        b.x += b.vx;
        b.y += b.vy;

        // Collision with soul
        if (soul.x + half > b.x && soul.x - half < b.x + b.w &&
            soul.y + half > b.y && soul.y - half < b.y + b.h) {
          if (b.type === 'blue_bone') {
            // Blue bone only damages if soul is MOVING!
            if (isMoving) takeDamage(14);
          } else {
            takeDamage(12);
          }
        }

        // Out of bounds
        if (b.x < BOX.x - 40 || b.x > BOX.x + BOX.w + 40 || b.y > BOX.y + BOX.h + 40) {
          bullets.splice(i, 1);
        }
      } else if (b.type === 'blaster') {
        if (b.timer > 0) {
          b.timer--;
          if (b.timer === 0) playLaserSound();
        } else if (b.firing > 0) {
          b.firing--;
          // Laser beam collision across whole box
          if (soul.y + half > b.y && soul.y - half < b.y + b.h) {
            takeDamage(16);
          }
        } else {
          bullets.splice(i, 1);
        }
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Battle Arena Box Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(BOX.x, BOX.y, BOX.w, BOX.h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(BOX.x, BOX.y, BOX.w, BOX.h);

    // Clip to battle box so bullets don't overflow outside
    ctx.save();
    ctx.beginPath();
    ctx.rect(BOX.x, BOX.y, BOX.w, BOX.h);
    ctx.clip();

    // Draw Bullets inside box
    bullets.forEach(function (b) {
      if (b.type === 'bone' || b.type === 'blue_bone') {
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        // Bone rounded caps
        ctx.beginPath();
        ctx.arc(b.x + b.w / 2, b.y, b.w / 2, 0, Math.PI * 2);
        ctx.arc(b.x + b.w / 2, b.y + b.h, b.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.type === 'blaster') {
        if (b.timer > 0) {
          // Warning laser line
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(BOX.x, b.y + b.h / 2);
          ctx.lineTo(BOX.x + BOX.w, b.y + b.h / 2);
          ctx.stroke();
        } else if (b.firing > 0) {
          // Full blast laser
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(BOX.x, b.y, BOX.w, b.h);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(BOX.x, b.y + 4, BOX.w, b.h - 8);
        }
      }
    });

    // Draw Soul Heart
    if (!isDead) {
      var hx = soul.x;
      var hy = soul.y;
      var hs = soul.size;

      // Invulnerability blink
      if (invulnFrames % 4 < 2) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(hx, hy - hs * 0.2);
        ctx.bezierCurveTo(hx, hy - hs * 0.6, hx - hs * 0.6, hy - hs * 0.6, hx - hs * 0.6, hy - hs * 0.2);
        ctx.bezierCurveTo(hx - hs * 0.6, hy + hs * 0.2, hx, hy + hs * 0.4, hx, hy + hs * 0.6);
        ctx.bezierCurveTo(hx, hy + hs * 0.4, hx + hs * 0.6, hy + hs * 0.2, hx + hs * 0.6, hy - hs * 0.2);
        ctx.bezierCurveTo(hx + hs * 0.6, hy - hs * 0.6, hx, hy - hs * 0.6, hx, hy - hs * 0.2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  // Inputs
  window.addEventListener('keydown', function (e) {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); keyState.up = true; startGame(); }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); keyState.down = true; startGame(); }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); keyState.left = true; startGame(); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); keyState.right = true; startGame(); }
  });

  window.addEventListener('keyup', function (e) {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') keyState.up = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keyState.down = false;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyState.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keyState.right = false;
  });

  function bindBtn(btn, key) {
    btn.addEventListener('pointerdown', function () { keyState[key] = true; startGame(); });
    btn.addEventListener('pointerup', function () { keyState[key] = false; });
    btn.addEventListener('pointercancel', function () { keyState[key] = false; });
  }
  bindBtn(btnUp, 'up');
  bindBtn(btnDown, 'down');
  bindBtn(btnLeft, 'left');
  bindBtn(btnRight, 'right');

  canvas.addEventListener('pointerdown', startGame);

  restartBtn.addEventListener('click', initGame);
  modalRestartBtn.addEventListener('click', initGame);
  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
    if (!soundEnabled) stopBgm();
  });

  initGame();
  loop();
})();
