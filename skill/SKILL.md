# 🦐 Browser Bridge

通过 Firefox 扩展在真实浏览器中执行操作，包括搜索、浏览、页面操作和标签管理。

## 依赖

- 后端服务：`curl -s http://localhost:19877/api/status`
- Firefox 扩展需已加载并连接 WebSocket

## 检查状态

```json
GET http://localhost:19877/api/status
```

返回：`{"connected":true,"pendingTasks":0}`

## API

### `list_tabs` — 列出所有已打开的标签页

```json
POST http://localhost:19877/api/list_tabs
{}
```

返回所有标签页的 title、url、tabId、groupId。

### `search` — 搜索

```json
POST http://localhost:19877/api/search
{
  "query": "搜索内容",
  "engine": "google",
  "count": 5
}
```

支持搜索引擎：`google`, `baidu`, `bing`, `duckduckgo`

### `open_url` — 打开 URL 并返回页面内容

```json
POST http://localhost:19877/api/open_url
{
  "url": "https://example.com",
  "id": "my_page",
  "groupId": "browse"
}
```
- `id`: 可选，自定义标签页标识
- `groupId`: 可选，分组名（默认 `"browse"`）
- `tabId`, `id`, `groupId` 可在后续操作中用于定位该标签页

### `open_pages` — 同时打开多个页面

```json
POST http://localhost:19877/api/open_pages
{
  "pages": [
    {"url": "https://example.com", "id": "page1"},
    {"url": "https://example.org", "id": "page2"}
  ],
  "groupId": "my_group"
}
```

### `get_page_content` — 获取页面内容

```json
POST http://localhost:19877/api/get_page_content
{
  "tabId": 95
}
```

也可用 `id`、`url` 或 `groupId` 定位标签页。

### `close_tab` — 关闭标签页

```json
POST http://localhost:19877/api/close_tab
{
  "tabId": 95
}
```

也可用 `id` 或 `groupId` 定位。

### `close_all` — 关闭所有标签页

```json
POST http://localhost:19877/api/close_all
{}
```

### `click` — 点击元素

```json
POST http://localhost:19877/api/click
{
  "tabId": 95,
  "selector": "button.submit"
}
```

### `type` — 输入文字

```json
POST http://localhost:19877/api/type
{
  "tabId": 95,
  "selector": "input#search",
  "text": "hello world"
}
```

### `extract` — 提取数据

```json
POST http://localhost:19877/api/extract
{
  "tabId": 95,
  "rules": [
    {"name": "title", "selector": "h1", "attr": "textContent"}
  ]
}
```

### `scroll` — 滚动页面

```json
POST http://localhost:19877/api/scroll
{
  "tabId": 95,
  "direction": "down",
  "amount": 500
}
```

### `eval` — 执行 JavaScript

```json
POST http://localhost:19877/api/eval
{
  "tabId": 95,
  "code": "document.title"
}
```

### `batch` — 批量操作

一次执行多个步骤，自动传递 tabId：

```json
POST http://localhost:19877/api/batch
{
  "steps": [
    {"action": "open_pages", "params": {"pages": [{"url": "https://example.com", "id": "page1"}], "groupId": "demo"}},
    {"action": "get_page_content", "params": {}},
    {"action": "click", "params": {"selector": "a.more"}},
    {"action": "get_page_content", "params": {}},
    {"action": "close_all", "params": {}}
  ]
}
```

### `scan_tabs` — 扫描浏览器所有标签页

```json
POST http://localhost:19877/api/scan_tabs
{
  "groupId": "browser",
  "filterUrl": "github",
  "filterTitle": ""
}
```

扫描后自动注册到 TabManager，后续可通过 id/groupId 操作。

## 定位标签页

以下 API 统一支持通过以下方式定位标签页：
- `tabId`: 直接传 Firefox tabId
- `id`: 自定义标识（open_url/open_pages 时传入）
- `groupId`: 分组名
- `url`: URL 包含匹配（仅 get_page_content 支持）

优先级：`tabId` > `id` > `groupId` > `url`
