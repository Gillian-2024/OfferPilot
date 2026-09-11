// 迁移脚本：把 db/schema.sql 应用到目标 Postgres（DATABASE_URL 指向的库）。
// 用法（真实连接串由 .env.local 的 DATABASE_URL 提供，脚本运行时读取，不经模型上下文）：
//   set -a && . ./.env.local && set +a && node db/apply.mjs
// dotenv 不装也行：调用方用上面的 set -a 让 shell 把 .env.local 灌进 process.env。
import { readFile } from "fs/promises";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = path.join(__dirname, "schema.sql");

function fail(msg) {
  console.error(`\n[apply] ✗ ${msg}`);
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v;
  }
  return undefined;
}

const url = process.env.DATABASE_URL || loadDatabaseUrlFromEnvFile();
if (!url) {
  fail("缺 DATABASE_URL。请把它加到 .env.local：DATABASE_URL=<你的连接串>");
}

const sql = await readFile(SCHEMA, "utf8").catch((e) => fail(`读不到 schema.sql: ${e.message}`));

const client = new pg.Client({ connectionString: url });
console.log("[apply] 连接中...");
try {
  const u = new URL(url);
  console.log(`[apply] 目标连接: host=${u.hostname} port=${u.port||5432} db=${u.pathname.slice(1)} user=${u.username} (密码已隐藏)`);
} catch { /* URL 解析不了时忽略，交给连接报错 */ }
await client.connect().catch((e) => fail(`连接失败: ${e.message}`));

try {
  console.log("[apply] 执行迁移 (db/schema.sql)...");
  await client.query(sql);
  console.log("[apply] 迁移成功：DDL + SKU 种子已执行。");
} catch (e) {
  fail(`迁移失败: ${e.message}`);
}

// 验证：列出 public schema 的表
try {
  const res = await client.query(
    `select table_name from information_schema.tables where table_schema = 'public' order by table_name`
  );
  const tables = res.rows.map((r) => r.table_name);
  console.log("[apply] public 表：", tables.join(", "));

  const expect = ["users", "folders", "projects", "history", "invites", "analytics_events", "skus", "orders"];
  const missing = expect.filter((t) => !tables.includes(t));
  if (missing.length) fail(`缺表：${missing.join(", ")} (可能有建表未完成)`);
  console.log(`[apply] ✅ 8 张核心表齐全。`);

  // SKU 种子自检
  const skus = await client.query(`select code, name, price_cents, active from public.skus order by sort_order`);
  console.log("[apply] SKU 种子：", skus.rows.map((r) => `${r.code}(${r.name},${r.price_cents}分)`).join(" / "));
} catch (e) {
  fail(`验证失败: ${e.message}`);
} finally {
  await client.end().catch(() => {});
}
console.log("[apply] 完成。");
