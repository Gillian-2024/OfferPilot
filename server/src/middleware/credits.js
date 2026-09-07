import { getStatement } from '../db/index.js';
import { parseCapabilities, isSubscribed } from '../utils/entitlements.js';

// 额度校验 + 扣减中间件:挂在 LLM 端点(analyze/chat/rewrite/growth)上,requireAuth 之后
// 权益判定:月卡/求职通有效期内 → 免扣放行;免费/单次卡用户 → credits>0 则前置扣 1,否则 403 触发付费墙
// 扣减粒度(哪些端点扣、chat 多轮怎么算)属产品待定项,当前统一「1 次/端点」
// 前置扣减为框架最简实现——LLM 调用失败不退额度,留待接支付/对账再优化
export function requireCredits(req, res, next) {
  const user = getStatement(
    'SELECT credits, capabilities, plan_expires_at FROM users WHERE id = ?'
  ).get(req.userId);

  if (!user) return res.status(401).json({ error: '用户不存在' });

  if (isSubscribed(user.plan_expires_at, parseCapabilities(user.capabilities))) {
    return next();
  }

  if (user.credits <= 0) {
    return res.status(403).json({ error: '免费额度已用完', code: 'QUOTA_EXCEEDED' });
  }

  getStatement('UPDATE users SET credits = credits - 1 WHERE id = ?').run(req.userId);
  next();
}
