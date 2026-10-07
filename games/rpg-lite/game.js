(function () {
  'use strict';

  var turnEl = document.getElementById('turn-el');
  var bossHpFill = document.getElementById('boss-hp-fill');
  var bossHpText = document.getElementById('boss-hp-text');
  var heroHpFill = document.getElementById('hero-hp-fill');
  var heroHpText = document.getElementById('hero-hp-text');
  var heroMpFill = document.getElementById('hero-mp-fill');
  var heroMpText = document.getElementById('hero-mp-text');
  var battleLog = document.getElementById('battle-log');

  var btnAttack = document.getElementById('btn-attack');
  var btnFireball = document.getElementById('btn-fireball');
  var btnHeal = document.getElementById('btn-heal');
  var btnDefend = document.getElementById('btn-defend');

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

      if (type === 'slash') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'fire') {
        var buffer = actx.createBuffer(1, actx.sampleRate * 0.25, actx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.2;
        var src = actx.createBufferSource();
        src.buffer = buffer;
        var f = actx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(350, now);
        var g = actx.createGain();
        g.gain.setValueAtTime(0.2, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        src.connect(f);
        f.connect(g);
        g.connect(actx.destination);
        src.start(now);
      } else if (type === 'heal') {
        [523, 659, 784].forEach(function (freq, idx) {
          var o = actx.createOscillator();
          var gn = actx.createGain();
          o.frequency.setValueAtTime(freq, now + idx * 0.08);
          gn.gain.setValueAtTime(0.12, now + idx * 0.08);
          gn.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.2);
          o.connect(gn);
          gn.connect(actx.destination);
          o.start(now + idx * 0.08);
          o.stop(now + idx * 0.08 + 0.2);
        });
      } else if (type === 'win') {
        [523, 659, 784, 1046, 1318].forEach(function (f, i) {
          var ot = actx.createOscillator();
          var gt = actx.createGain();
          ot.frequency.setValueAtTime(f, now + i * 0.1);
          gt.gain.setValueAtTime(0.18, now + i * 0.1);
          gt.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);
          ot.connect(gt);
          gt.connect(actx.destination);
          ot.start(now + i * 0.1);
          ot.stop(now + i * 0.1 + 0.35);
        });
      }
    } catch (e) {}
  }

  var hero = { hp: 100, maxHp: 100, mp: 60, maxMp: 60, isDefending: false };
  var boss = { hp: 200, maxHp: 200, charged: false };
  var turn = 1;
  var busy = false;

  function updateBars() {
    turnEl.textContent = turn;
    bossHpText.textContent = Math.max(0, boss.hp) + ' / ' + boss.maxHp + ' HP';
    bossHpFill.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';

    heroHpText.textContent = Math.max(0, hero.hp) + ' / ' + hero.maxHp + ' HP';
    heroHpFill.style.width = Math.max(0, (hero.hp / hero.maxHp) * 100) + '%';

    heroMpText.textContent = Math.max(0, hero.mp) + ' / ' + hero.maxMp + ' MP';
    heroMpFill.style.width = Math.max(0, (hero.mp / hero.maxMp) * 100) + '%';

    btnFireball.disabled = hero.mp < 15 || busy;
    btnHeal.disabled = hero.mp < 20 || busy;
    btnAttack.disabled = busy;
    btnDefend.disabled = busy;
  }

  function endTurn() {
    if (boss.hp <= 0) {
      playSound('win');
      battleLog.innerHTML = '🎉 <strong>击溃暗夜魔龙！勇者战胜了深渊守护者，拯救了王国！</strong>';
      setTimeout(function () {
        alert('🏆 凯旋！魔龙已除，你成为了名垂青史的大陆传奇勇士！');
        resetBattle();
      }, 500);
      return;
    }

    // Boss turn
    busy = true;
    updateBars();
    battleLog.textContent = '魔龙正在凝聚力量蓄势反击...';

    setTimeout(function () {
      var dmg = 0;
      var moveDesc = '';

      if (boss.charged) {
        // High damage dragon breath
        dmg = Math.floor(25 + Math.random() * 10);
        moveDesc = '暗夜魔龙喷吐出毁灭龙息！';
        boss.charged = false;
        playSound('fire');
      } else if (Math.random() < 0.3) {
        // Charge up
        boss.charged = true;
        battleLog.textContent = '暗夜魔龙仰天咆哮！狂暴怒气飙升，下回合伤害倍增！';
        busy = false;
        turn++;
        updateBars();
        return;
      } else {
        // Normal claw
        dmg = Math.floor(14 + Math.random() * 8);
        moveDesc = '暗夜魔龙挥舞尖锐利爪发动猛击！';
        playSound('slash');
      }

      if (hero.isDefending) {
        dmg = Math.floor(dmg * 0.4);
        moveDesc += '（举盾防御化解了大半伤害）';
      }

      hero.hp = Math.max(0, hero.hp - dmg);
      hero.isDefending = false;
      battleLog.textContent = moveDesc + ' 你受到了 ' + dmg + ' 点伤害！';

      if (hero.hp <= 0) {
        alert('💀 勇者力竭倒下！正在重新挑战魔龙...');
        resetBattle();
        return;
      }

      turn++;
      busy = false;
      updateBars();
    }, 1200);
  }

  function resetBattle() {
    hero.hp = 100;
    hero.mp = 60;
    boss.hp = 200;
    boss.charged = false;
    turn = 1;
    busy = false;
    battleLog.textContent = '遭遇强敌！请选择你的战术指令发起进攻！';
    updateBars();
  }

  btnAttack.addEventListener('click', function () {
    if (busy) return;
    getAudioCtx();
    playSound('slash');
    var dmg = Math.floor(18 + Math.random() * 8);
    boss.hp = Math.max(0, boss.hp - dmg);
    battleLog.textContent = '勇者挥舞圣剑，对魔龙造成 ' + dmg + ' 点斩击伤害！';
    updateBars();
    setTimeout(endTurn, 600);
  });

  btnFireball.addEventListener('click', function () {
    if (busy || hero.mp < 15) return;
    getAudioCtx();
    playSound('fire');
    hero.mp -= 15;
    var dmg = Math.floor(36 + Math.random() * 10);
    boss.hp = Math.max(0, boss.hp - dmg);
    battleLog.textContent = '炙热烈焰轰然而至！魔龙受到 ' + dmg + ' 点灼烧巨额伤害！';
    updateBars();
    setTimeout(endTurn, 600);
  });

  btnHeal.addEventListener('click', function () {
    if (busy || hero.mp < 20) return;
    getAudioCtx();
    playSound('heal');
    hero.mp -= 20;
    hero.hp = Math.min(hero.maxHp, hero.hp + 42);
    battleLog.textContent = '圣光温暖笼罩！你恢复了 42 点生命值！';
    updateBars();
    setTimeout(endTurn, 600);
  });

  btnDefend.addEventListener('click', function () {
    if (busy) return;
    getAudioCtx();
    playSound('slash');
    hero.isDefending = true;
    hero.mp = Math.min(hero.maxMp, hero.mp + 15);
    battleLog.textContent = '举起坚毅盾牌防备敌袭，精神专注回复 15 MP！';
    updateBars();
    setTimeout(endTurn, 600);
  });

  updateBars();
})();
