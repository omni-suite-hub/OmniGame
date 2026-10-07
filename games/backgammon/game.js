// games/backgammon/game.js - Classic Backgammon (双陆棋)
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

      if (type === 'dice') {
        var bufferSize = ctx.sampleRate * 0.15;
        var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        var noise = ctx.createBufferSource();
        noise.buffer = buffer;
        var filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, now);
        noise.connect(filter);
        filter.connect(gain);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        noise.start(now);
        noise.stop(now + 0.15);
      } else if (type === 'clack') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.06);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
      } else if (type === 'hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
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
  var playerOffEl = document.getElementById('player-off-el');
  var botOffEl = document.getElementById('bot-off-el');
  var turnEl = document.getElementById('turn-el');
  var diceDisplay = document.getElementById('dice-display');
  var btnRoll = document.getElementById('btn-roll');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc = document.getElementById('modal-desc');
  var btnRestart = document.getElementById('btn-restart');

  var CANVAS_W = 540;
  var CANVAS_H = 420;

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

  // Board State: points 1..24
  // Each point: { player: 'white'|'black'|null, count: 0 }
  var points = [];
  var bar = { white: 0, black: 0 };
  var borneOff = { white: 0, black: 0 };

  var isPlayerTurn = true; // true = White (Player), false = Black (Bot)
  var diceRemaining = []; // available moves
  var hasRolled = false;
  var isGameOver = false;

  var selectedPoint = null; // null or point index (1..24) or 'bar'
  var validDestinations = []; // array of point indices (or 0 for bearing off)

  function initGame() {
    points = [];
    for (var i = 0; i <= 24; i++) {
      points.push({ player: null, count: 0 });
    }

    // Standard starting positions:
    // White moves clockwise from 24 down to 1
    // Black moves counter-clockwise from 1 up to 24
    points[24] = { player: 'white', count: 2 };
    points[13] = { player: 'white', count: 5 };
    points[8]  = { player: 'white', count: 3 };
    points[6]  = { player: 'white', count: 5 };

    points[1]  = { player: 'black', count: 2 };
    points[12] = { player: 'black', count: 5 };
    points[17] = { player: 'black', count: 3 };
    points[19] = { player: 'black', count: 5 };

    bar = { white: 0, black: 0 };
    borneOff = { white: 0, black: 0 };

    isPlayerTurn = true;
    hasRolled = false;
    diceRemaining = [];
    selectedPoint = null;
    validDestinations = [];
    isGameOver = false;

    btnRoll.disabled = false;
    renderDice();
    updateHUD();
    render();
  }

  function updateHUD() {
    playerOffEl.textContent = borneOff.white + ' / 15';
    botOffEl.textContent = borneOff.black + ' / 15';

    turnEl.textContent = isPlayerTurn ? '⚪ 玩家回合' : '⚫ 电脑回合';
    turnEl.style.color = isPlayerTurn ? '#22c55e' : '#facc15';

    if (borneOff.white === 15) {
      gameOver(true, '15枚白棋已全部移出棋盘！大获全胜！');
    } else if (borneOff.black === 15) {
      gameOver(false, '电脑率先将黑棋全部移出棋盘！');
    }
  }

  function renderDice() {
    diceDisplay.innerHTML = '';
    if (diceRemaining.length === 0) {
      diceDisplay.innerHTML = '<div class="dice">-</div><div class="dice">-</div>';
    } else {
      diceRemaining.forEach(function(d) {
        var el = document.createElement('div');
        el.className = 'dice';
        el.textContent = d;
        diceDisplay.appendChild(el);
      });
    }
  }

  function rollDice() {
    if (hasRolled || isGameOver) return;
    hasRolled = true;
    btnRoll.disabled = true;
    playSound('dice');

    var d1 = Math.floor(Math.random() * 6) + 1;
    var d2 = Math.floor(Math.random() * 6) + 1;

    if (d1 === d2) {
      diceRemaining = [d1, d1, d1, d1]; // doubles
    } else {
      diceRemaining = [d1, d2];
    }

    renderDice();

    // Check if player has any legal moves
    if (isPlayerTurn) {
      checkPlayerLegalMoves();
    } else {
      setTimeout(botTurn, 600);
    }
  }

  function canBearOff(player) {
    if (player === 'white') {
      if (bar.white > 0) return false;
      for (var p = 7; p <= 24; p++) {
        if (points[p].player === 'white' && points[p].count > 0) return false;
      }
      return true;
    } else {
      if (bar.black > 0) return false;
      for (var p2 = 1; p2 <= 18; p2++) {
        if (points[p2].player === 'black' && points[p2].count > 0) return false;
      }
      return true;
    }
  }

  function getLegalDestinations(fromPoint, player) {
    var dests = [];
    var uniqueDice = Array.from(new Set(diceRemaining));

    uniqueDice.forEach(function(die) {
      var target;
      if (player === 'white') {
        target = fromPoint === 'bar' ? (25 - die) : (fromPoint - die);
      } else {
        target = fromPoint === 'bar' ? die : (fromPoint + die);
      }

      // Bearing off check
      if (player === 'white' && target <= 0) {
        if (canBearOff('white')) {
          if (target === 0) {
            dests.push({ target: 0, die: die });
          } else {
            // Can bear off from highest occupied home point
            var highestPoint = 0;
            for (var hp = 6; hp >= 1; hp--) {
              if (points[hp].player === 'white' && points[hp].count > 0) {
                highestPoint = hp;
                break;
              }
            }
            if (fromPoint === highestPoint) {
              dests.push({ target: 0, die: die });
            }
          }
        }
      } else if (player === 'black' && target >= 25) {
        if (canBearOff('black')) {
          if (target === 25) {
            dests.push({ target: 25, die: die });
          } else {
            var lowestPoint = 25;
            for (var lp = 19; lp <= 24; lp++) {
              if (points[lp].player === 'black' && points[lp].count > 0) {
                lowestPoint = lp;
                break;
              }
            }
            if (fromPoint === lowestPoint) {
              dests.push({ target: 25, die: die });
            }
          }
        }
      } else if (target >= 1 && target <= 24) {
        var opponent = player === 'white' ? 'black' : 'white';
        // Check destination occupancy
        if (points[target].player !== opponent || points[target].count <= 1) {
          dests.push({ target: target, die: die });
        }
      }
    });

    return dests;
  }

  function checkPlayerLegalMoves() {
    var hasMoves = false;
    if (bar.white > 0) {
      if (getLegalDestinations('bar', 'white').length > 0) hasMoves = true;
    } else {
      for (var p = 1; p <= 24; p++) {
        if (points[p].player === 'white' && points[p].count > 0) {
          if (getLegalDestinations(p, 'white').length > 0) {
            hasMoves = true;
            break;
          }
        }
      }
    }

    if (!hasMoves) {
      // Pass turn
      setTimeout(endTurn, 500);
    }
  }

  function executeMove(from, to, dieUsed, player) {
    var opp = player === 'white' ? 'black' : 'white';

    // Remove from source
    if (from === 'bar') {
      bar[player]--;
    } else {
      points[from].count--;
      if (points[from].count === 0) points[from].player = null;
    }

    // Add to target
    if (to === 0 || to === 25) {
      borneOff[player]++;
      playSound('clack');
    } else {
      if (points[to].player === opp && points[to].count === 1) {
        // Hit opponent blot!
        points[to].player = player;
        bar[opp]++;
        playSound('hit');
      } else {
        points[to].player = player;
        points[to].count++;
        playSound('clack');
      }
    }

    // Consume die
    var dIdx = diceRemaining.indexOf(dieUsed);
    if (dIdx !== -1) diceRemaining.splice(dIdx, 1);

    renderDice();
    updateHUD();
    render();

    selectedPoint = null;
    validDestinations = [];

    // Check if turn ended
    if (diceRemaining.length === 0 || isGameOver) {
      endTurn();
    } else {
      if (player === 'white') {
        checkPlayerLegalMoves();
      }
    }
  }

  function endTurn() {
    if (isGameOver) return;
    isPlayerTurn = !isPlayerTurn;
    hasRolled = false;
    diceRemaining = [];
    selectedPoint = null;
    validDestinations = [];
    renderDice();
    updateHUD();

    if (isPlayerTurn) {
      btnRoll.disabled = false;
    } else {
      btnRoll.disabled = true;
      setTimeout(rollDice, 600);
    }
  }

  function botTurn() {
    if (isGameOver || diceRemaining.length === 0) {
      endTurn();
      return;
    }

    // Find all legal moves for bot
    var allMoves = [];
    if (bar.black > 0) {
      var barDests = getLegalDestinations('bar', 'black');
      barDests.forEach(function(d) {
        allMoves.push({ from: 'bar', to: d.target, die: d.die });
      });
    } else {
      for (var p = 1; p <= 24; p++) {
        if (points[p].player === 'black' && points[p].count > 0) {
          var dests = getLegalDestinations(p, 'black');
          dests.forEach(function(d) {
            allMoves.push({ from: p, to: d.target, die: d.die });
          });
        }
      }
    }

    if (allMoves.length === 0) {
      endTurn();
      return;
    }

    // Pick best move (prioritize hitting white blot, or bearing off)
    allMoves.sort(function(a, b) {
      var scoreA = 0;
      var scoreB = 0;
      if (a.to === 25) scoreA += 50;
      if (b.to === 25) scoreB += 50;
      if (a.to > 0 && a.to < 25 && points[a.to].player === 'white') scoreA += 40;
      if (b.to > 0 && b.to < 25 && points[b.to].player === 'white') scoreB += 40;
      return scoreB - scoreA;
    });

    var chosen = allMoves[0];
    executeMove(chosen.from, chosen.to, chosen.die, 'black');

    if (!isGameOver && diceRemaining.length > 0) {
      setTimeout(botTurn, 450);
    }
  }

  // Board layout geometry
  function getPointRect(pointIdx) {
    var w = canvas.width;
    var h = canvas.height;
    var barW = w * 0.08;
    var laneW = (w - barW - 30) / 12;
    var pointH = h * 0.42;

    var isTop = pointIdx >= 13;
    var colIdx;

    if (isTop) {
      // 13..24 (left to right)
      colIdx = pointIdx - 13;
    } else {
      // 12..1 (left to right)
      colIdx = 12 - pointIdx;
    }

    var x = 15 + colIdx * laneW + (colIdx >= 6 ? barW : 0);
    var y = isTop ? 0 : h - pointH;

    return { x: x, y: y, w: laneW, h: pointH, isTop: isTop };
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var w = canvas.width;
    var h = canvas.height;

    // 1. Board Background (Wood texture)
    ctx.fillStyle = '#451a03';
    ctx.fillRect(0, 0, w, h);

    // Inner board felt
    ctx.fillStyle = '#78350f';
    ctx.fillRect(10, 10, w - 20, h - 20);

    // Central Bar
    var barW = w * 0.08;
    var barX = (w - barW) / 2;
    ctx.fillStyle = '#290e02';
    ctx.fillRect(barX, 10, barW, h - 20);

    // 2. Draw 24 Triangular Points
    for (var p = 1; p <= 24; p++) {
      var pr = getPointRect(p);
      var color = (p % 2 === 0) ? '#d97706' : '#92400e';
      ctx.fillStyle = color;

      ctx.beginPath();
      if (pr.isTop) {
        ctx.moveTo(pr.x, 10);
        ctx.lineTo(pr.x + pr.w, 10);
        ctx.lineTo(pr.x + pr.w / 2, 10 + pr.h);
      } else {
        ctx.moveTo(pr.x, h - 10);
        ctx.lineTo(pr.x + pr.w, h - 10);
        ctx.lineTo(pr.x + pr.w / 2, h - 10 - pr.h);
      }
      ctx.closePath();
      ctx.fill();

      // Highlight valid destination
      var isValid = validDestinations.some(function(vd) { return vd.target === p; });
      if (isValid) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Draw Checkers on point
      var pt = points[p];
      if (pt && pt.count > 0) {
        var checkerR = Math.min(pr.w * 0.44, 15);
        for (var c = 0; c < Math.min(5, pt.count); c++) {
          var cy = pr.isTop ? 22 + c * (checkerR * 1.8) : h - 22 - c * (checkerR * 1.8);
          drawChecker(pr.x + pr.w / 2, cy, checkerR, pt.player);
        }
        if (pt.count > 5) {
          ctx.fillStyle = '#facc15';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(pt.count, pr.x + pr.w / 2, pr.isTop ? 22 + 4 * (checkerR * 1.8) : h - 22 - 4 * (checkerR * 1.8));
        }
      }
    }

    // 3. Draw Checkers on Bar
    var chR = 14;
    for (var wb = 0; wb < bar.white; wb++) {
      drawChecker(barX + barW / 2, h / 2 - 25 - wb * 20, chR, 'white');
    }
    for (var bb = 0; bb < bar.black; bb++) {
      drawChecker(barX + barW / 2, h / 2 + 25 + bb * 20, chR, 'black');
    }

    // Highlight selected point / checker
    if (selectedPoint !== null) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3;
      if (selectedPoint === 'bar') {
        ctx.strokeRect(barX + 2, h / 2 - 50, barW - 4, 45);
      } else {
        var spr = getPointRect(selectedPoint);
        ctx.strokeRect(spr.x, spr.y, spr.w, spr.h);
      }
    }
  }

  function drawChecker(x, y, r, player) {
    ctx.fillStyle = player === 'white' ? '#f8fafc' : '#0f172a';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = player === 'white' ? '#94a3b8' : '#334155';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = player === 'white' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function handlePointer(clientX, clientY) {
    if (!isPlayerTurn || !hasRolled || isGameOver) return;
    var rect = canvas.getBoundingClientRect();
    var clickX = clientX - rect.left;
    var clickY = clientY - rect.top;

    var barW = canvas.width * 0.08;
    var barX = (canvas.width - barW) / 2;

    // Check Bar click
    if (clickX >= barX && clickX <= barX + barW && bar.white > 0) {
      selectedPoint = 'bar';
      validDestinations = getLegalDestinations('bar', 'white');
      render();
      return;
    }

    // Check clicking points
    for (var p = 1; p <= 24; p++) {
      var pr = getPointRect(p);
      if (clickX >= pr.x && clickX <= pr.x + pr.w && clickY >= pr.y && clickY <= pr.y + pr.h) {
        if (selectedPoint !== null) {
          // Check if clicking valid destination
          var matchedDest = validDestinations.find(function(vd) { return vd.target === p; });
          if (matchedDest) {
            executeMove(selectedPoint, p, matchedDest.die, 'white');
            return;
          }
        }

        // Select point with player's checkers
        if (bar.white === 0 && points[p].player === 'white' && points[p].count > 0) {
          selectedPoint = p;
          validDestinations = getLegalDestinations(p, 'white');
          render();
          return;
        }
      }
    }

    // Click anywhere else (or off board) to bear off if valid
    if (selectedPoint !== null) {
      var bearOffDest = validDestinations.find(function(vd) { return vd.target === 0; });
      if (bearOffDest) {
        executeMove(selectedPoint, 0, bearOffDest.die, 'white');
      }
    }
  }

  canvas.addEventListener('click', function(e) {
    handlePointer(e.clientX, e.clientY);
  });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
      handlePointer(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });

  btnRoll.addEventListener('click', rollDice);

  function gameOver(won, msg) {
    isGameOver = true;
    modalTitle.textContent = won ? '🏆 算无遗策！' : '💥 棋局惜败！';
    modalTitle.style.color = won ? '#facc15' : '#ef4444';
    modalDesc.textContent = msg;
    modal.classList.remove('hidden');
    playSound(won ? 'win' : 'hit');
  }

  btnRestart.addEventListener('click', function() {
    modal.classList.add('hidden');
    initGame();
  });

  initGame();
  resizeCanvas();

})();
