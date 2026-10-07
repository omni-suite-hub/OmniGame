/**
 * e2e-keylayout.cjs — 《键位》真实浏览器端到端验证。
 *
 * 本游戏的判定核心是 event.code（物理键位），jsdom 完全无法验证：
 *   ① getLayoutMap() 必须真实用户手势才resolve —— CDP 合成事件算不算手势？
 *   ② 真实键盘事件的 e.code 在真实布局下是什么？
 *   ③ 序列渲染 / 键帽显示 / 错位表内容
 *   ④ 判定循环能否一路走到结算
 *
 * 用法：node tools/e2e-keylayout.cjs
 */
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = './';
const OUT = path.join(ROOT, 'deliverables', '06-original-shots');
const PORT = 8941;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/games/keylayout/index.html';
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

  // ── 1. 加载 ──
  await S('Emulation.setDeviceMetricsOverride', { width: 900, height: 800, deviceScaleFactor: 2, mobile: false });
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/games/keylayout/index.html` });
  await sleep(1300);

  check('游戏已启动', await evalJs('window.__omgBooted === true'));
  check('起始遮罩可见', await evalJs(
    `getComputedStyle(document.getElementById('ov-start')).display !== 'none'`));
  check('加载无 console 错误', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

  // ── 2. 真实点击"开始"（用户手势）→ getLayoutMap 应 resolve ──
  const btn = await evalJs(`(function(){
    var b=document.getElementById('btn-start').getBoundingClientRect();
    return {x:b.x+b.width/2, y:b.y+b.height/2};
  })()`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await S('Input.dispatchMouseEvent', { type, x: btn.x, y: btn.y, button: 'left', clickCount: 1 });
  }
  await sleep(900);

  const lay = await evalJs(`(function(){
    var S=__omgGame.S;
    return {ready:S.layoutReady, size:S.layoutSize,
            skew:__omgGame.skewCount(S.skew),
            hudText:document.getElementById('lay-t').textContent,
            seqLen:S.seq.length, running:S.running};
  })()`);
  // Chrome 支持 getLayoutMap → 应resolve。CDP 合成点击是否算用户手势，
  // 若不算则走降级（这也是合法结果，但要如实区分）
  const layoutWorked = lay.ready === true;
  logs.push(`  ℹ️  getLayoutMap 在 CDP 合成点击下${layoutWorked ? '成功' : '未 resolve（降级路径亦被验证）'}` +
    ` size=${lay.size} skew=${lay.skew}`);
  check('布局状态自洽（ready 与 hud 一致）',
    layoutWorked ? (lay.hudText.includes('错位') || lay.hudText.includes('标准'))
                 : lay.hudText.includes('不可用'),
    JSON.stringify(lay));
  check('序列已生成', lay.seqLen === 28, JSON.stringify(lay));
  check('对局已开始', lay.running === true);

  // ── 3. 错位表内容 ──
  const map = await evalJs(`(function(){
    var t=document.getElementById('maptable');
    var tags=0, span=t.querySelectorAll('.mrow .t');
    for(var i=0;i<span.length;i++){ tags++; }
    return {rows:t.querySelectorAll('.mrow').length, tags:tags,
            none:!!t.querySelector('.none'),
            hdline:!!t.querySelector('.hdline'),
            count:document.getElementById('shift-count').textContent,
            htmlLen:t.innerHTML.length};
  })()`);
  check('错位表已渲染', map.rows > 0 || map.none === true, JSON.stringify(map));
  // 键帽对 QWERTY 用户也必须有信息：显示同一物理键位在各布局下的输出
  const capInfo = await evalJs(`(function(){
    var g=document.getElementById('cap2-glyph');
    var big=document.getElementById('cap-glyph');
    return {wide:g?g.textContent.trim():'', big:big?big.textContent.trim():''};
  })()`);
  check('键帽显示多布局对照（QWERTY 也可见）',
    /QW\s/.test(capInfo.wide) && /AZ\s/.test(capInfo.wide), JSON.stringify(capInfo));
  check('对照含四个布局标签',
    ['QW','AZ','DV','CM'].every(t => new RegExp(t + '\\s').test(capInfo.wide)),
    capInfo.wide.replace(/\n/g,'|'));
  if (layoutWorked) {
    // QWERTY 零错位时不显示空表，而是展示"换个系统会怎样"——
    // 空表对玩家零信息价值，而多布局对照是这个游戏要讲的核心事实
    check('QWERTY 零错位 → 展示多布局对照（而非空表）',
      map.none === false && map.rows > 0, JSON.stringify(map));
    check('对照行含四种布局标签', map.tags >= 4, JSON.stringify(map));
  } else {
    check('降级时错位表给出说明而非空白', map.none === true, JSON.stringify(map));
  }

  // ── 4. 真实按键 → 判定 ──
  // 用真实的 key/code 对（Windows 虚拟键码），而不是只发 code
  const seq0 = await evalJs(`(function(){
    var S=__omgGame.S;
    return {code:S.seq[0].code, char:S.seq[0].char, skewed:S.seq[0].skewed,
            pos:S.pos, hit:S.hit, miss:S.miss};
  })()`);
  check('首题有有效键位与字符', !!seq0.code && !!seq0.char, JSON.stringify(seq0));

  /** 发一次真实按键（code + key + windowsVirtualKeyCode）。 */
  async function pressKey(code, key, vk) {
    const base = { code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await S('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
    await S('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(45);
  }
  // 字母 A-Z 映射到 KeyCode / 虚拟键码
  const VK = { a: 65, w: 87, e: 69, r: 82, t: 84, y: 89, u: 85, i: 73, o: 79, p: 80,
               s: 83, d: 68, f: 70, g: 71, h: 72, j: 74, k: 75, l: 76,
               z: 90, x: 88, c: 67, v: 86, b: 66, n: 78, m: 77,
               '0': 48, '1': 49, '2': 50, '3': 51, '4': 52,
               '5': 53, '6': 54, '7': 55, '8': 56, '9': 57 };
  const pressForCode = async (code) => {
    const ch = code.replace(/^(Key|Digit)/, '').toLowerCase();
    await pressKey(code, ch, VK[ch] || 0);
  };

  // 按正确的键 → 应命中
  await pressForCode(seq0.code);
  const afterHit = await evalJs(`(function(){
    var S=__omgGame.S;return {pos:S.pos,hit:S.hit,miss:S.miss,skew:S.shiftHit};
  })()`);
  check('真实按键 → 正确键位命中',
    afterHit.pos === seq0.pos + 1 && afterHit.hit === 1 && afterHit.miss === 0,
    JSON.stringify({ seq0, afterHit }));

  // 按一个错误键 → 应记失误且不推进
  const seq1 = await evalJs(`__omgGame.S.seq[__omgGame.S.pos].code`);
  const wrongCode = seq1 === 'KeyQ' ? 'KeyP' : 'KeyQ';
  await pressForCode(wrongCode);
  const afterMiss = await evalJs(`(function(){
    var S=__omgGame.S;return {pos:S.pos,hit:S.hit,miss:S.miss};
  })()`);
  check('错误键位 → 记失误且不推进',
    afterMiss.pos === afterHit.pos && afterMiss.miss === 1,
    JSON.stringify({ afterHit, afterMiss }));

  // ── 5. 修饰键不参与判定 ──
  await S('Input.dispatchKeyEvent', { type: 'keyDown', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16 });
  await S('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16 });
  await sleep(60);
  check('修饰键不计入失误',
    await evalJs(`__omgGame.S.miss`) === afterMiss.miss, 'miss 应保持不变');

  // ── 6. 跑完整局：全部按正确键 ──
  await evalJs(`(function(){ __omgGame.S.miss=0; return 1; })()`);
  let guard = 0;
  while (guard++ < 80) {
    const st = await evalJs(`(function(){
      var S=__omgGame.S;
      return {over:S.over, pos:S.pos, len:S.seq.length,
              code:S.pos<S.seq.length?S.seq[S.pos].code:null};
    })()`);
    if (st.over || !st.code) break;
    await pressForCode(st.code);
  }
  await sleep(400);
  const done = await evalJs(`(function(){
    var S=__omgGame.S;
    return {over:S.over, pos:S.pos, len:S.seq.length, hit:S.hit, miss:S.miss,
            elapsed:Math.round(S.elapsed),
            grade:document.getElementById('o-grade').textContent,
            score:document.getElementById('o-score').textContent,
            acc:document.getElementById('o-acc').textContent,
            skew:document.getElementById('o-skew').textContent,
            panel:getComputedStyle(document.getElementById('ov-over')).display!=='none'};
  })()`);
  check('全对通关 → 序列走完', done.pos === done.len && done.over === true, JSON.stringify(done));
  check('命中率100%', done.acc === '100%', JSON.stringify(done));
  check('结算面板弹出', done.panel === true);
  check('评级已生成', /^[SABCD]$/.test(done.grade), done.grade);
  check('得分为数字', /^\d+$/.test(done.score), done.score);
  check('错位数与 HUD 一致', done.skew === String(lay.skew) || done.skew === '不可用',
    `结算=${done.skew} HUD=${lay.skew}`);

  fs.mkdirSync(OUT, { recursive: true });
  async function shot(name) {
    const { data } = await S('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
  }
  await shot('keylayout-over.png');

  // ── 7. 对局中截图 ──
  await evalJs(`(function(){
    document.getElementById('ov-over').style.display='none';
    document.getElementById('ov-start').style.display='none';
    __omgGame.start();
    return 1;
  })()`);
  await sleep(250);
  for (let i = 0; i < 5; i++) {
    const c = await evalJs(`(function(){
      var S=__omgGame.S;
      return S.pos<S.seq.length?S.seq[S.pos].code:null;
    })()`);
    if (!c) break;
    await pressForCode(c);
  }
  await sleep(150);
  await shot('keylayout-play.png');

  // 起始页
  await evalJs(`(function(){
    __omgGame.S.running=false;__omgGame.S.over=false;__omgGame.S.seq=[];__omgGame.S.pos=0;
    document.getElementById('ov-over').style.display='none';
    document.getElementById('ov-start').style.display='';
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyQ'}));
    return 1;
  })()`);
  await sleep(250);
  await shot('keylayout-start.png');

  // ── 8. 移动端回归 ──
  await S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await sleep(350);
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/games/keylayout/index.html` });
  await sleep(1200);
  const mob = await evalJs(`(function(){
    return {
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      iw: window.innerWidth,
      btnH: document.getElementById('btn-start').getBoundingClientRect().height,
      startVisible: getComputedStyle(document.getElementById('ov-start')).display!=='none',
      hudText: document.getElementById('lay-t').textContent
    };
  })()`);
  check('390px 无横向溢出', !mob.overflow, JSON.stringify(mob));
  check('390px 起始页正常', mob.startVisible === true);
  check('390px 按钮 ≥ 44px', mob.btnH >= 44, '实际 ' + mob.btnH);
  check('390px 布局状态已显示', mob.hudText.length > 0, mob.hudText);
  await shot('keylayout-mobile.png');

  // ── 9. 降级路径验证（强制无 layout） ──
  await S('Emulation.setDeviceMetricsOverride', { width: 900, height: 800, deviceScaleFactor: 2, mobile: false });
  await sleep(300);
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/games/keylayout/index.html` });
  await sleep(1100);
  await evalJs(`(function(){
    // 模拟 Firefox/Safari：无 navigator.keyboard
    try{ Object.defineProperty(navigator,'keyboard',{get:function(){return undefined},configurable:true}); }catch(e){}
    document.getElementById('btn-start').click();
    return 1;
  })()`);
  await sleep(800);
  const fb = await evalJs(`(function(){
    var S=__omgGame.S;
    return {ready:S.layoutReady, seqLen:S.seq.length, running:S.running,
            hud:document.getElementById('lay-t').textContent,
            none:!!document.querySelector('#maptable .none'),
            count:document.getElementById('shift-count').textContent};
  })()`);
  check('降级：layoutReady = false', fb.ready === false, JSON.stringify(fb));
  check('降级：游戏仍可玩（序列已生成）', fb.seqLen === 28 && fb.running === true, JSON.stringify(fb));
  check('降级：HUD 明示不可用', fb.hud.includes('不可用'), fb.hud);
  check('降级：错位表给出说明', fb.none === true, JSON.stringify(fb));
  check('降级：计数标注降级', fb.count.includes('降级'), fb.count);

  // 降级下也能完整通关
  await evalJs(`(function(){ __omgGame.S.miss=0; return 1; })()`);
  let g2 = 0;
  while (g2++ < 80) {
    const st = await evalJs(`(function(){
      var S=__omgGame.S;
      return {over:S.over, code:S.pos<S.seq.length?S.seq[S.pos].code:null};
    })()`);
    if (st.over || !st.code) break;
    await pressForCode(st.code);
  }
  await sleep(300);
  const fbDone = await evalJs(`(function(){
    var S=__omgGame.S;
    return {over:S.over, pos:S.pos, len:S.seq.length, hit:S.hit, miss:S.miss,
            acc:document.getElementById('o-acc').textContent,
            skew:document.getElementById('o-skew').textContent,
            panel:getComputedStyle(document.getElementById('ov-over')).display!=='none'};
  })()`);
  // 降级模式下判定仍按物理键位进行，序列必须能走完且结算正常
  check('降级：仍可完整通关',
    fbDone.over === true && fbDone.pos === fbDone.len && fbDone.panel === true,
    JSON.stringify(fbDone));
  check('降级：结算标注错位不可用', fbDone.skew === '不可用', fbDone.skew);
  check('降级：命中率仍正确统计', fbDone.acc === '100%', fbDone.acc);
  await shot('keylayout-fallback.png');

  check('全程无 console 错误', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  console.log('\n=== 《键位》真实浏览器 E2E ===\n');
  console.log(logs.join('\n'));
  console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 存在失败'}  ${pass} 通过 / ${fail} 失败\n`);

  await send('Target.closeTarget', { targetId });
  srv.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('E2E 崩溃:', e.message); process.exit(1); });