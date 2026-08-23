import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// 统一 Provider 工厂：根据 cfg 返回 ai sdk 的 model 实例
export function getProvider(cfg) {
  const { provider, apiKey, baseUrl, model } = cfg;
  if (!apiKey) {
    throw new Error(`Provider [${provider}] 缺少 API Key：请在 .env 配置或在前端设置面板填入`);
  }
  if (!model) {
    throw new Error(`Provider [${provider}] 缺少 model`);
  }

  // Anthropic 协议（Claude）
  if (provider === 'claude') {
    return createAnthropic({ apiKey, baseURL: baseUrl })(model);
  }

  // 其余全部 OpenAI 兼容协议（含官方 OpenAI）
  return createOpenAICompatible({
    name: provider,
    apiKey,
    baseURL: baseUrl,
  })(model);
}
