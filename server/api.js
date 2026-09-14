// ============================================================
// 代码虾 Browser Bridge - HTTP API
// ============================================================

import http from "http";
import { URL } from "url";
import { config } from "./config.js";
import { executeAction, getAction } from "./actions/index.js";

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

        // 使用统一动作注册表
        if (action === "status") {
          json(200, {
            connected: this.bridgeWS.extension !== null,
            pendingTasks: this.bridgeWS.pendingTasks.size,
          });
        } else {
          const actionInfo = getAction(action);
          if (!actionInfo) {
            json(404, { error: `未知动作: ${action}` });
            return;
          }
          const result = await executeAction(action, body, this.bridgeWS);
          json(200, { result });
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
