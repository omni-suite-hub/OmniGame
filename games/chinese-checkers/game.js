// games/chinese-checkers/game.js - Chinese Checkers (跳棋)
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
        osc.frequency.setValueAtTime(480, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.07);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.07);
        osc.start(now);
        osc.stop(now + 0.07);
      } else if (type === 'hop') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.linearRampToValueAtTime(700, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
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
      } else if (type === 'gameover') {
        [280, 220, 160, 100].forEach(function(f, idx) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(f, now + idx * 0.12);
          g.gain.setValueAtTime(0.2, now + idx * 0.12);
          g.gain.linearRampToValueAtTime(0.01, now + idx * 0.12 + 0.18);
          o.start(now + idx * 0.12);
          o.stop(now + idx * 0.12 + 0.18);
        });
      }
    } catch(e) {}
  }

  // DOM
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var playerCampEl = document.getElementById('player-camp-el');
  var botCampEl = document.getElementById('bot-camp-el');
  var turnEl = document.getElementById('turn-el');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc = document.getElementById('modal-desc');
  var btnRestart = document.getElementById('btn-restart');

  var holes = []; // all 121 board holes
  var selectedHole = null;
  var validMoves = []; // array of target holes
  var isPlayerTurn = true;
  var isGameOver = false;

  // Star row structure: [count, offsetInHalfStep]
  // 17 rows
  var STAR_ROWS = [
    { count: 1, r: 0 },
    { count: 2, r: 1 },
    { count: 3, r: 2 },
    { count: 4, r: 3 }, // Top Camp (Bot start, Player target)
    { count: 13, r: 4 },
    { count: 12, r: 5 },
    { count: 11, r: 6 },
    { count: 10, r: 7 },
    { count: 9, r: 8 },  // Waist
    { count: 10, r: 9 },
    { count: 11, r: 10 },
    { count: 12, r: 11 },
    { count: 13, r: 12 },
    { count: 4, r: 13 }, // Bottom Camp (Player start, Bot target)
    { count: 3, r: 14 },
    { count: 2, r: 15 },
    { count: 1, r: 16 }
  ];

  function resizeCanvas() {
    var container = document.getElementById('container');
    var size = Math.min(container.clientWidth - 20, container.clientHeight - 20, 520);
    size = Math.max(300, size);
    canvas.width = size;
    canvas.height = size;
    buildBoard();
    render();
  }
  window.addEventListener('resize', resizeCanvas);

  function buildBoard() {
    holes = [];
    var size = canvas.width;
    var stepY = size / 19;
    var stepX = stepY * 1.05;
    var centerY = size / 2;
    var centerX = size / 2;

    var id = 0;
    for (var rIdx = 0; rIdx < STAR_ROWS.length; rIdx++) {
      var rowData = STAR_ROWS[rIdx];
      var count = rowData.count;
      var y = (rIdx + 1) * stepY;

      for (var c = 0; c < count; c++) {
        var x = centerX + (c - (count - 1) / 2) * stepX;

        // Camp classification
        var camp = 'neutral';
        if (rIdx <= 3) camp = 'top'; // Red bot home / Green target
        else if (rIdx >= 13) camp = 'bottom'; // Green player home / Red target

        holes.push({
          id: id++,
          row: rIdx,
          col: c,
          x: x,
          y: y,
          camp: camp,
          piece: null // 'player' (green), 'bot' (red), null
        });
      }
    }

    // Connect adjacent neighbors (distance close to stepX / stepY)
    holes.forEach(function(h1) {
      h1.neighbors = [];
      holes.forEach(function(h2) {
        if (h1 !== h2) {
          var dist = Math.hypot(h1.x - h2.x, h1.y - h2.y);
          // Distance to direct hex neighbor is roughly stepX (~28px)
          if (dist > stepX * 0.8 && dist < stepX * 1.25) {
            h1.neighbors.push(h2);
          }
        }
      });
    });
  }

  function initGame() {
    isPlayerTurn = true;
    isGameOver = false;
    selectedHole = null;
    validMoves = [];

    buildBoard();

    // Setup 10 Player marbles at bottom camp
    holes.forEach(function(h) {
      if (h.camp === 'bottom') h.piece = 'player';
      else if (h.camp === 'top') h.piece = 'bot';
      else h.piece = null;
    });

    updateHUD();
    render();
  }

  function updateHUD() {
    var playerInGoal = holes.filter(function(h) { return h.camp === 'top' && h.piece === 'player'; }).length;
    var botInGoal = holes.filter(function(h) { return h.camp === 'bottom' && h.piece === 'bot'; }).length;

    playerCampEl.textContent = playerInGoal + ' / 10';
    botCampEl.textContent = botInGoal + ' / 10';

    turnEl.textContent = isPlayerTurn ? '🟢 玩家回合' : '🔴 电脑思考中...';
    turnEl.style.color = isPlayerTurn ? '#22c55e' : '#ef4444';

    if (playerInGoal === 10) {
      gameOver(true, '10 枚棋子已全部入主敌方大本营！大获全胜！');
    } else if (botInGoal === 10) {
      gameOver(false, '电脑率先将所有棋子移入大本营！惜败！');
    }
  }

  function getLegalMoves(startHole) {
    var moves = [];

    // 1. Single Step moves to adjacent empty holes
    startHole.neighbors.forEach(function(adj) {
      if (!adj.piece) {
        moves.push(adj);
      }
    });

    // 2. BFS Chain Jump moves
    var visited = {};
    var queue = [startHole];
    visited[startHole.id] = true;

    while (queue.length > 0) {
      var curr = queue.shift();

      curr.neighbors.forEach(function(neighbor) {
        if (neighbor.piece) {
          // Calculate straight line hop destination
          var dx = neighbor.x - curr.x;
          var dy = neighbor.y - curr.y;
          var targetX = neighbor.x + dx;
          var targetY = neighbor.y + dy;

          // Find if there is a hole at targetX, targetY
          var hopTarget = findHoleNear(targetX, targetY, 8);
          if (hopTarget && !hopTarget.piece && !visited[hopTarget.id]) {
            visited[hopTarget.id] = true;
            moves.push(hopTarget);
            queue.push(hopTarget);
          }
        }
      });
    }

    return moves;
  }

  function findHoleNear(x, y, threshold) {
    for (var i = 0; i < holes.length; i++) {
      if (Math.hypot(holes[i].x - x, holes[i].y - y) <= threshold) {
        return holes[i];
      }
    }
    return null;
  }

  function makeMove(fromHole, toHole) {
    var isJump = Math.hypot(toHole.x - fromHole.x, toHole.y - fromHole.y) > 40;
    toHole.piece = fromHole.piece;
    fromHole.piece = null;
    selectedHole = null;
    validMoves = [];

    if (isJump) playSound('hop');
    else playSound('clack');

    updateHUD();
    render();

    if (!isGameOver) {
      isPlayerTurn = !isPlayerTurn;
      updateHUD();
      if (!isPlayerTurn) {
        setTimeout(botTurn, 450);
      }
    }
  }

  function botTurn() {
    if (isGameOver) return;

    var botHoles = holes.filter(function(h) { return h.piece === 'bot'; });
    var allBotMoves = [];

    botHoles.forEach(function(bHole) {
      var targets = getLegalMoves(bHole);
      targets.forEach(function(target) {
        // Evaluate move: priority is moving DOWNWARDS towards bottom camp (row 13..16)
        var rowGain = target.row - bHole.row;

        // Bonus if landing inside goal camp
        var goalBonus = target.camp === 'bottom' ? 3 : 0;
        // Heavy penalty if leaving bottom camp
        var leavePenalty = bHole.camp === 'bottom' && target.camp !== 'bottom' ? -10 : 0;

        var score = rowGain * 2 + goalBonus + leavePenalty + (Math.random() * 0.4);
        allBotMoves.push({ from: bHole, to: target, score: score });
      });
    });

    if (allBotMoves.length > 0) {
      allBotMoves.sort(function(a, b) { return b.score - a.score; });
      var chosen = allBotMoves[0];
      makeMove(chosen.from, chosen.to);
    } else {
      // Pass turn if no moves
      isPlayerTurn = true;
      updateHUD();
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var size = canvas.width;

    // Board wood rim & star highlight
    ctx.fillStyle = '#b45309';
    ctx.fillRect(0, 0, size, size);

    // Star background shading
    ctx.fillStyle = '#92400e';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
    ctx.fill();

    // 1. Draw connecting grid lines
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.25)';
    ctx.lineWidth = 1.5;
    holes.forEach(function(h) {
      h.neighbors.forEach(function(n) {
        if (h.id < n.id) {
          ctx.beginPath();
          ctx.moveTo(h.x, h.y);
          ctx.lineTo(n.x, n.y);
          ctx.stroke();
        }
      });
    });

    // 2. Draw Holes
    var holeR = size / 48;
    holes.forEach(function(h) {
      var isValidTarget = validMoves.indexOf(h) !== -1;
      var isSelected = selectedHole === h;

      // Hole crater
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.arc(h.x, h.y, holeR, 0, Math.PI * 2);
      ctx.fill();

      // Camp color tint
      if (h.camp === 'top') {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (h.camp === 'bottom') {
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Valid move pulse marker
      if (isValidTarget) {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(h.x, h.y, holeR * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }

      // Marble Pieces
      if (h.piece) {
        var mColor = h.piece === 'player' ? '#22c55e' : '#ef4444';
        ctx.fillStyle = mColor;
        ctx.beginPath();
        ctx.arc(h.x, h.y, holeR * 1.25, 0, Math.PI * 2);
        ctx.fill();

        // 3D sphere highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.arc(h.x - holeR * 0.35, h.y - holeR * 0.35, holeR * 0.45, 0, Math.PI * 2);
        ctx.fill();

        if (isSelected) {
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(h.x, h.y, holeR * 1.55, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    });
  }

  function handlePointer(clientX, clientY) {
    if (!isPlayerTurn || isGameOver) return;
    var rect = canvas.getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;

    var clickedHole = findHoleNear(x, y, canvas.width / 40);
    if (!clickedHole) return;

    if (clickedHole.piece === 'player') {
      // Select piece
      selectedHole = clickedHole;
      validMoves = getLegalMoves(clickedHole);
      playSound('clack');
      render();
    } else if (selectedHole && validMoves.indexOf(clickedHole) !== -1) {
      // Execute move
      makeMove(selectedHole, clickedHole);
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

  function gameOver(won, msg) {
    isGameOver = true;
    modalTitle.textContent = won ? '🏆 棋高一着！' : '💥 挑战结束';
    modalTitle.style.color = won ? '#facc15' : '#ef4444';
    modalDesc.textContent = msg;
    modal.classList.remove('hidden');
    playSound(won ? 'win' : 'gameover');
  }

  btnRestart.addEventListener('click', function() {
    modal.classList.add('hidden');
    initGame();
  });

  resizeCanvas();
  initGame();

})();
