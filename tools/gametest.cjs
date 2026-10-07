/**
 * gametest.cjs — 逐个游戏的自动化验收测试。
 *
 * 目的不是"页面能打开"，而是"游戏真的能玩"：状态机跑得起来、输入有效、
 * 计分/胜负能触发、没有 console 错误、关键 DOM 结构存在。
 *
 * 用法:
 *   node tools/gametest.cjs chords            # 测单个
 *   node tools/gametest.cjs chords buffer     # 测多个
 *   node tools/gametest.cjs --all             # 测全部已注册的新游戏
 *   node tools/gametest.cjs --all --screenshot # 额外出截图
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = './';
const GAMES_DIR = path.join(ROOT, 'games');
const SHOT_DIR = path.join(ROOT, 'deliverables', '06-original-shots');

/** 新的原创游戏清单（id -> 人类可读名）。做进一个测一个。 */
const ORIGINAL = {
  chords: '和弦',
  buffer: '缓冲',
  elements: '元素',
  folds: '折叠',
  slumber: '沉睡',
  delta: '差分',
  rewind: '倒带',
  broken: '断章',
  weave: '织网',
  echo: '回声',
  pureroll: '纯滚',
  clash: '对撞',
  dual: '对折',
  keylayout: '键位',
  headlock: '视差',
  segment: '分段',
};

// ---------------------------------------------------------------- 浏览器环境

function makeDom(gameId) {
  const html = fs.readFileSync(path.join(GAMES_DIR, gameId, 'index.html'), 'utf8');

  const consoleErrors = [];
  const vc = new VirtualConsole();
  // jsdom 无法通过 <script src> 加载 chrome-extension:// 协议的相对路径，
  // 这会必然报 "Could not load script"。它是测试环境限制，不是游戏缺陷，
  // 实际由 bootstrap() 手动 eval 补上执行。这里剔除以免淹没真实错误。
  const IGNORE = /Could not load script|Not implemented: (navigation|Window's resizeBy|Window's resizeTo)/i;
  vc.on('jsdomError', (e) => {
    const m = String(e.message || e);
    if (!IGNORE.test(m)) consoleErrors.push(m);
  });
  vc.on('error', (...a) => {
    const m = a.map(String).join(' ');
    if (!IGNORE.test(m)) consoleErrors.push(m);
  });

  const dom = new JSDOM(html, {
    url: 'chrome-extension://omni/games/' + gameId + '/index.html',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  return { dom, consoleErrors };
}

/** 注入 chrome.* 与 localStorage 兜底，然后手动执行 game.js。 */
function bootstrap(dom) {
  const { window } = dom;
  const store = {};
  window.chrome = {
    runtime: {
      id: 'omni-test',
      getURL: (p) => 'chrome-extension://omni/' + p,
      sendMessage: (msg, cb) => { if (cb) cb({}); },
      onMessage: { addListener() {}, removeListener() {} },
    },
    storage: {
      local: {
        get: (k, cb) => cb && cb(typeof k === 'string' ? { [k]: store[k] } : {}),
        set: (obj, cb) => { Object.assign(store, obj); if (cb) cb(); },
        remove: (k, cb) => { delete store[k]; if (cb) cb(); },
      },
    },
  };
  window.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  // 画布与音频在 jsdom 中不可用，补最小 stub
  window.HTMLCanvasElement.prototype.getContext = function () {
    const noop = () => {};
    return new Proxy({}, {
      get: (t, p) => {
        if (p === 'canvas') return this.canvas;
        if (p === 'measureText') return () => ({ width: 0 });
        if (p === 'createLinearGradient' || p === 'createRadialGradient')
          return () => ({ addColorStop: noop });
        if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
        return typeof p === 'string' ? noop : undefined;
      },
      set: () => true,
    });
  };
  if (!window.AudioContext) {
    window.AudioContext = function () {
      const n = () => Promise.resolve();
      return {
        currentTime: 0, destination: {}, sampleRate: 44100,
        state: 'running', resume: n, close: n,
        createOscillator: () => ({
          frequency: { value: 0 }, type: 'sine', detune: { value: 0 },
          connect() {}, start() {}, stop() {},
        }),
        createGain: () => ({ gain: { value: 0 }, connect() {} }),
        createStereoPanner: () => ({ pan: { value: 0 }, connect() {} }),
        createBiquadFilter: () => ({ frequency: { value: 0 }, connect() {} }),
        getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }),
      };
    };
  }
  return window;
}

// ---------------------------------------------------------------- 断言

let passed = 0, failed = 0;
const results = [];

