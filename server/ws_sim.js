import WebSocket from 'ws';
const port = process.env.WS_PORT || 19876;
const ws = new WebSocket(`ws://localhost:${port}`);

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
  console.log('Received:', msg.type);
  if (msg.type === 'task_result') {
    console.log('OK_TASK_RESULT');
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => {
  console.log('WS error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log('Timeout - no result received');
  ws.close();
  process.exit(1);
}, 5000);
