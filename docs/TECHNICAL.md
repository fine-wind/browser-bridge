# Browser Bridge 技术文档

## 一、项目概述

Browser Bridge（代码虾）是一个统一浏览器自动化项目，提供三种接口：**HTTP API**、**WebSocket**、**MCP stdio**，支持三条通道：Firefox 扩展（真实登录态）、Chrome CDP（干净环境/无人值守）、DeepSeek 对话控制。

**版本：** 1.2.0  
**项目位置：** `D:\workspaces\browser-bridge`

---

## 二、架构

```
                        ┌──────────────────────────────┐
   Hermes (MCP stdio) ──▶│                              │
                        │   server/ (Node.js ESM)      │
   脚本 / curl (HTTP) ──▶│   · HTTP API   :19877        │
                        │   · WS 扩展通道 :19876        │
                        │   · MCP stdio 门面           │
                        └───────┬──────────┬───────────┘
                                │          │
                 Firefox 扩展 ──┘          └── Chrome CDP (:9222)
                 （真实登录态）                 （干净环境/无人值守）
                                │
                          DeepSeek 对话控制（走 CDP / 页面 DOM）
```

### 核心组件

| 组件 | 路径 | 职责 |
|------|------|------|
| 后端服务 | `server/index.js` | 启动 HTTP + WS 双服务 |
| WebSocket 服务 | `server/websocket.js` | `BridgeWS` 类，管理 Firefox 扩展连接 |
| HTTP API | `server/api.js` | `BridgeAPI` 类，路由 `/api/{action}` |
| 动作注册表 | `server/actions/index.js` | 统一动作分发，合并三通道 |
| Firefox 动作 | `server/actions/firefox.js` | 扩展类动作定义（15个） |
| CDP 动作 | `server/actions/cdp.js` | Chrome 控制动作（14个） |
| DeepSeek 动作 | `server/actions/deepseek.js` | AI 对话控制动作（7个） |
| MCP 门面 | `server/mcp.js` | stdio 模式，将动作暴露为 MCP 工具 |
| Firefox 扩展 | `extension/background.js` | WebSocket 客户端 + 标签页管理器 |
| 内容脚本 | `extension/content.js` | 页面内容提取 + 点击/输入/执行JS |
| 扩展清单 | `extension/manifest.json` | MV3 配置，ID: `search-bridge@shrimp.dev` |

---

## 三、依赖与启动

### 依赖

```json
{
  "name": "@shrimp/search-bridge-server",
  "version": "2.0.0",
  "type": "module",
  "dependencies": {
    "ws": "^8.18.0",
    "chrome-remote-interface": "^0.33.3",
    "@modelcontextprotocol/sdk": "^1.12.1",
    "zod": "^4.4.3"
  }
}
```

### 启动后端

```bash
cd D:/workspaces/browser-bridge/server
npm install
npm start
# 或开发模式
npm run dev
```

### 启动 MCP 模式（独立进程）

```bash
node server/mcp.js
# 环境变量 BRIDGE_HTTP 可指定 API 地址，默认 http://localhost:19876
```

### 安装 Firefox 扩展

1. 打开 Firefox，访问 `about:debugging#/runtime/this-firefox`
2. 点击"临时加载附加组件"
3. 选择 `D:\workspaces\browser-bridge\extension\manifest.json`

### 安装 Chrome CDP（可选）

```bash
# 用调试端口启动 Chrome
chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-cdp
```

---

## 四、配置

**文件：** `server/config.js`

```javascript
export const config = {
  wsPort: parseInt(process.env.WS_PORT || "19876", 10),
  httpPort: parseInt(process.env.HTTP_PORT || "19877", 10),
  taskTimeout: parseInt(process.env.TASK_TIMEOUT || "120000", 10),
};
```

可通过环境变量覆盖：`WS_PORT`、`HTTP_PORT`、`TASK_TIMEOUT`（毫秒，默认120秒）。

---

## 五、API 接口

### 状态检查

```http
GET http://localhost:19877/api/status
```

返回：
```json
{"connected": true, "pendingTasks": 0}
```

### 统一请求格式

所有动作统一 POST 请求，路径 `/api/{actionName}`，请求体 JSON。

### Firefox 通道动作（15个）

