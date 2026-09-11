// 路由保护（Edge runtime）。只读环境变量、只操作 request/response cookie。
// Next 16：middleware.ts 约定已弃用，改用 proxy.ts + 导出 proxy 函数（middleware→proxy codemod）。
// 用 jose 校验自有 `op_session` httpOnly JWT（替代 @supabase/ssr 的 Supabase Auth session）。
// 不可 import next/headers（Edge 无 cookies()），故直接用 request/response cookie。
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";

export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const path = req.nextUrl.pathname;

  const isPublic =
    path === "/login" ||
    path === "/register" ||
    path === "/privacy" ||
    path === "/terms" ||
    path.startsWith("/share") || // 分享页：收件人未登录可打开
    path.startsWith("/api/auth") ||
    path === "/api/billing/skus" || // 付费墙公开价目
    path === "/api/analytics/batch" || // 匿名埋点（登录前则上报）
    (path.startsWith("/api/share/") && req.method === "GET"); // 分享 API 未登录可读

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session && !isPublic) {
    if (path.startsWith("/api/")) {
      // API 路由：未登录返回 401 JSON，不重定向
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    const dest = req.nextUrl.clone();
    dest.pathname = "/login";
    return NextResponse.redirect(dest);
  }

  return res;
}

export const config = {
  matcher: [
    // 排除静态资产，其余全部走保护（含 / 与 /api）
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|ico|css|js|woff2?)$).*)",
  ],
};
