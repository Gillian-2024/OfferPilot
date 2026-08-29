/**
 * Server-side analytics helpers.
 * All routes use this instead of raw getDb() for analytics — centralizes schema + failure handling.
 */
import { getDb } from '../db/index.js';

/**
 * Log a single server-initiated analytics event.
 * @param {string|undefined} userId - User ID (optional for anonymous)
 * @param {string} event - Event name
 * @param {object} extra - Arbitrary metadata (will be JSON-serialized)
 */
export function track(userId, event, extra = {}) {
  try {
    const db = getDb();
    const now = Date.now();
    db.prepare(`
      INSERT INTO analytics_events (device_id, user_id, event, path, extra, ts, ua, screen, created_at)
      VALUES ('anonymous', ?, ?, NULL, ?, ?, '', '', ?)
    `).run(
      userId || null,
      event,
      JSON.stringify(extra),
      now,
      now,
    );
  } catch (e) {
    console.error('[analytics] track error:', e.message);
  }
}

/**
 * Log AI usage from a generateText / streamText result.
 * Works with both direct { usage } and { usage: { inputTokens, outputTokens } }.
 */
export function trackUsage(userId, capability, usageObj, provider, model) {
  if (!usageObj) return;

  let inputTokens = 0;
  let outputTokens = 0;

  // ai-sdk v7: usage is { inputTokens, outputTokens, totalTokens? }
  if (usageObj.inputTokens !== undefined) {
    inputTokens = Number(usageObj.inputTokens) || 0;
    outputTokens = Number(usageObj.outputTokens) || 0;
  }

  // Also handle legacy shape { totalTokens } without separate fields
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

/**
 * Estimate cost based on known pricing (for self-hosted mode where provider keys are in .env).
 * Returns ¥.
 */
const MODEL_PRICING = {
  'glm-5':        { input: 0.01 / 1_000_000, output: 0.01 / 1_000_000 },
  'qwen-plus':    { input: 0.008 / 1_000_000, output: 0.012 / 1_000_000 },
  'deepseek-v3':  { input: 0.002 / 1_000_000, output: 0.008 / 1_000_000 },
  'claude-sonnet':{ input: 0.003 / 1_000_000, output: 0.015 / 1_000_000 },
  'gpt-4o-mini':  { input: 0.00015 / 1_000_000, output: 0.0006 / 1_000_000 },
};

export function estimateCostYuan(capability, inputTokens, outputTokens) {
  const entry = Object.entries(MODEL_PRICING).find(([key]) => capability.includes(key));
  if (!entry) return 0;
  const [, pricing] = entry;
  return +(pricing.input * inputTokens + pricing.output * outputTokens).toFixed(6);
}
