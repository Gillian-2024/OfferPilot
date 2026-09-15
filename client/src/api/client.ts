import { Folder, Invite, Project, Settings, SSEMessage, Sku } from '../types';
import { authHeaders as tokenAuthHeaders } from './auth';

// 请求头：双轨制——用户设置面板覆盖时随请求透传，否则后端读 .env
function authHeaders(s: Settings): Record<string, string> {
  const h: Record<string, string> = {};
  if (s.provider) h['x-provider'] = s.provider;
  if (s.apiKey) h['x-api-key'] = s.apiKey;
  if (s.baseUrl) h['x-base-url'] = s.baseUrl;
  if (s.model) h['x-model'] = s.model;
  return h;
}

// 上传文件 → 解析文本（需登录态,随请求带 JWT）
export async function uploadFile(file: File, settings: Settings) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', headers: { ...authHeaders(settings), ...tokenAuthHeaders() }, body: fd });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    if (res.status === 401) window.dispatchEvent(new CustomEvent('auth:required'));
    throw new Error(e.error || '上传/解析失败');
  }
  return res.json() as Promise<{ text: string; name: string; size: number; chars: number }>;
}

// 通用 SSE 流消费（fetch streaming，支持 POST + 自定义 header，EventSource 不行）
// LLM 端点均需登录态,随请求带 JWT
export async function* streamSSE(url: string, body: any, settings: Settings): AsyncGenerator<SSEMessage> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(settings), ...tokenAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    const err = new Error(e.error || `请求失败 ${res.status}`) as Error & { code?: string };
    err.code = e.code;
    // 额度耗尽 → 广播事件，PricingContext 监听后弹付费墙（业务组件无需各自处理 403）
    if (e.code === 'QUOTA_EXCEEDED') window.dispatchEvent(new CustomEvent('paywall:open'));
    // 未登录 → 广播事件，Layout 监听后弹注册/登录框（无落地页，门禁只在动作发生时出现）
    if (res.status === 401) window.dispatchEvent(new CustomEvent('auth:required'));
    throw err;
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
  // 付费商品列表（付费墙弹窗用）
  getSkus: async () => {
    const res = await fetch('/api/billing/skus', { headers: tokenAuthHeaders() });
    if (!res.ok) throw new Error('获取商品列表失败');
    return res.json() as Promise<{ skus: Sku[] }>;
  },
  // 模型配置探测：1-token 最小调用，验证 Key / 网关 / 配额是否可用
  checkModel: async (s: Settings) => {
    const res = await fetch('/api/model/check', { method: 'POST', headers: { ...authHeaders(s), ...tokenAuthHeaders() } });
    if (!res.ok) throw new Error(`模型检测请求失败 ${res.status}`);
    return res.json() as Promise<ModelCheckResult>;
  },
  analyzeJD: (text: string, s: Settings) => streamSSE('/api/analyze', { type: 'jd', text }, s),
  analyzeResume: (text: string, jdProfile: any | null, s: Settings) =>
    streamSSE('/api/analyze', { type: 'resume', text, jdProfile }, s),
  chat: (messages: any[], context: any, s: Settings, mode?: string, sessionId?: string) =>
    streamSSE('/api/chat', { messages, context, mode, sessionId }, s),
  consolidateGrowth: (messages: any[], context: any, s: Settings) =>
    streamSSE('/api/growth', { messages, context }, s),
  rewrite: (messages: any[], s: Settings) => streamSSE('/api/rewrite', { messages }, s),
  selfEval: (messages: any[], s: Settings) => streamSSE('/api/rewrite', { messages, mode: 'self-eval' }, s),
  createShare: async (payload: { type: string; title: string; content: string }) => {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...tokenAuthHeaders() },
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

// === Sidebar APIs ===
// 用户维度资源,走 token 鉴权 header(auth.ts),不走设置面板 header
export const sidebarApi = {
  // Projects
  getProjects: async (folderId?: string) => {
    const params = folderId ? `?folder_id=${encodeURIComponent(folderId)}` : '';
    const res = await fetch(`/api/projects${params}`, { headers: tokenAuthHeaders() });
    if (!res.ok) throw new Error('获取项目列表失败');
    return res.json() as Promise<Project[]>;
  },
  createProject: async (name: string, folderId?: string) => {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...tokenAuthHeaders() },
      body: JSON.stringify({ name, folder_id: folderId || null }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || '创建项目失败');
    }
    return res.json() as Promise<Project>;
  },
  updateProject: async (id: string, patch: { name?: string; folder_id?: string | null }) => {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...tokenAuthHeaders() },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || '更新项目失败');
    }
    return res.json() as Promise<Project>;
  },
  deleteProject: async (id: string) => {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'DELETE',
      headers: tokenAuthHeaders(),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || '删除项目失败');
    }
    return res.json() as Promise<{ deleted: boolean }>;
  },

  // Folders
  getFolders: async () => {
    const res = await fetch('/api/folders', { headers: tokenAuthHeaders() });
    if (!res.ok) throw new Error('获取文件夹列表失败');
    return res.json() as Promise<Folder[]>;
  },
  createFolder: async (name: string) => {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...tokenAuthHeaders() },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || '创建文件夹失败');
    }
    return res.json() as Promise<Folder>;
  },
  updateFolder: async (id: string, patch: { name?: string; sort_order?: number }) => {
    const res = await fetch(`/api/folders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...tokenAuthHeaders() },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || '更新文件夹失败');
    }
    return res.json() as Promise<Folder>;
  },
  deleteFolder: async (id: string) => {
    const res = await fetch(`/api/folders/${id}`, {
      method: 'DELETE',
      headers: tokenAuthHeaders(),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || '删除文件夹失败');
    }
    return res.json() as Promise<{ deleted: boolean }>;
  },

  // Invites
  getMyInvite: async () => {
    const res = await fetch('/api/invites/my', { headers: tokenAuthHeaders() });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || '获取邀请信息失败');
    }
    return res.json() as Promise<Invite>;
  },
  updateInviteCode: async (code: string) => {
    const res = await fetch('/api/invites/my/code', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...tokenAuthHeaders() },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || '更新邀请码失败');
    }
    return res.json() as Promise<{ code: string; message: string }>;
  },
};
