// 路由守卫：把「会话鉴权」从各路由的重复样板里抽出来。
// 每个守卫出错抛带 status 的 Error，由路由 catch 后转 JSON（复用统一的 toRouteError）。
import { NextRequest } from "next/server";
import { getSessionUser } from "./auth";
import { getAppUser, AppUser } from "./user";

export class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// 统一把守卫抛出的错误转成 route 响应；非 HttpError 则回 500。
export function toRouteError(e: unknown): Response {
  if (e instanceof HttpError) {
    return Response.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status });
  }
  const msg = (e as Error)?.message || "服务器错误";
  return Response.json({ error: msg }, { status: 500 });
}

// 必登录：返回应用用户载荷。未登录抛 401。
export async function requireAuthRoute(req: NextRequest): Promise<{ appUser: AppUser }> {
  const session = await getSessionUser(req);
  if (!session) throw new HttpError(401, "请先登录");
  // JWT 载荷 key 为 userId，而 getAppUser 期望 { id, email? }，做一次映射
  const appUser = await getAppUser({ id: session.userId, email: session.email });
  return { appUser };
}

// 必管理员：在 requireAuthRoute 基础上校验 ADMIN_USERNAMES 白名单。非管理员抛 403。
export async function requireAdminRoute(req: NextRequest): Promise<{ appUser: AppUser }> {
  const ctx = await requireAuthRoute(req);
  if (!ctx.appUser.isAdmin) throw new HttpError(403, "无权限");
  return ctx;
}
