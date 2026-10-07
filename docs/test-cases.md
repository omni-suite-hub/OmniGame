# 测试用例与验收结论 · OmniGame（Chrome MV3 小游戏合集盒）

**测试专家（裁定）**：甄无漏 ｜ **主理人独立抽检**：成必达 ｜ **被测版本**：v1.1.0 ｜ **日期**：2026-09-30
**方法**：本环境无浏览器。静态/语法/离线/CSP 层由测试专家**真实执行**（见 §1）；集成/交互/手感/视觉层为「需在真机验证」项（由用户在 `chrome://extensions` → Load unpacked 后自测）。
**状态取值**：`已验证(本环境)` / `需在真机验证` / `失败`。**未执行不计入通过**；真机项均标注「需在真机验证」，不臆造运行结果。

---

## 1. 本环境已真实执行（静态层）

| 项 | 方法 | 结果 |
|----|------|------|
| JS 语法（v1.1 全部 6 个 JS） | `node --check` content.js / surface.js / floatwin.js / background.js / catalog.js / storage.js | **6/6 通过** |
| 零运行时外链（v1.1 交互代码） | `grep -rnE "https?://"` 于 content.js, surface.js, floatwin.js, background.js, surface.html | **0 命中**（离线优先成立） |
| 零 eval（v1.1 交互代码） | `grep -rnE "eval\s*\("` 于上述 4 个 JS | **0 命中** |
| 游戏资源齐备 | Glob `games/*/index.html` | **5/5 命中**（2048 / snake / minesweeper / tetris / perfect-circle） |
| manifest 合法 | `node -e JSON.parse`（v1.1.0，MV3，permissions: storage/sidePanel/activeTab） | 通过（由开发专家给定，本环境复核一致） |
| JS 语法（5 个游戏 game.js 响应式重构后） | `node --check` games/{2048,minesweeper,snake,tetris,perfect-circle}/game.js | **5/5 通过** |
| 零运行时外链（本轮新增 fit/ResizeObserver 代码） | `grep -rnE "https?://\|eval\("` 于 5 个 game.js + popup.html/surface.html | **0 命中**（仅本地相对 `script src` 与 `chrome.runtime.getURL`） |

> 说明：以上为可离线确定性执行的检查，结论真实。以下所有「交互/集成/手感/视觉」用例本环境**无法**执行，均标「需在真机验证」。

---

## 2. 测试策略（测试金字塔视角）

```
         /\
        /E2E\   侧边栏↔小窗 跨载体「继续玩」、真机手感  —— 需真机（用户）
       /------\
      / 集成层 \   悬浮球注入、iframe 隔离、消息桥、origin 校验 —— 部分静态可推，主流程需真机
     /----------\
    / 单元/静态 \  JS 语法、零外链、零 eval、manifest 合法、资源齐备 —— 本环境已验证
   /--------------\
```

- **为什么部分用例必须真机**：Chrome 内容脚本注入、Shadow DOM 渲染、Pointer 拖拽手感、`chrome.sidePanel`/`chrome.tabs.sendMessage` 运行时行为、`chrome.storage.local` 真实读写，均依赖真实浏览器扩展宿主，本环境无 Chrome，无法跑。
- **离线优先与 CSP**：`script-src 'self'`，无 `eval`、无内联事件处理器、无运行时外链（已 grep 证）；样式内联 `<style>` 在 MV3 合法（CSP 仅约束脚本）。安全消息桥：surface→content 的 `surface:openSidebar` 由 content.js 校验 `e.origin === EXT_ORIGIN`（即 `chrome-extension://<id>`），页面自身（http(s) 源）无法伪造 → 已通过代码审查确认（**已验证(本环境)**）。

---

## 3. 功能测试用例（悬浮球 → 小窗 → 侧边栏 跨载体交互）

> 状态：`需在真机验证` = 本环境无法执行，须用户在真机自测；`已验证(本环境)` = 静态/代码审查已确认。

