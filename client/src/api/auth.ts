import type { User } from '../types';
import type { HistoryItem } from '../store/local';

const TOKEN_KEY = 'cjc:token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function login(username: string, password: string): Promise<{ token: string; user: User }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || '登录失败');
  }
  const data = await res.json();
  setToken(data.token);
  return data;
}

export async function register(username: string, password: string, nickname?: string): Promise<{ token: string; user: User }> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, nickname }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || '注册失败');
  }
  const data = await res.json();
  setToken(data.token);
  return data;
}

export async function fetchMe(): Promise<User | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/auth/me', { headers: authHeaders() });
    if (!res.ok) {
      clearToken();
      return null;
    }
    return res.json();
  } catch {
    return null;
  }
}

// 历史记录 API
export async function fetchHistory(type?: string): Promise<HistoryItem[]> {
  const params = type ? `?type=${type}` : '';
  const res = await fetch(`/api/history${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取历史记录失败');
  const data = await res.json();
  return data.items;
}

export async function saveHistoryItem(item: { type: string; title: string; data: any; provider?: string; model?: string }): Promise<{ id: string }> {
  const res = await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error('保存失败');
  return res.json();
}

export async function syncHistoryBatch(items: (HistoryItem & { type: string })[]): Promise<{ count: number }> {
  const res = await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error('同步失败');
  return res.json();
}

export async function deleteHistoryItem(id: string): Promise<void> {
  const res = await fetch(`/api/history/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('删除失败');
}
