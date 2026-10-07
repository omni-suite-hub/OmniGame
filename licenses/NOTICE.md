# NOTICE — 第三方与自研声明 (OmniGame)

本扩展 **OmniGame** 自身以 [MIT 许可证](./LICENSE) 发布（版权 © 2026 OmniGame contributors）。

## 关于内置游戏的来源（重要、请如实阅读）

本项目的硬约束是：**离线优先、零外部网络请求、响应式移动端体验、质量优先于数量**。
在"无法在本环境跑真机浏览器"的前提下，为了保证每一款游戏都满足上述约束、且无任何
被遗漏的外链或构建依赖，首批 4 款经典游戏采用的是 **为本项目全新编写、自包含、零依赖
的原创实现**，统一由本项目 MIT 许可证覆盖，而非从第三方仓库直接 fork 打包。

做出这一取舍的原因：

1. **零外链可证明性**：所有代码由我们逐字节编写，从构造上保证不含任何 `http(s)://`、
   CDN、外域字体/图片引用（见根目录验证步骤，全局 `grep` 确认无外部资源）。
2. **一致的移动端体验**：键盘 + 触摸滑动 + 屏幕按钮三套输入在 4 款游戏间保持一致，
   避免不同上游项目在移动端手感参差。
3. **可维护性 / 可替换性**：每款游戏以独立 `iframe` 隔离，目录结构统一
   （`games/<name>/{index.html,style.css,game.js}`）。若你更希望替换为某个特定的上游
   MIT 仓库，只需替换对应目录文件、保留 `../_shared/storage.js` 的调用约定即可，无需改动
   launcher。

| 游戏 | 目录 | 许可证 | 来源 |
|------|------|--------|------|
| 重力方阵 Gravitas 4 | `games/gravitas-4/` | MIT（本项目） | 自研原创博弈；旋转重力机制 + 智能 AI + WebRTC 局域网/跨网双人联机 |
| 方块死斗 Tetris Clash | `games/tetris-clash/` | MIT（本项目） | 原创实现；双人即时消行攻防互顶垃圾行死斗机制 |
| 暗箱轮盘 Hack Roulette | `games/hack-roulette/` | MIT（本项目） | 自研原创赛博终端心理博弈；实弹/虚弹概率 + 4种战术道具系统 |
| 2048 | `games/2048/` | MIT（本项目） | 原创实现；玩法机制向 Gabriele Cirulli 的 2048 致敬 |
| 贪吃蛇 Snake | `games/snake/` | MIT（本项目） | 原创实现；经典 Snake 玩法 |
| 扫雷 Minesweeper | `games/minesweeper/` | MIT（本项目） | 原创实现；经典 Minesweeper 玩法 |
| 俄罗斯方块 Tetris | `games/tetris/` | MIT（本项目） | 原创实现；经典 Tetris 玩法 |
| 画个完美的圆（自研签名 toy） | `games/perfect-circle/` | MIT（本项目） | 原创实现；开源生态中少见的"手绘圆评分"小游戏 |

> 所有内置代码均未使用 AGPL、未使用无许可证 / Codepen 默认授权 / itch 默认授权的素材。

## 共享模块

- `games/_shared/catalog.js` — 动态游戏目录管理器（OmniCatalog），支持内置离线游戏与免发版云端/自定义游戏热插拔。
- `games/_shared/storage.js` — 统一的进度/最佳分/Elo对战天梯持久化层，优先使用 `chrome.storage.local`，降级为 `localStorage`。
- `games/_shared/omni-net.js` — WebRTC P2P 端对端联机通信引擎，支持局域网雷达自动发现、6位房间密钥跨网直连与联机大厅 UI。
