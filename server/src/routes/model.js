import express from 'express';
import { generateText } from 'ai';
import { getProvider } from '../providers/index.js';
import { resolveConfig } from '../utils/config.js';

const router = express.Router();

// 错误信息压成一行、截断，供前端 tooltip 展示
function shortError(e) {
  const raw = (e && e.message) || String(e);
  const first = raw.split('\n')[0].trim();
  return first.length > 160 ? `${first.slice(0, 160)}…` : first;
}

// 模型配置探测：用 1-token 最小调用验证 API Key / 网关 / 配额 / 模型名是否真的可用
// 返回 { status: 'missing' | 'ok' | 'error', error?, provider?, model? }
router.post('/model/check', async (req, res) => {
  const cfg = resolveConfig(req);
  if (!cfg.apiKey) {
    return res.json({ status: 'missing' });
  }

  let model;
  try {
    model = getProvider(cfg);
  } catch (e) {
    return res.json({ status: 'error', error: shortError(e) });
  }

  try {
    await Promise.race([
      generateText({
        model,
        maxOutputTokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('探测超时（15s），网关可能不可达')), 15000),
      ),
    ]);
    res.json({ status: 'ok', provider: cfg.provider, model: cfg.model });
  } catch (e) {
    console.error('[model/check] error:', e.message || e);
    res.json({ status: 'error', error: shortError(e) });
  }
});

export default router;
