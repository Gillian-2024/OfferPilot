import { Settings } from '../types';

const KEYS = {
  settings: 'cjc:settings',
  jdResult: 'cjc:jdResult', // 兼容迁移源（旧版单上下文）
  resumeSummary: 'cjc:resumeSummary', // 兼容迁移源（旧版单上下文）
  jobs: 'cjc:jobs',
  activeJobId: 'cjc:activeJobId',
  growthPlan: 'cjc:growthPlan',
  userMemory: 'cjc:userMemory',
  history: (t: string) => `cjc:history:${t}`,
  selfEval: (jobId: string) => `cjc:selfEval:${jobId}`,
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

export function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ========== 求职岗位（多岗位上下文，P0-1） ==========

export interface JobContext {
  id: string;
  name: string; // 用户建的「公司 · 岗位」
  jdResult: any | null;
  resumeResult: any | null; // 简历拆解诊断（结果区回读用，P0 修复）
  resumeSummary: string;
  createdAt: number;
  updatedAt: number;
}

// 兼容迁移：旧 cjc:jdResult / cjc:resumeSummary → 第一个岗位
function migrateLegacy(): JobContext[] {
  const jobs = safeParse<JobContext[]>(localStorage.getItem(KEYS.jobs), []);
  if (jobs.length) return jobs;
  const legacyJD = localStorage.getItem(KEYS.jdResult);
  const legacyResume = localStorage.getItem(KEYS.resumeSummary);
  if (!legacyJD && !legacyResume) return jobs;
  const legacy = legacyJD ? safeParse<any>(legacyJD, null) : null;
  const now = Date.now();
  const job: JobContext = {
    id: genId(),
    name: '未命名岗位',
    jdResult: legacy,
    resumeResult: null,
    resumeSummary: legacyResume || '',
    createdAt: now,
    updatedAt: now,
  };
  localStorage.removeItem(KEYS.jdResult);
  localStorage.removeItem(KEYS.resumeSummary);
  const next = [job];
  localStorage.setItem(KEYS.jobs, JSON.stringify(next));
  localStorage.setItem(KEYS.activeJobId, job.id);
  return next;
}

function persistJobs(jobs: JobContext[]) {
  localStorage.setItem(KEYS.jobs, JSON.stringify(jobs));
}

export function getJobs(): JobContext[] {
  return migrateLegacy();
}

export function getActiveJobId(): string | null {
  migrateLegacy();
  const id = localStorage.getItem(KEYS.activeJobId);
  return id || null;
}

export function getActiveJob(): JobContext | null {
  const jobs = getJobs();
  if (!jobs.length) return null;
  const id = getActiveJobId();
  return jobs.find((j) => j.id === id) || jobs[0];
}

export function createJob(name: string): JobContext {
  const jobs = getJobs();
  const now = Date.now();
  const job: JobContext = {
    id: genId(),
    name: name.trim() || '未命名岗位',
    jdResult: null,
    resumeResult: null,
    resumeSummary: '',
    createdAt: now,
    updatedAt: now,
  };
  persistJobs([...jobs, job]);
  localStorage.setItem(KEYS.activeJobId, job.id);
  return job;
}

export function setActiveJob(id: string) {
  localStorage.setItem(KEYS.activeJobId, id);
}

export function updateJob(id: string, patch: Partial<Pick<JobContext, 'jdResult' | 'resumeResult' | 'resumeSummary' | 'name'>>) {
  const jobs = getJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx < 0) return;
  jobs[idx] = { ...jobs[idx], ...patch, updatedAt: Date.now() };
  persistJobs(jobs);
}

export function deleteJob(id: string) {
  let jobs = getJobs();
  jobs = jobs.filter((j) => j.id !== id);
  persistJobs(jobs);
  if (getActiveJobId() === id) {
    localStorage.setItem(KEYS.activeJobId, jobs.length ? jobs[0].id : '');
  }
}

// ===== 旧 API 代理到 active job（三组件零逻辑改动，切换岗位自动跟随） =====

export function getJDResult(): any | null {
  return getActiveJob()?.jdResult || null;
}
export function setJDResult(r: any) {
  const active = getActiveJob();
  if (active) {
    updateJob(active.id, { jdResult: r });
  } else {
    const job = createJob('未命名岗位');
    updateJob(job.id, { jdResult: r });
  }
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
  return getActiveJob()?.resumeSummary || '';
}
export function setResumeSummary(s: string) {
  const active = getActiveJob();
  if (active) {
    updateJob(active.id, { resumeSummary: s });
  } else {
    const job = createJob('未命名岗位');
    updateJob(job.id, { resumeSummary: s });
  }
}

export function getResumeResult(): any | null {
  return getActiveJob()?.resumeResult || null;
}
export function setResumeResult(r: any) {
  const active = getActiveJob();
  if (active) {
    updateJob(active.id, { resumeResult: r });
  } else {
    const job = createJob('未命名岗位');
    updateJob(job.id, { resumeResult: r });
  }
}

// ========== 成长档案（复盘闭环，P0-2；全局一份跨岗位，仅标来源岗位） ==========

