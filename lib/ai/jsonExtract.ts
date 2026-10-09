// 从模型文本输出抽取 JSON 并用 zod schema 校验。移植自 server/src/utils/jsonExtract.js
const MAX_RETRY_ATTEMPTS = 1;

function cleanForJson(text: string): string {
  let c = text.trim();

  // 1. 去掉 markdown 代码块围栏 ```json ... ``` 或 ``` ... ```
  const fence = c.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) c = fence[1].trim();

  // 2. 截取最外层 { ... } 或 [ ... ]（去掉 JSON 前后的解释性文字）
  const start = c.search(/[[{]/);
  if (start > 0) c = c.slice(start);
  const lastBrace = Math.max(c.lastIndexOf('}'), c.lastIndexOf(']'));
  if (lastBrace > -1 && lastBrace < c.length - 1) {
    c = c.slice(0, lastBrace + 1);
  }

  // 3. 容错：去掉尾随逗号
  c = c.replace(/,(\s*[}\]])/g, '$1');
  return c;
}

function likelyNotJson(text: string): boolean {
  return !text.includes('{') && !text.includes('[');
}

// 修复字符串值里未转义的英文双引号（线上头号报错：模型写「字面的"Java开发"实际是…」）。
// 在字符串内遇到 " 时向后看：后面是 : } ] 或「, 再接 " } ]」才视为真结束引号，否则转义成 \"。
function escapeStrayQuotes(text: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inStr) {
      if (ch === '"') inStr = true;
      out += ch;
      continue;
    }
    if (ch === '\\') {
      out += ch + (text[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch !== '"') {
      out += ch;
      continue;
    }
    let j = i + 1;
    while (j < text.length && /\s/.test(text[j])) j++;
    const next = text[j];
    let closes = next === undefined || next === ':' || next === '}' || next === ']';
    if (next === ',') {
      let k = j + 1;
      while (k < text.length && /\s/.test(text[k])) k++;
      closes = text[k] === undefined || '"}]{[-0123456789tfn'.includes(text[k]);
    }
    if (closes) {
      inStr = false;
      out += ch;
    } else {
      out += '\\"';
    }
  }
  return out;
}

// 从模型文本输出里抽出 JSON 并用 zod schema 校验。
// 第一次按原文解析；失败则修复未转义引号后再解析一次。
export function extractAndParse(text: string, schema: any, maxRetries = MAX_RETRY_ATTEMPTS): any {
  if (!text || !text.trim()) {
    throw new Error('模型返回空文本，无法解析为 JSON');
  }

  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let cleaned = cleanForJson(text);
      if (attempt > 0) cleaned = escapeStrayQuotes(cleaned);
      const parsed = JSON.parse(cleaned);
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      lastError = result.error;
      break; // 结构已能解析、只是字段不符 —— 修引号无助于 schema 校验
    } catch (e) {
      lastError = e;
    }
    if (attempt === 0 && likelyNotJson(text)) {
      break; // 无需重试 — 自然语言修引号也解析不了
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  const issues = lastError?.error?.issues
    ? lastError.error.issues.map((i: any) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    : null;
  throw new Error(
    issues
      ? `Schema 校验失败 (${maxRetries + 1} 次尝试):\n${issues}\n--- 模型原始输出(前 600 字) ---\n${text.slice(0, 600)}`
      : `JSON 解析失败 (${maxRetries + 1} 次尝试):\n${msg}\n--- 模型原始输出(前 600 字) ---\n${text.slice(0, 600)}`
  );
}
