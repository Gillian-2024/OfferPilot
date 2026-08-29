// 用户内容边界工具：将原始文本包裹在 <user-content>...</user-content> 中，
// 配合 system prompt 的铁律 #1 实现 prompt injection 防御。
// 遵循 OWASP LLM Prompt Injection Prevention Structured Prompt 模式：
// SYSTEM_INSTRUCTIONS 与 USER_DATA_TO_PROCESS 之间用结构化标签分隔。

const USER_CONTENT_OPEN = '<user-content>';
const USER_CONTENT_CLOSE = '</user-content>';
export const USER_CONTENT_TAG = `${USER_CONTENT_OPEN}${USER_CONTENT_CLOSE}`;

/**
 * 将任意用户提供的字符串安全地包裹在边界标签中。
 * - 空白输入 → 返回空字符串（调用方自行判断是否发送请求）
 * - 含换行符/Markdown/HTML 等特殊字符 → 直接透传（LLM 靠标签识别边界，不靠转义）
 */
export function wrapUserContent(text) {
  if (!text || !text.trim()) return '';
  return `\n${USER_CONTENT_OPEN}\n${text}\n${USER_CONTENT_CLOSE}`;
}
