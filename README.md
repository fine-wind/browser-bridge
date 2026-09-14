# 🦐 Browser Bridge

统一浏览器自动化项目 — HTTP API + WebSocket + MCP 三种接口

## 架构

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

## 项目结构

```
browser-bridge/
├── server/
│   ├── index.js          # 启动 HTTP + WS
│   ├── config.js         # 配置
│   ├── api.js            # HTTP API 路由
│   ├── websocket.js      # WebSocket 服务
│   ├── mcp.js            # MCP stdio 门面
│   └── actions/
│       ├── index.js      # 统一动作注册表
│       ├── firefox.js    # Firefox 通道动作定义
│       ├── cdp.js        # CDP 通道动作（Chrome控制）
│       └── deepseek.js   # DeepSeek 通道动作
├── extension/            # Firefox MV3 扩展
│   ├── manifest.json
│   ├── background.js     # WebSocket 客户端
│   ├── content.js        # 页面内容脚本
│   └── popup/            # 弹窗 UI
├── tests/
│   └── smoke.sh          # 冒烟测试
└── README.md
```

## 快速开始

### 启动服务

```bash
cd server
npm install
npm start
```

服务启动后：
- HTTP API: http://localhost:19877
- WebSocket: ws://localhost:19876

### MCP 模式

```bash
cd server
node mcp.js
```

### 安装扩展

1. 打开 Firefox，访问 `about:debugging`
2. 点击"此 Firefox 中" → "临时加载附加组件"
3. 选择 `extension/manifest.json`

## API 接口

### 状态检查
```bash
curl http://localhost:19877/api/status
```

### Firefox 通道动作
| 动作 | 说明 |
|------|------|
| search | 搜索引擎查询 |
| list_tabs | 列出标签页 |
| open_url | 打开URL |
| get_page_content | 获取页面内容 |
| click | 点击元素 |
| type | 输入文本 |
| extract | 提取数据 |
| eval | 执行JS |
| scroll | 滚动页面 |
| close_tab | 关闭标签页 |
| scan_tabs | 扫描所有标签页 |
| batch | 批量操作 |

### CDP 通道动作（需要 Chrome 以 --remote-debugging-port=9222 启动）
| 动作 | 说明 |
|------|------|
| browser_navigate | 导航到URL |
| browser_click | 点击元素 |
| browser_type | 输入文本 |
| browser_screenshot | 截图 |
| browser_get_dom | 获取DOM |
| browser_evaluate | 执行JS |
| browser_get_tabs | 列出标签页 |
| browser_switch_tab | 切换标签页 |
| browser_new_tab | 新建标签页 |
| browser_scroll | 滚动页面 |
| browser_back | 后退 |
| browser_forward | 前进 |
| browser_reload | 刷新 |
| browser_get_page_info | 获取页面信息 |

### DeepSeek 通道动作
| 动作 | 说明 |
|------|------|
| deepseek_open_chat | 打开聊天页面 |
| deepseek_send_message | 发送消息 |
| deepseek_wait_reply | 等待回复 |
| deepseek_get_history | 获取对话历史 |
| deepseek_new_chat | 新建对话 |
| deepseek_check_login | 检查登录状态 |
| deepseek_export | 导出对话 |

## 修复的 Bug

1. **content.js extract_page_text 返回空**: 改为只检查直接父元素隐藏状态
2. **SVG className 崩溃**: 添加 getClassName helper 函数
3. **doEval 恒 null**: manifest CSP 添加 'unsafe-eval'
4. **executeScript MV2 API**: 改用 browser.scripting.executeScript
5. **extractData 字段不匹配**: 统一响应结构
6. **新建标签页 sendMessage 失败**: 添加重试机制
7. **WebSocket close 误清空**: 只在当前连接断开时清空
8. **后台脚本挂起**: 添加 alarms keep-alive

## 测试

```bash
bash tests/smoke.sh
```

## 依赖

- Node.js >= 18
- Firefox (扩展运行环境)
- Chrome (CDP 控制，可选)
