/* 啪啪打手反应王 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '为赢家捶背捏肩 30 秒 💆',
    '自罚原地做 5 个深蹲 🏃',
    '大喊一声“手速反应王在此！” 📢'
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

  function playSlap() { playTone(250, 'sawtooth', 0.1, 0.4); }
  function playDodge() { playTone(600, 'sine', 0.08, 0.2); }

  var WIN_SCORE = 5;
  var p1Score = 0;
  var p2Score = 0;
  var isP1Attacking = true;
  var isResolving = false;
  var gameOver = false;
  var mode = 'ai';
  var net = null;
  var roundNum = 1;

  var myHand = document.getElementById('myHand');
  var oppHand = document.getElementById('oppHand');
  var myRoleBadge = document.getElementById('myRoleBadge');
  var oppRoleBadge = document.getElementById('oppRoleBadge');
  var actionBtn = document.getElementById('slapActionBtn');
  var slapImpact = document.getElementById('slapImpact');

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

  function updateRoles() {
    if (isP1Attacking) {
      myRoleBadge.textContent = '攻击方 (拍打)';
      myRoleBadge.style.color = '#ef4444';
      oppRoleBadge.textContent = '防守方 (躲避)';
      oppRoleBadge.style.color = '#38bdf8';
      actionBtn.textContent = '💥 啪！电光火石拍打！';
      statusBanner.textContent = '你是攻击方！虚晃出击打他手背！';
    } else {
      myRoleBadge.textContent = '防守方 (躲避)';
      myRoleBadge.style.color = '#38bdf8';
      oppRoleBadge.textContent = '攻击方 (拍打)';
      oppRoleBadge.style.color = '#ef4444';
      actionBtn.textContent = '⚡ 缩手躲避！';
      statusBanner.textContent = '你是防守方！注意盯防随时躲避！';
    }
  }

  function handleAction(isP1) {
    if (isResolving || gameOver) return;
    isResolving = true;

    if (isP1Attacking) {
      // P1 Slaps
      myHand.classList.add('slapping');
      var dodged = mode === 'ai' ? Math.random() < 0.45 : false;

      if (dodged) {
        oppHand.classList.add('opp-dodging');
        playDodge();
        statusBanner.textContent = '💨 对方光速缩手！攻防互换！';
        oppAvatarMood.textContent = '😏';
        oppBubble.textContent = '慢了慢了，打不着！';
        setTimeout(function() {
          myHand.classList.remove('slapping');
          oppHand.classList.remove('opp-dodging');
          isP1Attacking = false;
          updateRoles();
          isResolving = false;
          if (mode === 'ai') scheduleAiAttack();
        }, 600);
      } else {
        playSlap();
        slapImpact.classList.remove('hidden');
        p1Score++;
        p1ScoreEl.textContent = p1Score;
        statusBanner.textContent = '💥 啪！结结实实拍中手背！+1分！';
        myAvatarMood.textContent = '😎';
        oppAvatarMood.textContent = '😱';
        myBubble.textContent = '好响的手掌印！';
        oppBubble.textContent = '啊痛痛痛！手好红！';
        setTimeout(function() {
          myHand.classList.remove('slapping');
          slapImpact.classList.add('hidden');
          isResolving = false;
          if (p1Score >= WIN_SCORE) handleGameOver(true);
        }, 600);
      }
    } else {
      // P1 Dodges
      myHand.classList.add('dodging');
      playDodge();
      setTimeout(function() {
        myHand.classList.remove('dodging');
        isResolving = false;
      }, 400);
    }
  }

  function scheduleAiAttack() {
    if (isP1Attacking || gameOver || isResolving) return;
    var delay = 800 + Math.random() * 1200;
    setTimeout(function() {
      if (isP1Attacking || gameOver) return;
      isResolving = true;
      oppHand.classList.add('opp-slapping');

      var dodged = myHand.classList.contains('dodging');
      if (dodged) {
        playDodge();
        statusBanner.textContent = '💨 漂亮闪避！攻防互换轮到你拍！';
        myAvatarMood.textContent = '😆';
        myBubble.textContent = '预判了你的出招！';
        setTimeout(function() {
          oppHand.classList.remove('opp-slapping');
          isP1Attacking = true;
          updateRoles();
          isResolving = false;
        }, 500);
      } else {
        playSlap();
        slapImpact.classList.remove('hidden');
        p2Score++;
        p2ScoreEl.textContent = p2Score;
        statusBanner.textContent = '💥 对方狠狠拍中你的手背！';
        oppAvatarMood.textContent = '😈';
        myAvatarMood.textContent = '😭';
        oppBubble.textContent = '结实的一巴掌！';
        setTimeout(function() {
          oppHand.classList.remove('opp-slapping');
          slapImpact.classList.add('hidden');
          isResolving = false;
          if (p2Score >= WIN_SCORE) handleGameOver(false);
          else scheduleAiAttack();
        }, 600);
      }
    }, delay);
  }

  function handleGameOver(p1Won) {
    gameOver = true;
    if (p1Won) {
      statusBanner.textContent = '🎉 反应王诞生！你拍红了对方双手！';
      myAvatarMood.textContent = '🏆';
      myAvatarMood.classList.add('celebrate');
      oppAvatarMood.textContent = '😭';
    } else {
      statusBanner.textContent = '💥 对手反应超神，你遗憾落败！';
      oppAvatarMood.textContent = '👑';
      oppAvatarMood.classList.add('celebrate');
      myAvatarMood.textContent = '😵';
    }

    setTimeout(function() {
      penaltyTitle.textContent = p1Won ? '拍手大获全胜！' : '拍手惜败！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 800);
  }

  actionBtn.addEventListener('click', function() {
    handleAction(true);
    if (mode === 'online' && net) net.send('act', {});
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
    gameOver = false;
    isResolving = false;
    isP1Attacking = true;
    roundNum++;
    roundText.textContent = '第 ' + roundNum + ' 局';
    updateRoles();
  });

  onlineBtn.addEventListener('click', function() {
    if (window.OmniNetUI && window.OmniNetUI.openLobby) {
      window.OmniNetUI.openLobby('slap-hands', '啪啪打手反应王', function(session) {
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

  updateRoles();
})();