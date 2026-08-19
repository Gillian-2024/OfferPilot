import express from 'express';
import { saveShare, getShare } from '../store/share.js';

const router = express.Router();

// 生成分享：body { type: 'jd'|'resume'|'interview', title, content(markdown/json 字符串) }
router.post('/share', (req, res) => {
  const { type, title, content } = req.body;
  if (!content) return res.status(400).json({ error: '缺少 content' });
  const id = saveShare({ type: type || 'generic', title: title || '校招教练分析报告', content });
  res.json({ id, url: `/share/${id}` });
});

// 读取分享
router.get('/share/:id', (req, res) => {
  const record = getShare(req.params.id);
  if (!record) return res.status(404).json({ error: '分享不存在或已过期' });
  res.json(record);
});

export default router;
