// DELETE /api/history/:id —— 删除单条历史（仅本人）。移植自 server/src/routes/history.js 的 delete 段。
import { NextRequest } from "next/server";
import { requireAuthRoute, toRouteError } from "@/lib/db/guards";
import { q, qOne } from "@/lib/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, ctx: any) {
  try {
    const { appUser } = await requireAuthRoute(req);
    const { id } = await ctx.params;

    const item = await qOne<{ id: string; user_id: string }>(
      "SELECT id, user_id FROM history WHERE id = $1",
      [id]
    );
    if (!item) return Response.json({ error: "记录不存在" }, { status: 404 });
    // 原生库无 RLS，这里显式校验归属兜底
    if (item.user_id !== appUser.id) return Response.json({ error: "无权删除此记录" }, { status: 403 });

    await q("DELETE FROM history WHERE id = $1 AND user_id = $2", [id, appUser.id]);
    return Response.json({ ok: true });
  } catch (e) {
    return toRouteError(e);
  }
}
