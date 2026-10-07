#!/usr/bin/env python3
"""
create_store_assets.py
Generates pixel-perfect, 24-bit RGB (no alpha channel) store assets for Chrome Web Store:
1. 5 Screenshots strictly 1280x800 (PNG / JPEG)
2. Small Promo Tile strictly 440x280 (PNG)
3. Marquee Promo Tile strictly 1400x560 (PNG)
"""

import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUTPUT_DIR = '/Users/eden/Desktop/OmniGame/03_视觉物料与图标_Visual_Assets'
SCREENSHOTS_DIR = os.path.join(OUTPUT_DIR, 'screenshots')
PROMO_DIR = os.path.join(OUTPUT_DIR, 'promo_tiles')
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
os.makedirs(PROMO_DIR, exist_ok=True)

# System Fonts on macOS
FONT_REGULAR = '/System/Library/Fonts/Hiragino Sans GB.ttc'
FONT_BOLD = '/System/Library/Fonts/STHeiti Medium.ttc'
FONT_EN_BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'

def get_font(size, bold=False):
    fp = FONT_BOLD if bold else FONT_REGULAR
    if not os.path.exists(fp):
        fp = '/System/Library/Fonts/STHeiti Light.ttc'
    return ImageFont.truetype(fp, size)

def create_gradient_bg(width, height, color_top=(11, 14, 30), color_bottom=(22, 28, 56)):
    """Creates a smooth linear vertical/diagonal gradient background."""
    base = Image.new('RGB', (width, height), color_top)
    top_r, top_g, top_b = color_top
    bot_r, bot_g, bot_b = color_bottom
    
    # Generate vertical gradient
    gradient = Image.new('RGB', (1, height))
    for y in range(height):
        ratio = y / float(height)
        r = int(top_r + (bot_r - top_r) * ratio)
        g = int(top_g + (bot_g - top_g) * ratio)
        b = int(top_b + (bot_b - top_b) * ratio)
        gradient.putpixel((0, y), (r, g, b))
    
    base = gradient.resize((width, height), Image.Resampling.BILINEAR)
    
    # Add ambient subtle glow orbs
    glow = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    
    # Top right cyan glow
    glow_draw.ellipse([width - 350, -100, width + 250, 450], fill=(14, 116, 144, 45))
    # Bottom left indigo glow
    glow_draw.ellipse([-150, height - 350, 400, height + 150], fill=(59, 130, 246, 35))
    
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    base.paste(glow, (0, 0), glow)
    return base

def draw_badge(draw, x, y, text, font, fill_bg=(56, 189, 248, 30), border_color=(56, 189, 248, 120), text_color=(56, 189, 248)):
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    px, py = 12, 5
    box = [x, y, x + tw + px * 2, y + th + py * 2]
    draw.rounded_rectangle(box, radius=12, fill=fill_bg, outline=border_color, width=1)
    draw.text((x + px, y + py - bbox[1]), text, font=font, fill=text_color)
    return x + tw + px * 2

