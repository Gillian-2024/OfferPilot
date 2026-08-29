#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const SERVER_ROOT = join(PROJECT_ROOT, 'server');
const _require = createRequire(join(SERVER_ROOT, 'package.json'));
const { z } = _require('zod');
const PROMPTS_DIR = join(SERVER_ROOT, 'src/prompts');
const ENCRYPTED_FILE = '.knowledge.enc';
const BUNDLE_FILE = 'bundle.json';

if (!process.env.KNOWLEDGE_KEY && existsSync(join(PROJECT_ROOT, '.env'))) {
  const lines = readFileSync(join(PROJECT_ROOT, '.env'), 'utf8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (/^KNOWLEDGE_KEY=/.test(t) && !t.startsWith('#')) process.env.KNOWLEDGE_KEY = t.slice(13);
  }
}

function listPromptFiles() {
  return readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.js') && !f.includes('knowledge-loader')).sort((a, b) => {
    if (a === 'base.js') return -1; if (b === 'base.js') return 1; return a.localeCompare(b);
  });
}

/**
 * Eval 模块求值器 —— ESM import/export + loader await 转换。
 *
 * 策略：移除导出关键字，跨文件依赖传为 Function param。
 * 对于"导出名且来自 provided"的声明（如 jd.js 的 BASE_SYSTEM），
 * 完全移除其声明行——值已通过 param 传入。
 * 其他导出保留局部声明。
 */
function runEval(source, provided) {
  // Extract export info: { type, name }
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

    // Match: optional whitespace, const/let/var/fn/class NAME = {
    // Must match at start of line
    const re = new RegExp(
      '(^|\\n)(\\s*)(?:(?:const|let|var)\\s+' + name + '\\s*=|' +
      'function\\s+' + name + '\\s*(?=\\([^)]*\\)|\\{)|' +
      'class\\s+' + name + '(?:\\s+extends\\s+\\w*)?(?=\\s*\\{|\\s+implements))',
      'm'
    );

    const match = code.match(re);
    if (!match) continue;

    let start = match.index + match[0].length;
    // Skip leading newline
    if (code[start] === '\n') start++;

    // Check: function/class with body `{...}` or variable with `= VALUE`
    const beforeBrace = code.substring(match.index, Math.min(start + 50, code.length));
    const isFnClass = /\b(function|class)\s+\w+/.test(beforeBrace) || beforeBrace.includes('(') && beforeBrace.includes('{');

    if (isFnClass) {
      // Find matching brace
      let depth = 0, started = false;
      let i = start;
      for (; i < code.length; i++) {
        if (code[i] === '{') { depth++; started = true; }
        else if (code[i] === '}') { depth--; if (started && depth === 0) break; }
      }
      let end = i + 1;
      while (end < code.length && code[end] !== '\n') end++;
      if (end < code.length) end++; // skip newline after block
      code = code.substring(0, match.index) + code.substring(end);
    } else {
      // Variable: find value ending with ;
      // Template literals may contain semicolons — find closing ` first
      const btickCount = (code.substring(match.index).match(/`/g) || []).length;
      if (btickCount > 1 && btickCount % 2 === 1) {
        // Odd backticks: template opens here but closes later
        // Find matching close backtick + semicolon
        let pos = match.index;
        while (pos < code.length) {
          const openBT = code.indexOf('`', pos);
          if (openBT < 0) break;
          const closeBT = code.indexOf('`', openBT + 1);
          if (closeBT < 0) break;
          const semiAfter = code.indexOf(';', closeBT + 1);
          if (semiAfter >= 0) {
            // Found complete statement
            let end = semiAfter + 1;
            while (end < code.length && code[end] !== '\n') end++;
            if (end < code.length) end++; // skip newline
            code = code.substring(0, match.index) + code.substring(end);
            break;
          }
          pos = closeBT + 1;
        }
      } else {
        // Single-expression: find first ;
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

  // Build Function params: only NON-exported deps (export names from provided
  // are used directly — their declarations were removed above)
  const paramNames = [];
  const paramVals = [];
  for (const [k, v] of Object.entries(provided)) {
    paramNames.push(k);
    paramVals.push(v);
  }
  // Inject zod if schemas use z.object etc.
  if (/\bz\.(object|string|number|array|boolean|nullable)\b/.test(code)) {
    paramNames.push('z');
    paramVals.push(z);
  }

  // Build return statement
  const ret = exports.map(e => `'${e.name}': ${e.name}`).join(', ');
  const fullBody = code + '\nreturn { ' + ret + ' };';

  try {
    const fn = new Function(...paramNames, fullBody);
    return fn(...paramVals);
  } catch (err) {
    console.error(`  [eval error]: ${err.message}`);
    throw err;
  }
}

function serialize(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'function') {
    const str = value.toString();
    if (/z\.(object|string|number|array)/.test(str)) return '___ZOD_PLACEHOLDER___';
    return `__FUNC__${str}__FUNC__`;
  }
  if (typeof value === 'object' && value !== null) return `__OBJ__${JSON.stringify(value)}__OBJ__`;
  return value;
}

function buildFromSource(files) {
  const allExports = {};
  const knownVals = {};

  for (const file of files) {
    const filePath = join(PROMPTS_DIR, file);
    const content = readFileSync(filePath, 'utf8');

    const provided = {};
    for (const [name, val] of Object.entries(knownVals)) {
      if (val !== undefined) provided[name] = val;
    }

    const exports = runEval(content, provided);
    console.log(`  [buildFromSource] processed ${file}: keys=${Object.keys(exports).join(',')}`);
    allExports[file] = exports;

    for (const [name, val] of Object.entries(exports)) {
      if (knownVals[name] === undefined) knownVals[name] = val;
    }
  }

  return allExports;
}

function createEncryptedBundle(key) {
  console.log('[build-knowledge] Scanning prompts/...');
  const files = listPromptFiles();
  console.log(`[build-knowledge] Found ${files.length} files: ${files.join(', ')}`);
  console.log('[build-knowledge] Evaluating source files...');

  const rawKnowledge = buildFromSource(files);

  for (const [file, exports] of Object.entries(rawKnowledge)) {
    const keys = Object.keys(exports);
    console.log(`  [build-knowledge] ${file}: ${keys.length} exports -> ${keys.join(', ') || '(none!)'}`);
  }

  console.log('[build-knowledge] Serializing...');
  const serializable = {};
  for (const [file, exports] of Object.entries(rawKnowledge)) {
    serializable[file] = {};
    for (const [name, value] of Object.entries(exports)) {
      serializable[file][name] = serialize(value);
    }
  }

  const bundleJson = JSON.stringify(serializable, null, 2);
  writeFileSync(join(SERVER_ROOT, BUNDLE_FILE), bundleJson, 'utf8');
  console.log(`[build-knowledge] Written intermediate ${BUNDLE_FILE}`);

  console.log('[build-knowledge] Encrypting...');
  const derivedKey = crypto.createHash('sha256').update(key).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  let encrypted = cipher.update(bundleJson, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]);
  writeFileSync(join(SERVER_ROOT, ENCRYPTED_FILE), payload);
  console.log(`[build-knowledge] -> ${ENCRYPTED_FILE} (${payload.length} bytes)`);

  return rawKnowledge;
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
    const result = createEncryptedBundle(key);
    let totalExports = 0;
    for (const exps of Object.values(result)) totalExports += Object.keys(exps).length;
    console.log(`\nDone! ${totalExports} exports across ${Object.keys(result).length} files.`);
  } catch (err) {
    console.error('FAILED:', err.message, err.stack);
    process.exit(1);
  }
}

main();
