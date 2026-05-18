// Popup UI - 实时连接状态
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");

function checkStatus() {
  browser.runtime.sendMessage({ type: "get_status" }).then((status) => {
    updateStatus(status?.connected || false);
  }).catch(() => {
    updateStatus(false);
  });

  // 每3秒刷新一次
  setTimeout(checkStatus, 3000);
}

function updateStatus(connected) {
  statusDot.className = "status " + (connected ? "connected" : "disconnected");
  statusText.textContent = connected ? "已连接 ✅" : "未连接 ❌";
}

document.getElementById("btn-reconnect").addEventListener("click", () => {
  browser.runtime.sendMessage({ type: "reconnect" });
  statusText.textContent = "正在连接...";
  statusDot.className = "status disconnected";
});

// 开始检查
checkStatus();
