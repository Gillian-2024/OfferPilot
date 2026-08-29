import { Router } from 'express';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// 所有 history 接口需要登录
router.use(requireAuth);

// GET /api/history?type=jd
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { type } = req.query;

    let items;
    if (type) {
      items = db.prepare(
        'SELECT id, type, title, data, provider, model, project_id, created_at FROM history WHERE user_id = ? AND type = ? ORDER BY created_at DESC LIMIT 50'
      ).all(req.userId, type);
    } else {
      items = db.prepare(
        'SELECT id, type, title, data, provider, model, project_id, created_at FROM history WHERE user_id = ? ORDER BY created_at DESC LIMIT 100'
      ).all(req.userId);
    }

    // data 从 JSON string 解析回对象
    const parsed = items.map((item) => ({
      id: item.id,
      type: item.type,
      ts: item.created_at,
      title: item.title,
      data: tryParse(item.data),
      provider: item.provider,
      model: item.model,
      project_id: item.project_id,
    }));

    res.json({ items: parsed });
  } catch (e) {
    console.error('[history/get]', e);
    res.status(500).json({ error: '获取历史记录失败' });
  }
});

// POST /api/history — 支持单条 { type, title, data, ... } 和批量 { items: [...] }
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { items, type, title, data, provider, model } = req.body;

    if (Array.isArray(items)) {
      // 批量同步（首次登录迁移）
      // 归属条件 upsert：id 冲突且属于当前用户 → 更新内容（与客户端同 id 收敛）;
      // 属于其他用户 → WHERE 不命中,整行跳过,绝不覆盖他人记录;不存在 → 插入
      const stmt = db.prepare(
        `INSERT INTO history (id, user_id, type, title, data, provider, model, project_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           type = excluded.type, title = excluded.title, data = excluded.data,
           provider = excluded.provider, model = excluded.model,
           project_id = excluded.project_id, created_at = excluded.created_at
         WHERE history.user_id = excluded.user_id`
      );
      const tx = db.transaction((list) => {
        for (const item of list) {
          const id = item.id || nanoid(12);
          stmt.run(
            id,
            req.userId,
            item.type || 'jd',
            item.title || '',
            typeof item.data === 'string' ? item.data : JSON.stringify(item.data || {}),
            item.provider || null,
            item.model || null,
            item.project_id || item.jobId || null,
            item.ts || Date.now()
          );
        }
        return list.length;
      });
      const count = tx(items);
      res.json({ count });
    } else {
      // 单条添加
      const id = nanoid(12);
      const now = Date.now();
      db.prepare(
        'INSERT INTO history (id, user_id, type, title, data, provider, model, project_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id,
        req.userId,
        type || 'jd',
        title || '',
        typeof data === 'string' ? data : JSON.stringify(data || {}),
        provider || null,
        model || null,
        req.body.project_id || null,
        now
      );
      res.json({ id, createdAt: now });
    }
  } catch (e) {
    console.error('[history/post]', e);
    res.status(500).json({ error: '保存历史记录失败' });
  }
});

// DELETE /api/history/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    // 验证归属
    const item = db.prepare('SELECT user_id FROM history WHERE id = ?').get(id);
    if (!item) {
      return res.status(404).json({ error: '记录不存在' });
    }
    if (item.user_id !== req.userId) {
      return res.status(403).json({ error: '无权删除此记录' });
    }

    db.prepare('DELETE FROM history WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[history/delete]', e);
    res.status(500).json({ error: '删除失败' });
  }
});

function tryParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export default router;
