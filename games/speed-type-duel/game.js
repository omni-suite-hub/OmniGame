/* 极速打字对决 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '自罚原地做 5 个深蹲 🏃',
    '大喊一声“键盘冒火！打字王者！” 📢'
  ];

  var WORDS = [
    '需求变更', '准时下班', '喝杯奶茶', '周报搞定', '方案重构',
    '老板来了', '摸鱼万岁', '代码无bug', '年终大奖', '技术分享',
    '下楼拿外卖', '开会摸鱼', '咖啡加浓', '加薪申请', '一键部署'
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

  function playShoot() { playTone(700, 'sawtooth', 0.08, 0.25); }
  function playHit() { playTone(150, 'square', 0.12, 0.3); }

  var myHp = 100, oppHp = 100;
  var targetWord = '';
  var gameOver = false;
  var mode = 'ai';
  var net = null;
  var aiTimer = null;
  var roundNum = 1;

  var currentWordEl = document.getElementById('currentWord');
  var typeInput = document.getElementById('typeInput');
  var myHpEl = document.getElementById('myHp');
  var oppHpEl = document.getElementById('oppHp');
  var myHpFill = document.getElementById('myHpFill');
  var oppHpFill = document.getElementById('oppHpFill');

  var statusBanner = document.getElementById('statusBanner');
  var oppAvatarMood = document.getElementById('oppAvatarMood');
  var myAvatarMood = document.getElementById('myAvatarMood');
  var oppBubble = document.getElementById('oppBubble');
  var myBubble = document.getElementById('myBubble');
  var p1Score = 0, p2Score = 0;
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

  function initGame() {
    myHp = 100; oppHp = 100;
    updateHp();
    gameOver = false;
    typeInput.value = '';
    nextWord();
    statusBanner.textContent = '看准词汇 · 极速输入回车发射！';
    oppAvatarMood.textContent = '😏';
    myAvatarMood.textContent = '🐱';

    clearInterval(aiTimer);
    if (mode === 'ai') {
      aiTimer = setInterval(aiAttack, 2800);
    }
  }

  function nextWord() {
    targetWord = WORDS[Math.floor(Math.random() * WORDS.length)];
    currentWordEl.textContent = targetWord;
  }

  function updateHp() {
    myHpEl.textContent = myHp;
    oppHpEl.textContent = oppHp;
    myHpFill.style.width = myHp + '%';
    oppHpFill.style.width = oppHp + '%';
  }

  function attack(isP1) {
    if (gameOver) return;
    playShoot();

    if (isP1) {
      oppHp = Math.max(0, oppHp - 25);
      updateHp();
      playHit();
      myAvatarMood.textContent = '😎';
      oppAvatarMood.textContent = '😱';
      myBubble.textContent = '手速暴击！吃我一发！';
      oppBubble.textContent = '可恶！手好快！';

      if (oppHp <= 0) handleGameOver(true);
      else nextWord();
    } else {
      myHp = Math.max(0, myHp - 20);
      updateHp();
      playHit();
      oppAvatarMood.textContent = '😈';
      myAvatarMood.textContent = '😵';
      oppBubble.textContent = '看我激光打字！';

      if (myHp <= 0) handleGameOver(false);
    }
  }

  function aiAttack() {
    if (gameOver || mode !== 'ai') return;
    attack(false);
  }

  function handleGameOver(p1Won) {
    gameOver = true;
    clearInterval(aiTimer);

    if (p1Won) {
      p1Score++;
      p1ScoreEl.textContent = p1Score;
      statusBanner.textContent = '🎉 键盘王者！你把对手血条清空了！';
      myAvatarMood.textContent = '🏆';
      myAvatarMood.classList.add('celebrate');
      oppAvatarMood.textContent = '😭';
    } else {
      p2Score++;
      p2ScoreEl.textContent = p2Score;
      statusBanner.textContent = '💥 对手手速爆表，你血条耗尽！';
      oppAvatarMood.textContent = '👑';
      oppAvatarMood.classList.add('celebrate');
      myAvatarMood.textContent = '😵';
    }

    setTimeout(function() {
      penaltyTitle.textContent = p1Won ? '打字登顶！' : '打字惜败！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 800);
  }

  typeInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      var val = typeInput.value.trim();
      if (val === targetWord) {
        attack(true);
        typeInput.value = '';
      } else {
        playTone(150, 'sawtooth', 0.1, 0.2);
      }
    }
  });

  opponentTypeBtn.addEventListener('click', function() {
    mode = mode === 'ai' ? 'local' : 'ai';
    opponentTypeBtn.textContent = mode === 'ai' ? '🤖 智能人机' : '👥 同屏双人';
    initGame();
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
    initGame();
  });

  onlineBtn.addEventListener('click', function() {
    if (window.OmniNetUI && window.OmniNetUI.openLobby) {
      window.OmniNetUI.openLobby('speed-type-duel', '极速打字对决', function(session) {
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

  initGame();
})();