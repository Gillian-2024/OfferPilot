import express from 'express';
import { generateText } from 'ai';
import { getProvider } from '../providers/index.js';
import { schemaShape } from '../utils/schemaShape.js';
import { extractAndParse } from '../utils/jsonExtract.js';
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
      // 内网 LLM 网关映射的 reasoning 模型（deepseek/glm/qwen）在 Anthropic 兼容协议下
      // 不稳定支持 generateObject 的 tool_use → 返回空 {}。改用 generateText 直出文本，
      // 在 prompt 里注入 schema 骨架让模型按结构输出，再手动 JSON.parse + zod 校验。
      const fullPrompt = `${step.prompt}

【输出格式 —— 必须严格遵守】
直接输出一个 JSON 对象，严格符合下面的结构（字段名、嵌套层级、数组/对象/标量类型都要匹配）。
不要输出 markdown 代码块标记，不要任何解释性文字，不要在 JSON 之外添加任何内容。
数组没有元素就输出 []，字符串没有内容就输出空字符串 ""。
下面 // 后面是字段说明，实际输出时不要带 // 注释：
${schemaShape(step.schema)}`;
      const { text } = await generateText({
        model,
        system: step.system,
        prompt: fullPrompt,
        maxTokens: 8192,
      });
      const object = extractAndParse(text, step.schema);
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
