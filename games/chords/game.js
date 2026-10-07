/*!
 * 和弦风暴 (Chords Storm) — OmniGame 4轨节奏演奏游戏
 */
(function() {
  'use strict';

  var GAME_ID = 'chords';

  // --- 音频引擎 (Web Audio API 合成) ---
  var audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // 基础音高映射 (C大调音阶和弦)
  var TRACK_FREQS = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
  var CHORD_NAMES = {
    '0-1': 'C (1-3)',
    '1-2': 'Em (3-5)',
    '0-2': 'C5 (1-5)',
    '2-3': 'G (5-8)',
    '0-3': 'C Octave',
    '0-1-2': 'C Major',
    '1-2-3': 'Em/G',
    '0-1-3': 'Cadd9',
    '0-1-2-3': 'Full Chord'
  };

  function playSynthTone(freq, duration, type, gainLevel) {
    var ctx = getAudioContext();
    if (!ctx) return;
    try {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(gainLevel || 0.25, ctx.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration + 0.05);
    } catch (e) {}
  }

  function playDrumBeat(type) {
    var ctx = getAudioContext();
    if (!ctx) return;
    try {
      var t = ctx.currentTime;
      if (type === 'kick') {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(35, t + 0.08);
        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.13);
      } else if (type === 'snare') {
        var oscS = ctx.createOscillator();
        var gainS = ctx.createGain();
        oscS.type = 'triangle';
        oscS.frequency.setValueAtTime(220, t);
        gainS.gain.setValueAtTime(0.2, t);
        gainS.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
        oscS.connect(gainS);
        gainS.connect(ctx.destination);
        oscS.start(t);
        oscS.stop(t + 0.09);
      }
    } catch (e) {}
  }

  function playMissSound() {
    var ctx = getAudioContext();
    if (!ctx) return;
    try {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(70, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.13);
    } catch (e) {}
  }

  // --- 歌曲与谱面定义 ---
  var SONGS = [
    {
      title: '晨曦微风 (Lofi Dawn)',
      bpm: 85,
      totalBeats: 64,
      patternDensity: 1.2
    },
    {
      title: '霓虹回响 (Neon Beats)',
      bpm: 115,
      totalBeats: 80,
      patternDensity: 1.6
    },
    {
      title: '赛博疾风 (Cyber Rush)',
      bpm: 140,
      totalBeats: 96,
      patternDensity: 2.0
    }
  ];

  var selectedSongIdx = 0;

  // 生成音乐谱面
  function generateChart(song) {
    var notes = [];
    var beatSec = 60 / song.bpm;
    var totalNotes = Math.floor(song.totalBeats * song.patternDensity);
    var patterns = [
      [0], [1], [2], [3],
      [0, 2], [1, 3], [0, 1], [2, 3],
      [0, 1, 2], [1, 2, 3]
    ];

    var curTime = 2.0; // 2秒前奏准备
    for (var i = 0; i < totalNotes; i++) {
      var pat = patterns[Math.floor(Math.random() * patterns.length)];
      // 控制和弦出现频率
      if (Math.random() > 0.45 && pat.length > 1) {
        pat = [pat[0]];
      }
      var isChord = pat.length > 1;
      for (var p = 0; p < pat.length; p++) {
        notes.push({
          track: pat[p],
          time: curTime,
          hit: false,
          missed: false,
          chordGroup: isChord ? i : -1,
          chordSize: pat.length
        });
      }
      // 节拍步进 (半拍或整拍)
      var step = Math.random() < 0.6 ? 0.5 : 1.0;
      curTime += step * beatSec;
    }

    notes.sort(function(a, b) { return a.time - b.time; });
    return {
      notes: notes,
      duration: curTime + 2.0,
      beatSec: beatSec
    };
  }

  // --- 游戏主状态 ---
  var state = {
    running: false,
    startTime: 0,
    curTime: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    totalJudged: 0,
    perfectCount: 0,
    greatCount: 0,
    goodCount: 0,
    missCount: 0,
    chordCount: 0,
    chart: null,
    particles: [],
    judgeFeedback: null, // { text, color, timer }
    trackActive: [false, false, false, false],
    lastBeatIdx: -1
  };

  // --- Canvas 渲染引擎 ---
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var cw = 0, ch = 0;

  function resizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    cw = rect.width;
    ch = rect.height;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.resetTransform && ctx.resetTransform();
    ctx.scale(dpr, dpr);
  }
  window.addEventListener('resize', resizeCanvas);

  var TRACK_COLORS = ['#38bdf8', '#34d399', '#f59e0b', '#ec4899'];
  var NOTE_SPEED = 500; // 像素/秒
  var HIT_LINE_Y_OFFSET = 115; // 距离底部的判定线位置

  function spawnParticles(x, y, color, count) {
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 40 + Math.random() * 120;
      state.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 1.8 + Math.random() * 1.5,
        color: color,
        size: 3 + Math.random() * 3
      });
    }
  }

  function render(dt) {
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    var hitY = ch - HIT_LINE_Y_OFFSET;
    var trackW = cw / 4;

    // 1. 轨道背景与分割线
    for (var t = 0; t < 4; t++) {
      var tx = t * trackW;
      if (state.trackActive[t]) {
        var grad = ctx.createLinearGradient(0, 0, 0, hitY);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, TRACK_COLORS[t] + '22');
        ctx.fillStyle = grad;
        ctx.fillRect(tx, 0, trackW, hitY + 20);
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx, 0);
      ctx.lineTo(tx, ch);
      ctx.stroke();
    }
    // 最后一根右边界线
    ctx.beginPath();
    ctx.moveTo(cw, 0);
    ctx.lineTo(cw, ch);
    ctx.stroke();

    // 2. 判定线
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#22d3ee';
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, hitY);
    ctx.lineTo(cw, hitY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 判定槽发光圈
    for (var i = 0; i < 4; i++) {
      var cx = (i + 0.5) * trackW;
      ctx.beginPath();
      ctx.arc(cx, hitY, 18, 0, Math.PI * 2);
      ctx.fillStyle = state.trackActive[i] ? TRACK_COLORS[i] + '55' : 'rgba(255,255,255,0.06)';
      ctx.fill();
      ctx.strokeStyle = state.trackActive[i] ? TRACK_COLORS[i] : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (!state.running || !state.chart) {
      return;
    }

    // 3. 绘制和弦连接横梁 (同一组和弦音符横跨轨道)
    var notes = state.chart.notes;
    var chordGroups = {};
    for (var n = 0; n < notes.length; n++) {
      var note = notes[n];
      if (note.chordGroup >= 0 && !note.hit && !note.missed) {
        var y = hitY - (note.time - state.curTime) * NOTE_SPEED;
        if (y >= -50 && y <= hitY + 50) {
          if (!chordGroups[note.chordGroup]) chordGroups[note.chordGroup] = [];
          chordGroups[note.chordGroup].push({ note: note, y: y });
        }
      }
    }
    for (var gid in chordGroups) {
      var grp = chordGroups[gid];
      if (grp.length > 1) {
        var minX = cw, maxX = 0, groupY = grp[0].y;
        for (var g = 0; g < grp.length; g++) {
          var x = (grp[g].note.track + 0.5) * trackW;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(minX, groupY);
        ctx.lineTo(maxX, groupY);
        ctx.stroke();
      }
    }

    // 4. 绘制音符
    for (var ni = 0; ni < notes.length; ni++) {
      var nt = notes[ni];
      if (nt.hit || nt.missed) continue;

      var noteY = hitY - (nt.time - state.curTime) * NOTE_SPEED;
      // 判定超时 (Miss)
      if (state.curTime - nt.time > 0.16) {
        nt.missed = true;
        handleMiss();
        continue;
      }

      if (noteY < -30 || noteY > ch) continue;

      var nx = (nt.track + 0.5) * trackW;
      var isChord = nt.chordSize > 1;

      // 音符本体 (圆角菱形胶囊)
      ctx.save();
      ctx.translate(nx, noteY);
      ctx.shadowBlur = 12;
      ctx.shadowColor = isChord ? '#fbbf24' : TRACK_COLORS[nt.track];

      ctx.fillStyle = isChord ? '#fbbf24' : TRACK_COLORS[nt.track];
      ctx.beginPath();
      var nw = trackW * 0.72;
      var nh = 16;
      ctx.roundRect(-nw / 2, -nh / 2, nw, nh, 8);
      ctx.fill();

      // 高光芯
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(-nw / 2 + 4, -nh / 2 + 3, nw - 8, nh - 6, 4);
      ctx.fill();

      ctx.restore();
    }

    // 5. 粒子特效更新与绘制
    for (var p = state.particles.length - 1; p >= 0; p--) {
      var pt = state.particles[p];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= pt.decay * dt;
      if (pt.life <= 0) {
        state.particles.splice(p, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 6. 判定反馈文字 (PERFECT, GREAT...)
    if (state.judgeFeedback) {
      state.judgeFeedback.timer -= dt;
      if (state.judgeFeedback.timer <= 0) {
        state.judgeFeedback = null;
      } else {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 24px -apple-system, sans-serif';
        ctx.fillStyle = state.judgeFeedback.color;
        ctx.shadowBlur = 12;
        ctx.shadowColor = state.judgeFeedback.color;
        ctx.fillText(state.judgeFeedback.text, cw / 2, hitY - 60);
        ctx.restore();
      }
    }
  }

  // --- 判定与得分逻辑 ---
  var scoreEl = document.getElementById('scoreVal');
  var comboEl = document.getElementById('comboVal');
  var chordBadge = document.getElementById('chordBadge');

  function updateHUD() {
    if (scoreEl) scoreEl.textContent = state.score;
    if (comboEl) comboEl.textContent = state.combo;
  }

  function handleHit(note, diff) {
    note.hit = true;
    state.totalJudged++;
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;

    var absDiff = Math.abs(diff);
    var hitPoints = 100;
    var judgeText = 'PERFECT';
    var judgeColor = '#fbbf24';

    if (absDiff <= 0.045) {
      state.perfectCount++;
      hitPoints = 120;
      judgeText = 'PERFECT!';
      judgeColor = '#fbbf24';
    } else if (absDiff <= 0.09) {
      state.greatCount++;
      hitPoints = 90;
      judgeText = 'GREAT';
      judgeColor = '#22d3ee';
    } else {
      state.goodCount++;
      hitPoints = 50;
      judgeText = 'GOOD';
      judgeColor = '#34d399';
    }

    // 连击加成
    var comboBonus = Math.min(2.5, 1 + state.combo * 0.05);
    state.score += Math.round(hitPoints * comboBonus);

    // 粒子与打击音效
    var hitY = ch - HIT_LINE_Y_OFFSET;
    var trackW = cw / 4;
    var hitX = (note.track + 0.5) * trackW;
    spawnParticles(hitX, hitY, TRACK_COLORS[note.track], 16);
    playSynthTone(TRACK_FREQS[note.track], 0.22, 'sine', 0.28);

    state.judgeFeedback = { text: judgeText, color: judgeColor, timer: 0.5 };
    updateHUD();
  }

  function handleMiss() {
    state.totalJudged++;
    state.combo = 0;
    state.missCount++;
    playMissSound();
    state.judgeFeedback = { text: 'MISS', color: '#ef4444', timer: 0.4 };
    updateHUD();
  }

  // 用户按下指定轨道
  function triggerTrackPress(trackIdx) {
    if (!state.running || !state.chart) {
      // 菜单界面试听
      playSynthTone(TRACK_FREQS[trackIdx], 0.2, 'sine', 0.2);
      return;
    }

    state.trackActive[trackIdx] = true;
    var trackBtn = document.querySelector('.touch-track-btn[data-track="' + trackIdx + '"]');
    if (trackBtn) trackBtn.classList.add('active');

    // 查找该轨道最接近判定线的音符
    var notes = state.chart.notes;
    var bestNote = null;
    var minDiff = 999;
    var windowSec = 0.15; // ±150ms 判定窗口

    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (n.track !== trackIdx || n.hit || n.missed) continue;
      var diff = n.time - state.curTime;
      if (Math.abs(diff) <= windowSec && Math.abs(diff) < Math.abs(minDiff)) {
        minDiff = diff;
        bestNote = n;
      }
    }

    if (bestNote) {
      handleHit(bestNote, minDiff);

      // 检查是否正在达成多轨和弦共鸣
      checkSimultaneousChord();
    } else {
      // 空击音效
      playSynthTone(TRACK_FREQS[trackIdx], 0.08, 'triangle', 0.1);
    }
  }

  function triggerTrackRelease(trackIdx) {
    state.trackActive[trackIdx] = false;
    var trackBtn = document.querySelector('.touch-track-btn[data-track="' + trackIdx + '"]');
    if (trackBtn) trackBtn.classList.remove('active');
  }

  function checkSimultaneousChord() {
    var activeTracks = [];
    for (var t = 0; t < 4; t++) {
      if (state.trackActive[t]) activeTracks.push(t);
    }
    if (activeTracks.length >= 2) {
      state.chordCount++;
      state.score += 150 * activeTracks.length;
      var key = activeTracks.join('-');
      var chordName = CHORD_NAMES[key] || (activeTracks.length + ' Note Chord');
      if (chordBadge) {
        chordBadge.textContent = '✨ ' + chordName;
        chordBadge.style.transform = 'scale(1.2)';
        setTimeout(function() {
          if (chordBadge) chordBadge.style.transform = 'scale(1)';
        }, 150);
      }
      // 和弦饱满共鸣声
      playSynthTone(523.25 * 1.5, 0.4, 'triangle', 0.2);
    }
  }

  // --- 主循环 ---
  var lastTimestamp = 0;
  function gameLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    var dt = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;
    if (dt > 0.1) dt = 0.1;

    if (state.running) {
      state.curTime = (performance.now() - state.startTime) / 1000;

      // 背景鼓点时钟同步
      if (state.chart) {
        var curBeatIdx = Math.floor(state.curTime / state.chart.beatSec);
        if (curBeatIdx !== state.lastBeatIdx && curBeatIdx >= 0) {
          state.lastBeatIdx = curBeatIdx;
          if (curBeatIdx % 2 === 0) {
            playDrumBeat('kick');
          } else {
            playDrumBeat('snare');
          }
        }

        // 歌曲结束判断
        if (state.curTime > state.chart.duration) {
          endGame();
        }
      }
    }

    render(dt);
    requestAnimationFrame(gameLoop);
  }

  // --- 游戏结束与结算 ---
  function endGame() {
    state.running = false;
    var overOverlay = document.getElementById('overOverlay');
    var evalRank = document.getElementById('evalRank');
    var evalDesc = document.getElementById('evalDesc');
    var finalScore = document.getElementById('finalScore');
    var finalMaxCombo = document.getElementById('finalMaxCombo');
    var finalAcc = document.getElementById('finalAcc');
    var finalChords = document.getElementById('finalChords');

    var total = state.totalJudged || 1;
    var hitTotal = state.perfectCount + state.greatCount + state.goodCount;
    var acc = Math.round((hitTotal / total) * 100);

    var rank = 'C';
    var desc = '继续努力，感受节拍的和弦律动！';
    if (acc >= 95 && state.missCount === 0) {
      rank = 'S+ ALL PERFECT';
      desc = '神乎其技！完美的和弦风暴演奏家！';
    } else if (acc >= 90) {
      rank = 'S 极佳演奏';
      desc = '律动与和弦融为一体，极为精彩！';
    } else if (acc >= 75) {
      rank = 'A 优秀表现';
      desc = '出色的乐感与节奏把控！';
    } else if (acc >= 60) {
      rank = 'B 顺利通关';
      desc = '节奏渐入佳境，再来一曲挑战高分！';
    }

    if (evalRank) evalRank.textContent = rank;
    if (evalDesc) evalDesc.textContent = desc;
    if (finalScore) finalScore.textContent = state.score;
    if (finalMaxCombo) finalMaxCombo.textContent = state.maxCombo;
    if (finalAcc) finalAcc.textContent = acc + '%';
    if (finalChords) finalChords.textContent = state.chordCount;

    if (overOverlay) overOverlay.classList.remove('hidden');

    // 存储高分
    if (window.GameStore) {
      var saved = window.GameStore.get(GAME_ID) || {};
      if (!saved.highScore || state.score > saved.highScore) {
        window.GameStore.save(GAME_ID, {
          highScore: state.score,
          maxCombo: state.maxCombo,
          date: Date.now()
        });
      }
    }
  }

  function startGame() {
    getAudioContext();
    var song = SONGS[selectedSongIdx];
    state.chart = generateChart(song);
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.totalJudged = 0;
    state.perfectCount = 0;
    state.greatCount = 0;
    state.goodCount = 0;
    state.missCount = 0;
    state.chordCount = 0;
    state.particles = [];
    state.judgeFeedback = null;
    state.lastBeatIdx = -1;
    state.startTime = performance.now();
    state.curTime = 0;
    state.running = true;

    updateHUD();

    var startOverlay = document.getElementById('startOverlay');
    var overOverlay = document.getElementById('overOverlay');
    if (startOverlay) startOverlay.classList.add('hidden');
    if (overOverlay) overOverlay.classList.add('hidden');
  }

  // --- 输入事件绑定 ---
  var KEY_TRACK_MAP = {
    'KeyD': 0, 'ArrowLeft': 0,
    'KeyF': 1, 'ArrowDown': 1,
    'KeyJ': 2, 'ArrowUp': 2,
    'KeyK': 3, 'ArrowRight': 3
  };

  window.addEventListener('keydown', function(e) {
    if (e.repeat) return;
    var track = KEY_TRACK_MAP[e.code];
    if (track !== undefined) {
      e.preventDefault();
      triggerTrackPress(track);
    }
  });

  window.addEventListener('keyup', function(e) {
    var track = KEY_TRACK_MAP[e.code];
    if (track !== undefined) {
      e.preventDefault();
      triggerTrackRelease(track);
    }
  });

  // 底部触摸按键绑定
  var touchBtns = document.querySelectorAll('.touch-track-btn');
  touchBtns.forEach(function(btn) {
    var track = parseInt(btn.getAttribute('data-track'), 10);
    btn.addEventListener('pointerdown', function(e) {
      e.preventDefault();
      triggerTrackPress(track);
    });
    btn.addEventListener('pointerup', function(e) {
      e.preventDefault();
      triggerTrackRelease(track);
    });
    btn.addEventListener('pointercancel', function(e) {
      e.preventDefault();
      triggerTrackRelease(track);
    });
  });

  // 歌曲选择绑定
  var songBtns = document.querySelectorAll('.song-btn');
  songBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      songBtns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      selectedSongIdx = parseInt(btn.getAttribute('data-song'), 10) || 0;
    });
  });

  var startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.addEventListener('click', startGame);

  var retryBtn = document.getElementById('retryBtn');
  if (retryBtn) retryBtn.addEventListener('click', function() {
    var overOverlay = document.getElementById('overOverlay');
    var startOverlay = document.getElementById('startOverlay');
    if (overOverlay) overOverlay.classList.add('hidden');
    if (startOverlay) startOverlay.classList.remove('hidden');
  });

  // 初始化
  resizeCanvas();
  requestAnimationFrame(gameLoop);
})();
