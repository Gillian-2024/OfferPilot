import express from 'express';
import { generateObject } from 'ai';
import { getProvider } from '../providers/index.js';
import { resolveConfig } from '../utils/config.js';
import { initSSE, sendSSE, endSSE } from '../utils/sse.js';
import { buildJDSteps } from '../prompts/jd.js';
import { buildResumeSteps } from '../prompts/resume.js';

const router = express.Router();

// JD/简历拆解：分步链，SSE 推送 step 进度 + 最终 result
// body: { type: 'jd'|'resume', text, jdProfile?: object（对照基准=完整 JD 拆解结果）, jdKeywords?: string[]（降级用） }
router.post('/analyze', async (req, res) => {
  const { type, text, jdKeywords = [], jdProfile = null } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: '缺少待分析文本 text' });
  }

  const cfg = resolveConfig(req);
  let model;
  try {
    model = getProvider(cfg);
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
  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i](prev);
      sendSSE(res, { type: 'step', index: i + 1, total: steps.length, label: step.label });
      const { object } = await generateObject({
        model,
        system: step.system,
        prompt: step.prompt,
        schema: step.schema,
      });
      prev = object;
      combined = { ...combined, ...object };
      sendSSE(res, { type: 'step_done', index: i + 1, label: step.label });
    }
    sendSSE(res, { type: 'result', data: combined, provider: cfg.provider, model: cfg.model });
    endSSE(res);
  } catch (e) {
    console.error('[analyze] error:', e);
    sendSSE(res, { type: 'error', message: e.message || String(e) });
    endSSE(res);
  }
});

export default router;
