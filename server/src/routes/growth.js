import express from 'express';
import { generateText } from 'ai';
import { getProvider } from '../providers/index.js';
import { schemaShape } from '../utils/schemaShape.js';
import { extractAndParse } from '../utils/jsonExtract.js';
import { resolveConfig } from '../utils/config.js';
import { initSSE, sendSSE, endSSE } from '../utils/sse.js';
import { loadKnowledge } from '../knowledge-loader.js';
import { wrapUserContent } from '../utils/contentBoundary.js';
import { track, trackUsage } from '../utils/analytics.js';

const modules = await loadKnowledge();
const { buildGrowthSystem, growthSchema } = modules.growth;

const router = express.Router();

// 复盘结论沉淀 → 成长档案
// 一次性 generateText + schema 校验（复用 analyze 的绕 tool_use 模式，SSE 推 result）
// body: { messages, context? }
router.post('/growth', async (req, res) => {
  const { messages = [], context = {} } = req.body;
  if (!messages.length) {
    return res.status(400).json({ error: '缺少 messages' });
  }

  const cfg = resolveConfig(req);
  let model;
  try {
    model = getProvider(cfg);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const system = buildGrowthSystem(context);
  const dialogueRaw = messages
    .map((m) => `${m.role === 'user' ? '用户' : '领航员'}：${m.content}`)
    .join('\n\n');
  const wrappedDialogue = wrapUserContent(dialogueRaw);

  if (!wrappedDialogue) {
    sendSSE(res, { type: 'error', message: '对话内容为空' });
    return endSSE(res);
  }

  const schemaSection = `【输出格式 —— 必须严格遵守】
直接输出一个 JSON 对象，严格符合下面的结构（字段名、嵌套层级、数组/对象/标量类型都要匹配）。
不要输出 markdown 代码块标记，不要任何解释性文字，不要在 JSON 之外添加任何内容。
数组没有元素就输出 []，字符串没有内容就输出空字符串 ""。
下面 // 后面是字段说明，实际输出时不要带 // 注释：
${schemaShape(growthSchema)}`;

  const prompt = `${wrappedDialogue}\n\n请根据上面的对话内容生成成长档案。\n\n${schemaSection}`;

  initSSE(res);
  try {
    const result = await generateText({
      model,
      system,
      prompt,
      maxOutputTokens: 4096,
    });
    const text = typeof result === 'object' && result.text !== undefined ? result.text : result;
    const object = extractAndParse(text, growthSchema);
    sendSSE(res, { type: 'result', data: object, provider: cfg.provider, model: cfg.model });
    endSSE(res);

    // Log analytics + usage
    track(undefined, 'growth_consolidated', { conversation_rounds: messages.length });
    if (result.usage) {
      trackUsage(undefined, 'growth', result.usage, cfg.provider, cfg.model);
    }
  } catch (e) {
    console.error('[growth] error:', e);
    sendSSE(res, { type: 'error', message: e.message || String(e) });
    endSSE(res);
    track(undefined, 'error_api_fail', { endpoint: 'growth', status_code: 500, error_message: e.message });
  }
});

export default router;
