(function () {
  'use strict';

  var roundEl = document.getElementById('round-el');
  var scoreEl = document.getElementById('score-el');
  var lmIconEl = document.getElementById('lm-icon');
  var lmTitleEl = document.getElementById('lm-title');
  var lmDescEl = document.getElementById('lm-desc');
  var choicesRowEl = document.getElementById('choices-row');
  var resultBannerEl = document.getElementById('result-banner');
  var btnNext = document.getElementById('btn-next');

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

      if (type === 'correct') {
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.exponentialRampToValueAtTime(784, now + 0.12);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'wrong') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'win') {
        [523, 659, 784, 1046, 1318].forEach(function (f, i) {
          var o = actx.createOscillator();
          var gn = actx.createGain();
          o.frequency.setValueAtTime(f, now + i * 0.1);
          gn.gain.setValueAtTime(0.18, now + i * 0.1);
          gn.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);
          o.connect(gn);
          gn.connect(actx.destination);
          o.start(now + i * 0.1);
          o.stop(now + i * 0.1 + 0.35);
        });
      }
    } catch (e) {}
  }

  var LANDMARKS = [
    {
      title: '战神广场上的镂空铁塔',
      icon: '🗼',
      desc: '为纪念博览会建于塞纳河畔，高 330 米，是浪漫之都举世闻名的标志性建筑。',
      answer: '法国 (France)',
      options: ['法国 (France)', '德国 (Germany)', '英国 (UK)', '意大利 (Italy)']
    },
    {
      title: '纯白大理石构建的永恒之泪',
      icon: '🕌',
      desc: '莫卧儿王朝皇帝为纪念爱妃而建的白色大理石陵墓，融合伊斯兰与印度传统艺术精粹。',
      answer: '印度 (India)',
      options: ['印度 (India)', '土耳其 (Turkey)', '伊朗 (Iran)', '埃及 (Egypt)']
    },
    {
      title: '白雪覆顶的休眠活火山',
      icon: '🗻',
      desc: '海拔 3776 米的完美圆锥形名山，日本精神文化的永恒图腾与艺术灵感源泉。',
      answer: '日本 (Japan)',
      options: ['日本 (Japan)', '韩国 (Korea)', '菲律宾 (Philippines)', '智利 (Chile)']
    },
    {
      title: '千古黄沙中的狮身与巨石',
      icon: '🏜️',
      desc: '尼罗河西岸古代世界七大奇迹之首，巨大石灰石砌成的金字塔群静默守护千年。',
      answer: '埃及 (Egypt)',
      options: ['埃及 (Egypt)', '摩洛哥 (Morocco)', '希腊 (Greece)', '墨西哥 (Mexico)']
    },
    {
      title: '海湾旁的贝壳与白色扬帆',
      icon: '⛵',
      desc: '坐落于天然深水良港，犹如扬帆出海的巨大贝壳群，联合国世界文化遗产之一。',
      answer: '澳大利亚 (Australia)',
      options: ['澳大利亚 (Australia)', '新西兰 (New Zealand)', '挪威 (Norway)', '加拿大 (Canada)']
    }
  ];

  var currentRound = 0;
  var totalScore = 0;
  var answered = false;

  function loadRound(idx) {
    if (idx >= LANDMARKS.length) {
      playSound('win');
      alert('🏆 地理大师！五轮竞猜全部结束，最终得分: ' + totalScore + ' 分！');
      currentRound = 0;
      totalScore = 0;
    }
    currentRound = idx;
    answered = false;
    var lm = LANDMARKS[currentRound];

    roundEl.textContent = (currentRound + 1) + ' / ' + LANDMARKS.length;
    scoreEl.textContent = totalScore;
    lmIconEl.textContent = lm.icon;
    lmTitleEl.textContent = lm.title;
    lmDescEl.textContent = lm.desc;
    resultBannerEl.textContent = '';
    btnNext.style.display = 'none';

    choicesRowEl.innerHTML = '';
    var opts = lm.options.slice().sort(function () { return Math.random() - 0.5; });
    opts.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.className = 'country-btn';
      btn.textContent = opt;

      btn.addEventListener('click', function () {
        handleChoice(opt, lm);
      });
      choicesRowEl.appendChild(btn);
    });
  }

  function handleChoice(chosen, lm) {
    if (answered) return;
    answered = true;
    getAudioCtx();

    if (chosen === lm.answer) {
      playSound('correct');
      totalScore += 5000;
      resultBannerEl.innerHTML = '✅ <span style="color:#22c55e;">正中靶心！正确答案正是【' + lm.answer + '】，获得 +5000 积分！</span>';
    } else {
      playSound('wrong');
      totalScore += 1000;
      resultBannerEl.innerHTML = '❌ <span style="color:#ef4444;">偏离目标！正确位置是【' + lm.answer + '】，仅得保底 +1000 积分。</span>';
    }

    scoreEl.textContent = totalScore;
    btnNext.style.display = 'block';
  }

  btnNext.addEventListener('click', function () {
    loadRound(currentRound + 1);
  });

  loadRound(0);
})();
