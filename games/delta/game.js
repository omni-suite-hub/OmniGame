/*!
 * 差分特工 (Cyber Delta Agent) — OmniGame 赛博全息异常排查
 */
(function() {
  'use strict';

  var GAME_ID = 'delta';

  // --- Web Audio 音频合成 ---
  var audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    var ctx = getAudioContext();
    if (!ctx) return;
    try {
      var t = ctx.currentTime;
      if (type === 'found') {
        [523.25, 783.99, 1046.5].forEach(function(freq, i) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(freq, t + i * 0.06);
          g.gain.setValueAtTime(0.25, t + i * 0.06);
          g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.15);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t + i * 0.06);
          o.stop(t + i * 0.06 + 0.16);
        });
      } else if (type === 'wrong') {
        var oscW = ctx.createOscillator();
        var gainW = ctx.createGain();
        oscW.type = 'sawtooth';
        oscW.frequency.setValueAtTime(120, t);
        gainW.gain.setValueAtTime(0.3, t);
        gainW.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        oscW.connect(gainW);
        gainW.connect(ctx.destination);
        oscW.start(t);
        oscW.stop(t + 0.21);
      } else if (type === 'sectorClear') {
        [659.25, 880, 1174.66, 1567.98].forEach(function(freq, i) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, t + i * 0.08);
          g.gain.setValueAtTime(0.2, t + i * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.2);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t + i * 0.08);
          o.stop(t + i * 0.08 + 0.21);
        });
      }
    } catch (e) {}
  }

  // --- 游戏主状态 ---
  var state = {
    running: false,
    sector: 1,
    score: 0,
    anomaliesPurged: 0,
    totalClicks: 0,
    correctClicks: 0,
    timeLeft: 30.0,
    nodes: [],
    particles: [],
    redFlashTimer: 0
  };

  // --- Canvas 渲染引擎 ---
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var cw = 0, ch = 0;

  function resizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    cw = rect.width;
    ch = rect.height;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.resetTransform && ctx.resetTransform();
    ctx.scale(dpr, dpr);
    if (state.running) {
      setupSector(state.sector);
    }
  }
  window.addEventListener('resize', resizeCanvas);

  var sectorVal = document.getElementById('sectorVal');
  var timerVal = document.getElementById('timerVal');
  var anomalyVal = document.getElementById('anomalyVal');

  function updateHUD() {
    if (sectorVal) sectorVal.textContent = '第 ' + state.sector + ' 扇区';
    if (timerVal) {
      timerVal.textContent = Math.max(0, state.timeLeft).toFixed(1) + 's';
      timerVal.style.color = state.timeLeft <= 8.0 ? '#ff007f' : '#fbc531';
    }
    var foundInSector = 0;
    var totalInSector = 0;
    for (var i = 0; i < state.nodes.length; i++) {
      if (state.nodes[i].isAnomaly) {
        totalInSector++;
        if (state.nodes[i].purged) foundInSector++;
      }
    }
    if (anomalyVal) anomalyVal.textContent = foundInSector + ' / ' + totalInSector;
  }

  // --- 生成扇区全息网格 ---
  var ICONS = ['⬢', '⚡', '❖', '⛊', '◈', '▲'];

  function setupSector(sec) {
    state.nodes = [];
    var rows = 4;
    var cols = 4;
    if (sec >= 3) { rows = 5; cols = 4; }

    var marginX = 24;
    var marginTop = 70;
    var marginBottom = 40;
    var gridW = cw - marginX * 2;
    var gridH = ch - marginTop - marginBottom;

    var cellW = gridW / cols;
    var cellH = gridH / rows;

    var baseIcon = ICONS[(sec - 1) % ICONS.length];
    var altIcon = ICONS[sec % ICONS.length];

    var totalCells = rows * cols;
    var anomalyCount = Math.min(5, 2 + Math.floor(sec / 2));
    var anomalyIndices = {};

    while (Object.keys(anomalyIndices).length < anomalyCount) {
      var rIdx = Math.floor(Math.random() * totalCells);
      anomalyIndices[rIdx] = true;
    }

    var idx = 0;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var isAnom = !!anomalyIndices[idx];
        var cx = marginX + c * cellW + cellW / 2;
        var cy = marginTop + r * cellH + cellH / 2;

        state.nodes.push({
          x: cx,
          y: cy,
          w: cellW * 0.84,
          h: cellH * 0.84,
          icon: isAnom ? altIcon : baseIcon,
          isAnomaly: isAnom,
          purged: false,
          color: isAnom ? '#ff007f' : '#00f2fe',
          jitter: isAnom ? Math.random() * Math.PI : 0
        });
        idx++;
      }
    }
  }

  // --- 点击判定 ---
  function handleNodeClick(clickX, clickY) {
    if (!state.running) return;

    state.totalClicks++;

    var hitNode = null;
    for (var i = 0; i < state.nodes.length; i++) {
      var n = state.nodes[i];
      if (
        clickX >= n.x - n.w / 2 && clickX <= n.x + n.w / 2 &&
        clickY >= n.y - n.h / 2 && clickY <= n.y + n.h / 2
      ) {
        hitNode = n;
        break;
      }
    }

    if (hitNode) {
      if (hitNode.isAnomaly && !hitNode.purged) {
        // 命中异常！
        hitNode.purged = true;
        state.correctClicks++;
        state.anomaliesPurged++;
        state.score += 250;
        playSound('found');

        // 喷射清除火花
        for (var p = 0; p < 18; p++) {
          var a = Math.random() * Math.PI * 2;
          var sp = 50 + Math.random() * 100;
          state.particles.push({
            x: hitNode.x,
            y: hitNode.y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: 0.5,
            decay: 2.0,
            color: '#00f2fe',
            size: 3 + Math.random() * 3
          });
        }

        checkSectorClear();
      } else if (!hitNode.isAnomaly) {
        // 误点正常节点！罚时
        playSound('wrong');
        state.timeLeft = Math.max(0, state.timeLeft - 4.0);
        state.redFlashTimer = 0.25;
      }
    }

    updateHUD();
  }

  function checkSectorClear() {
    var allPurged = true;
    for (var i = 0; i < state.nodes.length; i++) {
      if (state.nodes[i].isAnomaly && !state.nodes[i].purged) {
        allPurged = false;
        break;
      }
    }

    if (allPurged) {
      playSound('sectorClear');
      state.score += 1000;
      state.sector++;
      state.timeLeft = Math.min(45, state.timeLeft + 15.0);
      setupSector(state.sector);
      updateHUD();
    }
  }

  // --- 更新与循环 ---
  function update(dt) {
    if (!state.running) return;

    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      endGame();
      return;
    }

    if (state.redFlashTimer > 0) {
      state.redFlashTimer -= dt;
    }

    // 粒子更新
    for (var p = state.particles.length - 1; p >= 0; p--) {
      var pt = state.particles[p];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= pt.decay * dt;
      if (pt.life <= 0) state.particles.splice(p, 1);
    }

    updateHUD();
  }

  // --- 画面渲染 ---
  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    // 1. 背景流光网络
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.04)';
    ctx.lineWidth = 1;
    for (var x = 0; x < cw; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ch);
      ctx.stroke();
    }

    // 2. 绘制全息节点
    var nowSec = performance.now() / 1000;
    for (var i = 0; i < state.nodes.length; i++) {
      var n = state.nodes[i];
      ctx.save();
      ctx.translate(n.x, n.y);

      if (n.purged) {
        // 已排查异常：高亮纯绿修复状态
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
        ctx.beginPath();
        ctx.roundRect(-n.w / 2, -n.h / 2, n.w, n.h, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✔', 0, 0);
      } else {
        // 节点外框
        var isGlitched = n.isAnomaly;
        ctx.strokeStyle = isGlitched ? '#ff007f' : '#00f2fe';
        ctx.lineWidth = 1.5;
        ctx.fillStyle = 'rgba(16, 20, 42, 0.75)';
        ctx.shadowBlur = isGlitched ? 14 : 6;
        ctx.shadowColor = ctx.strokeStyle;

        ctx.beginPath();
        ctx.roundRect(-n.w / 2, -n.h / 2, n.w, n.h, 8);
        ctx.fill();
        ctx.stroke();

        // 内部符号
        ctx.fillStyle = isGlitched ? '#ff007f' : '#ffffff';
        ctx.font = '22px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 异常节点微小抖动偏移
        var jx = isGlitched ? Math.sin(nowSec * 10 + n.jitter) * 1.5 : 0;
        ctx.fillText(n.icon, jx, 0);
      }

      ctx.restore();
    }

    // 3. 粒子更新
    for (var pt = 0; pt < state.particles.length; pt++) {
      var pObj = state.particles[pt];
      ctx.save();
      ctx.globalAlpha = Math.max(0, pObj.life);
      ctx.fillStyle = pObj.color;
      ctx.beginPath();
      ctx.arc(pObj.x, pObj.y, pObj.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 4. 警报红闪滤镜
    if (state.redFlashTimer > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 0, 127, 0.22)';
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
    }
  }

  var lastTime = 0;
  function gameLoop(time) {
    if (!lastTime) lastTime = time;
    var dt = (time - lastTime) / 1000;
    lastTime = time;
    if (dt > 0.1) dt = 0.1;

    update(dt);
    render();
    requestAnimationFrame(gameLoop);
  }

  // --- 结束与重开 ---
  function endGame() {
    state.running = false;
    var overOverlay = document.getElementById('overOverlay');
    var finalScore = document.getElementById('finalScore');
    var finalSectors = document.getElementById('finalSectors');
    var finalAnomalies = document.getElementById('finalAnomalies');
    var finalAcc = document.getElementById('finalAcc');

    var acc = state.totalClicks > 0 ? Math.round((state.correctClicks / state.totalClicks) * 100) : 100;

    if (finalScore) finalScore.textContent = state.score;
    if (finalSectors) finalSectors.textContent = state.sector;
    if (finalAnomalies) finalAnomalies.textContent = state.anomaliesPurged;
    if (finalAcc) finalAcc.textContent = acc + '%';

    if (overOverlay) overOverlay.classList.remove('hidden');

    if (window.GameStore) {
      var saved = window.GameStore.get(GAME_ID) || {};
      if (!saved.highScore || state.score > saved.highScore) {
        window.GameStore.save(GAME_ID, {
          highScore: state.score,
          sector: state.sector,
          anomalies: state.anomaliesPurged,
          date: Date.now()
        });
      }
    }
  }

  function startGame() {
    getAudioContext();
    state.running = true;
    state.sector = 1;
    state.score = 0;
    state.anomaliesPurged = 0;
    state.totalClicks = 0;
    state.correctClicks = 0;
    state.timeLeft = 30.0;
    state.particles = [];
    state.redFlashTimer = 0;
    setupSector(1);

    updateHUD();

    var startOverlay = document.getElementById('startOverlay');
    var overOverlay = document.getElementById('overOverlay');
    if (startOverlay) startOverlay.classList.add('hidden');
    if (overOverlay) overOverlay.classList.add('hidden');
  }

  // --- 交互点击事件 ---
  canvas.addEventListener('pointerdown', function(e) {
    if (!state.running) return;
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    handleNodeClick(x, y);
  });

  var startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.addEventListener('click', startGame);

  var retryBtn = document.getElementById('retryBtn');
  if (retryBtn) retryBtn.addEventListener('click', startGame);

  resizeCanvas();
  requestAnimationFrame(gameLoop);
})();
