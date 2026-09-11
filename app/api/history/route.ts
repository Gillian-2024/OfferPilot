// /api/history —— 历史记录（JD/简历/面试 等分析产物）。
// 移植自 server/src/routes/history.js。全部需登录。
//   GET  /api/history?type=jd        列表（data 为 jsonb 对象，直接返回）
//   POST /api/history { type,title,data,... } 或 { items: [...] }  批量归属收敛 upsert
import { NextRequest } from "next/server";
import { requireAuthRoute, toRouteError } from "@/lib/db/guards";
import { q, qOne } from "@/lib/db/pool";
import { nanoid } from "@/lib/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 单条 payload 构造：data 允许 string 或对象，统一落 jsonb
function buildRow(appUserId: string, item: any): Record<string, unknown> {
  const id = typeof item.id === "string" && item.id ? item.id : nanoid();
  return {
    id,
    user_id: appUserId,
    type: item.type || "jd",
    title: item.title || "",
    data: typeof item.data === "string" ? safeParse(item.data) : item.data || {},
    provider: item.provider || null,
    model: item.model || null,
    project_id: item.project_id || item.jobId || null,
    created_at: typeof item.ts === "number" ? item.ts : Date.now(),
  };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { __text: s };
  }
}

export async function GET(req: NextRequest) {
  try {
    const { appUser } = await requireAuthRoute(req);
    const type = req.nextUrl.searchParams.get("type");

    const limit = type ? 50 : 100;
    const rows = await q(
      `SELECT id, type, title, data, provider, model, project_id, created_at
       FROM history WHERE user_id = $1 ${type ? "AND type = $2" : ""}
       ORDER BY created_at DESC LIMIT ${limit}`,
      type ? [appUser.id, type] : [appUser.id]
    );

    return Response.json({
      items: rows.map((r: any) => ({
        id: r.id,
        type: r.type,
        ts: r.created_at,
        title: r.title,
        data: r.data,
        provider: r.provider,
        model: r.model,
        project_id: r.project_id,
      })),
    });
  } catch (e) {
    return toRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { appUser } = await requireAuthRoute(req);
    const body = await req.json().catch(() => null);
    if (!body) return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });

    const { items, ...single } = body;

    if (Array.isArray(items)) {
      // 批量同步（首次登录迁移）：归属条件 upsert——
      //   已存在且属于我 → 更新；属于他人 → 跳过；不存在 → 插入
      let count = 0;
      for (const item of items) {
        const row = buildRow(appUser.id, item);
        const own = await qOne<{ id: string }>(
          "SELECT id FROM history WHERE id = $1 AND user_id = $2",
          [row.id, appUser.id]
        );
        if (own) {
          await q(
            `UPDATE history SET user_id = $1, type = $2, title = $3, data = $4::jsonb,
               provider = $5, model = $6, project_id = $7, created_at = $8
             WHERE id = $9 AND user_id = $1`,
            [
              row.user_id,
              row.type,
              row.title,
              JSON.stringify(row.data),
              row.provider,
              row.model,
              row.project_id,
              row.created_at,
              row.id,
            ]
          );
        } else {
          try {
            await q(
              `INSERT INTO history (id, user_id, type, title, data, provider, model, project_id, created_at)
               VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
              [
                row.id,
                row.user_id,
                row.type,
                row.title,
                JSON.stringify(row.data),
                row.provider,
                row.model,
                row.project_id,
                row.created_at,
              ]
            );
          } catch (e: any) {
            if (e?.code === "23505") continue; // id 已存在且非本人 → 跳过
            throw e;
          }
        }
        count++;
      }
      return Response.json({ count });
    }

    // 单条添加
    const row = buildRow(appUser.id, { ...single });
    await q(
      `INSERT INTO history (id, user_id, type, title, data, provider, model, project_id, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
      [
        row.id,
        row.user_id,
        row.type,
        row.title,
        JSON.stringify(row.data),
        row.provider,
        row.model,
        row.project_id,
        row.created_at,
      ]
    );
    return Response.json({ id: row.id, createdAt: row.created_at });
  } catch (e) {
    return toRouteError(e);
  }
}
