import express from 'express';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import analyzeRouter from './routes/analyze.js';
import chatRouter from './routes/chat.js';
import growthRouter from './routes/growth.js';
import uploadRouter from './routes/upload.js';
import shareRouter from './routes/share.js';
import authRouter from './routes/auth.js';
import historyRouter from './routes/history.js';
import modelRouter from './routes/model.js';
import invitesRouter from './routes/invites.js';
import projectsRouter from './routes/projects.js';
import analyticsRouter from './routes/analytics.js';
import { getDb } from './db/index.js';

const app = express();
// 不开 CORS：开发走 vite 代理(5173→8787)、生产同源托管 client/dist,无任何跨域合法流量。
// 不挂 cors() 则浏览器直接拦截跨源读取,杜绝第三方站点跨域调本 API。
// 将来若新增独立前端域名,再加 cors 白名单(仅允许该 origin),禁止 origin: true 全放。
app.use(express.json({ limit: '10mb' }));

// 限流：全站 API 兜底 + 登录/注册严限（防撞库刷注册）
// 注：若将来部署到反向代理（nginx/云平台）后面，需加 app.set('trust proxy', 1)，否则所有用户共享代理 IP 桶
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: '尝试过于频繁，请 15 分钟后再试' },
});
app.use('/api', apiLimiter);
app.post('/api/auth/login', authLimiter);
app.post('/api/auth/register', authLimiter);

// 初始化数据库
getDb();

// API 路由
app.use('/api/auth', authRouter);
app.use('/api/history', historyRouter);
app.use('/api', analyzeRouter);
app.use('/api', chatRouter);
app.use('/api', growthRouter);
app.use('/api', uploadRouter);
app.use('/api', shareRouter);
app.use('/api', modelRouter);
app.use('/invites', invitesRouter);
app.use('/projects', projectsRouter);
app.use('/api/analytics', analyticsRouter);

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
