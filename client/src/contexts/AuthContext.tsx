import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '../types';
import * as authApi from '../api/auth';
import { getHistory } from '../store/local';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isLoggedIn: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, nickname?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi.fetchMe().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

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
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isLoggedIn: !!user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
