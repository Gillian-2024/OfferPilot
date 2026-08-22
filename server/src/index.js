import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import analyzeRouter from './routes/analyze.js';
import chatRouter from './routes/chat.js';
import uploadRouter from './routes/upload.js';
import shareRouter from './routes/share.js';
import authRouter from './routes/auth.js';
import historyRouter from './routes/history.js';
import { getDb } from './db/index.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 初始化数据库
getDb();

// API 路由
app.use('/api/auth', authRouter);
app.use('/api/history', historyRouter);
app.use('/api', analyzeRouter);
app.use('/api', chatRouter);
app.use('/api', uploadRouter);
app.use('/api', shareRouter);

// 生产：托管前端构建产物
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
// index.html 不缓存（每次重新校验），保证前端重新构建后用户刷新即见新版；
// /assets 下带 hash 的产物仍走浏览器默认长缓存
app.use(express.static(clientDist, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`\n  OfferPilot 领航员 server: http://localhost:${PORT}`);
  console.log(`  provider 默认: ${process.env.DEFAULT_PROVIDER || 'openai'}\n`);
});
