import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'cjc-dev-secret-change-in-production'
);
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
