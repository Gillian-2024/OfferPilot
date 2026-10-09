// extractAndParse 回归测试。用例取自线上 error_api_fail 真实报错片段（2026-09 退役备份）：
// 模型在中文字符串值里用英文双引号做引用，未转义 → JSON.parse 报
// "Expected ',' or '}' after property value"。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { extractAndParse } from '../lib/ai/jsonExtract.ts';

const str = z.object({ real_work: z.string() });

test('干净 JSON 原样通过', () => {
  assert.deepEqual(extractAndParse('{"real_work": "写代码"}', str), { real_work: '写代码' });
});

test('字符串内未转义英文引号（JD 真实片段）', () => {
  const out = '{\n  "real_work": "字面的"Java开发"实际是"技术开发+项目交付"——节点卡死"\n}';
  assert.deepEqual(extractAndParse(out, str), {
    real_work: '字面的"Java开发"实际是"技术开发+项目交付"——节点卡死',
  });
});

test('引号后紧跟中文顿号/句号（简历真实片段）', () => {
  const schema = z.object({ modules: z.array(z.object({ text: z.string() })) });
  const out = '{\n  "modules": [\n    {"text": "连续三年获得"一等奖学金"、"优秀团员"。"}\n  ]\n}';
  assert.deepEqual(extractAndParse(out, schema), {
    modules: [{ text: '连续三年获得"一等奖学金"、"优秀团员"。' }],
  });
});

test('引号后紧跟英文逗号但仍在句中', () => {
  const out = '{"real_work": "他叫"小王",负责交付", "n": 1}';
  const schema = z.object({ real_work: z.string(), n: z.number() });
  assert.deepEqual(extractAndParse(out, schema), { real_work: '他叫"小王",负责交付', n: 1 });
});

test('数组元素与嵌套对象的正常结束引号不被误伤', () => {
  const schema = z.object({
    hard: z.array(z.string()),
    gaps: z.array(z.object({ status: z.string(), gap: z.string() })),
  });
  const out =
    '{\n  "hard": ["收银台", "支付下单页面"],\n  "gaps": [{"status": "部分", "gap": "停留在"会用工具"层面"}]\n}';
  assert.deepEqual(extractAndParse(out, schema), {
    hard: ['收银台', '支付下单页面'],
    gaps: [{ status: '部分', gap: '停留在"会用工具"层面' }],
  });
});

test('已正确转义的引号保持不变', () => {
  assert.deepEqual(extractAndParse('{"real_work": "叫\\"A\\"的人"}', str), { real_work: '叫"A"的人' });
});

test('超过 2000 字的长输出不被截断', () => {
  const long = '项'.repeat(3000);
  assert.deepEqual(extractAndParse(`{"real_work": "${long}"}`, str), { real_work: long });
});

test('非 JSON 自然语言仍报错', () => {
  assert.throws(() => extractAndParse('抱歉，我无法完成', str), /JSON 解析失败/);
});
