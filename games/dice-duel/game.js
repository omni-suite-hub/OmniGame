/*
 * games/dice-duel/game.js
 * 摇骰对决 (Dice Duel) — 办公室摸鱼极简决斗
 * 支持 5颗比总和 / 1颗定胜负 / 极简吹牛
 * 支持 WebRTC 局域网/跨网双人联机、同屏对战、智能人机与办公室惩罚转盘！
 */
(function () {
  'use strict';

  var DICE_CHARS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  var PENALTIES = [
    '请赢家喝一杯奶茶 🥤',
    '下楼帮拿外卖 🥡',
    '去前台取快递 📦',
    '群里发一元红包 🧧',
    '为赢家真诚点赞 👏',
    '擦会议室白板 🧽',
    '自罚做 5 个深蹲 🏃',
    '本轮免罚，再战一局 ✌️'
  ];
  var WHEEL_COLORS = [
    '#f59e0b', '#ec4899', '#3b82f6', '#10b981',
    '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16'
  ];

  // Sound Synthesizer
  var audioCtx = null;
  var soundEnabled = true;

  try {
    var storedSound = localStorage.getItem('omg:sound');
    if (storedSound !== null) soundEnabled = storedSound === 'true';
  } catch (e) {}

  function getAudioCtx() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playTone(freq, type, dur, gainVal, ramp) {
    if (!soundEnabled) return;
    try {
      var ctx = getAudioCtx();
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (ramp) osc.frequency.exponentialRampToValueAtTime(ramp, ctx.currentTime + dur);
      gain.gain.setValueAtTime(gainVal || 0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch (e) {}
  }

  function playDiceShake() {
    if (!soundEnabled) return;
    for (var i = 0; i < 7; i++) {
      setTimeout(function () {
        playTone(180 + Math.random() * 260, 'triangle', 0.04, 0.15);
      }, i * 45);
    }
  }

  function playCupLift() {
    playTone(280, 'sine', 0.12, 0.18, 520);
  }

  function playWin() {
    if (!soundEnabled) return;
    var notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach(function (n, idx) {
      setTimeout(function () {
        playTone(n, 'triangle', 0.15, 0.25);
      }, idx * 70);
    });
  }

  function playWheelClick() {
    playTone(600, 'square', 0.03, 0.08);
  }

  // State
  var mode = 'ai'; // 'ai' | 'local' | 'online'
  var submode = 'sum5'; // 'sum5' | 'blitz1' | 'liar'
  var net = null;
  var isHost = true;
  var round = 1;
  var p1Score = 0;
  var p2Score = 0;

  var p1Dice = [1, 1, 1, 1, 1];
  var p2Dice = [1, 1, 1, 1, 1];
  var p1Shaken = false;
  var p2Shaken = false;
  var p1Opened = false;
  var p2Opened = false;
  var isPeeking = false;

  // DOM Elements
  var soundBtn = document.getElementById('soundBtn');
  var rulesBtn = document.getElementById('rulesBtn');
  var onlineBtn = document.getElementById('onlineBtn');
  var opponentTypeBtn = document.getElementById('opponentTypeBtn');
  var gameModePills = document.getElementById('gameModePills');

  var p1ScoreEl = document.getElementById('p1Score');
  var p2ScoreEl = document.getElementById('p2Score');
  var p1NameEl = document.getElementById('p1Name');
  var p2NameEl = document.getElementById('p2Name');
  var roundTextEl = document.getElementById('roundText');

  var myCup = document.getElementById('myCup');
  var oppCup = document.getElementById('oppCup');
  var myDiceTray = document.getElementById('myDiceTray');
  var oppDiceTray = document.getElementById('oppDiceTray');
  var myStatusText = document.getElementById('myStatusText');
  var oppStatusText = document.getElementById('oppStatusText');
  var clashBadge = document.getElementById('clashBadge');

  var shakeBtn = document.getElementById('shakeBtn');
  var peekBtn = document.getElementById('peekBtn');
  var openBtn = document.getElementById('openBtn');

  // Penalty Wheel Modal
  var penaltyModal = document.getElementById('penaltyModal');
  var wheelCanvas = document.getElementById('wheelCanvas');
  var spinWheelBtn = document.getElementById('spinWheelBtn');
  var closePenaltyBtn = document.getElementById('closePenaltyBtn');
  var penaltyResult = document.getElementById('penaltyResult');
  var penaltyResultText = document.getElementById('penaltyResultText');
  var penaltyTitle = document.getElementById('penaltyTitle');

  // Rules Modal
  var rulesModal = document.getElementById('rulesModal');
  var closeRulesBtn = document.getElementById('closeRulesBtn');
  var knowRulesBtn = document.getElementById('knowRulesBtn');

  var wheelAngle = 0;
  var isSpinning = false;

  // Init
  function getDiceCount() {
    return submode === 'blitz1' ? 1 : 5;
  }

  function resetRound() {
    p1Shaken = false;
    p2Shaken = false;
    p1Opened = false;
    p2Opened = false;
    isPeeking = false;

    myCup.className = 'dice-cup my-cup';
    oppCup.className = 'dice-cup opp-cup';
    if (myHands) myHands.className = 'human-hands my-hands';
    if (oppHands) oppHands.className = 'human-hands opp-hands';
    if (myAvatarMood) { myAvatarMood.textContent = '🐱'; myAvatarMood.classList.remove('celebrate'); }
    if (oppAvatarMood) { oppAvatarMood.textContent = '🤖'; oppAvatarMood.classList.remove('celebrate'); }
    if (myBubble) myBubble.textContent = '今天我必赢！';
    if (oppBubble) oppBubble.textContent = '看我摇个大的！';
    myDiceTray.innerHTML = '';
    oppDiceTray.innerHTML = '';

    shakeBtn.disabled = false;
    peekBtn.disabled = true;
    openBtn.disabled = true;

    myStatusText.textContent = '点击“摇动骰盅”开始';
    oppStatusText.textContent = '等待摇骰…';
    clashBadge.textContent = '请摇动骰盅';

    roundTextEl.textContent = '第 ' + round + ' 局';
  }

  function rollDice(count) {
    var arr = [];
    for (var i = 0; i < count; i++) {
      arr.push(Math.floor(Math.random() * 6) + 1);
    }
    return arr;
  }

  function renderDiceTray(container, dice, hidden) {
    container.innerHTML = '';
    dice.forEach(function (val) {
      var d = document.createElement('div');
      d.className = 'die' + (val === 6 ? ' die-high' : '');
      d.textContent = hidden ? '❓' : DICE_CHARS[val - 1];
      container.appendChild(d);
    });
  }

  var myHands = document.getElementById('myHands');
  var oppHands = document.getElementById('oppHands');
  var slamRing = document.getElementById('slamRing');
  var myAvatarMood = document.getElementById('myAvatarMood');
  var oppAvatarMood = document.getElementById('oppAvatarMood');
  var myBubble = document.getElementById('myBubble');
  var oppBubble = document.getElementById('oppBubble');

  // Shaking Action
  function doShake() {
    p1Shaken = true;
    shakeBtn.disabled = true;
    myStatusText.textContent = '双手摇盅中…';
    playDiceShake();

    myCup.classList.add('cup-shaking');
    if (myHands) myHands.classList.add('hands-shaking');
    if (myBubble) myBubble.textContent = '哗啦啦~ 摇出大点！';
    if (myAvatarMood) myAvatarMood.textContent = '🔥';

    setTimeout(function () {
      myCup.classList.remove('cup-shaking');
      if (myHands) myHands.classList.remove('hands-shaking');

      // Table slam shockwave & thud sound
      if (slamRing) {
        slamRing.classList.remove('hidden');
        setTimeout(function () { slamRing.classList.add('hidden'); }, 500);
      }
      playTone(110, 'triangle', 0.16, 0.28, 30);

      p1Dice = rollDice(getDiceCount());
      renderDiceTray(myDiceTray, p1Dice, true);
      myStatusText.textContent = '骰盅重扣定格！可偷看或揭盅';
      if (myBubble) myBubble.textContent = '搞定！准备开看';
      peekBtn.disabled = false;
      openBtn.disabled = false;

      if (mode === 'online' && net) {
        net.send('shaken', { count: p1Dice.length });
      } else if (mode === 'ai') {
        scheduleAiShake();
      }
    }, 650);
  }

  function scheduleAiShake() {
    oppStatusText.textContent = '对手双手摇盅中…';
    oppCup.classList.add('cup-shaking');
    if (oppHands) oppHands.classList.add('hands-shaking');
    if (oppBubble) oppBubble.textContent = '看我摇个满点！';
    if (oppAvatarMood) oppAvatarMood.textContent = '😎';

    setTimeout(function () {
      oppCup.classList.remove('cup-shaking');
      if (oppHands) oppHands.classList.remove('hands-shaking');
      p2Dice = rollDice(getDiceCount());
      p2Shaken = true;
      renderDiceTray(oppDiceTray, p2Dice, true);
      oppStatusText.textContent = '对手已重扣准备就绪！';
      if (oppBubble) oppBubble.textContent = '我的点数绝对大！';
    }, 850);
  }

  // Peeking Action
  function doPeek() {
    if (!p1Shaken || p1Opened) return;
    isPeeking = !isPeeking;
    if (isPeeking) {
      myCup.classList.add('cup-peeking');
      if (myHands) myHands.classList.add('hands-peeking');
      renderDiceTray(myDiceTray, p1Dice, false);
      peekBtn.querySelector('.btn-txt').textContent = '合上骰盅';
      myStatusText.textContent = '👀 正在偷看自己的骰子…';
      if (myBubble) myBubble.textContent = '嘘… 悄悄偷瞄一眼！';
      if (myAvatarMood) myAvatarMood.textContent = '🫣';
    } else {
      myCup.classList.remove('cup-peeking');
      if (myHands) myHands.classList.remove('hands-peeking');
      renderDiceTray(myDiceTray, p1Dice, true);
      peekBtn.querySelector('.btn-txt').textContent = '悄悄偷看';
      myStatusText.textContent = '骰盅已盖好，点击揭盅！';
      if (myBubble) myBubble.textContent = '成竹在胸！等揭盅！';
      if (myAvatarMood) myAvatarMood.textContent = '😏';
    }
  }

  // Open & Settle Action
  function doOpen() {
    if (!p1Shaken || p1Opened) return;
    p1Opened = true;
    playCupLift();
    myCup.classList.remove('cup-peeking');
    myCup.classList.add('cup-lifted');
    if (myHands) {
      myHands.classList.remove('hands-peeking');
      myHands.classList.add('hands-lifted');
    }
    renderDiceTray(myDiceTray, p1Dice, false);

    shakeBtn.disabled = true;
    peekBtn.disabled = true;
    openBtn.disabled = true;

    if (mode === 'online' && net) {
      net.send('opened', { dice: p1Dice });
      if (p2Opened) settleRound();
      else myStatusText.textContent = '已揭盅！等待对方揭盅…';
    } else if (mode === 'ai') {
      // AI reveals
      setTimeout(function () {
        p2Opened = true;
        oppCup.classList.add('cup-lifted');
        if (oppHands) oppHands.classList.add('hands-lifted');
        renderDiceTray(oppDiceTray, p2Dice, false);
        settleRound();
      }, 500);
    } else if (mode === 'local') {
      p2Opened = true;
      oppCup.classList.add('cup-lifted');
      if (oppHands) oppHands.classList.add('hands-lifted');
      renderDiceTray(oppDiceTray, p2Dice, false);
      settleRound();
    }
  }

  function settleRound() {
    var p1Sum = p1Dice.reduce(function (a, b) { return a + b; }, 0);
    var p2Sum = p2Dice.reduce(function (a, b) { return a + b; }, 0);

    // Check Leopard (all dice equal)
    var p1IsLeopard = p1Dice.length > 1 && p1Dice.every(function (v) { return v === p1Dice[0]; });
    var p2IsLeopard = p2Dice.length > 1 && p2Dice.every(function (v) { return v === p2Dice[0]; });

    var winner = 0; // 1: p1, 2: p2, 0: tie

    if (p1IsLeopard && !p2IsLeopard) {
      winner = 1;
    } else if (p2IsLeopard && !p1IsLeopard) {
      winner = 2;
    } else {
      if (p1Sum > p2Sum) winner = 1;
      else if (p2Sum > p1Sum) winner = 2;
      else winner = 0;
    }

    if (winner === 1) {
      p1Score++;
      p1ScoreEl.textContent = p1Score;
      playWin();
      clashBadge.textContent = '🎉 你赢了！点数: ' + p1Sum + ' vs ' + p2Sum + (p1IsLeopard ? ' (豹子暴击!)' : '');
      myStatusText.textContent = '🏆 获胜！';
      oppStatusText.textContent = '💔 惜败…';
      if (myAvatarMood) { myAvatarMood.textContent = '🥳'; myAvatarMood.classList.add('celebrate'); }
      if (myBubble) myBubble.textContent = '点数通吃！大获全胜！👑';
      if (oppAvatarMood) { oppAvatarMood.textContent = '😭'; oppAvatarMood.classList.remove('celebrate'); }
      if (oppBubble) oppBubble.textContent = '竟然摇得这么大…';
    } else if (winner === 2) {
      p2Score++;
      p2ScoreEl.textContent = p2Score;
      clashBadge.textContent = '💔 对方胜出！点数: ' + p1Sum + ' vs ' + p2Sum + (p2IsLeopard ? ' (对方豹子!)' : '');
      myStatusText.textContent = '💔 惜败…';
      oppStatusText.textContent = '🏆 获胜！';
      if (oppAvatarMood) { oppAvatarMood.textContent = '😎'; oppAvatarMood.classList.add('celebrate'); }
      if (oppBubble) oppBubble.textContent = '哈哈承让承让！👑';
      if (myAvatarMood) { myAvatarMood.textContent = '😢'; myAvatarMood.classList.remove('celebrate'); }
      if (myBubble) myBubble.textContent = '差了一点点…';
    } else {
      clashBadge.textContent = '🤝 平局！点数相同: ' + p1Sum;
      myStatusText.textContent = '平局';
      oppStatusText.textContent = '平局';
      if (myAvatarMood) { myAvatarMood.textContent = '😲'; myAvatarMood.classList.remove('celebrate'); }
      if (oppAvatarMood) { oppAvatarMood.textContent = '😲'; oppAvatarMood.classList.remove('celebrate'); }
      if (myBubble) myBubble.textContent = '点数一模一样！';
      if (oppBubble) oppBubble.textContent = '平局！再来！🔥';
    }

    round++;
    setTimeout(function () {
      if (winner === 1 || winner === 2) {
        showPenaltyModal(winner === 1 ? '你获胜！快转动轮盘惩罚对手吧！' : '你输了！来接受办公室命运吧！');
      } else {
        resetRound();
      }
    }, 1500);
  }

  // Penalty Wheel Drawing & Logic
  function drawWheel() {
    if (!wheelCanvas) return;
    var ctx = wheelCanvas.getContext('2d');
    var w = wheelCanvas.width;
    var h = wheelCanvas.height;
    var cx = w / 2;
    var cy = h / 2;
    var r = cx - 6;
    var num = PENALTIES.length;
    var arc = (2 * Math.PI) / num;

    ctx.clearRect(0, 0, w, h);

    for (var i = 0; i < num; i++) {
      var angle = i * arc;
      ctx.beginPath();
      ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + arc);
      ctx.lineTo(cx, cy);
      ctx.fill();

      // Border line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Text
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10.5px sans-serif';
      ctx.translate(cx, cy);
      ctx.rotate(angle + arc / 2);
      ctx.textAlign = 'right';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 3;
      var label = PENALTIES[i].split(' ')[0]; // short text
      ctx.fillText(label, r - 12, 4);
      ctx.restore();
    }

    // Center pin
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, 2 * Math.PI);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎲', cx, cy + 4);
  }

  function showPenaltyModal(title) {
    penaltyTitle.textContent = title;
    penaltyResult.classList.add('hidden');
    spinWheelBtn.disabled = false;
    penaltyModal.classList.remove('hidden');
    drawWheel();
  }

  function spinWheel(remoteIdx) {
    if (isSpinning) return;
    isSpinning = true;
    spinWheelBtn.disabled = true;

    var num = PENALTIES.length;
    var selectedIdx = (typeof remoteIdx === 'number') ? remoteIdx : Math.floor(Math.random() * num);

    if (typeof remoteIdx !== 'number' && mode === 'online' && net) {
      net.send('spinWheel', { selectedIdx: selectedIdx });
    }

    var arcDeg = 360 / num;
    // Calculate rotation so selected segment points to top (-90deg)
    var targetDeg = (360 - (selectedIdx * arcDeg) - (arcDeg / 2) - 90);
    var totalRots = (5 + Math.floor(Math.random() * 3)) * 360;
    wheelAngle += totalRots + targetDeg;

    wheelCanvas.style.transform = 'rotate(' + wheelAngle + 'deg)';

    // Play click ticks
    var tickInterval = setInterval(playWheelClick, 140);
    setTimeout(function () {
      clearInterval(tickInterval);
      isSpinning = false;
      var chosen = PENALTIES[selectedIdx];
      penaltyResultText.textContent = chosen;
      penaltyResult.classList.remove('hidden');
      playWin();
    }, 3500);
  }

  // Button Listeners
  shakeBtn.addEventListener('click', doShake);
  peekBtn.addEventListener('click', doPeek);
  openBtn.addEventListener('click', doOpen);

  if (spinWheelBtn) spinWheelBtn.addEventListener('click', function () { spinWheel(); });
  if (closePenaltyBtn) {
    closePenaltyBtn.addEventListener('click', function () {
      penaltyModal.classList.add('hidden');
      if (mode === 'online' && net) {
        net.send('nextRound', {});
      }
      resetRound();
    });
  }

  var backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', function () {
      try { parent.postMessage({ type: 'omnigame:home' }, '*'); } catch (e) {}
      if (window.parent === window) {
        if (history.length > 1) history.back();
        else window.location.href = '../../index.html';
      }
    });
  }

  // Sound Toggle
  if (soundBtn) {
    soundBtn.addEventListener('click', function () {
      soundEnabled = !soundEnabled;
      soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
      try { localStorage.setItem('omg:sound', soundEnabled ? 'true' : 'false'); } catch (e) {}
    });
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  }

  // Rules Modal
  if (rulesBtn) rulesBtn.addEventListener('click', function () { rulesModal.classList.remove('hidden'); });
  if (closeRulesBtn) closeRulesBtn.addEventListener('click', function () { rulesModal.classList.add('hidden'); });
  if (knowRulesBtn) knowRulesBtn.addEventListener('click', function () { rulesModal.classList.add('hidden'); });

  // Submode Selector (5颗 / 1颗 / 吹牛)
  if (gameModePills) {
    gameModePills.addEventListener('click', function (e) {
      var pill = e.target.closest('.pill');
      if (pill && pill.dataset.submode) {
        var pills = gameModePills.querySelectorAll('.pill');
        pills.forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        submode = pill.dataset.submode;
        resetRound();
      }
    });
  }

  // Opponent Type Toggle (AI -> Local 2P)
  if (opponentTypeBtn) {
    opponentTypeBtn.addEventListener('click', function () {
      if (mode === 'ai') {
        mode = 'local';
        opponentTypeBtn.textContent = '👥 同屏双人';
        p2NameEl.textContent = '玩家2';
      } else {
        mode = 'ai';
        opponentTypeBtn.textContent = '🤖 人机: 摸鱼小王';
        p2NameEl.textContent = '摸鱼小王';
      }
      resetRound();
    });
  }

  // Online Multiplayer via OmniNet
  if (onlineBtn) {
    onlineBtn.addEventListener('click', function () {
      if (window.OmniNetUI && window.OmniNetUI.openLobby) {
        window.OmniNetUI.openLobby('dice-duel', '摇骰对决', function (session) {
          if (!session) return;
          mode = session.mode;
          net = session.net;
          isHost = session.isHost;

          if (mode === 'online') {
            opponentTypeBtn.textContent = '🌐 联机对战中';
            p1NameEl.textContent = '你 (' + (isHost ? '房主' : '加入者') + ')';
            p2NameEl.textContent = (session.opponent && session.opponent.nickname) || '联机好友';

            net.on('msg:shaken', function () {
              p2Shaken = true;
              oppStatusText.textContent = '对方已摇好骰盅！';
            });

            net.on('msg:opened', function (data) {
              p2Opened = true;
              p2Dice = data.dice || [];
              oppCup.classList.add('cup-lifted');
              renderDiceTray(oppDiceTray, p2Dice, false);
              if (p1Opened) settleRound();
            });

            net.on('msg:spinWheel', function (d) {
              if (penaltyModal.classList.contains('hidden')) {
                penaltyModal.classList.remove('hidden');
                drawWheel();
              }
              spinWheel(d.selectedIdx);
            });

            net.on('msg:nextRound', function () {
              penaltyModal.classList.add('hidden');
              resetRound();
            });

            net.on('disconnected', function () {
              clashBadge.textContent = '⚠️ 对方已断开连接';
              mode = 'ai';
              opponentTypeBtn.textContent = '🤖 人机: 摸鱼小王';
            });
          }
          resetRound();
        });
      }
    });
  }

  // Initial draw & start
  drawWheel();
  resetRound();
})();
