// GET /api/admin/users —— 管理员：用户列表 + 权益状态 + 事件统计 + 最后活跃。
// 移植自 server/src/routes/admin.js。原生 SQL：单条 LEFT JOIN 聚合（GROUP BY 主键），避免 N+1。
import { NextRequest } from "next/server";
import { requireAdminRoute, toRouteError } from "@/lib/db/guards";
import { q } from "@/lib/db/pool";
import { parseCapabilities, isSubscribed } from "@/lib/ai/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdminRoute(req);

    const rows = await q(
      `SELECT u.id, u.username, u.nickname, u.created_at, u.credits, u.capabilities, u.plan_expires_at,
              COUNT(e.user_id) AS event_count, MAX(e.ts) AS last_ts
       FROM users u LEFT JOIN analytics_events e ON e.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );

    return Response.json({
      users: (rows || []).map((u: any) => {
        const caps = Array.isArray(u.capabilities)
          ? u.capabilities
          : parseCapabilities(u.capabilities as string);
        return {
          id: u.id,
          username: u.username,
          nickname: u.nickname,
          createdAt: u.created_at,
          credits: u.credits,
          capabilities: caps,
          subscribed: isSubscribed(u.plan_expires_at, caps),
          planExpiresAt: u.plan_expires_at || null,
          eventCount: Number(u.event_count) || 0,
          lastActiveAt: u.last_ts || null,
        };
      }),
    });
  } catch (e) {
    return toRouteError(e);
  }
}
