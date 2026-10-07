(function () {
  'use strict';

  var dayEl = document.getElementById('day-el');
  var moneyEl = document.getElementById('money-el');
  var weatherEl = document.getElementById('weather-el');
  var popularityTip = document.getElementById('popularity-tip');

  var invLemonsEl = document.getElementById('inv-lemons');
  var invSugarEl = document.getElementById('inv-sugar');
  var invIceEl = document.getElementById('inv-ice');
  var invCupsEl = document.getElementById('inv-cups');

  var valLemonsEl = document.getElementById('val-lemons');
  var valSugarEl = document.getElementById('val-sugar');
  var valIceEl = document.getElementById('val-ice');
  var valPriceEl = document.getElementById('val-price');

  var rngLemons = document.getElementById('rng-lemons');
  var rngSugar = document.getElementById('rng-sugar');
  var rngIce = document.getElementById('rng-ice');
  var rngPrice = document.getElementById('rng-price');

  var btnStart = document.getElementById('btn-start');
  var logBox = document.getElementById('log-box');

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

      if (type === 'coin') {
        osc.frequency.setValueAtTime(987.77, now);
        osc.frequency.setValueAtTime(1318.5, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'pour') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'win') {
        [523, 659, 783, 1046, 1318].forEach(function (f, i) {
          var o = actx.createOscillator();
          var g = actx.createGain();
          o.frequency.setValueAtTime(f, now + i * 0.1);
          g.gain.setValueAtTime(0.18, now + i * 0.1);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
          o.connect(g);
          g.connect(actx.destination);
          o.start(now + i * 0.1);
          o.stop(now + i * 0.1 + 0.3);
        });
      }
    } catch (e) {}
  }

  // Game state
  var day = 1;
  var money = 20.0;
  var inventory = {
    lemons: 20,
    sugar: 20,
    ice: 50,
    cups: 30
  };

  var weatherTypes = [
    { text: '☀️ 晴朗 28°C', temp: 28, factor: 1.0, tip: '客流量预期良好' },
    { text: '🔥 酷暑 36°C', temp: 36, factor: 1.6, tip: '极热天气！冰饮需求极其火爆！' },
    { text: '⛅ 多云 24°C', temp: 24, factor: 0.8, tip: '天气温和，客流稍平' },
    { text: '🌧️ 阴雨 19°C', temp: 19, factor: 0.4, tip: '雨天路人较少，注意降价促销' }
  ];
  var currentWeather = weatherTypes[0];

  function updateHUD() {
    dayEl.textContent = day;
    moneyEl.textContent = '$' + money.toFixed(2);
    weatherEl.textContent = currentWeather.text;
    popularityTip.textContent = currentWeather.tip;

    invLemonsEl.textContent = inventory.lemons;
    invSugarEl.textContent = inventory.sugar;
    invIceEl.textContent = inventory.ice;
    invCupsEl.textContent = inventory.cups;
  }

  // Buy buttons
  function buyItem(name, count, cost) {
    getAudioCtx();
    if (money >= cost) {
      money -= cost;
      inventory[name] += count;
      playSound('coin');
      updateHUD();
    } else {
      alert('资金不足，无法购买！');
    }
  }

  document.getElementById('buy-lemons').addEventListener('click', function () { buyItem('lemons', 10, 3.00); });
  document.getElementById('buy-sugar').addEventListener('click', function () { buyItem('sugar', 10, 2.00); });
  document.getElementById('buy-ice').addEventListener('click', function () { buyItem('ice', 50, 1.50); });
  document.getElementById('buy-cups').addEventListener('click', function () { buyItem('cups', 25, 1.00); });

  // Sliders
  rngLemons.addEventListener('input', function () { valLemonsEl.textContent = rngLemons.value; });
  rngSugar.addEventListener('input', function () { valSugarEl.textContent = rngSugar.value; });
  rngIce.addEventListener('input', function () { valIceEl.textContent = rngIce.value; });
  rngPrice.addEventListener('input', function () { valPriceEl.textContent = (rngPrice.value / 100).toFixed(2); });

  // Start Day Simulation
  btnStart.addEventListener('click', function () {
    getAudioCtx();
    var rL = parseInt(rngLemons.value, 10);
    var rS = parseInt(rngSugar.value, 10);
    var rI = parseInt(rngIce.value, 10);
    var price = parseInt(rngPrice.value, 10) / 100;

    // Check how many cups we can make
    var cupsPossible = Math.min(
      Math.floor(inventory.lemons / rL),
      Math.floor(inventory.sugar / rS),
      rI > 0 ? Math.floor(inventory.ice / rI) : 999,
      inventory.cups
    );

    if (cupsPossible <= 0) {
      alert('原料不足！无法按照当前配方制作任何一杯柠檬水，请先进货！');
      return;
    }

    // Potential customers
    var baseCustomers = Math.floor((15 + Math.random() * 20) * currentWeather.factor);
    // Price elasticity: optimal price ~$1.50
    var pricePenalty = Math.max(0.1, 2.0 - (price / 1.5));
    var buyers = Math.min(cupsPossible, Math.floor(baseCustomers * pricePenalty));

    // Consume inventory
    inventory.lemons -= buyers * rL;
    inventory.sugar -= buyers * rS;
    if (rI > 0) inventory.ice -= buyers * rI;
    inventory.cups -= buyers;

    var revenue = buyers * price;
    money += revenue;
    playSound('coin');

    // Ice melts at end of day
    var meltedIce = inventory.ice;
    inventory.ice = 0;

    logBox.innerHTML = '📊 <strong>第 ' + day + ' 天营业结报：</strong><br>' +
      '• 迎来潜在路人 ' + baseCustomers + ' 位，实际售出 ' + buyers + ' 杯柠檬水。<br>' +
      '• 获得营业收入 <strong>$' + revenue.toFixed(2) + '</strong>。<br>' +
      '• 剩余未用冰块 ' + meltedIce + ' 块因常温融化归零。<br>';

    if (buyers === cupsPossible && baseCustomers > cupsPossible) {
      logBox.innerHTML += '<span style="color:#facc15;">⚠️ 原料售罄提早收摊！明天记得多备原料！</span>';
    }

    // Check win / lose
    if (money >= 100) {
      playSound('win');
      alert('🏆 商业奇才！您的资金已达到 $' + money.toFixed(2) + '，完成了柠檬水摊帝国宏愿！');
    }

    // Next day weather
    day++;
    currentWeather = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
    updateHUD();
  });

  updateHUD();
})();
