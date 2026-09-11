// PATCH /api/folders/:id（改名/排序）+ DELETE /api/folders/:id。移植自 projects.js folders 段。
import { NextRequest } from "next/server";
import { requireAuthRoute, toRouteError } from "@/lib/db/guards";
import { q, qOne } from "@/lib/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: any) {
  try {
    const { appUser } = await requireAuthRoute(req);
    const { id } = await ctx.params;

    const folder = await qOne<{ id: string }>(
      "SELECT id FROM folders WHERE id = $1 AND user_id = $2",
      [id, appUser.id]
    );
    if (!folder) return Response.json({ error: "文件夹不存在" }, { status: 404 });

    const { name, sort_order } = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return Response.json({ error: "文件夹名称不能为空" }, { status: 400 });
      }
      updates.name = name.trim();
    }
    if (sort_order !== undefined) updates.sort_order = Number(sort_order);
    if (!Object.keys(updates).length) return Response.json({ error: "无有效字段" }, { status: 400 });

    const cols = Object.keys(updates); // 仅可能为 name / sort_order
    const setSql = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
    const params = cols.map((c) => updates[c]);
    await q(`UPDATE folders SET ${setSql} WHERE id = $${cols.length + 1} AND user_id = $${cols.length + 2}`, [
      ...params,
      id,
      appUser.id,
    ]);
    return Response.json({ id, ...updates });
  } catch (e) {
    return toRouteError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: any) {
  try {
    const { appUser } = await requireAuthRoute(req);
    const { id } = await ctx.params;

    const folder = await qOne<{ id: string }>(
      "SELECT id FROM folders WHERE id = $1 AND user_id = $2",
      [id, appUser.id]
    );
    if (!folder) return Response.json({ error: "文件夹不存在" }, { status: 404 });

    await q("DELETE FROM folders WHERE id = $1 AND user_id = $2", [id, appUser.id]);
    return Response.json({ deleted: true });
  } catch (e) {
    return toRouteError(e);
  }
}
