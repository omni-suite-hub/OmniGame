(function () {
  'use strict';

  var gridEl = document.getElementById('grid');
  var acrossCluesEl = document.getElementById('across-clues');
  var downCluesEl = document.getElementById('down-clues');
  var keyboardEl = document.getElementById('keyboard');
  var btnCheck = document.getElementById('btn-check');
  var btnHint = document.getElementById('btn-hint');
  var btnReset = document.getElementById('btn-reset');

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

      if (type === 'type') {
        osc.frequency.setValueAtTime(600, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'win') {
        [523, 659, 783, 1046].forEach(function (f, i) {
          var o = actx.createOscillator();
          var g = actx.createGain();
          o.frequency.setValueAtTime(f, now + i * 0.1);
          g.gain.setValueAtTime(0.15, now + i * 0.1);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
          o.connect(g);
          g.connect(actx.destination);
          o.start(now + i * 0.1);
          o.stop(now + i * 0.1 + 0.3);
        });
      } else if (type === 'err') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch (e) {}
  }

  // Crossword Definition (7x7)
  // Grid layout: '#' is black block
  var GRID_SIZE = 7;
  var solution = [
    ['P','L','A','N','E','T','#'],
    ['#','O','#','E','#','R','#'],
    ['C','O','D','E','#','A','P'],
    ['A','#','#','D','#','I','#'],
    ['T','A','S','K','#','N','E'],
    ['#','P','#','#','#','#','T'],
    ['G','A','M','E','S','#','#']
  ];

  var acrossClues = [
    { num: 1, r: 0, c: 0, word: 'PLANET', text: '1. 围绕恒星公转的天体 (Planet)' },
    { num: 3, r: 2, c: 0, word: 'CODE',   text: '3. 程序员写出的指令逻辑 (Code)' },
    { num: 5, r: 2, c: 5, word: 'AP',     text: '5. 极点或无线接入点缩写' },
    { num: 6, r: 4, c: 0, word: 'TASK',   text: '6. 待完成的使命或工单 (Task)' },
    { num: 8, r: 4, c: 5, word: 'NE',     text: '8. 东北方向英文缩写' },
    { num: 9, r: 6, c: 0, word: 'GAMES',  text: '9. 电子娱乐游戏复数 (Games)' }
  ];

  var downClues = [
    { num: 1, r: 0, c: 1, word: 'LOOK',  text: '1. 注视、观看或瞧瞧 (Look)' },
    { num: 2, r: 0, c: 3, word: 'NEED',  text: '2. 必需、需求或渴望 (Need)' },
    { num: 3, r: 0, c: 5, word: 'TRAIN', text: '3. 铁轨上飞驰的长龙列车 (Train)' },
    { num: 4, r: 2, c: 0, word: 'CAT',   text: '4. 软萌爱抓老鼠的小动物 (Cat)' },
    { num: 7, r: 4, c: 6, word: 'ET',    text: '7. 斯皮尔伯格经典外星人 (E.T.)' }
  ];

  var userGrid = [];
  var selectedCell = { r: 0, c: 0 };
  var currentDir = 'across'; // 'across' or 'down'

  function initGrid() {
    userGrid = [];
    for (var r = 0; r < GRID_SIZE; r++) {
      var row = [];
      for (var c = 0; c < GRID_SIZE; c++) {
        row.push(solution[r][c] === '#' ? '#' : '');
      }
      userGrid.push(row);
    }
  }

  function renderGrid() {
    gridEl.innerHTML = '';
    gridEl.style.gridTemplateColumns = 'repeat(' + GRID_SIZE + ', 38px)';

    for (var r = 0; r < GRID_SIZE; r++) {
      for (var c = 0; c < GRID_SIZE; c++) {
        var cell = document.createElement('div');
        cell.className = 'cw-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;

        if (solution[r][c] === '#') {
          cell.classList.add('black');
        } else {
          // Check for clue number
          var numText = '';
          acrossClues.forEach(function (ac) { if (ac.r === r && ac.c === c) numText = ac.num; });
          downClues.forEach(function (dc) { if (dc.r === r && dc.c === c && !numText) numText = dc.num; });
          if (numText) {
            var numSpan = document.createElement('span');
            numSpan.className = 'cell-num';
            numSpan.textContent = numText;
            cell.appendChild(numSpan);
          }

          var textSpan = document.createElement('span');
          textSpan.textContent = userGrid[r][c] || '';
          cell.appendChild(textSpan);

          if (selectedCell.r === r && selectedCell.c === c) {
            cell.classList.add('selected');
          } else if (isInCurrentWord(r, c)) {
            cell.classList.add('highlight');
          }

          cell.addEventListener('click', (function (row, col) {
            return function () {
              if (selectedCell.r === row && selectedCell.c === col) {
                currentDir = (currentDir === 'across') ? 'down' : 'across';
              } else {
                selectedCell = { r: row, c: col };
              }
              renderGrid();
              updateClueHighlights();
            };
          })(r, c));
        }

        gridEl.appendChild(cell);
      }
    }
  }

  function isInCurrentWord(r, c) {
    if (solution[r][c] === '#') return false;
    if (currentDir === 'across') {
      if (r !== selectedCell.r) return false;
      var cMin = selectedCell.c;
      while (cMin > 0 && solution[r][cMin - 1] !== '#') cMin--;
      var cMax = selectedCell.c;
      while (cMax < GRID_SIZE - 1 && solution[r][cMax + 1] !== '#') cMax++;
      return c >= cMin && c <= cMax;
    } else {
      if (c !== selectedCell.c) return false;
      var rMin = selectedCell.r;
      while (rMin > 0 && solution[rMin - 1][c] !== '#') rMin--;
      var rMax = selectedCell.r;
      while (rMax < GRID_SIZE - 1 && solution[rMax + 1][c] !== '#') rMax++;
      return r >= rMin && r <= rMax;
    }
  }

  function renderClues() {
    acrossCluesEl.innerHTML = '';
    acrossClues.forEach(function (clue) {
      var d = document.createElement('div');
      d.className = 'clue-item';
      d.textContent = clue.text;
      d.dataset.r = clue.r;
      d.dataset.c = clue.c;
      d.addEventListener('click', function () {
        selectedCell = { r: clue.r, c: clue.c };
        currentDir = 'across';
        renderGrid();
        updateClueHighlights();
      });
      acrossCluesEl.appendChild(d);
    });

    downCluesEl.innerHTML = '';
    downClues.forEach(function (clue) {
      var d = document.createElement('div');
      d.className = 'clue-item';
      d.textContent = clue.text;
      d.dataset.r = clue.r;
      d.dataset.c = clue.c;
      d.addEventListener('click', function () {
        selectedCell = { r: clue.r, c: clue.c };
        currentDir = 'down';
        renderGrid();
        updateClueHighlights();
      });
      downCluesEl.appendChild(d);
    });
  }

  function updateClueHighlights() {
    // highlight clue corresponding to current word
  }

  function renderKeyboard() {
    keyboardEl.innerHTML = '';
    var rows = [
      ['Q','W','E','R','T','Y','U','I','O','P'],
      ['A','S','D','F','G','H','J','K','L'],
      ['⌫','Z','X','C','V','B','N','M','✔']
    ];

    rows.forEach(function (rList) {
      var rowDiv = document.createElement('div');
      rowDiv.className = 'kb-row';
      rList.forEach(function (key) {
        var btn = document.createElement('button');
        btn.className = 'kb-key';
        btn.textContent = key;
        btn.addEventListener('click', function () {
          handleInput(key);
        });
        rowDiv.appendChild(btn);
      });
      keyboardEl.appendChild(rowDiv);
    });
  }

  function handleInput(key) {
    if (solution[selectedCell.r][selectedCell.c] === '#') return;
    getAudioCtx();

    if (key === '⌫' || key === 'Backspace') {
      userGrid[selectedCell.r][selectedCell.c] = '';
      playSound('type');
      moveCursor(-1);
    } else if (key === '✔' || key === 'Enter') {
      checkAnswers();
    } else if (/^[A-Za-z]$/.test(key)) {
      userGrid[selectedCell.r][selectedCell.c] = key.toUpperCase();
      playSound('type');
      moveCursor(1);
    }
    renderGrid();
  }

  function moveCursor(step) {
    var r = selectedCell.r;
    var c = selectedCell.c;
    if (currentDir === 'across') {
      c += step;
      while (c >= 0 && c < GRID_SIZE && solution[r][c] === '#') {
        c += step;
      }
      if (c >= 0 && c < GRID_SIZE) selectedCell.c = c;
    } else {
      r += step;
      while (r >= 0 && r < GRID_SIZE && solution[r][c] === '#') {
        r += step;
      }
      if (r >= 0 && r < GRID_SIZE) selectedCell.r = r;
    }
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Backspace') handleInput('⌫');
    else if (e.key === 'Enter') handleInput('✔');
    else if (/^[a-zA-Z]$/.test(e.key)) handleInput(e.key);
    else if (e.key === 'ArrowRight') { currentDir = 'across'; moveCursor(1); renderGrid(); }
    else if (e.key === 'ArrowLeft') { currentDir = 'across'; moveCursor(-1); renderGrid(); }
    else if (e.key === 'ArrowDown') { currentDir = 'down'; moveCursor(1); renderGrid(); }
    else if (e.key === 'ArrowUp') { currentDir = 'down'; moveCursor(-1); renderGrid(); }
  });

  function checkAnswers() {
    var allCorrect = true;
    for (var r = 0; r < GRID_SIZE; r++) {
      for (var c = 0; c < GRID_SIZE; c++) {
        if (solution[r][c] !== '#') {
          if (userGrid[r][c] !== solution[r][c]) {
            allCorrect = false;
          }
        }
      }
    }
    if (allCorrect) {
      playSound('win');
      alert('🎉 恭喜！全部填字词条完美通关！');
    } else {
      playSound('err');
      alert('仍有未填满或不匹配的字母，再仔细核对一下线索吧！');
    }
  }

  btnCheck.addEventListener('click', checkAnswers);

  btnHint.addEventListener('click', function () {
    var r = selectedCell.r;
    var c = selectedCell.c;
    if (solution[r][c] !== '#') {
      userGrid[r][c] = solution[r][c];
      playSound('type');
      renderGrid();
    }
  });

  btnReset.addEventListener('click', function () {
    initGrid();
    renderGrid();
  });

  initGrid();
  renderGrid();
  renderClues();
  renderKeyboard();
})();