| 用例ID | 标题 | 前置 | 步骤 | 预期 | 状态 |
|--------|------|------|------|------|:---:|
| F-BALL-1 | 普通网页出现悬浮球 | 在普通 https 网页（非 chrome://、非 Web Store）打开，已 Load unpacked | 页面加载完成，观察右下角 | `#omg-root`(ShadowRoot) 内出现 🎮 悬浮球（固定 bottom/right 18px） | 需在真机验证 |
| F-BALL-2 | 点击悬浮球 → 小窗打开并显示游戏网格 | F-BALL-1 基础上 | 单击悬浮球（无拖拽位移） | 小窗（class `.omg-fw`）显示，iframe 载入 `surface.html`，展示目录网格 | 需在真机验证 |
| F-WIN-1 | 拖拽小窗标题栏移动 + 关闭/重开后位置持久 | F-BALL-2 已开小窗 | 拖标题栏移动；点 × 关闭；再次单击球重开 | 窗口位置变化；关闭后球仍在；重开后窗口回到关闭前位置（`omg:win:content` 持久） | 需在真机验证 |
| F-WIN-2 | 拖右下角缩放 + 关闭/重开后尺寸持久 | F-BALL-2 已开小窗 | 拖 `.omg-fw-resize` 改变宽高；关闭重开 | 宽高变化并持久（`omg:win:content`）；**高度下限 240px（DEF-5 已修复）** | 需在真机验证 |
| F-WIN-3 | 关闭小窗后球保留、可重开 | F-BALL-2 | 点 × | 小窗隐藏、球保持可见；再次单击球 → 小窗重新出现 | 需在真机验证 |
| F-GAME-1 | 小窗内选游戏→关闭→重开续玩同一游戏 | F-BALL-2 | 在小窗点某游戏卡片启动；点 ×；重新开小窗 | 重开后小窗内 iframe 仍为该游戏（同实例未卸载）；刷新页面后侧边栏/小窗经 `omg:lastGame` 续玩同一游戏 | 需在真机验证 |
| F-SP-1 | 小窗内「在侧边栏继续玩」→ 侧边栏同游戏 | F-GAME-1（已启动某游戏） | 点小窗内「在侧边栏继续玩」 | surface 向 parent postMessage `surface:openSidebar`→content 校验 origin→`chrome.runtime.sendMessage({type:'openSidePanel'})`→background `chrome.sidePanel.open()`；侧边栏打开并续玩同一游戏（无则显示网格） | 需在真机验证 |
| F-SP-2 | 侧边栏「开小窗」→ 活动网页生成小窗 | 侧边栏已开（surface 顶层，按钮为「开小窗」），活动标签页为普通网页 | 点「开小窗」 | `chrome.tabs.query(active)`→`chrome.tabs.sendMessage(tabId,{type:'spawnFloatWin'})`→该页 content 脚本 `fw.toggle()` 打开小窗 | 需在真机验证 |
| F-BALL-3 | 悬浮球拖拽移动 + 位置持久 | F-BALL-1 | 拖拽悬浮球（位移 >4px）松开 | 球移动到新位置并写入 `omg:ball`；刷新后球在同位置 | 需在真机验证 |
| F-XCAR-1 | 跨载体共享 `omg:lastGame`「继续玩」 | 小窗/侧边栏任一载体启动过游戏 | 在另一侧载体打开 | 两侧均经 `omg:lastGame` 续玩同一游戏（共享 storage key） | 需在真机验证 |

### 3.1 保留的 MVP 功能用例（游戏层，v0.1.0 沿用，载体入口已变 side panel）

| 用例ID | 标题 | 预期 | 状态 |
|--------|------|------|:---:|
| T-OFFLINE | 离线可玩 | 断网后全部游戏可运行、零网络请求（结构上 grep 已证零外链） | 需在真机验证 |
| T-RESP | 响应式 | 360px 弹窗 / 1280px 新标签均可用可操作 | 需在真机验证 |
| T-PERSIST | 分数持久化 | `chrome.storage.local` 写入后刷新仍在（GameStore 读写路径，需真机确认） | 需在真机验证 |
| T-ISOLATE | iframe 隔离 | 反复切换游戏无 CSS 串色 / 脚本报错（surface 经 iframe 加载各游戏） | 需在真机验证 |
| T-2048 | 玩法 | 合并 / 胜利 / 结束 | 需在真机验证 |
| T-SNAKE | 玩法 | 方向键 + 屏幕键 + 滑动 | 需在真机验证 |
| T-MINE | 玩法 | 三难度 + 首点安全 + 标雷 | 需在真机验证 |
| T-TETRIS | 玩法 | ←→↓↑ + 空格硬降 + P 暂停 + 消行 | 需在真机验证 |
| T-CIRCLE | 玩法 | 松手评分 + 复制分享 | 需在真机验证 |
| T-LOAD | 扩展加载（入口变更） | `chrome://extensions` 加载未打包无报错；点工具栏图标→侧边栏打开（v1.1 用 sidePanel 替代 v0.1 的 popup 启动器） | 需在真机验证 |

