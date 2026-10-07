(function () {
  'use strict';

  var hpEl = document.getElementById('hp-el');
  var sanEl = document.getElementById('san-el');
  var goldEl = document.getElementById('gold-el');
  var storyLogEl = document.getElementById('story-log');
  var choicesBoxEl = document.getElementById('choices-box');

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

      if (type === 'click') {
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'gold') {
        [523, 659, 784].forEach(function (f, i) {
          var o = actx.createOscillator();
          var g = actx.createGain();
          o.frequency.setValueAtTime(f, now + i * 0.08);
          g.gain.setValueAtTime(0.12, now + i * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.2);
          o.connect(g);
          g.connect(actx.destination);
          o.start(now + i * 0.08);
          o.stop(now + i * 0.08 + 0.2);
        });
      } else if (type === 'hurt') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
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

  var hp = 100;
  var san = 100;
  var gold = 0;

  var NODES = {
    start: {
      text: '你手持火把站在失落王陵的石砌拱门前。冰冷的尘风呼啸而过，正前方隐隐分出三条通路：左侧深渊石桥、右侧象形壁画长廊，以及通往正中央地下主殿的青铜重门。',
      choices: [
        { text: '走向左侧深渊石桥，探寻幽深微光', next: 'chasm', hp: 0, san: 0, gold: 0 },
        { text: '仔细研究右侧刻满古文明象形文字的壁画', next: 'mural', hp: 0, san: 0, gold: 0 },
        { text: '合力推开正前方沉重的青铜巨门', next: 'bronze_door', hp: -10, san: 0, gold: 0 }
      ]
    },
    chasm: {
      text: '石桥年久失修，下方是深不见底的万丈悬崖。你在断桥旁发现了一只前人遗留的破旧皮囊，里面装着数枚闪烁的古金币与一卷防滑登山绳索！',
      choices: [
        { text: '系紧绳索，攀沿崖壁石缝小心潜行至彼岸', next: 'crypt', hp: -10, san: 0, gold: 30 },
        { text: '后退返回主入口，另寻稳妥路径', next: 'start', hp: 0, san: 0, gold: 20 }
      ]
    },
    mural: {
      text: '壁画记载着古老神庙的禁忌：“唯有心怀敬畏者方能直面太阳圆盘”。你的学者知识成功破译了暗语，理智大幅提升，并发现石壁暗槽里藏着一颗蓝宝石！',
      choices: [
        { text: '将蓝宝石镶入墙体机关，开启密室甬道', next: 'crypt', hp: 0, san: 15, gold: 50 },
        { text: '心怀戒备，原路折返大厅', next: 'start', hp: 0, san: 10, gold: 30 }
      ]
    },
    bronze_door: {
      text: '青铜门极重，你耗费体力推开一条缝钻了进去。殿堂内机关触发，数支飞箭擦肩而过！好在你身手矫健，仅受轻伤，迎面是一具泛着金光的神秘法老石棺。',
      choices: [
        { text: '念诵古籍祷词，小心开启石棺', next: 'sarcophagus', hp: 0, san: -15, gold: 0 },
        { text: '避开石棺，从侧方石梯向上突围', next: 'crypt', hp: 0, san: 0, gold: 20 }
      ]
    },
    sarcophagus: {
      text: '石棺被缓缓移开，没有复活的怨灵，只有满棺璀璨夺目的黄金饰物与纯金权杖！你满载而归，顺着顶部倾泻的月光找到了通往地表的逃生竖井。',
      choices: [
        { text: '背起丰饶宝藏，攀登竖井重返人世！', next: 'win', hp: 0, san: 0, gold: 120 }
      ]
    },
    crypt: {
      text: '你穿过幽暗曲折的墓道，眼前豁然开朗——一座宏伟的地下太阳神殿赫然耸立！中央祭坛上的日轮之盘正向你投来神圣的辉光。',
      choices: [
        { text: '走向祭坛，完成探险家的终极见证', next: 'win', hp: 0, san: 20, gold: 60 }
      ]
    },
    win: {
      text: '🎉 <strong>【探险传奇 · 凯旋结局】</strong><br>你成功穿越了千古王陵的重重谜题与致命险境，带着无尽的学识与丰厚财宝走出古迹！你的探险事迹将被载入皇家地理学会史册！',
      choices: [
        { text: '🔄 开启新的探险篇章', next: 'start', reset: true }
      ]
    }
  };

  function updateHUD() {
    hpEl.textContent = hp;
    sanEl.textContent = san;
    goldEl.textContent = gold;
  }

  function goToNode(nodeKey) {
    var node = NODES[nodeKey];
    if (!node) return;

    var p = document.createElement('div');
    p.className = 'log-paragraph';
    p.innerHTML = node.text;
    storyLogEl.appendChild(p);
    storyLogEl.scrollTop = storyLogEl.scrollHeight;

    if (nodeKey === 'win') {
      playSound('win');
    }

    choicesBoxEl.innerHTML = '';
    node.choices.forEach(function (c) {
      var btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = '➤ ' + c.text;

      btn.addEventListener('click', function () {
        getAudioCtx();
        playSound('click');

        if (c.reset) {
          hp = 100;
          san = 100;
          gold = 0;
          storyLogEl.innerHTML = '';
        } else {
          hp += (c.hp || 0);
          san += (c.san || 0);
          gold += (c.gold || 0);
          if (c.gold > 0) playSound('gold');
          if (c.hp < 0) playSound('hurt');
        }

        updateHUD();
        goToNode(c.next);
      });

      choicesBoxEl.appendChild(btn);
    });
  }

  updateHUD();
  goToNode('start');
})();
