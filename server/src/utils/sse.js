// SSE 工具：初始化响应头 + 推送 JSON 消息
export function initSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

export function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function endSSE(res) {
  res.write('data: [DONE]\n\n');
  res.end();
}
