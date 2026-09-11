// POST /api/auth/login —— 国内自有登录（email + password → public.users.password_hash 校验 → jose JWT cookie）。
import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, getAppUser } from "@/lib/db/user";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/db/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!email || !password) {
    return NextResponse.json({ error: "请输入邮箱和密码" }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (!user) return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });

  const appUser = await getAppUser({ id: user.id, email });
  const res = NextResponse.json({ user: appUser });
  await setSessionCookie(res, { userId: user.id, email });
  return res;
}
