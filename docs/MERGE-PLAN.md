# Browser Bridge 合并方案（2026-09-14）

## 背景

本机现有三个浏览器自动化项目，功能重叠、各自半成品：

| 项目 | 位置 | 内容 | 状态 |
|------|------|------|------|
| browser-extension | D:\workspaces\browser-extension | Chrome CDP 控制，15 个 MCP 工具（TypeScript，stdio） | 2026-07-20 建，源码已停更，被 browser-agent fork |
| browser-agent | D:\workspaces\browser-agent | browser-extension + DeepSeek 对话控制，22 个 MCP 工具（TypeScript，stdio） | 2026-09-11 建，本地最新 |
| browser-bridge | D:\workspaces\browser-bridge | Node 后端（HTTP 19877 / WS 19876）+ Firefox MV3 扩展，操作真实浏览器 | 2026-09-14 从 GitHub fine-wind/browser-bridge clone |

老板指令：把 browser-agent 和 browser-extension 合并到 browser-bridge 项目上。

## 目标形态

browser-bridge 成为**唯一**的浏览器自动化项目，对外两种接口、内部三条通道：

```
                        ┌──────────────────────────────┐
   Hermes (MCP stdio) ──▶│                              │
                        │   server/ (Node)             │
   脚本 / curl (HTTP) ──▶│   · HTTP API   :19877        │
                        │   · WS 扩展通道 :19876        │
                        │   · MCP stdio 门面            │
                        └───────┬──────────┬───────────┘
                                │          │
                 Firefox 扩展 ──┘          └── Chrome CDP (:9222)
                 （真实登录态）                 （干净环境/无人值守）
                                │
                          DeepSeek 对话控制（走 CDP / 页面 DOM）
```

- **Firefox 通道**：真实登录态，浏览器桥原生能力（search / open_url / click / type / extract / eval…）
- **CDP 通道**：从 browser-agent 的 `src/cdp-controller.ts` 移植，控 Chrome（导航/点击/输入/截图/DOM/JS/标签页）
- **DeepSeek 通道**：从 browser-agent 的 `src/deepseek.ts` 移植（打开对话/发消息/等回复/取历史/导出）

## 目录结构（目标）

```
browser-bridge/
├── server/
│   ├── index.js          # 启动 HTTP + WS；--mcp 时走 stdio MCP
│   ├── config.js         # 端口/超时（已存在）
│   ├── api.js            # HTTP 路由：/api/{action}（合并后覆盖全部动作）
│   ├── websocket.js      # 扩展通道（含待修 bug，见下）
│   ├── actions/
│   │   ├── index.js      # 统一动作注册表：name → { handler, channel, schema }
│   │   ├── firefox.js    # 扩展类动作（沿用现有 WS 协议，不改）
│   │   ├── cdp.js        # 由 browser-agent/dist/cdp-controller.js 移植
│   │   └── deepseek.js   # 由 browser-agent/dist/deepseek.js 移植
│   ├── mcp.js            # MCP stdio 门面：把动作注册表暴露为工具
│   └── package.json
├── extension/            # Firefox MV3 扩展（保留，修 bug）
├── tests/
│   └── smoke.sh          # 冒烟：脚本/批量 均可跑
├── docs/MERGE-PLAN.md    # 本文件
└── README.md             # 更新为合并后的说明
```

## 必须修复的既有缺陷（实测证据见 boss-log 2026-09-14）

1. `content.js` extract_page_text 返回空：`isNoiseAncestor` 里任一祖先 display:none/visibility:hidden 就整段丢弃，现代站点（Bing 等）会全军覆没 → 改为只对直接父元素判隐藏（用 `getClientRects().length === 0`），其余层级只用噪音关键词过滤。
2. `content.js` 对 SVG 元素 `className.toLowerCase()` 崩溃（SVGAnimatedString 是对象）→ 统一走 `getClassName()` helper（字符串 / `.baseVal` / 空串）。
3. `content.js` doEval 恒 null：扩展 manifest CSP 禁 `new Function` → 给 `content_security_policy.extension_pages` 的 script-src 加 `'unsafe-eval'`；或改用 `browser.scripting.executeScript({world:'MAIN'})`。
4. `background.js` executeScript 兜底用 MV2 的 `browser.tabs.executeScript`（MV3 已删除）→ 改用 `browser.scripting.executeScript`。
5. `background.js` extractData 读 `result.data`，content 直接返回数据本身 → 字段不匹配，永远返回 `{}` → 统一响应结构 `{ data }`。
6. 新建标签后立刻 sendMessage 会 "Receiving end does not exist" → 加 3 次 ×300ms 重试（内容脚本未注入时）。
7. `server/websocket.js` 任何客户端 close 都无条件 `this.extension = null` → 改为只在 `ws === this.extension` 时清空。
8. MV3 后台脚本被挂起导致掉线不重连 → background 用 `browser.alarms`（1 分钟）做 keep-alive + 重连兜底。

## 验收标准（可度量，必须全部实测）

- [ ] `cd server && npm install && npm start` → 19876 / 19877 均监听
- [ ] `GET /api/status` 返回 `{connected,pendingTasks}`
- [ ] `POST /api/{search,list_tabs,open_url,get_page_content,click,type,extract,eval,scroll,close_tab,close_all,scan_tabs,batch}` 全部有路由；未知动作 404
- [ ] Firefox 扩展未连接时，扩展类动作返回明确错误（不崩服务）
- [ ] MCP：`node server/mcp.js` 走 stdio，`initialize` + `tools/list` 返回 ≥ 30 个工具，覆盖 firefox / cdp / deepseek 三类
- [ ] CDP：Chrome 以 9222 启动时 `browser_navigate` + `browser_get_page_info` 可用；Chrome 未启动时返回清晰错误
- [ ] DeepSeek：`deepseek_check_login` 可用（未登录返回明确状态）
- [ ] `bash tests/smoke.sh` 全绿（含假扩展客户端回归，脚本可重复运行）
- [ ] browser-agent / browser-extension 各加 `DEPRECATED.md` 指向 browser-bridge（目录不删）

## 约束

- 不修改 Firefox 扩展与后端之间的 WS 消息协议（`{type:"task",taskId,action,payload}` / `{type:"task_result",taskId,result}`）
- HTTP 路径保持 `/api/{action}` 兼容，原有动作名不变
- 端口不变：WS 19876 / HTTP 19877 / Chrome CDP 9222
- 依赖尽量少（现有仅 `ws`；CDP 移植若需要 `chrome-remote-interface` 可用 browser-agent 里已装好的版本）
