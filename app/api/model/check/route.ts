// POST /api/model/check —— 模型配置探测：1-token 最小调用验证 API Key / 网关 / 配额 / 模型名是否可用。
// 移植自 server/src/routes/model.js。需登录；不扣积分（探测本身）。
// 返回 { status: 'missing'|'ok'|'error', error?, provider?, model? }
import { NextRequest } from "next/server";
import { generateText } from "ai";
import { requireAuthRoute, toRouteError } from "@/lib/db/guards";
import { getProvider } from "@/lib/ai/providers";
import { resolveConfig } from "@/lib/ai/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 错误压一行、截断，供前端 tooltip 展示
function shortError(e: any): string {
  const raw = (e && e.message) || String(e);
  const first = raw.split("\n")[0].trim();
  return first.length > 160 ? `${first.slice(0, 160)}…` : first;
}

export async function POST(req: NextRequest) {
  try {
    await requireAuthRoute(req);

    const cfg = resolveConfig({ get: (k) => req.headers.get(k) });
    if (!cfg.apiKey) {
      return Response.json({ status: "missing" });
    }

    let model: any;
    try {
      model = getProvider(cfg);
    } catch (e) {
      return Response.json({ status: "error", error: shortError(e) });
    }

    try {
      await Promise.race([
        generateText({ model, maxOutputTokens: 1, messages: [{ role: "user", content: "ping" }] }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("探测超时（15s），网关可能不可达")), 15000)
        ),
      ]);
      return Response.json({ status: "ok", provider: cfg.provider, model: cfg.model });
    } catch (e) {
      console.error("[model/check] error:", (e as Error).message || e);
      return Response.json({ status: "error", error: shortError(e) });
    }
  } catch (e) {
    return toRouteError(e);
  }
}
