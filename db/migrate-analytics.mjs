// 一次性迁移：把旧 SQLite（server/data/offer-pilot.db，Express 时代）的埋点事件搬到 Postgres。
// 背景：2026-09-11 架构迁移后新库只有迁移后产生的事件，旧库 143 条留在 SQLite 里读不到。
//
// 用法（幂等，可重复跑）：
//   node db/migrate-analytics.mjs           # 真正写入
//   node db/migrate-analytics.mjs --dry-run # 只报将写入什么，不落库
//
// 三条规则：
// 1) 只搬真实事件：过滤掉单测造的 device_id（dp_test / 空串），保留真实 dp_* 与服务端 anonymous
// 2) user_id 一律置 NULL：旧库 user_id 指向旧 SQLite 的用户（testuser/verify_* 等测试号），
//    新库 users 表里不存在，硬搬会撞 analytics_events_user_id_fkey；旧事件本就无真实归属
// 3) 幂等靠 (device_id, event, ts) 三元组去重：新库无唯一约束，插入前先查同键是否已在
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQLITE = path.join(__dirname, "..", "server", "data", "offer-pilot.db");
const DRY = process.argv.includes("--dry-run");

// 单测造的埋点 device_id：db/../server 单测里用 dp_test 与空 device_id 灌过 e0..e19 / verify_ok
const TEST_DEVICE_IDS = new Set(["dp_test", ""]);

function fail(msg) {
  console.error(`\n[migrate-analytics] ✗ ${msg}`);
  process.exit(1);
}

// 与 db/apply.mjs 同法：按行读 .env.local，避免特殊字符被 shell 展开
function loadDatabaseUrl() {
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
  fail(".env.local 里没有 DATABASE_URL");
}

function readLegacyEvents() {
  let sdb;
  try {
    sdb = new DatabaseSync(SQLITE, { readOnly: true });
  } catch (e) {
    fail(`打不开旧 SQLite（${SQLITE}）: ${e.message}`);
  }
  const rows = sdb
    .prepare(
      `SELECT device_id, event, path, extra, ts, ua, screen, created_at
       FROM analytics_events ORDER BY ts ASC`
    )
    .all();
  sdb.close();
  return rows;
}

function normalize(r) {
  let extra = "{}";
  if (typeof r.extra === "string" && r.extra.trim()) {
    try {
      JSON.parse(r.extra); // 旧库 extra 是 TEXT，新库是 jsonb —— 坏 JSON 会让整批插入失败
      extra = r.extra;
    } catch {
      extra = "{}";
    }
  }
  return {
    device_id: String(r.device_id ?? ""),
    user_id: null, // 规则 2
    event: String(r.event ?? ""),
    path: r.path ?? null,
    extra,
    ts: Number(r.ts),
    ua: r.ua ?? null,
    screen: r.screen ?? null,
    created_at: Number(r.created_at ?? r.ts),
  };
}

const legacy = readLegacyEvents();
const kept = [];
const skipped = { testDevice: 0, badEvent: 0 };
for (const r of legacy) {
  const dev = String(r.device_id ?? "");
  if (TEST_DEVICE_IDS.has(dev)) {
    skipped.testDevice++;
    continue;
  }
  if (!r.event || typeof r.event !== "string") {
    skipped.badEvent++;
    continue;
  }
  kept.push(normalize(r));
}

console.log(`[migrate-analytics] 旧库共 ${legacy.length} 条`);
console.log(`  → 跳过测试 device_id（${[...TEST_DEVICE_IDS].map((d) => d || "<空>").join(", ")}）: ${skipped.testDevice} 条`);
if (skipped.badEvent) console.log(`  → 跳过非法 event: ${skipped.badEvent} 条`);
console.log(`  → 候选迁移: ${kept.length} 条`);
const byEvent = kept.reduce((m, e) => ((m[e.event] = (m[e.event] || 0) + 1), m), {});
console.log(`  → 事件分布:`, byEvent);

if (DRY) {
  console.log("\n[migrate-analytics] --dry-run：未写入任何数据");
  process.exit(0);
}

const client = new pg.Client({
  connectionString: loadDatabaseUrl(),
  ssl: process.env.PGSSL === "disable" ? false : undefined,
});
await client.connect();

let inserted = 0;
let duplicate = 0;
try {
  await client.query("BEGIN");
  for (const e of kept) {
    // 幂等去重：同 (device_id, event, ts) 视为同一条
    const dup = await client.query(
      `SELECT 1 FROM analytics_events WHERE device_id = $1 AND event = $2 AND ts = $3 LIMIT 1`,
      [e.device_id, e.event, e.ts]
    );
    if (dup.rowCount > 0) {
      duplicate++;
      continue;
    }
    await client.query(
      `INSERT INTO analytics_events (device_id, user_id, event, path, extra, ts, ua, screen, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
      [e.device_id, e.user_id, e.event, e.path, e.extra, e.ts, e.ua, e.screen, e.created_at]
    );
    inserted++;
  }
  await client.query("COMMIT");
} catch (err) {
  await client.query("ROLLBACK");
  fail(`迁移失败已回滚: ${err.message}`);
} finally {
  const total = await client
    .query("SELECT count(*)::int AS c FROM analytics_events")
    .then((r) => r.rows[0].c)
    .catch(() => "?");
  console.log(`\n[migrate-analytics] ✓ 新增 ${inserted} 条，跳过已存在 ${duplicate} 条`);
  console.log(`[migrate-analytics] analytics_events 现有 ${total} 条`);
  await client.end();
}
