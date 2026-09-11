// POST /api/pay/checkout —— 创建订单 + 发权益（Phase-1 桩支付流）。
// 原版 server 没有真实支付（billing 只列 SKU、orders 表未写入）。本路由补上「下单→模拟支付→兑现」闭环：
//   1) 按 sku_code 建 pending 订单
//   2) 模拟支付成功（Phase-1 免费验证付费意愿阶段；接真实支付时在此替换为支付网关 + 回调）
//   3) applySkuGrant 发点数/权益，订单标记 paid
// 返回订单 + 刷新后的用户权益，供前端即时更新付费墙状态。
import { NextRequest } from "next/server";
import { requireAuthRoute, toRouteError } from "@/lib/db/guards";
import { getAppUser } from "@/lib/db/user";
import { q } from "@/lib/db/pool";
import { findSku, applySkuGrant } from "@/lib/db/entitlement";
import { nanoid } from "@/lib/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { appUser } = await requireAuthRoute(req);
    const body = await req.json().catch(() => ({}));
    const skuCode = typeof body?.sku_code === "string" ? body.sku_code.trim() : "";
    if (!skuCode) return Response.json({ error: "缺少 sku_code" }, { status: 400 });

    const sku = await findSku(skuCode);
    if (!sku) return Response.json({ error: "商品不存在" }, { status: 404 });

    const now = Date.now();
    const orderId = nanoid(12);

    // 1) 建 pending 订单
    await q(
      `INSERT INTO orders (id, user_id, sku_code, amount_cents, status, channel, out_trade_no, created_at, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [orderId, appUser.id, skuCode, sku.price_cents, "pending", null, null, now, null]
    );

    // 2) 模拟支付成功（Phase-1）。真实集成点：在此调用支付网关，并在回调里走同样的
    //    applySkuGrant + 订单置 paid，而非这里直接放行。
    // 3) 发权益 + 订单置 paid
    await applySkuGrant(appUser.id, sku);
    await q("UPDATE orders SET status = $1, paid_at = $2 WHERE id = $3", ["paid", now, orderId]);

    const refreshed = await getAppUser({ id: appUser.id, email: appUser.email });

    return Response.json({
      order: { id: orderId, skuCode, amountCents: sku.price_cents, status: "paid", paidAt: now },
      user: refreshed,
    });
  } catch (e) {
    return toRouteError(e);
  }
}
