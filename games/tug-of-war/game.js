/* 疯狂拔河对决 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '自罚原地做 10 个俯卧撑/深蹲 🏃',
    '大喊一声“我手速无敌！” 📢'
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

  var ropePos = 50; // 0 (Left/P1 Win) to 100 (Right/P2 Win)
  var isPlaying = true;
  var gameOver = false;
  var mode = 'ai';
  var net = null;
  var isHost = true;
  var p1Score = 0;
  var p2Score = 0;
  var roundNum = 1;

  var ropeVisual = document.getElementById('ropeVisual');
  var leftFill = document.getElementById('leftFill');
  var rightFill = document.getElementById('rightFill');
  var tuggerLeft = document.getElementById('tuggerLeft');
  var tuggerRight = document.getElementById('tuggerRight');
  var pullBtn = document.getElementById('pullBtn');

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
    ropePos = 50;
    gameOver = false;
    isPlaying = true;
    updateVisual();
    statusBanner.textContent = '预备——狂按拉绳！';
    oppAvatarMood.textContent = '😤';
    myAvatarMood.textContent = '🐱';
    oppBubble.textContent = '看我的麒麟臂！';
    myBubble.textContent = '给我拉过来！';
  }

  function updateVisual() {
    ropeVisual.style.left = ropePos + '%';
    leftFill.style.width = (100 - ropePos) + '%';
    rightFill.style.width = ropePos + '%';
  }

  function pull(isP1) {
    if (gameOver || !isPlaying) return;
    playTone(180, 'triangle', 0.04, 0.2);

    if (isP1) {
      ropePos -= 3.5;
      tuggerLeft.classList.add('pulling');
      setTimeout(function() { tuggerLeft.classList.remove('pulling'); }, 150);
    } else {
      ropePos += 3.5;
      tuggerRight.classList.add('pulling');
      setTimeout(function() { tuggerRight.classList.remove('pulling'); }, 150);
    }

    if (ropePos <= 18) {
      handleMatchEnd(true);
    } else if (ropePos >= 82) {
      handleMatchEnd(false);
    }

    updateVisual();
  }

  function handleMatchEnd(p1Won) {
    gameOver = true;
    isPlaying = false;
    if (p1Won) {
      p1Score++;
      p1ScoreEl.textContent = p1Score;
      statusBanner.textContent = '🎉 拔河胜利！你把对手拽飞了！';
      myAvatarMood.textContent = '🏆';
      myAvatarMood.classList.add('celebrate');
      oppAvatarMood.textContent = '😵';
      myBubble.textContent = '单身二十年手速，谁与争锋！';
      oppBubble.textContent = '手都抽筋了…扛不住！';
    } else {
      p2Score++;
      p2ScoreEl.textContent = p2Score;
      statusBanner.textContent = '💥 对手力量爆发，你被拽过去了！';
      oppAvatarMood.textContent = '🤣';
      oppAvatarMood.classList.add('celebrate');
      myAvatarMood.textContent = '😭';
      oppBubble.textContent = '哈哈，力拔山兮气盖世！';
      myBubble.textContent = '手酸了呜呜呜…';
    }

    setTimeout(function() {
      penaltyTitle.textContent = p1Won ? '拔河大获全胜！' : '拔河惜败！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 900);
  }

  // AI loop
  setInterval(function() {
    if (!isPlaying || gameOver || mode !== 'ai') return;
    // AI pulls randomly with speed
    if (Math.random() < 0.65) {
      pull(false);
    }
  }, 130);

  pullBtn.addEventListener('click', function() {
    pull(true);
    if (mode === 'online' && net) net.send('pull', {});
  });

  window.addEventListener('keydown', function(e) {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      pull(true);
      if (mode === 'online' && net) net.send('pull', {});
    }
  });

  opponentTypeBtn.addEventListener('click', function() {
    mode = mode === 'ai' ? 'local' : 'ai';
    opponentTypeBtn.textContent = mode === 'ai' ? '🤖 智能人机' : '👥 双人手速';
    initRound();
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
    roundNum++;
    roundText.textContent = '第 ' + roundNum + ' 局';
    initRound();
  });

  onlineBtn.addEventListener('click', function() {
    if (window.OmniNetUI && window.OmniNetUI.openLobby) {
      window.OmniNetUI.openLobby('tug-of-war', '疯狂拔河对决', function(session) {
        if (!session) return;
        mode = session.mode;
        net = session.net;
        isHost = session.isHost;
        if (mode === 'online') {
          opponentTypeBtn.textContent = '🌐 联机对战';
          p1Name.textContent = '你 (' + (isHost ? '左队' : '右队') + ')';
          p2Name.textContent = (session.opponent && session.opponent.nickname) || '联机好友';

          net.on('msg:pull', function() {
            pull(false);
          });
          initRound();
        }
      });
    }
  });

  initRound();
})();