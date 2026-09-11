// POST /api/share —— 生成分享。需登录。body: { type, title, content }。
// 移植自 server/src/routes/share.js（原版文件 store，Vercel 无状态改 shares 表持久）。
import { NextRequest } from "next/server";
import { requireAuthRoute, toRouteError } from "@/lib/db/guards";
import { q } from "@/lib/db/pool";
import { nanoid } from "@/lib/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { appUser } = await requireAuthRoute(req);
    const { type, title, content } = await req.json().catch(() => ({}));
    if (!content) return Response.json({ error: "缺少 content" }, { status: 400 });

    const id = nanoid(10);
    const now = Date.now();
    // content 是 jsonb（分析报告对象）；序列化后需显式 ::jsonb
    await q(
      `INSERT INTO shares (id, type, title, content, user_id, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [
        id,
        type || "generic",
        title || "OfferPilot 领航员分析报告",
        typeof content === "string" ? content : JSON.stringify(content),
        appUser.id,
        now,
      ]
    );
    return Response.json({ id, url: `/share/${id}` });
  } catch (e) {
    return toRouteError(e);
  }
}
