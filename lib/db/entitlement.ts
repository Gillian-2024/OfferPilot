// 付费权益发放：支付成功后，按 SKU 给用户加点数 / 合并能力 / 设定订阅到期。
// 原生 pg 读写（替代 service-role admin .from()），服务端强一致。
import { parseCapabilities } from "@/lib/ai/entitlements";
import { q, qOne } from "./pool";

export type SkuRow = {
  code: string;
  name: string;
  price_cents: number;
  credits: number;
  capabilities: unknown;
  duration_days: number | null;
};

export async function findSku(code: string): Promise<SkuRow | null> {
  return qOne<SkuRow>(
    "SELECT code, name, price_cents, credits, capabilities, duration_days FROM skus WHERE code = $1",
    [code]
  );
}

// 按 SKU 给 userId 发放权益。capabilities 内含订阅类（monthly/jobpass）且带 duration_days 时续订制（在有效期上顺延），
// jobpass（duration_days=null）视为长期有效。
export async function applySkuGrant(userId: string, sku: SkuRow): Promise<void> {
  const user = await qOne<{ credits: number; capabilities: unknown; plan_expires_at: number | null }>(
    "SELECT credits, capabilities, plan_expires_at FROM users WHERE id = $1",
    [userId]
  );
  if (!user) throw new Error("[entitlement] 用户不存在");

  const existingCaps = Array.isArray(user.capabilities)
    ? user.capabilities
    : parseCapabilities(user.capabilities as string);
  const skuCaps = Array.isArray(sku.capabilities) ? sku.capabilities : parseCapabilities(sku.capabilities as string);

  const newCaps = Array.from(new Set([...existingCaps, ...skuCaps]));

  const credits = Number(user.credits) + Number(sku.credits || 0);

  let planExpires: number | null = user.plan_expires_at ?? null;
  if (skuCaps.length) {
    const base = Math.max(planExpires || 0, Date.now());
    planExpires = sku.duration_days
      ? base + Math.max(1, sku.duration_days) * 86400000
      : Date.now() + 100 * 365 * 86400000; // jobpass 等长期：100 年兜底
  }

  await q("UPDATE users SET credits = $1, capabilities = $2::jsonb, plan_expires_at = $3, updated_at = $4 WHERE id = $5", [
    credits,
    JSON.stringify(newCaps),
    planExpires,
    Date.now(),
    userId,
  ]);
}
