import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';

// 轻量分享存储：本地文件，无数据库
// 每个 id 一个 JSON：{ type, title, content, createdAt }
const STORE_DIR = path.resolve('data/share-store');

function ensureDir() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
}

export function saveShare(payload) {
  ensureDir();
  const id = nanoid(10);
  const record = { id, createdAt: Date.now(), ...payload };
  fs.writeFileSync(path.join(STORE_DIR, `${id}.json`), JSON.stringify(record, null, 2));
  return id;
}

export function getShare(id) {
  const p = path.join(STORE_DIR, `${id}.json`);
  if (!/^[A-Za-z0-9_-]+$/.test(id) || !fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}
