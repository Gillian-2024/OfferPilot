// GET /api/auth/me —— 当前登录用户（JWT 有效则返回 AppUser，否则 401）。
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/db/auth";
import { getAppUser } from "@/lib/db/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  // JWT 载荷 key 为 userId，映射到 getAppUser 的 { id, email? }
  const appUser = await getAppUser({ id: session.userId, email: session.email });
  return NextResponse.json({ user: appUser });
}
