// PATCH /api/projects/:id（改名/移文件夹）+ DELETE。移植自 projects.js projects 段。
import { NextRequest } from "next/server";
import { requireAuthRoute, toRouteError } from "@/lib/db/guards";
import { q, qOne } from "@/lib/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: any) {
  try {
    const { appUser } = await requireAuthRoute(req);
    const { id } = await ctx.params;

    const project = await qOne<{ id: string }>(
      "SELECT id FROM projects WHERE id = $1 AND user_id = $2",
      [id, appUser.id]
    );
    if (!project) return Response.json({ error: "项目不存在" }, { status: 404 });

    const { name, folder_id } = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return Response.json({ error: "项目名称不能为空" }, { status: 400 });
      }
      updates.name = name.trim();
    }
    if (folder_id !== undefined) {
      if (folder_id !== null) {
        const folder = await qOne<{ id: string }>(
          "SELECT id FROM folders WHERE id = $1 AND user_id = $2",
          [folder_id, appUser.id]
        );
        if (!folder) return Response.json({ error: "所属文件夹不存在" }, { status: 400 });
      }
      updates.folder_id = folder_id || null;
    }
    if (!Object.keys(updates).length) return Response.json({ error: "无有效字段" }, { status: 400 });
    updates.updated_at = Date.now();

    const cols = Object.keys(updates); // 仅可能 name / folder_id / updated_at
    const setSql = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
    const params = cols.map((c) => updates[c]);
    await q(`UPDATE projects SET ${setSql} WHERE id = $${cols.length + 1} AND user_id = $${cols.length + 2}`, [
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

    const project = await qOne<{ id: string }>(
      "SELECT id FROM projects WHERE id = $1 AND user_id = $2",
      [id, appUser.id]
    );
    if (!project) return Response.json({ error: "项目不存在" }, { status: 404 });

    await q("DELETE FROM projects WHERE id = $1 AND user_id = $2", [id, appUser.id]);
    return Response.json({ deleted: true, count: 1 });
  } catch (e) {
    return toRouteError(e);
  }
}
