// ============================================================
// MCP stdio 门面 — 将动作注册表暴露为MCP工具
// ============================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { listActions } from './actions/index.js';

// 说明：MCP 门面不再自己开 WebSocket（会和 server/index.js 抢 19876 端口，
// 且扩展只会连其中一个，导致 MCP 调用报"Firefox 插件未连接"）。
// 所有动作统一转发给常驻的 HTTP API（server/index.js）。
const API_BASE = process.env.BRIDGE_HTTP || 'http://localhost:19876';

async function callBridgeHTTP(action, args) {
  let res;
  try {
    res = await fetch(`${API_BASE}/api/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {}),
    });
  } catch (e) {
    throw new Error(`连不上浏览器桥服务 ${API_BASE}（先在 server/ 下跑 node index.js）：${e.message}`);
  }
  let data;
  try { data = await res.json(); } catch (e) { throw new Error(`桥返回非 JSON（HTTP ${res.status}）`); }
  if (data && data.error) throw new Error(data.error);
  if (data && data.type === 'task_result') return data.result;
  return data;
}

async function main() {
  const mcpServer = new McpServer({
    name: 'browser-bridge',
    version: '2.0.0',
  });

  // 获取所有动作并注册为MCP工具
  const actions = listActions();

  for (const action of actions) {
    const schema = {};

    // 根据动作名映射到对应的schema
    if (action.channel === 'firefox') {
      // Firefox动作
      switch (action.name) {
        case 'search':
          schema.query = z.string();
          schema.engine = z.enum(['google', 'baidu', 'bing', 'duckduckgo']).default('google');
          schema.count = z.number().default(5);
          break;
        case 'list_tabs':
          break;
        case 'open_url':
          schema.url = z.string();
          schema.id = z.string().optional();
          schema.groupId = z.string().optional();
          break;
        case 'open_pages':
          schema.pages = z.array(z.object({ url: z.string(), id: z.string() }));
          schema.groupId = z.string();
          break;
        case 'get_page_content':
          schema.tabId = z.number().optional();
          schema.id = z.string().optional();
          schema.url = z.string().optional();
          schema.groupId = z.string().optional();
          break;
        case 'click':
          schema.tabId = z.number().optional();
          schema.id = z.string().optional();
          schema.groupId = z.string().optional();
          schema.selector = z.string();
          schema.selectorType = z.enum(['css', 'xpath', 'text']).default('css');
          break;
        case 'type':
          schema.tabId = z.number().optional();
          schema.id = z.string().optional();
          schema.groupId = z.string().optional();
          schema.selector = z.string();
          schema.text = z.string();
          schema.selectorType = z.enum(['css', 'xpath', 'text']).default('css');
          break;
        case 'extract':
          schema.tabId = z.number().optional();
          schema.id = z.string().optional();
          schema.groupId = z.string().optional();
          schema.rules = z.array(z.object({ name: z.string(), selector: z.string(), type: z.string(), attr: z.string().optional() }));
          break;
        case 'eval':
          schema.tabId = z.number().optional();
          schema.id = z.string().optional();
          schema.groupId = z.string().optional();
          schema.code = z.string();
          break;
        case 'scroll':
          schema.tabId = z.number().optional();
          schema.id = z.string().optional();
          schema.groupId = z.string().optional();
          schema.direction = z.enum(['up', 'down', 'left', 'right']).default('down');
          schema.amount = z.number().default(500);
          break;
        case 'close_tab':
          schema.tabId = z.number().optional();
          schema.id = z.string().optional();
          schema.groupId = z.string().optional();
          break;
        case 'close_all':
          break;
        case 'scan_tabs':
          schema.groupId = z.string().default('browser');
          schema.filterUrl = z.string().optional();
          schema.filterTitle = z.string().optional();
          break;
        case 'batch':
          schema.steps = z.array(z.object({ action: z.string(), params: z.record(z.any()) }));
          break;
      }
    } else if (action.channel === 'cdp') {
      // CDP动作
      switch (action.name) {
        case 'browser_navigate':
          schema.url = z.string();
          schema.waitUntil = z.enum(['load', 'domcontentloaded', 'networkidle0', 'networkidle2']).default('load');
          break;
        case 'browser_click':
          schema.selector = z.string();
          schema.timeout = z.number().default(10000);
          break;
        case 'browser_type':
          schema.selector = z.string();
          schema.text = z.string();
          schema.clear = z.boolean().default(true);
          break;
        case 'browser_screenshot':
          schema.fullPage = z.boolean().default(false);
          break;
        case 'browser_get_dom':
          schema.depth = z.number().default(3);
          break;
        case 'browser_evaluate':
          schema.expression = z.string();
          break;
        case 'browser_get_tabs':
          break;
        case 'browser_switch_tab':
          schema.tabId = z.string();
          break;
        case 'browser_new_tab':
          schema.url = z.string().optional();
          break;
        case 'browser_scroll':
          schema.direction = z.enum(['up', 'down', 'left', 'right']).default('down');
          schema.amount = z.number().default(300);
          break;
        case 'browser_get_page_info':
          break;
        case 'browser_back':
          break;
        case 'browser_forward':
          break;
        case 'browser_reload':
          break;
      }
    } else if (action.channel === 'deepseek') {
      // DeepSeek动作
      switch (action.name) {
        case 'deepseek_open_chat':
          break;
        case 'deepseek_send_message':
          schema.text = z.string();
          break;
        case 'deepseek_wait_reply':
          schema.timeout = z.number().default(30000);
          break;
        case 'deepseek_get_history':
          break;
        case 'deepseek_new_chat':
          break;
        case 'deepseek_check_login':
          break;
        case 'deepseek_export':
          break;
      }
    }

    mcpServer.registerTool(
      action.name,
      { description: action.description || `${action.channel}通道: ${action.name}`, inputSchema: z.object(schema) },
      async (args) => {
        try {
          const result = await callBridgeHTTP(action.name, args);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }],
            isError: true,
          };
        }
      }
    );
  }

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error('Browser Bridge MCP Server (stdio) ready.');
  console.error(`转发到 HTTP API: ${API_BASE}（需要先起 server/index.js）`);
  console.error(`Tools registered: ${actions.length}`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
