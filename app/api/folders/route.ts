// /api/folders —— 侧边栏文件夹列表 + 创建。移植自 server/src/routes/projects.js 的 folders 段。
import { NextRequest } from "next/server";
import { requireAuthRoute, toRouteError } from "@/lib/db/guards";
import { q, qOne } from "@/lib/db/pool";
import { nanoid } from "@/lib/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { appUser } = await requireAuthRoute(req);
    const folders = await q(
      `SELECT f.id, f.name, f.sort_order, f.created_at,
              (SELECT COUNT(*) FROM projects p WHERE p.folder_id = f.id) AS project_count
       FROM folders f WHERE f.user_id = $1
       ORDER BY f.sort_order ASC`,
      [appUser.id]
    );

    return Response.json({
      items: folders.map((f: any) => ({
        id: f.id,
        name: f.name,
        sort_order: f.sort_order,
        created_at: f.created_at,
        project_count: Number(f.project_count) || 0,
      })),
    });
  } catch (e) {
    return toRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { appUser } = await requireAuthRoute(req);
    const { name } = await req.json().catch(() => ({}));
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return Response.json({ error: "请输入文件夹名称" }, { status: 400 });
    }

    // 取该用户最大 sort_order（无行则从 0 起）
    const maxRow = await qOne<{ sort_order: number }>(
      "SELECT sort_order FROM folders WHERE user_id = $1 ORDER BY sort_order DESC LIMIT 1",
      [appUser.id]
    );
    const nextOrder = maxRow ? Number(maxRow.sort_order) + 1 : 0;

    const id = nanoid();
    const now = Date.now();
    await q(
      "INSERT INTO folders (id, name, user_id, sort_order, created_at) VALUES ($1, $2, $3, $4, $5)",
      [id, name.trim(), appUser.id, nextOrder, now]
    );
    return Response.json({ id, name: name.trim(), sort_order: nextOrder, created_at: now });
  } catch (e) {
    return toRouteError(e);
  }
}
