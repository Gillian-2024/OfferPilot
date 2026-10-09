// 进程内固定窗口限流（单机 next start 部署够用；多实例需换 Redis）。
// 状态挂 globalThis：Next 各路由 bundle / dev 热更新共享同一份计数。
const STORE_KEY = Symbol.for("offerpilot.rateLimit");
type Bucket = { count: number; resetAt: number };
const g = globalThis as unknown as { [STORE_KEY]?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = (g[STORE_KEY] ??= new Map());

// 防伪造 key 撑爆内存：超过上限时清掉已过期的桶
const MAX_BUCKETS = 50_000;
function sweep(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

// 计一次并判断是否超限。返回 retryAfter 秒数（未超限为 0）。
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): number {
  sweep(now);
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  return b.count > limit ? Math.ceil((b.resetAt - now) / 1000) : 0;
}

// 只读：当前是否已超限（不计数）。
export function blocked(key: string, limit: number, now = Date.now()): number {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now || b.count < limit) return 0;
  return Math.ceil((b.resetAt - now) / 1000);
}

export function reset(key: string) {
  buckets.delete(key);
}

// 客户端真实 IP：生产经 Nginx（已按 Cloudflare 段还原真实 IP）写入 X-Real-IP，客户端无法伪造；
// X-Forwarded-For 首段可被客户端伪造，只在没有 X-Real-IP 时取其最后一段兜底。
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",").pop()!.trim() || "unknown";
  return "unknown";
}

// —— 认证接口策略 ——
const WINDOW_MS = 15 * 60 * 1000;
const IP_LIMIT = 30; // 每 IP 15 分钟内登录+注册合计（与 Express 时代 authLimiter 一致）
const ACCOUNT_FAIL_LIMIT = 10; // 同一邮箱 15 分钟内登录失败次数，超过即暂时锁定

export function authIpHit(ip: string, now?: number) {
  return hit(`auth:ip:${ip}`, IP_LIMIT, WINDOW_MS, now);
}
export function accountLocked(email: string, now?: number) {
  return blocked(`auth:fail:${email}`, ACCOUNT_FAIL_LIMIT, now);
}
export function accountFail(email: string, now?: number) {
  hit(`auth:fail:${email}`, ACCOUNT_FAIL_LIMIT, WINDOW_MS, now);
}
export function accountSuccess(email: string) {
  reset(`auth:fail:${email}`);
}

export function tooMany(retryAfter: number, message = "尝试过于频繁，请稍后再试") {
  return Response.json(
    { error: `${message}（约 ${Math.ceil(retryAfter / 60)} 分钟后可重试）` },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}
