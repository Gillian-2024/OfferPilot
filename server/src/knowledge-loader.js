// 知识库加载器：生产环境从 .knowledge.enc 解密 bundle，开发模式直读源文件。
//
// 使用方式（各提示词文件）：
//   const k = await loadKnowledge();          // → { base: {...}, jd: {...}, ... }
//   export const BASE_SYSTEM = k.base.BASE_SYSTEM;
//
// 运行时 caller 用法完全不变——依然是静态 import 导出名。

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PROMPTS_DIR = join(ROOT, 'src/prompts');
const SERVER_ROOT = join(ROOT, 'server');
const ENCRYPTED_FILE = '.knowledge.enc';

let cache = null;

// ── zod singleton (for eval mode) ──────────────────────
const _require = createRequire(join(SERVER_ROOT, 'package.json'));
const z = _require('zod');

// ── 加密 / 解密 ───────────────────────────────────────

function decryptBundle(raw, key) {
  const derivedKey = crypto.createHash('sha256').update(key).digest();
  const iv = raw.subarray(0, 16);
  const tag = raw.subarray(16, 32);
  const cipherText = raw.subarray(32);

  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(cipherText, undefined, 'utf8');
  decipher.final();

  return JSON.parse(decrypted);
}

// ── 明文求值（development mode）──────────────────────

/** Eval ESM module source using Function constructor. Returns exported values. */
function evalModule(source, provided) {
  // Extract exports: { type, name } pairs
  const exports = [];
  const mRe = /^\s*export\s+(const|let|var|function|class)\s+(\w+)/gm;
  let m;
  while ((m = mRe.exec(source)) != null) exports.push({ type: m[1], name: m[2] });
  if (!exports.length) return {};
  const expSet = new Set(exports.map(e => e.name));

  // Strip import / export keywords
  let code = source
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"];?\s*/gm, '')
    .replace(/^\s*export\s+/gm, '');

  // Remove `const k = await loadKnowledge()`
  code = code.replace(/^\s*const\s+k\s*=\s*await\s+loadKnowledge\(\);\s*\n?/gm, '');

  // Replace k.X.Y → Y ; k.X → X
  code = code.replace(/\bk\.(\w+)\.(\w+)\b/g, '$2');
  code = code.replace(/\bk\.(\w+)\b/g, '$1');

  // Remove declarations of cross-file deps (value available as param)
  for (const { name } of exports) {
    if (!(name in provided)) continue;

    const re = new RegExp(
      '(^|\\n)(\\s*)(?:(?:const|let|var)\\s+' + name + '\\s*=|' +
      'function\\s+' + name + '\\s*(?=\\([^)]*\\)|\\{)|' +
      'class\\s+' + name + '(?:\\s+extends\\s+\\w*)?(?=\\s*\\{|\\s+implements))',
      'm'
    );

    const match = code.match(re);
    if (!match) continue;

    let start = match.index + match[0].length;
    if (code[start] === '\n') start++;

    const beforeBrace = code.substring(match.index, Math.min(start + 50, code.length));
    const isFnClass = /\b(function|class)\s+\w+/.test(beforeBrace) ||
                      (beforeBrace.includes('(') && beforeBrace.includes('{'));

    if (isFnClass) {
      let depth = 0, started = false;
      let i = start;
      for (; i < code.length; i++) {
        if (code[i] === '{') { depth++; started = true; }
        else if (code[i] === '}') { depth--; if (started && depth === 0) break; }
      }
      let end = i + 1;
      while (end < code.length && code[end] !== '\n') end++;
      if (end < code.length) end++;
      code = code.substring(0, match.index) + code.substring(end);
    } else {
      const btickCount = (code.substring(match.index).match(/`/g) || []).length;
      if (btickCount > 1 && btickCount % 2 === 1) {
        let pos = match.index;
        while (pos < code.length) {
          const openBT = code.indexOf('`', pos);
          if (openBT < 0) break;
          const closeBT = code.indexOf('`', openBT + 1);
          if (closeBT < 0) break;
          const semiAfter = code.indexOf(';', closeBT + 1);
          if (semiAfter >= 0) {
            let end = semiAfter + 1;
            while (end < code.length && code[end] !== '\n') end++;
            if (end < code.length) end++;
            code = code.substring(0, match.index) + code.substring(end);
            break;
          }
          pos = closeBT + 1;
        }
      } else {
        const rest = code.substring(match.index);
        const semi = rest.indexOf(';');
        if (semi >= 0) {
          let end = semi + 1;
          while (end < code.length && code[end] !== '\n') end++;
          if (end < code.length) end++;
          code = code.substring(0, match.index) + code.substring(end);
        }
      }
    }
  }

  // Build Function params: only NON-exported deps
  const paramNames = [];
  const paramVals = [];
  for (const [k, v] of Object.entries(provided)) {
    paramNames.push(k);
    paramVals.push(v);
  }
  if (/\bz\.(object|string|number|array|boolean|nullable)\b/.test(code)) {
    paramNames.push('z');
    paramVals.push(z);
  }

  const ret = exports.map(e => `'${e.name}': ${e.name}`).join(', ');
  const fullBody = code + '\nreturn { ' + ret + ' };';

  try {
    const fn = new Function(...paramNames, fullBody);
    return fn(...paramVals);
  } catch (err) {
    console.error(`  [eval error in ${source.substring(0, 40)}...]: ${err.message}`);
    throw err;
  }
}

