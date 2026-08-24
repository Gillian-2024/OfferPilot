import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'offer-pilot.db');

let _db;

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

  // Safe ALTER: ignore if column already exists (idempotent across restarts)
  try { _db.exec(`ALTER TABLE history ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL`); } catch {}

  return _db;
}
