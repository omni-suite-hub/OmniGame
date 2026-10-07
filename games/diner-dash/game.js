(function () {
  'use strict';

  var queueBar = document.getElementById('queue-bar');
  var tablesGrid = document.getElementById('tables-grid');
  var kitchenSlots = document.getElementById('kitchen-slots');
  var cashEl = document.getElementById('cash-el');
  var clockEl = document.getElementById('clock-el');

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

      if (type === 'seat') {
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'bell') {
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'coin') {
        osc.frequency.setValueAtTime(988, now);
        osc.frequency.setValueAtTime(1318, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'win') {
        [523, 659, 784, 1046, 1318].forEach(function (f, i) {
          var o = actx.createOscillator();
          var g = actx.createGain();
          o.frequency.setValueAtTime(f, now + i * 0.1);
          g.gain.setValueAtTime(0.2, now + i * 0.1);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);
          o.connect(g);
          g.connect(actx.destination);
          o.start(now + i * 0.1);
          o.stop(now + i * 0.1 + 0.35);
        });
      }
    } catch (e) {}
  }

  var DISHES = [
    { name: '汉堡', icon: '🍔', price: 12 },
    { name: '披萨', icon: '🍕', price: 15 },
    { name: '咖啡', icon: '☕', price: 8 },
    { name: '蛋糕', icon: '🍰', price: 10 }
  ];

  var CUSTOMERS = ['👩‍🦰', '👨‍🦱', '👵', '🧑‍💼', '🧔'];

  var cash = 0;
  var timeLeft = 90;
  var selectedCustomerIdx = null;
  var selectedKitchenDish = null;

  var queue = [];
  var tables = [
    { id: 1, state: 'empty', customer: null, order: null, timer: null },
    { id: 2, state: 'empty', customer: null, order: null, timer: null },
    { id: 3, state: 'empty', customer: null, order: null, timer: null }
  ];

  var kitchenItems = []; // up to 3 cooking/ready items: { dish, ready, tableId }

  function spawnCustomer() {
    if (queue.length < 4) {
      queue.push({
        avatar: CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)],
        id: Math.random()
      });
      renderQueue();
    }
  }

  function renderQueue() {
    queueBar.innerHTML = '';
    queue.forEach(function (c, idx) {
      var d = document.createElement('div');
      d.className = 'customer-avatar' + (selectedCustomerIdx === idx ? ' selected' : '');
      d.textContent = c.avatar;
      d.addEventListener('click', function () {
        getAudioCtx();
        selectedCustomerIdx = (selectedCustomerIdx === idx ? null : idx);
        renderQueue();
      });
      queueBar.appendChild(d);
    });
  }

  function renderTables() {
    tablesGrid.innerHTML = '';
    tables.forEach(function (t) {
      var card = document.createElement('div');
      card.className = 'table-card';

      if (t.state === 'empty') {
        card.innerHTML = '<span style="font-size:32px;opacity:0.4;">🪑</span>' +
          '<div class="table-state">空闲餐桌 ' + t.id + '</div>';
      } else if (t.state === 'waiting_order') {
        card.innerHTML = '<span style="font-size:30px;">' + t.customer.avatar + '</span>' +
          '<div class="dish-bubble">💭</div>' +
          '<div class="table-state" style="color:#facc15;">思考菜单中...</div>';
      } else if (t.state === 'ready_to_order') {
        card.innerHTML = '<span style="font-size:30px;">' + t.customer.avatar + '</span>' +
          '<div class="dish-bubble">' + t.order.icon + '</div>' +
          '<div class="table-state" style="color:#38bdf8;font-weight:bold;">点单！(点击记录)</div>';
      } else if (t.state === 'waiting_food') {
        card.innerHTML = '<span style="font-size:30px;">' + t.customer.avatar + '</span>' +
          '<div style="font-size:22px;opacity:0.7;">' + t.order.icon + '</div>' +
          '<div class="table-state">等餐中 (需上菜)</div>';
      } else if (t.state === 'eating') {
        card.innerHTML = '<span style="font-size:30px;">' + t.customer.avatar + '</span>' +
          '<div style="font-size:22px;">😋</div>' +
          '<div class="table-state" style="color:#22c55e;">享用美味中...</div>';
      } else if (t.state === 'waiting_bill') {
        card.innerHTML = '<span style="font-size:32px;">💰</span>' +
          '<div class="table-state" style="color:#facc15;font-weight:bold;">结账 (点击收银清理)</div>';
      }

      card.addEventListener('click', function () {
        handleTableClick(t);
      });

      tablesGrid.appendChild(card);
    });
  }

  function handleTableClick(t) {
    getAudioCtx();

    if (t.state === 'empty' && selectedCustomerIdx !== null) {
      // Seat customer
      var cust = queue.splice(selectedCustomerIdx, 1)[0];
      selectedCustomerIdx = null;
      t.customer = cust;
      t.state = 'waiting_order';
      playSound('seat');
      renderQueue();
      renderTables();

      setTimeout(function () {
        if (t.state === 'waiting_order') {
          t.order = DISHES[Math.floor(Math.random() * DISHES.length)];
          t.state = 'ready_to_order';
          renderTables();
        }
      }, 1500);
    } else if (t.state === 'ready_to_order') {
      // Send order to kitchen
      t.state = 'waiting_food';
      playSound('bell');
      cookDish(t.order, t.id);
      renderTables();
    } else if (t.state === 'waiting_food' && selectedKitchenDish !== null) {
      // Deliver food
      if (selectedKitchenDish.tableId === t.id) {
        var kIdx = kitchenItems.indexOf(selectedKitchenDish);
        if (kIdx >= 0) kitchenItems.splice(kIdx, 1);
        selectedKitchenDish = null;
        t.state = 'eating';
        playSound('bell');
        renderKitchen();
        renderTables();

        setTimeout(function () {
          if (t.state === 'eating') {
            t.state = 'waiting_bill';
            renderTables();
          }
        }, 3000);
      }
    } else if (t.state === 'waiting_bill') {
      // Collect payment & tip
      cash += t.order.price;
      cashEl.textContent = '$' + cash.toFixed(2);
      playSound('coin');
      t.state = 'empty';
      t.customer = null;
      t.order = null;
      renderTables();

      if (cash >= 60) {
        playSound('win');
        alert('🎉 恭喜！今日营业额突破 $60，圆满达成餐厅经营指标！');
      }
    }
  }

  function cookDish(dish, tableId) {
    var item = { dish: dish, tableId: tableId, ready: false };
    kitchenItems.push(item);
    renderKitchen();

    setTimeout(function () {
      item.ready = true;
      playSound('bell');
      renderKitchen();
    }, 2500);
  }

  function renderKitchen() {
    kitchenSlots.innerHTML = '';
    kitchenItems.forEach(function (k) {
      var slot = document.createElement('div');
      slot.className = 'order-slot' + (k.ready ? ' ready' : '') + (selectedKitchenDish === k ? ' selected' : '');
      slot.textContent = k.ready ? k.dish.icon : '⏳';
      slot.title = '桌 ' + k.tableId + ' - ' + k.dish.name;

      if (k.ready) {
        slot.addEventListener('click', function () {
          getAudioCtx();
          selectedKitchenDish = (selectedKitchenDish === k ? null : k);
          renderKitchen();
        });
      }
      kitchenSlots.appendChild(slot);
    });
  }

  // Timer loop
  var timer = setInterval(function () {
    if (timeLeft > 0) {
      timeLeft--;
      var m = Math.floor(timeLeft / 60);
      var s = timeLeft % 60;
      clockEl.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    } else {
      clearInterval(timer);
      alert('⏰ 营业时间结束！总营业额: $' + cash.toFixed(2));
    }
  }, 1000);

  setInterval(spawnCustomer, 4000);
  spawnCustomer();
  spawnCustomer();
  renderQueue();
  renderTables();
})();
