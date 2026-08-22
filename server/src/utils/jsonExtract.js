// 从模型文本输出里抽出 JSON 并用 zod schema 校验。
// reasoning 模型被明确要求「只输出 JSON」时通常直接吐干净 JSON，
// 但兜底处理 markdown 代码块围栏 / JSON 前后的多余文字 / 尾随逗号等常见脏数据。
export function extractAndParse(text, schema) {
  if (!text || !text.trim()) {
    throw new Error('模型返回空文本，无法解析为 JSON');
  }

  let cleaned = text.trim();

  // 1. 去掉 markdown 代码块围栏 ```json ... ``` 或 ``` ... ```
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();

  // 2. 截取最外层 { ... } 或 [ ... }（去掉 JSON 前后的解释性文字）
  const start = cleaned.search(/[[{]/);
  if (start > 0) cleaned = cleaned.slice(start);
  const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (lastBrace > -1 && lastBrace < cleaned.length - 1) {
    cleaned = cleaned.slice(0, lastBrace + 1);
  }

  // 3. 容错：去掉尾随逗号（某些模型会在 } 前留尾逗号）
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(
      `JSON 解析失败: ${e.message}\n--- 模型原始输出(前 600 字) ---\n${text.slice(0, 600)}`
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(
      `Schema 校验失败: ${issues}\n--- 模型原始输出(前 600 字) ---\n${text.slice(0, 600)}`
    );
  }
  return result.data;
}
