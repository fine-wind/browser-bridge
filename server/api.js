// ============================================================
// 代码虾 Browser Bridge - HTTP API
// ============================================================

import http from "http";
import { URL } from "url";
import { config } from "./config.js";
import crypto from "crypto";

export class BridgeAPI {
  constructor(bridgeWS) {
    this.bridgeWS = bridgeWS;
    this.server = null;
  }

  start() {
    this.server = http.createServer((req, res) => {
      this._handleRequest(req, res);
    });

    this.server.listen(config.httpPort, () => {
      console.log(`🌐 HTTP API 启动于 http://0.0.0.0:${config.httpPort}`);
    });
  }

  async _handleRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${config.httpPort}`);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    const json = (status, data) => {
      res.writeHead(status, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    try {
      const body = req.method === "POST" ? JSON.parse(await this._readBody(req)) : {};
      const segments = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);

      // 路由: /api/{action}
      if (segments[0] === "api") {
        const action = segments[1];

        switch (action) {
          case "list_tabs":
            json(200, await this.bridgeWS.sendTask("list_tabs", body));
            break;

          case "open_url":
            json(200, await this.bridgeWS.sendTask("open_url", body));
            break;

          case "scan_tabs":
            json(200, await this.bridgeWS.sendTask("scan_tabs", body));
            break;

          case "status":
            json(200, {
              connected: this.bridgeWS.extension !== null,
              pendingTasks: this.bridgeWS.pendingTasks.size,
            });
            break;

          case "search":
            json(200, await this.bridgeWS.sendTask("search", body));
            break;

          case "open_pages":
            json(200, await this.bridgeWS.sendTask("open_pages", body));
            break;

          case "get_page_content":
            json(200, await this.bridgeWS.sendTask("get_page_content", body));
            break;

          case "click":
            json(200, await this.bridgeWS.sendTask("click_element", body));
            break;

          case "type":
            json(200, await this.bridgeWS.sendTask("type_text", body));
            break;

          case "extract":
            json(200, await this.bridgeWS.sendTask("extract_data", body));
            break;

          case "scroll":
            json(200, await this.bridgeWS.sendTask("scroll_page", body));
            break;

          case "eval":
            json(200, await this.bridgeWS.sendTask("execute_script", body));
            break;

          case "close_tab":
            json(200, await this.bridgeWS.sendTask("close_tab", body));
            break;

          case "close_all":
            json(200, await this.bridgeWS.sendTask("close_all_tabs", body));
            break;

          // 高级：批量操作 — 一次性执行多个动作
          case "batch":
            json(200, await this._handleBatch(body));
            break;

          default:
            json(404, { error: `未知动作: ${action}` });
        }
      } else {
        json(404, { error: "Not Found" });
      }
    } catch (e) {
      json(500, { error: e.message });
    }
  }

  /**
   * 批量操作 — 一次性执行多个步骤
   * { steps: [
   *   { action: "open_pages", params: { pages: [...] } },
   *   { action: "get_page_content", params: { tabId: 1 } },
   *   { action: "click", params: { tabId: 1, selector: "..." } }
   * ]}
   */
  async _handleBatch({ steps }) {
    if (!steps || !steps.length) throw new Error("steps 是必填参数");

    const results = [];
    let currentTabId = null;

    for (const step of steps) {
      const { action, params = {} } = step;

      // 如果没有指定 tabId 且上一步产生了 tabId，自动传递
      if (!params.tabId && currentTabId) {
        params.tabId = currentTabId;
      }

      const result = await this.bridgeWS.sendTask(action, params);
      results.push({ step: action, result });

      // 如果结果里有 tabId，记录下来给下一步用
      if (result?.result?.tabId) {
        currentTabId = result.result.tabId;
      } else if (result?.result?.pages?.[0]?.tabId) {
        currentTabId = result.result.pages[0].tabId;
      }
    }

    return { steps: results.length, results };
  }

  _readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", chunk => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString()));
      req.on("error", reject);
    });
  }
}
