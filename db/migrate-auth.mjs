// 认证迁移：把登录凭证从 Supabase Auth 迁到 public.users.password_hash（jose+bcryptjs 用）。
// 幂等可重跑。两步：
//   1) 给 public.users 补 password_hash 列（若缺）
//   2) 若库里有 auth.users（Supabase 托管 PG），把其 encrypted_password(bcrypt) 镜像到 public.users.password_hash
//      若没有 auth.users（国内 RDS 新库），跳过镜像 —— 新用户注册即写入 password_hash，无需迁移。
// 用法（真实连接串由 .env.local 的 DATABASE_URL 提供，脚本运行时读取，不经模型上下文）：
//   set -a && . ./.env.local && set +a && node db/migrate-auth.mjs
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fail(msg) {
  console.error(`\n[auth-migrate] ✗ ${msg}`);
  process.exit(1);
}

// 从 .env.local 文件按行读取 DATABASE_URL 真值，跳过 shell source（避免特殊字符被 zsh 展开/截断）
function loadDatabaseUrlFromEnvFile() {
  const envPath = path.join(__dirname, "..", ".env.local");
  let text;
  try {
    text = readFileSync(envPath, "utf8");
  } catch (e) {
    fail(`读不到 .env.local: ${e.message}`);
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^DATABASE_URL=(.*)$/);
    if (!m) continue;
    let v = m[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return undefined;
}

const url = process.env.DATABASE_URL || loadDatabaseUrlFromEnvFile();
if (!url) fail("缺 DATABASE_URL。请把它加到 .env.local：DATABASE_URL=<你的连接串>");

const client = new pg.Client({ connectionString: url });
await client.connect().catch((e) => fail(`连接失败: ${e.message}`));

const q = async (text, params = []) => (await client.query(text, params));

try {
  // 1) password_hash 列（幂等）
  await q(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text not null default ''`);
  console.log("[auth-migrate] ✅ public.users.password_hash 列就绪");

  // 2) 是否存在 auth.users（仅 Supabase 托管 PG 有）
  const hasAuthUsers = (await q(`
    select count(*)::int as n from information_schema.tables
    where table_schema = 'auth' and table_name = 'users'
  `)).rows[0].n > 0;

  if (hasAuthUsers) {
    // 镜像 bcrypt 哈希：auth.users.encrypted_password → public.users.password_hash（只填空的，不覆盖已有）
    const mirror = await q(`
      update public.users u
      set password_hash = a.encrypted_password
      from auth.users a
      where a.id::text = u.id
        and (u.password_hash = '' or u.password_hash is null)
    `);
    console.log(`[auth-migrate] ✅ 镜像 bcrypt 哈希：${mirror.rowCount} 位用户从 auth.users 拷入 password_hash`);

    // 报告仍无密码哈希的用户（这些暂时只能用邀请/无密码流程，或需重置）
    const noHash = await q(`
      select count(*)::int as n from public.users
      where password_hash = '' or password_hash is null
    `);
    if (noHash.rows[0].n > 0) {
      console.log(`[auth-migrate] ⚠️ 还有 ${noHash.rows[0].n} 位用户无 password_hash（无凭证登录，需先给其设置密码或注册新密码）`);
    }
  } else {
    console.log("[auth-migrate] 未发现 auth schema（国内 RDS 新库），跳过 bcrypt 镜像。新用户注册时将直接写入 password_hash。");
  }

  // 3) 汇总：当前 users 总数 / 有密码哈希数
  const stat = await q(`
    select count(*)::int as total,
           count(*) filter (where password_hash <> '' and password_hash is not null)::int as has_hash
    from public.users
  `);
  console.log(`[auth-migrate] 用户统计：${stat.rows[0].total} 位，其中 ${stat.rows[0].has_hash} 位已可密码登录（jose）`);
} catch (e) {
  fail(`迁移失败: ${e.message}`);
} finally {
  await client.end().catch(() => {});
}
console.log("[auth-migrate] 完成。");
