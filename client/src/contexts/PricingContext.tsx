import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface PricingContextValue {
  credits: number;
  capabilities: string[];
  isSubscribed: boolean;
  paywallOpen: boolean;
  openPaywall: () => void;
  closePaywall: () => void;
}

const PricingContext = createContext<PricingContextValue>(null!);

// 订阅是否有效：planExpiresAt 未过期且含 monthly / jobpass 权益位
function isSubscribedAt(planExpiresAt: number | null, capabilities: string[]): boolean {
  if (!planExpiresAt || planExpiresAt <= Date.now()) return false;
  return capabilities.includes('monthly') || capabilities.includes('jobpass');
}

export function PricingProvider({ children }: { children: ReactNode }) {
  const { user, refreshUser } = useAuth();
  const [paywallOpen, setPaywallOpen] = useState(false);

  const openPaywall = useCallback(() => setPaywallOpen(true), []);
  const closePaywall = useCallback(() => setPaywallOpen(false), []);

  // 额度耗尽（后端 403 QUOTA_EXCEEDED）自动弹付费墙，业务组件无需各自监听。
  // 同时刷新用户态，让付费墙展示的「剩余额度」为最新值（403 后 credits 已减到 0）。
  useEffect(() => {
    const onOpen = () => {
      setPaywallOpen(true);
      refreshUser().catch(() => {});
    };
    window.addEventListener('paywall:open', onOpen);
    return () => window.removeEventListener('paywall:open', onOpen);
  }, [refreshUser]);

  const credits = user?.credits ?? 0;
  const capabilities = user?.capabilities ?? [];
  const isSubscribed = isSubscribedAt(user?.planExpiresAt ?? null, capabilities);

  return (
    <PricingContext.Provider value={{ credits, capabilities, isSubscribed, paywallOpen, openPaywall, closePaywall }}>
      {children}
    </PricingContext.Provider>
  );
}

export function usePricing() {
  return useContext(PricingContext);
}
