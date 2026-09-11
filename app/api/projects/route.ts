// /api/projects —— 项目列表 + 创建。移植自 server/src/routes/projects.js 的 projects 段。
import { NextRequest } from "next/server";
import { requireAuthRoute, toRouteError } from "@/lib/db/guards";
import { q, qOne } from "@/lib/db/pool";
import { nanoid } from "@/lib/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { appUser } = await requireAuthRoute(req);
    const folderId = req.nextUrl.searchParams.get("folder_id");

    const rows = await q(
      `SELECT id, name, folder_id, created_at, updated_at
       FROM projects WHERE user_id = $1 ${folderId ? "AND folder_id = $2" : ""}
       ORDER BY updated_at DESC`,
      folderId ? [appUser.id, folderId] : [appUser.id]
    );
    return Response.json(rows);
  } catch (e) {
    return toRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { appUser } = await requireAuthRoute(req);
    const { name, folder_id } = await req.json().catch(() => ({}));
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return Response.json({ error: "请输入项目名称" }, { status: 400 });
    }
    if (folder_id) {
      const folder = await qOne<{ id: string }>(
        "SELECT id FROM folders WHERE id = $1 AND user_id = $2",
        [folder_id, appUser.id]
      );
      if (!folder) return Response.json({ error: "所属文件夹不存在" }, { status: 400 });
    }

    const id = nanoid();
    const now = Date.now();
    await q(
      "INSERT INTO projects (id, name, folder_id, user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [id, name.trim(), folder_id || null, appUser.id, now, now]
    );
    return Response.json({ id, name: name.trim(), folder_id: folder_id || null, created_at: now, updated_at: now });
  } catch (e) {
    return toRouteError(e);
  }
}
