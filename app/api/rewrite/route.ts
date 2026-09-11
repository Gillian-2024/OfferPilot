// POST /api/rewrite —— 简历改写 + 自我评价生成，streamText 流式。
// 移植自 server/src/routes/chat.js 的 /rewrite 段。消费积分：登录前置扣 1 点。
// body: { messages: [{role, content}], mode?: 'rewrite'|'self-eval', sessionId? }
import { NextRequest } from "next/server";
import { streamText } from "ai";
import { getModel, failSSE } from "@/lib/ai/harness";
import { createSSEResponse } from "@/lib/ai/sse";
import { wrapUserContent } from "@/lib/ai/contentBoundary";
import { track, trackUsage } from "@/lib/ai/analytics";
import { requireCredits } from "@/lib/db/credits";
import { requireAuthRoute, toRouteError } from "@/lib/db/guards";
import { q } from "@/lib/db/pool";
import { REWRITE_SYSTEM, SELF_EVAL_SYSTEM } from "@/lib/kb/resume";
import { nanoid } from "@/lib/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_MAP: Record<string, string> = { rewrite: REWRITE_SYSTEM, "self-eval": SELF_EVAL_SYSTEM };

function chatTitle(messages: any[]) {
  const last = [...messages].reverse().find((m) => m.role === "user");
  return last?.content?.slice(0, 30) || `对话 ${new Date().toLocaleDateString("zh-CN")}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { messages = [], mode = "rewrite", sessionId } = body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "缺少 messages" }, { status: 400 });
  }

  let appUser;
  try {
    appUser = await requireCredits((await requireAuthRoute(req)).appUser);
  } catch (e) {
    return toRouteError(e);
  }

  let cfg: any;
  let model: any;
  try {
    const headers = {
      "x-provider": req.headers.get("x-provider"),
      "x-api-key": req.headers.get("x-api-key"),
      "x-base-url": req.headers.get("x-base-url"),
      "x-model": req.headers.get("x-model"),
    };
    ({ cfg, model } = getModel(headers));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  const system = SYSTEM_MAP[mode] || REWRITE_SYSTEM;
  const safe = messages.map((m) =>
    m.role === "user" ? { ...m, content: wrapUserContent(m.content) } : m
  );

  return createSSEResponse(async (send, end) => {
    try {
      const result = await streamText({ model, system, messages: safe });
      let acc = "";
      for await (const chunk of result.textStream) {
        acc += chunk;
        send({ type: "token", text: chunk });
      }
      end();

      // 洞2 兜底：rewrite 页面客户端本就无 debounce，登录态服务端独立落一条
      const id = typeof sessionId === "string" && sessionId ? sessionId : nanoid();
      try {
        await q(
          `INSERT INTO history (id, user_id, type, title, data, provider, model, created_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             user_id = EXCLUDED.user_id, type = EXCLUDED.type, title = EXCLUDED.title,
             data = EXCLUDED.data, provider = EXCLUDED.provider, model = EXCLUDED.model,
             created_at = EXCLUDED.created_at`,
          [
            id,
            appUser.id,
            "resume",
            chatTitle(messages),
            JSON.stringify({ messages: [...messages, { role: "assistant", content: acc }], mode }),
            cfg.provider,
            cfg.model,
            Date.now(),
          ]
        );
      } catch (e) {
        console.error("[rewrite] history persist failed:", (e as Error).message);
      }

      track(appUser.id, `chat_${mode}_done`, {
        message_count: messages.length,
        provider: cfg.provider,
        model: cfg.model,
      });
      const usage = typeof result === "object" ? (result as any).usage : undefined;
      if (usage) trackUsage(appUser.id, `chat_${mode}`, usage, cfg.provider, cfg.model);
    } catch (e) {
      failSSE(send, end, e as Error, "rewrite", mode);
    }
  });
}
