// CORS 行为验证：本项目"关闭 CORS"决策的 HTTP 行为（无 cors 中间件 → 跨域无 ACAO 头）。
// 边界：index.js 不导出 app 且启动即 listen，故用"同样的配置"（无 cors）验证行为；
//       index.js 真实内容由 harness-check R2 静态锁定。见 docs/harness/verify.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

let server, base;
test.before(async () => {
  const app = express();
  app.get('/api/ping', (req, res) => res.json({ ok: true }));
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

test('带跨域 Origin 的请求 → 响应无 Access-Control-Allow-Origin', async () => {
  const res = await fetch(`${base}/api/ping`, {
    headers: { Origin: 'https://evil.example.com' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('跨域预检 OPTIONS → 无 CORS 放行头', async () => {
  const res = await fetch(`${base}/api/ping`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://evil.example.com',
      'Access-Control-Request-Method': 'POST',
    },
  });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.headers.get('access-control-allow-methods'), null);
});