| 动作名 | 扩展侧名 | 说明 | 参数 |
|--------|----------|------|------|
| `search` | search | 搜索引擎查询（支持15引擎） | query, engine, count |
| `list_tabs` | list_tabs | 列出标签页 | - |
| `open_url` | open_url | 打开URL并提取内容 | url, id, groupId |
| `open_pages` | open_pages | 批量打开多个页面 | pages[], groupId |
| `get_page_content` | get_page_content | 获取页面正文文本 | tabId/id/url/groupId |
| `click` | click_element | 点击元素 | tabId/id/groupId, selector, selectorType |
| `type` | type_text | 在输入框输入文本 | tabId/id/groupId, selector, text, selectorType |
| `extract` | extract_data | 按规则提取数据 | tabId/id/groupId, rules[] |
| `eval` | execute_script | 执行自定义JavaScript | tabId/id/groupId, code |
| `scroll` | scroll_page | 滚动页面 | tabId/id/groupId, direction, amount |
| `close_tab` | close_tab | 关闭标签页 | tabId/id/groupId |
| `close_all` | close_all_tabs | 关闭分组所有标签页 | groupId |
| `close_all_tabs` | close_all_tabs | 关闭所有标签页 | - |
| `scan_tabs` | scan_tabs | 扫描浏览器所有标签页 | groupId, filterUrl, filterTitle |
| `ping` | ping | 心跳检测 | - |

**搜索引擎列表：** google, baidu, bing, duckduckgo, brave, yandex, ecosia, startpage, qwant, swisscows, mojeek, gigablast, kagi, presearch, searxng

**selectorType 可选值：** `css`（默认）、`xpath`、`text`

**direction 可选值：** `up`、`down`、`left`、`right`

### CDP 通道动作（14个）

| 动作名 | 说明 | 参数 |
|--------|------|------|
| `browser_navigate` | 导航到URL | url, waitUntil |
| `browser_click` | 点击元素 | selector, timeout |
| `browser_type` | 输入文本 | selector, text, clear |
| `browser_screenshot` | 截图 | - |
| `browser_get_dom` | 获取DOM（扁平化） | depth |
| `browser_evaluate` | 执行JavaScript | expression |
| `browser_get_tabs` | 列出标签页 | - |
| `browser_switch_tab` | 切换标签页 | tabId |
| `browser_new_tab` | 新建标签页 | url |
| `browser_scroll` | 滚动页面 | direction, amount |
| `browser_back` | 后退 | - |
| `browser_forward` | 前进 | - |
| `browser_reload` | 刷新 | - |
| `browser_get_page_info` | 获取页面信息 | - |

**waitUntil 可选值：** `load`（默认）、`domcontentloaded`、`networkidle0`、`networkidle2`

### DeepSeek 通道动作（7个）

| 动作名 | 说明 | 参数 |
|--------|------|------|
| `deepseek_open_chat` | 打开聊天页面 | - |
| `deepseek_send_message` | 发送消息 | text |
| `deepseek_wait_reply` | 等待回复 | timeout |
| `deepseek_get_history` | 获取对话历史 | - |
| `deepseek_new_chat` | 新建对话 | - |
| `deepseek_check_login` | 检查登录状态 | - |
| `deepseek_export` | 导出对话 | - |

### 特殊路由

| 路由 | 处理方式 |
|------|----------|
| `/api/status` | 直接返回连接状态，不走动作注册表 |
| `/api/batch` | Server 侧处理批量操作，不走 WebSocket |
| `/api/close_all_tabs` | 需要扩展连接，特殊处理 |

---

## 六、MCP 集成

### 工作原理

MCP 门面（`server/mcp.js`）**不直接连接 WebSocket**，而是通过 HTTP 转发到常驻的 `server/index.js`。这样避免端口竞争和扩展只能连接一个的问题。

### 配置 Hermes

在 `~/.hermes/config.yaml` 中添加：

```yaml
mcp_servers:
  browser-bridge:
    type: stdio
    command: node
    args:
      - D:/workspaces/browser-bridge/server/mcp.js
    env:
      BRIDGE_HTTP: http://localhost:19877
```

### 工具数量

共 **36 个工具**：
- Firefox 通道：15 个
- CDP 通道：14 个
- DeepSeek 通道：7 个

---

## 七、Firefox 扩展架构

### background.js（726行）

**核心模块：**

