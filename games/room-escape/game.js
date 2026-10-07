(function () {
  'use strict';

  var statusEl = document.getElementById('status-el');
  var timerEl = document.getElementById('timer-el');
  var invSlotsEl = document.getElementById('inv-slots');
  var dialogEl = document.getElementById('dialog');
  var dTitleEl = document.getElementById('d-title');
  var dTextEl = document.getElementById('d-text');
  var dInteractiveEl = document.getElementById('d-interactive');
  var dCloseBtn = document.getElementById('d-close');

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
        osc.frequency.setValueAtTime(600, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'unlock') {
        [440, 554, 659].forEach(function (f, i) {
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
      } else if (type === 'win') {
        [523, 659, 783, 1046, 1318].forEach(function (f, i) {
          var o = actx.createOscillator();
          var g = actx.createGain();
          o.frequency.setValueAtTime(f, now + i * 0.1);
          g.gain.setValueAtTime(0.2, now + i * 0.1);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
          o.connect(g);
          g.connect(actx.destination);
          o.start(now + i * 0.1);
          o.stop(now + i * 0.1 + 0.3);
        });
      }
    } catch (e) {}
  }

  // Game state
  var inventory = [];
  var selectedItem = null;
  var safeUnlocked = false;
  var drawerUnlocked = false;
  var clockKeyTaken = false;
  var doorUnlocked = false;

  var startTime = Date.now();
  var timerInterval = setInterval(function () {
    if (doorUnlocked) return;
    var sec = Math.floor((Date.now() - startTime) / 1000);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    timerEl.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }, 1000);

  function renderInventory() {
    invSlotsEl.innerHTML = '';
    for (var i = 0; i < 5; i++) {
      var slot = document.createElement('div');
      slot.className = 'inv-slot';
      var item = inventory[i];
      if (item) {
        slot.textContent = item.icon;
        slot.title = item.name;
        if (selectedItem === item) slot.classList.add('selected');
        slot.addEventListener('click', (function (it) {
          return function () {
            selectedItem = (selectedItem === it ? null : it);
            renderInventory();
          };
        })(item));
      }
      invSlotsEl.appendChild(slot);
    }
  }

  function openDialog(title, text, customHTML) {
    playSound('click');
    dTitleEl.textContent = title;
    dTextEl.textContent = text;
    dInteractiveEl.innerHTML = customHTML || '';
    dialogEl.classList.remove('hidden');
  }

  dCloseBtn.addEventListener('click', function () {
    dialogEl.classList.add('hidden');
  });

  // Hotspot Handlers
  document.getElementById('obj-painting').addEventListener('click', function () {
    openDialog('🖼️ 抽象油画', '油画上绘制着晨曦与黄昏，右下角隐约题着两枚醒目的罗马数字：IV 与 VIII（对应阿拉伯数字 4 和 8）。');
  });

  document.getElementById('obj-clock').addEventListener('click', function () {
    if (!clockKeyTaken) {
      openDialog('🕰️ 复古落地钟', '落地钟摆轻轻摇晃，你在钟摆缝隙里发现了一把不起眼的小铜钥匙！',
        '<button class="btn-close" id="btn-take-key" style="background:#059669;margin-bottom:12px;">拾取铜钥匙 🗝️</button>'
      );
      document.getElementById('btn-take-key').addEventListener('click', function () {
        clockKeyTaken = true;
        inventory.push({ id: 'copper_key', name: '铜钥匙', icon: '🗝️' });
        playSound('unlock');
        renderInventory();
        dialogEl.classList.add('hidden');
      });
    } else {
      openDialog('🕰️ 复古落地钟', '落地钟有规律地滴答作响，里面已经没有其他线索了。');
    }
  });

  document.getElementById('obj-desk').addEventListener('click', function () {
    if (!drawerUnlocked) {
      if (selectedItem && selectedItem.id === 'copper_key') {
        drawerUnlocked = true;
        playSound('unlock');
        openDialog('🪑 书桌抽屉', '你用铜钥匙咔哒一声扭开了抽屉！抽屉里有一张泛黄的日记纸片：\n“保密箱后两位暗号为 19”。');
      } else {
        openDialog('🪑 书桌与抽屉', '书桌的抽屉被一把老式黄铜小锁紧紧锁住，需要对应的钥匙。');
      }
    } else {
      openDialog('🪑 书桌抽屉', '抽屉里的便签纸写着：“保密箱后两位暗号为 19”。（结合油画提示的前两位 48，密码是否为 4819 ？）');
    }
  });

  document.getElementById('obj-safe').addEventListener('click', function () {
    if (safeUnlocked) {
      openDialog('🗄️ 密码暗柜', '暗柜已经被打开，里面的门禁卡已被取走。');
      return;
    }

    var html = '<div class="code-input-group">' +
      '<input type="text" class="code-digit" id="d1" maxlength="1" value="0">' +
      '<input type="text" class="code-digit" id="d2" maxlength="1" value="0">' +
      '<input type="text" class="code-digit" id="d3" maxlength="1" value="0">' +
      '<input type="text" class="code-digit" id="d4" maxlength="1" value="0">' +
      '</div>' +
      '<button class="btn-close" id="btn-check-code" style="background:#059669;margin-bottom:12px;">验证密码</button>';

    openDialog('🗄️ 密码暗柜', '请输入 4 位数字密码解锁保密箱：', html);

    document.getElementById('btn-check-code').addEventListener('click', function () {
      var c1 = document.getElementById('d1').value;
      var c2 = document.getElementById('d2').value;
      var c3 = document.getElementById('d3').value;
      var c4 = document.getElementById('d4').value;
      var code = c1 + c2 + c3 + c4;

      if (code === '4819') {
        safeUnlocked = true;
        playSound('unlock');
        inventory.push({ id: 'keycard', name: '磁卡门禁钥匙', icon: '💳' });
        renderInventory();
        openDialog('🎉 密码正确！', '保险箱自动弹开！你获得了逃生必备的【磁卡门禁钥匙 💳】！');
      } else {
        alert('❌ 密码错误，指示灯红光闪烁！请核对线索。');
      }
    });
  });

  document.getElementById('obj-door').addEventListener('click', function () {
    if (selectedItem && selectedItem.id === 'keycard') {
      doorUnlocked = true;
      playSound('win');
      statusEl.textContent = '🎉 成功逃脱！';
      statusEl.style.color = '#22c55e';
      openDialog('🏆 恭喜成功逃脱！', '电子锁发出清脆绿光，厚重铁门轰然敞开，阳光倾泻而入，你用智慧与细致战胜了密室！');
    } else {
      openDialog('🚪 逃生厚铁门', '门侧有一个发光的磁卡刷卡感应区，需要刷入最高权限的门禁磁卡方可开启。');
    }
  });

  renderInventory();
})();
