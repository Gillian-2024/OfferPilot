// Server-side analytics helpers。移植自 server/src/utils/analytics.js。
// ✅ P3 落地后：persistAnalyticsEvent 写入 Supabase analytics_events（admin 直连，绕过 RLS）。
import type { AnalyticsEnv } from "./types";
import { q } from "@/lib/db/pool";

// extra 在 track 里被 JSON.stringify 成字符串；写入 jsonb 需 parse 成对象。
function parseJson(s: unknown): Record<string, unknown> {
  if (typeof s !== "string") return (s as Record<string, unknown>) ?? {};
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// 集中管理 DB 访问：把事件行写入 analytics_events（非阻塞 fire-and-forget，失败不影响主流程）。
function persistAnalyticsEvent(env: AnalyticsEnv, row: Record<string, unknown>): void {
  const column: Record<string, unknown> = {
    device_id: (row.device_id as string) || "",
    user_id: (row.user_id as string | null) || null,
    event: row.event as string,
    path: (row.path as string) || null,
    extra: parseJson(row.extra),
    ua: (row.ua as string) || null,
    screen: (row.screen as string) || null,
    ts: Number(row.ts ?? Date.now()),
    created_at: Number(row.created_at ?? Date.now()),
  };
  void (async () => {
    try {
      await q(
        `INSERT INTO analytics_events (device_id, user_id, event, path, extra, ua, screen, ts, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
        [column.device_id, column.user_id, column.event, column.path, column.extra, column.ua, column.screen, column.ts, column.created_at]
      );
    } catch (e) {
      console.error("[analytics] persist error:", (e as Error).message);
    }
  })();
  if (env.NODE_ENV !== "production") {
    console.debug("[analytics]", row.event ?? "event", row.extra ?? "");
  }
}

export function track(userId: string | undefined, event: string, extra: Record<string, unknown> = {}): void {
  try {
    persistAnalyticsEvent(process.env, {
      device_id: 'anonymous',
      user_id: userId || null,
      event,
      extra: JSON.stringify(extra),
      ts: Date.now(),
      created_at: Date.now(),
    });
  } catch (e) {
    console.error('[analytics] track error:', (e as Error).message);
  }
}

// 记录一次 AI 调用的 token 用量。兼容 { inputTokens, outputTokens } 与 legacy { totalTokens }。
export function trackUsage(
  userId: string | undefined,
  capability: string,
  usageObj: any,
  provider: string,
  model: string
): void {
  if (!usageObj) return;

  let inputTokens = 0;
  let outputTokens = 0;

  if (usageObj.inputTokens !== undefined) {
    inputTokens = Number(usageObj.inputTokens) || 0;
    outputTokens = Number(usageObj.outputTokens) || 0;
  }

  if (inputTokens === 0 && outputTokens === 0 && usageObj.totalTokens) {
    inputTokens = Math.floor(Number(usageObj.totalTokens) * 0.6);
    outputTokens = Math.floor(Number(usageObj.totalTokens) * 0.4);
  }

  if (inputTokens + outputTokens > 0) {
    track(userId, 'token_usage_report', {
      model,
      provider,
      capability,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    });
  }
}

// 估算成本（自托管模式，provider key 在 .env）。返回 ¥。
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'glm-5':        { input: 0.01 / 1_000_000, output: 0.01 / 1_000_000 },
  'qwen-plus':    { input: 0.008 / 1_000_000, output: 0.012 / 1_000_000 },
  'deepseek-v3':  { input: 0.002 / 1_000_000, output: 0.008 / 1_000_000 },
  'claude-sonnet':{ input: 0.003 / 1_000_000, output: 0.015 / 1_000_000 },
  'gpt-4o-mini':  { input: 0.00015 / 1_000_000, output: 0.0006 / 1_000_000 },
};

export function estimateCostYuan(capability: string, inputTokens: number, outputTokens: number): number {
  const entry = Object.entries(MODEL_PRICING).find(([key]) => capability.includes(key));
  if (!entry) return 0;
  const [, pricing] = entry;
  return +(pricing.input * inputTokens + pricing.output * outputTokens).toFixed(6);
}
