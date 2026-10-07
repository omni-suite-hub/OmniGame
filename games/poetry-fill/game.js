(function () {
  'use strict';

  var levelEl = document.getElementById('level-el');
  var scoreEl = document.getElementById('score-el');
  var poemTitleEl = document.getElementById('poem-title');
  var poemAuthorEl = document.getElementById('poem-author');
  var versePrevEl = document.getElementById('verse-prev');
  var verseTargetEl = document.getElementById('verse-target');
  var blankSlotEl = document.getElementById('blank-slot');
  var poemNoteEl = document.getElementById('poem-note');
  var choicesGridEl = document.getElementById('choices-grid');

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
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880.0, now + 0.1); // A5
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'wrong') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'win') {
        [523, 587, 659, 783, 880, 1046].forEach(function (f, i) {
          var o = actx.createOscillator();
          var g = actx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(f, now + i * 0.1);
          g.gain.setValueAtTime(0.2, now + i * 0.1);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.4);
          o.connect(g);
          g.connect(actx.destination);
          o.start(now + i * 0.1);
          o.stop(now + i * 0.1 + 0.4);
        });
      }
    } catch (e) {}
  }

  var POEMS = [
    {
      title: '静夜思',
      author: '〔唐〕李白',
      line1: '床前明月光',
      prefix: '疑是地上',
      answer: '霜',
      suffix: '',
      note: '明月映地如秋霜，羁旅孤舟起乡愁。',
      decoys: ['雪', '露', '冰', '光', '沙', '白', '水']
    },
    {
      title: '春晓',
      author: '〔唐〕孟浩然',
      line1: '春眠不觉晓',
      prefix: '处处闻啼',
      answer: '鸟',
      suffix: '',
      note: '春日清晨，林鸟鸣啭，生机盎然。',
      decoys: ['莺', '风', '花', '声', '鸣', '语', '禽']
    },
    {
      title: '登鹳雀楼',
      author: '〔唐〕王之涣',
      line1: '白日依山尽',
      prefix: '黄河入海',
      answer: '流',
      suffix: '',
      note: '奔流到海不复回，气象雄浑壮阔。',
      decoys: ['波', '涛', '去', '深', '游', '川', '来']
    },
    {
      title: '相思',
      author: '〔唐〕王维',
      line1: '红豆生南国',
      prefix: '春来发几',
      answer: '枝',
      suffix: '',
      note: '借物寄情，采撷红豆以寄深切相思。',
      decoys: ['叶', '朵', '朵', '树', '花', '芽', '丛']
    },
    {
      title: '江雪',
      author: '〔唐〕柳宗元',
      line1: '千山鸟飞绝',
      prefix: '万径人踪',
      answer: '灭',
      suffix: '',
      note: '纯净冷峭的天地，独钓寒江的傲骨。',
      decoys: ['绝', '无', '稀', '尽', '断', '消', '隐']
    },
    {
      title: '望庐山瀑布',
      author: '〔唐〕李白',
      line1: '日照香炉生紫烟',
      prefix: '遥看瀑布挂前',
      answer: '川',
      suffix: '',
      note: '飞流直下三千尺，疑是银河落九天。',
      decoys: ['山', '岩', '峰', '壑', '江', '水', '崖']
    },
    {
      title: '水调歌头',
      author: '〔宋〕苏轼',
      line1: '明月几时有',
      prefix: '把酒问青',
      answer: '天',
      suffix: '',
      note: '豪放旷达中流淌人世温情与哲理沉思。',
      decoys: ['山', '虚', '云', '冥', '风', '空', '霄']
    },
    {
      title: '早发白帝城',
      author: '〔唐〕李白',
      line1: '朝辞白帝彩云间',
      prefix: '千里江陵一日',
      answer: '还',
      suffix: '',
      note: '轻舟已过万重山，快意畅怀之极。',
      decoys: ['归', '行', '至', '达', '返', '回', '驰']
    }
  ];

  var currentIdx = 0;
  var score = 0;

  function loadPoem(idx) {
    if (idx >= POEMS.length) {
      playSound('win');
      alert('🎉 恭喜！您已全部通关《唐宋经典诗词填空》！');
      currentIdx = 0;
      score = 0;
    }
    currentIdx = idx;
    var poem = POEMS[currentIdx];

    levelEl.textContent = (currentIdx + 1) + ' / ' + POEMS.length;
    scoreEl.textContent = score;
    poemTitleEl.textContent = poem.title;
    poemAuthorEl.textContent = poem.author;
    versePrevEl.textContent = poem.line1;

    verseTargetEl.innerHTML = poem.prefix + '<span class="blank-slot" id="blank-slot">？</span>' + poem.suffix;
    blankSlotEl = document.getElementById('blank-slot');
    poemNoteEl.textContent = '点击下方候选字填补诗句缺字。';

    // Build 8 choices
    var choices = [poem.answer];
    var pool = poem.decoys.slice().sort(function () { return Math.random() - 0.5; });
    for (var i = 0; i < 7 && i < pool.length; i++) {
      choices.push(pool[i]);
    }
    choices.sort(function () { return Math.random() - 0.5; });

    choicesGridEl.innerHTML = '';
    choices.forEach(function (char) {
      var btn = document.createElement('button');
      btn.className = 'char-btn';
      btn.textContent = char;
      btn.addEventListener('click', function () {
        handleSelect(char, poem);
      });
      choicesGridEl.appendChild(btn);
    });
  }

  function handleSelect(char, poem) {
    getAudioCtx();
    if (char === poem.answer) {
      playSound('correct');
      blankSlotEl.textContent = char;
      blankSlotEl.style.color = '#22c55e';
      poemNoteEl.textContent = '✅ 正确！' + poem.note;
      score += 100;
      scoreEl.textContent = score;

      setTimeout(function () {
        loadPoem(currentIdx + 1);
      }, 900);
    } else {
      playSound('wrong');
      blankSlotEl.textContent = char;
      blankSlotEl.style.color = '#ef4444';
      poemNoteEl.textContent = '❌ 不对哦，再想想看！';
      setTimeout(function () {
        blankSlotEl.textContent = '？';
        blankSlotEl.style.color = '#facc15';
      }, 600);
    }
  }

  loadPoem(0);
})();
