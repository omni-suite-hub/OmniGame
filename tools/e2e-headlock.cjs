/**
 * e2e-headlock.cjs — 《视差》真实浏览器端到端验证。
 *
 * 本作的核心是 Pointer Lock + 无光标导航，jsdom 完全无法验证：
 *   ① requestPointerLock 在真实点击下是否 resolve
 *   ② 锁定后 mousemove 的 movementX/Y 是否有效
 *   ③ 认知/真实坐标是否真的分离（漂移累积）
 *   ④ canvas 渲染 + 信标 DOM 定位
 *   ⑤ 降级路径（无锁定拖拽）
 *
 * 用法：node tools/e2e-headlock.cjs
 */
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = './';
const OUT = path.join(ROOT, 'deliverables', '06-original-shots');
const PORT = 8943;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/games/headlock/index.html';
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

  const list = await (await fetch(`${CDP}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) { console.log('❌ 无可用 Chrome 页面'); process.exit(1); }
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

  await S('Page.enable'); await S('Runtime.enable'); await S('Log.enable');

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

  const clickAt = async (x, y) => {
    await S('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };

  /** 移动鼠标（锁定后靠这个驱动 movementX/Y）。 */
  const moveMouse = async (x, y) => {
    await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await sleep(30);
  };

  // ── 1. 加载 ──
  await S('Emulation.setDeviceMetricsOverride', { width: 1000, height: 820, deviceScaleFactor: 2, mobile: false });
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/games/headlock/index.html` });
  await sleep(1300);

  check('游戏已启动', await evalJs('window.__omgBooted === true'));
  check('起始遮罩可见', await evalJs(
    `getComputedStyle(document.getElementById('ov-start')).display !== 'none'`));
  check('加载无 console 错误', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

  // ── 2. 真实点击"锁定光标开始" ──
  const btn = await evalJs(`(function(){
    var b=document.getElementById('btn-play').getBoundingClientRect();
    return {x:b.x+b.width/2, y:b.y+b.height/2};
  })()`);
  await clickAt(btn.x, btn.y);
  await sleep(900);

  const lock = await evalJs(`(function(){
    var S=__omgGame.S;
    return {locked:!!document.pointerLockElement, flag:S.locked, degraded:S.degraded,
            api:S.lockApi, running:S.running,
            hud:document.getElementById('lock-t').textContent,
            scopeOn:document.getElementById('scope').className,
            startHidden:getComputedStyle(document.getElementById('ov-start')).display==='none',
            rx:Math.round(S.rx), ry:Math.round(S.ry),
            originDist:Math.round(__omgGame.dist(0,0,S.rx,S.ry))};
  })()`);
  const gotLock = lock.locked;
  logs.push(`  ℹ️  Pointer Lock ${gotLock ? '成功' : '未生效（走降级）'} api=${lock.api}`);
  check('对局已开始', lock.running === true, JSON.stringify(lock));
  check('遮罩已关闭', lock.startHidden === true);
  check('出生点在核心区外', lock.originDist > 40, '距原点 ' + lock.originDist);
  if (gotLock) {
    check('HUD 显示已锁定', lock.hud.includes('已锁定'), lock.hud);
    check('取景器已显示', lock.scopeOn === 'on', lock.scopeOn);
    check('locked 标记为真', lock.flag === true);
  }

  // ── 3. 真实鼠标移动 → 认知/真实分离 ──
  const before = await evalJs(`(function(){var S=__omgGame.S;
    return {rx:S.rx,ry:S.ry,tx:S.tx,ty:S.ty,turn:S.turn,drift:S.drift};})()`);
  for (let i = 0; i < 12; i++) await moveMouse(300 + i * 20, 400 + i * 8);
  await sleep(200);
  const after = await evalJs(`(function(){var S=__omgGame.S;
    return {rx:Math.round(S.rx),ry:Math.round(S.ry),tx:Math.round(S.tx),ty:Math.round(S.ty),
            turn:S.turn,drift:Math.round(S.drift),
            thinkTxt:document.getElementById('b-think').textContent,
            realTxt:document.getElementById('b-real').textContent,
            errTxt:document.getElementById('b-err').textContent,
            turnTxt:document.getElementById('b-turn').textContent};})()`);

  check('鼠标移动驱动了回合', after.turn > before.turn, JSON.stringify({ before, after }));
  check('真实坐标已变化', after.rx !== Math.round(before.rx) || after.ry !== Math.round(before.ry),
    JSON.stringify(after));
  // 用字符类而非 \d —— 模板字符串里反斜杠会被多层转义吃掉
  const hasNum = (t) => /[0-9]/.test(String(t));
  check('HUD 三项数字已更新',
    after.thinkTxt.length > 0 && after.realTxt.length > 0 && hasNum(after.errTxt),
    JSON.stringify(after));
  check('认知与真实已分离（漂移 > 0）',
    after.drift > 0 && hasNum(after.errTxt), JSON.stringify(after));

  // ── 4. 拖拽分支（不依赖真实解锁） ──
  // ★ 无头 Chrome 里 pointerLockElement 不会真正释放（缺用户手势语义），
  //   所以这里不测"解锁后拖拽"，而是直接把内部标记切到降级态，
  //   验证 pointermove 分支确实能驱动游戏 —— 那才是需要覆盖的逻辑。
  const dragTest = await evalJs(`(function(){
    var G=__omgGame, S=G.S;
    S.locked = false;S.degraded = true;   // 切到降级态
    var before = S.turn;
    var el=document.getElementById('view');
    var r=el.getBoundingClientRect();
    var mk=function(t,x,y){ return new PointerEvent(t,{clientX:x,clientY:y,pointerId:1,
      bubbles:true,cancelable:true}); };
    el.dispatchEvent(mk('pointerdown', r.x+r.width/2, r.y+r.height/2));
    for(var i=1;i<=10;i++){
      el.dispatchEvent(mk('pointermove', r.x+r.width/2+i*14, r.y+r.height/2+i*6));
    }
    el.dispatchEvent(mk('pointerup', r.x+r.width/2+140, r.y+r.height/2+60));
    return {before:before, after:S.turn, locked:S.locked, degraded:S.degraded,
            drift:Math.round(S.drift)};
  })()`);
  check('降级态：pointermove 分支驱动移动',
    dragTest.after > dragTest.before && dragTest.locked === false, JSON.stringify(dragTest));
  check('降级态：漂移仍在累积', dragTest.drift > 0, JSON.stringify(dragTest));

  // ── 5. 显式降级模式入口 ──
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/games/headlock/index.html` });
  await sleep(1000);
  const fbBtn = await evalJs(`(function(){
    var b=document.getElementById('btn-fallback').getBoundingClientRect();
    return {x:b.x+b.width/2, y:b.y+b.height/2};
  })()`);
  await clickAt(fbBtn.x, fbBtn.y);
  await sleep(600);
  const fb = await evalJs(`(function(){var S=__omgGame.S;
    return {locked:S.locked, degraded:S.degraded, running:S.running,
            hud:document.getElementById('lock-t').textContent};})()`);
  check('降级入口：locked=false', fb.locked === false, JSON.stringify(fb));
  check('降级入口：degraded=true', fb.degraded === true, JSON.stringify(fb));
  check('降级入口：HUD 明示降级', fb.hud.includes('降级'), fb.hud);
  check('降级入口：游戏可玩', fb.running === true, JSON.stringify(fb));

  // ── 6. 强制完成一局 → 结算 ──
  await evalJs(`(function(){
    var S=__omgGame.S;
    // 直接把真实坐标挪到核心内，再走一步触发判胜
    S.rx=10; S.ry=0; S.tx=10; S.ty=0; S.turn=20; S.found=3;
    __omgGame.applyMove(1,0);
    return 1;
  })()`);
  await sleep(400);
  const over = await evalJs(`(function(){
    return {over:__omgGame.S.over, running:__omgGame.S.running,
            grade:document.getElementById('o-grade').textContent,
            score:document.getElementById('o-score').textContent,
            turn:document.getElementById('o-turn').textContent,
            err:document.getElementById('o-err').textContent,
            marks:document.getElementById('o-marks').textContent,
            mode:document.getElementById('o-mode').textContent,
            panel:getComputedStyle(document.getElementById('ov-over')).display!=='none'};
  })()`);
  check('抵达核心后对局结束', over.over === true && over.running === false, JSON.stringify(over));
  check('结算面板弹出', over.panel === true);
  check('评级已生成', /^[SABCD]$/.test(over.grade), over.grade);
  check('得分为数字', /^[0-9]+$/.test(over.score), over.score);
  check('输入模式如实标注', /锁定|降级/.test(over.mode), over.mode);
  check('偏差已统计', /[0-9]/.test(over.err), over.err);

  fs.mkdirSync(OUT, { recursive: true });
  async function shot(name) {
    const { data } = await S('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
  }
  await shot('headlock-over.png');

  // ── 7. 对局中截图 ──
  await evalJs(`(function(){
    document.getElementById('ov-over').style.display='none';
    __omgGame.reset(); __omgGame.S.running=true;
    return 1;
  })()`);
  await sleep(300);
  // 走一段产生漂移
  await evalJs(`(function(){
    var G=__omgGame;
    for(var i=0;i<26;i++) G.applyMove(14, 7);
    return 1;
  })()`);
  await sleep(300);
  const play = await evalJs(`(function(){
    var S=__omgGame.S;
    return {turn:S.turn, drift:Math.round(S.drift), found:S.found,
            beacons:document.querySelectorAll('.beacon').length,
            driftOpacity:document.getElementById('drift').style.opacity};
  })()`);
  check('对局中：漂移已累积', play.drift > 0, JSON.stringify(play));
  check('对局中：信标 DOM 已渲染', play.beacons > 0, JSON.stringify(play));

  // ★ 回归：canvas 未按 dpr 缩放坐标系时，画面只画在左上角 1/dpr² 区域。
  //   判据：核心（原点）投影必须落在画布中心附近，而不是左上角。
  const center = await evalJs(`(function(){
    var cv=document.getElementById('cv');
    var g=__omgGame.S;
    var cw=cv.clientWidth, ch=cv.clientHeight;
    var vR=Math.min(cw,ch)*0.46, scale=vR/__omgGame.RANGE;
    // 原点投影：cx + (0 - rx)*scale
    var ox = cw/2 + (0-g.rx)*scale;
    var oy = ch/2 + (0-g.ry)*scale;
    return {cw:cw, ch:ch, ox:Math.round(ox), oy:Math.round(oy),
            ccx:Math.round(cw/2), ccy:Math.round(ch/2),
            inView: ox>=0&&ox<=cw&&oy>=0&&oy<=ch};
  })()`);
  check('原点投影在画布内（非左上角）',
    center.inView === true, JSON.stringify(center));

  // canvas 已绘制：统计非背景像素
  const painted = await evalJs(`(function(){
    var cv=document.getElementById('cv');
    var c=cv.getContext('2d');
    var d=c.getImageData(0,0,cv.width,cv.height).data;
    // 只看中心区域：若未按 dpr 缩放，这里会是空白
    var x0=Math.floor(cv.width*0.35), x1=Math.floor(cv.width*0.65);
    var y0=Math.floor(cv.height*0.35), y1=Math.floor(cv.height*0.65);
    var lit=0,total=0;
    for(var y=y0;y<y1;y+=2){
      for(var x=x0;x<x1;x+=2){
        var i=(y*cv.width+x)*4;
        if(d[i]+d[i+1]+d[i+2] > 60) lit++;
        total++;
      }
    }
    return {lit:lit, total:total, ratio:+(lit/total).toFixed(4)};
  })()`);
  check('画布中心区域已绘制（dpr 变换生效）',
    painted.lit > 0, JSON.stringify(painted));
  await shot('headlock-play.png');

  // ── 8. 起始页 ──
  await evalJs(`(function(){
    __omgGame.S.running=false; __omgGame.S.over=false;
    document.getElementById('ov-over').style.display='none';
    document.getElementById('ov-start').style.display='';
    return 1;
  })()`);
  await sleep(250);
  await shot('headlock-start.png');

  // ── 9. 移动端回归 ──
  await S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await sleep(350);
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/games/headlock/index.html` });
  await sleep(1200);
  const mob = await evalJs(`(function(){
    return {
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      iw: window.innerWidth,
      btnH: document.getElementById('btn-play').getBoundingClientRect().height,
      fbH: document.getElementById('btn-fallback').getBoundingClientRect().height,
      startVisible: getComputedStyle(document.getElementById('ov-start')).display!=='none'
    };
  })()`);
  check('390px 无横向溢出', !mob.overflow, JSON.stringify(mob));
  check('390px 起始页正常', mob.startVisible === true);
  check('390px 两个按钮均 ≥ 44px', mob.btnH >= 44 && mob.fbH >= 44, JSON.stringify(mob));
  await shot('headlock-mobile.png');

  check('全程无 console 错误', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  console.log('\n=== 《视差》真实浏览器 E2E ===\n');
  console.log(logs.join('\n'));
  console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 存在失败'}  ${pass} 通过 / ${fail} 失败\n`);

  await send('Target.closeTarget', { targetId });
  srv.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('E2E 崩溃:', e.message); process.exit(1); });