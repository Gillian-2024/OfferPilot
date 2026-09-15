// 路由保护（Edge runtime）。只读环境变量、只操作 request/response cookie。
// Next 16：middleware.ts 约定已弃用，改用 proxy.ts + 导出 proxy 函数（middleware→proxy codemod）。
// 用 jose 校验自有 `op_session` httpOnly JWT（替代 @supabase/ssr 的 Supabase Auth session）。
// 不可 import next/headers（Edge 无 cookies()），故直接用 request/response cookie。
//
// 门禁形态（2026-09-14 调整）：**页面全部公开，鉴权只拦 /api**。
// 进站直达产品界面（无落地页、无登录墙）；未登录调受保护接口时返回 401，
// 由前端 AuthModal 就地弹注册/登录（注册功能本身保留，只是不再前置阻断访问）。
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";

// 无需登录即可调用的 API（其余 /api/* 一律要会话）
function isPublicApi(path: string, method: string): boolean {
  return (
    path.startsWith("/api/auth") ||
    path === "/api/billing/skus" || // 付费墙公开价目
    path === "/api/analytics/batch" || // 匿名埋点（登录前即上报）
    (path.startsWith("/api/share/") && method === "GET") // 分享 API 未登录可读
  );
}

export async function proxy(req: NextRequest) {
  const res = NextResponse.next({ request: req });
  const path = req.nextUrl.pathname;

  // 页面路由（含 /）全部放行：不再重定向到 /login
  if (!path.startsWith("/api/")) return res;

  if (isPublicApi(path, req.method)) return res;

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) {
    // API 路由：未登录返回 401 JSON，不重定向（前端据此弹登录框）
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  return res;
}

export const config = {
  matcher: [
    // 排除静态资产，其余全部进入（页面直接放行，/api 走鉴权）
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|ico|css|js|woff2?)$).*)",
  ],
};
