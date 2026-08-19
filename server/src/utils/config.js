import dotenv from 'dotenv';
dotenv.config();

// .env 默认配置（双轨制：默认读 env，前端可经 header 覆盖）
const ENV_PROFILES = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022',
  },
  domestic: {
    apiKey: process.env.DOMESTIC_API_KEY,
    baseUrl: process.env.DOMESTIC_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
    model: process.env.DOMESTIC_MODEL || 'glm-4-flash',
  },
};

// 从请求解析最终模型配置：header 透传 > .env 默认
export function resolveConfig(req) {
  const provider = req?.header('x-provider') || process.env.DEFAULT_PROVIDER || 'openai';
  const profile = ENV_PROFILES[provider] || {};
  return {
    provider,
    apiKey: req?.header('x-api-key') || profile.apiKey || '',
    baseUrl: req?.header('x-base-url') || profile.baseUrl,
    model: req?.header('x-model') || profile.model,
  };
}
