// auth 单元测试：JWT 签发/验证、requireAuth 三态、无 JWT_SECRET 启动抛错。
// 注意：ESM import hoisting 使静态 import 在被测模块求值后才执行本文件语句，
// 故必须设 env 后动态 import（auth.js 顶层缺 JWT_SECRET 会 throw）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.JWT_SECRET = 'cjc-test-secret-0123456789abcdef0123456789abcdef';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(__dirname, '..');
const { signToken, requireAuth } = await import('../src/middleware/auth.js');
const { TextEncoder } = await import('node:util');
const { jwtVerify } = await import('jose');

function mockRes() {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}
// requireAuth 内部 jwtVerify 是 promise 链，调用后等一个 tick 再断言
function callMW(mw, req) {
  const res = mockRes();
  let nexted = false;
  mw(req, res, () => { nexted = true; });
  return new Promise((r) => setTimeout(r, 50)).then(() => ({ res, nexted }));
}

test('signToken 返回三段式 JWT', async () => {
  const token = await signToken('user-1', 'alice');
  assert.equal(token.split('.').length, 3);
});

test('signToken 签发 → jwtVerify 解出 userId 与 username', async () => {
  const token = await signToken('user-1', 'alice');
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const { payload } = await jwtVerify(token, secret);
  assert.equal(payload.sub, 'user-1');
  assert.equal(payload.username, 'alice');
});

test('requireAuth 无 Authorization 头 → 401 请先登录', async () => {
  const { res } = await callMW(requireAuth, { header: () => undefined });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, '请先登录');
});

test('requireAuth 无效 token → 401 登录已过期', async () => {
  const { res } = await callMW(requireAuth, { header: () => 'Bearer not.a.jwt' });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, '登录已过期，请重新登录');
});

test('requireAuth 有效 token → 设 req.userId 并 next()', async () => {
  const token = await signToken('user-1', 'alice');
  const req = { header: () => `Bearer ${token}` };
  const { res, nexted } = await callMW(requireAuth, req);
  assert.equal(res.statusCode, undefined);
  assert.equal(nexted, true);
  assert.equal(req.userId, 'user-1');
});

test('无 JWT_SECRET 时启动即抛错', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e',
    "await import('./src/middleware/auth.js')"],
    { cwd: SERVER_ROOT, env: { ...process.env, JWT_SECRET: '' }, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /缺少 JWT_SECRET/);
});
