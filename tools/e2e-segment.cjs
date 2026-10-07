/**
 * e2e-segment.cjs — 《分段》真实浏览器端到端验证。
 *
 * 核心验证点（jsdom 完全无法覆盖）：
 *   ① Intl.Segmenter 在真实 ICU 上对中/英的实际分词结果
 *   ② isWordLike 判定：标点/空格必须被正确排除
 *   ③ 剪贴板 readText 真实往返（含中文）
 *   ④ 长词识别：snake_case 应被判为长词（ICU 认为它是 1 个词）
 *   ⑤ 切断交互 → 边界标签更新 → 全部切完自动结算
 *   ⑥ 降级路径（模拟无 Intl.Segmenter）
 *
 * 用法：node tools/e2e-segment.cjs
 */
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = './';
const OUT = path.join(ROOT, 'deliverables', '06-original-shots');
const PORT = 8946;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/games/segment/index.html';
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
  await S('Browser.grantPermissions', {
    origin: `http://127.0.0.1:${PORT}`, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
  }).catch(() => {});

  const consoleErrors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') consoleErrors.push(m.params.entry.text);
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
  const clickAt = async (id) => {
    const b = await evalJs(`(function(){
      var e=document.getElementById('${id}'); var r=e.getBoundingClientRect();
      return {x:r.x+r.width/2, y:r.y+r.height/2};
    })()`);
    await S('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  };

  // ── 1. 加载 ──
  await S('Emulation.setDeviceMetricsOverride', { width: 1000, height: 820, deviceScaleFactor: 2, mobile: false });
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/games/segment/index.html` });
  await sleep(1300);

  check('游戏已启动', await evalJs('window.__omgBooted === true'));
  check('起始遮罩可见', await evalJs(
    `getComputedStyle(document.getElementById('ov-start')).display !== 'none'`));
  check('加载无 console 错误', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

  // ── 2. ICU 分词的真实行为 ──
  const icu = await evalJs(`(function(){
    var G=__omgGame;
    function seg(t){ var r=G.icuSegment(t); return r? r.map(function(x){return x.s;}) : null; }
    return {
      available: G.detectSeg(),
      en: seg('the bookstore is nearby'),
      snake: seg('snake_case_variable_name'),
      zh: seg('我们正在开发一个浏览器游戏'),
      mixed: seg('我在用Intl.Segmenter 做分词'),
      workers: seg('workers compensation insurance')
    };
  })()`);
  logs.push(`  ℹ️  ICU: en=[${icu.en}] snake=[${icu.snake}] zh=[${(icu.zh || []).slice(0, 6)}]`);
  check('Intl.Segmenter 可用', icu.available === true);
  check('ICU 英文分词生效', Array.isArray(icu.en) && icu.en.length >= 4, JSON.stringify(icu.en));
  check('★ ICU 把 snake_case 当成 1 个词（游戏的核心前提）',
    Array.isArray(icu.snake) && icu.snake.length === 1, JSON.stringify(icu.snake));
  check('ICU 中文分词逐字/成词', Array.isArray(icu.zh) && icu.zh.length >= 5, JSON.stringify(icu.zh));
  check('ICU 切分中英混排', Array.isArray(icu.mixed) && icu.mixed.length >= 5, JSON.stringify(icu.mixed));
  // 注意：ICU 的 segment() 会把空格也作为独立 segment返回，
  // 所以"3 个词 + 2 个空格"= 5 段。判据应看词数而非段数。
  check('ICU 词典识别复合词（workers compensation insurance → 3 词）',
    Array.isArray(icu.workers) && icu.workers.filter(t => t.trim()).length === 3,
    JSON.stringify(icu.workers));

  // ── 3. tokenize 类别判定（空格/标点不得算词） ──
  const tok = await evalJs(`(function(){
    var t=__omgGame.tokenize('the bookstore, nearby', true);
    var words=0, space=0, punct=0;
    t.forEach(function(x){ if(x.k===1)words++; else if(x.k===2)space++; else if(x.k===3)punct++; });
    return {total:t.length, words:words, space:space, punct:punct};
  })()`);
  check('ICU 路径：空格被正确排除',
    tok.words === 3 && tok.space >= 1, JSON.stringify(tok));
  check('ICU 路径：标点被正确排除',
    tok.punct >= 1 && tok.words + tok.space + tok.punct === tok.total, JSON.stringify(tok));

  // ── 4. 真实点击"用示例文本" ──
  await clickAt('btn-sample');
  await sleep(500);
  const started = await evalJs(`(function(){
    var S=__omgGame.S;
    return {running:S.running, official:S.official, segOk:S.segOk,
            cur:S.cur, tokens:S.tokens?S.tokens.length:0,
            longTotal:S.longTotal,
            streamTokens:document.querySelectorAll('#stream .tk').length,
            words:document.getElementById('s-word').textContent};
  })()`);
  check('示例文本已开局', started.running === true && started.tokens > 0, JSON.stringify(started));
  check('使用 ICU 分词', started.segOk === true);
  check('识别出长词（snake_case 复合标识符）', started.longTotal > 0, 'longTotal=' + started.longTotal);
  check('遮罩已关闭', await evalJs(
    `getComputedStyle(document.getElementById('ov-start')).display === 'none'`));
  check('词边界标签已渲染', await evalJs(`document.querySelectorAll('#bwrap .btag').length > 0`));

  // ── 5. 真实点击"切断" ──
  const beforeCut = await evalJs(`(function(){var S=__omgGame.S;
    return {cuts:S.cuts, cur:S.cur, target:document.getElementById('t-w').textContent};})()`);
  await clickAt('btn-cut');
  await sleep(200);
  const afterCut = await evalJs(`(function(){var S=__omgGame.S;
    return {cuts:S.cuts, cur:S.cur, sel:document.getElementById('s-sel').textContent,
            cutMarks:document.querySelectorAll('#stream .tk.cut').length,
            tagsOn:document.querySelectorAll('#bwrap .btag.on').length};})()`);
  check('切断后 cuts 递增', afterCut.cuts === beforeCut.cuts + 1, JSON.stringify({ beforeCut, afterCut }));
  check('目标已推进', afterCut.cur !== beforeCut.cur || afterCut.cur === -1, JSON.stringify(afterCut));
  check('文本流出现切断标记', afterCut.cutMarks > 0, JSON.stringify(afterCut));
  check('边界标签高亮已切项', afterCut.tagsOn > 0, JSON.stringify(afterCut));
  check('已选计数更新', parseInt(afterCut.sel, 10) >= 1, afterCut.sel);

  // ── 6. 全部切完 → 自动结算 ──
  let guard = 0;
  while (guard++ < 60) {
    const st = await evalJs(`(function(){return {over:__omgGame.S.over, cur:__omgGame.S.cur};})()`);
    if (st.over || st.cur < 0) break;
    const ok = await evalJs(`(function(){
      try{ return __omgGame.doCut() ? 1 : 0; }catch(e){ return -1; }
    })()`);
    if (ok === 0) break;
    await sleep(35);
  }
  await sleep(400);
  const over = await evalJs(`(function(){
    return {over:__omgGame.S.over, running:__omgGame.S.running,
            grade:document.getElementById('o-grade').textContent,
            score:document.getElementById('o-score').textContent,
            official:document.getElementById('o-official').textContent,
            mine:document.getElementById('o-mine').textContent,
            long:document.getElementById('o-long').textContent,
            panel:getComputedStyle(document.getElementById('ov-over')).display!=='none'};
  })()`);
  check('全部切完自动结算', over.over === true && over.running === false, JSON.stringify(over));
  check('结算面板弹出', over.panel === true);
  check('评级已生成', /^[SABCD]$/.test(over.grade), over.grade);
  check('得分为数字', /^[0-9]+$/.test(over.score), over.score);
  check('官方/你的词数已统计', /^[0-9]+$/.test(over.official) && /^[0-9]+$/.test(over.mine), JSON.stringify(over));
  check('长词拆解已统计（格式 x/y）', over.long.indexOf('/') > 0, over.long);

  fs.mkdirSync(OUT, { recursive: true });
  async function shot(name) {
    const { data } = await S('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
  }
  await shot('segment-over.png');

  // ── 7. 对局中截图（含长词高亮） ──
  await evalJs(`(function(){
    document.getElementById('ov-over').style.display='none';
    __omgGame.begin('我在用 snake_case_variable_name 做分词，但 ICU 觉得它只有一个词。', false);
    return 1;
  })()`);
  await sleep(300);
  await evalJs(`(function(){ __omgGame.doCut(); __omgGame.doCut(); return 1; })()`);
  await sleep(250);
  const play = await evalJs(`(function(){
    return {longTags:document.querySelectorAll('#bwrap .btag.long').length,
            cuts:document.getElementById('s-long').textContent,
            stream:document.querySelectorAll('#stream .tk').length};
  })()`);
  check('长词在边界表中有标记', play.longTags > 0, JSON.stringify(play));
  await shot('segment-play.png');

  // ── 8. 剪贴板往返（真实 API） ──
  // ★ 先把已知文本写进剪贴板，再点按钮 —— 否则读到的是系统旧内容，断言无法判定
  const clip = await evalJs(`(async function(){
    try{
      await navigator.clipboard.writeText('requestPointerLock 与 movementX 是两回事。');
      var t = await navigator.clipboard.readText();
      return {ok:true, text:t, len:t.length};
    }catch(e){ return {ok:false, err:e.name}; }
  })()`);
  logs.push(`  ℹ️  剪贴板往返: ${clip.ok ? '成功 len=' + clip.len : '失败 ' + clip.err}`);
  if (clip.ok) {
    check('剪贴板中文往返成功', clip.len > 0 && clip.text.indexOf('与') > 0, JSON.stringify(clip));
    // 用真实剪贴板内容开局。
    // ★ 必须让起始遮罩可见 —— btn-clip 在遮罩里，遮罩不可见时按钮收不到点击。
    await evalJs(`(function(){
      document.getElementById('ov-over').style.display='none';
      document.getElementById('ov-start').style.display='';
      __omgGame.S.running=false; __omgGame.S.over=false; __omgGame.S.tokens=null;
      return 1;
    })()`);
    await sleep(200);
    await clickAt('btn-clip');
    await sleep(700);
    const fromClip = await evalJs(`(function(){
      var S=__omgGame.S;
      return {via:S.viaClipboard, running:S.running, text:S.text.slice(0,30),
              official:S.official};
    })()`);
    check('读取剪贴板开局成功', fromClip.running === true && fromClip.via === true, JSON.stringify(fromClip));
    check('剪贴板内容被真实使用', fromClip.text.indexOf('requestPointerLock') >= 0, fromClip.text);
  } else {
    logs.push('  ℹ️  剪贴板不可用，跳过（游戏应自动回退到示例文本）');
  }

  // ── 9. 降级路径（模拟无 Intl.Segmenter） ──
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/games/segment/index.html` });
  await sleep(1000);
  await evalJs(`(function(){
    // 移除 Intl.Segmenter，模拟老旧 Safari / 部分移动端
    try{ delete Intl.Segmenter; }catch(e){ Intl.Segmenter = undefined; }
    Object.defineProperty(Intl, 'Segmenter', {get:function(){return undefined;}, configurable:true});
    return typeof Intl.Segmenter;
  })()`);
  await sleep(200);
  await clickAt('btn-sample');
  await sleep(500);
  const fb = await evalJs(`(function(){
    var S=__omgGame.S;
    return {segOk:S.segOk, running:S.running, official:S.official,
            api:document.getElementById('api-t').textContent,
            words:document.getElementById('s-word').textContent,
            tokens:S.tokens?S.tokens.length:0};
  })()`);
  check('降级：segOk = false', fb.segOk === false, JSON.stringify(fb));
  check('降级：游戏仍可玩', fb.running === true && fb.tokens > 0, JSON.stringify(fb));
  check('降级：HUD 明示降级分词', fb.api.indexOf('降级分词') >= 0, fb.api);

  // 降级下打完一局，结算应标注
  let g2 = 0;
  while (g2++ < 80) {
    const st = await evalJs(`(function(){return {over:__omgGame.S.over, cur:__omgGame.S.cur};})()`);
    if (st.over || st.cur < 0) break;
    const ok = await evalJs(`(function(){ try{return __omgGame.doCut()?1:0;}catch(e){return -1;} })()`);
    if (ok === 0) break;
    await sleep(25);
  }
  await sleep(350);
  const fbOver = await evalJs(`(function(){
    return {over:__omgGame.S.over,
            sub:document.getElementById('o-sub').textContent,
            grade:document.getElementById('o-grade').textContent,
            panel:getComputedStyle(document.getElementById('ov-over')).display!=='none'};
  })()`);
  check('降级：仍可完成对局', fbOver.over === true, JSON.stringify(fbOver));
  check('降级：结算如实标注', fbOver.sub.indexOf('降级') >= 0, fbOver.sub);
  check('降级：评级不超 B（分数打折）',
    fbOver.grade === 'A' || fbOver.grade === 'S' ? false : true, '实际 ' + fbOver.grade);
  await shot('segment-fallback.png');

  // ── 10. 移动端回归 ──
  await S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await sleep(350);
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/games/segment/index.html` });
  await sleep(1200);
  const mob = await evalJs(`(function(){
    return {overflow:document.documentElement.scrollWidth > window.innerWidth + 1,
            iw:window.innerWidth,
            btnH:document.getElementById('btn-clip').getBoundingClientRect().height,
            sampleH:document.getElementById('btn-sample').getBoundingClientRect().height,
            startVisible:getComputedStyle(document.getElementById('ov-start')).display!=='none',
            api:document.getElementById('api-t').textContent};
  })()`);
  check('390px 无横向溢出', !mob.overflow, JSON.stringify(mob));
  check('390px 起始页正常', mob.startVisible === true);
  check('390px 两个按钮均 ≥ 44px', mob.btnH >= 44 && mob.sampleH >= 44, JSON.stringify(mob));
  check('390px API 状态已显示', mob.api.length > 0, mob.api);
  await shot('segment-mobile.png');

  check('全程无 console 错误', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  console.log('\n=== 《分段》真实浏览器 E2E ===\n');
  console.log(logs.join('\n'));
  console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 存在失败'}  ${pass} 通过 / ${fail} 失败\n`);

  await send('Target.closeTarget', { targetId });
  srv.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('E2E 崩溃:', e.message); process.exit(1); });