#!/usr/bin/env node
// Harness 硬门禁：安全回归规则集（零依赖，fs.readFileSync + 正则扫源码）。
// 每条规则保护一次已修的安全洞（见 docs/harness/safety.md）；被破坏时 exit 1 阻止提交。
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const rules = [
  {
    id: 'R1',
    file: 'server/src/middleware/auth.js',
    mustNot: /process\.env\.JWT_SECRET\s*\|\|/,
    hint: 'JWT_SECRET 不得有兜底值（明文兜底=公开密钥，任何人可伪造任意用户 token）',
  },
  {
    id: 'R2',
    file: 'server/src/index.js',
    mustNot: /import\s+cors\s+from|require\(\s*['"]cors['"]\s*\)|\.use\(\s*cors\b/,
    hint: 'CORS 必须关闭（第三方站点跨域调本 API 会盗用用户 token）',
  },
  {
    id: 'R3',
    file: 'server/src/routes/history.js',
    mustNot: /INSERT\s+OR\s+REPLACE\s+INTO\s+history/i,
    hint: 'history upsert 必须带归属条件（裸 OR REPLACE 会覆盖他人记录）',
  },
  {
    id: 'R4',
    file: 'server/src/routes/chat.js',
    must: [/wrapUserContent/, /role\s*===\s*['"]user['"]/],
    hint: 'chat/rewrite 必须对 user 消息包 <user-content> 注入边界',
  },
  {
    id: 'R5',
    file: 'server/src/index.js',
    must: [/rateLimit\s*\(/, /authLimiter/, /app\.post\(\s*['"]\/api\/auth\/login['"]\s*,\s*authLimiter\s*\)/],
    hint: '必须含全站限流 + 登录/注册严限并挂载',
  },
];

let failed = 0;
for (const r of rules) {
  let src = '';
  try {
    src = readFileSync(resolve(ROOT, r.file), 'utf8');
  } catch {
    /* 文件缺失 → 视为违反，下面 must 检查会失败 */
  }
  const notViolated = !r.mustNot || !r.mustNot.test(src);
  const mustOk = !r.must || r.must.every((re) => re.test(src));
  if (notViolated && mustOk) {
    console.log(`✓ ${r.id}  ${r.file}  OK`);
  } else {
    failed += 1;
    console.error(`✗ ${r.id}  ${r.file}  违反\n    ${r.hint}`);
  }
}

if (failed > 0) {
  console.error(`\n安全回归硬门禁 FAIL：${failed} 条被破坏。修复后再提交。`);
  process.exit(1);
}
console.log('\n安全回归硬门禁全部通过 ✅');
