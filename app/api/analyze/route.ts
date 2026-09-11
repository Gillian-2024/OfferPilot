// JD/简历拆解：分步链，SSE 推送 step 进度 + 最终 result。（Next 版）
// 移植自 server/src/routes/analyze.js
// body: { type: 'jd'|'resume', text, jdProfile?: object, jdKeywords?: string[] }
// 鉴权与点数：已由 requireAuthRoute（lib/db/guards.ts）+ credits 中间件落地，无待接入项。
import { NextRequest } from "next/server";
import { generateText } from "ai";
import { getModel, buildSchemaSection, failSSE } from "@/lib/ai/harness";
import { extractAndParse } from "@/lib/ai/jsonExtract";
import { createSSEResponse } from "@/lib/ai/sse";
import { wrapUserContent } from "@/lib/ai/contentBoundary";
import { track, trackUsage } from "@/lib/ai/analytics";
import { buildJDSteps } from "@/lib/kb/jd";
import { buildResumeSteps } from "@/lib/kb/resume";
import { requireCredits } from "@/lib/db/credits";
import { requireAuthRoute, toRouteError } from "@/lib/db/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { type, text, jdKeywords = [], jdProfile = null } = body;
  if (!type || (!text || !text.trim())) {
    return Response.json({ error: "缺少待分析文本 text 或 type" }, { status: 400 });
  }

  // —— 鉴权：会话有效才放行；有订阅免扣，否则前置扣 1 点，额度用尽抛 403 QUOTA_EXCEEDED ——
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

  // 简历拆解对照 JD：优先用完整 jdProfile，降级到 jdKeywords（仅关键词匹配）
  const resumeBaseline = jdProfile || (jdKeywords.length ? { keyword_list: jdKeywords } : null);
  const steps =
    type === "jd" ? buildJDSteps(text) : type === "resume" ? buildResumeSteps(text, resumeBaseline) : null;
  if (!steps) {
    return Response.json({ error: "type 必须是 'jd' | 'resume'" }, { status: 400 });
  }

  return createSSEResponse(async (send, end) => {
    let prev: any = null;
    let combined: Record<string, unknown> = {};
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const startTime = Date.now();

    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i](prev);
        send({ type: "step", index: i + 1, total: steps.length, label: step.label });

        const schemaSection = buildSchemaSection(step.schema);

        const wrapped = wrapUserContent(step.prompt);
        if (!wrapped) {
          send({ type: "error", message: "输入内容为空" });
          end();
          continue;
        }

        const result = await generateText({
          model,
          system: step.system,
          prompt: `${wrapped}\n\n请根据上面的内容完成「${step.label}」步骤的输出。\n\n${schemaSection}`,
          maxOutputTokens: 8192,
        });
        const outText: string =
          typeof result === "object" && result.text !== undefined ? String(result.text) : String(result);
        const usage = typeof result === "object" ? result.usage : undefined;

        if (usage?.inputTokens) totalInputTokens += Number(usage.inputTokens) || 0;
        if (usage?.outputTokens) totalOutputTokens += Number(usage.outputTokens) || 0;

        const object = extractAndParse(outText, step.schema);
        prev = object;
        combined = { ...combined, ...object };
        send({ type: "step_done", index: i + 1, label: step.label });
      }

      const duration = Date.now() - startTime;
      send({ type: "result", data: combined, provider: cfg.provider, model: cfg.model });
      end();

      track(appUser.id, `${type}_extraction_done`, {
        steps: steps.length,
        duration_ms: duration,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        provider: cfg.provider,
        model: cfg.model,
      });
      trackUsage(appUser.id, type, { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }, cfg.provider, cfg.model);
    } catch (e) {
      failSSE(send, end, e as Error, "analyze", type);
    }
  });
}
