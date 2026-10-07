/**
 * OmniGame - 羊了个羊 (Sheep Match)
 * Pure vanilla JS, 3D stacked occlusion detection, 7-slot collection bar, power-up props, Web Audio.
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
    playTone: function (freq, type, duration, gainVal, startDelay) {
      if (!this.enabled || !this.ctx) return;
      try {
        var now = this.ctx.currentTime + (startDelay || 0);
        var osc = this.ctx.createOscillator();
        var gain = this.ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(gainVal || 0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration);
      } catch (e) {}
    },
    pickCard: function () {
      this.playTone(480, 'triangle', 0.05, 0.16);
      this.playTone(320, 'sine', 0.06, 0.12, 0.02);
    },
    match3: function () {
      var notes = [523.25, 659.25, 783.99, 1046.5];
      var self = this;
      notes.forEach(function (f, i) {
        self.playTone(f, 'triangle', 0.15, 0.2, i * 0.05);
      });
    },
    prop: function () {
      this.playTone(360, 'sine', 0.1, 0.15);
      this.playTone(540, 'triangle', 0.12, 0.15, 0.04);
    },
    fail: function () {
      this.playTone(200, 'sawtooth', 0.25, 0.2);
      this.playTone(150, 'sawtooth', 0.35, 0.2, 0.08);
    },
    victory: function () {
      var notes = [440, 554.37, 659.25, 880, 1108.73];
      var self = this;
      notes.forEach(function (f, i) {
        self.playTone(f, 'sine', 0.22, 0.2, i * 0.08);
      });
    }
  };

  // --- Tile Icons ---
  var ICONS = ['🐏', '🥕', '🌽', '🔔', '🪵', '🧤', '🌾', '🥛'];

  // --- DOM Elements ---
  var elements = {
    stage: document.getElementById('cardsStage'),
    collectionBar: document.getElementById('collectionBar'),
    levelText: document.getElementById('levelText'),
    scoreText: document.getElementById('scoreText'),
    cardsLeftText: document.getElementById('cardsLeftText'),
    soundBtn: document.getElementById('soundBtn'),
    restartBtn: document.getElementById('restartBtn'),
    propUndo: document.getElementById('propUndo'),
    propOut: document.getElementById('propOut'),
    propShuffle: document.getElementById('propShuffle'),
    modal: document.getElementById('gameOverModal'),
    modalEmoji: document.getElementById('modalEmoji'),
    modalTitle: document.getElementById('modalTitle'),
    modalDesc: document.getElementById('modalDesc'),
    modalRestartBtn: document.getElementById('modalRestartBtn')
  };

  // --- Game State ---
  var MAX_SLOTS = 7;
  var state = {
    level: 1, // 1 or 2
    score: 0,
    cards: [], // Array of card objects on board: { id, icon, x, y, layer, el }
    slots: [], // Array of collected card objects in bottom bar
    outPushedCards: [], // Cards pushed out by prop
    props: {
      undo: 1,
      out: 1,
      shuffle: 1
    },
    lastMovedCard: null,
    gameOver: false
  };

  // --- Generate Cards for Stages ---
  function generateCards(level) {
    var cards = [];
    var cardId = 1;

    if (level === 1) {
      // Tutorial: 12 cards (4 triplets), 2 layers
      var iconsPool = [ICONS[0], ICONS[1], ICONS[2], ICONS[3]];
      var iconList = [];
      iconsPool.forEach(function (ic) {
        iconList.push(ic, ic, ic);
      });
      iconList.sort(function () { return Math.random() - 0.5; });

      var coords = [
        { x: 90, y: 70, layer: 0 }, { x: 150, y: 70, layer: 0 }, { x: 210, y: 70, layer: 0 },
        { x: 90, y: 130, layer: 0 }, { x: 150, y: 130, layer: 0 }, { x: 210, y: 130, layer: 0 },
        { x: 90, y: 190, layer: 0 }, { x: 150, y: 190, layer: 0 }, { x: 210, y: 190, layer: 0 },
        { x: 120, y: 100, layer: 1 }, { x: 180, y: 100, layer: 1 }, { x: 150, y: 160, layer: 1 }
      ];

      coords.forEach(function (pos, idx) {
        cards.push({
          id: cardId++,
          icon: iconList[idx],
          x: pos.x,
          y: pos.y,
          layer: pos.layer
        });
      });
    } else {
      // Stage 2: Hardcore 48 cards (16 triplets), up to 5 layers
      var numTriplets = 16;
      var activeIcons = ICONS.slice(0, 6);
      var pool = [];
      for (var t = 0; t < numTriplets; t++) {
        var ic = activeIcons[t % activeIcons.length];
        pool.push(ic, ic, ic);
      }
      pool.sort(function () { return Math.random() - 0.5; });

      var stepX = 26;
      var stepY = 28;
      var startX = 50;
      var startY = 40;

      for (var i = 0; i < pool.length; i++) {
        var layer = Math.floor(i / 10);
        var offset = layer * 4;
        var col = (i % 5);
        var row = Math.floor((i % 15) / 5);

        var px = startX + col * stepX * 1.8 + offset + (Math.random() - 0.5) * 8;
        var py = startY + row * stepY * 1.8 + offset + (Math.random() - 0.5) * 8;

        cards.push({
          id: cardId++,
          icon: pool[i],
          x: Math.round(px),
          y: Math.round(py),
          layer: layer
        });
      }
    }

    return cards;
  }

  // --- Occlusion Detection ---
  function updateOcclusion() {
    state.cards.forEach(function (card) {
      var isCovered = false;
      for (var j = 0; j < state.cards.length; j++) {
        var other = state.cards[j];
        if (other.id !== card.id && other.layer > card.layer) {
          // Check overlap
          var dx = Math.abs(other.x - card.x);
          var dy = Math.abs(other.y - card.y);
          if (dx < 40 && dy < 44) {
            isCovered = true;
            break;
          }
        }
      }
      card.covered = isCovered;
      if (card.el) {
        if (isCovered) card.el.classList.add('covered');
        else card.el.classList.remove('covered');
      }
    });

    elements.cardsLeftText.textContent = state.cards.length;
  }

  // --- Game Flow ---
  function initGame(stageLevel) {
    AudioSys.init();
    state.level = stageLevel || 1;
    state.gameOver = false;
    state.slots = [];
    state.outPushedCards = [];
    state.lastMovedCard = null;
    state.props = { undo: 1, out: 1, shuffle: 1 };

    elements.levelText.textContent = '第 ' + state.level + ' 关';
    elements.scoreText.textContent = state.score;
    elements.modal.classList.remove('active');

    updatePropsUI();

    state.cards = generateCards(state.level);
    renderCards();
    renderCollectionBar();
    updateOcclusion();
  }

  function updatePropsUI() {
    elements.propUndo.textContent = '🔙 移回 (' + state.props.undo + ')';
    elements.propUndo.disabled = state.props.undo <= 0 || state.slots.length === 0;

    elements.propOut.textContent = '⬆️ 移出3张 (' + state.props.out + ')';
    elements.propOut.disabled = state.props.out <= 0 || state.slots.length < 3;

    elements.propShuffle.textContent = '🔀 洗牌 (' + state.props.shuffle + ')';
    elements.propShuffle.disabled = state.props.shuffle <= 0 || state.cards.length <= 1;
  }

  // --- Render Board Cards ---
  function renderCards() {
    elements.stage.innerHTML = '';
    state.cards.forEach(function (card) {
      var div = document.createElement('div');
      div.className = 'sheep-card';
      div.id = 'card-' + card.id;
      div.textContent = card.icon;
      div.style.left = card.x + 'px';
      div.style.top = card.y + 'px';
      div.style.zIndex = card.layer * 10;
      card.el = div;

      div.addEventListener('click', function () {
        if (!card.covered && !state.gameOver) {
          pickCard(card);
        }
      });

      elements.stage.appendChild(div);
    });
  }

  // --- Render Collection Bar (7 Slots) ---
  function renderCollectionBar() {
    elements.collectionBar.innerHTML = '';
    for (var i = 0; i < MAX_SLOTS; i++) {
      var slotDiv = document.createElement('div');
      slotDiv.className = 'slot-item';

      if (i < state.slots.length) {
        var card = state.slots[i];
        var cardEl = document.createElement('div');
        cardEl.className = 'sheep-card';
        cardEl.textContent = card.icon;
        slotDiv.appendChild(cardEl);
      }

      elements.collectionBar.appendChild(slotDiv);
    }
  }

  // --- Pick Card & Collection Logic ---
  function pickCard(card) {
    if (state.slots.length >= MAX_SLOTS || state.gameOver) return;
    AudioSys.init();
    AudioSys.pickCard();

    // Remove from board cards
    var idx = state.cards.findIndex(function (c) { return c.id === card.id; });
    if (idx !== -1) {
      state.cards.splice(idx, 1);
      if (card.el) card.el.remove();
    }

    state.lastMovedCard = card;

    // Add into collection bar with auto-grouping by icon
    var insertIdx = state.slots.findLastIndex ? state.slots.findLastIndex(function (c) { return c.icon === card.icon; }) : -1;
    if (insertIdx === -1) {
      // Fallback
      for (var s = state.slots.length - 1; s >= 0; s--) {
        if (state.slots[s].icon === card.icon) { insertIdx = s; break; }
      }
    }

    if (insertIdx !== -1) {
      state.slots.splice(insertIdx + 1, 0, card);
    } else {
      state.slots.push(card);
    }

    renderCollectionBar();
    updateOcclusion();
    updatePropsUI();

    // Check Match-3
    setTimeout(checkTripletMatch, 140);
  }

  function checkTripletMatch() {
    // Count occurrences of each icon in collection bar
    var counts = {};
    state.slots.forEach(function (c) {
      counts[c.icon] = (counts[c.icon] || 0) + 1;
    });

    var matchedIcon = null;
    for (var ic in counts) {
      if (counts[ic] >= 3) {
        matchedIcon = ic;
        break;
      }
    }

    if (matchedIcon) {
      AudioSys.match3();
      // Remove 3 matching cards
      var removed = 0;
      state.slots = state.slots.filter(function (c) {
        if (c.icon === matchedIcon && removed < 3) {
          removed++;
          return false;
        }
        return true;
      });

      state.score += 100;
      elements.scoreText.textContent = state.score;

      renderCollectionBar();
      updatePropsUI();

      // Check another match if possible
      setTimeout(checkTripletMatch, 140);
    } else {
      // Check Victory or Game Over
      if (state.cards.length === 0 && state.slots.length === 0) {
        triggerVictory();
      } else if (state.slots.length >= MAX_SLOTS) {
        triggerGameOver();
      }
    }
  }

  function triggerVictory() {
    AudioSys.victory();
    if (state.level === 1) {
      elements.modalEmoji.textContent = '🎉';
      elements.modalTitle.textContent = '第 1 关顺利通关！';
      elements.modalDesc.textContent = '即将进入真正硬核的第 2 关挑战！';
      elements.modalRestartBtn.textContent = '进入第 2 关';
      elements.modalRestartBtn.onclick = function () {
        initGame(2);
      };
      elements.modal.classList.add('active');
    } else {
      elements.modalEmoji.textContent = '👑';
      elements.modalTitle.textContent = '恭喜通关羊了个羊！';
      elements.modalDesc.textContent = '获得羊群荣耀大奖 · 积分: ' + state.score;
      elements.modalRestartBtn.textContent = '再战一局';
      elements.modalRestartBtn.onclick = function () {
        initGame(1);
      };
      elements.modal.classList.add('active');
    }
  }

  function triggerGameOver() {
    state.gameOver = true;
    AudioSys.fail();
    elements.modalEmoji.textContent = '🐑';
    elements.modalTitle.textContent = '卡槽已满，挑战失败！';
    elements.modalDesc.textContent = '最终得分: ' + state.score + ' 分';
    elements.modalRestartBtn.textContent = '重新挑战';
    elements.modalRestartBtn.onclick = function () {
      initGame(state.level);
    };
    elements.modal.classList.add('active');
  }

  // --- Props Handlers ---
  elements.propUndo.addEventListener('click', function () {
    if (state.props.undo <= 0 || state.slots.length === 0 || !state.lastMovedCard) return;
    AudioSys.init();
    AudioSys.prop();
    state.props.undo--;

    var cardToReturn = state.lastMovedCard;
    var slotIdx = state.slots.findIndex(function (c) { return c.id === cardToReturn.id; });
    if (slotIdx !== -1) {
      state.slots.splice(slotIdx, 1);
    } else {
      cardToReturn = state.slots.pop();
    }

    state.cards.push(cardToReturn);
    state.lastMovedCard = null;

    renderCards();
    renderCollectionBar();
    updateOcclusion();
    updatePropsUI();
  });

  elements.propOut.addEventListener('click', function () {
    if (state.props.out <= 0 || state.slots.length < 3) return;
    AudioSys.init();
    AudioSys.prop();
    state.props.out--;

    // Move first 3 cards out of collection bar to top holding area
    var pushed = state.slots.splice(0, 3);
    pushed.forEach(function (card, i) {
      card.x = 80 + i * 50;
      card.y = 10;
      card.layer = 99; // Top layer
      state.cards.push(card);
    });

    renderCards();
    renderCollectionBar();
    updateOcclusion();
    updatePropsUI();
  });

  elements.propShuffle.addEventListener('click', function () {
    if (state.props.shuffle <= 0 || state.cards.length <= 1) return;
    AudioSys.init();
    AudioSys.prop();
    state.props.shuffle--;

    // Shuffle icons among remaining cards
    var icons = state.cards.map(function (c) { return c.icon; });
    icons.sort(function () { return Math.random() - 0.5; });
    state.cards.forEach(function (c, i) {
      c.icon = icons[i];
    });

    renderCards();
    updateOcclusion();
    updatePropsUI();
  });

  elements.soundBtn.addEventListener('click', function () {
    AudioSys.enabled = !AudioSys.enabled;
    elements.soundBtn.textContent = AudioSys.enabled ? '🔊' : '🔇';
  });

  elements.restartBtn.addEventListener('click', function () {
    initGame(state.level);
  });

  // Init
  initGame(1);
})();
