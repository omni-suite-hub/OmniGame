#!/usr/bin/env python3
"""
render_icons.py — 从 assets/logo.svg 的设计语言重绘四个尺寸的扩展图标。

不依赖 cairo / Chrome，直接用 Pillow 绘制几何图形，
保证 16px 下依然可辨：轨道环、小圆点在 16px 会被省略，只保留主体 + 十字。
"""
from PIL import Image, ImageDraw
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')

# 品牌色（与 design-tokens.css 一致）
C_TOP = (34, 231, 255)      # #22E7FF
C_MID = (18, 165, 232)     # #12A5E8
C_BOT = (43, 47, 168)      # #2B2FA8
C_BG = (14, 16, 32)        # #0E1020 深空夜
C_WHITE = (255, 255, 255)
SS = 8  # 超采样倍数


def round_rect_pts(x0, y0, x1, y1, r, steps=24):
    """圆角矩形轮廓点集（用多段线逼近圆角，避免 Pillow radius 过大退化）。

    返回 [(x, y), ...] 闭合轮廓，可直接喂给 ImageDraw.polygon。
    """
    pts = []
    # 四角圆弧（顺时针，每角 steps 段）
    corners = [
        (x1 - r, y0 + r, -90, 0),   # 右上
        (x1 - r, y1 - r, 0, 90),    # 右下
        (x0 + r, y1 - r, 90, 180),   # 左下
        (x0 + r, y0 + r, 180, 270),  # 左上
    ]
    for cx, cy, a0, a1 in corners:
        for i in range(steps + 1):
            a = math.radians(a0 + (a1 - a0) * i / steps)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def lerp(c1, c2, t):
    return tuple(int(round(a + (b - a) * t)) for a, b in zip(c1, c2))


def draw_icon(size, with_orbit):
    S = size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if with_orbit:
        # 轨道环
        r_out = S * 0.453
        ring_w = max(int(S * 0.019), 1)
        d.ellipse(
            [S / 2 - r_out, S / 2 - r_out, S / 2 + r_out, S / 2 + r_out],
            outline=C_WHITE + (235,),
            width=ring_w,
        )
        # 三个轨道小圆点（上 / 右下 / 左下）
        dot_r = max(S * 0.031, 1.2)
        for ang in (-90, 30, 150):
            a = math.radians(ang)
            cx = S / 2 + r_out * math.cos(a)
            cy = S / 2 + r_out * math.sin(a)
            d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=C_WHITE + (255,))

    # 主体圆角方块（squircle 比例：圆角半径约为边长的 31%）
    pad = S * (0.172 if with_orbit else 0.055)
    box = [pad, pad, S - pad, S - pad]
    side = S - 2 * pad
    radius = side * 0.31
    path = round_rect_pts(box[0], box[1], box[2], box[3], radius)
    d.polygon(path, fill=C_MID)

    # 斜向渐变（逐行近似）—— 只在主体 box 内绘制，避免污染外部
    grad = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    x0, y0, x1, y1 = box
    bw, bh = (x1 - x0), (y1 - y0)
    span = max(bw + bh, 1)
    for yy in range(int(y0), int(y1) + 1):
        t = ((yy - y0) + bw) / span
        t = min(max(t, 0.0), 1.0)
        if t < 0.45:
            c = lerp(C_TOP, C_MID, t / 0.45)
        else:
            c = lerp(C_MID, C_BOT, (t - 0.45) / 0.55)
        gd.line([(x0, yy), (x1, yy)], fill=c + (255,))
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).polygon(path, fill=255)
    # 用 alpha_composite（正确混合）而非 paste（会替换像素）
    img.alpha_composite(Image.composite(grad, Image.new('RGBA', (S, S), (0, 0, 0, 0)), mask))

    # 顶部高光：仅覆盖主体上缘约38%，与主体正确混合
    sheen = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    sheen_h = bh * 0.38
    for i in range(int(sheen_h)):
        a = int(88 * (1 - i / sheen_h) ** 1.6)
        if a <= 0:
            break
        yy = y0 + i
        sd.line([(x0, yy), (x1, yy)], fill=(255, 255, 255, a))
    img.alpha_composite(Image.composite(sheen, Image.new('RGBA', (S, S), (0, 0, 0, 0)), mask))

    # D-pad 十字
    arm_len = (S - 2 * pad) * 0.345
    thick = (S - 2 * pad) * 0.128
    cx = cy = S / 2
    r_thick = thick / 2
    d.rounded_rectangle(
        [cx - thick / 2, cy - arm_len, cx + thick / 2, cy + arm_len],
        radius=r_thick, fill=C_WHITE + (255,))
    d.rounded_rectangle(
        [cx - arm_len, cy - thick / 2, cx + arm_len, cy + thick / 2],
        radius=r_thick, fill=C_WHITE + (255,))

    # 内描边画在最上层：极细一道青色边缘光，压在主体轮廓内侧
    edge = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ed = ImageDraw.Draw(edge)
    inset = S * 0.008
    epath = round_rect_pts(box[0] + inset, box[1] + inset,
                           box[2] - inset, box[3] - inset,
                           max(radius - inset, 1))
    ed.line(epath + [epath[0]], fill=(124, 243, 255, 130), width=max(int(S * 0.010), 1))
    img.alpha_composite(edge)

    return img.resize((size, size), Image.LANCZOS)


def main():
    # 16/32 使用简化版（无轨道环），48/128 使用完整版
    plan = [(16, False), (32, False), (48, True), (128, True)]
    for size, orbit in plan:
        img = draw_icon(size, orbit)
        out = os.path.join(ASSETS, f'icon-{size}.png')
        img.save(out, 'PNG', optimize=True)
        print(f'icon-{size}.png  {size}x{size}  orbit={orbit}  {os.path.getsize(out)}B')

    # 预览对照图（放大 16/32 便于肉眼检查）
    prev = Image.new('RGBA', (600, 170), C_BG + (255,))
    x = 24
    for size, orbit in plan:
        ic = draw_icon(size, orbit)
        scale = min(112 / size, 3)
        big = ic.resize((int(size * scale), int(size * scale)), Image.LANCZOS)
        prev.paste(big, (x, (170 - big.size[1]) // 2), big)
        x += big.size[0] + 34
    out = os.path.join(ROOT, '.brandtmp', 'icon-preview.png')
    prev.save(out)
    print('preview ->', out)


if __name__ == '__main__':
    main()