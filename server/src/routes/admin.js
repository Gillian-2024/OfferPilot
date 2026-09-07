import { Router } from 'express';
import { getStatement } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';
import { parseCapabilities, isSubscribed } from '../utils/entitlements.js';

const router = Router();

function safeParse(text) {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return {};
  }
}

// GET /api/admin/users —— 用户列表 + 权益状态 + 事件统计 + 最后活跃
router.get('/users', requireAdmin, (req, res) => {
  try {
    const users = getStatement(
      'SELECT id, username, nickname, created_at, credits, capabilities, plan_expires_at FROM users ORDER BY created_at DESC'
    ).all();

    const eventCountStmt = getStatement('SELECT COUNT(*) AS c FROM analytics_events WHERE user_id = ?');
    const lastActiveStmt = getStatement('SELECT MAX(ts) AS t FROM analytics_events WHERE user_id = ?');

    res.json({
      users: users.map((u) => {
        const caps = parseCapabilities(u.capabilities);
        return {
          id: u.id,
          username: u.username,
          nickname: u.nickname,
          createdAt: u.created_at,
          credits: u.credits,
          capabilities: caps,
          subscribed: isSubscribed(u.plan_expires_at, caps),
          planExpiresAt: u.plan_expires_at || null,
          eventCount: eventCountStmt.get(u.id).c,
          lastActiveAt: lastActiveStmt.get(u.id).t || null,
        };
      }),
    });
  } catch (e) {
    console.error('[admin/users]', e);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// GET /api/admin/users/:id/events —— 单用户生命周期时间线（全事件倒序）
router.get('/users/:id/events', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const events = getStatement(
      'SELECT event, path, extra, ts, screen, device_id FROM analytics_events WHERE user_id = ? ORDER BY ts DESC LIMIT 200'
    ).all(id);

    res.json({
      events: events.map((e) => ({
        event: e.event,
        path: e.path,
        extra: safeParse(e.extra),
        ts: e.ts,
        screen: e.screen,
        deviceId: e.device_id,
      })),
    });
  } catch (e) {
    console.error('[admin/events]', e);
    res.status(500).json({ error: '获取用户事件失败' });
  }
});

export default router;
