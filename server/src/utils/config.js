import dotenv from 'dotenv';
// override: true —— 让 .env 文件值压过继承的环境变量。
// 本机跑在 Claude Code 下时，子进程会继承 Claude Code 自身的 ANTHROPIC_* 环境变量
// （Claude Code 本身也走自建网关），若不 override 会导致 .env 里的 model 设置被忽略。
dotenv.config({ override: true });

// .env 默认配置（多 Provider，前端可经 header 覆盖）
const ENV_PROFILES = {
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    model: process.env.ANTHROPIC_MODEL || '',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: 'https://api.openai.com/v1',
    model: '',
  },
  google: {
    apiKey: process.env.GOOGLE_API_KEY,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: '',
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: 'https://api.deepseek.com',
    model: '',
  },
  tongyi: {
    apiKey: process.env.TONGYI_API_KEY,
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: '',
  },
  doubao: {
    apiKey: process.env.DOUBAO_API_KEY,
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: '',
  },
  zhipu: {
    apiKey: process.env.ZHIPU_API_KEY,
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: '',
  },
  moonshot: {
    apiKey: process.env.MOONSHOT_API_KEY,
    baseUrl: 'https://api.moonshot.cn/v1',
    model: '',
  },
  minimax: {
    apiKey: process.env.MINIMAX_API_KEY,
    baseUrl: 'https://api.minimax.chat/v1',
    model: '',
  },
};

// 从请求解析最终模型配置：header 透传 > .env 默认
// BYOK 全有或全无：仅当客户端自带 x-api-key 时才信任 x-base-url 自定义;
// 否则一律走服务端 profile 的 baseUrl——防止攻击者只传 x-base-url,
// 把服务端自己的 API Key 发送到其控制的域名(密钥走私)
export function resolveConfig(req) {
  const provider = req?.header('x-provider') || process.env.DEFAULT_PROVIDER || 'openai';
  const profile = ENV_PROFILES[provider] || {};
  const byokKey = req?.header('x-api-key');
  return {
    provider,
    apiKey: byokKey || profile.apiKey || '',
    baseUrl: byokKey ? req?.header('x-base-url') || profile.baseUrl : profile.baseUrl,
    model: req?.header('x-model') || profile.model,
  };
}
