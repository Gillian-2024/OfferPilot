// 认证限流单元测试：IP 维度 30 次/15 分钟；账号维度失败 10 次锁定，成功清零。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authIpHit, accountLocked, accountFail, accountSuccess, clientIp,
} from '../lib/rateLimit.ts';

const T0 = 1_000_000_000_000;
const WIN = 15 * 60 * 1000;

test('同一 IP 前 30 次放行，第 31 次拦截并给出剩余秒数', () => {
  const ip = 'ip-a';
  for (let i = 0; i < 30; i++) assert.equal(authIpHit(ip, T0 + i), 0);
  const retry = authIpHit(ip, T0 + 30);
  assert.ok(retry > 0 && retry <= WIN / 1000);
});

test('窗口过期后 IP 计数重置', () => {
  const ip = 'ip-b';
  for (let i = 0; i < 31; i++) authIpHit(ip, T0);
  assert.ok(authIpHit(ip, T0) > 0);
  assert.equal(authIpHit(ip, T0 + WIN + 1), 0);
});

test('不同 IP 互不影响', () => {
  for (let i = 0; i < 31; i++) authIpHit('ip-c', T0);
  assert.equal(authIpHit('ip-d', T0), 0);
});

test('同一账号失败 10 次后锁定，与 IP 无关', () => {
  const email = 'victim@example.com';
  for (let i = 0; i < 9; i++) accountFail(email, T0);
  assert.equal(accountLocked(email, T0), 0);
  accountFail(email, T0);
  assert.ok(accountLocked(email, T0) > 0);
  assert.equal(accountLocked('other@example.com', T0), 0);
});

test('登录成功清零失败计数', () => {
  const email = 'ok@example.com';
  for (let i = 0; i < 9; i++) accountFail(email, T0);
  accountSuccess(email);
  for (let i = 0; i < 9; i++) accountFail(email, T0);
  assert.equal(accountLocked(email, T0), 0);
});

test('账号锁定在窗口过期后解除', () => {
  const email = 'later@example.com';
  for (let i = 0; i < 10; i++) accountFail(email, T0);
  assert.ok(accountLocked(email, T0) > 0);
  assert.equal(accountLocked(email, T0 + WIN + 1), 0);
});

test('clientIp 优先 X-Real-IP，不信任可伪造的 X-Forwarded-For 首段', () => {
  assert.equal(clientIp(new Headers({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' })), '1.2.3.4');
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4' })), '1.2.3.4');
  assert.equal(clientIp(new Headers()), 'unknown');
});
