(function () {
  'use strict';

  var catchesEl = document.getElementById('catches-el');
  var coinsEl = document.getElementById('coins-el');
  var bobberEl = document.getElementById('bobber');
  var biteAlertEl = document.getElementById('bite-alert');
  var reelUI = document.getElementById('reel-ui');
  var targetZone = document.getElementById('target-zone');
  var reelFish = document.getElementById('reel-fish');
  var progTrack = document.getElementById('prog-track');
  var progFill = document.getElementById('prog-fill');
  var btnCast = document.getElementById('btn-cast');
  var catchModal = document.getElementById('catch-modal');
  var modalFishName = document.getElementById('modal-fish-name');
  var modalFishDesc = document.getElementById('modal-fish-desc');
  var btnModalOk = document.getElementById('btn-modal-ok');

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

      if (type === 'splash') {
        var buffer = actx.createBuffer(1, actx.sampleRate * 0.2, actx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.2;
        var src = actx.createBufferSource();
        src.buffer = buffer;
        var filter = actx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, now);
        var g = actx.createGain();
        g.gain.setValueAtTime(0.2, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        src.connect(filter);
        filter.connect(g);
        g.connect(actx.destination);
        src.start(now);
      } else if (type === 'bite') {
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.setValueAtTime(1200, now + 0.08);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'catch') {
        [523, 659, 784, 1046, 1318].forEach(function (f, i) {
          var o = actx.createOscillator();
          var gn = actx.createGain();
          o.frequency.setValueAtTime(f, now + i * 0.1);
          gn.gain.setValueAtTime(0.18, now + i * 0.1);
          gn.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);
          o.connect(gn);
          gn.connect(actx.destination);
          o.start(now + i * 0.1);
          o.stop(now + i * 0.1 + 0.35);
        });
      }
    } catch (e) {}
  }

  var FISH_TYPES = [
    { name: '草鱼', icon: '🐟', minW: 1.2, maxW: 3.5, price: 15 },
    { name: '大嘴鲈鱼', icon: '🐠', minW: 2.0, maxW: 4.8, price: 28 },
    { name: '虹鳟鱼', icon: '🐡', minW: 3.0, maxW: 6.0, price: 45 },
    { name: '锦鲤王', icon: '👑', minW: 5.5, maxW: 12.0, price: 90 }
  ];

  var state = 'IDLE'; // 'IDLE', 'WAITING', 'BITE', 'REELING'
  var catchesCount = 0;
  var coins = 0;
  var biteTimeout = null;

  // Reeling mechanics
  var targetY = 80;
  var targetVelocity = 0;
  var fishY = 80;
  var fishTargetY = 80;
  var reelProgress = 30; // 0..100
  var isHolding = false;
  var reelLoop = null;

  function castRod() {
    state = 'WAITING';
    btnCast.textContent = '静候 ⏳';
    btnCast.style.background = '#64748b';
    bobberEl.style.display = 'block';
    bobberEl.style.top = '40%';
    bobberEl.classList.remove('bite');
    biteAlertEl.style.display = 'none';
    playSound('splash');

    var waitTime = 2000 + Math.random() * 2500;
    biteTimeout = setTimeout(function () {
      triggerBite();
    }, waitTime);
  }

  function triggerBite() {
    state = 'BITE';
    playSound('bite');
    bobberEl.classList.add('bite');
    biteAlertEl.style.display = 'block';
    btnCast.textContent = '提竿！🎣';
    btnCast.style.background = '#ef4444';

    biteTimeout = setTimeout(function () {
      if (state === 'BITE') {
        // Escaped!
        state = 'IDLE';
        bobberEl.style.display = 'none';
        biteAlertEl.style.display = 'none';
        btnCast.textContent = '抛竿 🎣';
        btnCast.style.background = '#f59e0b';
        alert('鱼儿跑脱了！下次手速要更快哦。');
      }
    }, 1800);
  }

  function startReeling() {
    state = 'REELING';
    clearTimeout(biteTimeout);
    biteAlertEl.style.display = 'none';
    reelUI.style.display = 'flex';
    progTrack.style.display = 'block';
    btnCast.textContent = '收线 🌀';
    btnCast.style.background = '#22c55e';

    targetY = 100;
    fishY = 100;
    fishTargetY = 100;
    reelProgress = 40;

    reelLoop = setInterval(updateReeling, 30);
  }

  function updateReeling() {
    // Player controls target zone: rises when holding, drops when not
    if (isHolding) {
      targetVelocity -= 1.2;
    } else {
      targetVelocity += 1.0;
    }
    targetVelocity *= 0.85;
    targetY += targetVelocity;
    targetY = Math.max(0, Math.min(160, targetY));
    targetZone.style.top = targetY + 'px';

    // Fish moves erratically
    if (Math.random() < 0.05) {
      fishTargetY = Math.random() * 160;
    }
    fishY += (fishTargetY - fishY) * 0.08;
    reelFish.style.top = fishY + 'px';

    // Check overlap: targetZone height is 60px
    var isInside = (fishY >= targetY && fishY <= targetY + 60);
    if (isInside) {
      reelProgress += 0.8;
      targetZone.style.background = 'rgba(34, 197, 94, 0.7)';
    } else {
      reelProgress -= 0.6;
      targetZone.style.background = 'rgba(239, 68, 68, 0.5)';
    }

    reelProgress = Math.max(0, Math.min(100, reelProgress));
    progFill.style.height = reelProgress + '%';

    if (reelProgress >= 100) {
      // Caught!
      finishCatch(true);
    } else if (reelProgress <= 0) {
      // Lost!
      finishCatch(false);
    }
  }

  function finishCatch(success) {
    clearInterval(reelLoop);
    reelUI.style.display = 'none';
    progTrack.style.display = 'none';
    bobberEl.style.display = 'none';
    state = 'IDLE';
    btnCast.textContent = '抛竿 🎣';
    btnCast.style.background = '#f59e0b';

    if (success) {
      playSound('catch');
      var fish = FISH_TYPES[Math.floor(Math.random() * FISH_TYPES.length)];
      var weight = (fish.minW + Math.random() * (fish.maxW - fish.minW)).toFixed(1);
      catchesCount++;
      coins += fish.price;
      catchesEl.textContent = catchesCount + ' 尾';
      coinsEl.textContent = '🪙 ' + coins;

      modalFishName.textContent = fish.icon + ' 捕获：' + fish.name + '！';
      modalFishDesc.textContent = '重量: ' + weight + ' kg | 售价: 🪙 ' + fish.price + ' 金币';
      catchModal.classList.remove('hidden');
    } else {
      alert('绷线脱钩！鱼儿游走逃入深水。');
    }
  }

  btnModalOk.addEventListener('click', function () {
    catchModal.classList.add('hidden');
  });

  // Action button handling
  var onActionDown = function (e) {
    e.preventDefault();
    getAudioCtx();
    if (state === 'IDLE') {
      castRod();
    } else if (state === 'BITE') {
      startReeling();
    } else if (state === 'REELING') {
      isHolding = true;
    }
  };

  var onActionUp = function (e) {
    e.preventDefault();
    if (state === 'REELING') {
      isHolding = false;
    }
  };

  btnCast.addEventListener('mousedown', onActionDown);
  window.addEventListener('mouseup', onActionUp);

  btnCast.addEventListener('touchstart', onActionDown, { passive: false });
  window.addEventListener('touchend', onActionUp, { passive: false });
})();
