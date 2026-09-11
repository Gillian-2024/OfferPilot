// 只读校验：确认 8 张核心表 + SKU 种子 + users.password_hash 列就位。
// 用原生 pg 直连（DATABASE_URL），不走 Supabase service-role。用法：node db/verify.mjs
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readEnv(name) {
  const envPath = path.join(__dirname, "..", ".env.local");
  const text = readFileSync(envPath, "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(new RegExp(`^${name}=(.*)$`));
    if (!m) continue;
    let v = m[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return undefined;
}

function fail(msg) {
  console.error(`\n[verify] ✗ ${msg}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL || readEnv("DATABASE_URL");
if (!url) fail("缺 DATABASE_URL。请把它加到 .env.local：DATABASE_URL=<你的连接串>");

const client = new pg.Client({ connectionString: url });
await client.connect().catch((e) => fail(`连接失败: ${e.message}`));

const TABLES = ["users", "folders", "projects", "history", "invites", "analytics_events", "skus", "orders"];

console.log("[verify] 用原生 pg 检查 public 表存在性（count 探测）...");
let okAll = true;
for (const t of TABLES) {
  try {
    const { rows } = await client.query(`select count(*)::int as n from public.${t}`);
    console.log(`[verify] ✓ ${t}（${rows[0].n} 行）`);
  } catch (e) {
    console.log(`[verify] ✗ ${t}: ${e.message}`);
    okAll = false;
  }
}

// users.password_hash 列（jose 登录校验用）
try {
  const { rows } = await client.query(
    `select count(*)::int as n from information_schema.columns
     where table_schema = 'public' and table_name = 'users' and column_name = 'password_hash'`
  );
  if (rows[0].n > 0) console.log("[verify] ✓ users.password_hash 列就绪");
  else {
    console.log("[verify] ✗ users.password_hash 列缺失（先跑 db/migrate-auth.mjs）");
    okAll = false;
  }
} catch (e) {
  console.log(`[verify] ✗ password_hash 检查: ${e.message}`);
  okAll = false;
}

// SKU 种子（应 3 行：single / monthly / jobpass）
try {
  const { rows: skus } = await client.query(
    `select code, name, price_cents, active from public.skus order by sort_order`
  );
  console.log(`[verify] SKU 行数: ${skus.length}`);
  for (const s of skus) console.log(`[verify]  · ${s.code} ${s.name} ${s.price_cents}分 active=${s.active}`);
  if (skus.length === 3) console.log("[verify] ✓ SKU 种子齐全");
  else {
    console.log(`[verify] ✗ SKU 种子应为 3 行，实际 ${skus.length}`);
    okAll = false;
  }
} catch (e) {
  console.log(`[verify] ✗ skus 读取: ${e.message}`);
  okAll = false;
}

await client.end().catch(() => {});
console.log(okAll ? "\n[verify] ✅ 全部通过" : "\n[verify] ⚠️ 有缺口");
process.exit(okAll ? 0 : 1);
