import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { signToken, requireAuth, isAdminUsername } from '../middleware/auth.js';
import { parseCapabilities } from '../utils/entitlements.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password, nickname } = req.body;

    // 验证
    if (!username || typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 20) {
      return res.status(400).json({ error: '用户名需要 2-20 个字符' });
    }
    if (!/^[a-zA-Z0-9_一-龥]+$/.test(username.trim())) {
      return res.status(400).json({ error: '用户名只支持字母、数字、下划线和中文' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: '密码至少 6 个字符' });
    }

    const db = getDb();
    const trimmed = username.trim();

    // 唯一性检查
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(trimmed);
    if (existing) {
      return res.status(409).json({ error: '用户名已被注册' });
    }

    // 创建用户
    const id = nanoid(12);
    const passwordHash = await bcrypt.hash(password, 10);
    const now = Date.now();
    const displayName = nickname?.trim() || trimmed;

    db.prepare('INSERT INTO users (id, username, password, nickname, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, trimmed, passwordHash, displayName, now, now);

    const token = await signToken(id, trimmed);

    res.json({
      token,
      user: { id, username: trimmed, nickname: displayName, createdAt: now, credits: 3, capabilities: [], planExpiresAt: null, isAdmin: isAdminUsername(trimmed) },
    });
  } catch (e) {
    console.error('[auth/register]', e);
    res.status(500).json({ error: '注册失败，请重试' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());

    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = await signToken(user.id, user.username);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        createdAt: user.created_at,
        credits: user.credits,
        capabilities: parseCapabilities(user.capabilities),
        planExpiresAt: user.plan_expires_at || null,
        isAdmin: isAdminUsername(user.username),
      },
    });
  } catch (e) {
    console.error('[auth/login]', e);
    res.status(500).json({ error: '登录失败，请重试' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id, username, nickname, created_at, credits, capabilities, plan_expires_at FROM users WHERE id = ?').get(req.userId);

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      createdAt: user.created_at,
      credits: user.credits,
      capabilities: parseCapabilities(user.capabilities),
      planExpiresAt: user.plan_expires_at || null,
      isAdmin: isAdminUsername(user.username),
    });
  } catch (e) {
    console.error('[auth/me]', e);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

export default router;
