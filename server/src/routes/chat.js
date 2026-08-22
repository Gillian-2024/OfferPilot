import express from 'express';
import { streamText } from 'ai';
import { getProvider } from '../providers/index.js';
import { resolveConfig } from '../utils/config.js';
import { initSSE, sendSSE, endSSE } from '../utils/sse.js';
import { buildInterviewSystem, buildPrepSystem } from '../prompts/interview.js';
import { REWRITE_SYSTEM, SELF_EVAL_SYSTEM } from '../prompts/resume.js';

const router = express.Router();

// 面试对话（复盘 + 准备两种模式）：streamText 逐字流式
// body: { messages, context?, mode?: 'review' | 'prep' }
router.post('/chat', async (req, res) => {
  const { messages = [], context = {}, mode = 'review' } = req.body;
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

  const system = mode === 'prep' ? buildPrepSystem(context) : buildInterviewSystem(context);
  initSSE(res);
  try {
    const result = await streamText({
      model,
      system,
      messages,
    });
    for await (const chunk of result.textStream) {
      sendSSE(res, { type: 'token', text: chunk });
    }
    endSSE(res);
  } catch (e) {
    console.error('[chat] error:', e);
    sendSSE(res, { type: 'error', message: e.message || String(e) });
    endSSE(res);
  }
});

// 简历改写 + 自我评价生成：同样 streamText
// body: { messages: [{role, content}], mode?: 'rewrite' | 'self-eval' }
const SYSTEM_MAP = { rewrite: REWRITE_SYSTEM, 'self-eval': SELF_EVAL_SYSTEM };
router.post('/rewrite', async (req, res) => {
  const { messages = [], mode = 'rewrite' } = req.body;
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

  const system = SYSTEM_MAP[mode] || REWRITE_SYSTEM;
  initSSE(res);
  try {
    const result = await streamText({ model, system, messages });
    for await (const chunk of result.textStream) {
      sendSSE(res, { type: 'token', text: chunk });
    }
    endSSE(res);
  } catch (e) {
    console.error('[rewrite] error:', e);
    sendSSE(res, { type: 'error', message: e.message || String(e) });
    endSSE(res);
  }
});

export default router;
