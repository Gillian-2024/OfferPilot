// 限流行为验证：复刻 index.js 的 authLimiter 配置（30 次/15 分钟），连打超限 → 429。
// 边界：同 cors.test.js，行为复刻 + harness-check R5 静态锁定 index.js 真实挂载。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import rateLimit from 'express-rate-limit';

let server, base;
test.before(async () => {
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: '尝试过于频繁，请 15 分钟后再试' },
  });
  const app = express();
  app.post('/api/auth/login', authLimiter, (req, res) => res.json({ ok: true }));
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

test('登录接口连打 31 次 → 前 30 次 200，第 31 次 429', async () => {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'x' }),
    });
    assert.equal(res.status, 200, `第 ${i + 1} 次应 200，实际 ${res.status}`);
  }
  const blocked = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'x' }),
  });
  assert.equal(blocked.status, 429);
  const body = await blocked.json();
  assert.equal(body.error, '尝试过于频繁，请 15 分钟后再试');
});