1. **TabManager** — 标签页管理器
   - `_tabs: Map<tabId, {url, title, groupId, id, openedAt}>`
   - 方法：`register()`, `refresh()`, `findById()`, `findByGroup()`, `remove()`, `clear()`, `getStatus()`
   - 监听 `browser.tabs.onRemoved` 和 `browser.tabs.onUpdated` 自动同步

2. **WebSocket 连接**
   - 连接 `ws://localhost:19876`
   - 发送 `{type: "connected"}` 握手
   - 接收 `{type: "task", taskId, action, payload}` 任务
   - 发送 `{type: "task_result", taskId, result}` 或 `{type: "task_error", taskId, error}` 响应

3. **任务处理**
   - `handleTask(msg)` 分发到各 action 函数
   - 重试机制：新建标签页时 content script 可能未注入，最多重试6次，间隔400ms

4. **自愈机制**
   - `ensureConnected()`：用户浏览动作触发重连
   - `browser.alarms` keep-alive：每分钟检查一次连接状态

### content.js（581行）

**监听消息类型：**
- `extract_search_results` — 提取搜索结果
- `extract_page_text` — 提取页面正文
- `execute_action` — 执行操作（click/type/extract/scroll/eval）

**核心功能：**

1. **搜索结果提取**（15个搜索引擎）
   - Google: `div.g, div[data-hveid]`
   - Baidu: `#content_left .result, .result-op`
   - Bing: 多选择器回退
   - DuckDuckGo: `article[data-testid='result']`
   - 其他：generic fallback

2. **页面正文提取** (`extractPageText`)
   - TreeWalker 遍历，过滤 script/style/svg/nav/header/footer
   - 噪音关键词过滤（sidebar, ad-, cookie, banner...）
   - 保留段落结构（跨块级元素加空行）
   - 截断上限 30000 字符

3. **元素操作**
   - `doClick(selector, type)` — 支持 css/xpath/text 定位
   - `doType(selector, text, type)` — 清空后输入，触发 input/change 事件
   - `doExtract(rules)` — 按规则提取文本/html/attr/href/src
   - `doScroll(direction, amount)` — 平滑滚动
   - `doEval(code)` — 执行自定义 JS（CSP 兼容）

---

## 八、CDP 控制器

**文件：** `server/actions/cdp.js`

**CDPController 类：**

```javascript
class CDPController {
  constructor(options = {});       // host, port
  async connect();                 // 连接到 Chrome
  async navigate(url, waitUntil);  // 导航
  async click(selector, timeout);  // 点击（支持 CSS/XPath/text）
  async type(selector, text, clear); // 输入
  async screenshot();              // 截图
  async getDOM(depth);             // 扁平化 DOM
  async evaluate(expression);      // 执行 JS
  async switchTab(targetId);       // 切换标签页
  async newTab(url);               // 新建标签页
  async scroll(direction, amount); // 滚动
  async disconnect();              // 断开连接
}
```

**选择器解析：**
- `text:"..."` — 文本匹配（可见元素）
- `//...` — XPath 表达式
- 其他 — CSS 选择器

---

## 九、DeepSeek 控制器

**文件：** `server/actions/deepseek.js`

**DeepSeekController 类：**

```javascript
class DeepSeekController {
  async openChat();              // 打开 https://chat.deepseek.com
  async sendMessage(text);       // 发送消息
  async waitForReply(timeout);   // 等待回复（轮询 DOM）
  async getConversationHistory();// 获取对话历史
  async newChat();               // 新建对话
  async checkLoginStatus();      // 检查登录状态
  async exportConversation();    // 导出对话为 JSON
}
```

**选择器：**
- 输入框：`.deepseek-chat-input, [placeholder*="发送"]`
- AI 回复：`.deepseek-message-ai, .prose, [class*="message"]`
- 新建按钮：`.new-chat-btn, [aria-label*="新建"], text:"新建对话"`

---

## 十、消息协议

### WebSocket 消息格式

**客户端 → 服务端：**
```json
{"type": "connected"}                    // 握手
{"type": "task_result", "taskId": "...", "result": {...}}  // 任务结果
{"type": "task_error", "taskId": "...", "error": "..."}    // 任务错误
{"type": "tab_status", "tabs": [...]}    // 标签页状态同步
{"type": "pong"}                         // 心跳
```

**服务端 → 客户端：**
```json
{"type": "task", "taskId": "...", "action": "...", "payload": {...}}
```

### HTTP 响应格式

成功：
```json
{"result": {...}}
```

