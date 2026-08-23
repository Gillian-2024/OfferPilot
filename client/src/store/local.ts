import { Settings } from '../types';

const KEYS = {
  settings: 'cjc:settings',
  jdResult: 'cjc:jdResult', // 联动：简历拆解读这个
  resumeSummary: 'cjc:resumeSummary', // 联动：面试复盘读这个
  history: (t: string) => `cjc:history:${t}`,
};

// 留空 = 不发 header = 服务端读 .env 默认（本机可配自定义网关）
export const defaultSettings: Settings = {};

export function getSettings(): Settings {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(KEYS.settings) || '{}') };
  } catch {
    return defaultSettings;
  }
}
export function setSettings(s: Settings) {
  localStorage.setItem(KEYS.settings, JSON.stringify(s));
}

// 三 Tab 单向联动：JD → 简历 → 面试
export function getJDResult(): any | null {
  try {
    return JSON.parse(localStorage.getItem(KEYS.jdResult) || 'null');
  } catch {
    return null;
  }
}
export function setJDResult(r: any) {
  localStorage.setItem(KEYS.jdResult, JSON.stringify(r));
}
export function getJDKeywords(): string[] {
  const r = getJDResult();
  return r?.keyword_list || [];
}
export function getJDProfile(): string {
  const r = getJDResult();
  return r?.job_profile || '';
}

export function getResumeSummary(): string {
  return localStorage.getItem(KEYS.resumeSummary) || '';
}
export function setResumeSummary(s: string) {
  localStorage.setItem(KEYS.resumeSummary, s);
}

// 历史记录（最近 20 条）
export interface HistoryItem {
  id: string;
  ts: number;
  title: string;
  data: any;
  provider?: string;
  model?: string;
}
export function getHistory(type: string): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEYS.history(type)) || '[]');
  } catch {
    return [];
  }
}
export function addHistory(type: string, item: HistoryItem) {
  const list = getHistory(type);
  list.unshift(item);
  localStorage.setItem(KEYS.history(type), JSON.stringify(list.slice(0, 20)));
}
export function clearHistory(type: string) {
  localStorage.removeItem(KEYS.history(type));
}

// 登录态历史同步：addHistory 同时写服务端（fire-and-forget）
import { getToken, saveHistoryItem } from '../api/auth';

export function addHistorySynced(type: string, item: HistoryItem) {
  addHistory(type, item);
  if (getToken()) {
    saveHistoryItem({ type, title: item.title, data: item.data, provider: item.provider, model: item.model }).catch(() => {});
  }
}
