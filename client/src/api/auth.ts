import type { User } from '../types';
import type { HistoryItem } from '../store/local';

// 认证已迁到 Supabase cookie（httpOnly，浏览器 JS 读不到真实 session）。
// localStorage 的 cjc:token 仅作「当前是否已登录」的同步缓存，供本地历史同步等逻辑判断；
// 真正的鉴权由服务端 cookie 承担，前端不再发送 Authorization: Bearer。
const TOKEN_KEY = 'cjc:token';
const AUTHED = '1';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

// 不再存真实 token；登录/鉴权通过后只置一个“已登录”标记。
export function setToken(_token?: string): void {
  localStorage.setItem(TOKEN_KEY, AUTHED);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// 认证走 cookie；前端不塞 Authorization 头（保留同名函数以兼容旧调用点，返回空头）。
export function authHeaders(): Record<string, string> {
  return {};
}

export async function login(email: string, password: string): Promise<{ user: User }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || '登录失败');
  }
  const data = await res.json();
  setToken();
  return data;
}

export async function register(email: string, password: string, nickname?: string): Promise<{ user: User }> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password, nickname }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || '注册失败');
  }
  const data = await res.json();
  if (!data.requiresEmailConfirm) setToken();
  return data;
}

export async function fetchMe(): Promise<User | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) {
      clearToken();
      return null;
    }
    const data = await res.json();
    setToken();
    return data.user ?? null;
  } catch {
    return null;
  }
}

// 历史记录 API（路径已对齐 /api/*，认证走 cookie）
export async function fetchHistory(type?: string): Promise<HistoryItem[]> {
  const params = type ? `?type=${type}` : '';
  const res = await fetch(`/api/history${params}`, { credentials: 'include' });
  if (!res.ok) throw new Error('获取历史记录失败');
  const data = await res.json();
  return data.items;
}

export async function saveHistoryItem(item: { type: string; title: string; data: any; provider?: string; model?: string; jobId?: string }): Promise<{ id: string }> {
  const res = await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ...item, project_id: item.jobId }),
  });
  if (!res.ok) throw new Error('保存失败');
  return res.json();
}

export async function syncHistoryBatch(items: (HistoryItem & { type: string })[]): Promise<{ count: number }> {
  const res = await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error('同步失败');
  return res.json();
}

export async function deleteHistoryItem(id: string): Promise<void> {
  const res = await fetch(`/api/history/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('删除失败');
}
