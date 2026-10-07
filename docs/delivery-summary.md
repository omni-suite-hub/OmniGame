# OmniGame 交付总览（v1.1）

> 主理人：成必达（产品交付总监）｜ 阶段：v1.1 交互增强（悬浮球 + 可拖拽/缩放小窗 + 侧边栏互通续玩）+ 静态验证 + 测试裁定
> 状态：**有条件通过；fix pass 已修复 DEF-4/DEF-5/DEF-6；待真机 Load unpacked 自测后上架**

## 1. 一句话结论
在 MVP（5 款离线小游戏）基础上，为 OmniGame 增加了「悬浮球 → 可拖拽/可缩放小窗 → 侧边栏」三者互通、关闭可续玩的增强交互：用户在任意普通网页右下角看到 🎮 悬浮球，点击即开小窗玩游戏；小窗可任意拖动与缩放并记忆位置/尺寸；关闭后回到悬浮球、可随时再开；小窗内可一键「在侧边栏继续玩」，侧边栏内也可「开小窗」回到网页，跨载体通过 `chrome.storage.local` 的 `omg:lastGame` 续玩同一款游戏。全部离线、零外部请求、Shadow DOM 隔离。

## 2. 交付清单（v1.1 新增 / 变更）
| 文件 | 说明 | 状态 |
|------|------|------|
| `manifest.json` (v1.1.0) | 增 `sidePanel`/`activeTab` 权限、`content_scripts`、侧边栏入口 `surface.html`、`background` service worker、`web_accessible_resources`；移除 `default_popup` 与 `content.css` | 变更 |
| `background.js` (新) | service worker：图标点击开侧边栏；响应 `openSidePanel` 消息 | 新增 |
| `floatwin.js` (新) | 可复用拖拽/缩放浮窗组件（resize + clamp + 位置/尺寸持久化 + `omg:close` 事件） | 新增 |
| `content.js` (新) | 注入 Shadow DOM 悬浮球（可拖拽/记忆位置）+ 挂载小窗 + 消息桥（开侧边栏 / 开小窗） | 新增 |
| `surface.html` + `surface.js` (新) | 共享游戏面（目录网格 + iframe 播放器 + 上下文按钮），小窗内显示「在侧边栏继续玩」、侧边栏内显示「开小窗」，续玩 `omg:lastGame` | 新增 |
| `games/_shared/catalog.js` (新) | 单一游戏目录源（popup 与 surface 共用，防漂移） | 新增 |
| `popup.html` / `popup.js` (微调) | 改用 `catalog.js` 的 `OMNIGAME_GAMES`（现有启动器保留但已非主入口） | 变更 |
| `games/*`（5 款游戏的 index.html / style.css / game.js） | 响应式重构：移除游戏内重复返回按钮；`.wrap`/`播放区` 改 flex 自填充；新增 `fit()`/`fitStage()`（`ResizeObserver`）按容器尺寸重算 canvas/棋盘像素；俄罗斯方块 `CELL` 动态化 | 变更（v1.1.1 修复轮） |
| `popup.html` / `surface.html` | 游戏 iframe 由 `scrolling="no"` 改为 `scrolling="auto"`（底部遮挡兜底可滚） | 变更（v1.1.1 修复轮） |
| `docs/test-cases.md` | v1.1 测试套件（功能 / 边界 / 缺陷 / 裁定 / 真机清单） | 更新 |
| `docs/delivery-summary.md` | 本文件 | 更新 |

## 3. 关键决策与取舍
- **三种载体共用同一面（surface.html）**：小窗内 iframe 与侧边栏加载同一 `surface.html`，保证 UI/状态/目录一致；新增"开小窗 / 开侧边栏"按钮按上下文切换。
- **续玩语义**：游戏本身不序列化进行中棋盘，故"继续玩"= 重开时回到上一次所选游戏（`omg:lastGame`），而非复原棋盘。v1.1 范围内合理；完整盘面续玩列为后续。
- **Shadow DOM 隔离**：content.js 注入 `#omg-root`（固定全屏、`pointer-events:none`）+ ShadowRoot，球与窗均在内，页面样式无法串入，亦不外泄。
- **content_scripts 双文件**：`[floatwin.js, content.js]` 共用扩展隔离世界，使 `mountFloatWin` 可用且 `chrome.storage` 持久化生效（注入主世界会破坏两者）。
- **消息桥安全**：surface→content 的 `surface:openSidebar` 由 content.js 校验 `e.origin === EXT_ORIGIN`（即 `chrome-extension://<id>`）后才转发，页面源无法伪造。
- **被否决 / 保留**：完整棋盘续玩、Web Store / chrome:// 内注入（浏览器限制，预期不支持）、侧边栏内再嵌小窗（改为开回网页，避免嵌套 iframe 复杂度）。

