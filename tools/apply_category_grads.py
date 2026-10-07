#!/usr/bin/env python3
"""
apply_category_grads.py — 把 catalog.js 中 144 款游戏的随机渐变，
按 category 字段归拢为品牌 VI 定义的 6 色相。

只改 grad 字段的值，不改任何 id / name / category / 逻辑结构。
"""
import re
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAT = os.path.join(ROOT, 'games', '_shared', 'catalog.js')

# 品牌 VI 分类色（与 design-tokens.css / popup.css 一致）
GRADS = {
    'arcade':      'linear-gradient(135deg,#22D3EE,#0891B2)',
    'puzzle':      'linear-gradient(135deg,#A78BFA,#7C3AED)',
    'multiplayer': 'linear-gradient(135deg,#F472B6,#DB2777)',
    'physics':     'linear-gradient(135deg,#FBBF24,#EA580C)',
    'match':       'linear-gradient(135deg,#4ADE80,#059669)',
    'board':       'linear-gradient(135deg,#818CF8,#4F46E5)',
}

src = open(CAT, encoding='utf-8').read()

# 按对象块切分：每个游戏对象内同时含 grad 与 category
# 策略：逐个匹配 { ... } 块，块内替换 grad
obj_re = re.compile(r"\{[^{}]*\}", re.S)

stats = {k: 0 for k in GRADS}
skipped = []

def fix_obj(m):
    global stats
    blk = m.group(0)
    if 'grad:' not in blk or 'category:' not in blk:
        return blk
    cat_m = re.search(r"category:\s*'([^']+)'", blk)
    grad_m = re.search(r"grad:\s*'[^']*'", blk)
    if not cat_m or not grad_m:
        return blk
    cat = cat_m.group(1)
    if cat not in GRADS:
        skipped.append(cat)
        return blk
    id_m = re.search(r"id:\s*'([^']+)'", blk)
    stats[cat] += 1
    new_grad = "grad: '%s'" % GRADS[cat]
    return blk[:grad_m.start()] + new_grad + blk[grad_m.end():]

out = obj_re.sub(fix_obj, src)

open(CAT, 'w', encoding='utf-8').write(out)

print('已按分类归拢渐变：')
for k, v in stats.items():
    print(f'  {k:<14} {v:>3} 款  →  {GRADS[k]}')
print(f'  合计 {sum(stats.values())} 款')
if skipped:
    print('未识别分类：', set(skipped))