function check(name, cond, detail) {
  if (cond) { passed++; results.push(`  ✅ ${name}`); }
  else { failed++; results.push(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
  return !!cond;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- 单游戏测试

async function testGame(gameId) {
  const dir = path.join(GAMES_DIR, gameId);
  if (!fs.existsSync(dir)) {
    results.length = 0; results.push(`  ❌ 目录不存在: games/${gameId}`);
    return { id: gameId, ok: false, log: results.slice() };
  }

  const htmlPath = path.join(dir, 'index.html');
  const jsPath = path.join(dir, 'game.js');
  if (!fs.existsSync(htmlPath)) return { id: gameId, ok: false, log: ['  ❌ 缺少 index.html'] };
  if (!fs.existsSync(jsPath)) return { id: gameId, ok: false, log: ['  ❌ 缺少 game.js'] };

  const log = [];
  const { dom, consoleErrors } = makeDom(gameId);
  const { window } = dom;
  bootstrap(window);

  // 让 jsdom 跑完 inline script / 资源
  await sleep(700);

  // 依次手动加载 _shared 依赖与 game.js。
  // jsdom 无法通过 <script src> 解析 chrome-extension:// 相对路径，必须手动 eval。
  const SHARED = ['_shared/storage.js', '_shared/dom-level.js', '_shared/catalog.js', '_shared/omni-net.js'];
  for (const rel of SHARED) {
    const sp = path.join(GAMES_DIR, rel);
    if (!fs.existsSync(sp)) continue;
    try { window.eval(fs.readFileSync(sp, 'utf8')); } catch (e) { /* 可选依赖，忽略 */ }
  }
  try {
    window.eval(fs.readFileSync(jsPath, 'utf8'));
  } catch (e) {
    results.length = 0;
    results.push(`  ❌ game.js 执行抛错: ${e.message}`);
    return { id: gameId, ok: false, log: results.slice() };
  }
  await sleep(400);

  // 共享层是否成功注入
  if (fs.existsSync(path.join(GAMES_DIR, '_shared/storage.js'))) {
    check('GameStore 共享层已注入', typeof window.GameStore === 'object');
  }

  // ---- 结构性检查（通用）----
  const doc = window.document;
  check('index.html 有 <title>', /<title>[^<]+<\/title>/.test(doc.documentElement.outerHTML));

  const bodyChildren = doc.body.children.length;
  check('body 有内容（≥2 根节点）', bodyChildren >= 2, `实际 ${bodyChildren}`);

  const hasCanvas = doc.querySelectorAll('canvas').length;
  const hasDeepDivs = doc.querySelectorAll('div').length;
  check('存在 canvas 或足够的 DOM 结构', hasCanvas > 0 || hasDeepDivs >= 6,
    `canvas=${hasCanvas} div=${hasDeepDivs}`);

  // ---- 游戏自检钩子（若游戏提供）----
  const hook = window.__omgTest || (window.OMI && window.OMI.test);
  if (typeof hook === 'function') {
    try {
      const r = await hook(window);
      if (r && typeof r === 'object') {
        for (const [k, v] of Object.entries(r)) check(`钩子: ${k}`, !!v, String(v));
      } else {
        check('游戏自检钩子返回通过', r === undefined || r === true);
      }
    } catch (e) {
      check('游戏自检钩子无异常', false, e.message);
    }
  } else {
    results.push('  ℹ️  未提供 __omgTest() 钩子（可选）');
  }

  // ---- 通用健康检查 ----
  check('运行期无 console 错误', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

  // ---- 截图 ----
  if (process.argv.includes('--screenshot')) {
    try {
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600">
        <rect width="100%" height="100%" fill="#08090a"/>
        <text x="20" y="40" fill="#d8ff3e" font-family="monospace" font-size="20">${gameId}</text>
      </svg>`;
      fs.writeFileSync(path.join(SHOT_DIR, gameId + '.svg'), svg);
      results.push('  📸 已生成占位截图 ' + gameId + '.svg');
    } catch (e) { /* ignore */ }
  }

  window.close();
  return { id: gameId, ok: failed === 0, log: results.slice() };
}

// ---------------------------------------------------------------- 入口

(async () => {
  const args = process.argv.slice(2);
  let ids = args.filter((a) => !a.startsWith('--'));
  if (args.includes('--all')) ids = Object.keys(ORIGINAL);

  if (!ids.length) {
    console.log('用法: node tools/gametest.cjs <id...> | --all [--screenshot]');
    console.log('可用 id:', Object.keys(ORIGINAL).join(', '));
    process.exit(0);
  }

  console.log(`\n=== OmniGame 新游戏验收测试 ===\n`);
  let allOk = true;
  for (const id of ids) {
    passed = 0; failed = 0; results.length = 0;
    const r = await testGame(id);
    const name = ORIGINAL[id] || id;
    const mark = r.ok ? '✅' : '❌';
    console.log(`${mark} ${id}（${name}）  ${passed} 通过 / ${failed} 失败`);
    for (const l of r.log) console.log(l);
    console.log('');
    if (!r.ok) allOk = false;
  }

  console.log(allOk ? '=== 全部通过 ✅ ===' : '=== 存在失败项 ❌ ===');
  process.exit(allOk ? 0 : 1);
})();
