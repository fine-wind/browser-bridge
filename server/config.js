// ============================================================
// 🦐 Search Bridge - 配置
// ============================================================

export const config = {
  // WebSocket 端口（插件连接用）
  wsPort: parseInt(process.env.WS_PORT || "19876", 10),

  // HTTP API 端口（OpenClaw Skill 调）
  httpPort: parseInt(process.env.HTTP_PORT || "19877", 10),

  // 任务超时 (ms)
  taskTimeout: parseInt(process.env.TASK_TIMEOUT || "120000", 10),
};
