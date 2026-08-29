// history 集成测试：upsert 归属（R3）+ 归属删除。用临时 DB 文件隔离，不碰开发库。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.JWT_SECRET = 'cjc-test-secret-0123456789abcdef0123456789abcdef';
const tmpDir = mkdtempSync(join(tmpdir(), 'cjc-history-'));
process.env.CJC_DB_PATH = join(tmpDir, 'test.db');

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(__dirname, '..');
const { getDb } = await import('../src/db/index.js');
const { signToken } = await import('../src/middleware/auth.js');
const historyRouter = (await import('../src/routes/history.js')).default;
const express = (await import('express')).default;
// bcryptjs 是 CJS 包，ESM 动态 import 取 .default（命名空间上无 named export）
const bcrypt = (await import('bcryptjs')).default;

const db = getDb();
const NOW = Date.now();
const A = { id: 'user-a', username: 'alice', token: null };
const B = { id: 'user-b', username: 'bob', token: null };

let server, base;
async function req(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test.before(async () => {
  const pw = await bcrypt.hash('testpass123', 4);
  const ins = db.prepare(
    'INSERT INTO users (id, username, password, nickname, created_at, updated_at) VALUES (?,?,?,?,?,?)'
  );
  ins.run(A.id, A.username, pw, 'Alice', NOW, NOW);
  ins.run(B.id, B.username, pw, 'Bob', NOW, NOW);
  A.token = await signToken(A.id, A.username);
  B.token = await signToken(B.id, B.username);

  const app = express();
  app.use(express.json());
  app.use('/api/history', historyRouter);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

test('R3: B 提交同 id 数据，A 记录不被覆盖', async () => {
  // A 建一条 id=shared-1
  const created = await req('/api/history', {
    method: 'POST', token: A.token,
    body: { type: 'jd', title: 'A 的 JD', data: { owner: 'A' } },
  });
  assert.equal(created.status, 200);
  const sharedId = created.body.id;

  // B 用同 id 提交自己的数据（模拟批量迁移同步）
  const r = await req('/api/history', {
    method: 'POST', token: B.token,
    body: { items: [{ id: sharedId, type: 'jd', title: 'B 想覆盖', data: { owner: 'B' } }] },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 1);

  // 记录仍是 A 的，数据未变
  const row = db.prepare('SELECT user_id, title, data FROM history WHERE id = ?').get(sharedId);
  assert.equal(row.user_id, A.id);
  assert.equal(row.title, 'A 的 JD');
  assert.deepEqual(JSON.parse(row.data), { owner: 'A' });
});

test('R3 配套: B 不能删除 A 的记录（403）', async () => {
  const aCreated = await req('/api/history', {
    method: 'POST', token: A.token,
    body: { type: 'jd', title: 'A 待删', data: {} },
  });
  const id = aCreated.body.id;

  const denied = await req(`/api/history/${id}`, { method: 'DELETE', token: B.token });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, '无权删除此记录');

  const own = await req(`/api/history/${id}`, { method: 'DELETE', token: A.token });
  assert.equal(own.status, 200);
  assert.equal(own.body.ok, true);
});
