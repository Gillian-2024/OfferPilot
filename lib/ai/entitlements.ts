// 权益工具：capabilities JSON 解析 + 订阅状态判断（供 requireCredits / auth / billing 复用）。
// 移植自 server/src/utils/entitlements.js
export function parseCapabilities(text: string | null | undefined): string[] {
  try {
    const a = JSON.parse(text || '[]');
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

// 是否处于月卡/求职通有效期内（plan_expires_at > now 且命中订阅类 capability）
export function isSubscribed(planExpiresAt: number | null | undefined, capabilities: string[]): boolean {
  if (!planExpiresAt || planExpiresAt <= Date.now()) return false;
  return capabilities.includes('monthly') || capabilities.includes('jobpass');
}