---

## 4. 边界 / 异常用例

| 用例ID | 边界项 | 预期 | 状态 |
|--------|--------|------|:---:|
| B-1 | 活动标签为 chrome:// 或 Web Store | content 脚本未注入 → 悬浮球不出现（符合预期）；侧边栏点「开小窗」时因无 receiver，现已弹「请在普通网页中打开小窗」提示（**DEF-4 已修复**） | 需在真机验证（缺口已修复） |
| B-2 | 缩放到小于最小尺寸 | 宽度下限 300px（JS `minW:300` + CSS `min-width:300px` 双保险）；**高度下限 240px（CSS `min-height` 已与 `minH:240` 对齐，DEF-5 已修复）** | 宽度/高度下限均为**已验证(本环境)** 的代码级结论 |
| B-3 | 拖拽越出视口 | 窗口 x/y 经 `clamp(...,0,innerWidth-…/innerHeight-…)` 夹在视口内；悬浮球 x/y 经 `clamp(0, innerWidth-BALL_SIZE / innerHeight-BALL_SIZE)` | 需在真机验证 |
| B-4 | 多个网页各自独立 | 每页注入各自的 `#omg-root`+球+小窗（DOM 实例独立，不污染页面）；**注意：位置经 `omg:ball`/`omg:win:content` 共享存储，故跨页位置一致（设计取舍，非缺陷）** | 需在真机验证 |
| B-5 | 快速连点 / 双注入防护 | content.js 守卫 `window.self!==window.top`（仅顶层文档运行）；content_scripts 按顺序 `[floatwin.js, content.js]` 注入，`mountFloatWin` 在同隔离世界先于 content.js 可用 | 已验证(本环境)（代码审查）+ 需在真机验证（运行时确认） |
| B-6 | 离线零网络请求 | 全程无 `https?://`/fetch/XHR/CDN（grep 已证交互代码 0 命中） | 已验证(本环境)（静态） |
| B-7 | CSP 合规 | 无内联事件处理器、无 `eval`，仅 `addEventListener` + `script-src 'self'` | 已验证(本环境)（代码审查） |
| B-8 | 消息桥安全 | content.js 仅当 `e.origin===EXT_ORIGIN`（`chrome-extension://<id>`）才转发 `openSidePanel`；页面源无法伪造 | 已验证(本环境)（代码审查） |

---

## 5. 缺陷清单

