// GET /api/admin/users/:id/events —— 管理员：单用户生命周期时间线（全事件倒序，最多 200 条）。
// 移植自 server/src/routes/admin.js。原生 SQL。
import { NextRequest } from "next/server";
import { requireAdminRoute, toRouteError } from "@/lib/db/guards";
import { q } from "@/lib/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRoute(req);
    const { id } = await ctx.params;

    const events = await q(
      `SELECT event, path, extra, ts, screen, device_id
       FROM analytics_events WHERE user_id = $1
       ORDER BY ts DESC LIMIT 200`,
      [id]
    );

    return Response.json({
      events: (events || []).map((e: any) => ({
        event: e.event,
        path: e.path,
        extra: e.extra || {},
        ts: e.ts,
        screen: e.screen,
        deviceId: e.device_id,
      })),
    });
  } catch (e) {
    return toRouteError(e);
  }
}