def draw_window_frame(img, x, y, w, h, title="OmniGame", inner_content=None):
    """Draws a sleek macOS dark window mockup with native red/yellow/green traffic lights."""
    canvas = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    
    # Realistic multi-layer drop shadow
    shadow_box = [x - 14, y - 6, x + w + 14, y + h + 24]
    draw.rounded_rectangle(shadow_box, radius=20, fill=(0, 0, 0, 160))
    canvas = canvas.filter(ImageFilter.GaussianBlur(16))
    img.paste(canvas, (0, 0), canvas)
    
    # Main window body
    win_canvas = Image.new('RGBA', (w, h), (18, 22, 45, 255))
    win_draw = ImageDraw.Draw(win_canvas)
    
    # Title bar
    title_bar_h = 36
    win_draw.rounded_rectangle([0, 0, w, h], radius=14, fill=(18, 22, 45, 255), outline=(255, 255, 255, 35), width=1)
    win_draw.rectangle([0, title_bar_h - 1, w, title_bar_h], fill=(255, 255, 255, 18))
    
    # macOS Traffic Lights (🔴 🟡 🟢)
    dot_y = 12
    win_draw.ellipse([14, dot_y, 26, dot_y + 12], fill=(255, 95, 86))     # Red
    win_draw.ellipse([34, dot_y, 46, dot_y + 12], fill=(255, 189, 46))    # Yellow
    win_draw.ellipse([54, dot_y, 66, dot_y + 12], fill=(39, 201, 63))     # Green
    
    # Window Title
    t_font = get_font(12, bold=True)
    t_bbox = t_font.getbbox(title)
    tw = t_bbox[2] - t_bbox[0]
    win_draw.text(((w - tw) // 2, 10), title, font=t_font, fill=(203, 213, 225))
    
    # Paste inner content if provided
    if inner_content:
        cw = w - 2
        ch = h - title_bar_h - 2
        resized_content = inner_content.resize((cw, ch), Image.Resampling.LANCZOS)
        if resized_content.mode != 'RGBA':
            resized_content = resized_content.convert('RGBA')
        win_canvas.paste(resized_content, (1, title_bar_h + 1))
        # Re-outline
        win_draw.rounded_rectangle([0, 0, w, h], radius=14, fill=None, outline=(255, 255, 255, 40), width=1)
        
    img.paste(win_canvas, (x, y), win_canvas)

# ------------------------------------------------------------------------------
# 1. SCREENSHOT 1: 🪟 独立系统小窗模式
# ------------------------------------------------------------------------------
def make_screenshot_1():
    im = create_gradient_bg(1280, 800)
    draw = ImageDraw.Draw(im)
    
    # Header Typography
    badge_font = get_font(13, bold=True)
    title_font = get_font(30, bold=True)
    sub_font = get_font(16, bold=False)
    
    bx = draw_badge(draw, 54, 42, "🪟 独立系统弹窗", badge_font, fill_bg=(14, 116, 144, 40), border_color=(56, 189, 248, 140))
    draw_badge(draw, bx + 12, 42, "原生红黄绿控制 · 离线秒开", badge_font, fill_bg=(59, 130, 246, 30), border_color=(96, 165, 250, 100), text_color=(147, 197, 253))
    
    draw.text((54, 76), "独立桌面小窗：脱离网页束缚，全景自适应畅玩", font=title_font, fill=(255, 255, 255))
    draw.text((54, 122), "左上角原生红黄绿窗口控制，优雅抽屉顶部栏，屏幕居中一触即达 · 内置120款经典游戏", font=sub_font, fill=(148, 163, 184))
    
    # Content Window
    src_path = '/Users/eden/Desktop/OmniGame/03_视觉物料与图标_Visual_Assets/screenshots/01_独立系统小窗_120款游戏自适应.jpg'
    content = Image.open(src_path).convert('RGB')
    
    # Window placement
    win_w = 480
    win_h = 610
    draw_window_frame(im, 400, 165, win_w, win_h, title="OmniGame - 摸鱼小游戏合集盒", inner_content=content)
    
    # Left callout features
    cf_title = get_font(18, bold=True)
    cf_desc = get_font(14, bold=False)
    
    callouts = [
        ("🔴 🟡 🟢 macOS 原生窗口", "原生独立窗口体验，真正脱离任何网页，快捷最小化与关闭"),
        ("🎯 一键屏幕正中定位", "支持智能居中显示与任意拖拽缩放，窗口尺寸随心掌控"),
        ("⚡ 100% 离线沙箱运行", "全部游戏本地执行，零外部网络延迟，零隐私数据追踪"),
        ("🌐 官方网站 omnigame.top", "支持本地与官方最新小游戏无缝扩展更新")
    ]
    
    cy = 200
    for h_txt, d_txt in callouts:
        draw.text((64, cy), h_txt, font=cf_title, fill=(250, 204, 21) if "macOS" in h_txt else (255, 255, 255))
        draw.text((64, cy + 28), d_txt[:22], font=cf_desc, fill=(148, 163, 184))
        draw.text((64, cy + 50), d_txt[22:], font=cf_desc, fill=(148, 163, 184))
        cy += 95
        
    out = im.convert('RGB') # 24-bit PNG, zero alpha
    out.save(os.path.join(SCREENSHOTS_DIR, '01_截图_独立桌面小窗_1280x800.png'), 'PNG')
    print("✔ Screenshot 1 generated: 1280x800 (RGB)")

# ------------------------------------------------------------------------------
# 2. SCREENSHOT 2: 📑 浏览器侧边栏模式
# ------------------------------------------------------------------------------
def make_screenshot_2():
    im = create_gradient_bg(1280, 800)
    draw = ImageDraw.Draw(im)
    
    badge_font = get_font(13, bold=True)
    title_font = get_font(30, bold=True)
    sub_font = get_font(16, bold=False)
    
    bx = draw_badge(draw, 54, 42, "📑 浏览器侧边栏模式", badge_font, fill_bg=(168, 85, 247, 40), border_color=(192, 132, 252, 140), text_color=(216, 180, 254))
    draw_badge(draw, bx + 12, 42, "Chrome Side Panel 原生支持", badge_font, fill_bg=(59, 130, 246, 30), border_color=(96, 165, 250, 100), text_color=(147, 197, 253))
    
    draw.text((54, 76), "侧边栏常驻游玩：不遮挡网页正文，边查文档边摸鱼", font=title_font, fill=(255, 255, 255))
    draw.text((54, 122), "左侧查资料、看代码、写文档，右侧随时开一局休闲解压，工作摸鱼两不误", font=sub_font, fill=(148, 163, 184))
    
    # Mockup browser with sidepanel
    src_path = '/Users/eden/Desktop/OmniGame/03_视觉物料与图标_Visual_Assets/screenshots/03_浏览器侧边栏无缝游玩.png'
    content = Image.open(src_path).convert('RGB')
    
    win_w = 980
    win_h = 605
    draw_window_frame(im, 150, 165, win_w, win_h, title="Google Chrome - 侧边栏模式", inner_content=content)
    
    out = im.convert('RGB')
    out.save(os.path.join(SCREENSHOTS_DIR, '02_截图_浏览器侧边栏_1280x800.png'), 'PNG')
    print("✔ Screenshot 2 generated: 1280x800 (RGB)")

# ------------------------------------------------------------------------------
# 3. SCREENSHOT 3: 🎯 网页智能贴边悬浮球
# ------------------------------------------------------------------------------
def make_screenshot_3():
    im = create_gradient_bg(1280, 800)
    draw = ImageDraw.Draw(im)
    
    badge_font = get_font(13, bold=True)
    title_font = get_font(30, bold=True)
    sub_font = get_font(16, bold=False)
    
    bx = draw_badge(draw, 54, 42, "🎯 智能贴边悬浮球", badge_font, fill_bg=(34, 197, 94, 40), border_color=(74, 222, 128, 140), text_color=(134, 239, 172))
    draw_badge(draw, bx + 12, 42, "全页面默认常驻 · 自动边缘磁吸", badge_font, fill_bg=(59, 130, 246, 30), border_color=(96, 165, 250, 100), text_color=(147, 197, 253))
    
    draw.text((54, 76), "极简摸鱼控制中心：木鱼攒功德、随心抽签、一键老板键", font=title_font, fill=(255, 255, 255))
    draw.text((54, 122), "常驻网页右下角，右键菜单快速唤起，敲木鱼解压，按 Option+Q 瞬时隐形防窥", font=sub_font, fill=(148, 163, 184))
    
    src_path = '/Users/eden/Desktop/OmniGame/03_视觉物料与图标_Visual_Assets/screenshots/02_网页悬浮球与快捷摸鱼菜单.png'
    content = Image.open(src_path).convert('RGB')
    
    win_w = 980
    win_h = 605
    draw_window_frame(im, 150, 165, win_w, win_h, title="OmniGame 悬浮球快捷交互面板", inner_content=content)
    
    out = im.convert('RGB')
    out.save(os.path.join(SCREENSHOTS_DIR, '03_截图_网页悬浮球与快捷面板_1280x800.png'), 'PNG')
    print("✔ Screenshot 3 generated: 1280x800 (RGB)")

# ------------------------------------------------------------------------------
# 4. SCREENSHOT 4: ⚔️ 双人联机与经典对战
# ------------------------------------------------------------------------------
def make_screenshot_4():
    im = create_gradient_bg(1280, 800)
    draw = ImageDraw.Draw(im)
    
    badge_font = get_font(13, bold=True)
    title_font = get_font(30, bold=True)
    sub_font = get_font(16, bold=False)
    
    bx = draw_badge(draw, 54, 42, "⚔️ 双人联机 & 经典对战", badge_font, fill_bg=(239, 68, 68, 40), border_color=(248, 113, 113, 140), text_color=(252, 165, 165))
    draw_badge(draw, bx + 12, 42, "重力方阵 · 方块死斗 · 暗箱心理战", badge_font, fill_bg=(245, 158, 11, 30), border_color=(251, 191, 36, 100), text_color=(253, 230, 138))
    
    draw.text((54, 76), "自研创新玩法：局域网对决，旋转重力与方块对攻", font=title_font, fill=(255, 255, 255))
    draw.text((54, 122), "同 Wi-Fi 或 6 位密钥秒级连线，支持下落旋转双重博弈，棋盘翻转瞬间触发四连绝杀！", font=sub_font, fill=(148, 163, 184))
    
    src_path = '/Users/eden/Desktop/OmniGame/03_视觉物料与图标_Visual_Assets/screenshots/04_双人联机对战_WebRTC自研游戏.png'
    content = Image.open(src_path).convert('RGB')
    
    win_w = 540
    win_h = 605
    draw_window_frame(im, 370, 165, win_w, win_h, title="重力方阵 (Gravitas 4) · 双人重力博弈", inner_content=content)
    
    # Left highlight card
    draw.rounded_rectangle([54, 185, 330, 420], radius=14, fill=(22, 27, 56), outline=(255, 255, 255, 25))
    cf_title = get_font(16, bold=True)
    cf_desc = get_font(13, bold=False)
    draw.text((70, 205), "🪐 自研重力博弈", font=cf_title, fill=(56, 189, 248))
    draw.text((70, 235), "每回合二选一：投放棋子，\n或顺时针旋转棋盘 90 度！\n所有棋子受二次重力坍塌，\n攻守之势瞬间逆转。", font=cf_desc, fill=(203, 213, 225))
    
    draw.rounded_rectangle([54, 445, 330, 680], radius=14, fill=(22, 27, 56), outline=(255, 255, 255, 25))
    draw.text((70, 465), "⚔️ 方块死斗 & 暗箱博弈", font=cf_title, fill=(244, 114, 182))
    draw.text((70, 495), "消行互扔垃圾方块死斗，\n或在黑客终端中进行心理轮盘，\n随时与同事好友同局对抗。", font=cf_desc, fill=(203, 213, 225))
    
    # Right highlight
    draw.rounded_rectangle([950, 185, 1226, 420], radius=14, fill=(22, 27, 56), outline=(255, 255, 255, 25))
    draw.text((966, 205), "📶 极简免配联机", font=cf_title, fill=(250, 204, 21))
    draw.text((966, 235), "同办公室局域网自动互联，\n或输入 6 位房间号直连，\n无需任何注册与账号。", font=cf_desc, fill=(203, 213, 225))
    
    draw.rounded_rectangle([950, 445, 1226, 680], radius=14, fill=(22, 27, 56), outline=(255, 255, 255, 25))
    draw.text((966, 465), "♟️ 经典全套棋牌", font=cf_title, fill=(52, 211, 153))
    draw.text((966, 495), "五子棋、中国象棋、国际象棋、\n黑白棋、麻将对决、斗地主、\nUNO 等经典对局全覆盖。", font=cf_desc, fill=(203, 213, 225))

    out = im.convert('RGB')
    out.save(os.path.join(SCREENSHOTS_DIR, '04_截图_双人联机与经典对战_1280x800.png'), 'PNG')
    print("✔ Screenshot 4 generated: 1280x800 (RGB)")

# ------------------------------------------------------------------------------
# 5. SCREENSHOT 5: 🎮 120款离线游戏大厅与分类搜索
# ------------------------------------------------------------------------------
def make_screenshot_5():
    im = create_gradient_bg(1280, 800)
    draw = ImageDraw.Draw(im)
    
    badge_font = get_font(13, bold=True)
    title_font = get_font(30, bold=True)
    sub_font = get_font(16, bold=False)
    
    bx = draw_badge(draw, 54, 42, "🎮 120+ 款精选游戏阵容", badge_font, fill_bg=(245, 158, 11, 40), border_color=(251, 191, 36, 140), text_color=(253, 230, 138))
    draw_badge(draw, bx + 12, 42, "拼音首字母检索 · 分类筛选", badge_font, fill_bg=(14, 116, 144, 40), border_color=(56, 189, 248, 100), text_color=(56, 189, 248))
    
    draw.text((54, 76), "120 款经典与自研游戏：益智、消除、街机、棋牌全覆盖", font=title_font, fill=(255, 255, 255))
    draw.text((54, 122), "2048、贪吃蛇、扫雷、俄罗斯方块、大西瓜、数独、恐龙跳跃、拼图大师... 离线秒开即玩", font=sub_font, fill=(148, 163, 184))
    
    # Composite game catalog from source
    src_path = '/Users/eden/.gemini/antigravity/brain/b1dd5349-abd1-4467-ac3e-e4c448bb4c09/.user_uploaded/media_1790844978568.png'
    content = Image.open(src_path).convert('RGB')
    
    win_w = 980
    win_h = 605
    draw_window_frame(im, 150, 165, win_w, win_h, title="OmniGame 120款离线游戏大厅", inner_content=content)
    
    out = im.convert('RGB')
    out.save(os.path.join(SCREENSHOTS_DIR, '05_截图_120款离线游戏大厅_1280x800.png'), 'PNG')
    print("✔ Screenshot 5 generated: 1280x800 (RGB)")

# ------------------------------------------------------------------------------
# 6. 小型宣传图块 (Small Promo Tile, 440x280)
# ------------------------------------------------------------------------------
def make_small_promo_tile():
    W, H = 440, 280
    im = create_gradient_bg(W, H, color_top=(14, 18, 42), color_bottom=(24, 30, 70))
    draw = ImageDraw.Draw(im)
    
    # Outer border
    draw.rounded_rectangle([3, 3, W - 4, H - 4], radius=14, outline=(56, 189, 248, 120), width=1)
    
    # Icon
    icon_path = '/Users/eden/Desktop/OmniGame/03_视觉物料与图标_Visual_Assets/icons/icon-128.png'
    if os.path.exists(icon_path):
        icon = Image.open(icon_path).convert('RGBA').resize((64, 64), Image.Resampling.LANCZOS)
        im.paste(icon, ((W - 64) // 2, 28), icon)
    
    # Title
    t_font = get_font(26, bold=True)
    tb = t_font.getbbox("OmniGame")
    tw = tb[2] - tb[0]
    draw.text(((W - tw) // 2, 102), "OmniGame", font=t_font, fill=(255, 255, 255))
    
    # Subtitle
    s_font = get_font(15, bold=True)
    sb = s_font.getbbox("摸鱼小游戏合集盒")
    sw = sb[2] - sb[0]
    draw.text(((W - sw) // 2, 138), "摸鱼小游戏合集盒", font=s_font, fill=(250, 204, 21))
    
    # Tag badges
    tag_font = get_font(11, bold=True)
    draw_badge(draw, 34, 178, "🎮 120+款精选", tag_font, fill_bg=(14, 116, 144, 40), border_color=(56, 189, 248, 100), text_color=(56, 189, 248))
    draw_badge(draw, 148, 178, "🪟 独立小窗", tag_font, fill_bg=(59, 130, 246, 30), border_color=(96, 165, 250, 100), text_color=(147, 197, 253))
    draw_badge(draw, 244, 178, "📑 侧边栏", tag_font, fill_bg=(168, 85, 247, 30), border_color=(192, 132, 252, 100), text_color=(216, 180, 254))
    draw_badge(draw, 328, 178, "⚡ 100%离线", tag_font, fill_bg=(34, 197, 94, 30), border_color=(74, 222, 128, 100), text_color=(134, 239, 172))
    
    # Footer URL
    u_font = get_font(12, bold=False)
    ub = u_font.getbbox("🌐 官方网站：omnigame.top")
    uw = ub[2] - ub[0]
    draw.text(((W - uw) // 2, 232), "🌐 官方网站：omnigame.top", font=u_font, fill=(148, 163, 184))
    
    out = im.convert('RGB')
    out.save(os.path.join(PROMO_DIR, '小型宣传图块_440x280.png'), 'PNG')
    # Also save in root of Visual Assets
    out.save(os.path.join(OUTPUT_DIR, '小型宣传图块_440x280.png'), 'PNG')
    print("✔ Small Promo Tile generated: 440x280 (RGB)")

# ------------------------------------------------------------------------------
# 7. 顶部宣传图块 (Marquee Promo Tile, 1400x560)
# ------------------------------------------------------------------------------
def make_marquee_promo_tile():
    W, H = 1400, 560
    im = create_gradient_bg(W, H, color_top=(10, 14, 32), color_bottom=(20, 26, 60))
    draw = ImageDraw.Draw(im)
    
    # Left Content Area
    badge_font = get_font(14, bold=True)
    draw_badge(draw, 70, 52, "✨ 浏览器休闲摸鱼神器 · 离线优先 · 零网络请求", badge_font, fill_bg=(14, 116, 144, 40), border_color=(56, 189, 248, 120), text_color=(56, 189, 248))
    
    t_font = ImageFont.truetype(FONT_EN_BOLD if os.path.exists(FONT_EN_BOLD) else FONT_BOLD, 52)
    draw.text((70, 100), "OmniGame", font=t_font, fill=(255, 255, 255))
    
    st_font = get_font(32, bold=True)
    draw.text((360, 116), "摸鱼小游戏合集盒", font=st_font, fill=(250, 204, 21))
    
    bullet_font = get_font(18, bold=True)
    desc_font = get_font(14, bold=False)
    
    bullets = [
        ("🪟 原生独立桌面小窗", "带 macOS 红黄绿原生按键，脱离网页限制，居中沉浸自适应"),
        ("📑 Chrome 侧边栏模式", "原生侧边栏常驻，边工作看文档边玩，不挡主页面内容"),
        ("🎯 智能贴边悬浮球", "全页面常驻贴边半隐，电子木鱼解压，Option+Q 老板键瞬时防窥"),
        ("🎮 120 款经典与自研游戏", "2048、贪吃蛇、俄罗斯方块、大西瓜、自研重力方阵与方块死斗")
    ]
    
    by = 185
    for b_title, b_desc in bullets:
        draw.text((70, by), b_title, font=bullet_font, fill=(255, 255, 255))
        draw.text((310, by + 3), "— " + b_desc, font=desc_font, fill=(148, 163, 184))
        by += 55
        
    # URL footer
    draw_badge(draw, 70, 440, "🌐 官方网站：omnigame.top", get_font(15, bold=True), fill_bg=(59, 130, 246, 35), border_color=(96, 165, 250, 120), text_color=(147, 197, 253))
    draw_badge(draw, 340, 440, "100% 离线运行", get_font(15, bold=True), fill_bg=(34, 197, 94, 30), border_color=(74, 222, 128, 100), text_color=(134, 239, 172))
    draw_badge(draw, 500, 440, "零隐私追踪", get_font(15, bold=True), fill_bg=(168, 85, 247, 30), border_color=(192, 132, 252, 100), text_color=(216, 180, 254))
    
    # Right Showcase Window Mockup
    src_path = '/Users/eden/Desktop/OmniGame/03_视觉物料与图标_Visual_Assets/screenshots/01_独立系统小窗_120款游戏自适应.jpg'
    content = Image.open(src_path).convert('RGB')
    draw_window_frame(im, 880, 45, 450, 470, title="OmniGame 小窗精选", inner_content=content)
    
    out = im.convert('RGB')
    out.save(os.path.join(PROMO_DIR, '顶部宣传图块_1400x560.png'), 'PNG')
    # Also save in root of Visual Assets
    out.save(os.path.join(OUTPUT_DIR, '顶部宣传图块_1400x560.png'), 'PNG')
    print("✔ Marquee Promo Tile generated: 1400x560 (RGB)")

if __name__ == '__main__':
    print("Generating official Chrome Web Store assets...")
    make_screenshot_1()
    make_screenshot_2()
    make_screenshot_3()
    make_screenshot_4()
    make_screenshot_5()
    make_small_promo_tile()
    make_marquee_promo_tile()
    print("All assets successfully generated!")
