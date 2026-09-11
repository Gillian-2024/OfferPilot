// 点数扣减守卫：挂在 LLM 端点（analyze/chat/growth/rewrite）上，鉴权之后。
// 权益判定：月卡/求职通有效期内 → 免扣放行；免费/单次卡 → credits>0 前置扣 1，否则抛 403 QUOTA_EXCEEDED 触发付费墙。
import { AppUser } from "./user";
import { HttpError } from "./guards";
import { q } from "./pool";

// 扣减一次点数，返回最新 AppUser（credits 已 -1）。原生 UPDATE，绕过 RLS，服务端强一致。
export async function requireCredits(appUser: AppUser): Promise<AppUser> {
  if (appUser.isSubscribed) return appUser;

  if (appUser.credits <= 0) {
    throw new HttpError(403, "免费额度已用完", "QUOTA_EXCEEDED");
  }

  const next = appUser.credits - 1;
  await q("UPDATE users SET credits = $1, updated_at = $2 WHERE id = $3", [next, Date.now(), appUser.id]);

  return { ...appUser, credits: next };
}
