// PUT /api/invites/my/code —— 设置自定义邀请码（3-16 位大写字母/数字/下划线）。
// 移植自 server/src/routes/invites.js。跨用户唯一性用原生 SQL 全表查询。
import { NextRequest } from "next/server";
import { requireAuthRoute, toRouteError } from "@/lib/db/guards";
import { q, qOne } from "@/lib/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  try {
    const { appUser } = await requireAuthRoute(req);
    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.code === "string" ? body.code : "";
    const code = raw.trim().toUpperCase();

    if (/[^A-Z0-9_]/.test(code) || code.length < 3 || code.length > 16) {
      return Response.json({ error: "邀请码需 3-16 位大写字母、数字或下划线" }, { status: 400 });
    }

    // 跨用户唯一性：已被他人占用则 409
    const existing = await qOne<{ user_id: string }>(
      "SELECT user_id FROM invites WHERE code = $1",
      [code]
    );
    if (existing && existing.user_id !== appUser.id) {
      return Response.json({ error: "该邀请码已被使用" }, { status: 409 });
    }

    const mine = await qOne<{ id: string }>(
      "SELECT id FROM invites WHERE user_id = $1",
      [appUser.id]
    );
    if (!mine) {
      return Response.json({ error: "邀请记录不存在" }, { status: 404 });
    }

    await q("UPDATE invites SET code = $1 WHERE id = $2", [code, mine.id]);
    return Response.json({ code, message: "邀请码已更新" });
  } catch (e) {
    return toRouteError(e);
  }
}
