import { Router } from 'express';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /invites/my — current user's invite info
router.get('/my', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const invite = db.prepare('SELECT id, code, click_count, created_at FROM invites WHERE user_id = ?').get(req.userId);
    if (!invite) {
      // Auto-generate if missing (shouldn't happen, but handle gracefully)
      const code = generateUniqueCode();
      const id = nanoid(12);
      const now = Date.now();
      db.prepare('INSERT INTO invites (id, code, user_id, click_count, created_at) VALUES (?, ?, ?, 0, ?)').run(id, code, req.userId, now);
      return res.json({ id, code, click_count: 0, created_at: now });
    }
    res.json(invite);
  } catch (e) {
    console.error('[invites/my]', e);
    res.status(500).json({ error: '获取邀请信息失败' });
  }
});

// PUT /invites/my/code — set custom invite code
router.put('/my/code', requireAuth, (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: '请输入邀请码' });
    }
    const trimmed = code.trim().toUpperCase();
    if (/[^A-Z0-9_]/.test(trimmed) || trimmed.length < 3 || trimmed.length > 16) {
      return res.status(400).json({ error: '邀请码需 3-16 位大写字母、数字或下划线' });
    }
    const db = getDb();
    // Check uniqueness
    const existing = db.prepare('SELECT id, user_id FROM invites WHERE code = ?').get(trimmed);
    if (existing && existing.user_id !== req.userId) {
      return res.status(409).json({ error: '该邀请码已被使用' });
    }
    const invite = db.prepare('SELECT id FROM invites WHERE user_id = ?').get(req.userId);
    if (!invite) {
      return res.status(404).json({ error: '邀请记录不存在' });
    }
    db.prepare('UPDATE invites SET code = ? WHERE id = ?').run(trimmed, invite.id);
    res.json({ code: trimmed, message: '邀请码已更新' });
  } catch (e) {
    console.error('[invites/update-code]', e);
    res.status(500).json({ error: '更新邀请码失败' });
  }
});

/** Generate unique invite code (retry up to 5 times) */
function generateUniqueCode() {
  const db = getDb();
  for (let i = 0; i < 5; i++) {
    const code = nanoid(12).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (code.length >= 3) {
      const existing = db.prepare('SELECT id FROM invites WHERE code = ?').get(code);
      if (!existing) return code;
    }
  }
  // Last resort: add timestamp suffix
  return nanoid(16).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

export default router;
