// POST /api/chat —— 面试对话（复盘 / 准备两种模式），streamText 逐字流式。
// 移植自 server/src/routes/chat.js。消费积分：登录 + 前置扣 1 点，否则 403 QUOTA_EXCEEDED。
// body: { messages, context?, mode?: 'review'|'prep', sessionId? }
// 洞2兜底：流式成功后登录态 force 写一条 history（与客户端 debounce 同 id 收敛）。
import { NextRequest } from "next/server";
import { streamText } from "ai";
import { getModel, failSSE } from "@/lib/ai/harness";
import { createSSEResponse } from "@/lib/ai/sse";
import { wrapUserContent } from "@/lib/ai/contentBoundary";
import { track, trackUsage } from "@/lib/ai/analytics";
import { requireCredits } from "@/lib/db/credits";
import { requireAuthRoute, toRouteError } from "@/lib/db/guards";
import { q } from "@/lib/db/pool";
import { buildInterviewSystem, buildPrepSystem } from "@/lib/kb/interview";
import { nanoid } from "@/lib/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// title 取最后一条 user 消息前 30 字，与客户端 P1-1 persistSession 口径一致
function chatTitle(messages: any[]) {
  const last = [...messages].reverse().find((m) => m.role === "user");
  return last?.content?.slice(0, 30) || `对话 ${new Date().toLocaleDateString("zh-CN")}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { messages = [], context = {}, mode = "review", sessionId } = body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "缺少 messages" }, { status: 400 });
  }

  // 鉴权：登录前置扣 1 点（有订阅免扣）
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

  const system = mode === "prep" ? buildPrepSystem(context) : buildInterviewSystem(context);
  // 洞1：user 消息包 <user-content> 边界，让注入协议在 chat 也生效
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

      // 洞2 兜底：流式成功完成强制落库；同 id OR-REPLACE 收敛，与客户端 debounce 不双写
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
            "interview",
            chatTitle(messages),
            JSON.stringify({ messages: [...messages, { role: "assistant", content: acc }], mode }),
            cfg.provider,
            cfg.model,
            Date.now(),
          ]
        );
      } catch (e) {
        console.error("[chat] history persist failed:", (e as Error).message);
      }

      track(appUser.id, "interview_chat_done", {
        mode,
        message_count: messages.length,
        provider: cfg.provider,
        model: cfg.model,
      });
      const usage = typeof result === "object" ? (result as any).usage : undefined;
      if (usage) trackUsage(appUser.id, `interview_${mode}`, usage, cfg.provider, cfg.model);
    } catch (e) {
      failSSE(send, end, e as Error, "chat", `interview_${mode}`);
    }
  });
}
