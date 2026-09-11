// 国内自有会话层：从 httpOnly JWT cookie 取/写会话（替代 @supabase/ssr makeRouteSupabase / currentUser）。
// 只负责「鉴权 + 取 userId/email」；业务数据由 lib/db/* 用原生 pg 读写 public.users（事实源）。
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, signSession, type SessionPayload } from "@/lib/auth/jwt";

export const SESSION_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  // 生产默认给 cookie 加 Secure(仅 HTTPS 传输)。备案等待期用 http://IP 直连时,
  // 带 Secure 的 cookie 会被浏览器直接丢弃导致登录态无法保持;此时设 COOKIE_SECURE=false 关闭,
  // 上 HTTPS(域名+证书)后删掉该变量即恢复 Secure。默认行为保持不变。
  secure: process.env.COOKIE_SECURE === "false" ? false : process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 天
};

// route handler 用：读请求 cookie 解码会话；无效 → null。
export async function getSessionUser(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return token ? verifySession(token) : null;
}

// server component / server action 用：读 cookie()。
export async function currentSessionUser(): Promise<SessionPayload | null> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  return token ? verifySession(token) : null;
}

// 登录/注册成功：把会话写入返回的 response。
export async function setSessionCookie(res: NextResponse, payload: SessionPayload): Promise<void> {
  const token = await signSession(payload);
  res.cookies.set(SESSION_COOKIE, token, SESSION_OPTS);
}

// 登出：清空会话 cookie。
export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, "", { ...SESSION_OPTS, maxAge: 0 });
  return res;
}
