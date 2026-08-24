import { Router } from 'express';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// === FOLDERS ===

// GET /api/folders
router.get('/folders', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const folders = db.prepare(
      'SELECT f.*, COUNT(p.id) as project_count FROM folders f LEFT JOIN projects p ON p.folder_id = f.id AND p.user_id = ? WHERE f.user_id = ? GROUP BY f.id ORDER BY f.sort_order ASC',
    ).all(req.userId, req.userId);
    res.json(folders);
  } catch (e) {
    console.error('[folders/list]', e);
    res.status(500).json({ error: '获取文件夹列表失败' });
  }
});

// POST /api/folders
router.post('/folders', requireAuth, (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: '请输入文件夹名称' });
    }
    const db = getDb();
    // Get max sort_order for this user
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as max FROM folders WHERE user_id = ?').get(req.userId);
    const id = nanoid(12);
    const now = Date.now();
    db.prepare('INSERT INTO folders (id, name, user_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?)').run(
      id, name.trim(), req.userId, maxOrder.max + 1, now,
    );
    res.json({ id, name: name.trim(), sort_order: maxOrder.max + 1, created_at: now });
  } catch (e) {
    console.error('[folders/create]', e);
    res.status(500).json({ error: '创建文件夹失败' });
  }
});

// PATCH /api/folders/:id
router.patch('/folders/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!folder) return res.status(404).json({ error: '文件夹不存在' });
    const updates = [];
    const values = [];
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || req.body.name.trim().length === 0) {
        return res.status(400).json({ error: '文件夹名称不能为空' });
      }
      updates.push('name = ?');
      values.push(req.body.name.trim());
    }
    if (req.body.sort_order !== undefined) {
      updates.push('sort_order = ?');
      values.push(Number(req.body.sort_order));
    }
    if (updates.length === 0) return res.status(400).json({ error: '无有效字段' });
    values.push(folder.id);
    db.prepare(`UPDATE folders SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare('SELECT * FROM folders WHERE id = ?').get(folder.id);
    res.json(updated);
  } catch (e) {
    console.error('[folders/update]', e);
    res.status(500).json({ error: '更新文件夹失败' });
  }
});

// DELETE /api/folders/:id
router.delete('/folders/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!folder) return res.status(404).json({ error: '文件夹不存在' });
    db.prepare('DELETE FROM folders WHERE id = ?').run(folder.id);
    res.json({ deleted: true });
  } catch (e) {
    console.error('[folders/delete]', e);
    res.status(500).json({ error: '删除文件夹失败' });
  }
});

// === PROJECTS ===

// GET /api/projects
router.get('/projects', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { folder_id } = req.query;
    let projects;
    if (folder_id) {
      projects = db.prepare('SELECT * FROM projects WHERE user_id = ? AND folder_id = ? ORDER BY updated_at DESC').all(req.userId, folder_id);
    } else {
      projects = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(req.userId);
    }
    res.json(projects);
  } catch (e) {
    console.error('[projects/list]', e);
    res.status(500).json({ error: '获取项目列表失败' });
  }
});

// POST /api/projects
router.post('/projects', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { name, folder_id } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: '请输入项目名称' });
    }
    if (folder_id) {
      const folder = db.prepare('SELECT id FROM folders WHERE id = ? AND user_id = ?').get(folder_id, req.userId);
      if (!folder) return res.status(400).json({ error: '所属文件夹不存在' });
    }
    const id = nanoid(12);
    const now = Date.now();
    db.prepare('INSERT INTO projects (id, name, folder_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, name.trim(), folder_id || null, req.userId, now, now,
    );
    res.json({ id, name: name.trim(), folder_id: folder_id || null, created_at: now, updated_at: now });
  } catch (e) {
    console.error('[projects/create]', e);
    res.status(500).json({ error: '创建项目失败' });
  }
});

// PATCH /api/projects/:id
router.patch('/projects/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    const updates = [];
    const values = [];
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || req.body.name.trim().length === 0) {
        return res.status(400).json({ error: '项目名称不能为空' });
      }
      updates.push('name = ?');
      values.push(req.body.name.trim());
    }
    if (req.body.folder_id !== undefined) {
      if (req.body.folder_id !== null) {
        const folder = db.prepare('SELECT id FROM folders WHERE id = ? AND user_id = ?').get(req.body.folder_id, req.userId);
        if (!folder) return res.status(400).json({ error: '所属文件夹不存在' });
      }
      updates.push('folder_id = ?');
      values.push(req.body.folder_id || null);
    }
    if (updates.length === 0) return res.status(400).json({ error: '无有效字段' });
    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(project.id);
    db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id);
    res.json(updated);
  } catch (e) {
    console.error('[projects/update]', e);
    res.status(500).json({ error: '更新项目失败' });
  }
});

// DELETE /api/projects/:id
router.delete('/projects/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    const result = db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
    res.json({ deleted: true, count: result.changes });
  } catch (e) {
    console.error('[projects/delete]', e);
    res.status(500).json({ error: '删除项目失败' });
  }
});

export default router;