## 4. 假设与风险
| 风险 | 等级 | 说明 / 缓解 |
|------|:---:|------|
| 无浏览器真机未跑 | 中 | 集成 / 手感 / 视觉 / 真实 `chrome.storage`·`sidePanel`·`tabs` 行为需在真机验证（见 test-cases.md §7 清单） |
| chrome://、Web Store 不注入 | 低 | 浏览器限制，预期不支持；文案需说明"仅普通网页可用" |
| 跨页位置共享 | 低 | 球/窗位置经 `omg:ball` / `omg:win:content` 共享存储，跨页一致（设计取舍） |
| 扫雷缩放丢状态 DEF-1 | P2 | MVP 遗留，待真机确认是否修复 |
| 响应式重构 DEF-8 真机手感 | 中 | 静态 `node --check` 全过、逻辑闭合；但 `ResizeObserver` 重算 canvas/棋盘在真实拖拽缩放下的手感、各游戏比例观感需真机确认 |
| 2048 首屏闪烁 DEF-2 / perfect-circle 复制 DEF-3 | P3 | MVP 遗留，待真机确认 |

## 5. 验收裁定与缺陷
- 裁定：**有条件通过**。静态层全过（6/6 JS `node --check`、零外链、零 eval、manifest 合法、资源齐备、消息桥 / 守卫 / CSP 经代码审查确认）；无 P0 / P1。
- v1.1 新增缺陷已在 fix pass 全部修复：
  - DEF-4（chrome:// / 普通网页刚加载扩展时「开小窗」无反馈或误报）→ 已补 `chrome.runtime.lastError` 检测；`manifest.json` 增加 `scripting` 权限；`content.js` / `floatwin.js` 加防重复注入守卫；普通网页下 `sendMessage` 失败后自动 `chrome.scripting.executeScript` 注入 `floatwin.js + content.js` 并重试。
  - DEF-5（小窗高度下限 360 而非 240）→ CSS `min-height` 改为 240 与 `minH` 对齐。
  - DEF-6（floatwin 注释误导）→ 注释已修正。
- v1.1.1 修复轮（用户截图反馈）新增并已修复：
  - DEF-7（游戏内与外壳「双返回」重叠）→ 移除 5 款游戏内的 `data-back` 返回按钮及 JS 绑定，仅保留外壳播放器栏返回。
  - DEF-8（窗口放大后底部控件遮挡 / 不自适应）→ 外壳 iframe 改 `scrolling="auto"`；各游戏 `.wrap` 改 `height:100%` flex 列、播放区 `flex:1`；新增 `fit()`/`fitStage()`（`ResizeObserver`）按容器尺寸重算 canvas/棋盘像素，底部控件恒定可见、游戏随窗口等比缩放。
- 遗留：DEF-1（P2，扫雷缩放丢状态，MVP 遗留，待真机）、DEF-2/DEF-3（P3，MVP 遗留）。

## 6. 遗留问题与下一步建议
1. **真机自测（必做）**：`chrome://extensions` → 开发者模式 → 加载未打包（指向 `.`），按 test-cases.md §7 清单 < 2 分钟自测。
2. **上架**：Chrome Web Store（$5）+ Edge Add-ons + Firefox AMO（你已有 AMO ID 流程）。注意 Web Store 游戏 + 广告合规。
3. **扩游戏（核心目标）**：按"开源为主 + 自研填空"补 Suika / 数独 / 纸牌；自研补差异化 toy。
4. **后续增强**：完整盘面续玩（序列化游戏状态）、侧边栏内"画中画"小窗、更多载体入口。
5. **变现（后续）**：免费 + 一次性解锁 / 广告 / 内购去广告（注意政策）。
