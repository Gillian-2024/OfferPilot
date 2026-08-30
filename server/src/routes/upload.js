import express from 'express';
import multer from 'multer';
import { parseFile } from '../parsers/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// 10MB 内存存储，文件解析在前端上传后由后端统一处理（API Key 不暴露）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// body: multipart/form-data, field: file
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '缺少 file 字段' });
  }
  try {
    const text = await parseFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    if (!text || text.length < 10) {
      return res.status(400).json({
        error: '解析结果为空或过短，可能文件内容缺失、是扫描件（需 OCR，暂不支持）或格式异常',
      });
    }
    res.json({
      text,
      name: req.file.originalname,
      size: req.file.size,
      chars: text.length,
    });
  } catch (e) {
    console.error('[upload] error:', e);
    res.status(400).json({ error: e.message || String(e) });
  }
});

export default router;
