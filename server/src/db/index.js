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
