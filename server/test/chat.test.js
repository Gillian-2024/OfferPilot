// 注入边界单测：wrapUserContent 必须给非空 user 消息包 <user-content> 边界，空输入返回 ''。
// chat/rewrite 路由实际调用由 harness-check R4 静态断言承担（chat.js 顶层 loadKnowledge
// 依赖 .knowledge.enc，import 路由过重）。见 docs/harness/verify.md 测试边界说明。
import { test } from 'node:test';
import assert from 'node:assert/strict';
// 边界标签 <user-content>/</user-content> 是稳定的字面量（contentBoundary.js 只导出
// wrapUserContent 与开闭标签对 USER_CONTENT_TAG，单个开/闭标签未导出，测试直接用字面量断言）
import { wrapUserContent } from '../src/utils/contentBoundary.js';
const USER_CONTENT_OPEN = '<user-content>';
const USER_CONTENT_CLOSE = '</user-content>';

test('空字符串 → 返回空串', () => {
  assert.equal(wrapUserContent(''), '');
});

test('全空白 → 返回空串', () => {
  assert.equal(wrapUserContent('   \n\t '), '');
});

test('正常文本 → 被包 <user-content> 边界且保留原文', () => {
  const out = wrapUserContent('帮我写一段自我介绍');
  assert.ok(out.includes(USER_CONTENT_OPEN));
  assert.ok(out.includes('帮我写一段自我介绍'));
  assert.ok(out.includes(USER_CONTENT_CLOSE));
});

test('多行文本 → 边界完整包裹', () => {
  const text = '第一行\n第二行\n第三行';
  const out = wrapUserContent(text);
  assert.ok(out.startsWith(`\n${USER_CONTENT_OPEN}\n`));
  assert.ok(out.endsWith(`\n${USER_CONTENT_CLOSE}`));
  assert.ok(out.includes(text));
});
