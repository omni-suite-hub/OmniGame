// games/spot-differences/game.js - Spot the Differences (两图找茬)
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

      if (type === 'found') {
        [523, 659, 784, 1046].forEach(function(f, idx) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'sine';
          o.frequency.setValueAtTime(f, now + idx * 0.05);
          g.gain.setValueAtTime(0.2, now + idx * 0.05);
          g.gain.linearRampToValueAtTime(0.01, now + idx * 0.05 + 0.1);
          o.start(now + idx * 0.05);
          o.stop(now + idx * 0.05 + 0.1);
        });
      } else if (type === 'miss') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.linearRampToValueAtTime(90, now + 0.15);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'hint') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.18);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
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
  var diffEl = document.getElementById('diff-el');
  var timeEl = document.getElementById('time-el');
  var levelEl = document.getElementById('level-el');
  var btnHint = document.getElementById('btn-hint');
  var btnRestartRound = document.getElementById('btn-restart-round');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc = document.getElementById('modal-desc');
  var btnNext = document.getElementById('btn-next');

  var currentLevel = 1;
  var maxLevels = 3;
  var timeLeft = 60;
  var hintsLeft = 2;
  var isGameOver = false;
  var lastTime = 0;

  var differences = []; // array of { normX, normY, radius, found }
  var misses = []; // array of { x, y, life }
  var isVerticalSplit = false;

  function resizeCanvas() {
    var container = document.getElementById('container');
    var maxW = container.clientWidth - 20;
    var maxH = container.clientHeight - 20;

    // Decide if side-by-side or stacked top-and-bottom
    if (maxW > 540) {
      isVerticalSplit = false;
      var w = Math.min(maxW, 680);
      var h = Math.min(maxH, w * 0.52);
      canvas.width = Math.floor(w);
      canvas.height = Math.floor(h);
    } else {
      isVerticalSplit = true;
      var h2 = Math.min(maxH, 560);
      var w2 = Math.min(maxW, h2 * 0.65);
      canvas.width = Math.floor(w2);
      canvas.height = Math.floor(h2);
    }

    render();
  }
  window.addEventListener('resize', resizeCanvas);

  function initLevel(lvl) {
    currentLevel = lvl;
    timeLeft = 60;
    hintsLeft = 2;
    isGameOver = false;
    misses = [];
    btnHint.textContent = '💡 提示 (剩余 ' + hintsLeft + ' 次)';

    // Normalized difference locations (0.0 to 1.0 within a single scene pane)
    if (lvl === 1) {
      // Scene 1: Country Cottage
      differences = [
        { normX: 0.22, normY: 0.2,  radius: 0.08, found: false, name: '烟囱青烟' },
        { normX: 0.78, normY: 0.18, radius: 0.08, found: false, name: '太阳墨镜' },
        { normX: 0.42, normY: 0.62, radius: 0.07, found: false, name: '窗帘色彩' },
        { normX: 0.58, normY: 0.38, radius: 0.07, found: false, name: '屋顶小鸟' },
        { normX: 0.82, normY: 0.78, radius: 0.08, found: false, name: '草地红花' }
      ];
    } else if (lvl === 2) {
      // Scene 2: Deep Sea
      differences = [
        { normX: 0.35, normY: 0.38, radius: 0.08, found: false, name: '潜艇舷窗' },
        { normX: 0.72, normY: 0.25, radius: 0.08, found: false, name: '热带鱼群' },
        { normX: 0.18, normY: 0.75, radius: 0.08, found: false, name: '海底珊瑚' },
        { normX: 0.55, normY: 0.78, radius: 0.08, found: false, name: '海龟海星' },
        { normX: 0.82, normY: 0.68, radius: 0.08, found: false, name: '藏宝箱' }
      ];
    } else {
      // Scene 3: Space Colony
      differences = [
        { normX: 0.22, normY: 0.25, radius: 0.08, found: false, name: '背景土星环' },
        { normX: 0.75, normY: 0.35, radius: 0.08, found: false, name: '火箭尾焰' },
        { normX: 0.48, normY: 0.58, radius: 0.08, found: false, name: '雷达天线' },
        { normX: 0.82, normY: 0.78, radius: 0.08, found: false, name: '外星机器人' },
        { normX: 0.18, normY: 0.75, radius: 0.08, found: false, name: '月面徽旗' }
      ];
    }

    updateHUD();
    render();
  }

  function updateHUD() {
    var foundCount = differences.filter(function(d) { return d.found; }).length;
    diffEl.textContent = foundCount + ' / 5';
    timeEl.textContent = Math.ceil(timeLeft) + 's';
    levelEl.textContent = currentLevel + ' / ' + maxLevels;
  }

  function getPanelBounds(isSecond) {
    if (!isVerticalSplit) {
      var pw = canvas.width / 2;
      return {
        x: isSecond ? pw : 0,
        y: 0,
        w: pw,
        h: canvas.height
      };
    } else {
      var ph = canvas.height / 2;
      return {
        x: 0,
        y: isSecond ? ph : 0,
        w: canvas.width,
        h: ph
      };
    }
  }

  function drawScene(ctx, bounds, isModified) {
    var bx = bounds.x;
    var by = bounds.y;
    var bw = bounds.w;
    var bh = bounds.h;

    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bw, bh);
    ctx.clip();

    if (currentLevel === 1) {
      // 1. Sky & Sun
      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(bx, by, bw, bh * 0.65);

      // Sun
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(bx + bw * 0.78, by + bh * 0.18, bw * 0.08, 0, Math.PI * 2);
      ctx.fill();

      if (isModified) {
        // Sunglasses on sun
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(bx + bw * 0.73, by + bh * 0.16, bw * 0.1, bh * 0.035);
      }

      // Cloud
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(bx + bw * 0.25, by + bh * 0.15, bw * 0.06, 0, Math.PI * 2);
      ctx.arc(bx + bw * 0.32, by + bh * 0.14, bw * 0.08, 0, Math.PI * 2);
      ctx.arc(bx + bw * 0.38, by + bh * 0.16, bw * 0.05, 0, Math.PI * 2);
      ctx.fill();

      // Chimney smoke
      ctx.fillStyle = 'rgba(226, 232, 240, 0.7)';
      ctx.beginPath();
      ctx.arc(bx + bw * 0.22, by + bh * 0.2, bw * 0.04, 0, Math.PI * 2);
      if (!isModified) {
        ctx.arc(bx + bw * 0.20, by + bh * 0.14, bw * 0.05, 0, Math.PI * 2);
        ctx.arc(bx + bw * 0.18, by + bh * 0.08, bw * 0.06, 0, Math.PI * 2);
      }
      ctx.fill();

      // 2. Hills & Grass
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(bx, by + bh * 0.65, bw, bh * 0.35);

      // House Body
      ctx.fillStyle = '#fde047';
      ctx.fillRect(bx + bw * 0.22, by + bh * 0.45, bw * 0.38, bh * 0.3);

      // Chimney
      ctx.fillStyle = '#b45309';
      ctx.fillRect(bx + bw * 0.22, by + bh * 0.26, bw * 0.05, bh * 0.12);

      // Roof
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.moveTo(bx + bw * 0.18, by + bh * 0.45);
      ctx.lineTo(bx + bw * 0.41, by + bh * 0.28);
      ctx.lineTo(bx + bw * 0.64, by + bh * 0.45);
      ctx.closePath();
      ctx.fill();

      // Bird on roof
      ctx.fillStyle = isModified ? '#eab308' : '#ef4444';
      ctx.beginPath();
      ctx.arc(bx + bw * 0.58, by + bh * 0.38, bw * 0.025, 0, Math.PI * 2);
      ctx.fill();

      // Window with curtains
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(bx + bw * 0.38, by + bh * 0.55, bw * 0.12, bh * 0.14);
      ctx.fillStyle = isModified ? '#ec4899' : '#0284c7';
      ctx.fillRect(bx + bw * 0.38, by + bh * 0.55, bw * 0.05, bh * 0.14);

      // Grass Flower
      ctx.fillStyle = isModified ? '#ef4444' : '#facc15';
      ctx.beginPath();
      ctx.arc(bx + bw * 0.82, by + bh * 0.78, bw * 0.03, 0, Math.PI * 2);
      ctx.fill();
    } else if (currentLevel === 2) {
      // Scene 2: Deep Sea Aquarium
      ctx.fillStyle = '#0369a1';
      ctx.fillRect(bx, by, bw, bh);

      // Sandy seabed
      ctx.fillStyle = '#ca8a04';
      ctx.fillRect(bx, by + bh * 0.78, bw, bh * 0.22);

      // Submarine
      ctx.fillStyle = '#eab308';
      ctx.beginPath();
      ctx.ellipse(bx + bw * 0.38, by + bh * 0.4, bw * 0.18, bh * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      // Porthole
      ctx.fillStyle = isModified ? '#22c55e' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(bx + bw * 0.35, by + bh * 0.38, bw * 0.04, 0, Math.PI * 2);
      ctx.fill();

      // Fish
      var fishCount = isModified ? 2 : 3;
      ctx.fillStyle = '#f97316';
      for (var f = 0; f < fishCount; f++) {
        var fx = bx + bw * (0.68 + f * 0.05);
        var fy = by + bh * (0.22 + f * 0.04);
        ctx.beginPath();
        ctx.arc(fx, fy, bw * 0.02, 0, Math.PI * 2);
        ctx.fill();
      }

      // Coral
      ctx.fillStyle = isModified ? '#f97316' : '#a855f7';
      ctx.fillRect(bx + bw * 0.16, by + bh * 0.72, bw * 0.06, bh * 0.12);

      // Turtle
      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.ellipse(bx + bw * 0.55, by + bh * 0.78, bw * 0.06, bh * 0.04, 0, 0, Math.PI * 2);
      ctx.fill();
      if (isModified) {
        ctx.fillStyle = '#ef4444';
        ctx.fillText('⭐', bx + bw * 0.55, by + bh * 0.76);
      }

      // Treasure Chest
      ctx.fillStyle = '#78350f';
      ctx.fillRect(bx + bw * 0.8, by + bh * 0.72, bw * 0.08, bh * 0.07);
      if (isModified) {
        ctx.fillStyle = '#facc15';
        ctx.fillRect(bx + bw * 0.81, by + bh * 0.69, bw * 0.06, bh * 0.03);
      }
    } else {
      // Scene 3: Space Colony
      ctx.fillStyle = '#020617';
      ctx.fillRect(bx, by, bw, bh);

      // Moon ground
      ctx.fillStyle = '#475569';
      ctx.fillRect(bx, by + bh * 0.7, bw, bh * 0.3);

      // Planet / Earth
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(bx + bw * 0.22, by + bh * 0.25, bw * 0.08, 0, Math.PI * 2);
      ctx.fill();
      if (isModified) {
        // Saturn ring
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(bx + bw * 0.22, by + bh * 0.25, bw * 0.12, bh * 0.025, 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Rocket
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(bx + bw * 0.72, by + bh * 0.35, bw * 0.06, bh * 0.16);
      if (isModified) {
        // No flame
      } else {
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(bx + bw * 0.72, by + bh * 0.51);
        ctx.lineTo(bx + bw * 0.78, by + bh * 0.51);
        ctx.lineTo(bx + bw * 0.75, by + bh * 0.57);
        ctx.closePath();
        ctx.fill();
      }

      // Radar dish
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      var dAng = isModified ? Math.PI * 0.25 : -Math.PI * 0.25;
      ctx.arc(bx + bw * 0.48, by + bh * 0.58, bw * 0.05, dAng - 0.8, dAng + 0.8);
      ctx.stroke();

      // Alien / Robot
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(isModified ? '🤖' : '👽', bx + bw * 0.82, by + bh * 0.78);

      // Flag
      ctx.fillText(isModified ? '🚀' : '🚩', bx + bw * 0.18, by + bh * 0.75);
    }

    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var p1 = getPanelBounds(false);
    var p2 = getPanelBounds(true);

    // Draw left/top original panel
    drawScene(ctx, p1, false);
    // Draw right/bottom modified panel
    drawScene(ctx, p2, true);

    // Divider line
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (!isVerticalSplit) {
      ctx.moveTo(canvas.width / 2, 0);
      ctx.lineTo(canvas.width / 2, canvas.height);
    } else {
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
    }
    ctx.stroke();

    // Draw found difference circles on BOTH panels
    differences.forEach(function(d) {
      if (d.found) {
        [p1, p2].forEach(function(p) {
          var cx = p.x + d.normX * p.w;
          var cy = p.y + d.normY * p.h;
          var cr = d.radius * Math.min(p.w, p.h);

          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(cx, cy, cr, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
          ctx.fill();
        });
      }
    });

    // Draw Miss Red X marks
    for (var m = misses.length - 1; m >= 0; m--) {
      var miss = misses[m];
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(miss.x - 12, miss.y - 12);
      ctx.lineTo(miss.x + 12, miss.y + 12);
      ctx.moveTo(miss.x + 12, miss.y - 12);
      ctx.lineTo(miss.x - 12, miss.y + 12);
      ctx.stroke();
    }
  }

  function handleTap(clientX, clientY) {
    if (isGameOver) return;
    var rect = canvas.getBoundingClientRect();
    var clickX = clientX - rect.left;
    var clickY = clientY - rect.top;

    var p1 = getPanelBounds(false);
    var p2 = getPanelBounds(true);

    // Find which panel was clicked
    var targetPanel = null;
    if (clickX >= p1.x && clickX <= p1.x + p1.w && clickY >= p1.y && clickY <= p1.y + p1.h) {
      targetPanel = p1;
    } else if (clickX >= p2.x && clickX <= p2.x + p2.w && clickY >= p2.y && clickY <= p2.y + p2.h) {
      targetPanel = p2;
    }

    if (!targetPanel) return;

    // Convert click to normalized coordinate
    var normX = (clickX - targetPanel.x) / targetPanel.w;
    var normY = (clickY - targetPanel.y) / targetPanel.h;

    var hit = false;
    differences.forEach(function(d) {
      if (!d.found) {
        var distNorm = Math.hypot(normX - d.normX, normY - d.normY);
        if (distNorm < d.radius * 1.5) {
          d.found = true;
          hit = true;
          playSound('found');
          updateHUD();

          // Check if all found
          var allFound = differences.every(function(diff) { return diff.found; });
          if (allFound) {
            isGameOver = true;
            playSound('win');
            modalTitle.textContent = '🏆 火眼金睛！';
            modalDesc.textContent = '全部 5 处差异找齐！';
            btnNext.textContent = currentLevel < maxLevels ? '进入下一关' : '通关重玩';
            modal.classList.remove('hidden');
          }
        }
      }
    });

    if (!hit) {
      playSound('miss');
      timeLeft = Math.max(0, timeLeft - 5); // 5s penalty
      misses.push({ x: clickX, y: clickY, life: 0.5 });
      updateHUD();
    }

    render();
  }

  function useHint() {
    if (hintsLeft <= 0 || isGameOver) return;
    var remaining = differences.filter(function(d) { return !d.found; });
    if (remaining.length === 0) return;

    hintsLeft--;
    btnHint.textContent = '💡 提示 (剩余 ' + hintsLeft + ' 次)';
    playSound('hint');

    var target = remaining[0];
    target.found = true;
    updateHUD();
    render();

    var allFound = differences.every(function(diff) { return diff.found; });
    if (allFound) {
      isGameOver = true;
      playSound('win');
      modalTitle.textContent = '🏆 火眼金睛！';
      modalDesc.textContent = '全部 5 处差异已找齐！';
      btnNext.textContent = currentLevel < maxLevels ? '进入下一关' : '通关重玩';
      modal.classList.remove('hidden');
    }
  }

  function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    var dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    if (!isGameOver) {
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        isGameOver = true;
        playSound('miss');
        modalTitle.textContent = '⏱️ 时间耗尽！';
        modalDesc.textContent = '未能及时找齐所有差异！';
        btnNext.textContent = '再试一次';
        modal.classList.remove('hidden');
      }
      updateHUD();
    }

    // Update misses
    for (var m = misses.length - 1; m >= 0; m--) {
      misses[m].life -= dt;
      if (misses[m].life <= 0) misses.splice(m, 1);
    }

    render();
    requestAnimationFrame(gameLoop);
  }

  canvas.addEventListener('click', function(e) {
    handleTap(e.clientX, e.clientY);
  });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
      handleTap(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });

  btnHint.addEventListener('click', useHint);
  btnRestartRound.addEventListener('click', function() { initLevel(currentLevel); });

  btnNext.addEventListener('click', function() {
    modal.classList.add('hidden');
    if (modalTitle.textContent.indexOf('火眼金睛') !== -1 && currentLevel < maxLevels) {
      initLevel(currentLevel + 1);
    } else {
      initLevel(1);
    }
  });

  resizeCanvas();
  initLevel(1);
  requestAnimationFrame(gameLoop);

})();
