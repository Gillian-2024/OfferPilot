import express from 'express';
import { nanoid } from 'nanoid';
import { streamText } from 'ai';
import { getModel, failSSE } from '../harness/run.js';
import { initSSE, sendSSE, endSSE } from '../utils/sse.js';
import { loadKnowledge } from '../knowledge-loader.js';
import { track, trackUsage } from '../utils/analytics.js';
import { requireAuth } from '../middleware/auth.js';
import { requireCredits } from '../middleware/credits.js';
import { getStatement } from '../db/index.js';
import { wrapUserContent } from '../utils/contentBoundary.js';

const modules = await loadKnowledge();
const { buildInterviewSystem, buildPrepSystem } = modules.interview;
const { REWRITE_SYSTEM, SELF_EVAL_SYSTEM } = modules.resume;

const router = express.Router();

// 洞 2 兜底:流式成功结束后,登录态强制写一条 history(与客户端 debounce 同 id OR-REPLACE 收敛)
function persistChatHistory({ userId, id, type, title, data, provider, model }) {
  if (!userId) return;
  try {
    getStatement(
      'INSERT OR REPLACE INTO history (id, user_id, type, title, data, provider, model, project_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id || nanoid(12), userId, type, title, JSON.stringify(data), provider, model, null, Date.now());
  } catch (e) {
    // 兜底落库失败不阻断主流程
    console.error('[chat] persistChatHistory failed:', e);
  }
}

// title 取最后一条 user 消息前 30 字,与客户端 P1-1 persistSession 口径一致
function chatTitle(messages) {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  return last?.content?.slice(0, 30) || `对话 ${new Date().toLocaleDateString('zh-CN')}`;
}

// 面试对话（复盘 + 准备两种模式）：streamText 逐字流式
// body: { messages, context?, mode?: 'review' | 'prep', sessionId? }
// 对外开放:需登录——LLM 调用走服务端 key,匿名开放等于成本滥用敞口;登录态同时拿到 userId 供兜底落库
// 注意按路由挂 requireAuth,不用 router.use:本 router 挂在共享 /api 前缀上,
// router.use 会拦住所有进入该前缀的请求(包括后面 router 的公开端点)
router.post('/chat', requireAuth, requireCredits, async (req, res) => {
  const { messages = [], context = {}, mode = 'review', sessionId } = req.body;
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

  const system = mode === 'prep' ? buildPrepSystem(context) : buildInterviewSystem(context);
  // 洞 1:user 消息包 <user-content> 边界,让铁律 #1 的注入协议在 chat 也生效(与 analyze/growth 对齐)
  const safe = messages.map((m) =>
    m.role === 'user' ? { ...m, content: wrapUserContent(m.content) } : m
  );
  initSSE(res);
  try {
    const result = await streamText({
      model,
      system,
      messages: safe,
    });
    let acc = '';
    for await (const chunk of result.textStream) {
      acc += chunk;
      sendSSE(res, { type: 'token', text: chunk });
    }
    endSSE(res);

    // 洞 2 兜底:登录态流式成功完成后强制落库;同 sessionId OR-REPLACE,与客户端 debounce 收敛不双写
    if (req.userId) {
      persistChatHistory({
        userId: req.userId,
        id: sessionId,
        type: 'interview',
        title: chatTitle(messages),
        data: { messages: [...messages, { role: 'assistant', content: acc }], mode },
        provider: cfg.provider,
        model: cfg.model,
      });
    }

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
    failSSE(res, e, 'chat', `interview_${mode}`);
  }
});

// 简历改写 + 自我评价生成：同样 streamText
// body: { messages: [{role, content}], mode?: 'rewrite' | 'self-eval', sessionId? }
const SYSTEM_MAP = { rewrite: REWRITE_SYSTEM, 'self-eval': SELF_EVAL_SYSTEM };
router.post('/rewrite', requireAuth, requireCredits, async (req, res) => {
  const { messages = [], mode = 'rewrite', sessionId } = req.body;
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

  const system = SYSTEM_MAP[mode] || REWRITE_SYSTEM;
  // 洞 1:同 chat,user 消息包边界
  const safe = messages.map((m) =>
    m.role === 'user' ? { ...m, content: wrapUserContent(m.content) } : m
  );
  initSSE(res);
  try {
    const result = await streamText({ model, system, messages: safe });
    let acc = '';
    for await (const chunk of result.textStream) {
      acc += chunk;
      sendSSE(res, { type: 'token', text: chunk });
    }
    endSSE(res);

    // 洞 2 兜底:rewrite 页面客户端本就无 debounce,登录态服务端独立落一条
    if (req.userId) {
      persistChatHistory({
        userId: req.userId,
        id: sessionId,
        type: 'resume',
        title: chatTitle(messages),
        data: { messages: [...messages, { role: 'assistant', content: acc }], mode },
        provider: cfg.provider,
        model: cfg.model,
      });
    }

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
    failSSE(res, e, 'rewrite', mode);
  }
});

export default router;
