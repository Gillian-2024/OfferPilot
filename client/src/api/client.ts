import { Settings, SSEMessage } from '../types';

// 请求头：双轨制——用户设置面板覆盖时随请求透传，否则后端读 .env
function authHeaders(s: Settings): Record<string, string> {
  const h: Record<string, string> = {};
  if (s.provider) h['x-provider'] = s.provider;
  if (s.apiKey) h['x-api-key'] = s.apiKey;
  if (s.baseUrl) h['x-base-url'] = s.baseUrl;
  if (s.model) h['x-model'] = s.model;
  return h;
}

// 上传文件 → 解析文本
export async function uploadFile(file: File, settings: Settings) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', headers: authHeaders(settings), body: fd });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || '上传/解析失败');
  }
  return res.json() as Promise<{ text: string; name: string; size: number; chars: number }>;
}

// 通用 SSE 流消费（fetch streaming，支持 POST + 自定义 header，EventSource 不行）
export async function* streamSSE(url: string, body: any, settings: Settings): AsyncGenerator<SSEMessage> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(settings) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `请求失败 ${res.status}`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') return;
      try {
        yield JSON.parse(data) as SSEMessage;
      } catch {
        // 跳过坏行
      }
    }
  }
}

export type ModelCheckResult = {
  status: 'missing' | 'ok' | 'error';
  error?: string;
  provider?: string;
  model?: string;
};

export const api = {
  uploadFile,
  // 模型配置探测：1-token 最小调用，验证 Key / 网关 / 配额是否可用
  checkModel: async (s: Settings) => {
    const res = await fetch('/api/model/check', { method: 'POST', headers: authHeaders(s) });
    if (!res.ok) throw new Error(`模型检测请求失败 ${res.status}`);
    return res.json() as Promise<ModelCheckResult>;
  },
  analyzeJD: (text: string, s: Settings) => streamSSE('/api/analyze', { type: 'jd', text }, s),
  analyzeResume: (text: string, jdProfile: any | null, s: Settings) =>
    streamSSE('/api/analyze', { type: 'resume', text, jdProfile }, s),
  chat: (messages: any[], context: any, s: Settings, mode?: string) =>
    streamSSE('/api/chat', { messages, context, mode }, s),
  rewrite: (messages: any[], s: Settings) => streamSSE('/api/rewrite', { messages }, s),
  selfEval: (messages: any[], s: Settings) => streamSSE('/api/rewrite', { messages, mode: 'self-eval' }, s),
  createShare: async (payload: { type: string; title: string; content: string }) => {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json() as Promise<{ id: string; url: string }>;
  },
  getShare: async (id: string) => {
    const res = await fetch(`/api/share/${id}`);
    if (!res.ok) throw new Error('分享不存在或已过期');
    return res.json() as Promise<{ id: string; type: string; title: string; content: string; createdAt: number }>;
  },
};
