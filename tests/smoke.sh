#!/usr/bin/env bash
# Browser Bridge 冒烟测试
# 用法: bash tests/smoke.sh
set -e

SERVER_PORT=${HTTP_PORT:-19877}
WS_PORT=${WS_PORT:-19876}
PASS=0
FAIL=0

log_pass() {
  echo "✅ PASS: $1"
  PASS=$((PASS + 1))
}

log_fail() {
  echo "❌ FAIL: $1"
  FAIL=$((FAIL + 1))
}

echo "=========================================="
echo "Browser Bridge 冒烟测试"
echo "=========================================="

# 检查服务器是否已运行
if ! curl -s http://localhost:$SERVER_PORT/api/status > /dev/null 2>&1; then
  echo "[1] 启动服务器..."
  cd "$(dirname "$0")/../server"
  
  if [ ! -d "node_modules" ]; then
    npm install --silent 2>/dev/null
  fi
  
  # 杀死已有进程
  pkill -f "node.*index.js" 2>/dev/null || true
  sleep 1
  
  node index.js &
  SERVER_PID=$!
  sleep 2
  
  if ! curl -s http://localhost:$SERVER_PORT/api/status > /dev/null 2>&1; then
    log_fail "服务器启动失败"
    exit 1
  fi
  log_pass "服务器启动成功 (PID: $SERVER_PID)"
else
  echo "[1] 服务器已在运行"
  log_pass "服务器已运行"
fi

# 2. 测试 /api/status
echo ""
echo "[2] 测试 GET /api/status..."
STATUS_RESP=$(curl -s "http://localhost:$SERVER_PORT/api/status")
if echo "$STATUS_RESP" | grep -q '"connected"'; then
  log_pass "GET /api/status 返回正确格式: $STATUS_RESP"
else
  log_fail "GET /api/status 返回格式错误: $STATUS_RESP"
fi

# 3. 测试未知动作 404
echo ""
echo "[3] 测试未知动作 404..."
UNKNOWN_RESP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$SERVER_PORT/api/unknown_action" || true)
if [ "$UNKNOWN_RESP" = "404" ]; then
  log_pass "未知动作返回 404"
else
  log_fail "未知动作返回 $UNKNOWN_RESP (期望 404)"
fi

# 4. 测试扩展类动作（无连接时返回明确错误）
echo ""
echo "[4] 测试扩展类动作（无连接时）..."
# 先断开任何现有WS连接，确保测试条件准确
curl -s -X POST "http://localhost:$SERVER_PORT/api/disconnect" > /dev/null 2>&1 || true
sleep 1
SEARCH_RESP=$(curl -s -X POST "http://localhost:$SERVER_PORT/api/search" \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}')
if echo "$SEARCH_RESP" | grep -qi "插件未连接\|Firefox"; then
  log_pass "扩展未连接时返回明确错误"
else
  log_fail "扩展未连接时返回: $SEARCH_RESP"
fi

# 5. 测试路由存在性
echo ""
echo "[5] 测试各动作路由..."
ACTIONS=("search" "list_tabs" "open_url" "get_page_content" "click" "type" "extract" "eval" "scroll" "close_tab" "close_all" "scan_tabs" "batch")
for action in "${ACTIONS[@]}"; do
  RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$SERVER_PORT/api/$action" -H "Content-Type: application/json" -d '{}' || true)
  if [ "$RESP" != "404" ]; then
    log_pass "POST /api/$action 路由存在 (HTTP $RESP)"
  else
    log_fail "POST /api/$action 返回 404"
  fi
done

# 6. 测试 CDP 动作（Chrome 未启动时返回错误）
echo ""
echo "[6] 测试 CDP 动作（Chrome 未启动时）..."
CDP_RESP=$(curl -s -X POST "http://localhost:$SERVER_PORT/api/browser_navigate" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}')
if echo "$CDP_RESP" | grep -qi "chrome\|未启动\|connect\|error"; then
  log_pass "CDP 未连接时返回明确错误"
else
  log_fail "CDP 未连接时返回: $CDP_RESP"
fi

# 7. 测试 DeepSeek 动作
echo ""
echo "[7] 测试 DeepSeek 动作..."
DS_RESP=$(curl -s -X POST "http://localhost:$SERVER_PORT/api/deepseek_check_login" \
  -H "Content-Type: application/json" \
  -d '{}')
if echo "$DS_RESP" | grep -Eqi "login|isLoggedIn|chrome|未启动|connect|error"; then
  log_pass "DeepSeek 动作路由存在"
else
  log_fail "DeepSeek 动作返回: $DS_RESP"
fi

# 8. 测试假扩展客户端回归
echo ""
echo "[8] 测试假扩展客户端 (Node WebSocket模拟)..."
_origdir="$PWD"
cd /d/workspaces/browser-bridge/server
NODE_PATH=/d/workspaces/browser-bridge/server/node_modules node /d/workspaces/browser-bridge/tests/ws_sim.js 2>/dev/null > /tmp/ws_sim_out.txt
cd "$_origdir"
if grep -q "OK_TASK_RESULT" /tmp/ws_sim_out.txt; then
  log_pass "假扩展客户端通信正常"
else
  log_fail "假扩展客户端通信失败"
fi
rm -f /tmp/ws_sim_out.txt

# 总结
echo ""
echo "=========================================="
echo "测试结果: $PASS 通过, $FAIL 失败"
echo "=========================================="

if [ $FAIL -eq 0 ]; then
  echo "🎉 全部测试通过!"
  exit 0
else
  echo "⚠️ 有测试失败，请检查"
  exit 1
fi
