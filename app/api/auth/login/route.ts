// POST /api/auth/login —— 国内自有登录（email + password → public.users.password_hash 校验 → jose JWT cookie）。
import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, getAppUser } from "@/lib/db/user";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/db/auth";
import { authIpHit, accountLocked, accountFail, accountSuccess, clientIp, tooMany } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 防撞库：先按 IP 计数（每次请求都算），再按账号看失败锁定
  const ipRetry = authIpHit(clientIp(req.headers));
  if (ipRetry) return tooMany(ipRetry);

  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!email || !password) {
    return NextResponse.json({ error: "请输入邮箱和密码" }, { status: 400 });
  }

  const lockRetry = accountLocked(email);
  if (lockRetry) return tooMany(lockRetry, "该账号登录失败次数过多，已暂时锁定");

  const user = await findUserByEmail(email);
  // 不存在的邮箱也计失败，避免借锁定与否探测账号是否存在
  const ok = user ? await verifyPassword(password, user.password_hash) : false;
  if (!user || !ok) {
    accountFail(email);
    return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
  }
  accountSuccess(email);

  const appUser = await getAppUser({ id: user.id, email });
  const res = NextResponse.json({ user: appUser });
  await setSessionCookie(res, { userId: user.id, email });
  return res;
}
