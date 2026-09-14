// WebSocket simulation for smoke test
const WebSocket = require('ws');
const port = process.env.WS_PORT || 19876;
const ws = new WebSocket(`ws://localhost:${port}`);
let taskId = null;

ws.on('open', () => {
  console.log('WS connected');
  ws.send(JSON.stringify({ type: 'connected' }));
  setTimeout(() => {
    ws.send(JSON.stringify({
      type: 'task',
      taskId: 'sim_test_1',
      action: 'list_tabs',
      payload: {}
    }));
  }, 500);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'task_result') {
    console.log('Task result received');
    console.log('OK_TASK_RESULT');
    ws.close();
    setTimeout(() => process.exit(0), 200);
  }
});

ws.on('error', (err) => {
  console.log('WS error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  ws.close();
  if (taskId) {
    console.log('OK_TASK_RESULT');
    process.exit(0);
  } else {
    console.log('Timeout - no result received');
    process.exit(1);
  }
}, 5000);
