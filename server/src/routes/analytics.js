import express from 'express';
import rateLimit from 'express-rate-limit';
import { getDb } from '../db/index.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// ── Batch event ingestion (frontend SDK) ───────────────────────

// 对外开放收紧:匿名埋点保留(登录前漏斗 page_enter 等依赖匿名上报),
// 但堵死「匿名无限写盘」滥用面——单 IP 严限流 + 单批量/字段长度全截断。
// 若未来埋点需要更强可信度,再考虑登录态关联或上报签名,不在本次范围。
const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
});

// 与客户端 SDK 的 BATCH_SIZE=20 对齐,服务端不再多给余量
const MAX_BATCH = 20;
const clipStr = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

/**
 * POST /api/analytics/batch
 * Body: { events: [{ device_id?, event, path?, extra?, ts?, ua?, screen? }] }
 * 单次最多 20 条事件,字段超长截断,非法事件丢弃。
 */
router.post('/analytics/batch', analyticsLimiter, optionalAuth, async (req, res) => {
  try {
    const { events } = req.body;
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events 必须是非空数组' });
    }
    if (events.length > MAX_BATCH) {
      return res.status(400).json({ error: `单次最多 ${MAX_BATCH} 条事件` });
    }

    const db = getDb();
    const now = Date.now();

    // Prepare single insert to avoid N+1
    const stmt = db.prepare(`
      INSERT INTO analytics_events (device_id, user_id, event, path, extra, ts, ua, screen, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((rows) => {
      for (const r of rows) {
        stmt.run(...r);
      }
    });

    // 逐条校验+截断:缺 event 名/非对象的直接丢弃,extra 序列化后限 2KB
    const values = [];
    for (const e of events) {
      if (!e || typeof e !== 'object' || typeof e.event !== 'string' || !e.event) continue;
      let extraStr = '{}';
      try {
        extraStr = JSON.stringify(e.extra || {});
      } catch {
        extraStr = '{}';
      }
      values.push([
        clipStr(e.device_id, 64),
        req.userId || null,
        clipStr(e.event, 64),
        clipStr(e.path, 256) || null,
        extraStr.slice(0, 2048),
        typeof e.ts === 'number' ? e.ts : now,
        clipStr(e.ua, 256),
        clipStr(e.screen, 32),
        now,
      ]);
    }
    if (!values.length) {
      return res.status(400).json({ error: '无有效事件（每条需含非空 event 字符串）' });
    }

    insertMany(values);
    res.json({ ok: true, received: values.length });
  } catch (e) {
    console.error('[analytics] batch insert error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Server-side analytics helper ───────────────────────────────

/**
 * Log an analytics event from server code (routes, middleware, etc.)
 * Automatically resolves device_id from cookie or generates anonymous one.
 */
export function logAnalyticsEvent(userId, event, extra = {}, meta = {}) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO analytics_events (device_id, user_id, event, path, extra, ts, ua, screen, created_at)
      VALUES ('anonymous', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId || null,
      event,
      meta.path || null,
      JSON.stringify(extra),
      meta.ts || Date.now(),
      meta.ua || '',
      meta.screen || '',
      Date.now(),
    );
  } catch (e) {
    // Fail silently — analytics shouldn't break the main flow
    console.error('[analytics] log event error:', e.message);
  }
}

export default router;
