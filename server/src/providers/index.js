import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// 统一 Provider 工厂：根据 cfg 返回 ai sdk 的 model 实例
// 切换 provider 零成本，所有 provider 共享 streamText/generateObject 接口
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
    case 'claude':
      return createAnthropic({ apiKey, baseURL: baseUrl })(model);
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
