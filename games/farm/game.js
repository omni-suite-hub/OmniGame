(function () {
  'use strict';

  var goldEl = document.getElementById('gold-el');
  var farmGridEl = document.getElementById('farm-grid');
  var seedsBarEl = document.getElementById('seeds-bar');

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

      if (type === 'plant') {
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'water') {
        var buffer = actx.createBuffer(1, actx.sampleRate * 0.15, actx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.1;
        var src = actx.createBufferSource();
        src.buffer = buffer;
        var filter = actx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, now);
        var g = actx.createGain();
        g.gain.setValueAtTime(0.15, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        src.connect(filter);
        filter.connect(g);
        g.connect(actx.destination);
        src.start(now);
      } else if (type === 'harvest') {
        [523, 659, 784].forEach(function (f, i) {
          var o = actx.createOscillator();
          var gn = actx.createGain();
          o.frequency.setValueAtTime(f, now + i * 0.08);
          gn.gain.setValueAtTime(0.15, now + i * 0.08);
          gn.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.2);
          o.connect(gn);
          gn.connect(actx.destination);
          o.start(now + i * 0.08);
          o.stop(now + i * 0.08 + 0.2);
        });
      }
    } catch (e) {}
  }

  var CROPS = [
    { id: 'carrot', name: '胡萝卜', cost: 5, time: 5, price: 12, icon: '🥕' },
    { id: 'strawberry', name: '草莓', cost: 12, time: 8, price: 28, icon: '🍓' },
    { id: 'corn', name: '玉米', cost: 20, time: 12, price: 48, icon: '🌽' },
    { id: 'watermelon', name: '西瓜', cost: 40, time: 16, price: 95, icon: '🍉' }
  ];

  var gold = 50;
  var currentTool = 'seed'; // 'seed', 'water', 'harvest'
  var selectedCrop = CROPS[0];

  // 9 Plots
  var plots = [];
  for (var i = 0; i < 9; i++) {
    plots.push({
      crop: null,
      plantedAt: 0,
      growDuration: 0,
      watered: false,
      ready: false
    });
  }

  function setupToolBtns() {
    var toolSeed = document.getElementById('tool-seed');
    var toolWater = document.getElementById('tool-water');
    var toolHarvest = document.getElementById('tool-harvest');

    function setActive(tool, btn) {
      currentTool = tool;
      [toolSeed, toolWater, toolHarvest].forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    }

    toolSeed.addEventListener('click', function () { setActive('seed', toolSeed); });
    toolWater.addEventListener('click', function () { setActive('water', toolWater); });
    toolHarvest.addEventListener('click', function () { setActive('harvest', toolHarvest); });
  }

  function renderSeedsBar() {
    seedsBarEl.innerHTML = '';
    CROPS.forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'seed-card' + (selectedCrop === c ? ' selected' : '');
      card.innerHTML = '<span style="font-size:20px;">' + c.icon + '</span>' +
        '<span style="font-size:12px;font-weight:bold;">' + c.name + '</span>' +
        '<span style="font-size:11px;color:#facc15;">🪙 ' + c.cost + '</span>';

      card.addEventListener('click', function () {
        selectedCrop = c;
        renderSeedsBar();
      });
      seedsBarEl.appendChild(card);
    });
  }

  function renderPlots() {
    farmGridEl.innerHTML = '';
    var now = Date.now();

    plots.forEach(function (p, idx) {
      var tile = document.createElement('div');
      tile.className = 'plot-tile' + (p.watered ? ' watered' : '');

      if (!p.crop) {
        tile.innerHTML = '<span style="font-size:22px;opacity:0.3;">🟫</span>';
      } else {
        var elapsed = (now - p.plantedAt) / 1000;
        var remaining = Math.max(0, Math.ceil(p.growDuration - elapsed));

        if (remaining <= 0) {
          p.ready = true;
          tile.innerHTML = '<span class="plot-emoji">' + p.crop.icon + '</span>' +
            '<span class="plot-timer" style="background:#16a34a;color:#fff;">可收获</span>';
        } else {
          p.ready = false;
          var stageEmoji = elapsed < (p.growDuration * 0.5) ? '🌱' : '🌿';
          tile.innerHTML = '<span class="plot-emoji">' + stageEmoji + '</span>' +
            '<span class="plot-timer">' + remaining + 's</span>';
        }
      }

      tile.addEventListener('click', function () {
        handlePlotClick(idx);
      });

      farmGridEl.appendChild(tile);
    });
  }

  function handlePlotClick(idx) {
    getAudioCtx();
    var p = plots[idx];

    if (currentTool === 'seed') {
      if (!p.crop) {
        if (gold >= selectedCrop.cost) {
          gold -= selectedCrop.cost;
          goldEl.textContent = '🪙 ' + gold;
          p.crop = selectedCrop;
          p.plantedAt = Date.now();
          p.growDuration = selectedCrop.time;
          p.watered = false;
          p.ready = false;
          playSound('plant');
          renderPlots();
        } else {
          alert('金币不足以购买此种子！');
        }
      }
    } else if (currentTool === 'water') {
      if (p.crop && !p.watered && !p.ready) {
        p.watered = true;
        // Speeds up remaining duration by cutting 40%
        p.growDuration *= 0.6;
        playSound('water');
        renderPlots();
      }
    } else if (currentTool === 'harvest') {
      if (p.crop && p.ready) {
        gold += p.crop.price;
        goldEl.textContent = '🪙 ' + gold;
        playSound('harvest');
        p.crop = null;
        p.watered = false;
        p.ready = false;
        renderPlots();
      }
    }
  }

  setupToolBtns();
  renderSeedsBar();
  renderPlots();

  setInterval(function () {
    renderPlots();
  }, 1000);
})();
