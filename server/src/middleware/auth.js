import 'dotenv/config';
import { SignJWT, jwtVerify } from 'jose';

// 无 JWT_SECRET 直接启动失败——明文兜底密钥等于公开密钥，任何人可伪造任意用户的 token
if (!process.env.JWT_SECRET) {
  throw new Error('[auth] 缺少 JWT_SECRET：请在 .env 配置随机密钥（生成：openssl rand -hex 32）');
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const JWT_EXPIRES = '7d';

export async function signToken(userId, username) {
  return new SignJWT({ sub: userId, username })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(JWT_EXPIRES)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

export function requireAuth(req, res, next) {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' });
  }
  jwtVerify(header.slice(7), JWT_SECRET)
    .then(({ payload }) => {
      req.userId = payload.sub;
      req.username = payload.username;
      next();
    })
    .catch(() => {
      res.status(401).json({ error: '登录已过期，请重新登录' });
    });
}

export function optionalAuth(req, res, next) {
  const header = req.header('authorization');
  if (header?.startsWith('Bearer ')) {
    jwtVerify(header.slice(7), JWT_SECRET)
      .then(({ payload }) => {
        req.userId = payload.sub;
        req.username = payload.username;
        next();
      })
      .catch(() => next());
  } else {
    next();
  }
}
