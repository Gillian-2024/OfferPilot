#!/usr/bin/env node
// 多格式上传验证：5 种格式各构造/复制最小合法文件，调用 parseFile 提取文本。
// 用法：node scripts/test-multi-format.js
//
// 依赖：pdf-lib（通过 npm install --no-save pdf-lib 安装）

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { parseFile } from '../server/src/parsers/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');
const TESTS_DIR = join(FIXTURES_DIR, 'tests');

// ── Cleanup on exit ──────────────────────────────────────

function cleanup() {
  try { rmSync(FIXTURES_DIR, { recursive: true, force: true }); } catch {}
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('uncaughtException', (e) => { console.error(e); cleanup(); process.exit(1); });

// ── Build fixtures ───────────────────────────────────────

function createPdf() {
  return PDFDocument.create();
}

async function buildTestPdf(text = 'Hello World') {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 50, y: 700, size: 12, font });
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function run() {
  console.log('[multi-format] Starting 5 format tests...\n');
  mkdirSync(TESTS_DIR, { recursive: true });

  // 1. PDF — generate via pdf-lib (text matches label 'test')
  const pdfBuf = await buildTestPdf('test content in a PDF');
  writeFileSync(join(TESTS_DIR, 'test.pdf'), pdfBuf);

  // 2. DOCX — copy from mammoth test data
  const docxSrc = join(__dirname, '../server/node_modules/mammoth/test/test-data/endnotes.docx');
  writeFileSync(join(TESTS_DIR, 'test.docx'), readFileSync(docxSrc));

  // 3-5. HTML / TXT / MD — inline
  writeFileSync(join(TESTS_DIR, 'test.html'), '<html><body><p>Hello <b>world</b></p></body></html>');
  writeFileSync(join(TESTS_DIR, 'test.txt'), 'hello world');
  writeFileSync(join(TESTS_DIR, 'test.md'), '# Heading\n\nBody paragraph here.');

  const tests = [
    { name: 'PDF', ext: 'pdf', mime: 'application/pdf', expectLen: 1, label: 'test' },
    { name: 'Word (.docx)', ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', expectLen: 1, label: 'Ouch' },
    { name: 'HTML', ext: 'html', mime: 'text/html', expectLen: 3, label: 'Hello' },
    { name: 'TXT', ext: 'txt', mime: 'text/plain', expectLen: 11, label: 'hello' },
    { name: 'Markdown (.md)', ext: 'md', mime: 'text/markdown', expectLen: 3, label: '# Heading' },
  ];

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    const buf = readFileSync(join(TESTS_DIR, `test.${t.ext}`));
    try {
      const result = await parseFile(buf, t.mime, `test.${t.ext}`);
      if (result.length >= t.expectLen && result.includes(t.label)) {
        console.log(`  ✅ ${t.name}: "${result.substring(0, 60)}${result.length > 60 ? '...' : ''}"`);
        passed++;
      } else {
        console.log(`  ❌ ${t.name}: len=${result.length} (expected ≥${t.expectLen}), contains="${result.includes(t.label)}"`);
        failed++;
      }
    } catch (e) {
      console.log(`  ❌ ${t.name}: ${e.message}`);
      failed++;
    }
  }

  // Extension fallback: upload HTML with wrong MIME → should still work via extension detection
  console.log('\n  [extension fallback] Testing MIME→extension fallback...');
  try {
    const htmlBuf = readFileSync(join(TESTS_DIR, 'test.html'));
    const result = await parseFile(htmlBuf, 'application/octet-stream', 'test.html');
    if (result.includes('Hello')) {
      console.log('  ✅ HTML via extension fallback');
      passed++;
    } else {
      console.log('  ❌ HTML extension fallback: unexpected result');
      failed++;
    }
  } catch (e) {
    console.log(`  ❌ HTML extension fallback: ${e.message}`);
    failed++;
  }

  console.log(`\n[${passed}/${tests.length + 1}] passed`);
  if (failed > 0) {
    console.log(`[${failed} failed]`);
    cleanup();
    process.exit(1);
  }
  console.log('[multi-format] All OK ✓');
  cleanup();
}

run().catch((e) => {
  console.error('[multi-format] Fatal:', e.message);
  cleanup();
  process.exit(1);
});
