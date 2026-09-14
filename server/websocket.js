// ============================================================
// 🦐 Search Bridge - WebSocket 服务 (与 Firefox 插件通信)
// ============================================================

import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { EventEmitter } from "events";

export class BridgeWS extends EventEmitter {
  constructor() {
    super();
    this.wss = null;
    this.extension = null; // 当前连接的插件
    this.pendingTasks = new Map(); // taskId -> { resolve, reject, timer }
    this.taskCounter = 0;
  }

  start() {
    this.wss = new WebSocketServer({ port: config.wsPort });
    console.log(`🦐 WebSocket 服务启动于 ws://0.0.0.0:${config.wsPort}`);

    this.wss.on("connection", (ws) => {
      console.log("🔗 Firefox 插件已连接");
      this.extension = ws;

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this._handleMessage(msg);
        } catch (e) {
          console.error("⚠️ 消息解析失败:", e.message);
        }
      });

      ws.on("close", () => {
        console.log("🔌 Firefox 插件已断开");
        // 修复bug7: 只在当前连接断开时才清空
        if (ws === this.extension) {
          this.extension = null;
        }
        // 拒绝所有待处理任务
        for (const [id, task] of this.pendingTasks) {
          clearTimeout(task.timer);
          task.reject(new Error("插件已断开"));
          this.pendingTasks.delete(id);
        }
      });

      ws.on("error", (err) => {
        console.error("⚠️ WebSocket 错误:", err.message);
      });
    });

    this.wss.on("error", (err) => {
      console.error("⚠️ WebSocket 服务错误:", err.message);
    });
  }

  stop() {
    if (this.wss) this.wss.close();
  }

  /** 发送任务到插件，返回 Promise */
  sendTask(action, payload = {}) {
    if (!this.extension) {
      return Promise.reject(new Error("Firefox 插件未连接"));
    }

    const taskId = `task_${++this.taskCounter}_${Date.now()}`;
    const message = { type: "task", taskId, action, payload };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingTasks.delete(taskId);
        reject(new Error(`任务超时: ${action}`));
      }, config.taskTimeout);

      this.pendingTasks.set(taskId, { resolve, reject, timer });
      this.extension.send(JSON.stringify(message));
    });
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case "task_result":
        this._resolveTask(msg.taskId, msg);
        break;
      case "task_error":
        this._rejectTask(msg.taskId, msg.error || "未知错误");
        break;
      case "pong":
        // 心跳回复
        break;
      case "connected":
        console.log("✅ 插件已就绪");
        this.emit("connected");
        break;
      default:
        console.log("📩 未知消息:", msg);
    }
  }

  _resolveTask(taskId, result) {
    const task = this.pendingTasks.get(taskId);
    if (task) {
      clearTimeout(task.timer);
      task.resolve(result);
      this.pendingTasks.delete(taskId);
    }
  }

  _rejectTask(taskId, error) {
    const task = this.pendingTasks.get(taskId);
    if (task) {
      clearTimeout(task.timer);
      task.reject(new Error(error));
      this.pendingTasks.delete(taskId);
    }
  }
}
