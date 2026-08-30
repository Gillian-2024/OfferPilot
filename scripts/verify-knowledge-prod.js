#!/usr/bin/env node
// 生产模式知识库验证：解密 .knowledge.enc 后，函数 / zod schema / 跨文件依赖 / analyze 全链
// 是否原样保留。部署上线前的门禁：node scripts/verify-knowledge-prod.js
// 本机 dev 模式（无 KNOWLEDGE_KEY）不适用此验证，会明确报错退出。
// key 解析与 build-knowledge.js 同规则：env 优先，回退 root .env。
// 注：脚本 import harness/run.js 会链入 utils/config.js（dotenv override:true 读 cwd/.env），
// 故实际解密 key = 部署环境的真实 key（env 或 cwd/.env），与上线进程一致；想测错误 key
// 须从无 .env 的目录跑（如 cd /tmp && KNOWLEDGE_KEY=wrong node .../verify-knowledge-prod.js）。

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const SERVER_ROOT = join(PROJECT_ROOT, 'server');
const ENCRYPTED_FILE = join(SERVER_ROOT, '.knowledge.enc');

// ── 1. Resolve key ─────────────────────────────────────

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

if (!process.env.KNOWLEDGE_KEY) {
  console.error('[verify-prod] FAIL — 无 KNOWLEDGE_KEY。生产模式验证需在部署环境（含 KNOWLEDGE_KEY）运行；本机 dev 模式不验证。');
  process.exit(1);
}
if (!existsSync(ENCRYPTED_FILE)) {
  console.error(`[verify-prod] FAIL — 缺少 ${ENCRYPTED_FILE}，先 node scripts/build-knowledge.js 重建。`);
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.error(`  ❌ ${name}`); }
};

console.log('[verify-prod] 生产模式解密 + 求值验证...');

try {
  const { loadKnowledge } = await import('../server/src/knowledge-loader.js');
  const { schemaShape } = await import('../server/src/utils/schemaShape.js');
  const { buildSchemaSection } = await import('../server/src/harness/run.js');
  const { extractAndParse } = await import('../server/src/utils/jsonExtract.js');

  const k = await loadKnowledge();
  console.log(`  modules: ${Object.keys(k).join(', ')}`);

  // 入口函数完整保留
  ok('jd.buildJDSteps 是函数', typeof k.jd.buildJDSteps === 'function');
  ok('resume.buildResumeSteps 是函数', typeof k.resume.buildResumeSteps === 'function');
  ok('interview.buildInterviewSystem 是函数', typeof k.interview.buildInterviewSystem === 'function');
  ok('growth.buildGrowthSystem 是函数', typeof k.growth.buildGrowthSystem === 'function');

  // 跨文件依赖 + 真实 zod schema
  const steps = k.jd.buildJDSteps('生产模式验证用 JD 文本');
  ok('buildJDSteps 调用返回数组', Array.isArray(steps) && steps.length > 0);
  if (Array.isArray(steps)) {
    const sch = steps[0]().schema;
    const shapeKeys = sch && typeof sch.shape === 'object' && sch.shape ? Object.keys(sch.shape) : [];
    ok('step0.schema 是真实 zod 对象', sch && typeof sch.safeParse === 'function' && shapeKeys.length > 0);

    // analyze 全链：buildSchemaSection + extractAndParse 用真实字段校验
    const sample = {};
    for (const key of shapeKeys) {
      const type = sch.shape[key];
      if (type.constructor.name === 'ZodBoolean') sample[key] = true;
      else if (type.constructor.name === 'ZodNumber') sample[key] = 1;
      else if (type.constructor.name === 'ZodArray') sample[key] = [];
      else sample[key] = `示例${key}`;
    }
    const sec = buildSchemaSection(sch);
    ok('buildSchemaSection 正常拼出指令', sec.includes('必须严格遵守') && sec.includes('"string"'));
    const parsed = extractAndParse(JSON.stringify(sample), sch);
    ok('extractAndParse 用真实字段校验通过', parsed && parsed[shapeKeys[0]] !== undefined);
  }

  // schemaShape 出全骨架（不再是退化 "string"）
  const gs = k.growth.growthSchema;
  if (gs && typeof gs.shape === 'object' && gs.shape) {
    const skeleton = schemaShape(gs);
    ok('growthSchema 骨架含真实字段名', /knowledge_gaps|practice_items|next_strategy/.test(skeleton));
  } else {
    ok('growthSchema 是真实 zod 对象', false);
  }

  console.log(`\n[verify-prod] ${pass}/${pass + fail} 通过`);
  if (fail > 0) {
    console.error('[verify-prod] FAIL — 生产模式验证未通过，禁止上线\n');
    process.exit(1);
  }
  console.log('[verify-prod] 生产模式验证通过 ✓ 可上线\n');
} catch (e) {
  console.error(`\n[verify-prod] FAIL — ${e.message}\n`);
  process.exit(1);
}
