import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(__dirname, '../../data');
// CJC_DB_PATH 测试钩子：测试进程设环境变量走临时 DB 文件，不碰开发库
const DB_PATH = process.env.CJC_DB_PATH
  ? path.resolve(process.env.CJC_DB_PATH)
  : path.join(DB_DIR, 'offer-pilot.db');

let _db;
// 缓存 prepared statement,复用而非每次 prepare——better-sqlite3 瞬时 statement
// 被 GC 回收时析构会触发 RemoveEnvironmentCleanupHook 断言 (Node 24 兼容 bug)
const _stmts = new Map();

export function getDb() {
  if (_db) return _db;

  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      username   TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      nickname   TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS history (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      title      TEXT NOT NULL DEFAULT '',
      data       TEXT NOT NULL DEFAULT '{}',
      provider   TEXT,
      model      TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_history_user_type
      ON history(user_id, type);
    CREATE INDEX IF NOT EXISTS idx_history_user_created
      ON history(user_id, created_at DESC);
  `);

  // Folders, projects, invites — sidebar shell data model
  _db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL DEFAULT '默认',
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      folder_id  TEXT REFERENCES folders(id) ON DELETE SET NULL,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invites (
      id          TEXT PRIMARY KEY,
      code        TEXT UNIQUE NOT NULL,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      click_count INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_user
      ON projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_projects_folder
      ON projects(folder_id);
    CREATE INDEX IF NOT EXISTS idx_invites_user
      ON invites(user_id);
  `);

  // Analytics events — product tracking infrastructure
  _db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id   TEXT NOT NULL DEFAULT '',
      user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
      event       TEXT NOT NULL,
      path        TEXT,
      extra       TEXT NOT NULL DEFAULT '{}',
      ts          INTEGER NOT NULL,
      ua          TEXT,
      screen      TEXT,
      created_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_device_ts
      ON analytics_events(device_id, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_analytics_event_ts
      ON analytics_events(event, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_analytics_extra
      ON analytics_events(extra);
  `);

  // Safe ALTER: ignore if column already exists (idempotent across restarts)
  try { _db.exec(`ALTER TABLE history ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL`); } catch {}

  // 付费框架:用户权益字段(Safe ALTER,幂等)
  // credits=剩余次数(注册送 3);capabilities=权益位 JSON 数组;plan_expires_at=月卡/求职通到期时间戳(NULL=无订阅)
  try { _db.exec(`ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 3`); } catch {}
  try { _db.exec(`ALTER TABLE users ADD COLUMN capabilities TEXT NOT NULL DEFAULT '[]'`); } catch {}
  try { _db.exec(`ALTER TABLE users ADD COLUMN plan_expires_at INTEGER`); } catch {}

  // 付费框架:SKU 定义 + 订单。接支付前先落框架——channel/out_trade_no 预留支付渠道字段
  _db.exec(`
    CREATE TABLE IF NOT EXISTS skus (
      code          TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      price_cents   INTEGER NOT NULL,
      credits       INTEGER NOT NULL DEFAULT 0,
      capabilities  TEXT NOT NULL DEFAULT '[]',
      duration_days INTEGER,
      active        INTEGER NOT NULL DEFAULT 1,
      sort_order    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sku_code     TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending',
      channel      TEXT,
      out_trade_no TEXT,
      created_at   INTEGER NOT NULL,
      paid_at      INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
  `);

  // SKU 种子(INSERT OR IGNORE 幂等;数值按 2026-08 定价定稿)
  // 注:jobpass 的 duration_days 为 NULL——"绑应届届别 6 月截止"非固定天数,购买时按届别动态算 plan_expires_at(后续填)
  _db.exec(`
    INSERT OR IGNORE INTO skus (code, name, price_cents, credits, capabilities, duration_days, active, sort_order) VALUES
      ('single',  '单次卡', 499,  1, '[]',          NULL, 1, 1),
      ('monthly', '月卡',   2900, 0, '["monthly"]', 30,   1, 2),
      ('jobpass', '求职通', 19900, 0, '["jobpass"]', NULL, 1, 3);
  `);

  return _db;
}

// 复用同一 SQL 的 prepared statement,避免每次调用 prepare().run() 产生瞬时
// Statement 对象——瞬时 statement 被 GC 回收时可能触发 better-sqlite3 + Node 24
// 的 RemoveEnvironmentCleanupHook 断言崩溃 (Statement::~Statement)
export function getStatement(sql) {
  const db = getDb();
  let stmt = _stmts.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    _stmts.set(sql, stmt);
  }
  return stmt;
}
