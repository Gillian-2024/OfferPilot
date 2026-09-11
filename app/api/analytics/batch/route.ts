// POST /api/analytics/batch —— 前端埋点 SDK 批量上报（单次最多 20 条）。
// 移植自 server/src/routes/analytics.js。可选鉴权：登录态关联 user_id，否则 device_id 兜底匿名。
// 字段超长截断、非法事件丢弃；轻量级 ip+窗口 限流（Vercel 无状态，尽力而为）。
import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/db/auth";
import { q } from "@/lib/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCH = 20;
const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 30;
const clipStr = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

// 内存限流：{ key: { count, resetAt } }（进程级，多实例/重部署会重置，MVP 够用）
const buckets = new Map<string, { count: number; resetAt: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(ip, b);
  }
  b.count++;
  return b.count > LIMIT;
}

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "0.0.0.0";
  if (limited(ip)) {
    return Response.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const events = body?.events;
  if (!Array.isArray(events) || events.length === 0) {
    return Response.json({ error: "events 必须是非空数组" }, { status: 400 });
  }
  if (events.length > MAX_BATCH) {
    return Response.json({ error: `单次最多 ${MAX_BATCH} 条事件` }, { status: 400 });
  }

  // 可选鉴权：能解析到会话则关联 user_id（原生 jose 会话校验）
  const session = await getSessionUser(req);
  const userId = session?.userId || null;

  const rows: Record<string, unknown>[] = [];
  for (const e of events) {
    if (!e || typeof e !== "object" || typeof e.event !== "string" || !e.event) continue;
    let extraStr = "{}";
    try {
      extraStr = JSON.stringify((e as any).extra || {});
    } catch {
      extraStr = "{}";
    }
    rows.push({
      device_id: clipStr((e as any).device_id, 64),
      user_id: userId,
      event: clipStr(e.event, 64),
      path: clipStr((e as any).path, 256) || null,
      extra: extraStr.slice(0, 2048),
      ts: typeof (e as any).ts === "number" ? (e as any).ts : Date.now(),
      ua: clipStr((e as any).ua, 256),
      screen: clipStr((e as any).screen, 32),
      created_at: Date.now(),
    });
  }

  if (!rows.length) {
    return Response.json({ error: "无有效事件（每条需含非空 event 字符串）" }, { status: 400 });
  }

  const cols = ["device_id", "user_id", "event", "path", "extra", "ts", "ua", "screen", "created_at"] as const;
  const params: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((r, i) => {
    const b = i * cols.length;
    tuples.push(
      `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}::jsonb, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9})`
    );
    params.push(r.device_id, r.user_id, r.event, r.path, r.extra, r.ts, r.ua, r.screen, r.created_at);
  });
  try {
    await q(`INSERT INTO analytics_events (${cols.join(", ")}) VALUES ${tuples.join(", ")}`, params);
  } catch (e) {
    console.error("[analytics] batch insert error:", (e as Error).message);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  return Response.json({ ok: true, received: rows.length });
}
