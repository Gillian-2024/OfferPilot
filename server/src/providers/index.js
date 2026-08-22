import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// 统一 Provider 工厂：根据 cfg 返回 ai sdk 的 model 实例
// 切换 provider 零成本，所有 provider 共享 streamText/generateText 接口
export function getProvider(cfg) {
  const { provider, apiKey, baseUrl, model } = cfg;
  if (!apiKey) {
    throw new Error(`Provider [${provider}] 缺少 API Key：请在 .env 配置或在前端设置面板填入`);
  }
  if (!model) {
    throw new Error(`Provider [${provider}] 缺少 model`);
  }

  switch (provider) {
    case 'openai':
      return createOpenAI({ apiKey, baseURL: baseUrl })(model);
    case 'gateway':
    case 'claude': {
      // 内网 Anthropic 兼容网关（llm-gateway.example.com）的 messages 端点要带 /v1（/anthropic/v1/messages），
      // 但 @ai-sdk/anthropic 拼 {baseURL}/messages 时会归一化掉 baseURL 的 /v1 → 命中 /anthropic/messages → 网关 404。
      // fetch wrapper 在请求层把 /anthropic/messages 补成 /anthropic/v1/messages；仅对内网网关生效，不碰官方/其他端点。
      const isCustomGateway = (baseUrl || '').includes('example.com');
      const fetchWrapper = isCustomGateway
        ? (url, init) => {
            let u = url;
            if (typeof u === 'string' && u.includes('/anthropic/messages') && !u.includes('/anthropic/v1/messages')) {
              u = u.replace('/anthropic/messages', '/anthropic/v1/messages');
            }
            return globalThis.fetch(u, init);
          }
        : undefined;
      return createAnthropic({ apiKey, baseURL: baseUrl, fetch: fetchWrapper })(model);
    }
    case 'domestic':
      // 国内模型走 OpenAI 兼容协议（智谱 GLM / 通义 qwen / DeepSeek 等）
      return createOpenAICompatible({
        name: 'domestic',
        apiKey,
        baseURL: baseUrl,
      })(model);
    default:
      throw new Error(`未知 provider: ${provider}（可选: openai | claude | domestic）`);
  }
}
