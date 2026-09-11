// POST /api/growth —— 复盘结论沉淀 → 成长档案。generateText + schema 校验（复用 analyze 绕 tool_use 模式）。
// 移植自 server/src/routes/growth.js。消费积分：登录前置扣 1 点。
// body: { messages, context? }
import { NextRequest } from "next/server";
import { generateText } from "ai";
import { getModel, buildSchemaSection, failSSE } from "@/lib/ai/harness";
import { extractAndParse } from "@/lib/ai/jsonExtract";
import { createSSEResponse } from "@/lib/ai/sse";
import { wrapUserContent } from "@/lib/ai/contentBoundary";
import { track, trackUsage } from "@/lib/ai/analytics";
import { requireCredits } from "@/lib/db/credits";
import { requireAuthRoute, toRouteError } from "@/lib/db/guards";
import { buildGrowthSystem, growthSchema } from "@/lib/kb/growth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { messages = [], context = {} } = body || {};
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

  const system = buildGrowthSystem(context);
  const dialogueRaw = messages
    .map((m: any) => `${m.role === "user" ? "用户" : "领航员"}：${m.content}`)
    .join("\n\n");
  const wrappedDialogue = wrapUserContent(dialogueRaw);

  if (!wrappedDialogue) {
    return createSSEResponse(async (send, end) => {
      send({ type: "error", message: "对话内容为空" });
      end();
    });
  }

  const schemaSection = buildSchemaSection(growthSchema);
  const prompt = `${wrappedDialogue}\n\n请根据上面的对话内容生成成长档案。\n\n${schemaSection}`;

  return createSSEResponse(async (send, end) => {
    try {
      const result = await generateText({ model, system, prompt, maxOutputTokens: 4096 });
      const text = typeof result === "object" && result.text !== undefined ? result.text : result;
      const object = extractAndParse(text as string, growthSchema);
      send({ type: "result", data: object, provider: cfg.provider, model: cfg.model });
      end();

      track(appUser.id, "growth_consolidated", { conversation_rounds: messages.length });
      const usage = typeof result === "object" ? (result as any).usage : undefined;
      if (usage) trackUsage(appUser.id, "growth", usage, cfg.provider, cfg.model);
    } catch (e) {
      failSSE(send, end, e as Error, "growth");
    }
  });
}
