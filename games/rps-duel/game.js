/*
 * games/rps-duel/game.js
 * 猜拳巅峰赛 (RPS Duel) — 办公室摸鱼极简对决
 * 支持 BO3 / BO5 / 一局定胜负
 * 支持 WebRTC 局域网/跨网联机、同屏对战、智能心理学 AI 与办公室惩罚抽签！
 */
(function () {
  'use strict';

  var GESTURES = {
    rock: { name: '石头', icon: '✊', beats: 'scissors' },
    scissors: { name: '剪刀', icon: '✌️', beats: 'paper' },
    paper: { name: '布', icon: '🖐️', beats: 'rock' }
  };

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '为赢家捶背捏肩 30 秒 💆',
    '主动把会议室白板擦干净 🧽',
    '自罚原地做 5 个深蹲 🏃',
    '大喊一声“摸鱼万岁！” 📢'
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

  function playCountBeep(num) {
    playTone(400 + (4 - num) * 120, 'sine', 0.08, 0.18);
  }

  function playClash() {
    playTone(160, 'sawtooth', 0.22, 0.25, 60);
  }

  function playWin() {
    if (!soundEnabled) return;
    var notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach(function (n, idx) {
      setTimeout(function () {
        playTone(n, 'triangle', 0.16, 0.25);
      }, idx * 60);
    });
  }

  // State
  var boTarget = 2; // target wins (2 for BO3, 3 for BO5, 1 for Sudden Death)
  var mode = 'ai'; // 'ai' | 'local' | 'online'
  var net = null;
  var isHost = true;

  var p1Score = 0;
  var p2Score = 0;
  var streak = 0;
  var isResolving = false;

  var p1Choice = null;
  var p2Choice = null;

  // AI Memory (tracks player habits)
  var playerHistory = [];

  // DOM Elements
  var soundBtn = document.getElementById('soundBtn');
  var rulesBtn = document.getElementById('rulesBtn');
  var onlineBtn = document.getElementById('onlineBtn');
  var opponentTypeBtn = document.getElementById('opponentTypeBtn');
  var boPills = document.getElementById('boPills');

  var p1Dots = document.getElementById('p1Dots');
  var p2Dots = document.getElementById('p2Dots');
  var p1NameEl = document.getElementById('p1Name');
  var p2NameEl = document.getElementById('p2Name');
  var streakBadge = document.getElementById('streakBadge');

  var oppHand = document.getElementById('oppHand');
  var playerHand = document.getElementById('playerHand');
  var oppHandLabel = document.getElementById('oppHandLabel');
  var playerHandLabel = document.getElementById('playerHandLabel');
  var resultBanner = document.getElementById('resultBanner');
  var countdownEl = document.getElementById('countdownEl');
  var clashEffect = document.getElementById('clashEffect');

  var btnRock = document.getElementById('btnRock');
  var btnScissors = document.getElementById('btnScissors');
  var btnPaper = document.getElementById('btnPaper');
  var gestureBtns = [btnRock, btnScissors, btnPaper];

  // Penalty Modal
  var penaltyModal = document.getElementById('penaltyModal');
  var matchOverTitle = document.getElementById('matchOverTitle');
  var matchOverDesc = document.getElementById('matchOverDesc');
  var finalPenaltyText = document.getElementById('finalPenaltyText');
  var reRollPenaltyBtn = document.getElementById('reRollPenaltyBtn');
  var rematchBtn = document.getElementById('rematchBtn');

  // Rules Modal
  var rulesModal = document.getElementById('rulesModal');
  var closeRulesBtn = document.getElementById('closeRulesBtn');
  var knowRulesBtn = document.getElementById('knowRulesBtn');

  // Render Score Dots
  function renderDots() {
    p1Dots.innerHTML = '';
    p2Dots.innerHTML = '';
    for (var i = 0; i < boTarget; i++) {
      var d1 = document.createElement('div');
      d1.className = 'round-dot' + (i < p1Score ? ' scored' : '');
      p1Dots.appendChild(d1);

      var d2 = document.createElement('div');
      d2.className = 'round-dot' + (i < p2Score ? ' scored' : '');
      p2Dots.appendChild(d2);
    }
  }

  function resetMatch() {
    p1Score = 0;
    p2Score = 0;
    streak = 0;
    streakBadge.textContent = '🔥 连胜: 0';
    renderDots();
    resetRound();
  }

  function resetRound() {
    isResolving = false;
    p1Choice = null;
    p2Choice = null;

    oppHand.className = 'hand-avatar';
    playerHand.className = 'hand-avatar';
    oppHand.querySelector('.hand-emoji').textContent = '❓';
    playerHand.querySelector('.hand-emoji').textContent = '❓';

    if (oppAvatarMood) { oppAvatarMood.textContent = '😏'; oppAvatarMood.classList.remove('celebrate'); }
    if (playerAvatarMood) { playerAvatarMood.textContent = '🐱'; playerAvatarMood.classList.remove('celebrate'); }
    if (oppBubble) oppBubble.textContent = '看招！';
    if (playerBubble) playerBubble.textContent = '我出定你了！';

    countdownEl.classList.add('hidden');
    if (chantBadge) chantBadge.classList.add('hidden');
    clashEffect.classList.add('hidden');
    resultBanner.textContent = '请选择出拳手势！';

    playerHandLabel.textContent = '等待你出拳';
    oppHandLabel.textContent = mode === 'ai' ? '对方思考中…' : '等待对方…';

    gestureBtns.forEach(function (btn) { btn.disabled = false; });
  }

  // Player Chooses Gesture
  function chooseGesture(g) {
    if (isResolving) return;
    p1Choice = g;
    gestureBtns.forEach(function (btn) { btn.disabled = true; });
    playerHand.querySelector('.hand-emoji').textContent = GESTURES[g].icon;
    playerHandLabel.textContent = '你已出: ' + GESTURES[g].name;

    if (mode === 'ai') {
      p2Choice = getAiChoice();
      startCountdownAndClash();
    } else if (mode === 'online' && net) {
      net.send('picked', { choice: g });
      if (p2Choice) {
        startCountdownAndClash();
      } else {
        resultBanner.textContent = '已出拳！等待对手选择…';
      }
    }
  }

  // AI Psychology Prediction
  function getAiChoice() {
    var keys = ['rock', 'scissors', 'paper'];
    if (playerHistory.length < 2) {
      return keys[Math.floor(Math.random() * keys.length)];
    }
    // Frequency analysis: predict what player likes to throw
    var last = playerHistory[playerHistory.length - 1];
    // People often switch from what just lost or repeat what won
    var counterToLast = last === 'rock' ? 'paper' : (last === 'scissors' ? 'rock' : 'scissors');
    return Math.random() < 0.6 ? counterToLast : keys[Math.floor(Math.random() * keys.length)];
  }

  // DOM elements for humanoid avatars & chant
  var arenaStage = document.getElementById('arenaStage');
  var chantBadge = document.getElementById('chantBadge');
  var oppAvatarMood = document.getElementById('oppAvatarMood');
  var playerAvatarMood = document.getElementById('playerAvatarMood');
  var oppBubble = document.getElementById('oppBubble');
  var playerBubble = document.getElementById('playerBubble');

  // Dramatic Countdown & Chant Clash Animation
  function startCountdownAndClash() {
    isResolving = true;
    countdownEl.classList.remove('hidden');
    if (chantBadge) chantBadge.classList.remove('hidden');

    // Both fists shake up & down in rhythm
    oppHand.classList.add('shaking-hand-down');
    playerHand.classList.add('shaking-hand-up');
    oppHand.querySelector('.hand-emoji').textContent = '✊';
    playerHand.querySelector('.hand-emoji').textContent = '✊';

    var chants = ['石头 ✊', '剪刀 ✌️', '布 🖐️！'];
    var count = 3;

    function updateBeat(c) {
      countdownEl.textContent = c;
      if (chantBadge) chantBadge.textContent = chants[3 - c];
      if (oppBubble) oppBubble.textContent = c === 3 ? '预备！' : (c === 2 ? '接招！' : '看拳！');
      if (playerBubble) playerBubble.textContent = c === 3 ? '来吧！' : (c === 2 ? '锁定你！' : '绝杀！');
      playCountBeep(c);
    }

    updateBeat(count);

    var timer = setInterval(function () {
      count--;
      if (count > 0) {
        updateBeat(count);
      } else {
        clearInterval(timer);
        countdownEl.classList.add('hidden');
        if (chantBadge) chantBadge.classList.add('hidden');
        oppHand.classList.remove('shaking-hand-down');
        playerHand.classList.remove('shaking-hand-up');
        executeClash();
      }
    }, 450);
  }

  function executeClash() {
    // Reveal hands
    oppHand.querySelector('.hand-emoji').textContent = GESTURES[p2Choice].icon;
    oppHandLabel.textContent = '对方出: ' + GESTURES[p2Choice].name;

    // Trigger powerful clash punch
    oppHand.classList.add('clash-opp');
    playerHand.classList.add('clash-player');

    // Screen shake
    if (arenaStage) {
      arenaStage.classList.remove('shake-arena');
      void arenaStage.offsetWidth;
      arenaStage.classList.add('shake-arena');
    }

    // Energy boom
    setTimeout(function () {
      playClash();
      clashEffect.classList.remove('hidden');
      settleOutcome();
    }, 350);
  }

  function settleOutcome() {
    playerHistory.push(p1Choice);

    var winner = 0; // 0: tie, 1: p1, 2: p2
    if (p1Choice === p2Choice) {
      winner = 0;
    } else if (GESTURES[p1Choice].beats === p2Choice) {
      winner = 1;
    } else {
      winner = 2;
    }

    if (winner === 1) {
      p1Score++;
      streak++;
      streakBadge.textContent = '🔥 连胜: ' + streak;
      playerHand.classList.add('hand-winner');
      oppHand.classList.add('hand-loser');
      resultBanner.textContent = '🎉 你赢了这一局！';
      if (playerAvatarMood) { playerAvatarMood.textContent = '🥳'; playerAvatarMood.classList.add('celebrate'); }
      if (playerBubble) playerBubble.textContent = '哈哈赢啦！👑';
      if (oppAvatarMood) { oppAvatarMood.textContent = '😭'; oppAvatarMood.classList.remove('celebrate'); }
      if (oppBubble) oppBubble.textContent = '可恶被算计了…';
      playWin();
    } else if (winner === 2) {
      p2Score++;
      streak = 0;
      streakBadge.textContent = '🔥 连胜: 0';
      oppHand.classList.add('hand-winner');
      playerHand.classList.add('hand-loser');
      resultBanner.textContent = '💔 对方拿下此局！';
      if (oppAvatarMood) { oppAvatarMood.textContent = '😎'; oppAvatarMood.classList.add('celebrate'); }
      if (oppBubble) oppBubble.textContent = '轻轻松松！👑';
      if (playerAvatarMood) { playerAvatarMood.textContent = '😢'; playerAvatarMood.classList.remove('celebrate'); }
      if (playerBubble) playerBubble.textContent = '呜呜惜败…';
    } else {
      resultBanner.textContent = '🤝 平局！默契十足！';
      if (playerAvatarMood) { playerAvatarMood.textContent = '😲'; playerAvatarMood.classList.remove('celebrate'); }
      if (oppAvatarMood) { oppAvatarMood.textContent = '😲'; oppAvatarMood.classList.remove('celebrate'); }
      if (playerBubble) playerBubble.textContent = '心有灵犀！⚡';
      if (oppBubble) oppBubble.textContent = '再来一次！🔥';
    }

    renderDots();

    // Check Match End
    if (p1Score >= boTarget) {
      setTimeout(function () {
        showMatchOver(true);
      }, 1200);
    } else if (p2Score >= boTarget) {
      setTimeout(function () {
        showMatchOver(false);
      }, 1200);
    } else {
      setTimeout(resetRound, 1800);
    }
  }

  function showMatchOver(isUserWinner) {
    if (isUserWinner) {
      matchOverTitle.textContent = '🏆 决斗巅峰胜出！';
      matchOverDesc.textContent = '恭喜拿下本场对决！快把惩罚发给输家吧：';
      playWin();
    } else {
      matchOverTitle.textContent = '💔 决斗惜败！';
      matchOverDesc.textContent = '胜败乃兵家常事，快接受今天的摸鱼惩罚吧：';
    }
    rollPenalty();
    penaltyModal.classList.remove('hidden');
  }

  function rollPenalty() {
    var p = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
    finalPenaltyText.textContent = p;
  }

  // Button Listeners
  btnRock.addEventListener('click', function () { chooseGesture('rock'); });
  btnScissors.addEventListener('click', function () { chooseGesture('scissors'); });
  btnPaper.addEventListener('click', function () { chooseGesture('paper'); });

  if (reRollPenaltyBtn) {
    reRollPenaltyBtn.addEventListener('click', function () {
      rollPenalty();
      if (mode === 'online' && net) {
        net.send('rerollPenalty', { text: finalPenaltyText.textContent });
      }
    });
  }

  if (rematchBtn) {
    rematchBtn.addEventListener('click', function () {
      penaltyModal.classList.add('hidden');
      if (mode === 'online' && net) {
        net.send('rematch', {});
      }
      resetMatch();
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

  // BO Settings
  if (boPills) {
    boPills.addEventListener('click', function (e) {
      var pill = e.target.closest('.pill');
      if (pill && pill.dataset.bo) {
        var pills = boPills.querySelectorAll('.pill');
        pills.forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        boTarget = pill.dataset.bo === '1' ? 1 : (pill.dataset.bo === '5' ? 3 : 2);
        resetMatch();
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

  // Opponent Type Toggle
  if (opponentTypeBtn) {
    opponentTypeBtn.addEventListener('click', function () {
      if (mode === 'ai') {
        mode = 'local';
        opponentTypeBtn.textContent = '👥 同屏盲猜';
        p2NameEl.textContent = '玩家2';
      } else {
        mode = 'ai';
        opponentTypeBtn.textContent = '🤖 人机: 心理学大师';
        p2NameEl.textContent = '心理学大师';
      }
      resetMatch();
    });
  }

  // Online Multiplayer
  if (onlineBtn) {
    onlineBtn.addEventListener('click', function () {
      if (window.OmniNetUI && window.OmniNetUI.openLobby) {
        window.OmniNetUI.openLobby('rps-duel', '猜拳巅峰赛', function (session) {
          if (!session) return;
          mode = session.mode;
          net = session.net;
          isHost = session.isHost;

          if (mode === 'online') {
            opponentTypeBtn.textContent = '🌐 联机对战中';
            p1NameEl.textContent = '你 (' + (isHost ? '房主' : '加入者') + ')';
            p2NameEl.textContent = (session.opponent && session.opponent.nickname) || '联机好友';

            net.on('msg:picked', function (data) {
              p2Choice = data.choice;
              oppHandLabel.textContent = '对方已出拳！';
              if (p1Choice) {
                startCountdownAndClash();
              }
            });

            net.on('msg:rematch', function () {
              penaltyModal.classList.add('hidden');
              resetMatch();
            });

            net.on('msg:rerollPenalty', function (d) {
              if (d.text) finalPenaltyText.textContent = d.text;
            });

            net.on('disconnected', function () {
              resultBanner.textContent = '⚠️ 对方已离开房间';
              mode = 'ai';
              opponentTypeBtn.textContent = '🤖 人机: 心理学大师';
            });
          }
          resetMatch();
        });
      }
    });
  }

  // Keyboard Shortcuts (1: Rock, 2: Scissors, 3: Paper)
  window.addEventListener('keydown', function (e) {
    if (e.key === '1') chooseGesture('rock');
    else if (e.key === '2') chooseGesture('scissors');
    else if (e.key === '3') chooseGesture('paper');
    else if (e.key === 'Escape') {
      if (rulesModal) rulesModal.classList.add('hidden');
    }
  });

  resetMatch();
})();
