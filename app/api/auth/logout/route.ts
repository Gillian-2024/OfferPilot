// POST /api/auth/logout —— 清空国内 JWT 会话 cookie。
import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/db/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
