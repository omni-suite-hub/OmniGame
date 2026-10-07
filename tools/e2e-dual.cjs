/**
 * e2e-dual.cjs — 《对折》真实浏览器端到端验证。
 *
 * jsdom 层已过 57 项，但有三类缺陷它测不出来：
 *   ① canvas 实际渲染（棋盘线、子、幽灵子是否画对）
 *   ② 真实点击 → hitAt 坐标映射（画布尺寸 vs CSS 尺寸）
 *   ③ 延迟揭示的真实时序（setTimeout/rAF 链）
 *
 * 用法：node tools/e2e-dual.cjs
 */
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = './';
const OUT = path.join(ROOT, 'deliverables', '06-original-shots');
const PORT = 8931;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/games/dual/index.html';
      // 浏览器会自动请求 favicon，返回 204 避免污染 console 错误断言
      if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404); res.end('404'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      res.end(fs.readFileSync(f));
    });
    srv.listen(PORT, () => resolve(srv));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const logs = [];
function check(name, cond, detail) {
  if (cond) { pass++; logs.push(`  ✅ ${name}`); }
  else { fail++; logs.push(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
  return !!cond;
}

(async () => {
  const srv = await serve();
  const CDP = 'http://127.0.0.1:9222';
  let ws, msgId = 0;
  const pending = new Map();

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

  // 连已有 Chrome
  const list = await (await fetch(`${CDP}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) { console.log('❌ 无可用 Chrome 页面标签'); process.exit(1); }
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  };

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);

  await S('Page.enable');
  await S('Runtime.enable');
  await S('Log.enable');

  const consoleErrors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      consoleErrors.push(m.params.entry.text);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(m.params.exceptionDetails.text + ' ' +
        (m.params.exceptionDetails.exception?.description || ''));
    }
  });

  const evalJs = async (expr) => {
    const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' +
      (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  };

  // ── 1. 加载页面 ──
  await S('Emulation.setDeviceMetricsOverride', {
    width: 900, height: 780, deviceScaleFactor: 2, mobile: false,
  });
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/games/dual/index.html` });
  await sleep(1400);

  check('页面加载无 console 错误（初始）', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  check('游戏已启动', await evalJs('window.__omgBooted === true'));
  check('双canvas 存在', await evalJs(`document.querySelectorAll('canvas').length === 2`));

  const dims = await evalJs(`(function(){
    var a=document.getElementById('cv-me'), b=document.getElementById('cv-foe');
    return {aw:a.clientWidth,ah:a.clientHeight,bw:b.clientWidth,bh:b.clientHeight,
            ar:a.width,br:b.width};
  })()`);
  check('画布已按容器尺寸分配位图', dims.ar > 0 && dims.br > 0 && dims.aw > 100,
    JSON.stringify(dims));

  // 起始遮罩可见
  check('起始遮罩可见', await evalJs(`(function(){
    var o=document.getElementById('ov-start');
    return o && getComputedStyle(o).display !== 'none';
  })()`));

  // ── 2. 真实点击"与 AI 对弈" ──
  const box = await evalJs(`(function(){
    var b=document.getElementById('btn-ai').getBoundingClientRect();
    return {x:b.x+b.width/2, y:b.y+b.height/2};
  })()`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await S('Input.dispatchMouseEvent', {
      type, x: box.x, y: box.y, button: 'left', clickCount: 1,
    });
  }
  await sleep(300);
  check('点击后遮罩消失', await evalJs(`(function(){
    var o=document.getElementById('ov-start');
    return getComputedStyle(o).display === 'none';
  })()`));
  check('对局已开始', await evalJs(`__omgGame.S.running === true`));

  // ── 3. 真实点击棋盘落子 ──
  async function clickCell(cx, cy, which) {
    const geo = await evalJs(`(function(){
      var cv=document.getElementById('${which === 'foe' ? 'cv-foe' : 'cv-me'}');
      var r=cv.getBoundingClientRect();
      var side=Math.min(r.width,r.height);
      var pad=Math.max(11, side*0.06);
      var step=(side-pad*2)/14;
      var ox=(r.width-side)/2, oy=(r.height-side)/2;
      return {r:{x:r.x,y:r.y}, pad:pad, step:step, ox:ox, oy:oy};
    })()`);
    const px = geo.r.x + geo.ox + geo.pad + cx * geo.step;
    const py = geo.r.y + geo.oy + geo.pad + cy * geo.step;
    for (const type of ['mousePressed', 'mouseReleased']) {
      await S('Input.dispatchMouseEvent', { type, x: px, y: py, button: 'left', clickCount: 1 });
    }
    await sleep(60);
  }

  await clickCell(7, 7, 'me');
  await sleep(120);
  const afterFirst = await evalJs(`(function(){
    var S=__omgGame.S;
    return {me:S.board[7*15+7], hist:S.history.length,
            foeExists:S.history.some(function(h){return h.p===2;}),
            dead7x7:S.dead[7*15+7], round:S.round};
  })()`);
  check('真实点击 → 我的子落在 (7,7)', afterFirst.me === 1, JSON.stringify(afterFirst));

  // 首手点中心是"同格冲突"的极端情况：AI 空盘必下中心。
  // 无论冲突与否，都必须满足：对手这一回合确实出手了（要么入局，要么碎给我看）
  if (afterFirst.dead7x7) {
    check('同格冲突：对手手被标记碎裂', afterFirst.dead7x7 === 1);
    check('同格冲突：碎裂进入揭示队列（延迟可见）', await evalJs(
      `__omgGame.S.q.some(function(q){return q.dead && q.x===7 && q.y===7;})`));
  } else {
    check('无冲突：对手手正常入局', afterFirst.foeExists === true, JSON.stringify(afterFirst));
    check('无冲突：同一回合双方各一手', afterFirst.hist === 2, String(afterFirst.hist));
  }

  // 换个空手位，验证正常同回合双落
  await sleep(420);
  const before2 = await evalJs(`__omgGame.S.history.length`);
  await clickCell(3, 11, 'me');
  await sleep(120);
  const afterSecond = await evalJs(`(function(){
    var S=__omgGame.S;
    var mine=0, foe=0;
    S.history.forEach(function(h){ if(h.p===1) mine++; else foe++; });
    return {hist:S.history.length, mineCount:mine, foeCount:foe,
            mineAt311:S.board[11*15+3]};
  })()`);
  check('任意手位：一回合内双方各落一手',
    afterSecond.hist === before2 + 2 &&
    afterSecond.mineCount === 2 &&           // 首手 + 本手
    afterSecond.foeCount === 1 &&            // 首手碎裂不入 history，只有本手对手入局
    afterSecond.mineAt311 === 1,
    JSON.stringify({ before2, afterSecond }));

  // ── 4. 延迟揭示的真实时序 ──
  const timing = await evalJs(`(function(){
    var S=__omgGame.S;
    var lastMine=null, lastFoe=null;
    for(var i=S.history.length-1;i>=0;i--){
      if(S.history[i].p===1){ if(!lastMine) lastMine=S.history[i]; }
      else { if(!lastFoe) lastFoe=S.history[i]; }
    }
    return {
      meIdx: lastMine?lastMine.idx:null,
      foeIdx: lastFoe?lastFoe.idx:null,
      meRevealedToFoe: lastMine? !!S.shownMe[lastMine.idx] : null,
      foeRevealedToMe: lastFoe? !!S.shownFoe[lastFoe.idx] : null,
      pendingFoe: S.q.filter(function(q){return q.p===2 && !q.dead;}).length
    };
  })()`);
  check('最新一手双方都处于未揭示状态',
    timing.meRevealedToFoe === false && timing.foeRevealedToMe === false,
    JSON.stringify(timing));

  await sleep(1400);
  const after = await evalJs(`(function(){
    var S=__omgGame.S;
    var lastMine=null, lastFoe=null;
    for(var i=S.history.length-1;i>=0;i--){
      if(S.history[i].p===1){ if(!lastMine) lastMine=S.history[i]; }
      else { if(!lastFoe) lastFoe=S.history[i]; }
    }
    return {
      meRevealedToFoe: lastMine? !!S.shownMe[lastMine.idx] : null,
      foeRevealedToMe: lastFoe? !!S.shownFoe[lastFoe.idx] : null,
      pendingFoe: S.q.filter(function(q){return q.p===2 && !q.dead;}).length
    };
  })()`);
  check('延迟到期后双方手均被揭示',
    after.meRevealedToFoe === true && after.foeRevealedToMe === true && after.pendingFoe === 0,
    JSON.stringify(after));

  // ── 5. canvas 真的画了东西（非纯色） ──
  // 判据：统计"棋子色"像素占比。左右棋盘在已揭示若干手后都必须出现棋子，
  // 否则说明渲染层把子吞了（纯色板 = 只有背景和网格线）。
  async function stoneRatio(id) {
    return evalJs(`(function(){
      var cv=document.getElementById('${id}');
      var c=cv.getContext('2d');
      var d=c.getImageData(0,0,cv.width,cv.height).data;
      var stone=0, total=0, bright=0, distinct={};
      for(var i=0;i<d.length;i+=4){
        var r=d[i],g=d[i+1],b=d[i+2];
        total++;
        // 棋子是带饱和度的亮色（酸绿 #d8ff3e 系 / 蓝紫 #7c8cf8 系）
        var mx=Math.max(r,g,b), mn=Math.min(r,g,b);
        if(mx>70 && (mx-mn)>18) stone++;
        if(r+g+b>150) bright++;
        if((i%(4*97))===0){ distinct[r+','+g+','+b]=1; }
      }
      return {stone:stone, total:total, bright:bright, distinct:Object.keys(distinct).length};
    })()`);
  }
  const painted = { me: await stoneRatio('cv-me'), foe: await stoneRatio('cv-foe') };

  // 棋盘必须撑满容器短边 —— 否则会出现"邮票大小的棋盘 + 大片空白"（真实视觉缺陷）
  const fill = await evalJs(`(function(){
    function m(id){
      var cv=document.getElementById(id);
      var r=cv.getBoundingClientRect();
      var side=Math.min(r.width,r.height);
      var pad=Math.max(11, side*0.06);
      return {cw:Math.round(r.width), ch:Math.round(r.height),
              play:Math.round(side-pad*2),
              ratio:+((side-pad*2)/side).toFixed(3)};
    }
    return {me:m('cv-me'), foe:m('cv-foe')};
  })()`);
  check('棋盘格线区占容器短边 ≥ 85%', fill.me.ratio >= 0.85 && fill.foe.ratio >= 0.85,
    JSON.stringify(fill));
  check('左右棋盘尺寸一致（对称）', Math.abs(fill.me.play - fill.foe.play) <= 2,
    JSON.stringify(fill));

  // 揭示时间线：延迟机制的显式可视化，且不得泄露对手坐标
  const tl = await evalJs(`(function(){
    var tr=document.getElementById('tl-track');
    return {
      exists: !!tr,
      items: tr ? tr.querySelectorAll('.tlq').length : 0,
      hasCoords: tr ? /\\d+,\\d+/.test(tr.textContent) : false,
      legend: document.querySelectorAll('.tl-legend .sw').length
    };
  })()`);
  check('揭示时间线已渲染条目', tl.exists && tl.items > 0, JSON.stringify(tl));
  check('时间线不泄露对手坐标', tl.hasCoords === false, JSON.stringify(tl));
  check('时间线图例完整（3 类）', tl.legend === 3, JSON.stringify(tl));

  // 侧栏状态条：把信息差量化成数字
  const stat = await evalJs(`(function(){
    function g(id){var e=document.getElementById(id);return e?e.textContent.trim():null;}
    return {meN:g('st-me-n'), meR:g('st-me-r'), meU:g('st-me-u'),
            foeN:g('st-foe-n'), foeR:g('st-foe-r'), foeU:g('st-foe-u'),
            cells:document.querySelectorAll('.stat .s').length};
  })()`);
  check('状态条已渲染（每侧 3 项）', stat.cells === 6, JSON.stringify(stat));
  check('状态条数字均为整数',
    [stat.meN, stat.meR, stat.meU, stat.foeN, stat.foeR, stat.foeU]
      .every(v => /^\d+$/.test(v)), JSON.stringify(stat));
  check('已揭示 + 未揭示 = 总手数',
    (+stat.meR + +stat.meU === +stat.meN) && (+stat.foeR + +stat.foeU === +stat.foeN),
    JSON.stringify(stat));
  // 子数不多时像素量有限，阈值按"至少有棋子被画出"设定（约 1 颗子=260px @2x）
  check('左棋盘已绘制棋子像素', painted.me.stone > 250, JSON.stringify(painted.me));
  check('右棋盘已绘制棋子像素', painted.foe.stone > 250, JSON.stringify(painted.foe));

  // ── 6. 连续落子 12 手，验证对局推进 + 延迟升档 ──
  // 刻意避开中心带，防止 AI 在这12 手内连成五提前结束对局
  const spread = [[0, 0], [14, 14], [0, 14], [14, 0], [2, 12], [12, 2],
                  [1, 1], [13, 13], [3, 11], [11, 3], [0, 7], [14, 7]];
  for (const [x, y] of spread) {
    const st = await evalJs(`__omgGame.S.over`);
    if (st) break;
    await clickCell(x, y, 'me');
    await sleep(90);
  }
  await sleep(400);
  const mid = await evalJs(`(function(){
    var S=__omgGame.S;
    return {hist:S.history.length, lag:S.lagLevel, running:S.running, over:S.over,
            lagText:document.getElementById('lag-v').textContent};
  })()`);
  check('连续落子推进到 10+ 手', mid.hist >= 10, JSON.stringify(mid));
  check('延迟档位随手数上升', mid.lag >= 1, JSON.stringify(mid));
  check('HUD 延迟文案与内部一致', mid.lagText === (mid.lag === 0 ? '300ms' : mid.lag === 1 ? '600ms' : '1200ms'),
    JSON.stringify(mid));

  // ── 7. 悔棋（U 键） ──
  // 必须先关掉可能弹出的结算遮罩 —— 它盖住 canvas，点击会被吞掉。
  // （这是测试环境的清理，不是游戏缺陷：正常流程下遮罩弹出时对局确实已结束）
  await evalJs(`(function(){
    var G=__omgGame;
    document.getElementById('ov-over').style.display='none';
    document.getElementById('ov-start').style.display='none';
    G.stopLoop(); G.reset(); G.S.running=true; G.stageFoe(); G.kick();
    return true;
  })()`);
  await sleep(250);
  for (const [x, y] of [[7, 7], [6, 8], [8, 6]]) {
    await clickCell(x, y, 'me');
    await sleep(160);
  }
  await sleep(300);
  const beforeUndo = await evalJs(`__omgGame.S.history.length`);
  const aliveBefore = await evalJs(`__omgGame.S.over === false`);
  check('悔棋测试前置：对局进行中', aliveBefore === true, 'beforeUndo=' + beforeUndo);

  if (aliveBefore) {
    await S('Input.dispatchKeyEvent', { type: 'keyDown', key: 'u', code: 'KeyU', windowsVirtualKeyCode: 85 });
    await S('Input.dispatchKeyEvent', { type: 'keyUp', key: 'u', code: 'KeyU', windowsVirtualKeyCode: 85 });
    await sleep(200);
  }
  const afterUndo = await evalJs(`(function(){
    var S=__omgGame.S;
    return {hist:S.history.length, undos:S.undos, stillRunning:S.running};
  })()`);
  check('U 键悔棋退回两手',
    afterUndo.hist === beforeUndo - 2 && afterUndo.undos === 1,
    JSON.stringify({ beforeUndo, afterUndo }));
  check('悔棋后对局继续', afterUndo.stillRunning === true);

  // ── 8. 结算路径：真实开局 → 我方连成五连 ──
  await evalJs(`(function(){
    var G=__omgGame;
    document.getElementById('ov-over').style.display='none';
    G.stopLoop(); G.reset(); G.S.running=true; G.stageFoe(); G.kick();
    return true;
  })()`);
  await sleep(200);
  // 我方四子先行，横向排在第 4 行：idx(x,4) = 4*15 + x = 60+x
  // ⚠ 对手承诺点必须避开门线，否则对手会在 (8,4) 抢先。
  // 直接写 board/shownMe 而不走 commit —— commit 会排入延迟队列，
  // 在这里徒增时序变量。落子本身仍走真实点击。
  const setup = await evalJs(`(function(){
    var S=__omgGame.S;
    [4,5,6,7].forEach(function(x){
      var i = 4*15 + x;          // idx(x, 4) —— 第 4 行
      S.board[i]=1;
      S.shownMe[i]=1;
      S.history.push({idx:i, p:1, lag:0});
    });
    S.stagedFoe = {x:13, y:1};   // 对手承诺点远离门线
    return {hist:S.history.length, pending:S.pendingEnd, over:S.over,
            row4:[S.board[4*15+4],S.board[4*15+5],S.board[4*15+6],S.board[4*15+7]],
            winNow: __omgGame.winAt(S.board, 4*15+5, 1).win};
  })()`);
  check('结算场景搭建完成（我方四子横向就位）',
    setup.hist === 4 && setup.pending === 0 && setup.over === false &&
    setup.row4.join() === '1,1,1,1' && setup.winNow === false,
    JSON.stringify(setup));
  await sleep(200);
  await clickCell(8, 4, 'me');   // 真实点击完成第五子（横向 4..8）
  await sleep(900);
  const diag = await evalJs(`(function(){
    var S=__omgGame.S;
    return {hist:S.history.length, pending:S.pendingEnd, over:S.over, running:S.running,
            qLen:S.q.length, winLine: S.winLine ? S.winLine.length : 0,
            boardAt84: S.board[4*15+8],
            lastFive: S.history.slice(-3).map(function(h){return h.p+'@'+(h.idx%15)+','+Math.floor(h.idx/15)}),
            types: S.history.map(function(h){return h.p})};
  })()`);
  const over = await evalJs(`(function(){
    return {over:__omgGame.S.over, running:__omgGame.S.running,
            grade:document.getElementById('o-grade').textContent,
            score:document.getElementById('o-score').textContent,
            moves:document.getElementById('o-moves').textContent,
            panelVisible:getComputedStyle(document.getElementById('ov-over')).display!=='none'};
  })()`);
  check('五连被正确识别（pendingEnd=1）', diag.pending === 1, JSON.stringify(diag));
  check('我方五连后对局结束', over.over === true && over.running === false,
    JSON.stringify({ diag, over }));
  check('结算面板弹出', over.panelVisible === true);
  check('评级已生成（S/A/B/C/D）', /^[SABCD]$/.test(over.grade), over.grade);
  check('得分已生成（数字）', /^\d+$/.test(over.score), over.score);
  check('手数已统计', /^\d+$/.test(over.moves) && +over.moves > 0, over.moves);

  // ── 9. 截图：开局 / 对局中 / 结算 ──
  fs.mkdirSync(OUT, { recursive: true });

  // 结算态截图
  async function shot(name) {
    const { data } = await S('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
  }
  await shot('dual-over.png');

  // 重开一局打几个子 → 对局中截图
  // 必须显式关掉结算遮罩：reset() 只重置对局状态，不动 DOM 遮罩
  await evalJs(`(function(){
    var G=__omgGame;
    document.getElementById('ov-over').style.display='none';
    document.getElementById('ov-start').style.display='none';
    G.stopLoop(); G.reset(); G.S.running=true; G.kick(); G.stageFoe();
    return true;
  })()`);
  await sleep(250);
  for (const [x, y] of [[7, 7], [6, 8], [8, 6], [5, 5], [9, 9], [4, 7]]) {
    await clickCell(x, y, 'me');
    await sleep(170);
  }
  await sleep(120);
  await shot('dual-play.png');

  // 幽灵子特写：立刻在延迟窗口内截图，此时对手那手还画成半透明虚线环
  await evalJs(`(function(){ var G=__omgGame; G.stopLoop(); G.reset(); G.S.running=true; G.stageFoe(); G.kick(); return true; })()`);
  await sleep(200);
  for (const [x, y] of [[7, 7], [6, 8], [8, 6]]) {
    await clickCell(x, y, 'me');
    await sleep(110);
  }
  await sleep(90);
  await shot('dual-ghost.png');

  // 起始页截图
  await evalJs(`(function(){
    __omgGame.S.running=false;
    document.getElementById('ov-over').style.display='none';
    document.getElementById('ov-start').style.display='';
    return true;
  })()`);
  await sleep(250);
  await shot('dual-start.png');

  // ── 10. 移动端视口回归 ──
  await S('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
  });
  await sleep(400);
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/games/dual/index.html` });
  await sleep(1200);
  const mob = await evalJs(`(function(){
    return {
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      sw: document.documentElement.scrollWidth, iw: window.innerWidth,
      cvW: document.getElementById('cv-me').clientWidth,
      cvH: document.getElementById('cv-me').clientHeight,
      foeTop: document.getElementById('cv-foe').getBoundingClientRect().top,
      meTop: document.getElementById('cv-me').getBoundingClientRect().top,
      startVisible: getComputedStyle(document.getElementById('ov-start')).display!=='none',
      btnH: document.getElementById('btn-ai').getBoundingClientRect().height
    };
  })()`);
  mob.stacked = mob.foeTop > mob.meTop;
  check('390px 无横向溢出', !mob.overflow, JSON.stringify(mob));
  // 窄屏改为上下堆叠，棋盘宽度应接近可用宽度（≥ 视口的 82%）
  check('390px 棋盘撑满可用宽度', mob.cvW >= mob.iw * 0.82, JSON.stringify(mob));
  check('390px 两视窗上下堆叠', mob.stacked === true, JSON.stringify(mob));
  check('390px 起始页正常', mob.startVisible === true);
  check('390px 按钮高度 ≥ 44px（触控目标）', mob.btnH >= 44, '实际 ' + mob.btnH);
  await shot('dual-mobile.png');

  // ── 11. 全程 console 检查 ──
  check('全程无 console 错误', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  console.log('\n=== 《对折》真实浏览器 E2E ===\n');
  console.log(logs.join('\n'));
  console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 存在失败'}  ${pass} 通过 / ${fail} 失败\n`);

  await send('Target.closeTarget', { targetId });
  srv.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('E2E 崩溃:', e.message); process.exit(1); });