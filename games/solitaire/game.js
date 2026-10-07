/**
 * OmniGame - 纸牌接龙 (Solitaire Klondike)
 * Pure vanilla JS, offline-first, Web Audio SFX, responsive layout.
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
    cardDeal: function () {
      this.playTone(320, 'sine', 0.06, 0.12);
      this.playTone(480, 'triangle', 0.08, 0.1, 0.03);
    },
    cardFlip: function () {
      this.playTone(540, 'triangle', 0.08, 0.15);
    },
    cardPlace: function () {
      this.playTone(260, 'sine', 0.09, 0.18);
    },
    foundation: function () {
      this.playTone(523.25, 'triangle', 0.12, 0.2);
      this.playTone(659.25, 'sine', 0.18, 0.2, 0.08);
      this.playTone(783.99, 'sine', 0.25, 0.25, 0.16);
    },
    undo: function () {
      this.playTone(380, 'sawtooth', 0.1, 0.1);
      this.playTone(290, 'triangle', 0.12, 0.12, 0.05);
    },
    victory: function () {
      var notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
      var self = this;
      notes.forEach(function (freq, i) {
        self.playTone(freq, 'triangle', 0.25, 0.25, i * 0.12);
      });
    }
  };

  // --- Constants & Config ---
  var SUITS = ['♠', '♥', '♣', '♦'];
  var SUIT_COLORS = { '♠': 'black', '♥': 'red', '♣': 'black', '♦': 'red' };
  var RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  // --- Game State ---
  var state = {
    stock: [],
    waste: [],
    foundations: [[], [], [], []], // 0:♠, 1:♥, 2:♣, 3:♦
    tableau: [[], [], [], [], [], [], []],
    selected: null, // { source: 'waste'|'tableau'|'foundation', colIndex, cardIndex, cards: [] }
    score: 0,
    moves: 0,
    timer: 0,
    timerInterval: null,
    isWon: false,
    history: []
  };

  // --- DOM Elements ---
  var elements = {
    soundBtn: document.getElementById('soundBtn'),
    undoBtn: document.getElementById('undoBtn'),
    autoCompleteBtn: document.getElementById('autoCompleteBtn'),
    restartBtn: document.getElementById('restartBtn'),
    scoreText: document.getElementById('scoreText'),
    movesText: document.getElementById('movesText'),
    timerText: document.getElementById('timerText'),
    stockSlot: document.getElementById('stockSlot'),
    wasteSlot: document.getElementById('wasteSlot'),
    foundations: [
      document.getElementById('found0'),
      document.getElementById('found1'),
      document.getElementById('found2'),
      document.getElementById('found3')
    ],
    tableauCols: Array.from(document.querySelectorAll('.tableau-col')),
    modal: document.getElementById('solModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalDesc: document.getElementById('modalDesc'),
    modalRestartBtn: document.getElementById('modalRestartBtn')
  };

  // --- Deck Generation & Shuffle ---
  function createDeck() {
    var deck = [];
    var idCounter = 1;
    for (var s = 0; s < 4; s++) {
      var suit = SUITS[s];
      var color = SUIT_COLORS[suit];
      for (var r = 1; r <= 13; r++) {
        deck.push({
          id: idCounter++,
          suit: suit,
          color: color,
          rank: r,
          rankStr: RANKS[r],
          faceUp: false
        });
      }
    }
    // Fisher-Yates Shuffle
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = deck[i];
      deck[i] = deck[j];
      deck[j] = temp;
    }
    return deck;
  }

  // --- Deep Clone State for History ---
  function cloneCard(c) {
    return {
      id: c.id,
      suit: c.suit,
      color: c.color,
      rank: c.rank,
      rankStr: c.rankStr,
      faceUp: c.faceUp
    };
  }

  function cloneCardList(list) {
    return list.map(cloneCard);
  }

  function saveSnapshot() {
    var snap = {
      stock: cloneCardList(state.stock),
      waste: cloneCardList(state.waste),
      foundations: state.foundations.map(cloneCardList),
      tableau: state.tableau.map(cloneCardList),
      score: state.score,
      moves: state.moves
    };
    state.history.push(snap);
    if (state.history.length > 30) state.history.shift();
  }

  function undoMove() {
    if (!state.history.length || state.isWon) return;
    AudioSys.init();
    var prev = state.history.pop();
    state.stock = prev.stock;
    state.waste = prev.waste;
    state.foundations = prev.foundations;
    state.tableau = prev.tableau;
    state.score = prev.score;
    state.moves = prev.moves;
    state.selected = null;
    AudioSys.undo();
    render();
  }

  // --- Game Flow ---
  function initGame() {
    AudioSys.init();
    clearInterval(state.timerInterval);
    state.isWon = false;
    state.score = 0;
    state.moves = 0;
    state.timer = 0;
    state.selected = null;
    state.history = [];

    var deck = createDeck();
    state.foundations = [[], [], [], []];
    state.tableau = [[], [], [], [], [], [], []];
    state.waste = [];

    // Deal 7 Tableau columns
    for (var c = 0; c < 7; c++) {
      for (var r = 0; r <= c; r++) {
        var card = deck.pop();
        card.faceUp = (r === c); // Only top card is face-up
        state.tableau[c].push(card);
      }
    }

    // Rest of deck to stock
    state.stock = deck;
    state.stock.forEach(function (cd) { cd.faceUp = false; });

    elements.modal.classList.remove('active');
    updateHeader();

    state.timerInterval = setInterval(function () {
      if (!state.isWon) {
        state.timer++;
        formatTimer();
      }
    }, 1000);

    AudioSys.cardDeal();
    render();
  }

  function formatTimer() {
    var mins = Math.floor(state.timer / 60);
    var secs = state.timer % 60;
    elements.timerText.textContent = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  function updateHeader() {
    elements.scoreText.textContent = state.score;
    elements.movesText.textContent = state.moves;
    elements.undoBtn.disabled = state.history.length === 0;
  }

  // --- Rules & Move Validation ---
  function canMoveToFoundation(card, fIndex) {
    var fSuit = SUITS[fIndex];
    if (card.suit !== fSuit) return false;
    var foundationPile = state.foundations[fIndex];
    if (foundationPile.length === 0) {
      return card.rank === 1; // Ace
    }
    var topCard = foundationPile[foundationPile.length - 1];
    return card.rank === topCard.rank + 1;
  }

  function canMoveToTableau(card, colIndex) {
    var col = state.tableau[colIndex];
    if (col.length === 0) {
      return card.rank === 13; // King can be placed on empty slot
    }
    var topCard = col[col.length - 1];
    return topCard.faceUp && topCard.color !== card.color && card.rank === topCard.rank - 1;
  }

  // Find easiest foundation for a single card
  function findValidFoundationIndex(card) {
    for (var f = 0; f < 4; f++) {
      if (canMoveToFoundation(card, f)) return f;
    }
    return -1;
  }

  // Find first valid tableau column for a card
  function findValidTableauCol(card, excludeColIndex) {
    for (var c = 0; c < 7; c++) {
      if (c === excludeColIndex) continue;
      if (canMoveToTableau(card, c)) return c;
    }
    return -1;
  }

  // --- Auto-flip top cards ---
  function autoFlipTableauTops() {
    var flipped = false;
    for (var c = 0; c < 7; c++) {
      var col = state.tableau[c];
      if (col.length > 0) {
        var topCard = col[col.length - 1];
        if (!topCard.faceUp) {
          topCard.faceUp = true;
          state.score += 5;
          flipped = true;
        }
      }
    }
    if (flipped) AudioSys.cardFlip();
  }

  // --- User Actions ---
  function onStockClick() {
    AudioSys.init();
    saveSnapshot();
    if (state.stock.length > 0) {
      // Draw 1 card to waste
      var card = state.stock.pop();
      card.faceUp = true;
      state.waste.push(card);
      AudioSys.cardDeal();
    } else {
      // Recycle waste to stock
      if (state.waste.length === 0) return;
      while (state.waste.length > 0) {
        var wCard = state.waste.pop();
        wCard.faceUp = false;
        state.stock.push(wCard);
      }
      state.score = Math.max(0, state.score - 15);
      AudioSys.cardFlip();
    }
    state.moves++;
    state.selected = null;
    render();
  }

  // Smart Auto-Move on click / double click
  function trySmartMove(card, source, colIndex, cardIndex) {
    // 1. Try Foundation
    var fIdx = findValidFoundationIndex(card);
    if (fIdx !== -1) {
      saveSnapshot();
      executeMoveToFoundation(source, colIndex, cardIndex, fIdx);
      return true;
    }
    // 2. Try Tableau
    var tIdx = findValidTableauCol(card, source === 'tableau' ? colIndex : -1);
    if (tIdx !== -1) {
      saveSnapshot();
      executeMoveToTableau(source, colIndex, cardIndex, tIdx);
      return true;
    }
    return false;
  }

  function executeMoveToFoundation(source, colIndex, cardIndex, fIndex) {
    var card;
    if (source === 'waste') {
      card = state.waste.pop();
    } else if (source === 'tableau') {
      var col = state.tableau[colIndex];
      card = col.splice(cardIndex, 1)[0];
    }
    state.foundations[fIndex].push(card);
    state.score += 10;
    state.moves++;
    state.selected = null;
    AudioSys.foundation();
    autoFlipTableauTops();
    checkWinCondition();
    render();
  }

  function executeMoveToTableau(source, colIndex, cardIndex, targetColIndex) {
    var movingCards = [];
    if (source === 'waste') {
      movingCards = [state.waste.pop()];
      state.score += 5;
    } else if (source === 'tableau') {
      var col = state.tableau[colIndex];
      movingCards = col.splice(cardIndex);
    } else if (source === 'foundation') {
      movingCards = [state.foundations[colIndex].pop()];
      state.score = Math.max(0, state.score - 15);
    }

    movingCards.forEach(function (c) {
      state.tableau[targetColIndex].push(c);
    });

    state.moves++;
    state.selected = null;
    AudioSys.cardPlace();
    autoFlipTableauTops();
    render();
  }

  // Auto-complete (when all tableau cards are face-up and stock/waste empty)
  function canAutoComplete() {
    if (state.stock.length > 0 || state.waste.length > 0) return false;
    for (var c = 0; c < 7; c++) {
      var col = state.tableau[c];
      for (var i = 0; i < col.length; i++) {
        if (!col[i].faceUp) return false;
      }
    }
    return true;
  }

  function runAutoCompleteCascade() {
    AudioSys.init();
    var moved = false;
    // Iterate over tableau columns and move cards to foundation
    for (var c = 0; c < 7; c++) {
      var col = state.tableau[c];
      if (col.length > 0) {
        var topCard = col[col.length - 1];
        var fIdx = findValidFoundationIndex(topCard);
        if (fIdx !== -1) {
          executeMoveToFoundation('tableau', c, col.length - 1, fIdx);
          moved = true;
          break;
        }
      }
    }

    if (moved && !state.isWon) {
      setTimeout(runAutoCompleteCascade, 100);
    }
  }

  // Win condition
  function checkWinCondition() {
    var total = 0;
    for (var f = 0; f < 4; f++) {
      total += state.foundations[f].length;
    }
    if (total === 52) {
      state.isWon = true;
      clearInterval(state.timerInterval);
      AudioSys.victory();
      elements.modalTitle.textContent = '🎉 全盘接龙大获全胜！';
      elements.modalDesc.textContent = '用时 ' + elements.timerText.textContent + ' · 步数 ' + state.moves + ' 步 · 积分 ' + state.score + ' 分';
      elements.modal.classList.add('active');
    }
  }

  // --- Rendering Functions ---
  function renderCard(card, isSelected) {
    var div = document.createElement('div');
    div.className = 'sol-card ' + (card.faceUp ? 'face-up ' + card.color : 'face-down');
    if (isSelected) div.classList.add('selected');
    div.dataset.cardId = card.id;

    if (card.faceUp) {
      div.innerHTML =
        '<div class="card-top">' +
          '<div class="card-rank">' + card.rankStr + '</div>' +
          '<div class="card-suit">' + card.suit + '</div>' +
        '</div>' +
        '<div class="card-center-suit">' + card.suit + '</div>' +
        '<div class="card-top" style="transform: rotate(180deg);">' +
          '<div class="card-rank">' + card.rankStr + '</div>' +
          '<div class="card-suit">' + card.suit + '</div>' +
        '</div>';
    }
    return div;
  }

  function render() {
    updateHeader();

    // 1. Render Stock
    elements.stockSlot.innerHTML = '';
    if (state.stock.length > 0) {
      var stockCard = document.createElement('div');
      stockCard.className = 'sol-card face-down';
      stockCard.style.position = 'static';
      stockCard.style.width = '100%';
      stockCard.style.height = '100%';
      elements.stockSlot.appendChild(stockCard);
    } else {
      elements.stockSlot.innerHTML = '<div class="card-back-icon" style="opacity:0.3;font-size:24px;">🔄</div>';
    }

    // 2. Render Waste
    elements.wasteSlot.innerHTML = '';
    if (state.waste.length > 0) {
      var wasteCard = state.waste[state.waste.length - 1];
      var isWSelected = state.selected && state.selected.source === 'waste';
      var wEl = renderCard(wasteCard, isWSelected);
      wEl.style.position = 'static';
      wEl.style.width = '100%';
      wEl.style.height = '100%';
      wEl.addEventListener('click', function (e) {
        e.stopPropagation();
        AudioSys.init();
        if (state.selected && state.selected.source === 'waste') {
          // Deselect
          state.selected = null;
          render();
        } else {
          // Quick try or select
          var handled = trySmartMove(wasteCard, 'waste', -1, state.waste.length - 1);
          if (!handled) {
            state.selected = {
              source: 'waste',
              card: wasteCard
            };
            render();
          }
        }
      });
      elements.wasteSlot.appendChild(wEl);
    }

    // 3. Render Foundations
    for (var f = 0; f < 4; f++) {
      var fSlot = elements.foundations[f];
      fSlot.innerHTML = '';
      var fCards = state.foundations[f];
      if (fCards.length === 0) {
        var placeholder = document.createElement('span');
        placeholder.textContent = SUITS[f];
        fSlot.appendChild(placeholder);
      } else {
        var topFCard = fCards[fCards.length - 1];
        var isFSelected = state.selected && state.selected.source === 'foundation' && state.selected.colIndex === f;
        var fEl = renderCard(topFCard, isFSelected);
        fEl.style.position = 'static';
        fEl.style.width = '100%';
        fEl.style.height = '100%';
        (function (fIdx, card) {
          fEl.addEventListener('click', function (e) {
            e.stopPropagation();
            AudioSys.init();
            if (state.selected && state.selected.source !== 'foundation') {
              // Try placing selected to this foundation
              var selCard = state.selected.source === 'waste' ? state.selected.card : state.selected.cards[0];
              if (state.selected.cards && state.selected.cards.length > 1) {
                // Cannot place multiple cards to foundation
                state.selected = null;
                render();
                return;
              }
              if (canMoveToFoundation(selCard, fIdx)) {
                saveSnapshot();
                executeMoveToFoundation(state.selected.source, state.selected.colIndex, state.selected.cardIndex, fIdx);
                return;
              }
            }
            // Select this foundation card
            state.selected = {
              source: 'foundation',
              colIndex: fIdx,
              card: card
            };
            render();
          });
        })(f, topFCard);
        fSlot.appendChild(fEl);
      }

      // Slot Click Handler (when empty slot clicked)
      (function (fIdx) {
        fSlot.onclick = function (e) {
          if (e.target !== fSlot && e.target.parentElement !== fSlot) return;
          if (state.selected) {
            var selCard = state.selected.source === 'waste' ? state.selected.card : state.selected.cards[0];
            if (state.selected.cards && state.selected.cards.length > 1) {
              state.selected = null;
              render();
              return;
            }
            if (canMoveToFoundation(selCard, fIdx)) {
              saveSnapshot();
              executeMoveToFoundation(state.selected.source, state.selected.colIndex, state.selected.cardIndex, fIdx);
            }
          }
        };
      })(f);
    }

    // 4. Render Tableau Columns
    for (var c = 0; c < 7; c++) {
      var colSlot = elements.tableauCols[c];
      colSlot.innerHTML = '';
      var colCards = state.tableau[c];

      colCards.forEach(function (card, idx) {
        var isSelected = state.selected && state.selected.source === 'tableau' && state.selected.colIndex === c && idx >= state.selected.cardIndex;
        var cardEl = renderCard(card, isSelected);

        // Vertical overlap offset
        var offset = idx * 24;
        cardEl.style.top = offset + 'px';
        cardEl.style.zIndex = idx + 1;

        if (card.faceUp) {
          (function (colIdx, cardIdx, curCard) {
            cardEl.addEventListener('click', function (e) {
              e.stopPropagation();
              AudioSys.init();

              // If something is already selected
              if (state.selected) {
                // If clicked on current selection, deselect
                if (state.selected.source === 'tableau' && state.selected.colIndex === colIdx && state.selected.cardIndex === cardIdx) {
                  state.selected = null;
                  render();
                  return;
                }

                // If clicking valid target to move to
                var selCard = state.selected.source === 'waste' ? state.selected.card :
                             state.selected.source === 'foundation' ? state.selected.card :
                             state.selected.cards[0];

                if (canMoveToTableau(selCard, colIdx)) {
                  saveSnapshot();
                  executeMoveToTableau(state.selected.source, state.selected.colIndex, state.selected.cardIndex, colIdx);
                  return;
                }
              }

              // Otherwise try smart move if it's the top card
              if (cardIdx === colCards.length - 1) {
                var handled = trySmartMove(curCard, 'tableau', colIdx, cardIdx);
                if (handled) return;
              }

              // Select the sub-stack starting at this card
              state.selected = {
                source: 'tableau',
                colIndex: colIdx,
                cardIndex: cardIdx,
                cards: colCards.slice(cardIdx)
              };
              render();
            });
          })(c, idx, card);
        }

        colSlot.appendChild(cardEl);
      });

      // Handle Empty Column Click for Kings
      (function (colIdx) {
        colSlot.onclick = function () {
          if (state.selected && state.tableau[colIdx].length === 0) {
            var selCard = state.selected.source === 'waste' ? state.selected.card :
                         state.selected.source === 'foundation' ? state.selected.card :
                         state.selected.cards[0];
            if (selCard.rank === 13) { // King
              saveSnapshot();
              executeMoveToTableau(state.selected.source, state.selected.colIndex, state.selected.cardIndex, colIdx);
            }
          }
        };
      })(c);
    }
  }

  // --- Attach Global Listeners ---
  elements.stockSlot.addEventListener('click', onStockClick);

  elements.undoBtn.addEventListener('click', undoMove);

  elements.autoCompleteBtn.addEventListener('click', function () {
    if (canAutoComplete()) {
      runAutoCompleteCascade();
    } else {
      // Flash auto complete button
      elements.autoCompleteBtn.style.transform = 'scale(0.92)';
      setTimeout(function () {
        elements.autoCompleteBtn.style.transform = 'none';
      }, 150);
    }
  });

  elements.restartBtn.addEventListener('click', initGame);
  elements.modalRestartBtn.addEventListener('click', initGame);

  elements.soundBtn.addEventListener('click', function () {
    AudioSys.enabled = !AudioSys.enabled;
    elements.soundBtn.textContent = AudioSys.enabled ? '🔊' : '🔇';
  });

  // Table background click deselects
  document.getElementById('table').addEventListener('click', function (e) {
    if (e.target.id === 'table' || e.target.id === 'tableauRow') {
      if (state.selected) {
        state.selected = null;
        render();
      }
    }
  });

  // Start game on load
  initGame();
})();
