(function () {
  'use strict';

  var streakEl = document.getElementById('streak-el');
  var bestEl = document.getElementById('best-el');
  var timerFill = document.getElementById('timer-fill');
  var chatHistory = document.getElementById('chat-history');
  var targetCharEl = document.getElementById('target-char');
  var optionsGrid = document.getElementById('options-grid');

  var audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playSound(type) {
    try {
      var actx = getAudioCtx();
      var now = actx.currentTime;
      var osc = actx.createOscillator();
      var gain = actx.createGain();
      osc.connect(gain);
      gain.connect(actx.destination);

      if (type === 'ok') {
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'err') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {}
  }

  var IDIOM_DB = [
    { word: '一心一意', mean: '只有一个心眼，没有别的念头。' },
    { word: '意气风发', mean: '形容精神振奋，气概豪迈。' },
    { word: '发奋图强', mean: '振作精神，努力自强。' },
    { word: '强词夺理', mean: '本来没有理，硬说有理。' },
    { word: '理直气壮', mean: '理由充分，说话气势充沛。' },
    { word: '壮志凌云', mean: '宏伟的志向直上云霄。' },
    { word: '云淡风轻', mean: '微风轻拂，浮云淡薄。' },
    { word: '轻车熟路', mean: '比喻对事情熟悉，做起来轻松。' },
    { word: '路不拾遗', mean: '路上掉的东西没人拾去据为己有。' },
    { word: '遗臭万年', mean: '死后恶名一直流传下去。' },
    { word: '年富力强', mean: '年岁正富，精力旺盛。' },
    { word: '强将手下无弱兵', mean: '比喻出色的领导手下也是能人。' },
    { word: '兵贵神速', mean: '用兵贵在行动极其迅速。' },
    { word: '速战速决', mean: '用快速的战术解决战斗。' },
    { word: '决一死战', mean: '进行最后的拼死决战。' },
    { word: '战无不胜', mean: '每次打仗都能取得胜利。' },
    { word: '胜友如云', mean: '良友聚集，多得如云。' },
    { word: '云开雾散', mean: '天气转晴，比喻疑虑消除。' },
    { word: '散兵游勇', mean: '失去统属的零散兵士。' },
    { word: '勇往直前', mean: '勇敢地一直向前进。' },
    { word: '前程似锦', mean: '未来的前途如同锦绣般美好。' },
    { word: '锦上添花', mean: '在美丽的锦缎上再绣上花朵。' },
    { word: '花好月圆', mean: '花儿正盛，月儿正圆，比喻美满。' },
    { word: '圆颅方趾', mean: '头圆脚方，泛指人类。' },
    { word: '指鹿为马', mean: '颠倒黑白，混淆是非。' },
    { word: '马到成功', mean: '战马一到即取得成功。' },
    { word: '功成名就', mean: '功业建立了，名声也传开了。' },
    { word: '就事论事', mean: '按照事情本身的原委来评论。' },
    { word: '事半功倍', mean: '用一半力气收到加倍效果。' },
    { word: '倍道而行', mean: '加倍速度日夜兼程赶路。' },
    { word: '行云流水', mean: '比喻诗文自然流畅无拘无束。' },
    { word: '水落石出', mean: '水退下去石头露出来，比喻真相大白。' },
    { word: '出神入化', mean: '技艺达到了绝妙高超的化境。' },
    { word: '化险为夷', mean: '转危险为平安。' },
    { word: '夷为平地', mean: '原有的建筑等被彻底铲平。' },
    { word: '地久天长', mean: '像天地那样长久永久。' },
    { word: '长驱直入', mean: '长距离挺进，毫无阻挡。' },
    { word: '入木三分', mean: '形容书法笔力雄健，也比喻见解深刻。' },
    { word: '分秒必争', mean: '一分一秒也一定要争取。' },
    { word: '争先恐后', mean: '唯恐落后，争着向前。' },
    { word: '后生可畏', mean: '青年人更容易超过前辈令人敬畏。' },
    { word: '畏首畏尾', mean: '疑虑过多，胆小怕事。' },
    { word: '尾大不掉', mean: '尾巴太大摆动不灵，比喻下强上弱。' },
    { word: '掉以轻心', mean: '对事情漫不经心不加重视。' },
    { word: '心旷神怡', mean: '心情舒畅，精神愉快。' },
    { word: '怡然自得', mean: '形容高兴而满足的样子。' },
    { word: '得心应手', mean: '心里怎么想手就能怎么做，极其纯熟。' },
    { word: '手疾眼快', mean: '动作敏捷，目光锐利。' },
    { word: '快马加鞭', mean: '跑得很快的马再加上一鞭，比喻快上加快。' }
  ];

  var streak = 0;
  var bestStreak = 0;
  var currentIdiom = null;
  var timer = null;
  var timeLeft = 10;
  var TOTAL_TIME = 10;

  function addBubble(sender, word, mean) {
    var bubble = document.createElement('div');
    bubble.className = 'idiom-bubble ' + (sender === 'user' ? 'bubble-user' : 'bubble-bot');
    bubble.innerHTML = '<strong>' + word + '</strong><div class="bubble-meaning">' + mean + '</div>';
    chatHistory.appendChild(bubble);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  function startTurn() {
    var lastChar = currentIdiom.word.slice(-1);
    targetCharEl.textContent = lastChar;

    // Find correct candidates
    var validMatches = IDIOM_DB.filter(function (item) {
      return item.word.charAt(0) === lastChar;
    });

    if (validMatches.length === 0) {
      // Pick random next word starting with any char
      var rand = IDIOM_DB[Math.floor(Math.random() * IDIOM_DB.length)];
      validMatches = [rand];
      targetCharEl.textContent = rand.word.charAt(0);
    }

    var correctOne = validMatches[Math.floor(Math.random() * validMatches.length)];

    // Pick 3 decoys
    var decoys = [];
    while (decoys.length < 3) {
      var d = IDIOM_DB[Math.floor(Math.random() * IDIOM_DB.length)];
      if (d.word !== correctOne.word && decoys.indexOf(d) === -1) {
        decoys.push(d);
      }
    }

    var choices = [correctOne].concat(decoys);
    choices.sort(function () { return Math.random() - 0.5; });

    optionsGrid.innerHTML = '';
    choices.forEach(function (c) {
      var btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.textContent = c.word;
      btn.addEventListener('click', function () {
        handleChoice(c, correctOne);
      });
      optionsGrid.appendChild(btn);
    });

    resetTimer();
  }

  function resetTimer() {
    clearInterval(timer);
    timeLeft = TOTAL_TIME;
    timerFill.style.width = '100%';
    timerFill.style.background = '#22c55e';

    timer = setInterval(function () {
      timeLeft -= 0.1;
      var pct = Math.max(0, (timeLeft / TOTAL_TIME) * 100);
      timerFill.style.width = pct + '%';
      if (pct < 30) timerFill.style.background = '#ef4444';
      else if (pct < 60) timerFill.style.background = '#f59e0b';

      if (timeLeft <= 0) {
        clearInterval(timer);
        playSound('err');
        alert('⏱️ 时间到！成语接龙断链，从头开始！');
        restartGame();
      }
    }, 100);
  }

  function handleChoice(chosen, correct) {
    getAudioCtx();
    if (chosen.word === correct.word) {
      // Correct!
      playSound('ok');
      streak++;
      if (streak > bestStreak) bestStreak = streak;
      streakEl.textContent = streak;
      bestEl.textContent = bestStreak;

      addBubble('user', chosen.word, chosen.mean);
      currentIdiom = chosen;

      // Bot turn
      clearInterval(timer);
      setTimeout(function () {
        var botLastChar = currentIdiom.word.slice(-1);
        var botMatches = IDIOM_DB.filter(function (it) {
          return it.word.charAt(0) === botLastChar;
        });
        if (botMatches.length > 0) {
          var botPick = botMatches[Math.floor(Math.random() * botMatches.length)];
          addBubble('bot', botPick.word, botPick.mean);
          currentIdiom = botPick;
        } else {
          var fallback = IDIOM_DB[Math.floor(Math.random() * IDIOM_DB.length)];
          addBubble('bot', fallback.word, fallback.mean);
          currentIdiom = fallback;
        }
        startTurn();
      }, 600);
    } else {
      playSound('err');
      alert('首字不匹配！接龙断开，重置连击。');
      restartGame();
    }
  }

  function restartGame() {
    streak = 0;
    streakEl.textContent = 0;
    chatHistory.innerHTML = '';
    currentIdiom = IDIOM_DB[0];
    addBubble('bot', currentIdiom.word, currentIdiom.mean);
    startTurn();
  }

  restartGame();
})();
