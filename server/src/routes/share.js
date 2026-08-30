import express from 'express';
import { saveShare, getShare } from '../store/share.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// 生成分享：body { type: 'jd'|'resume'|'interview', title, content(markdown/json 字符串) }
// 生成分享需登录;下方 GET /share/:id 保持公开——分享链接要能被未登录访客打开
router.post('/share', requireAuth, (req, res) => {
  const { type, title, content } = req.body;
  if (!content) return res.status(400).json({ error: '缺少 content' });
  const id = saveShare({ type: type || 'generic', title: title || 'OfferPilot 领航员分析报告', content });
  res.json({ id, url: `/share/${id}` });
});

// 读取分享
router.get('/share/:id', (req, res) => {
  const record = getShare(req.params.id);
  if (!record) return res.status(404).json({ error: '分享不存在或已过期' });
  res.json(record);
});

export default router;
