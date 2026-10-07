/* 打地鼠竞速死斗 - OmniGame */
(function() {
  'use strict';

  var PENALTIES = [
    '请赢家喝一杯大杯奶茶 🥤',
    '下楼帮赢家拿今日外卖 🥡',
    '前台跑腿领快递 📦',
    '微信群里发 1 元拼手气红包 🧧',
    '为赢家捶背捏肩 30 秒 💆',
    '自罚原地做 5 个深蹲 🏃',
    '大喊一声“地鼠克星就是我！” 📢'
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

  function playWhack() { playTone(400, 'sawtooth', 0.08, 0.3); }
  function playBomb() { playTone(120, 'square', 0.3, 0.4); }
  function playGold() { playTone(880, 'sine', 0.15, 0.25); }

  var TARGET_SCORE = 15;
  var p1Score = 0;
  var p2Score = 0;
  var isPlaying = false;
  var gameOver = false;
  var mode = 'ai';
  var net = null;
  var roundNum = 1;
  var spawnTimer = null;
  var aiTimer = null;

  var holes = document.querySelectorAll('.mole-hole');
  var hammer = document.getElementById('hammerCursor');
  var moleArena = document.querySelector('.mole-arena');
  var startBtn = document.getElementById('startMoleBtn');

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

  var activeMoles = {}; // idx -> { type: 'normal'|'gold'|'bomb', timeout }

  function startGame() {
    p1Score = 0; p2Score = 0;
    p1ScoreEl.textContent = '0'; p2ScoreEl.textContent = '0';
    gameOver = false;
    isPlaying = true;
    startBtn.style.display = 'none';
    statusBanner.textContent = '狂砸地鼠！率先得 15 分者胜！';
    oppAvatarMood.textContent = '😼';
    myAvatarMood.textContent = '🐱';
    myBubble.textContent = '见一个砸一个！';
    oppBubble.textContent = '看谁锤子快！';

    clearInterval(spawnTimer);
    spawnTimer = setInterval(spawnMole, 700);

    if (mode === 'ai') {
      clearInterval(aiTimer);
      aiTimer = setInterval(aiHit, 500);
    }
  }

  function stopGame() {
    isPlaying = false;
    clearInterval(spawnTimer);
    clearInterval(aiTimer);
    startBtn.style.display = 'inline-flex';
    holes.forEach(function(h) {
      var char = h.querySelector('.mole-char');
      char.classList.add('hidden');
    });
    activeMoles = {};
  }

  function spawnMole() {
    if (!isPlaying || gameOver) return;
    var idx = Math.floor(Math.random() * 9);
    if (activeMoles[idx]) return;

    var rand = Math.random();
    var type = 'normal';
    var icon = '🐹';
    if (rand < 0.2) { type = 'bomb'; icon = '💣'; }
    else if (rand < 0.38) { type = 'gold'; icon = '👑'; }

    var hole = holes[idx];
    var char = hole.querySelector('.mole-char');
    char.textContent = icon;
    char.classList.remove('hidden', 'whacked');

    var timeout = setTimeout(function() {
      char.classList.add('hidden');
      delete activeMoles[idx];
    }, 1100);

    activeMoles[idx] = { type: type, timeout: timeout };
  }

  function whack(idx, isP1) {
    var mole = activeMoles[idx];
    if (!mole) return;

    clearTimeout(mole.timeout);
    var hole = holes[idx];
    var char = hole.querySelector('.mole-char');
    char.classList.add('whacked');
    setTimeout(function() { char.classList.add('hidden'); }, 200);

    var delta = 1;
    if (mole.type === 'normal') { playWhack(); delta = 1; }
    else if (mole.type === 'gold') { playGold(); delta = 2; }
    else if (mole.type === 'bomb') { playBomb(); delta = -2; }

    delete activeMoles[idx];

    if (isP1) {
      p1Score = Math.max(0, p1Score + delta);
      p1ScoreEl.textContent = p1Score;
      if (delta < 0) {
        myAvatarMood.textContent = '😵';
        myBubble.textContent = '被炸飞了痛痛痛！';
        oppBubble.textContent = '哈哈！踩雷了吧！';
      } else {
        myAvatarMood.textContent = '😎';
      }
    } else {
      p2Score = Math.max(0, p2Score + delta);
      p2ScoreEl.textContent = p2Score;
    }

    if (p1Score >= TARGET_SCORE || p2Score >= TARGET_SCORE) {
      handleMatchOver(p1Score >= TARGET_SCORE);
    }
  }

  function handleMatchOver(p1Won) {
    gameOver = true;
    stopGame();

    if (p1Won) {
      statusBanner.textContent = '🎉 夺得 15 分！你是地鼠锤王！';
      myAvatarMood.textContent = '🏆';
      myAvatarMood.classList.add('celebrate');
      oppAvatarMood.textContent = '😭';
      myBubble.textContent = '神速锤击，所向披靡！';
    } else {
      statusBanner.textContent = '💥 对手率先达到 15 分，你惜败！';
      oppAvatarMood.textContent = '👑';
      oppAvatarMood.classList.add('celebrate');
      myAvatarMood.textContent = '😵';
      oppBubble.textContent = '手速见长，拿捏了！';
    }

    setTimeout(function() {
      penaltyTitle.textContent = p1Won ? '地鼠王登顶！' : '地鼠大战惜败！';
      penaltyResultText.textContent = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
      penaltyModal.classList.remove('hidden');
    }, 800);
  }

  function aiHit() {
    if (!isPlaying || gameOver) return;
    var keys = Object.keys(activeMoles);
    if (keys.length === 0) return;
    var target = keys[Math.floor(Math.random() * keys.length)];
    // AI avoids bombs 75% of the time
    if (activeMoles[target].type === 'bomb' && Math.random() < 0.75) return;
    whack(parseInt(target), false);
  }

  holes.forEach(function(hole) {
    hole.addEventListener('click', function(e) {
      if (!isPlaying || gameOver) return;
      var idx = parseInt(hole.getAttribute('data-idx'));
      hammer.classList.add('slam');
      setTimeout(function() { hammer.classList.remove('slam'); }, 100);

      whack(idx, true);
      if (mode === 'online' && net) net.send('whack', { idx: idx });
    });
  });

  moleArena.addEventListener('mousemove', function(e) {
    hammer.style.display = 'block';
    var rect = moleArena.getBoundingClientRect();
    hammer.style.left = (e.clientX - rect.left) + 'px';
    hammer.style.top = (e.clientY - rect.top) + 'px';
  });

  moleArena.addEventListener('mouseleave', function() {
    hammer.style.display = 'none';
  });

  startBtn.addEventListener('click', startGame);

  opponentTypeBtn.addEventListener('click', function() {
    mode = mode === 'ai' ? 'local' : 'ai';
    opponentTypeBtn.textContent = mode === 'ai' ? '🤖 智能人机' : '👥 同屏抢砸';
    stopGame();
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
    startGame();
  });

  onlineBtn.addEventListener('click', function() {
    if (window.OmniNetUI && window.OmniNetUI.openLobby) {
      window.OmniNetUI.openLobby('mole-clash', '打地鼠竞速死斗', function(session) {
        if (!session) return;
        mode = session.mode;
        net = session.net;
        if (mode === 'online') {
          opponentTypeBtn.textContent = '🌐 联机对战';
          p1Name.textContent = '你';
          p2Name.textContent = (session.opponent && session.opponent.nickname) || '联机好友';

          net.on('msg:whack', function(data) {
            whack(data.idx, false);
          });
          startGame();
        }
      });
    }
  });

  statusBanner.textContent = '点击“开始狂砸”开启手速对决！';
})();