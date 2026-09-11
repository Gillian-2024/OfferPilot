// 应用层用户：public.users 是事实源，用原生 pg 读写（替代 Supabase 的 service-role admin .from()）。
// 鉴权身份在 JWT（userId+email），public.users 存权益/昵称/密码哈希。email 无独立列，沿用 username=email 约定（与既有数据一致）。
import { q, qOne } from "./pool";
import { parseCapabilities, isSubscribed } from "@/lib/ai/entitlements";

export type AppUser = {
  id: string;
  email: string;
  username: string;
  nickname: string;
  credits: number;
  capabilities: string[];
  planExpiresAt: number | null;
  isSubscribed: boolean;
  isAdmin: boolean;
};

// 管理员白名单：ADMIN_USERNAMES 逗号分隔的邮箱列表（空 = 无人有权限）。
export function isAdminEmail(email: string): boolean {
  const admins = (process.env.ADMIN_USERNAMES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return !!email && admins.includes(email);
}

// 确保 public.users 有一行（幂等）。首次补默认权益：3 点 + 空能力。
// password 列因原 server 版 not null 占位空串；password_hash 为 jose 登录校验用，被迁移/注册填充。
export async function ensureAppUser(session: { id: string; email?: string }): Promise<void> {
  const email = session.email || session.id;
  const now = Date.now();
  const existing = await qOne<{ id: string }>("SELECT id FROM users WHERE id = $1", [session.id]);
  if (!existing) {
    const nickname = email.split("@")[0] || email;
    await q(
      "INSERT INTO users (id, username, password_hash, nickname, credits, capabilities, created_at, updated_at) VALUES ($1,$2,'',$3,3,'[]'::jsonb,$4,$5)",
      [session.id, email, nickname, now, now]
    );
  } else {
    await q("UPDATE users SET updated_at = $1 WHERE id = $2", [now, session.id]);
  }
}

// 注册用：新建 users 行（含密码哈希）。
export async function createAppUser(input: {
  id: string;
  email: string;
  nickname: string;
  passwordHash: string;
}): Promise<void> {
  const now = Date.now();
  await q(
    "INSERT INTO users (id, username, password_hash, nickname, credits, capabilities, created_at, updated_at) VALUES ($1,$2,$3,$4,3,'[]'::jsonb,$5,$6)",
    [input.id, input.email, input.passwordHash, input.nickname, now, now]
  );
}

// 按邮箱（username 列）取用户用于登录校验：返回 id + password_hash。
export async function findUserByEmail(email: string): Promise<{ id: string; password_hash: string } | null> {
  return qOne<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE username = $1 ORDER BY updated_at DESC LIMIT 1",
    [email]
  );
}

// 取应用用户载荷（含权益）。缺行先补建，再按最新值读取。
export async function getAppUser(session: { id: string; email?: string }): Promise<AppUser> {
  await ensureAppUser(session);
  const email = session.email || session.id;
  const row = await qOne<{
    id: string;
    username: string;
    nickname: string;
    credits: number;
    capabilities: unknown;
    plan_expires_at: number | null;
  }>(
    "SELECT id, username, nickname, credits, capabilities, plan_expires_at FROM users WHERE id = $1",
    [session.id]
  );
  if (!row) throw new Error("[user] 用户记录缺失");

  const caps = Array.isArray(row.capabilities) ? row.capabilities : parseCapabilities(row.capabilities as string);
  const planExpiresAt = row.plan_expires_at ?? null;

  return {
    id: row.id,
    email,
    username: row.username,
    nickname: row.nickname,
    credits: row.credits,
    capabilities: caps,
    planExpiresAt,
    isSubscribed: isSubscribed(planExpiresAt, caps),
    isAdmin: isAdminEmail(email),
  };
}