export interface GrowthPlan {
  knowledge_gaps: string[];
  practice_items: string[];
  next_strategy: string;
  weakest_link: string;
  summary: string;
  sourceJob: string; // 沉淀来源岗位名
  updatedAt: number;
}

export function getGrowthPlan(): GrowthPlan | null {
  return safeParse<GrowthPlan | null>(localStorage.getItem(KEYS.growthPlan), null);
}
export function setGrowthPlan(p: GrowthPlan) {
  localStorage.setItem(KEYS.growthPlan, JSON.stringify(p));
}
export function clearGrowthPlan() {
  localStorage.removeItem(KEYS.growthPlan);
}

// ========== 用户级记忆（跨会话累积，P1-2；全局一份跨岗位，越用越懂你） ==========

export interface UserMemory {
  practiced: { title: string; count: number; lastTs: number }[]; // 练过的题，去重累积，cap 20
  conclusions: string[]; // 复盘结论（growthPlan.summary），cap 20
  sessionCount: number; // 已沉淀复盘场数
  updatedAt: number;
}

export function getUserMemory(): UserMemory | null {
  return safeParse<UserMemory | null>(localStorage.getItem(KEYS.userMemory), null);
}
export function setUserMemory(m: UserMemory) {
  localStorage.setItem(KEYS.userMemory, JSON.stringify(m));
}
export function clearUserMemory() {
  localStorage.removeItem(KEYS.userMemory);
}

// 沉淀复盘时累积记忆：practiced 按 title 去重 bump count（count 降序，cap 20）；conclusion 去重追加（最新在前，cap 20）
export function accumulateMemory(practiced: string[], conclusion: string) {
  const now = Date.now();
  const prev = getUserMemory();
  const cur: UserMemory = {
    practiced: [...(prev?.practiced || [])],
    conclusions: [...(prev?.conclusions || [])],
    sessionCount: (prev?.sessionCount || 0) + 1,
    updatedAt: now,
  };
  for (const raw of practiced || []) {
    const title = (raw || '').trim();
    if (!title) continue;
    const idx = cur.practiced.findIndex((p) => p.title === title);
    if (idx >= 0) {
      cur.practiced[idx].count += 1;
      cur.practiced[idx].lastTs = now;
    } else {
      cur.practiced.push({ title, count: 1, lastTs: now });
    }
  }
  cur.practiced.sort((a, b) => b.count - a.count);
  cur.practiced = cur.practiced.slice(0, 20);
  if (conclusion && !cur.conclusions.includes(conclusion)) {
    cur.conclusions.unshift(conclusion);
  }
  cur.conclusions = cur.conclusions.slice(0, 20);
  setUserMemory(cur);
  return cur;
}

// ========== 历史记录（最近 20 条） ==========

export interface HistoryItem {
  id: string;
  ts: number;
  title: string;
  data: any;
  provider?: string;
  model?: string;
  /** 所属求职岗位 id（P0-1 多岗位后：历史记录按岗位归属） */
  jobId?: string;
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

// P1-1 会话恢复：历史 upsert（id 匹配则替换并置顶，否则新增），供面试会话 debounce 持久化 + 历史点开恢复复用
export function upsertHistory(type: string, item: HistoryItem) {
  const list = getHistory(type);
  const idx = list.findIndex((h) => h.id === item.id);
  if (idx >= 0) list.splice(idx, 1);
  list.unshift(item);
  localStorage.setItem(KEYS.history(type), JSON.stringify(list.slice(0, 20)));
}

export function deleteHistoryItemLocal(type: string, id: string) {
  localStorage.setItem(KEYS.history(type), JSON.stringify(getHistory(type).filter((h) => h.id !== id)));
}

// 登录态历史同步：addHistory 同时写服务端（fire-and-forget）
import { getToken, saveHistoryItem } from '../api/auth';

export function addHistorySynced(type: string, item: HistoryItem) {
  addHistory(type, item);
  if (getToken()) {
    saveHistoryItem({
      type,
      title: item.title,
      data: item.data,
      provider: item.provider,
      model: item.model,
      jobId: item.jobId,
    }).catch(() => {});
  }
}

// ========== 自我评价结果（P2-2：按岗位持久化，Drawer 重开/刷新恢复） ==========

export function getSelfEval(jobId: string): string {
  return localStorage.getItem(KEYS.selfEval(jobId)) || '';
}
export function setSelfEval(jobId: string, content: string) {
  localStorage.setItem(KEYS.selfEval(jobId), content);
}

// === LLM Quality Metrics (client-side, per model) ===
const QUALITY_KEY = 'cjc:quality_metrics';

interface QualityMetrics {
  [modelKey: string]: { success: number; fail: number };
}

export function getQualityMetrics(): QualityMetrics {
  try {
    const raw = localStorage.getItem(QUALITY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function recordModelResult(model: string, success: boolean) {
  try {
    const m = getQualityMetrics();
    if (!m[model]) m[model] = { success: 0, fail: 0 };
    m[model][success ? 'success' : 'fail'] += 1;
    localStorage.setItem(QUALITY_KEY, JSON.stringify(m));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}
