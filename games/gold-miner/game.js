(function () {
  'use strict';

  var STORAGE_KEY = 'omg:save:gold-miner';

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');

  var levelText = document.getElementById('levelText');
  var targetText = document.getElementById('targetText');
  var moneyText = document.getElementById('moneyText');
  var timeText = document.getElementById('timeText');
  var bombCountEl = document.getElementById('bombCount');
  var dynamiteBtn = document.getElementById('dynamiteBtn');
  var soundBtn = document.getElementById('soundBtn');
  var restartBtn = document.getElementById('restartBtn');

  var modal = document.getElementById('gmModal');
  var modalEmoji = document.getElementById('modalEmoji');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalActionBtn = document.getElementById('modalActionBtn');

  // Constants
  var WIDTH = 360;
  var HEIGHT = 480;
  var MINER_X = WIDTH / 2;
  var MINER_Y = 50;
  var HOOK_INIT_LEN = 24;
  var SHOOT_SPEED = 7;
  var EMPTY_RETRACT_SPEED = 8;

  // State
  var level = 1;
  var money = 0;
  var dynamiteCount = 1;
  var timeLeft = 60;
  var timerInterval = null;
  var isGameOver = false;
  var soundEnabled = true;

  // Hook state
  var hook = {
    angle: 0, // radians, 0 is pointing straight down
    angleDir: 1, // 1 or -1
    angleSpeed: 0.028,
    len: HOOK_INIT_LEN,
    state: 'swaying', // 'swaying', 'shooting', 'retracting'
    grabbedItem: null
  };

  var items = []; // underground treasures
  var particles = [];
  var animationId = null;

  // Web Audio Context
  var audioCtx = null;
  function getAudioCtx() {
    if (!soundEnabled) return null;
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
    if (!soundEnabled) return;
    var ctxA = getAudioCtx();
    if (!ctxA) return;
    var t = ctxA.currentTime;

    if (type === 'shoot') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(280, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.1);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.11);
    } else if (type === 'grab') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, t);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.07);
    } else if (type === 'cash') {
      [987.77, 1318.51].forEach(function (freq, i) {
        var osc = ctxA.createOscillator();
        var gain = ctxA.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.08);
        gain.gain.setValueAtTime(0.3, t + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.08 + 0.18);
        osc.connect(gain);
        gain.connect(ctxA.destination);
        osc.start(t + i * 0.08);
        osc.stop(t + i * 0.08 + 0.2);
      });
    } else if (type === 'boom') {
      var osc = ctxA.createOscillator();
      var gain = ctxA.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(100, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.25);
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
      osc.connect(gain);
      gain.connect(ctxA.destination);
      osc.start(t);
      osc.stop(t + 0.26);
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (freq, i) {
        var osc = ctxA.createOscillator();
        var gain = ctxA.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + i * 0.1);
        gain.gain.setValueAtTime(0.3, t + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.1 + 0.2);
        osc.connect(gain);
        gain.connect(ctxA.destination);
        osc.start(t + i * 0.1);
        osc.stop(t + i * 0.1 + 0.22);
      });
    } else if (type === 'lose') {
      [300, 240, 180].forEach(function (freq, i) {
        var osc = ctxA.createOscillator();
        var gain = ctxA.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t + i * 0.12);
        gain.gain.setValueAtTime(0.25, t + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.12 + 0.15);
        osc.connect(gain);
        gain.connect(ctxA.destination);
        osc.start(t + i * 0.12);
        osc.stop(t + i * 0.12 + 0.18);
      });
    }
  }

  function getTargetMoney(lvl) {
    var targets = [0, 650, 1400, 2300, 3400, 4800, 6500, 8500];
    return targets[lvl] || (lvl * 1500);
  }

  // Spawn underground items
  function generateStageItems(lvl) {
    var list = [];
    function overlaps(x, y, r) {
      return list.some(function (it) {
        return Math.hypot(it.x - x, it.y - y) < it.r + r + 8;
      });
    }

    function addItem(type, r, val, speed) {
      for (var attempt = 0; attempt < 50; attempt++) {
        var x = 30 + Math.random() * (WIDTH - 60);
        var y = 130 + Math.random() * (HEIGHT - 170);
        if (!overlaps(x, y, r)) {
          list.push({ type: type, x: x, y: y, r: r, val: val, speed: speed });
          break;
        }
      }
    }

    // Large Gold
    addItem('gold_lg', 24, 500, 1.8);
    // Medium Gold
    addItem('gold_md', 18, 250, 3.2);
    addItem('gold_md', 18, 250, 3.2);
    // Small Gold
    addItem('gold_sm', 12, 100, 5.5);
    addItem('gold_sm', 12, 100, 5.5);
    addItem('gold_sm', 12, 100, 5.5);

    // Diamond
    addItem('diamond', 9, 600, 7.5);

    // Rocks
    addItem('rock_lg', 22, 20, 1.2);
    addItem('rock_sm', 14, 10, 2.0);
    addItem('rock_sm', 14, 10, 2.0);

    // Lucky Bag
    var bagVal = [150, 250, 400, 700][Math.floor(Math.random() * 4)];
    addItem('bag', 15, bagVal, 4.0);

    return list;
  }

  function initLevel(lvl) {
    level = lvl || 1;
    if (level === 1) {
      money = 0;
      dynamiteCount = 1;
    }
    timeLeft = 60;
    isGameOver = false;

    hook.angle = 0;
    hook.angleDir = 1;
    hook.len = HOOK_INIT_LEN;
    hook.state = 'swaying';
    hook.grabbedItem = null;

    items = generateStageItems(level);
    particles = [];

    updateUI();
    hideModal();
    startTimer();
    saveState();
  }

  function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(function () {
      if (!isGameOver) {
        timeLeft--;
        timeText.textContent = timeLeft;
        if (timeLeft <= 0) {
          handleTimeUp();
        }
      }
    }, 1000);
  }

  function updateUI() {
    levelText.textContent = level;
    targetText.textContent = getTargetMoney(level);
    moneyText.textContent = money;
    timeText.textContent = timeLeft;
    bombCountEl.textContent = dynamiteCount;
  }

  function dropHook() {
    if (hook.state !== 'swaying' || isGameOver) return;
    hook.state = 'shooting';
    playSound('shoot');
  }

  function useDynamite() {
    if (hook.state === 'retracting' && hook.grabbedItem && dynamiteCount > 0) {
      dynamiteCount--;
      bombCountEl.textContent = dynamiteCount;
      playSound('boom');

      // Explode item
      spawnExplosion(hook.grabbedItem.x, hook.grabbedItem.y);
      hook.grabbedItem = null;
      hook.retractSpeed = EMPTY_RETRACT_SPEED;
    }
  }

  function spawnExplosion(x, y) {
    for (var i = 0; i < 20; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 2 + Math.random() * 5;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 3 + Math.random() * 4,
        color: Math.random() > 0.4 ? '#f59e0b' : '#ef4444',
        life: 1
      });
    }
  }

  function handleTimeUp() {
    isGameOver = true;
    clearInterval(timerInterval);
    var target = getTargetMoney(level);
    var passed = (money >= target);

    setTimeout(function () {
      if (passed) {
        playSound('win');
        modalEmoji.textContent = '💰';
        modalTitle.textContent = '指标达成！顺利通关！';
        modalDesc.textContent = '当前累计资金: $' + money + ' (目标 $' + target + ')\n奖励额外炸药 +1！';
        dynamiteCount++;
        modalActionBtn.textContent = '进入第 ' + (level + 1) + ' 关';
        modalActionBtn.onclick = function () {
          initLevel(level + 1);
        };
      } else {
        playSound('lose');
        modalEmoji.textContent = '🥀';
        modalTitle.textContent = '资金未达标！';
        modalDesc.textContent = '最终资金: $' + money + ' · 距目标还差 $' + (target - money);
        modalActionBtn.textContent = '重新开始';
        modalActionBtn.onclick = function () {
          initLevel(1);
        };
      }
      modal.classList.add('show');
    }, 400);
  }

  function hideModal() {
    modal.classList.remove('show');
  }

  // Hook Physics & Item Checking
  function updatePhysics() {
    if (hook.state === 'swaying') {
      hook.angle += hook.angleDir * hook.angleSpeed;
      if (hook.angle > Math.PI * 0.42) {
        hook.angle = Math.PI * 0.42;
        hook.angleDir = -1;
      } else if (hook.angle < -Math.PI * 0.42) {
        hook.angle = -Math.PI * 0.42;
        hook.angleDir = 1;
      }
    } else if (hook.state === 'shooting') {
      hook.len += SHOOT_SPEED;

      var tipX = MINER_X + Math.sin(hook.angle) * hook.len;
      var tipY = MINER_Y + Math.cos(hook.angle) * hook.len;

      // Check collision with items
      var hit = false;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (Math.hypot(tipX - it.x, tipY - it.y) <= it.r + 6) {
          hook.grabbedItem = it;
          hook.retractSpeed = it.speed;
          items.splice(i, 1);
          hit = true;
          playSound('grab');
          break;
        }
      }

      // Check boundary limits
      if (hit || tipX <= 10 || tipX >= WIDTH - 10 || tipY >= HEIGHT - 10) {
        hook.state = 'retracting';
        if (!hit) hook.retractSpeed = EMPTY_RETRACT_SPEED;
      }
    } else if (hook.state === 'retracting') {
      hook.len -= hook.retractSpeed || EMPTY_RETRACT_SPEED;

      var tipX2 = MINER_X + Math.sin(hook.angle) * hook.len;
      var tipY2 = MINER_Y + Math.cos(hook.angle) * hook.len;

      if (hook.grabbedItem) {
        hook.grabbedItem.x = tipX2;
        hook.grabbedItem.y = tipY2;
      }

      if (hook.len <= HOOK_INIT_LEN) {
        hook.len = HOOK_INIT_LEN;
        hook.state = 'swaying';

        if (hook.grabbedItem) {
          money += hook.grabbedItem.val;
          moneyText.textContent = money;
          playSound('cash');
          hook.grabbedItem = null;
          saveState();
        }
      }
    }

    // Update explosion particles
    for (var p = particles.length - 1; p >= 0; p--) {
      var ptc = particles[p];
      ptc.x += ptc.vx;
      ptc.y += ptc.vy;
      ptc.life -= 0.04;
      if (ptc.life <= 0) {
        particles.splice(p, 1);
      }
    }
  }

  // Draw Items
  function drawItem(it) {
    ctx.save();
    ctx.translate(it.x, it.y);

    if (it.type.indexOf('gold') === 0) {
      // Golden nugget
      var grad = ctx.createRadialGradient(-it.r * 0.3, -it.r * 0.3, it.r * 0.1, 0, 0, it.r);
      grad.addColorStop(0, '#fef08a');
      grad.addColorStop(0.7, '#eab308');
      grad.addColorStop(1, '#854d0e');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, it.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (it.type.indexOf('rock') === 0) {
      // Heavy rock
      var gradR = ctx.createRadialGradient(-it.r * 0.3, -it.r * 0.3, it.r * 0.1, 0, 0, it.r);
      gradR.addColorStop(0, '#94a3b8');
      gradR.addColorStop(0.8, '#475569');
      gradR.addColorStop(1, '#1e293b');
      ctx.fillStyle = gradR;
      ctx.beginPath();
      ctx.arc(0, 0, it.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (it.type === 'diamond') {
      // Sparkling diamond
      ctx.fillStyle = '#67e8f9';
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(0, -it.r);
      ctx.lineTo(it.r, 0);
      ctx.lineTo(0, it.r);
      ctx.lineTo(-it.r, 0);
      ctx.closePath();
      ctx.fill();
    } else if (it.type === 'bag') {
      // Mystery bag
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(0, 2, it.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', 0, 2);
    }

    ctx.restore();
  }

  // Main Render Loop
  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    updatePhysics();

    // Underground soil background
    ctx.fillStyle = '#261608';
    ctx.fillRect(0, 80, WIDTH, HEIGHT - 80);

    // Top surface ground
    ctx.fillStyle = '#451a03';
    ctx.fillRect(0, 72, WIDTH, 8);

    // Sky area
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, WIDTH, 72);

    // Miner machinery & pulley
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.arc(MINER_X, MINER_Y - 14, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f59e0b';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🤠', MINER_X, MINER_Y - 16);

    // Draw Cable
    var tipX = MINER_X + Math.sin(hook.angle) * hook.len;
    var tipY = MINER_Y + Math.cos(hook.angle) * hook.len;

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MINER_X, MINER_Y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Draw Claw
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(-hook.angle);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    // Left claw prong
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-6, 8);
    ctx.lineTo(-10, 14);
    ctx.stroke();

    // Right claw prong
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(6, 8);
    ctx.lineTo(10, 14);
    ctx.stroke();

    ctx.restore();

    // Draw underground treasures
    for (var i = 0; i < items.length; i++) {
      drawItem(items[i]);
    }

    // Draw grabbed item
    if (hook.grabbedItem) {
      drawItem(hook.grabbedItem);
    }

    // Draw particles
    for (var p = 0; p < particles.length; p++) {
      var ptc = particles[p];
      ctx.save();
      ctx.globalAlpha = ptc.life;
      ctx.fillStyle = ptc.color;
      ctx.beginPath();
      ctx.arc(ptc.x, ptc.y, ptc.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    animationId = requestAnimationFrame(render);
  }

  function saveState() {
    try {
      var state = {
        level: level,
        money: money,
        dynamiteCount: dynamiteCount,
        timeLeft: timeLeft,
        isGameOver: isGameOver
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function loadState() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        var state = JSON.parse(saved);
        if (state && typeof state.level === 'number') {
          level = state.level;
          money = state.money || 0;
          dynamiteCount = state.dynamiteCount || 1;
          timeLeft = state.timeLeft || 60;
          isGameOver = !!state.isGameOver;
          items = generateStageItems(level);
          updateUI();
          if (!isGameOver) startTimer();
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // Event Listeners
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    dropHook();
  });

  window.addEventListener('keydown', function (e) {
    if (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'Space') {
      e.preventDefault();
      dropHook();
    } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      useDynamite();
    }
  });

  dynamiteBtn.addEventListener('click', useDynamite);
  restartBtn.addEventListener('click', function () { initLevel(1); });

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  // Init
  if (!loadState()) {
    initLevel(1);
  }
  animationId = requestAnimationFrame(render);
})();
