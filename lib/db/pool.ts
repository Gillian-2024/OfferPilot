// 原生 PostgreSQL 连接池单例（替代 Supabase PostgREST 的 service-role admin / anon client）。
// 用 node-postgres（pg）+ 原生参数化 SQL，打通任何 PG 后端：当前为自建 Docker Postgres 16
// （本机 OrbStack / 生产同机容器，见 db/docker-compose.yml）。换 RDS 仅改 DATABASE_URL，代码不动。
import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __offerpilot_pool: Pool | undefined;
}

export function getPool(): Pool {
  if (globalThis.__offerpilot_pool) return globalThis.__offerpilot_pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("缺少 DATABASE_URL（请检查 .env.local / 生产 env）");
  // ssl 默认开启、不校验证书（兼容托管 PG 直连；自建容器与禁用 ssl 的 RDS 用 PGSSL=disable 关掉）
  const ssl = process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false };
  globalThis.__offerpilot_pool = new Pool({ connectionString: url, ssl });
  return globalThis.__offerpilot_pool;
}

// 单条参数化查询，返回 rows 数组；结尾不要加分号。占位符用 $1/$2...
export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

// 单行（maybeSingle 语义）：0/1 行返回对象或 null，>1 行抛错（防脏数据）。
export async function qOne<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  if (rows.length > 1) throw new Error(`[db] 预期 ≤1 行，实得 ${rows.length}`);
  return rows[0] ?? null;
}
