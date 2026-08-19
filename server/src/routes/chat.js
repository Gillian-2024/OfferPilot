import express from 'express';
import { streamText } from 'ai';
import { getProvider } from '../providers/index.js';
import { resolveConfig } from '../utils/config.js';
import { initSSE, sendSSE, endSSE } from '../utils/sse.js';
import { buildInterviewSystem } from '../prompts/interview.js';
import { REWRITE_SYSTEM } from '../prompts/resume.js';

const router = express.Router();

// 面试复盘对话：streamText 逐字流式
// body: { messages: [{role, content}], context?: {jobProfile, resumeSummary, jdKeywords} }
router.post('/chat', async (req, res) => {
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

  initSSE(res);
  try {
    const result = await streamText({
      model,
      system: buildInterviewSystem(context),
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

// 简历逐段改写：同样 streamText
// body: { messages: [{role, content}] }  首条 user message 应含模块原文 + 目标
router.post('/rewrite', async (req, res) => {
  const { messages = [] } = req.body;
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

  initSSE(res);
  try {
    const result = await streamText({ model, system: REWRITE_SYSTEM, messages });
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
