/**
 * OmniGame - 饼干点点乐 (Cookie Clicker)
 * Pure vanilla JS, incremental idle baking, buildings, golden cookies, Web Audio SFX.
 */
(function () {
  'use strict';

  // --- Audio Synthesizer ---
  var AudioSys = {
    ctx: null,
    enabled: true,
    init: function () {
      if (!this.ctx) {
        try {
          var AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) this.ctx = new AudioCtx();
        } catch (e) {}
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(function () {});
      }
    },
    clickCookie: function () {
      if (!this.enabled || !this.ctx) return;
      try {
        var now = this.ctx.currentTime;
        var osc = this.ctx.createOscillator();
        var gain = this.ctx.createGain();
        osc.type = 'triangle';
        var freq = 340 + Math.random() * 80;
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.04);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.04);
      } catch (e) {}
    },
    buyBuilding: function () {
      if (!this.enabled || !this.ctx) return;
      var notes = [523.25, 659.25, 783.99];
      var self = this;
      notes.forEach(function (f, i) {
        try {
          var now = self.ctx.currentTime + i * 0.05;
          var osc = self.ctx.createOscillator();
          var gain = self.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, now);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
          osc.connect(gain);
          gain.connect(self.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.15);
        } catch (e) {}
      });
    },
    goldenCookie: function () {
      if (!this.enabled || !this.ctx) return;
      var notes = [440, 554.37, 659.25, 880, 1108.73];
      var self = this;
      notes.forEach(function (f, i) {
        try {
          var now = self.ctx.currentTime + i * 0.06;
          var osc = self.ctx.createOscillator();
          var gain = self.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, now);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          osc.connect(gain);
          gain.connect(self.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.25);
        } catch (e) {}
      });
    }
  };

  // --- Buildings Definition ---
  var BUILDINGS = [
    { id: 'cursor', name: '自动点击器', icon: '👆', baseCost: 15, baseCPS: 0.1, count: 0 },
    { id: 'grandma', name: '老奶奶工坊', icon: '👵', baseCost: 100, baseCPS: 1, count: 0 },
    { id: 'farm', name: '可可农场', icon: '🌾', baseCost: 1100, baseCPS: 8, count: 0 },
    { id: 'mine', name: '白糖矿井', icon: '⛏️', baseCost: 12000, baseCPS: 47, count: 0 },
    { id: 'factory', name: '曲奇烘焙厂', icon: '🏭', baseCost: 130000, baseCPS: 260, count: 0 },
    { id: 'bank', name: '甜点储蓄银行', icon: '🏦', baseCost: 1400000, baseCPS: 1400, count: 0 }
  ];

  // --- Number Formatter ---
  function formatNum(n) {
    if (n < 1000) return Math.floor(n).toLocaleString();
    if (n < 1000000) return (n / 1000).toFixed(1) + 'k';
    if (n < 1000000000) return (n / 1000000).toFixed(2) + 'M';
    return (n / 1000000000).toFixed(2) + 'B';
  }

  // --- State ---
  var state = {
    cookies: 0,
    totalEarned: 0,
    cps: 0,
    clickPower: 1,
    frenzyMultiplier: 1,
    buildings: JSON.parse(JSON.stringify(BUILDINGS))
  };

  // --- DOM Elements ---
  var elements = {
    cookiesCountText: document.getElementById('cookiesCountText'),
    cpsText: document.getElementById('cpsText'),
    bigCookie: document.getElementById('bigCookie'),
    floatingNumbers: document.getElementById('floatingNumbers'),
    buildingsList: document.getElementById('buildingsList'),
    soundBtn: document.getElementById('soundBtn'),
    resetBtn: document.getElementById('resetBtn'),
    goldenCookie: document.getElementById('goldenCookie')
  };

  // --- Persistence ---
  var SAVE_KEY = 'omg:save:cookie-clicker';

  function saveGame() {
    try {
      var data = {
        cookies: state.cookies,
        totalEarned: state.totalEarned,
        buildings: state.buildings.map(function (b) { return { id: b.id, count: b.count }; })
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function loadGame() {
    try {
      var saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        var data = JSON.parse(saved);
        state.cookies = data.cookies || 0;
        state.totalEarned = data.totalEarned || 0;
        if (Array.isArray(data.buildings)) {
          data.buildings.forEach(function (sb) {
            var b = state.buildings.find(function (x) { return x.id === sb.id; });
            if (b) b.count = sb.count || 0;
          });
        }
      }
    } catch (e) {}
  }

  // --- CPS Calculation ---
  function updateCPS() {
    var total = 0;
    state.buildings.forEach(function (b) {
      total += b.count * b.baseCPS;
    });
    state.cps = total * state.frenzyMultiplier;
    elements.cpsText.textContent = formatNum(state.cps);
  }

  function getBuildingPrice(b) {
    return Math.floor(b.baseCost * Math.pow(1.15, b.count));
  }

  // --- Big Cookie Click ---
  function onCookieClick(e) {
    AudioSys.init();
    AudioSys.clickCookie();

    var earned = state.clickPower * state.frenzyMultiplier;
    state.cookies += earned;
    state.totalEarned += earned;

    // Bounce animation
    elements.bigCookie.style.transform = 'scale(0.88)';
    setTimeout(function () {
      elements.bigCookie.style.transform = 'scale(1)';
    }, 70);

    // Floating number
    var rect = elements.bigCookie.getBoundingClientRect();
    var areaRect = document.getElementById('cookieArea').getBoundingClientRect();
    var clickX = (e.clientX || (rect.left + rect.width / 2)) - areaRect.left + (Math.random() - 0.5) * 30;
    var clickY = (e.clientY || (rect.top + rect.height / 2)) - areaRect.top + (Math.random() - 0.5) * 20;

    var numEl = document.createElement('div');
    numEl.className = 'float-num';
    numEl.textContent = '+' + earned;
    numEl.style.left = clickX + 'px';
    numEl.style.top = clickY + 'px';
    elements.floatingNumbers.appendChild(numEl);

    setTimeout(function () {
      numEl.remove();
    }, 800);

    updateUI();
  }

  // --- Shop Purchase ---
  function buyBuilding(b) {
    var price = getBuildingPrice(b);
    if (state.cookies >= price) {
      AudioSys.init();
      AudioSys.buyBuilding();
      state.cookies -= price;
      b.count++;
      updateCPS();
      updateUI();
      saveGame();
    }
  }

  // --- Render Shop ---
  function renderShop() {
    elements.buildingsList.innerHTML = '';
    state.buildings.forEach(function (b) {
      var price = getBuildingPrice(b);
      var canAfford = state.cookies >= price;

      var item = document.createElement('div');
      item.className = 'building-item' + (canAfford ? '' : ' disabled');

      item.innerHTML =
        '<div class="building-info">' +
          '<div class="building-icon">' + b.icon + '</div>' +
          '<div class="building-text">' +
            '<div class="building-name">' + b.name + '</div>' +
            '<div class="building-cps">+' + b.baseCPS + ' CPS</div>' +
          '</div>' +
        '</div>' +
        '<div class="building-right">' +
          '<div class="building-price">🍪 ' + formatNum(price) + '</div>' +
          '<div class="building-count">已拥有: ' + b.count + '</div>' +
        '</div>';

      item.addEventListener('click', function () {
        buyBuilding(b);
      });

      elements.buildingsList.appendChild(item);
    });
  }

  function updateUI() {
    elements.cookiesCountText.textContent = formatNum(state.cookies);
    // Refresh disabled states in shop
    var items = elements.buildingsList.querySelectorAll('.building-item');
    state.buildings.forEach(function (b, idx) {
      var price = getBuildingPrice(b);
      var item = items[idx];
      if (item) {
        if (state.cookies >= price) {
          item.classList.remove('disabled');
        } else {
          item.classList.add('disabled');
        }
        var priceEl = item.querySelector('.building-price');
        var countEl = item.querySelector('.building-count');
        if (priceEl) priceEl.textContent = '🍪 ' + formatNum(price);
        if (countEl) countEl.textContent = '已拥有: ' + b.count;
      }
    });
  }

  // --- Golden Cookie System ---
  function spawnGoldenCookie() {
    var gc = elements.goldenCookie;
    var x = 30 + Math.random() * (window.innerWidth - 100);
    var y = 60 + Math.random() * (window.innerHeight - 150);

    gc.style.left = x + 'px';
    gc.style.top = y + 'px';
    gc.style.display = 'block';

    var disappearTimeout = setTimeout(function () {
      gc.style.display = 'none';
      scheduleNextGoldenCookie();
    }, 12000);

    gc.onclick = function () {
      clearTimeout(disappearTimeout);
      gc.style.display = 'none';
      AudioSys.goldenCookie();

      // Golden Cookie Reward: Instant payout or Frenzy
      if (Math.random() < 0.5) {
        var reward = Math.max(50, Math.floor(state.cps * 60) + 15);
        state.cookies += reward;
        state.totalEarned += reward;
        elements.cookiesCountText.textContent = formatNum(state.cookies);
      } else {
        // Frenzy: 7x for 15 seconds!
        state.frenzyMultiplier = 7;
        updateCPS();
        setTimeout(function () {
          state.frenzyMultiplier = 1;
          updateCPS();
        }, 15000);
      }

      scheduleNextGoldenCookie();
    };
  }

  function scheduleNextGoldenCookie() {
    var delay = 35000 + Math.random() * 45000;
    setTimeout(spawnGoldenCookie, delay);
  }

  // --- Main Tick Loop ---
  setInterval(function () {
    if (state.cps > 0) {
      var gain = state.cps / 10;
      state.cookies += gain;
      state.totalEarned += gain;
      updateUI();
    }
  }, 100);

  // Auto-save every 3 seconds
  setInterval(saveGame, 3000);

  // --- Event Listeners ---
  elements.bigCookie.addEventListener('click', onCookieClick);

  elements.soundBtn.addEventListener('click', function () {
    AudioSys.enabled = !AudioSys.enabled;
    elements.soundBtn.textContent = AudioSys.enabled ? '🔊' : '🔇';
  });

  elements.resetBtn.addEventListener('click', function () {
    if (confirm('确定要清除饼干存档重新开始吗？')) {
      localStorage.removeItem(SAVE_KEY);
      state.cookies = 0;
      state.totalEarned = 0;
      state.buildings = JSON.parse(JSON.stringify(BUILDINGS));
      updateCPS();
      renderShop();
      updateUI();
    }
  });

  // Init
  loadGame();
  updateCPS();
  renderShop();
  updateUI();
  scheduleNextGoldenCookie();
})();
