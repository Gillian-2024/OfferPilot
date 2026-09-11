// 国内自有会话：jose 签/验 HS256 JWT，存 httpOnly cookie（替代 @supabase/ssr 的 Supabase Auth session）。
// 业务身份存 public.users，JWT 只携带 userId+email；服务端校验后再读 public.users（事实源）。
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const SESSION_COOKIE = "op_session";

export function getJwtSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("缺少 JWT_SECRET（请检查 .env.local / 生产 env）");
  return new TextEncoder().encode(s);
}

export type SessionPayload = { userId: string; email: string };

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getJwtSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const userId = payload.userId;
    const email = payload.email;
    if (typeof userId !== "string" || typeof email !== "string") return null;
    return { userId, email };
  } catch {
    return null; // 过期 / 签名不符 / 格式错 → 一律视为未登录
  }
}
