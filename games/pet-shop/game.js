(function () {
  'use strict';

  var adoptCountEl = document.getElementById('adopt-count');
  var coinsEl = document.getElementById('coins-el');
  var petsPenEl = document.getElementById('pets-pen');

  var actFeed = document.getElementById('act-feed');
  var actWash = document.getElementById('act-wash');
  var actPlay = document.getElementById('act-play');

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

      if (type === 'feed') {
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.setValueAtTime(450, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'wash') {
        var buffer = actx.createBuffer(1, actx.sampleRate * 0.15, actx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.1;
        var src = actx.createBufferSource();
        src.buffer = buffer;
        var f = actx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.setValueAtTime(1000, now);
        var g = actx.createGain();
        g.gain.setValueAtTime(0.12, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        src.connect(f);
        f.connect(g);
        g.connect(actx.destination);
        src.start(now);
      } else if (type === 'play') {
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.exponentialRampToValueAtTime(784, now + 0.12);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === 'adopt') {
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

  var PET_SPECIES = [
    { name: '小金毛', icon: '🐶' },
    { name: '布偶猫', icon: '🐱' },
    { name: '垂耳兔', icon: '🐰' },
    { name: '仓鼠球', icon: '🐹' },
    { name: '柴犬犬', icon: '🐕' }
  ];

  var pets = [
    { name: '布偶猫', icon: '🐱', hunger: 40, clean: 60, happy: 50 },
    { name: '小金毛', icon: '🐶', hunger: 30, clean: 40, happy: 60 },
    { name: '垂耳兔', icon: '🐰', hunger: 50, clean: 70, happy: 40 },
    { name: '仓鼠球', icon: '🐹', hunger: 60, clean: 50, happy: 30 }
  ];

  var selectedIdx = 0;
  var adoptedTotal = 0;
  var coins = 0;

  function renderPets() {
    petsPenEl.innerHTML = '';
    pets.forEach(function (p, idx) {
      var isReady = (p.hunger >= 95 && p.clean >= 95 && p.happy >= 95);

      var card = document.createElement('div');
      card.className = 'pet-card' + (selectedIdx === idx ? ' selected' : '') + (isReady ? ' ready-adopt' : '');

      card.innerHTML = '<div class="pet-avatar">' + p.icon + '</div>' +
        '<div class="pet-name">' + p.name + '</div>' +
        '<div class="stat-bar-group">' +
        '  <div class="bar-row"><span>🍖</span><div class="bar-bg"><div class="bar-fill" style="width:' + p.hunger + '%;background:#f59e0b;"></div></div></div>' +
        '  <div class="bar-row"><span>🛁</span><div class="bar-bg"><div class="bar-fill" style="width:' + p.clean + '%;background:#38bdf8;"></div></div></div>' +
        '  <div class="bar-row"><span>🎾</span><div class="bar-bg"><div class="bar-fill" style="width:' + p.happy + '%;background:#ec4899;"></div></div></div>' +
        '</div>';

      if (isReady) {
        var btnAdopt = document.createElement('button');
        btnAdopt.className = 'adopt-btn';
        btnAdopt.textContent = '💖 送养给新家庭！';
        btnAdopt.addEventListener('click', function (e) {
          e.stopPropagation();
          adoptPet(idx);
        });
        card.appendChild(btnAdopt);
      }

      card.addEventListener('click', function () {
        getAudioCtx();
        selectedIdx = idx;
        renderPets();
      });

      petsPenEl.appendChild(card);
    });
  }

  function adoptPet(idx) {
    playSound('adopt');
    adoptedTotal++;
    coins += 50;
    adoptCountEl.textContent = adoptedTotal + ' 只';
    coinsEl.textContent = '🪙 ' + coins;

    var newSpec = PET_SPECIES[Math.floor(Math.random() * PET_SPECIES.length)];
    pets[idx] = {
      name: newSpec.name,
      icon: newSpec.icon,
      hunger: 30 + Math.floor(Math.random() * 30),
      clean: 30 + Math.floor(Math.random() * 30),
      happy: 30 + Math.floor(Math.random() * 30)
    };

    alert('🎉 恭喜！宠物找到了温暖幸福的新家，获得 🪙 50 领养基金！');
    renderPets();
  }

  actFeed.addEventListener('click', function () {
    getAudioCtx();
    var p = pets[selectedIdx];
    if (p) {
      p.hunger = Math.min(100, p.hunger + 25);
      playSound('feed');
      renderPets();
    }
  });

  actWash.addEventListener('click', function () {
    getAudioCtx();
    var p = pets[selectedIdx];
    if (p) {
      p.clean = Math.min(100, p.clean + 25);
      playSound('wash');
      renderPets();
    }
  });

  actPlay.addEventListener('click', function () {
    getAudioCtx();
    var p = pets[selectedIdx];
    if (p) {
      p.happy = Math.min(100, p.happy + 25);
      playSound('play');
      renderPets();
    }
  });

  // Natural slow decay
  setInterval(function () {
    pets.forEach(function (p) {
      p.hunger = Math.max(10, p.hunger - 2);
      p.clean = Math.max(10, p.clean - 2);
      p.happy = Math.max(10, p.happy - 2);
    });
    renderPets();
  }, 4000);

  renderPets();
})();
