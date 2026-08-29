const MAX_RETRY_ATTEMPTS = 1;

// 内部清理逻辑：从模型文本输出中提取纯净 JSON。
function cleanForJson(text) {
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

  // 3. 容错：去掉尾随逗号（某些模型会在 } 前留尾逗号）
  c = c.replace(/,(\s*[}\]])/g, '$1');
  return c;
}

// 检测模型是否输出了非 JSON 的自然语言响应（如「请先提供 JD 原文」）。
// 判断依据：全文不含 { 或 [ 两个 JSON 起始符号——自然语言不会同时出现这两个符号序列。
function likelyNotJson(text) {
  return !text.includes('{') && !text.includes('[');
}

// 从模型文本输出里抽出 JSON 并用 zod schema 校验。
// 失败时最多重试一次（清理策略变体），应对模型偶尔输出格式不稳。
// 若模型直接返回自然语言（非 JSON），跳过重试并报告清晰错误。
// 超过重试仍失败则抛出带原始输出的错误，由上层降级展示。
export function extractAndParse(text, schema, maxRetries = MAX_RETRY_ATTEMPTS) {
  if (!text || !text.trim()) {
    throw new Error('模型返回空文本，无法解析为 JSON');
  }

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const cleaned = cleanForJson(text);
      const parsed = JSON.parse(cleaned);
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      lastError = result.error;
    } catch (e) {
      lastError = e;
    }
    // 重试间隔：仅第二次尝试时对原始文本做一次更激进的清理
    if (attempt === 0) {
      // 先检查模型是否完全没输出 JSON 结构（如自然语言拒绝回复）
      if (likelyNotJson(text)) {
        break; // 无需重试 — 第二次也只会再收到同一条自然语言
      }
      // 第二次尝试：去掉所有非 JSON 字符（极端降级策略）
      const braceStart = text.indexOf('{');
      const bracketStart = text.indexOf('[');
      const firstBrace = braceStart >= 0 ? (bracketStart >= 0 ? Math.min(braceStart, bracketStart) : braceStart) : bracketStart;
      if (firstBrace >= 0) {
        const closeIdx = Math.max(
          text.lastIndexOf('}', firstBrace + 2000),
          text.lastIndexOf(']', firstBrace + 2000)
        );
        if (closeIdx > firstBrace) text = text.slice(firstBrace, closeIdx + 1);
      }
    }
  }

  // 全部尝试失败，拼接详细错误信息
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  const issues = lastError?.error?.issues
    ? lastError.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    : null;
  throw new Error(
    issues
      ? `Schema 校验失败 (${maxRetries + 1} 次尝试):\n${issues}\n--- 模型原始输出(前 600 字) ---\n${text.slice(0, 600)}`
      : `JSON 解析失败 (${maxRetries + 1} 次尝试):\n${msg}\n--- 模型原始输出(前 600 字) ---\n${text.slice(0, 600)}`
  );
}
