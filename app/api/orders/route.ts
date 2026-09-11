// GET /api/orders —— 当前用户订单列表（倒序）。用于前端「我的订单/账单」。
// 移植自原 server 未完全覆盖的订单读面（原版只有 skus 列），按 schema orders 表实现。
import { NextRequest } from "next/server";
import { requireAuthRoute, toRouteError } from "@/lib/db/guards";
import { q } from "@/lib/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { appUser } = await requireAuthRoute(req);
    const rows = await q(
      `SELECT id, sku_code, amount_cents, status, channel, out_trade_no, created_at, paid_at
       FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [appUser.id]
    );

    return Response.json({
      items: rows.map((o: any) => ({
        id: o.id,
        skuCode: o.sku_code,
        amountCents: o.amount_cents,
        status: o.status,
        channel: o.channel,
        outTradeNo: o.out_trade_no,
        createdAt: o.created_at,
        paidAt: o.paid_at,
      })),
    });
  } catch (e) {
    return toRouteError(e);
  }
}
