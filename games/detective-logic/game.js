(function () {
  'use strict';

  var tableWrap = document.getElementById('table-wrap');
  var selSuspect = document.getElementById('sel-suspect');
  var selRoom = document.getElementById('sel-room');
  var selItem = document.getElementById('sel-item');
  var btnSubmit = document.getElementById('btn-submit');

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

      if (type === 'tick') {
        osc.frequency.setValueAtTime(500, now);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
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
      } else if (type === 'wrong') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {}
  }

  var suspects = ['伯爵', '管家', '画家', '医生'];
  var rooms = ['书房', '画室', '花园', '地窖'];
  var items = ['怀表', '遗嘱', '钥匙', '毒药'];

  // Grid state: suspect index (0..3) -> room/item col (0..7) -> 0: empty, 1: cross, 2: check
  var gridState = {};
  suspects.forEach(function (s, sIdx) {
    gridState[sIdx] = {};
    for (var c = 0; c < 8; c++) {
      gridState[sIdx][c] = 0;
    }
  });

  function renderTable() {
    var cols = rooms.concat(items);
    var html = '<table class="logic-table"><thead><tr><th>嫌疑人</th>';
    cols.forEach(function (c) {
      html += '<th>' + c + '</th>';
    });
    html += '</tr></thead><tbody>';

    suspects.forEach(function (s, sIdx) {
      html += '<tr><td style="font-weight:bold;color:#facc15;">' + s + '</td>';
      cols.forEach(function (c, cIdx) {
        var state = gridState[sIdx][cIdx];
        var text = '';
        var cls = '';
        if (state === 1) { text = '✖'; cls = 'no'; }
        else if (state === 2) { text = '✔'; cls = 'yes'; }

        html += '<td class="grid-cell ' + cls + '" data-s="' + sIdx + '" data-c="' + cIdx + '">' + text + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';

    tableWrap.innerHTML = html;

    var cells = tableWrap.querySelectorAll('.grid-cell');
    cells.forEach(function (cell) {
      cell.addEventListener('click', function () {
        getAudioCtx();
        playSound('tick');
        var s = parseInt(cell.dataset.s, 10);
        var c = parseInt(cell.dataset.c, 10);
        gridState[s][c] = (gridState[s][c] + 1) % 3;
        renderTable();
      });
    });
  }

  // Solution:
  // Butler = Study, Poison
  // Doctor = Garden, Key
  // Count = Studio, Watch
  // Painter = Cellar, Will
  // Culprit who took the Diamond was the one in Cellar hiding the Will -> Painter!
  btnSubmit.addEventListener('click', function () {
    getAudioCtx();
    var s = selSuspect.value;
    var r = selRoom.value;
    var it = selItem.value;

    if (s === '画家' && r === '地窖' && it === '遗嘱') {
      playSound('win');
      alert('🎉 逻辑神探！推演完全正确！\n\n画家潜入地窖盗取了遗嘱与庄园钻石，被你以无可辩驳的证据当场逮捕！');
    } else {
      playSound('wrong');
      alert('❌ 推理有误！请仔细复查线索排查各人所在房间与随身物品之间的互斥关系！');
    }
  });

  renderTable();
})();
