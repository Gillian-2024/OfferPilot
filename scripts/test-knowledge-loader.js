#!/usr/bin/env node
// 知识库架构隔离验证：1) routes 无直接 prompts 导入 2) knowledge-loader 产出完整导出。
// 用法：node scripts/test-knowledge-loader.js

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const ROUTES_DIR = join(PROJECT_ROOT, 'server/src/routes');

console.log('[knowledge-test] Checking routes for direct prompts imports...');

const DIRECT_IMPORT_RE = /from\s+['"]\.\.?\/prompts\//;
const routes = readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'));
let hasViolation = false;

for (const r of routes) {
  const content = readFileSync(join(ROUTES_DIR, r), 'utf8');
  if (DIRECT_IMPORT_RE.test(content)) {
    console.error(`  ❌ ${r} 直接 import 了 prompts/`);
    hasViolation = true;
  }
}

if (hasViolation) {
  console.log('\n[knowledge-test] FAIL — routes must load via knowledge-loader only\n');
  process.exit(1);
}

console.log('  ✅ 所有路由均通过 knowledge-loader 加载提示词\n');

// ── 2. Validate knowledge-loader exports ────────────────

console.log('[knowledge-test] Loading knowledge to verify module exports...');

try {
  // Dynamic import in ESM top-level context
  const { loadKnowledge } = await import('../server/src/knowledge-loader.js');
  const modules = await loadKnowledge();

  const CHECKS = [
    ['base.BASE_SYSTEM', () => modules.base?.BASE_SYSTEM?.length > 0],
    ['jd.buildJDSteps', () => typeof modules.jd?.buildJDSteps === 'function'],
    ['resume.buildResumeSteps', () => typeof modules.resume?.buildResumeSteps === 'function'],
    ['resume.REWRITE_SYSTEM', () => modules.resume?.REWRITE_SYSTEM?.length > 0],
    ['growth.buildGrowthSystem', () => typeof modules.growth?.buildGrowthSystem === 'function'],
    ['growth.growthSchema', () => !!modules.growth?.growthSchema],
    ['interview.buildInterviewSystem', () => typeof modules.interview?.buildInterviewSystem === 'function'],
    ['interview.buildPrepSystem', () => typeof modules.interview?.buildPrepSystem === 'function'],
  ];

  let passed = 0;
  for (const [name, check] of CHECKS) {
    if (check()) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.error(`  ❌ ${name} missing or invalid`);
    }
  }

  console.log(`\n[${passed}/${CHECKS.length}] exports verified`);
  if (passed < CHECKS.length) {
    console.log('\n[knowledge-test] FAIL — some exports missing\n');
    process.exit(1);
  }
  console.log('[knowledge-test] All OK ✓');
} catch (e) {
  console.error(`\n[knowledge-test] FAIL — knowledge loader error: ${e.message}\n`);
  process.exit(1);
}
