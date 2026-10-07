/* 画个完美的圆 — OmniGame (signature toy)
 *
 * Freehand-circle scoring. On pointer release we:
 *   1. Fit a circle to the drawn points using the centroid + mean radius,
 *      then measure the RMS radial deviation (how non-circular it is).
 *   2. Measure closure (gap between first and last point).
 *   3. Measure angular coverage (reject partial arcs).
 * The score is 100 * (1 - weighted error), clamped to [0,100].
 *
 * No dependencies, no network. Best score persisted via GameStore.
 */
(function () {
  'use strict';

  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d');
  var hint = document.getElementById('hint');
  var result = document.getElementById('result');
  var scoreEl = document.getElementById('score');
  var scoreSub = document.getElementById('scoreSub');
  var shareText = document.getElementById('shareText');
  var copyBtn = document.getElementById('copyBtn');
  var againBtn = document.getElementById('againBtn');
  var bestEl = document.getElementById('best');

  var best = 0;
  var drawing = false;
  var points = [];
  var cssW = 0;

  function resize() {
    var rect = cv.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    cssW = rect.width;
    cv.width = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }
  // Fit the canvas to a square that fills the available stage.
  function fitStage() {
    var headH = (document.querySelector('.head') || {}).offsetHeight || 44;
    var hintH = (document.querySelector('.hint') || {}).offsetHeight || 24;
    var availH = window.innerHeight - headH - hintH - 46;
    var availW = Math.min(window.innerWidth - 32, 850);
    var s = Math.min(availW, availH);
    s = Math.max(260, Math.min(s, 720));
    cv.style.width = s + 'px';
    cv.style.height = s + 'px';
    resize();
  }
  window.addEventListener('resize', fitStage);

  function pos(e) {
    var rect = cv.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    drawing = true;
    points = [];
    result.hidden = true;
    hint.textContent = '松手即评分…';
    var p = pos(e);
    points.push(p);
    redraw();
  }

  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    var p = pos(e);
    var last = points[points.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 3) {
      points.push(p);
      redraw();
    }
  }

  function end() {
    if (!drawing) return;
    drawing = false;
    evaluate();
  }

  function redraw(fit) {
    ctx.clearRect(0, 0, cssW, cssW);
    // faint guide ring
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cssW / 2, cssW / 2, cssW * 0.36, 0, Math.PI * 2);
    ctx.stroke();

    if (fit) {
      ctx.strokeStyle = 'rgba(108,140,255,0.55)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fit.cx, fit.cy, fit.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (points.length > 1) {
      var grad = ctx.createLinearGradient(0, 0, cssW, cssW);
      grad.addColorStop(0, '#ff7eb6');
      grad.addColorStop(1, '#6c8cff');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(255,126,182,0.5)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function evaluate() {
    if (points.length < 15) {
      hint.textContent = '请画一个完整的圆（点太少啦）';
      return;
    }
    var n = points.length;
    var sx = 0, sy = 0;
    for (var i = 0; i < n; i++) { sx += points[i].x; sy += points[i].y; }
    var cx = sx / n, cy = sy / n;

    var rs = [];
    var sum = 0, sum2 = 0;
    for (i = 0; i < n; i++) {
      var d = Math.hypot(points[i].x - cx, points[i].y - cy);
      rs.push(d); sum += d; sum2 += d * d;
    }
    var meanR = sum / n;
    if (meanR < 8) { // tiny scribble
      hint.textContent = '圆太小了，画大一点～';
      return;
    }
    var variance = sum2 / n - meanR * meanR;
    var rms = Math.sqrt(Math.max(0, variance));
    var radial = rms / meanR; // 0 = perfect ring

    // closure: gap between endpoints vs radius
    var gap = Math.hypot(points[0].x - points[n - 1].x, points[0].y - points[n - 1].y);
    var closure = Math.min(1, gap / (2 * meanR));

    // angular coverage: largest gap between consecutive angles
    var angles = [];
    for (i = 0; i < n; i++) angles.push(Math.atan2(points[i].y - cy, points[i].x - cx));
    angles.sort(function (a, b) { return a - b; });
    var maxGap = 0;
    for (i = 1; i < angles.length; i++) {
      var g = angles[i] - angles[i - 1];
      if (g > maxGap) maxGap = g;
    }
    var wrapGap = (angles[0] + 2 * Math.PI) - angles[angles.length - 1];
    if (wrapGap > maxGap) maxGap = wrapGap;
    var coverage = Math.max(0, Math.min(1, (maxGap - (40 * Math.PI / 180)) / (320 * Math.PI / 180)));

    var err = radial * 0.55 + closure * 0.25 + coverage * 0.20;
    var score = Math.round(Math.max(0, Math.min(100, 100 * (1 - err))));

    var fit = { cx: cx, cy: cy, r: meanR };
    redraw(fit);

    if (score > best) {
      best = score;
      GameStore.setBest('perfect-circle', best);
      bestEl.textContent = best + '%';
    }

    scoreEl.textContent = score + '%';
    var label = score >= 95 ? '神之圆手！🟢' : score >= 80 ? '相当圆了！' : score >= 60 ? '还不错～' : '再练练？';
    scoreSub.textContent = label + ' · 半径偏差 ' + (radial * 100).toFixed(1) + '%';
    shareText.value = '我在 OmniGame 画了个 ' + score + '% 的圆！' + (score >= 95 ? '🟢' : '⭕') + ' 你能画得更圆吗？';
    result.hidden = false;
    hint.textContent = '想更圆？点“再画一次”继续挑战';
  }

  function copyShare() {
    var text = shareText.value;
    function fallback() {
      shareText.removeAttribute('readonly');
      shareText.select();
      try { document.execCommand('copy'); } catch (e) {}
      shareText.setAttribute('readonly', '');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        copyBtn.textContent = '已复制';
        setTimeout(function () { copyBtn.textContent = '复制'; }, 1500);
      }, fallback);
    } else {
      fallback();
      copyBtn.textContent = '已复制';
      setTimeout(function () { copyBtn.textContent = '复制'; }, 1500);
    }
  }

  function reset() {
    points = [];
    result.hidden = true;
    hint.textContent = '用手指 / 鼠标画一个完整的圆，松手即评分';
    redraw();
  }

  // Pointer events cover mouse + touch + pen.
  cv.addEventListener('pointerdown', start);
  cv.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);

  copyBtn.addEventListener('click', copyShare);
  againBtn.addEventListener('click', reset);

  // ---- Boot ----
  GameStore.getBest('perfect-circle').then(function (b) {
    best = b || 0;
    bestEl.textContent = best ? best + '%' : '—';
  });
  fitStage();
})();
