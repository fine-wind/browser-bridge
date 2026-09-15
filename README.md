# 🦐 Browser Bridge

统一浏览器自动化项目 — HTTP API + WebSocket + MCP 三种接口

## 架构

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

## 项目结构

```
browser-bridge/
├── server/
│   ├── index.js          # 启动 HTTP + WS
│   ├── config.js         # 配置（端口、超时）
│   ├── api.js            # HTTP API 路由
│   ├── websocket.js      # WebSocket 服务
│   ├── mcp.js            # MCP stdio 门面
│   └── actions/
│       ├── index.js      # 统一动作注册表
│       ├── firefox.js    # Firefox 通道动作定义（14个）
│       ├── cdp.js        # CDP 通道动作（14个）
│       └── deepseek.js   # DeepSeek 通道动作（7个）
├── extension/            # Firefox MV3 扩展
│   ├── manifest.json     # 扩展清单
│   ├── background.js     # WebSocket 客户端 + 标签页管理器
│   ├── content.js        # 页面内容提取 + 操作
│   ├── popup/            # 弹窗 UI
│   └── updates.json      # 自动更新配置
├── scripts/
│   ├── build.sh          # 打包脚本
│   └── zip.js            # ZIP 打包工具
├── tests/
│   └── smoke.sh          # 冒烟测试
├── skill/                # Hermes 技能定义
│   ├── SKILL.md
│   └── config.json
├── docs/
│   └── TECHNICAL.md      # 完整技术文档
└── releases/             # 发布产物
    └── browser-bridge-1.2.0.xpi
```

## 快速开始

### 启动服务

```bash
cd D:/workspaces/browser-bridge/server
npm install
npm start
```

服务启动后：
- HTTP API: http://localhost:19877
- WebSocket: ws://localhost:19876

### 安装 Firefox 扩展

1. 打开 Firefox，访问 `about:debugging#/runtime/this-firefox`
2. 点击"临时加载附加组件"
3. 选择 `extension/manifest.json`

### 安装 Chrome CDP（可选）

```bash
chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-cdp
```

### 测试

```bash
curl http://localhost:19877/api/status
# {"connected":true,"pendingTasks":0}

curl -X POST http://localhost:19877/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"test","engine":"duckduckgo"}'
```

## API 接口概览

### Firefox 通道（15个动作）

| 动作 | 说明 |
|------|------|
| `search` | 搜索引擎查询（支持15引擎） |
| `list_tabs` | 列出标签页 |
| `open_url` | 打开URL并提取内容 |
| `open_pages` | 批量打开多个页面 |
| `get_page_content` | 获取页面正文文本 |
| `click` | 点击元素 |
| `type` | 输入文本 |
| `extract` | 按规则提取数据 |
| `eval` | 执行自定义JavaScript |
| `scroll` | 滚动页面 |
| `close_tab` | 关闭标签页 |
| `close_all` | 关闭分组所有标签页 |
| `scan_tabs` | 扫描浏览器所有标签页 |
| `ping` | 心跳检测 |

### CDP 通道（14个动作）

| 动作 | 说明 |
|------|------|
| `browser_navigate` | 导航到URL |
| `browser_click` | 点击元素 |
| `browser_type` | 输入文本 |
| `browser_screenshot` | 截图 |
| `browser_get_dom` | 获取DOM |
| `browser_evaluate` | 执行JS |
| `browser_get_tabs` | 列出标签页 |
| `browser_switch_tab` | 切换标签页 |
| `browser_new_tab` | 新建标签页 |
| `browser_scroll` | 滚动页面 |
| `browser_back` | 后退 |
| `browser_forward` | 前进 |
| `browser_reload` | 刷新 |
| `browser_get_page_info` | 获取页面信息 |

### DeepSeek 通道（7个动作）

| 动作 | 说明 |
|------|------|
| `deepseek_open_chat` | 打开聊天页面 |
| `deepseek_send_message` | 发送消息 |
| `deepseek_wait_reply` | 等待回复 |
| `deepseek_get_history` | 获取对话历史 |
| `deepseek_new_chat` | 新建对话 |
| `deepseek_check_login` | 检查登录状态 |
| `deepseek_export` | 导出对话 |

## 详细文档

完整技术文档见 [docs/TECHNICAL.md](./docs/TECHNICAL.md)

## 依赖

- Node.js >= 18
- Firefox（扩展运行环境）
- Chrome（CDP 控制，可选）

## 测试

```bash
bash tests/smoke.sh
```

## 版本

- 当前版本：1.2.0
- 扩展 ID：`search-bridge@shrimp.dev`
- 最低 Firefox 版本：109.0
