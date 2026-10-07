(function () {
  'use strict';

  var popEl = document.getElementById('pop-el');
  var moneyEl = document.getElementById('money-el');
  var happyEl = document.getElementById('happy-el');
  var cityGridEl = document.getElementById('city-grid');
  var paletteEl = document.getElementById('palette');

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

      if (type === 'build') {
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'tax') {
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1174, now + 0.08);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch (e) {}
  }

  var BUILDINGS = [
    { id: 'road', name: '道路', icon: '🛣️', cost: 10, pop: 0, tax: 0, happy: 0 },
    { id: 'res', name: '住宅', icon: '🏡', cost: 50, pop: 15, tax: 0, happy: 0 },
    { id: 'com', name: '商业', icon: '🏢', cost: 75, pop: 0, tax: 15, happy: 0 },
    { id: 'ind', name: '工业', icon: '🏭', cost: 100, pop: 0, tax: 30, happy: -6 },
    { id: 'park', name: '公园', icon: '🌳', cost: 30, pop: 0, tax: 0, happy: 8 },
    { id: 'power', name: '电厂', icon: '⚡', cost: 120, pop: 0, tax: 0, happy: -3 }
  ];

  var GRID_SIZE = 6;
  var treasury = 300;
  var selectedBuilding = BUILDINGS[0];
  var grid = [];

  for (var r = 0; r < GRID_SIZE; r++) {
    var row = [];
    for (var c = 0; c < GRID_SIZE; c++) {
      row.push(null);
    }
    grid.push(row);
  }

  function renderPalette() {
    paletteEl.innerHTML = '';
    BUILDINGS.forEach(function (b) {
      var btn = document.createElement('div');
      btn.className = 'palette-btn' + (selectedBuilding === b ? ' active' : '');
      btn.innerHTML = '<span style="font-size:20px;">' + b.icon + '</span>' +
        '<span style="font-size:12px;font-weight:bold;">' + b.name + '</span>' +
        '<span class="palette-cost">$' + b.cost + '</span>';

      btn.addEventListener('click', function () {
        getAudioCtx();
        selectedBuilding = b;
        renderPalette();
      });
      paletteEl.appendChild(btn);
    });
  }

  function renderGrid() {
    cityGridEl.innerHTML = '';
    for (var r = 0; r < GRID_SIZE; r++) {
      for (var c = 0; c < GRID_SIZE; c++) {
        var cell = document.createElement('div');
        cell.className = 'zone-cell';
        var b = grid[r][c];

        if (b) {
          cell.textContent = b.icon;
          cell.title = b.name;
        } else {
          cell.innerHTML = '<span style="opacity:0.2;">🟩</span>';
        }

        cell.addEventListener('click', (function (row, col) {
          return function () {
            handleBuild(row, col);
          };
        })(r, c));

        cityGridEl.appendChild(cell);
      }
    }
  }

  function handleBuild(r, c) {
    getAudioCtx();
    if (treasury >= selectedBuilding.cost) {
      treasury -= selectedBuilding.cost;
      grid[r][c] = selectedBuilding;
      playSound('build');
      updateStats();
      renderGrid();
    } else {
      alert('市政资金不足！等待税收进账。');
    }
  }

  function updateStats() {
    var pop = 0;
    var happy = 100;

    for (var r = 0; r < GRID_SIZE; r++) {
      for (var c = 0; c < GRID_SIZE; c++) {
        var b = grid[r][c];
        if (b) {
          pop += b.pop;
          happy += b.happy;
        }
      }
    }

    happy = Math.max(10, Math.min(100, happy));
    popEl.textContent = pop;
    moneyEl.textContent = '$' + treasury;
    happyEl.textContent = happy + '%';
  }

  function taxCycle() {
    var taxIncome = 0;
    for (var r = 0; r < GRID_SIZE; r++) {
      for (var c = 0; c < GRID_SIZE; c++) {
        var b = grid[r][c];
        if (b) taxIncome += b.tax;
      }
    }

    if (taxIncome > 0) {
      treasury += taxIncome;
      playSound('tax');
      updateStats();
    }
  }

  renderPalette();
  renderGrid();
  updateStats();

  setInterval(taxCycle, 3000);
})();