| 缺陷ID | 等级 | 模块 | 现象 | 根因 / 影响 | 处置建议 | 状态 |
|--------|:---:|------|------|-------------|----------|:---:|
| DEF-1 | **P2** | 扫雷 | 窗口缩放时丢失棋盘状态 | 缩放未做状态保持 | 监听 resize 重绘或锁定布局 | 待真机确认（MVP 遗留） |
| DEF-2 | P3 | 2048 | 首屏轻微闪烁 | 初始渲染时序 | 骨架屏 / 预渲染 | 待真机确认（MVP 遗留） |
| DEF-3 | P3 | perfect-circle | 复制分享剪贴板失败 | 剪贴板 API 权限/降级 | `navigator.clipboard` 降级 + 用户手势触发 | 待真机确认（MVP 遗留） |
| DEF-4 | **P3** | 侧边栏「开小窗」 | 在普通网页点「开小窗」也弹「请在普通网页中打开小窗」；或 chrome:// / Web Store 点按钮无反馈 | ① surface.js 仅在「无活动标签」分支弹提示；chrome:// / Web Store 因无 content 脚本 receiver，`sendMessage` 静默失败。② 普通网页在扩展刚加载/重载后，已打开标签未注入 content 脚本，`sendMessage` 失败被误判为「非普通网页」 | ① 在 sendMessage 回调检测 `chrome.runtime.lastError` 并弹提示；② `manifest.json` 增加 `scripting` 权限；③ `content.js` / `floatwin.js` 加防重复注入守卫；④ 对 `https?://` 页面，sendMessage 失败后自动 `chrome.scripting.executeScript` 注入 `floatwin.js + content.js` 并重试 | **已修复（v1.1.2 fix pass：lastError + scripting 动态注入 + 重试）**，不阻断普通网页流程 |
| DEF-5 | **P3** | floatwin 尺寸下限 | 小窗高度无法缩到 240px，实际下限 360px（与 `minH:240` 及需求「300x240」不符） | floatwin.js CSS `.omg-fw{min-height:360px}` 与 content.js 传入 `minH:240` 不一致；内联 `height:240px` 被 CSS `min-height` 覆盖，计算高度恒 ≥360 | 将 CSS `min-height` 改为 240px（与 `minH` 对齐） | **已修复（fix pass：CSS min-height 改为 240px 与 minH 对齐）**，v1.1 新增 |
| DEF-6 | P3 | floatwin.js 注释 | 文件头注释称「Used both ... inside the side panel」，但侧边栏（surface.js 顶层）并未挂载 floatwin，仅网页 content 脚本使用 | 注释与实现不符（无害，易误导维护者） | 修正注释 | **已修复（fix pass：修正注释为准确描述）**，文档类 |
| DEF-7 | **P3** | 5 款游戏外壳 | 游戏内「‹ 返回」与悬浮球/侧边栏播放器栏的「‹ 返回」重叠显示（用户截图：两个返回） | 每个游戏 `index.html` 自带 `<button class="back" data-back>` 并绑定 `backToLauncher`，而外壳（popup.html / surface.html 播放器栏）已有 `#backBtn`；两套返回并存 | 删除 5 个游戏内的 `button.back[data-back]` 及各自 `game.js` 中 `querySelector('[data-back]')` 监听与 `backToLauncher`（外壳返回已覆盖返回语义） | **已修复（fix pass：移除游戏内返回按钮与 JS 绑定）** |
| DEF-8 | **P2** | 5 款游戏布局 + 2 外壳 iframe | 窗口放大后游戏底部控件（控制键 / 提示 / 难度栏 / 标雷模式）被遮挡、显示不全；放大窗口游戏不做适配、内容被挤出视口 | ① 外壳 iframe `scrolling="no"` 导致内容超高时无法滚动、底部被裁切；② 各游戏用固定 `aspect-ratio`/`max-width` 容器（tetris `1/2`、其余 `1/1`，max-width 420~560），在浮动窗/侧边栏高度变化时线性拉伸而非重排，控件被挤出 | ① 外壳 iframe 改 `scrolling="auto"`（兜底可滚）；② 各游戏 `.wrap` 改 `height:100%` flex 竖向列、`overflow:auto`；③ 播放区改 `flex:1 1 auto; min-height:0` 吸收剩余空间；④ 新增 `fit()`/`fitStage()` 以 `ResizeObserver` 实测容器尺寸，按 min(宽,高) 重算 canvas/棋盘像素（方块/棋盘随窗口等比缩放），底部控件恒定可见；俄罗斯方块 `CELL` 改为随容器动态计算 | **已修复（fix pass：移除重复返回 + 响应式重排 + ResizeObserver 重算）**，需在真机确认放大/缩小手感 |

> **P0 / P1：无。** 阻塞主流程与数据安全的问题均不存在。DEF-4/DEF-5/DEF-6 均为 P3 体验/一致性类，不阻断 v1.1 在普通网页上的核心可用性与上架。

---

## 6. 验收裁定

# 裁定：**有条件通过（Conditional Pass）**

