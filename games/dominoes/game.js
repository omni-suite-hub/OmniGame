// games/dominoes/game.js - Classic Dominoes (多米诺骨牌)
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

      if (type === 'clack') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.07);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.07);
        osc.start(now);
        osc.stop(now + 0.07);
      } else if (type === 'draw') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(250, now);
        osc.frequency.linearRampToValueAtTime(180, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'win') {
        [392, 523, 659, 784].forEach(function(f, idx) {
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
  var playerCountEl = document.getElementById('player-count-el');
  var botCountEl = document.getElementById('bot-count-el');
  var boneyardEl = document.getElementById('boneyard-el');
  var turnEl = document.getElementById('turn-el');
  var btnDraw = document.getElementById('btn-draw');
  var drawCountEl = document.getElementById('draw-count');
  var playerTilesEl = document.getElementById('player-tiles');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc = document.getElementById('modal-desc');
  var btnRestart = document.getElementById('btn-restart');

  var CANVAS_W = 560;
  var CANVAS_H = 380;

  function resizeCanvas() {
    var container = document.getElementById('container');
    var maxW = container.clientWidth - 20;
    var maxH = container.clientHeight - 20;
    var scale = Math.min(maxW / CANVAS_W, maxH / CANVAS_H, 1.25);
    scale = Math.max(0.65, scale);
    canvas.width = Math.floor(CANVAS_W * scale);
    canvas.height = Math.floor(CANVAS_H * scale);
    render();
  }
  window.addEventListener('resize', resizeCanvas);

  var playerHand = [];
  var botHand = [];
  var boneyard = [];
  var boardChain = []; // sequence of placed tiles on board
  var leftEnd = -1;
  var rightEnd = -1;

  var isPlayerTurn = true;
  var isGameOver = false;
  var consecutivePasses = 0;

  function createDeck() {
    var deck = [];
    for (var i = 0; i <= 6; i++) {
      for (var j = i; j <= 6; j++) {
        deck.push({ a: i, b: j });
      }
    }
    // Shuffle deck
    for (var k = deck.length - 1; k > 0; k--) {
      var r = Math.floor(Math.random() * (k + 1));
      var tmp = deck[k];
      deck[k] = deck[r];
      deck[r] = tmp;
    }
    return deck;
  }

  function initGame() {
    var deck = createDeck();
    playerHand = deck.splice(0, 7);
    botHand = deck.splice(0, 7);
    boneyard = deck;

    // Start with highest double (or first tile from deck)
    var firstTile = boneyard.pop();
    boardChain = [{
      tile: firstTile,
      displayA: firstTile.a,
      displayB: firstTile.b
    }];
    leftEnd = firstTile.a;
    rightEnd = firstTile.b;

    isPlayerTurn = true;
    isGameOver = false;
    consecutivePasses = 0;

    playSound('clack');
    updateHUD();
    renderPlayerHand();
    render();
  }

  function updateHUD() {
    playerCountEl.textContent = playerHand.length;
    botCountEl.textContent = botHand.length;
    boneyardEl.textContent = boneyard.length;
    drawCountEl.textContent = boneyard.length;

    turnEl.textContent = isPlayerTurn ? '🟢 玩家回合' : '🤖 电脑思考中...';
    turnEl.style.color = isPlayerTurn ? '#22c55e' : '#facc15';

    // Enable draw button if player has no playable tile
    var hasPlayable = playerHand.some(function(t) { return canPlayTile(t); });
    btnDraw.disabled = !isPlayerTurn || hasPlayable || boneyard.length === 0;

    // If player has no moves and boneyard empty -> pass turn
    if (isPlayerTurn && !hasPlayable && boneyard.length === 0 && !isGameOver) {
      setTimeout(passTurn, 800);
    }
  }

  function canPlayTile(tile) {
    return tile.a === leftEnd || tile.b === leftEnd || tile.a === rightEnd || tile.b === rightEnd;
  }

  function renderPlayerHand() {
    playerTilesEl.innerHTML = '';
    playerHand.forEach(function(tile, idx) {
      var playable = isPlayerTurn && canPlayTile(tile);

      var btn = document.createElement('button');
      btn.style.cssText = 'padding:6px 12px; background:' + (playable ? '#f8fafc' : '#94a3b8') +
                          '; border:2px solid ' + (playable ? '#38bdf8' : '#64748b') +
                          '; border-radius:6px; font-weight:bold; font-size:15px; cursor:' + (playable ? 'pointer' : 'default') +
                          '; color:#0f172a; flex-shrink:0;';
      btn.textContent = '[' + tile.a + ' | ' + tile.b + ']';

      if (playable) {
        btn.addEventListener('click', function() { playTile(idx); });
      }

      playerTilesEl.appendChild(btn);
    });
  }

  function playTile(handIndex) {
    if (!isPlayerTurn || isGameOver) return;
    var tile = playerHand[handIndex];
    if (!canPlayTile(tile)) return;

    // Attach tile to matching end
    attachTile(tile, true);
    playerHand.splice(handIndex, 1);
    consecutivePasses = 0;
    playSound('clack');

    renderPlayerHand();
    updateHUD();
    render();

    // Check Win
    if (playerHand.length === 0) {
      gameOver(true, '手牌全部清空！多米诺完美胜利！');
      return;
    }

    // Switch to bot
    isPlayerTurn = false;
    updateHUD();
    setTimeout(botTurn, 700);
  }

  function attachTile(tile, isPlayer) {
    // Determine which end to attach to
    if (tile.a === rightEnd) {
      boardChain.push({ tile: tile, displayA: tile.a, displayB: tile.b });
      rightEnd = tile.b;
    } else if (tile.b === rightEnd) {
      boardChain.push({ tile: tile, displayA: tile.b, displayB: tile.a });
      rightEnd = tile.a;
    } else if (tile.a === leftEnd) {
      boardChain.unshift({ tile: tile, displayA: tile.b, displayB: tile.a });
      leftEnd = tile.b;
    } else if (tile.b === leftEnd) {
      boardChain.unshift({ tile: tile, displayA: tile.a, displayB: tile.b });
      leftEnd = tile.a;
    }
  }

  function botTurn() {
    if (isGameOver) return;

    // Find playable tiles in bot hand
    var playableIdx = -1;
    for (var i = 0; i < botHand.length; i++) {
      if (canPlayTile(botHand[i])) {
        playableIdx = i;
        break;
      }
    }

    if (playableIdx !== -1) {
      var tile = botHand[playableIdx];
      attachTile(tile, false);
      botHand.splice(playableIdx, 1);
      consecutivePasses = 0;
      playSound('clack');

      updateHUD();
      render();

      if (botHand.length === 0) {
        gameOver(false, '电脑手牌出尽！电脑取得胜利！');
        return;
      }

      isPlayerTurn = true;
      renderPlayerHand();
      updateHUD();
    } else if (boneyard.length > 0) {
      // Draw from boneyard
      var drawn = boneyard.pop();
      botHand.push(drawn);
      playSound('draw');
      updateHUD();
      setTimeout(botTurn, 450);
    } else {
      // Pass turn
      passTurn();
    }
  }

  function passTurn() {
    consecutivePasses++;
    if (consecutivePasses >= 2) {
      // Blocked game! Lowest pip sum wins
      var playerSum = playerHand.reduce(function(acc, t) { return acc + t.a + t.b; }, 0);
      var botSum = botHand.reduce(function(acc, t) { return acc + t.a + t.b; }, 0);

      if (playerSum <= botSum) {
        gameOver(true, '牌局锁死！玩家点数较少 (' + playerSum + ' vs ' + botSum + ') 取得胜利！');
      } else {
        gameOver(false, '牌局锁死！电脑点数较少 (' + botSum + ' vs ' + playerSum + ') 电脑获胜！');
      }
      return;
    }

    isPlayerTurn = !isPlayerTurn;
    renderPlayerHand();
    updateHUD();
    if (!isPlayerTurn) {
      setTimeout(botTurn, 600);
    }
  }

  btnDraw.addEventListener('click', function() {
    if (!isPlayerTurn || boneyard.length === 0) return;
    var drawn = boneyard.pop();
    playerHand.push(drawn);
    playSound('draw');
    renderPlayerHand();
    updateHUD();
  });

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var w = canvas.width;
    var h = canvas.height;

    // Green felt poker table background
    ctx.fillStyle = '#064e3b';
    ctx.fillRect(0, 0, w, h);

    // Center table line & End Pips Indicators
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('◀ 左端点数: ' + leftEnd, 20, 30);
    ctx.fillText('右端点数: ' + rightEnd + ' ▶', w - 160, 30);

    // Draw placed dominoes chain
    var tileW = 54;
    var tileH = 28;
    var totalLen = boardChain.length;
    var maxPerRow = Math.floor((w - 60) / (tileW + 6));

    boardChain.forEach(function(item, idx) {
      var row = Math.floor(idx / maxPerRow);
      var col = idx % maxPerRow;
      if (row % 2 === 1) col = maxPerRow - 1 - col; // snake back

      var x = 30 + col * (tileW + 6);
      var y = 70 + row * (tileH + 14);

      drawDomino(x, y, tileW, tileH, item.displayA, item.displayB);
    });
  }

  function drawDomino(x, y, w, h, a, b) {
    // Ivory tile body
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);

    // Center divider
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h);
    ctx.stroke();

    // Pips numbers
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(a, x + w * 0.25, y + h * 0.5);
    ctx.fillText(b, x + w * 0.75, y + h * 0.5);
  }

  function gameOver(won, msg) {
    isGameOver = true;
    modalTitle.textContent = won ? '🏆 多米诺大捷！' : '💥 牌局失利！';
    modalTitle.style.color = won ? '#facc15' : '#ef4444';
    modalDesc.textContent = msg;
    modal.classList.remove('hidden');
    playSound(won ? 'win' : 'clack');
  }

  btnRestart.addEventListener('click', function() {
    modal.classList.add('hidden');
    initGame();
  });

  resizeCanvas();
  initGame();

})();
