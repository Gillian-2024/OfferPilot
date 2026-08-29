import express from 'express';
import { streamText } from 'ai';
import { getProvider } from '../providers/index.js';
import { resolveConfig } from '../utils/config.js';
import { initSSE, sendSSE, endSSE } from '../utils/sse.js';
import { loadKnowledge } from '../knowledge-loader.js';
import { track, trackUsage } from '../utils/analytics.js';

const modules = await loadKnowledge();
const { buildInterviewSystem, buildPrepSystem } = modules.interview;
const { REWRITE_SYSTEM, SELF_EVAL_SYSTEM } = modules.resume;

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

    // Log post-chat analytics
    track(undefined, 'interview_chat_done', {
      mode,
      message_count: messages.length,
      provider: cfg.provider,
      model: cfg.model,
    });
    if (result.usage) {
      trackUsage(undefined, `interview_${mode}`, result.usage, cfg.provider, cfg.model);
    }
  } catch (e) {
    console.error('[chat] error:', e);
    sendSSE(res, { type: 'error', message: e.message || String(e) });
    endSSE(res);
    track(undefined, 'error_api_fail', { endpoint: 'chat', status_code: 500, error_message: e.message, capability: `interview_${mode}` });
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

    // Log post-rewrite analytics
    track(undefined, `chat_${mode}_done`, {
      message_count: messages.length,
      provider: cfg.provider,
      model: cfg.model,
    });
    if (result.usage) {
      trackUsage(undefined, `chat_${mode}`, result.usage, cfg.provider, cfg.model);
    }
  } catch (e) {
    console.error('[rewrite] error:', e);
    sendSSE(res, { type: 'error', message: e.message || String(e) });
    endSSE(res);
    track(undefined, 'error_api_fail', { endpoint: 'rewrite', status_code: 500, error_message: e.message, capability: mode });
  }
});

export default router;
