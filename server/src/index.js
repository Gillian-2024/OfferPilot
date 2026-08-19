import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import analyzeRouter from './routes/analyze.js';
import chatRouter from './routes/chat.js';
import uploadRouter from './routes/upload.js';
import shareRouter from './routes/share.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API 路由
app.use('/api', analyzeRouter);
app.use('/api', chatRouter);
app.use('/api', uploadRouter);
app.use('/api', shareRouter);

// 生产：托管前端构建产物
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`\n  校招教练 server: http://localhost:${PORT}`);
  console.log(`  provider 默认: ${process.env.DEFAULT_PROVIDER || 'openai'}\n`);
});
