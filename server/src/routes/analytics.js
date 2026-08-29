import express from 'express';
import { getDb } from '../db/index.js';

const router = express.Router();

// ── Batch event ingestion (frontend SDK) ───────────────────────

/**
 * POST /api/analytics/batch
 * Body: { events: [{ device_id?, event, path?, extra?, ts?, ua?, screen? }] }
 * Max 100 events per request.
 */
router.post('/analytics/batch', async (req, res) => {
  try {
    const { events } = req.body;
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events 必须是非空数组' });
    }
    if (events.length > 100) {
      return res.status(400).json({ error: '单次最多 100 条事件' });
    }

    const db = getDb();
    const now = Date.now();

    // Prepare single insert to avoid N+1
    const stmt = db.prepare(`
      INSERT INTO analytics_events (device_id, user_id, event, path, extra, ts, ua, screen, created_at)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((rows) => {
      for (const e of rows) {
        stmt.run(...e);
      }
    });

    const values = events.map((e) => [
      e.device_id || '',
      e.event,
      e.path || null,
      JSON.stringify(e.extra || {}),
      e.ts || now,
      e.ua || '',
      e.screen || '',
      now,
    ]);

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
