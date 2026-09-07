export type Provider = 'claude' | 'openai' | 'google' | 'deepseek' | 'tongyi' | 'doubao' | 'moonshot' | 'zhipu' | 'minimax';

export interface Settings {
  provider?: Provider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

// SSE 消息契约
export interface SSEStep { type: 'step'; index: number; total: number; label: string }
export interface SSEStepDone { type: 'step_done'; index: number; label: string }
export interface SSEResult { type: 'result'; data: any; provider: string; model: string }
export interface SSEToken { type: 'token'; text: string }
export interface SSEError { type: 'error'; message: string }
export type SSEMessage = SSEStep | SSEStepDone | SSEResult | SSEToken | SSEError;

// 用户
export interface User {
  id: string;
  username: string;
  nickname?: string;
  createdAt: number;
  credits: number;
  capabilities: string[];
  planExpiresAt: number | null;
  isAdmin?: boolean;
}

// 付费 SKU（对应后端 /api/skus）
export interface Sku {
  code: string;
  name: string;
  priceCents: number;
  credits: number;
  capabilities: string[];
  durationDays: number | null;
}

// Sidebar:文件夹 / 项目 / 邀请码
export interface Folder {
  id: string;
  name: string;
  user_id?: string; // 创建接口不返回,列表接口返回
  sort_order: number;
  created_at: number;
  project_count?: number;
}
export interface Project {
  id: string;
  name: string;
  folder_id: string | null;
  user_id?: string; // 创建接口不返回,列表接口返回
  created_at: number;
  updated_at: number;
}
export interface Invite {
  id: string;
  code: string;
  user_id?: string; // GET /invites/my 不返回
  click_count: number;
  created_at: number;
}

// JD 拆解结果
export interface JDResult {
  job_profile: string;
  job_type: string;
  campus_viable: string;
  hard_requirements: {
    education: string;
    experience: string;
    must_skills: string[];
    industry: string;
  };
  soft_competencies: string[];
  keyword_list: string[];
  screening_priority: { item: string; tier: string; note: string }[];
  interview_focus: { topic: string; probability: string; prep: string }[];
  campus_channel: { viable: boolean; loosen: string; blocker: string };
  red_flags: string[];
  // Step 4: 岗位深解读
  real_work_scenario?: string;
  industry_workflow?: string;
  career_path?: { exits: string[]; also_fit: string[] };
  kpi_and_barrier?: { kpis: string[]; barriers: string[] };
}

// 简历拆解结果
export interface ResumeResult {
  match_score: number;
  score_basis: string;
  keyword_hits: {
    matched: { keyword: string; evidence: string }[];
    missing: string[];
  };
  requirement_gaps: {
    dimension: string;
    requirement: string;
    status: string;
    evidence: string;
    gap: string;
  }[];
  module_issues: {
    module: string;
    issues: { type: string; detail: string; severity: string }[];
  }[];
  modules?: { name: string; content: string }[]; // step1 模块原文映射（P1-3 逐段改写带入原文用）
  differentiator: string;
  quick_wins: string[];
  positioning: string;
}
