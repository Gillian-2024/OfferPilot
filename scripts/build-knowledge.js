#!/usr/bin/env node
// 生产知识库 bundle 构建：把 prompts/*.js 源码加密成 .knowledge.enc。
// 不 eval、不序列化 —— 生产分支复用 dev 的 evalModule 求值路径，
// 函数 / zod schema / 跨文件依赖在解密后原样保留。
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const SERVER_ROOT = join(PROJECT_ROOT, 'server');
const PROMPTS_DIR = join(SERVER_ROOT, 'src/prompts');
const ENCRYPTED_FILE = '.knowledge.enc';

if (!process.env.KNOWLEDGE_KEY && existsSync(join(PROJECT_ROOT, '.env'))) {
  const lines = readFileSync(join(PROJECT_ROOT, '.env'), 'utf8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    // 取「=」后的精确值，勿用 slice(13)（"KNOWLEDGE_KEY=" 是 14 字符，会多带一个 =）
    if (/^KNOWLEDGE_KEY=/.test(t) && !t.startsWith('#')) {
      process.env.KNOWLEDGE_KEY = t.slice(t.indexOf('=') + 1);
    }
  }
}

function listPromptFiles() {
  return readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.js') && !f.includes('knowledge-loader')).sort((a, b) => {
    if (a === 'base.js') return -1; if (b === 'base.js') return 1; return a.localeCompare(b);
  });
}

function createEncryptedBundle(key) {
  console.log('[build-knowledge] Scanning prompts/...');
  const files = listPromptFiles();
  console.log(`[build-knowledge] Found ${files.length} files: ${files.join(', ')}`);

  // bundle 结构：{ basename: source }，basename 不带 .js，与 loader 的 order 对齐。
  const bundle = {};
  for (const file of files) {
    bundle[file.replace(/\.js$/, '')] = readFileSync(join(PROMPTS_DIR, file), 'utf8');
  }

  const bundleJson = JSON.stringify(bundle, null, 2);

  console.log('[build-knowledge] Encrypting...');
  const derivedKey = crypto.createHash('sha256').update(key).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  let encrypted = cipher.update(bundleJson, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]);
  writeFileSync(join(SERVER_ROOT, ENCRYPTED_FILE), payload);
  console.log(`[build-knowledge] -> ${ENCRYPTED_FILE} (${payload.length} bytes, ${Object.keys(bundle).length} modules)`);

  return Object.keys(bundle);
}

function main() {
  let key = process.env.KNOWLEDGE_KEY || '';

  if (!key) {
    console.log('[build-knowledge] No KNOWLEDGE_KEY — generating.');
    key = crypto.randomBytes(32).toString('hex');
    process.env.KNOWLEDGE_KEY = key;
    writeFileSync(join(PROJECT_ROOT, '.env.example'), '# OfferPilot knowledge encryption key\nKNOWLEDGE_KEY=<your-key>\n', 'utf8');
    console.log(`YOUR KEY:\n${key}\n`);
  }

  try {
    const modules = createEncryptedBundle(key);
    console.log(`\nDone! ${modules.length} modules encrypted.`);
  } catch (err) {
    console.error('FAILED:', err.message, err.stack);
    process.exit(1);
  }
}

main();
