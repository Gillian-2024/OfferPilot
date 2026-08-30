// Harness 收拢 STEP 1：抽三处跨路由重复的公共片段（纯重构，行为不变）。
// 只抽「每个路由里完全一样」的代码：
//   1. 拿 provider（resolveConfig + getProvider，3 处重复）
//   2. 拼 schema 输出指令（analyze/growth 2 处重复）
//   3. SSE 错误兜底（sendSSE error + endSSE + track error_api_fail，3 处重复）
// 各路由自己的循环结构（chat 流式 / analyze 步进链 / growth 单次）不动。
import { getProvider } from '../providers/index.js';
import { resolveConfig } from '../utils/config.js';
import { schemaShape } from '../utils/schemaShape.js';
import { sendSSE, endSSE } from '../utils/sse.js';
import { track } from '../utils/analytics.js';

// 拿 provider：成功返回 { cfg, model }；缺 key/model 时 throw，调用方 catch 后 400。
export function getModel(req) {
  const cfg = resolveConfig(req);
  return { cfg, model: getProvider(cfg) };
}

// 拼 schema 输出指令：analyze/growth 共用的模板字符串（chat 不用）。
export function buildSchemaSection(schema) {
  return `【输出格式 —— 必须严格遵守】
直接输出一个 JSON 对象，严格符合下面的结构（字段名、嵌套层级、数组/对象/标量类型都要匹配）。
不要输出 markdown 代码块标记，不要任何解释性文字，不要在 JSON 之外添加任何内容。
数组没有元素就输出 []，字符串没有内容就输出空字符串 ""。
下面 // 后面是字段说明，实际输出时不要带 // 注释：
${schemaShape(schema)}`;
}

// SSE 错误兜底：sendSSE error + endSSE + track error_api_fail（形态三处一致，tag/字段参数化）。
// capability 可省略（growth 原 track 无此字段）；省略时事件 payload 不带 capability，保持行为严格一致。
export function failSSE(res, e, endpoint, capability) {
  console.error(`[${endpoint}] error:`, e);
  sendSSE(res, { type: 'error', message: e.message || String(e) });
  endSSE(res);
  const payload = { endpoint, status_code: 500, error_message: e.message };
  if (capability !== undefined) payload.capability = capability;
  track(undefined, 'error_api_fail', payload);
}
