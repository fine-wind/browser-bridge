// ============================================================
// Firefox 通道动作 — 复用现有 WebSocket 协议
// ============================================================

// Firefox通道动作通过websocket发送，这里只定义schema供MCP使用
// 注意 extensionAction：HTTP/MCP 侧的动作名与扩展侧的动作名不一致，
// 发 WS 任务时必须用扩展认识的名字，否则扩展回 "未知任务: xxx"。
export const firefoxActions = {
  search: {
    extensionAction: 'search',
    schema: { 
      query: 'string', 
      engine: 'string', // google, baidu, bing, duckduckgo, brave, yandex, ecosia, startpage, qwant, swisscows, mojeek, gigablast, kagi, presearch, searxng
      count: 'number' 
    },
    description: '搜索：在浏览器中执行搜索并提取结果（支持15个搜索引擎）'
  },
  list_tabs: {
    extensionAction: 'list_tabs',
    schema: {},
    description: '列出标签页：获取当前所有标签页信息'
  },
  open_url: {
    extensionAction: 'open_url',
    schema: { url: 'string', id: 'string', groupId: 'string' },
    description: '打开URL：打开网页并提取内容'
  },
  open_pages: {
    extensionAction: 'open_pages',
    schema: { pages: 'array', groupId: 'string' },
    description: '批量打开：同时打开多个页面'
  },
  get_page_content: {
    extensionAction: 'get_page_content',
    schema: { tabId: 'number', id: 'string', url: 'string', groupId: 'string' },
    description: '获取页面内容：提取页面正文文本'
  },
  click: {
    extensionAction: 'click_element',
    schema: { tabId: 'number', id: 'string', groupId: 'string', selector: 'string', selectorType: 'string' },
    description: '点击：点击页面元素'
  },
  type: {
    extensionAction: 'type_text',
    schema: { tabId: 'number', id: 'string', groupId: 'string', selector: 'string', text: 'string', selectorType: 'string' },
    description: '输入：在输入框中输入文本'
  },
  extract: {
    extensionAction: 'extract_data',
    schema: { tabId: 'number', id: 'string', groupId: 'string', rules: 'array' },
    description: '提取：根据规则提取页面数据'
  },
  eval: {
    extensionAction: 'execute_script',
    schema: { tabId: 'number', id: 'string', groupId: 'string', code: 'string' },
    description: '执行脚本：执行自定义JavaScript'
  },
  scroll: {
    extensionAction: 'scroll_page',
    schema: { tabId: 'number', id: 'string', groupId: 'string', direction: 'string', amount: 'number' },
    description: '滚动：滚动页面'
  },
  close_tab: {
    extensionAction: 'close_tab',
    schema: { tabId: 'number', id: 'string', groupId: 'string' },
    description: '关闭标签页：关闭指定标签页'
  },
  close_all: {
    extensionAction: 'close_all_tabs',
    schema: { groupId: 'string' },
    description: '关闭所有：关闭指定分组的所有标签页'
  },
  close_all_tabs: {
    extensionAction: 'close_all_tabs',
    schema: {},
    description: '关闭所有标签页'
  },
  scan_tabs: {
    extensionAction: 'scan_tabs',
    schema: { groupId: 'string', filterUrl: 'string', filterTitle: 'string' },
    description: '扫描标签页：扫描浏览器所有标签页'
  },
  ping: {
    extensionAction: 'ping',
    schema: {},
    description: '心跳检测'
  }
};

/** 需要server侧处理的动作（不走websocket） */
export const serverOnlyActions = ['batch', 'status', 'close_all_tabs'];
