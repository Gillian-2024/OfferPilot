// GET /api/invites/my —— 当前用户邀请码信息；缺失则自动生成一条。
// 移植自 server/src/routes/invites.js。原生 SQL（唯一约束冲突 code=23505 时换码重试）。
import { NextRequest } from "next/server";
import { requireAuthRoute, toRouteError } from "@/lib/db/guards";
import { q, qOne } from "@/lib/db/pool";
import { nanoid, nanoidUppercase } from "@/lib/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { appUser } = await requireAuthRoute(req);

    let invite = await qOne<any>(
      "SELECT id, code, click_count, created_at FROM invites WHERE user_id = $1",
      [appUser.id]
    );

    if (!invite) {
      // 缺失时自动生成（正常应登录即建，但兼容旧数据）。code 有唯一约束，冲突时换码重试（最多 3 次）。
      const now = Date.now();
      for (let attempt = 0; attempt < 3; attempt++) {
        const id = nanoid(12);
        const code = nanoidUppercase(12);
        try {
          const [row] = await q(
            "INSERT INTO invites (id, code, user_id, click_count, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            [id, code, appUser.id, 0, now]
          );
          if (row) {
            invite = { id, code, click_count: 0, created_at: now };
            break;
          }
        } catch (e: any) {
          if (e?.code !== "23505") throw e; // 非唯一冲突直接报错
        }
      }
      if (!invite) throw new Error("邀请码生成多次冲突，请重试");
    }

    return Response.json(invite);
  } catch (e) {
    return toRouteError(e);
  }
}
