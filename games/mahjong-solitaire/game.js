// Mahjong Solitaire (麻将接龙) - OmniGame
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
      osc.type = type || 'triangle';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      g.gain.setValueAtTime(gain || 0.12, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (e) {}
  }

  function playMatchSound() {
    playTone(523.25, 0.1, 'sine', 0.15);
    setTimeout(function () { playTone(659.25, 0.15, 'sine', 0.15); }, 60);
  }

  function playSelectSound() {
    playTone(400, 0.05, 'triangle', 0.08);
  }

  function playWinSound() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { playTone(f, 0.25, 'triangle', 0.2); }, i * 100);
    });
  }

  // Tile definitions: 18 unique patterns, each appears 4 times = 72 tiles
  var TILES_DEF = [
    { id: 'w1', name: '一万', char: '一', sub: '萬', color: 'color-wan' },
    { id: 'w2', name: '二万', char: '二', sub: '萬', color: 'color-wan' },
    { id: 'w3', name: '三万', char: '三', sub: '萬', color: 'color-wan' },
    { id: 'w4', name: '四万', char: '四', sub: '萬', color: 'color-wan' },
    { id: 'w5', name: '五万', char: '五', sub: '萬', color: 'color-wan' },
    { id: 'w9', name: '九万', char: '九', sub: '萬', color: 'color-wan' },

    { id: 't1', name: '一条', char: '🀐', sub: '条', color: 'color-tiao' },
    { id: 't2', name: '二条', char: '二', sub: '条', color: 'color-tiao' },
    { id: 't3', name: '三条', char: '三', sub: '条', color: 'color-tiao' },
    { id: 't5', name: '五条', char: '五', sub: '条', color: 'color-tiao' },
    { id: 't8', name: '八条', char: '八', sub: '条', color: 'color-tiao' },

    { id: 'b1', name: '一饼', char: '🀙', sub: '筒', color: 'color-tong' },
    { id: 'b3', name: '三饼', char: '三', sub: '筒', color: 'color-tong' },
    { id: 'b5', name: '五饼', char: '五', sub: '筒', color: 'color-tong' },
    { id: 'b8', name: '八饼', char: '八', sub: '筒', color: 'color-tong' },

    { id: 'z_dong', name: '东风', char: '東', sub: '風', color: 'color-zi' },
    { id: 'z_zhong', name: '红中', char: '中', sub: '發', color: 'color-wan' },
    { id: 'z_fa', name: '发财', char: '發', sub: '財', color: 'color-tiao' }
  ];

  // 72-tile Pyramid Layout: grid units (x, y, z).
  // x: 0..9, y: 0..6
  var LAYOUT_COORDS = [
    // Layer 0: 48 tiles
    {x:1, y:1, z:0}, {x:2, y:1, z:0}, {x:3, y:1, z:0}, {x:4, y:1, z:0}, {x:5, y:1, z:0}, {x:6, y:1, z:0}, {x:7, y:1, z:0}, {x:8, y:1, z:0},
    {x:1, y:2, z:0}, {x:2, y:2, z:0}, {x:3, y:2, z:0}, {x:4, y:2, z:0}, {x:5, y:2, z:0}, {x:6, y:2, z:0}, {x:7, y:2, z:0}, {x:8, y:2, z:0},
    {x:0, y:3, z:0}, {x:1, y:3, z:0}, {x:2, y:3, z:0}, {x:3, y:3, z:0}, {x:4, y:3, z:0}, {x:5, y:3, z:0}, {x:6, y:3, z:0}, {x:7, y:3, z:0}, {x:8, y:3, z:0}, {x:9, y:3, z:0},
    {x:1, y:4, z:0}, {x:2, y:4, z:0}, {x:3, y:4, z:0}, {x:4, y:4, z:0}, {x:5, y:4, z:0}, {x:6, y:4, z:0}, {x:7, y:4, z:0}, {x:8, y:4, z:0},
    {x:1, y:5, z:0}, {x:2, y:5, z:0}, {x:3, y:5, z:0}, {x:4, y:5, z:0}, {x:5, y:5, z:0}, {x:6, y:5, z:0}, {x:7, y:5, z:0}, {x:8, y:5, z:0},

    // Layer 1: 18 tiles
    {x:3, y:2, z:1}, {x:4, y:2, z:1}, {x:5, y:2, z:1}, {x:6, y:2, z:1},
    {x:2, y:3, z:1}, {x:3, y:3, z:1}, {x:4, y:3, z:1}, {x:5, y:3, z:1}, {x:6, y:3, z:1}, {x:7, y:3, z:1},
    {x:3, y:4, z:1}, {x:4, y:4, z:1}, {x:5, y:4, z:1}, {x:6, y:4, z:1},

    // Layer 2: 4 tiles
    {x:4, y:2.5, z:2}, {x:5, y:2.5, z:2},
    {x:4, y:3.5, z:2}, {x:5, y:3.5, z:2},

    // Layer 3: 2 tiles
    {x:4.5, y:3, z:3}
  ];

  // Trim or adjust to exactly 72 positions
  while (LAYOUT_COORDS.length > 72) LAYOUT_COORDS.pop();
  while (LAYOUT_COORDS.length < 72) {
    LAYOUT_COORDS.push({ x: 4.5, y: 3, z: LAYOUT_COORDS.length % 2 === 0 ? 1 : 2 });
  }

  var activeTiles = [];
  var selectedTile = null;
  var history = [];
  var combo = 0;

  var boardEl = document.getElementById('board');
  var remainingTextEl = document.getElementById('remainingText');
  var matchesTextEl = document.getElementById('matchesText');
  var comboTextEl = document.getElementById('comboText');
  var soundBtn = document.getElementById('soundBtn');
  var hintBtn = document.getElementById('hintBtn');
  var undoBtn = document.getElementById('undoBtn');
  var restartBtn = document.getElementById('restartBtn');
  var modalEl = document.getElementById('gameOverModal');
  var modalRestartBtn = document.getElementById('modalRestartBtn');

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function initGame() {
    var deck = [];
    TILES_DEF.forEach(function (td) {
      for (var k = 0; k < 4; k++) {
        deck.push(Object.assign({}, td));
      }
    });
    deck = shuffle(deck);

    activeTiles = [];
    for (var i = 0; i < LAYOUT_COORDS.length; i++) {
      var coord = LAYOUT_COORDS[i];
      var tileData = deck[i];
      activeTiles.push({
        uid: i,
        id: tileData.id,
        name: tileData.name,
        char: tileData.char,
        sub: tileData.sub,
        color: tileData.color,
        x: coord.x,
        y: coord.y,
        z: coord.z,
        removed: false
      });
    }

    selectedTile = null;
    history = [];
    combo = 0;
    modalEl.classList.remove('active');
    render();
  }

  function isTileFree(t) {
    if (t.removed) return false;

    // 1. Is there any tile directly above it (z > t.z) overlapping in x, y?
    for (var i = 0; i < activeTiles.length; i++) {
      var other = activeTiles[i];
      if (other.removed || other.uid === t.uid) continue;
      if (other.z > t.z) {
        if (Math.abs(other.x - t.x) < 0.95 && Math.abs(other.y - t.y) < 0.95) {
          return false;
        }
      }
    }

    // 2. Is it blocked on both left and right on the same level?
    var leftBlocked = false;
    var rightBlocked = false;

    for (var j = 0; j < activeTiles.length; j++) {
      var o = activeTiles[j];
      if (o.removed || o.uid === t.uid || o.z !== t.z) continue;
      if (Math.abs(o.y - t.y) < 0.8) {
        if (o.x < t.x && Math.abs(o.x - (t.x - 1)) < 0.3) leftBlocked = true;
        if (o.x > t.x && Math.abs(o.x - (t.x + 1)) < 0.3) rightBlocked = true;
      }
    }

    return !(leftBlocked && rightBlocked);
  }

  function getAvailableMatches() {
    var free = activeTiles.filter(function (t) { return !t.removed && isTileFree(t); });
    var matches = [];
    for (var i = 0; i < free.length; i++) {
      for (var j = i + 1; j < free.length; j++) {
        if (free[i].id === free[j].id) {
          matches.push([free[i], free[j]]);
        }
      }
    }
    return matches;
  }

  function handleTileClick(tile) {
    if (tile.removed) return;
    if (!isTileFree(tile)) return;

    initAudio();

    if (!selectedTile) {
      selectedTile = tile;
      playSelectSound();
      render();
      return;
    }

    if (selectedTile.uid === tile.uid) {
      selectedTile = null;
      render();
      return;
    }

    if (selectedTile.id === tile.id) {
      // Match!
      tile.removed = true;
      selectedTile.removed = true;
      history.push([tile.uid, selectedTile.uid]);
      selectedTile = null;
      combo++;
      playMatchSound();
      render();

      checkWin();
    } else {
      selectedTile = tile;
      playSelectSound();
      render();
    }
  }

  function checkWin() {
    var remaining = activeTiles.filter(function (t) { return !t.removed; }).length;
    if (remaining === 0) {
      playWinSound();
      modalEl.classList.add('active');
    }
  }

  function render() {
    boardEl.innerHTML = '';
    var remaining = activeTiles.filter(function (t) { return !t.removed; }).length;
    var matches = getAvailableMatches();

    remainingTextEl.textContent = remaining;
    matchesTextEl.textContent = matches.length;
    comboTextEl.textContent = combo;

    // Tile dimensions and positioning scale
    var tileW = 38;
    var tileH = 50;
    var stepX = 36;
    var stepY = 48;
    var offsetX = 28;
    var offsetY = 20;

    activeTiles.forEach(function (t) {
      if (t.removed) return;

      var free = isTileFree(t);
      var el = document.createElement('div');
      el.className = 'tile ' + (free ? '' : 'blocked');
      if (selectedTile && selectedTile.uid === t.uid) {
        el.classList.add('selected');
      }

      var px = offsetX + t.x * stepX - t.z * 3;
      var py = offsetY + t.y * stepY - t.z * 4;

      el.style.left = px + 'px';
      el.style.top = py + 'px';
      el.style.zIndex = Math.floor(t.z * 10 + t.y);

      var charSpan = document.createElement('span');
      charSpan.className = 'tile-char ' + t.color;
      charSpan.textContent = t.char;

      var subSpan = document.createElement('span');
      subSpan.className = 'tile-sub ' + t.color;
      subSpan.textContent = t.sub;

      el.appendChild(charSpan);
      el.appendChild(subSpan);

      el.addEventListener('click', function () {
        handleTileClick(t);
      });

      boardEl.appendChild(el);
    });
  }

  function showHint() {
    var matches = getAvailableMatches();
    if (matches.length > 0) {
      var pair = matches[0];
      var tiles = boardEl.querySelectorAll('.tile');
      // Highlight matching pair
      pair.forEach(function (p) {
        activeTiles.forEach(function (at) {
          if (at.uid === p.uid) {
            // temporarily pulse
            playTone(600, 0.1, 'sine', 0.1);
          }
        });
      });
      selectedTile = pair[0];
      render();
    }
  }

  function undo() {
    if (history.length === 0) return;
    var last = history.pop();
    activeTiles.forEach(function (t) {
      if (t.uid === last[0] || t.uid === last[1]) {
        t.removed = false;
      }
    });
    selectedTile = null;
    combo = Math.max(0, combo - 1);
    playTone(330, 0.08, 'triangle', 0.1);
    render();
  }

  hintBtn.addEventListener('click', showHint);
  undoBtn.addEventListener('click', undo);
  restartBtn.addEventListener('click', initGame);
  modalRestartBtn.addEventListener('click', initGame);

  soundBtn.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  initGame();
})();