**理由**：
1. 静态层全过（本环境真实执行）：v1.1 全部 6 个 JS `node --check` 通过；交互代码零 `https?://` 与零 `eval`；5 款游戏 `index.html` 齐备；manifest 合法；消息桥 origin 校验、双注入守卫、CSP 合规均经代码审查确认。
2. **无 P0 / P1 缺陷**：跨载体「继续玩」链路（球→窗→侧边栏）在代码层面闭合且安全，无阻断项。
3. 仅余 P2（DEF-1 扫雷缩放丢状态，MVP 遗留）与 P3（DEF-2/DEF-3 MVP 遗留）；v1.1 新增的 DEF-4/DEF-5/DEF-6 已在 fix pass 修复，均不阻断普通网页核心流程。
4. 但**运行期/手感/视觉/真实 `chrome.storage`/真实 `chrome.sidePanel`/`chrome.tabs.sendMessage` 行为**须经真机实测确认，故为「有条件通过」。

### 放行条件（须逐项满足）
- [ ] 所有 P0/P1 为空（当前满足）。
- [ ] 在真机 `chrome://extensions` → 开发者模式 → 加载未打包（指向 `.`）无报错；工具栏图标可打开侧边栏。
- [ ] §3 全部 F-/T- 用例在真机自测通过（或记录明确的真机失败项）。
- [ ] §4 边界用例 B-1~B-8 在真机确认。
- [x] DEF-5（高度下限 360 vs 240）、DEF-4（chrome:// 无反馈）、DEF-6（注释）已在 fix pass 修正（见 §5）。

### 遗留风险与上线后监控
- 真机未跑，手感/视觉/真实离线/Persist 以用户自测为准。
- chrome://、Web Store 场景为预期不支持区（B-1），上线文案应说明「仅在普通网页可用」。
- DEF-1（扫雷缩放丢状态）若在真机复现且影响体验，建议优先修（P2）。

---

## 7. 真机自测清单（Load unpacked 后 <2 分钟）

- [ ] 打开任意普通网页（如 example.com）→ 右下角出现 🎮 悬浮球。
- [ ] 单击球 → 弹出小窗并显示游戏目录。
- [ ] 拖标题栏移动小窗、拖右下角缩放 → 关闭后重开，位置/尺寸保持。
- [ ] 点 × 关闭 → 球仍在；再点球 → 小窗重现。
- [ ] 小窗内点一款游戏（如 2048）启动 → 关闭小窗 → 重开小窗，仍为 2048。
- [ ] 小窗内点「在侧边栏继续玩」→ 侧边栏打开且续玩同一游戏。
- [ ] 侧边栏点「开小窗」→ 当前网页弹出小窗。
- [ ] 拖悬浮球改位置 → 刷新页面后球在同位置。
- [ ] 开两个网页 → 各自有独立球/窗（互不串 DOM）。
- [ ] 切到 chrome:// 新标签页 → 悬浮球不出现（符合预期）。
- [ ] DevTools → Network 面板断网后重玩 → 零网络请求（离线）。
- [ ] 确认修复生效：chrome:// 点「开小窗」应弹「请在普通网页中打开小窗」；小窗高度可缩至 240px（DEF-4/DEF-5 已修）。
- [ ] **本轮修复确认（DEF-7/DEF-8）**：
  - [ ] 小窗 / 侧边栏内玩任意游戏，**只出现一个「‹ 返回」**（外壳播放器栏的那个），游戏画面内不再有第二个返回（DEF-7 已修）。
  - [ ] 放大浮动窗 / 侧边栏后，5 款游戏的**底部控件（方向键 / 提示 / 难度 / 标雷模式）完整可见、不被遮挡**，且棋盘/方块随窗口等比放大（DEF-8 已修）。
  - [ ] 缩小窗口到很小时，游戏仍可玩、控件不溢出、必要时外壳 iframe 可滚动兜底（DEF-8 已修）。

---

## 8. 诚实边界
本环境无浏览器，**无法跑真机 E2E / 手感 / 视觉 / 真实 `chrome.storage`/`chrome.sidePanel`**。所有「需在真机验证」项由用户完成；§1 静态层为测试专家真实执行结果；DEF-5/DEF-6 为代码级确定性结论（已验证）；其余「已验证(本环境)」为代码审查 + 静态检查结论。MVP 遗留 DEF-1~DEF-3 未经独立真机复现，列为「待真机确认」。
