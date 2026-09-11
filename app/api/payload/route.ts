// GET /api/payload —— 前端启动聚合载荷：用户权益 + 可用 SKU + 我的邀请码。
// 减少多次往返，付费墙/权益面板首屏可直接渲染。
import { NextRequest } from "next/server";
import { requireAuthRoute, toRouteError } from "@/lib/db/guards";
import { q, qOne } from "@/lib/db/pool";
import { parseCapabilities } from "@/lib/ai/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { appUser } = await requireAuthRoute(req);

    const skus = await q(
      `SELECT code, name, price_cents, credits, capabilities, duration_days
       FROM skus WHERE active = 1 ORDER BY sort_order ASC`
    );

    const invite = await qOne<any>(
      "SELECT id, code, click_count, created_at FROM invites WHERE user_id = $1",
      [appUser.id]
    );

    return Response.json({
      user: appUser,
      skus: (skus || []).map((r: any) => ({
        code: r.code,
        name: r.name,
        priceCents: r.price_cents,
        credits: r.credits,
        capabilities: Array.isArray(r.capabilities)
          ? r.capabilities
          : parseCapabilities(r.capabilities as string),
        durationDays: r.duration_days,
      })),
      invite: invite || null,
    });
  } catch (e) {
    return toRouteError(e);
  }
}
