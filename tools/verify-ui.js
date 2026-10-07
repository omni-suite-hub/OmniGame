/**
 * verify-ui.js — 用 jsdom 实际执行 catalog.js，验证分类色是否正确落到卡片上。
 * 不改任何产品代码，纯验证。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = './';

// 模拟浏览器环境
const dom = new JSDOM('<!DOCTYPE html><body></body>', {
  url: 'http://localhost/popup.html',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.chrome = {
  runtime: {
    id: 'test',
    getURL: (p) => 'chrome-extension://test/' + p,
    getManifest: () => ({ version: '1.1.0' }),
    sendMessage: (p, cb) => cb && cb({}),
    lastError: null,
  },
  storage: { local: { get: (k, cb) => cb && cb({}), set: () => {} } },
};

// localStorage 兜底
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

// 加载 catalog.js
const catalogCode = fs.readFileSync(
  path.join(ROOT, 'games/_shared/catalog.js'), 'utf8'
);
try {
  dom.window.eval(catalogCode);
} catch (e) {
  console.error('✗ catalog.js 执行失败:', e.message);
  process.exit(1);
}

const list = dom.window.OMNIGAME_GAMES || [];
console.log('=== OmniCatalog 加载成功 ===');
console.log('游戏总数:', list.length);
if (!Array.isArray(list) || list.length === 0) {
  console.error('✗ OMNIGAME_GAMES 为空，验证无效');
  process.exit(1);
}

// 按 category 统计实际 grad
const byCat = {};
for (const g of list) {
  const c = g.category || 'unknown';
  byCat[c] = byCat[c] || { n: 0, grads: new Set() };
  byCat[c].n++;
  byCat[c].grads.add(g.grad);
}

console.log('\n=== 分类 → 渐变（模拟卡片背景）===');
let pass = true;
const CAT_HEX = {
  arcade: '#22D3EE',
  puzzle: '#A78BFA',
  multiplayer: '#F472B6',
  physics: '#FBBF24',
  match: '#4ADE80',
  board: '#818CF8',
};

for (const [cat, info] of Object.entries(byCat).sort()) {
  const grads = [...info.grads];
  const expect = CAT_HEX[cat];
  const ok = grads.length === 1 && grads[0].includes(expect);
  if (!ok) pass = false;
  console.log(
    `  ${ok ? '✓' : '✗'} ${cat.padEnd(14)} ${String(info.n).padStart(3)}款  ` +
    `渐变数=${grads.length}  ${grads[0] || ''}`
  );
}

// 验证 CSS 渐变值合法性
console.log('\n=== 渐变值合法性 ===');
let bad = 0;
for (const g of list) {
  if (!/^linear-gradient\(135deg,#[0-9A-Fa-f]{6},#[0-9A-Fa-f]{6}\)$/.test(g.grad)) {
    if (bad < 3) console.log('  ✗ 非法:', g.id, g.grad);
    bad++;
  }
}
console.log(bad === 0 ? '  ✓ 全部 144 条渐变格式合法' : `  ✗ ${bad} 条非法`);
if (bad) pass = false;

// 验证关键字段未被破坏
console.log('\n=== 数据完整性 ===');
const ids = new Set(list.map(g => g.id));
console.log(`  唯一 id: ${ids.size}/${list.length}`, ids.size === list.length ? '✓' : '✗');
const noName = list.filter(g => !g.name).length;
const noEmoji = list.filter(g => !g.emoji).length;
const noGrad = list.filter(g => !g.grad).length;
console.log(`  缺 name:${noName}  缺 emoji:${noEmoji}  缺 grad:${noGrad}`,
  (noName + noEmoji + noGrad) === 0 ? '✓' : '✗');
if (noName + noEmoji + noGrad) pass = false;

console.log('\n' + (pass ? '✅ 全部验证通过' : '❌ 存在失败项'));
process.exit(pass ? 0 : 1);