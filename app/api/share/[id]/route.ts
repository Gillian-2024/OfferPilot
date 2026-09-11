// GET /api/share/:id —— 读取分享。公开（未登录访客可打开分享链接）。原生 SQL 直读。
// 移植自 server/src/routes/share.js。
import { NextRequest } from "next/server";
import { qOne } from "@/lib/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: any) {
  const { id } = await ctx.params;
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return Response.json({ error: "分享不存在或已过期" }, { status: 404 });
  }

  const row = await qOne<any>(
    "SELECT id, type, title, content, user_id, created_at FROM shares WHERE id = $1",
    [id]
  );
  if (!row) {
    return Response.json({ error: "分享不存在或已过期" }, { status: 404 });
  }
  // content 为 jsonb，pg 返回已解析对象，直接回传
  return Response.json(row);
}
