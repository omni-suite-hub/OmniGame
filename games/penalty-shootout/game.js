/* 足球点球大战 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '为赢家捶背捏肩 30 秒 💆',
    '自罚原地做 5 个深蹲 🏃',
    '大喊一声“金球奖非我莫属！” 📢'
  ];

  var audioCtx = null;
  var soundEnabled = true;
  function getAudioCtx() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function playTone(freq, type, dur, gainVal) {
    if (!soundEnabled) return;
    try {
      var ctx = getAudioCtx();
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(gainVal || 0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch(e) {}
  }

  function playKick() { playTone(180, 'sine', 0.08, 0.3); }
  function playGoal() {
    [440, 554, 659, 880].forEach(function(f, idx) {
      setTimeout(function() { playTone(f, 'triangle', 0.15, 0.25); }, idx * 60);
    });
  }
  function playSave() { playTone(120, 'sawtooth', 0.15, 0.3); }

  var SPOTS = ['TL', 'TC', 'TR', 'BL', 'BC', 'BR'];
  var SPOT_OFFSETS = {
    'TL': { x: -80, y: -60 }, 'TC': { x: 0, y: -60 }, 'TR': { x: 80, y: -60 },
    'BL': { x: -80, y: 0 },   'BC': { x: 0, y: 0 },   'BR': { x: 80, y: 0 }
  };

  var p1Score = 0;
  var p2Score = 0;
  var roundNum = 1;
  var turn = 'shoot'; // 'shoot' | 'save'
  var isResolving = false;
  var gameOver = false;
  var mode = 'ai';
  var net = null;

  var spots = document.querySelectorAll('.goal-spot');
  var ball = document.getElementById('soccerBall');
  var keeper = document.getElementById('goalkeeper');

  var statusBanner = document.getElementById('statusBanner');
  var oppAvatarMood = document.getElementById('oppAvatarMood');
  var myAvatarMood = document.getElementById('myAvatarMood');
  var oppBubble = document.getElementById('oppBubble');
  var myBubble = document.getElementById('myBubble');
  var p1ScoreEl = document.getElementById('p1Score');
  var p2ScoreEl = document.getElementById('p2Score');
  var roundText = document.getElementById('roundText');
  var p1Name = document.getElementById('p1Name');
  var p2Name = document.getElementById('p2Name');
  var opponentTypeBtn = document.getElementById('opponentTypeBtn');
  var backBtn = document.getElementById('backBtn');
  var soundBtn = document.getElementById('soundBtn');
  var rulesBtn = document.getElementById('rulesBtn');
  var onlineBtn = document.getElementById('onlineBtn');
  var penaltyModal = document.getElementById('penaltyModal');
  var penaltyTitle = document.getElementById('penaltyTitle');
  var penaltyResultText = document.getElementById('penaltyResultText');
  var reRollPenaltyBtn = document.getElementById('reRollPenaltyBtn');
  var nextRoundBtn = document.getElementById('nextRoundBtn');

  function initRound() {
    isResolving = false;
    ball.className = 'soccer-ball';
    ball.style.transform = 'none';
    keeper.style.transform = 'translateX(-50%)';

    if (turn === 'shoot') {
      statusBanner.textContent = '🟢 轮到你主罚点球！点击球门角落射门！';
      myBubble.textContent = '这一脚直挂死角！';
      oppBubble.textContent = '看我扑出你的球！';
    } else {
      statusBanner.textContent = '🧤 轮到你守门！预判对手射门角落！';
      oppBubble.textContent = '防得住吗你？';
      myBubble.textContent = '门神附体，休想进球！';
    }
  }

  function handleSpotClick(spotKey) {
    if (isResolving || gameOver) return;
    isResolving = true;
    playKick();

    var oppSpot = SPOTS[Math.floor(Math.random() * SPOTS.length)];

    if (turn === 'shoot') {
      var shootSpot = spotKey;
      var keeperSpot = oppSpot;

      var offset = SPOT_OFFSETS[shootSpot];
      ball.style.transform = 'translate(' + offset.x + 'px, -110px) scale(0.65)';
      var kOffset = SPOT_OFFSETS[keeperSpot];
      keeper.style.transform = 'translate(' + (kOffset.x - 50) + 'px, ' + (kOffset.y) + 'px)';

      setTimeout(function() {
        if (shootSpot === keeperSpot) {
          playSave();
          statusBanner.textContent = '🚫 被门将神奇扑出！点球未进！';
          oppAvatarMood.textContent = '😎';
          myAvatarMood.textContent = '😫';
          oppBubble.textContent = '轻松没收！';
        } else {
          playGoal();
          p1Score++;
          p1ScoreEl.textContent = p1Score;
          statusBanner.textContent = '⚡ 球进啦！绝妙死角世界波！';
          myAvatarMood.textContent = '🤩';
          oppAvatarMood.textContent = '🤦‍♂️';
          myBubble.textContent = '毫无悬念的绝杀！';
        }

        turn = 'save';
        checkNextState();
      }, 500);

    } else {
      var keeperSpot = spotKey;
      var shootSpot = oppSpot;

      var offset = SPOT_OFFSETS[shootSpot];
      ball.style.transform = 'translate(' + offset.x + 'px, -110px) scale(0.65)';
      var kOffset = SPOT_OFFSETS[keeperSpot];
      keeper.style.transform = 'translate(' + (kOffset.x - 50) + 'px, ' + (kOffset.y) + 'px)';

      setTimeout(function() {
        if (shootSpot === keeperSpot) {
          playSave();
          statusBanner.textContent = '🧤 神扑！你成功将球拒之门外！';
          myAvatarMood.textContent = '😎';
          oppAvatarMood.textContent = '😫';
          myBubble.textContent = '想进球？门都没有！';
        } else {
          playGoal();
          p2Score++;
          p2ScoreEl.textContent = p2Score;
          statusBanner.textContent = '💥 对手破门得分！';
          oppAvatarMood.textContent = '🤩';
          myAvatarMood.textContent = '🤦‍♂️';
          oppBubble.textContent = '完美的角度！';
        }

        turn = 'shoot';
        roundNum++;
        roundText.textContent = '第 ' + roundNum + ' 轮';
        checkNextState();
      }, 500);
    }
  }

  function checkNextState() {
    if (roundNum > 5) {
      gameOver = true;
      var p1Won = p1Score > p2Score;
      setTimeout(function() {
        penaltyTitle.textContent = p1Won ? '点球大战凯旋！' : '点球大战惜败！';
        penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
        penaltyModal.classList.remove('hidden');
      }, 800);
    } else {
      setTimeout(initRound, 1200);
    }
  }

  spots.forEach(function(sp) {
    sp.addEventListener('click', function() {
      handleSpotClick(sp.getAttribute('data-spot'));
    });
  });

  opponentTypeBtn.addEventListener('click', function() {
    mode = mode === 'ai' ? 'local' : 'ai';
    opponentTypeBtn.textContent = mode === 'ai' ? '🤖 智能人机' : '👥 同屏双人';
  });

  if (backBtn) {

    backBtn.addEventListener('click', function() {
      try { parent.postMessage({ type: 'omnigame:home' }, '*'); } catch (e) {}
      if (window.parent === window) {
        if (history.length > 1) history.back();
        else window.location.href = '../../index.html';
      }
    });

  }

  soundBtn.addEventListener('click', function() {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  });

  rulesBtn.addEventListener('click', function() { document.getElementById('rulesModal').classList.remove('hidden'); });
  document.getElementById('closeRulesBtn').addEventListener('click', function() { document.getElementById('rulesModal').classList.add('hidden'); });

  reRollPenaltyBtn.addEventListener('click', function() {
    penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
  });

  nextRoundBtn.addEventListener('click', function() {
    penaltyModal.classList.add('hidden');
    p1Score = 0; p2Score = 0;
    p1ScoreEl.textContent = '0'; p2ScoreEl.textContent = '0';
    roundNum = 1;
    roundText.textContent = '第 1 轮';
    turn = 'shoot';
    gameOver = false;
    initRound();
  });

  onlineBtn.addEventListener('click', function() {
    if (window.OmniNetUI && window.OmniNetUI.openLobby) {
      window.OmniNetUI.openLobby('penalty-shootout', '足球点球大战', function(session) {
        if (!session) return;
        mode = session.mode;
        net = session.net;
        if (mode === 'online') {
          opponentTypeBtn.textContent = '🌐 联机对战';
          p1Name.textContent = '你';
          p2Name.textContent = (session.opponent && session.opponent.nickname) || '联机好友';
        }
      });
    }
  });

  initRound();
})();