async function loadFromSource() {
  const order = ['base.js', 'jd.js', 'resume.js', 'interview.js', 'growth.js'];

  // Flat namespace of known exported names/values — same as build-knowledge.js knownVals
  const knownVals = {};
  // Module grouping for final output structure
  const modules = {};

  for (const file of order) {
    const filePath = join(PROMPTS_DIR, file);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf8');

    // Build provided{} from knownVals for this file
    const prov = {};
    for (const [k, v] of Object.entries(knownVals)) {
      if (v !== undefined && !(k in prov)) prov[k] = v;
    }

    const modExports = evalModule(content, prov);
    const moduleName = file.replace(/\.js$/, '');
    modules[moduleName] = modExports;

    // Flatten individual exports into knownVals for inter-file deps
    // Do NOT overwrite existing (later files might override earlier ones intentionally)
    for (const [name, val] of Object.entries(modExports)) {
      if (!(name in knownVals)) knownVals[name] = val;
    }
  }

  return modules;
}

// ── Public API ──────────────────────────────────────────

/**
 * 加载知识库（单例）。
 * - KNOWLEDGE_KEY 存在 → AES-256-GCM 解密 .knowledge.enc
 * - 否则 → 开发模式，逐文件求值 prompts/*.js
 */
export async function loadKnowledge() {
  if (cache) return cache;

  const key = process.env.KNOWLEDGE_KEY;
  if (!key) {
    console.log('[knowledge-loader] Development mode — loading from source files');
    cache = await loadFromSource();
    return cache;
  }

  console.log('[knowledge-loader] Production mode — decrypting bundle');
  const path = join(ROOT, ENCRYPTED_FILE);
  if (!existsSync(path)) {
    throw new Error(
      `[knowledge-loader] Encrypted bundle missing at ${path}. ` +
      'Deploy .knowledge.enc and set KNOWLEDGE_KEY env var.'
    );
  }

  const raw = decryptBundle(readFileSync(path), key);
  // Normalize: strip .js from bundle keys so caller uses k.base.BASE_SYSTEM
  const normalized = {};
  for (const [fileKey, modExports] of Object.entries(raw)) {
    const name = fileKey.replace(/\.js$/, '');
    normalized[name] = modExports;
  }
  cache = normalized;
  console.log(`[knowledge-loader] Loaded ${Object.keys(cache).length} modules.`);
  return cache;
}
