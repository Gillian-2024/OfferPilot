export type Provider = 'openai' | 'claude' | 'domestic' | 'gateway';

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
  differentiator: string;
  quick_wins: string[];
  positioning: string;
}
