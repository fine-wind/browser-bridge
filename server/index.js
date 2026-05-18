// ============================================================
// 🦐 Search Bridge - 主入口
// ============================================================

import { BridgeWS } from "./websocket.js";
import { BridgeAPI } from "./api.js";

const bridgeWS = new BridgeWS();
const bridgeAPI = new BridgeAPI(bridgeWS);

bridgeWS.start();
bridgeAPI.start();

console.log(`
  🦐 Search Bridge Server
  ─────────────────────
  WS : ws://localhost:${bridgeWS.wss?.options?.port || "?"}
  API: http://localhost:${bridgeAPI.server?.address()?.port || "?"}
`);

// 优雅退出
process.on("SIGINT", () => {
  console.log("\n🦐 正在关闭...");
  bridgeWS.stop();
  bridgeAPI.server?.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  bridgeWS.stop();
  bridgeAPI.server?.close();
  process.exit(0);
});
