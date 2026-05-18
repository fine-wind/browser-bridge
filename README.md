# 🦐 Browser Search Bridge

Firefox 插件 + 后端服务，让 AI Agent 通过真实浏览器进行搜索和信息采集。

## 架构

```
你/OpenClaw → ski: search-bridge → 后端 HTTP API → Firefox 插件 (WebSocket) → 浏览器 → 搜索结果
```

## 项目结构

```
firefox-addon/
├── server/               # 后端服务 (Node.js)
│   ├── package.json
│   ├── index.js          # 主入口
│   ├── config.js         # 配置
│   ├── websocket.js      # WebSocket 服务 (与插件通信)
│   └── api.js            # REST API (给 OpenClaw Skill 用)
├── extension/            # Firefox 插件
│   ├── manifest.json
│   ├── background.js     # 后台脚本 (WebSocket 客户端)
│   ├── content.js        # 内容脚本
│   ├── icons/
│   └── popup/            # 弹窗 UI
└── README.md
```

## 通信流程

1. OpenClaw Skill 调用 `POST /api/search`
2. 后端通过 WebSocket 推送任务给插件
3. 插件在浏览器中执行搜索，提取结果
4. 插件通过 WebSocket 返回结果
5. 后端返回给 Skill
