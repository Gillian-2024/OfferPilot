import { authHeaders } from './auth';

export interface AdminUser {
  id: string;
  username: string;
  nickname: string | null;
  createdAt: number;
  credits: number;
  capabilities: string[];
  subscribed: boolean;
  planExpiresAt: number | null;
  eventCount: number;
  lastActiveAt: number | null;
}

export interface AdminEvent {
  event: string;
  path: string | null;
  extra: Record<string, any>;
  ts: number;
  screen: string | null;
  deviceId: string;
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await fetch('/api/admin/users', { headers: authHeaders() });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || '获取用户列表失败');
  }
  return (await res.json()).users;
}

export async function fetchAdminUserEvents(id: string): Promise<AdminEvent[]> {
  const res = await fetch(`/api/admin/users/${id}/events`, { headers: authHeaders() });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || '获取用户事件失败');
  }
  return (await res.json()).events;
}
