import express from 'express';
import { generateText } from 'ai';
import { getModel, buildSchemaSection, failSSE } from '../harness/run.js';
import { extractAndParse } from '../utils/jsonExtract.js';
import { initSSE, sendSSE, endSSE } from '../utils/sse.js';
import { loadKnowledge } from '../knowledge-loader.js';
import { wrapUserContent } from '../utils/contentBoundary.js';
import { track, trackUsage } from '../utils/analytics.js';
import { requireAuth } from '../middleware/auth.js';

const modules = await loadKnowledge();
const { buildJDSteps } = modules.jd;
const { buildResumeSteps } = modules.resume;

const router = express.Router();

// JD/简历拆解：分步链，SSE 推送 step 进度 + 最终 result
// body: { type: 'jd'|'resume', text, jdProfile?: object（对照基准=完整 JD 拆解结果）, jdKeywords?: string[]（降级用） }
router.post('/analyze', requireAuth, async (req, res) => {
  const { type, text, jdKeywords = [], jdProfile = null } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: '缺少待分析文本 text' });
  }

  let cfg;
  let model;
  try {
    ({ cfg, model } = getModel(req));
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  // 简历拆解对照 JD：优先用完整 jdProfile（对照基准），降级到 jdKeywords（仅关键词匹配）
  const resumeBaseline = jdProfile || (jdKeywords.length ? { keyword_list: jdKeywords } : null);
  const steps =
    type === 'jd' ? buildJDSteps(text) : type === 'resume' ? buildResumeSteps(text, resumeBaseline) : null;
  if (!steps) {
    return res.status(400).json({ error: "type 必须是 'jd' | 'resume'" });
  }

  initSSE(res);
  let prev = null;
  let combined = {};
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const startTime = Date.now();
  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i](prev);
      sendSSE(res, { type: 'step', index: i + 1, total: steps.length, label: step.label });

      const schemaSection = buildSchemaSection(step.schema);

      const wrapped = wrapUserContent(step.prompt);
      if (!wrapped) {
        sendSSE(res, { type: 'error', message: '输入内容为空' });
        endSSE(res);
        continue;
      }

      // Capture full result to get .usage
      const result = await generateText({
        model,
        system: step.system,
        prompt: `${wrapped}\n\n请根据上面的内容完成「${steps[i].label}」步骤的输出。\n\n${schemaSection}`,
        maxOutputTokens: 8192,
      });
      const text = typeof result === 'object' && result.text !== undefined ? result.text : result;
      const usage = typeof result === 'object' ? result.usage : undefined;

      // Aggregate token usage across all steps
      if (usage?.inputTokens) totalInputTokens += Number(usage.inputTokens) || 0;
      if (usage?.outputTokens) totalOutputTokens += Number(usage.outputTokens) || 0;

      const object = extractAndParse(text, step.schema);
      prev = object;
      combined = { ...combined, ...object };
      sendSSE(res, { type: 'step_done', index: i + 1, label: step.label });
    }
    const duration = Date.now() - startTime;
    sendSSE(res, { type: 'result', data: combined, provider: cfg.provider, model: cfg.model });
    endSSE(res);

    // Log analytics after successful completion
    track(undefined, `${type}_extraction_done`, {
      steps: steps.length,
      duration_ms: duration,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      provider: cfg.provider,
      model: cfg.model,
    });
    trackUsage(undefined, type, { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }, cfg.provider, cfg.model);
  } catch (e) {
    failSSE(res, e, 'analyze', type);
  }
});

export default router;