错误：
```json
{"error": "Firefox 插件未连接"}
{"error": "未知动作: xxx"}
{"error": "connect ECONNREFUSED 127.0.0.1:9222"}
```

---

## 十一、批量操作

**路由：** `POST /api/batch`

```json
{
  "steps": [
    {"action": "open_pages", "params": {"pages": [{"url": "https://example.com", "id": "p1"}], "groupId": "demo"}},
    {"action": "get_page_content", "params": {}},
    {"action": "click", "params": {"selector": "a.more"}},
    {"action": "get_page_content", "params": {}},
    {"action": "close_all", "params": {}}
  ]
}
```

**自动 tabId 传递：** 如果下一步未指定 tabId，自动使用上一步结果的 tabId。

---

## 十二、已修复的 Bug

| # | 问题 | 修复 |
|---|------|------|
| 1 | content.js extract_page_text 返回空 | 改为只检查直接父元素隐藏状态，不按祖先层级递归判 |
| 2 | SVG className 崩溃 | 添加 getClassName helper，处理字符串/`baseVal`/空串 |
| 3 | doEval 恒 null | 扩展 CSP 不允许 unsafe-eval，改用 browser.scripting.executeScript 在页面主世界执行 |
| 4 | executeScript MV2 API | 改用 browser.scripting.executeScript |
| 5 | extractData 字段不匹配 | 统一响应结构 `{data: ...}` |
| 6 | 新建标签页 sendMessage 失败 | 添加 6 次 × 400ms 重试机制 |
| 7 | WebSocket close 误清空 | 只在 `ws === this.extension` 时清空 |
| 8 | 后台脚本挂起掉线 | 添加 alarms keep-alive（1分钟周期） |

---

## 十三、测试

### 冒烟测试

```bash
cd D:/workspaces/browser-bridge
bash tests/smoke.sh
```

测试项：
1. 服务器启动
2. GET /api/status
3. 未知动作 404
4. 扩展未连接时返回明确错误
5. 各动作路由存在性
6. CDP 未连接时返回错误
7. DeepSeek 动作路由
8. 假扩展客户端通信（需运行 server 实例）

### 手动测试

```bash
# 启动服务
cd server && npm start

# 测试 search
curl -X POST http://localhost:19877/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"test","engine":"duckduckgo"}'

# 测试状态
curl http://localhost:19877/api/status
```

---

## 十四、发布

### 打包 XPI

```bash
python3 -c "
import zipfile, os
src = r'D:\workspaces\browser-bridge\extension'
dst = r'D:\workspaces\browser-bridge\releases\browser-bridge-1.2.0.xpi'
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d not in ['.git', 'node_modules', 'releases']]
        for f in files:
            full = os.path.join(root, f)
            arcname = os.path.relpath(full, src)
            zf.write(full, arcname)
"
```

### 文件清单

| 文件 | 大小 | 说明 |
|------|------|------|
| `browser-bridge-1.2.0.xpi` | ~16KB | Firefox 扩展包 |
| `extension/updates.json` | 320B | 自动更新配置 |
| `extension/manifest.json` | 1.1KB | MV3 清单 |
| `extension/background.js` | 24KB | 背景脚本 |
| `extension/content.js` | 20KB | 内容脚本 |
| `extension/popup/` | 3KB | 弹窗 UI |

### SHA256

```
browser-bridge-1.2.0.xpi: 5b283b370345d0deb36dd7a8ec3512aaff47b59493a2a8c60f995500736a14d7
```

---

## 十五、注意事项

1. **路径问题**：Windows git-bash 下 MSYS 会将 `/d/...` 转成 `D:\d\...`，导致 MODULE_NOT_FOUND。打包脚本需用 `pwd -W` 或 Python 原生路径。

2. **扩展安装**：Firefox 扩展必须手动在 `about:debugging` 加载，Agent 无法代劳。

3. **扩展重连**：Firefox 会挂起 MV3 后台脚本，但扩展会周期性重连。服务端 `tab_status` 消息未处理，仅日志记录。

4. **CDP 端口**：默认 9222，需 Chrome 以 `--remote-debugging-port=9222` 启动。

5. **MCP 接入**：源码存在 ≠ Agent 能调用，需在 `~/.hermes/config.yaml` 配置 `mcp_servers`。

6. **浏览器选择**：
   - 需要登录态/反爬 → Firefox 扩展桥
   - 无人值守/批量 → Chrome CDP
