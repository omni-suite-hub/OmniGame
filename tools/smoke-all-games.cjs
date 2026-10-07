const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = './';
const PORT = 8945;
const CDP = 'http://127.0.0.1:9222';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
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

(async () => {
  const srv = await serve();
  console.log(`Local test server started on port ${PORT}`);

  // Fetch games catalog
  const catalogCode = fs.readFileSync(path.join(ROOT, 'games/_shared/catalog.js'), 'utf8');
  let gameList = [];
  const fakeGlobal = {};
  const fn = new Function('global', 'window', catalogCode + '\nreturn window.OMNIGAME_GAMES || global.OMNIGAME_GAMES;');
  gameList = fn(fakeGlobal, fakeGlobal);
  console.log(`Loaded catalog with ${gameList.length} games.`);

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
  if (!page) { console.error('No Chrome page found'); process.exit(1); }

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
  await S('Emulation.setDeviceMetricsOverride', {
    width: 900, height: 750, deviceScaleFactor: 2, mobile: false
  });

  const consoleErrors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.params?.sessionId !== sessionId && sessionId) {
      // check if event belongs to session
    }
    if (m.method === 'Log.entryAdded' && m.params?.entry?.level === 'error') {
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

  let totalPassed = 0;
  let totalFailed = 0;
  const failedGames = [];

  console.log(`\n=== 开始全量 160 款游戏 CDP 动态冒烟测试 ===\n`);

  for (let idx = 0; idx < gameList.length; idx++) {
    const g = gameList[idx];
    const gameId = g.id;
    consoleErrors.length = 0;

    const gameUrl = `http://127.0.0.1:${PORT}/games/${gameId}/index.html`;
    try {
      await S('Page.navigate', { url: gameUrl });
      await sleep(250);

      const title = await evalJs('document.title');
      const bodyChildren = await evalJs('document.body.children.length');
      const hookResult = await evalJs(`(function() {
        if (typeof window.__omgTest === "function") {
          try { return { ran: true, res: window.__omgTest(window) }; } catch (e) { return { ran: true, err: e.message }; }
        }
        return { ran: false };
      })()`);

      // Filter out non-fatal extension context errors if any
      const realErrors = consoleErrors.filter(err => !/favicon\.ico/i.test(err));

      let hasHookError = false;
      if (hookResult.ran && hookResult.err) {
        hasHookError = true;
        realErrors.push('__omgTest error: ' + hookResult.err);
      } else if (hookResult.ran && hookResult.res && typeof hookResult.res === 'object') {
        for (const [k, v] of Object.entries(hookResult.res)) {
          if (!v) {
            hasHookError = true;
            realErrors.push(`__omgTest fail: ${k} = ${v}`);
          }
        }
      }

      if (realErrors.length > 0) {
        totalFailed++;
        failedGames.push({ id: gameId, name: g.name, errors: realErrors });
        console.log(`❌ [${idx + 1}/160] ${gameId} (${g.name}) — 错误: ${realErrors.join(' ; ')}`);
      } else {
        totalPassed++;
        const hookNote = hookResult.ran ? ' [钩子测试已通过]' : '';
        console.log(`✅ [${idx + 1}/160] ${gameId} (${g.name}) — 正常${hookNote}`);
      }
    } catch (err) {
      totalFailed++;
      failedGames.push({ id: gameId, name: g.name, errors: [err.message] });
      console.log(`❌ [${idx + 1}/160] ${gameId} (${g.name}) — 异常: ${err.message}`);
    }
  }

  console.log(`\n========================================`);
  console.log(`全量测试完成: 通过 ${totalPassed} 款 / 失败 ${totalFailed} 款`);
  if (totalFailed > 0) {
    console.log(`失败游戏列表:`, JSON.stringify(failedGames, null, 2));
  }
  console.log(`========================================\n`);

  await S('Target.closeTarget', { targetId });
  srv.close();
  process.exit(totalFailed === 0 ? 0 : 1);
})();
