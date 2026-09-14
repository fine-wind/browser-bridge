// WebSocket simulation for smoke test
// Uses native Node 22+ WebSocket
const url = process.argv[2] || `ws://localhost:${process.env.WS_PORT || '19876'}`;
const { WebSocket } = await import('ws');
const ws = new WebSocket(url);

ws.on('open', () => {
  console.log('WS connected');
  ws.send(JSON.stringify({ type: 'connected' }));
  setTimeout(() => {
    ws.send(JSON.stringify({ type: 'task', taskId: 'test_1', action: 'list_tabs', payload: {} }));
  }, 500);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'task_result') {
    console.log('OK_TASK_RESULT');
    ws.close();
    setTimeout(() => process.exit(0), 100);
  }
});

ws.on('error', (err) => {
  console.log('WS error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log('Timeout');
  ws.close();
  process.exit(1);
}, 5000);
