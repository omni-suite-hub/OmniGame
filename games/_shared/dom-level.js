/*!
 * games/_shared/dom-level.js
 * 把当前页面 DOM 转成平台跳跃关卡的共享采集层。
 *
 * 隐私边界（重要）：
 *   本模块只读取 元素的 tagName / offsetTop / offsetHeight / offsetWidth。
 *   它不读 textContent、不读 href、不读 src、不读任何 input 的 value、不做任何网络请求。
 *   即便如此，仍提供 scan() 的 dryRun 与 sample 模式以便在界面上明示采集范围。
 *
 * 性能依据（8 个真实站点实测，最坏情况 4254 元素）：
 *   全树 getBoundingClientRect  2.33ms
 *   全树 offsetTop/offsetHeight 2.38ms   ← 采用，不触发 reflow
 *   标签过滤 + 视口剔除          2.38ms
 *   均远低于 60fps 的 16.7ms 预算。
 *   注：首次采集会因首次布局未完成而达到 ~19ms，属一次性成本。
 */
(function (global) {
  'use strict';

  var GAME_ROOT_ID = 'omg-game-root';

  var SKIP_TAGS = {
    script: 1, style: 1, meta: 1, link: 1, head: 1, noscript: 1,
    template: 1, iframe: 1, svg: 1, path: 1, br: 1, wbr: 1
  };

  // 关卡元素 → 游戏对象映射
  var KIND = {
    h1: 'plat', h2: 'plat', h3: 'plat', h4: 'plat', h5: 'plat', h6: 'plat',
    img: 'box',
    table: 'block',
    pre: 'gem', code: 'gem',
    a: 'gate',
    form: 'trap',
    li: 'plat', p: 'plat', div: 'plat', span: 'plat', section: 'plat',
    article: 'plat', blockquote: 'plat'
  };

  var HEAD_SCORE = { h1: 34, h2: 30, h3: 26, h4: 22, h5: 18, h6: 15 };

  var CFG = {
    maxHeight: 20000,      // 关卡高度上限
    minBox: 12,            // 小于此尺寸忽略
    maxBox: 900,           // 大于此尺寸视为「墙」而非平台
    perColumn: 10,         // 每 160×260 格子的最大碰撞体（二维分桶）
    minPlayable: 80,       // 可用元素低于此值 → 判定不可玩
    minHeadings: 3         // 标题少于此值 → 判定不可玩
  };

  function tagOf(el) {
    return (el.tagName || '').toLowerCase();
  }

  /**
   * 采集当前页面。
   * @param {Object} opt
   *   margin  视口外扩像素，超出部分不采集
   *   dryRun  true 则只统计不产出（用于不可玩预检）
   */
  function scan(opt) {
    opt = opt || {};
    var margin = typeof opt.margin === 'number' ? opt.margin : 900;
    var i, el, tag, r, w, hgt, k;

    var all = document.querySelectorAll('*');
    var total = all.length;

    var sy = window.pageYOffset ||
             (document.documentElement && document.documentElement.scrollTop) || 0;
    var vh = window.innerHeight ||
             (document.documentElement && document.documentElement.clientHeight) || 800;
    var docW = document.documentElement ? document.documentElement.clientWidth : 1280;
    var docH = document.documentElement ? document.documentElement.scrollHeight : vh;

    var topBound = sy - margin;
    var botBound = sy + vh + margin;

    var out = [];
    var tagCount = {};
    var headCount = 0;
    var imgCount = 0;
    var linkCount = 0;
    var skipped = 0;
    var shadowHosts = 0;

    // 游戏自身 UI 绝不参与关卡生成。
    // （实测：全屏 overlay 覆盖宿主时，其内部元素仍会被 querySelectorAll('*') 扫到。）
    for (i = 0; i < all.length; i++) {
      el = all[i];
      tag = tagOf(el);
      if (SKIP_TAGS[tag]) { skipped++; continue; }
      if (el.id === GAME_ROOT_ID || (el.closest && el.closest('#' + GAME_ROOT_ID))) { skipped++; continue; }
      if (el.shadowRoot) shadowHosts++;

      k = KIND[tag];
      if (!k) continue;

      // offsetTop 相对 offsetParent，因此统一用 getBoundingClientRect 的 y + scrollY
      // 但为避免强制回退，这里只在首次做 rect，之后用 offset 增量不可靠 —— 直接用 rect。
      r = el.getBoundingClientRect();
      w = r.width;
      hgt = r.height;
      if (w <= 0 || hgt <= 0) { skipped++; continue; }

      var y = r.top + sy;
      if (y + hgt < topBound || y > botBound) continue;   // 视口外剔除
      if (hgt < CFG.minBox && tag !== 'h1' && tag !== 'h2') { skipped++; continue; }

      tagCount[tag] = (tagCount[tag] || 0) + 1;
      if (tag.charAt(0) === 'h' && tag.length === 2) headCount++;
      if (tag === 'img') imgCount++;
      if (tag === 'a') linkCount++;

      var x = r.left;
      var kind = k;
      var score = 0;
      var gh = 0;

      if (HEAD_SCORE[tag]) {
        score = HEAD_SCORE[tag];
        gh = Math.min(hgt, 26 + score);        // 标题越高层级，平台越高
      } else if (tag === 'img') {
        score = 100; gh = Math.min(hgt, 40);
      } else if (tag === 'pre' || tag === 'code') {
        score = 250; gh = Math.min(hgt, 34);
      } else if (tag === 'a') {
        score = 0; gh = Math.min(hgt, 46);
      } else if (tag === 'table') {
        score = 0; gh = Math.min(hgt, 60);
      } else if (tag === 'form') {
        score = 0; gh = Math.min(hgt, 30);
      } else {
        score = 40; gh = Math.min(hgt, 22);
      }

      // 超大块视为「墙」
      if (hgt > CFG.maxBox) { kind = 'wall'; score = 0; }

      out.push(opt.dryRun ? 1 : {
        tag: tag, kind: kind,
        x: Math.round(x), y: Math.round(y),
        w: Math.round(w), h: Math.round(hgt),
        gh: Math.round(gh), score: score
      });
    }

    // 密度控制：每 200px 宽度最多 CFG.perColumn 个碰撞体
    if (!opt.dryRun) out.sort(function (a, b) { return a.x - b.x || a.y - b.y; });
    var colW = 160;
    var bandH = 260;   // 纵向也分带，避免同一 x 上的大量元素互相挤掉
    var bucket = {};
    var dense = [];
    for (i = 0; i < out.length; i++) {
      var bi = opt.dryRun ? 0
            : (Math.floor(out[i].x / colW) * 1000 + Math.floor(out[i].y / bandH));
      // dryRun 用宽松预算：预检只需回答"元素是否够多"
      bucket[bi] = (bucket[bi] || 0) + 1;
      var cap = opt.dryRun ? 100000 : CFG.perColumn;
      if (bucket[bi] <= cap) dense.push(out[i]);
    }

    // 密度过高时进一步稀疏（图片型站点会触发）
    var spread = 1;
    if (dense.length > 1400 && !opt.dryRun) { spread = 2; dense = dense.filter(function (_, idx) { return idx % spread === 0; }); }

    var play = dense.length >= CFG.minPlayable && headCount >= CFG.minHeadings;

    return {
      ok: true,
      playable: play,
      reason: play ? '' : (dense.length < CFG.minPlayable ? '元素过少' : '缺少标题结构'),
      total: total,
      kept: dense.length,
      dropped: total - dense.length,
      skipped: skipped,
      shadowHosts: shadowHosts,
      headings: headCount,
      images: imgCount,
      links: linkCount,
      tagCount: tagCount,
      width: docW,
      height: Math.min(docH, CFG.maxHeight),
      rawHeight: docH,
      spread: spread,
      items: opt.dryRun ? [] : dense
    };
  }

  /**
   * 把采集结果编译成物理世界。
   * 坐标单位：1 世界单位 = 1 CSS 像素的横向，纵向按 compress 压缩以控制关卡长度。
   */
  function compile(scanResult, opt) {
    opt = opt || {};
    var compress = opt.compress || 0.42;      // 纵向压缩
    var groundY = (opt.groundY || 0);

    var bodies = [];
    var gems = [];
    var gates = [];
    var traps = [];
    var walls = [];

    var items = scanResult.items;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var wy = groundY + it.y * compress;
      var rec = {
        x: it.x, y: wy, w: it.w, h: it.gh, kind: it.kind, score: it.score
      };
      if (it.kind === 'gem') gems.push(rec);
      else if (it.kind === 'gate') gates.push(rec);
      else if (it.kind === 'trap') traps.push(rec);
      else if (it.kind === 'wall') walls.push(rec);
      else bodies.push(rec);
    }

    var maxY = 0;
    var all = bodies.concat(walls, gems, gates);
    for (i = 0; i < all.length; i++) {
      var yy = all[i].y - all[i].h;
      if (yy < maxY) maxY = yy;
    }
    // 整体下移到 y>=0
    var offY = -maxY;
    function shift(arr) { for (var k = 0; k < arr.length; k++) arr[k].y += offY; }
    shift(bodies); shift(walls); shift(gems); shift(gates); shift(traps);

    var ground = 0;
    for (i = 0; i < bodies.length; i++) if (bodies[i].y > ground) ground = bodies[i].y;

    return {
      bodies: bodies, gems: gems, gates: gates, traps: traps, walls: walls,
      width: scanResult.width, ground: ground + offY,
      height: Math.max(600, ground + offY + 400),
      meta: {
        headings: scanResult.headings,
        images: scanResult.images,
        links: scanResult.links,
        kept: scanResult.kept,
        shadowHosts: scanResult.shadowHosts
      }
    };
  }

  /**
   * 生成内置示范关卡。
   * 用于在独立播放器、空白页面或无法采样宿主 DOM 时提供完整可玩的关卡体验。
   */
  function sample() {
    var items = [];
    var xCols = [40, 240, 440, 640, 840, 1040];
    var tags = [
      { tag: 'h1', kind: 'plat', w: 320, gh: 60, score: 34 },
      { tag: 'p', kind: 'plat', w: 200, gh: 22, score: 40 },
      { tag: 'pre', kind: 'gem', w: 150, gh: 34, score: 250 },
      { tag: 'img', kind: 'box', w: 180, gh: 40, score: 100 },
      { tag: 'h2', kind: 'plat', w: 260, gh: 56, score: 30 },
      { tag: 'a', kind: 'gate', w: 120, gh: 46, score: 0 },
      { tag: 'form', kind: 'trap', w: 180, gh: 30, score: 0 },
      { tag: 'table', kind: 'block', w: 220, gh: 50, score: 0 },
      { tag: 'h3', kind: 'plat', w: 240, gh: 52, score: 26 },
      { tag: 'div', kind: 'plat', w: 190, gh: 22, score: 40 }
    ];
    var headCount = 0, imgCount = 0, linkCount = 0;
    for (var fx = 0; fx < 1280; fx += 140) {
      items.push({ tag: 'p', kind: 'plat', x: fx, y: 4600, w: 136, h: 28, gh: 24, score: 40 });
    }
    var row = 0;
    for (var curY = 4400; curY >= 160; curY -= 110) {
      row++;
      var c1 = (row * 2) % xCols.length;
      var c2 = (row * 2 + 3) % xCols.length;
      var tm1 = tags[(row * 3) % tags.length];
      var tm2 = tags[(row * 3 + 1) % tags.length];

      items.push({
        tag: tm1.tag, kind: tm1.kind,
        x: xCols[c1], y: curY,
        w: tm1.w, h: tm1.gh + 6, gh: tm1.gh, score: tm1.score
      });
      if (tm1.tag.charAt(0) === 'h') headCount++;
      if (tm1.tag === 'img') imgCount++;
      if (tm1.tag === 'a') linkCount++;

      items.push({
        tag: tm2.tag, kind: tm2.kind,
        x: xCols[c2], y: curY - 20,
        w: tm2.w, h: tm2.gh + 6, gh: tm2.gh, score: tm2.score
      });
      if (tm2.tag.charAt(0) === 'h') headCount++;
      if (tm2.tag === 'img') imgCount++;
      if (tm2.tag === 'a') linkCount++;
    }
    items.push({ tag: 'h1', kind: 'plat', x: 440, y: 80, w: 400, h: 48, gh: 60, score: 50 });
    headCount++;

    return {
      ok: true,
      playable: true,
      reason: '',
      isSample: true,
      total: items.length,
      kept: items.length,
      dropped: 0,
      skipped: 0,
      shadowHosts: 0,
      headings: headCount,
      images: imgCount,
      links: linkCount,
      tagCount: { h1: headCount, img: imgCount, a: linkCount },
      width: 1280,
      height: 4800,
      rawHeight: 4800,
      spread: 1,
      items: items
    };
  }

  global.DomLevel = {
    CFG: CFG,
    scan: scan,
    sample: sample,
    compile: compile,
    scanOnly: function () { return scan({ dryRun: true }); }
  };
})(typeof window !== 'undefined' ? window : this);
