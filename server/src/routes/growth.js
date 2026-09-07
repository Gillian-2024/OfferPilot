import express from 'express';
import { generateText } from 'ai';
import { getModel, buildSchemaSection, failSSE } from '../harness/run.js';
import { extractAndParse } from '../utils/jsonExtract.js';
import { initSSE, sendSSE, endSSE } from '../utils/sse.js';
import { loadKnowledge } from '../knowledge-loader.js';
import { wrapUserContent } from '../utils/contentBoundary.js';
import { track, trackUsage } from '../utils/analytics.js';
import { requireAuth } from '../middleware/auth.js';
import { requireCredits } from '../middleware/credits.js';

const modules = await loadKnowledge();
const { buildGrowthSystem, growthSchema } = modules.growth;

const router = express.Router();

// 复盘结论沉淀 → 成长档案
// 一次性 generateText + schema 校验（复用 analyze 的绕 tool_use 模式，SSE 推 result）
// body: { messages, context? }
router.post('/growth', requireAuth, requireCredits, async (req, res) => {
  const { messages = [], context = {} } = req.body;
  if (!messages.length) {
    return res.status(400).json({ error: '缺少 messages' });
  }

  let cfg;
  let model;
  try {
    ({ cfg, model } = getModel(req));
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

  const schemaSection = buildSchemaSection(growthSchema);

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
    failSSE(res, e, 'growth');
  }
});

export default router;
