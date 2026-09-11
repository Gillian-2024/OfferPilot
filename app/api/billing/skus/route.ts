// GET /api/billing/skus —— 列出可用 SKU（active=1），供前端付费墙展示。公开接口。
// 移植自 server/src/routes/billing.js。不返回成本敏感字段；capabilities 从 jsonb 解析为数组。
import { q } from "@/lib/db/pool";
import { parseCapabilities } from "@/lib/ai/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await q(
      `SELECT code, name, price_cents, credits, capabilities, duration_days
       FROM skus WHERE active = 1 ORDER BY sort_order ASC`
    );

    return Response.json({
      skus: (data || []).map((r: any) => ({
        code: r.code,
        name: r.name,
        priceCents: r.price_cents,
        credits: r.credits,
        capabilities: Array.isArray(r.capabilities)
          ? r.capabilities
          : parseCapabilities(r.capabilities as string),
        durationDays: r.duration_days,
      })),
    });
  } catch (e) {
    console.error("[billing/skus]", (e as Error).message);
    return Response.json({ error: "获取商品列表失败" }, { status: 500 });
  }
}
