import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '../types';
import * as authApi from '../api/auth';
import { getHistory } from '../store/local';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isLoggedIn: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, nickname?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const migrateLocalHistory = useCallback(async () => {
    const SYNC_FLAG = 'cjc:synced';
    if (localStorage.getItem(SYNC_FLAG)) return;
    if (!authApi.getToken()) return;

    const allItems: ({ type: string } & any)[] = [];
    for (const type of ['jd', 'resume', 'interview']) {
      const items = getHistory(type);
      allItems.push(...items.map((item) => ({ ...item, type })));
    }

    if (allItems.length === 0) {
      localStorage.setItem(SYNC_FLAG, '1');
      return;
    }

    try {
      await authApi.syncHistoryBatch(allItems);
      localStorage.setItem(SYNC_FLAG, '1');
    } catch {
      // 下次登录时重试
    }
  }, []);

  useEffect(() => {
    authApi.fetchMe().then((u) => {
      setUser(u);
      setLoading(false);
      // Next /login 走整页跳转、不经过 SPA 的 login()，因此挂载时也补齐本地历史同步
      if (u) migrateLocalHistory();
    });
  }, [migrateLocalHistory]);

  const login = useCallback(async (username: string, password: string) => {
    const { user: u } = await authApi.login(username, password);
    setUser(u);
    // 登录后迁移本地历史
    await migrateLocalHistory();
  }, [migrateLocalHistory]);

  const register = useCallback(async (username: string, password: string, nickname?: string) => {
    const { user: u } = await authApi.register(username, password, nickname);
    setUser(u);
    await migrateLocalHistory();
  }, [migrateLocalHistory]);

  const logout = useCallback(() => {
    authApi.clearToken();
    localStorage.removeItem('cjc:synced');
    setUser(null);
    // 同步清服务端 Supabase session cookie（fire-and-forget）
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, []);

  // 主动刷新用户态（如额度扣减后同步最新 credits）
  const refreshUser = useCallback(async () => {
    const u = await authApi.fetchMe();
    if (u) setUser(u);
    return u;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isLoggedIn: !!user, isAdmin: !!user?.isAdmin, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
