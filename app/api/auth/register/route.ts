// POST /api/auth/register —— 国内自有注册（email + password → bcrypt 哈希存 public.users → jose JWT cookie）。
import { NextRequest, NextResponse } from "next/server";
import { createAppUser, getAppUser, findUserByEmail } from "@/lib/db/user";
import { hashPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/db/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  // 昵称选填：去首尾空白、截 32 字；未填回落邮箱前缀
  const nickname = String(body?.nickname || "").trim().slice(0, 32) || email.split("@")[0] || email;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "密码至少 6 个字符" }, { status: 400 });
  }
  const exists = await findUserByEmail(email);
  if (exists) return NextResponse.json({ error: "该邮箱已注册" }, { status: 400 });

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  await createAppUser({ id, email, nickname, passwordHash });
  const appUser = await getAppUser({ id, email });
  const res = NextResponse.json({ user: appUser });
  await setSessionCookie(res, { userId: id, email });
  return res;
}
