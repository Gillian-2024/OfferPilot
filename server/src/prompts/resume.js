import { z } from 'zod';
import { BASE_SYSTEM } from './base.js';

// 简历拆解：4 节点分步链
// 核心是「对照 JD」——简历拆解不是独立评简历，而是对照 JD 拆解结果逐维度 gap 分析
// jdProfile = JD 拆解完整结果（对照基准），null 时降级为通用应届生标准

const step1Schema = z.object({
  modules: z.array(
    z.object({
      name: z.string().describe('教育|实习|项目|校园|技能|自我评价'),
      content: z.string().describe('原文内容'),
    })
  ),
  raw_summary: z.string().describe('简历整体一句话概括'),
});

const step2Schema = z.object({
  match_score: z.number().describe('0-100'),
  score_basis: z.string().describe('评分依据，对照 JD 逐项'),
  keyword_hits: z.object({
    matched: z.array(
      z.object({
        keyword: z.string(),
        evidence: z.string().describe('简历哪里体现'),
      })
    ),
    missing: z.array(z.string()),
  }),
});

const step3Schema = z.object({
  requirement_gaps: z.array(
    z.object({
      dimension: z.string().describe('对照的 JD 维度：硬性要求/软性素质/筛选优先级/关键词'),
      requirement: z.string().describe('JD 的某项具体要求'),
      status: z.string().describe('满足 | 部分 | 缺失'),
      evidence: z.string().describe('简历哪里体现，或为何缺失'),
      gap: z.string().describe('缺口说明；满足填「无」'),
    })
  ).describe('对照 JD 各维度的 gap 分析，这是简历拆解对照 JD 的核心产出'),
  module_issues: z.array(
    z.object({
      module: z.string(),
      issues: z.array(
        z.object({
          type: z.string().describe('定位|结构|量化|STAR|啰嗦|错别字'),
          detail: z.string(),
          severity: z.string().describe('高|中|低'),
        })
      ),
    })
  ),
  differentiator: z.string().describe('最值钱的点，没有就写「无明显差异化」'),
  positioning: z.string().describe('定位是否清晰，一句话评价；对照 JD 岗位定位看是否对准'),
});

const step4Schema = z.object({
  match_score: z.number(),
  score_basis: z.string(),
  keyword_hits: z.object({
    matched: z.array(z.object({ keyword: z.string(), evidence: z.string() })),
    missing: z.array(z.string()),
  }),
  requirement_gaps: z.array(
    z.object({
      dimension: z.string(),
      requirement: z.string(),
      status: z.string(),
      evidence: z.string(),
      gap: z.string(),
    })
  ),
  module_issues: z.array(
    z.object({
      module: z.string(),
      issues: z.array(
        z.object({
          type: z.string(),
          detail: z.string(),
          severity: z.string(),
        })
      ),
    })
  ),
  differentiator: z.string(),
  quick_wins: z.array(z.string()).describe('3-5 条按 ROI 排序，改了立刻见效'),
  positioning: z.string(),
});

export const REWRITE_SYSTEM = `${BASE_SYSTEM}

当前任务：逐段改写。用户会指定一个简历模块，并可能附带目标 JD 画像。
你输出：改前建议 + 改写示例 + 为什么这么改。
铁律：优化表达不编造经历；数据存疑标 [需本人确认]；锚定目标 JD，不做通用美化。`;

export function buildResumeSteps(resumeText, jdProfile = null) {
  // 把 JD 全画像格式化成对照基准文本，注入后续每步
  const jdBaseline = jdProfile
    ? `【目标 JD 拆解结果 —— 简历对照基准】
岗位定位：${jdProfile.job_profile || '未提及'}
岗位类型：${jdProfile.job_type || '未提及'}
硬性要求：
${JSON.stringify(jdProfile.hard_requirements || {}, null, 2)}
软性素质：${(jdProfile.soft_competencies || []).join('、')}
筛选优先级：
${JSON.stringify(jdProfile.screening_priority || [], null, 2)}
应届校招校准：${JSON.stringify(jdProfile.campus_channel || {}, null, 2)}
简历关键词清单：${(jdProfile.keyword_list || []).join('、')}`
    : '（未提供 JD 拆解结果，按通用应届生校招简历标准评估——非对照模式）';

  return [
    () => ({
      label: '简历结构化解析',
      system: BASE_SYSTEM,
      prompt: `把下面简历当产品方案来评审。第一步：提取模块结构。
模块名归一到：教育|实习|项目|校园|技能|自我评价。无法识别的模块按原文命名。
表格/排版可能错位（清洗后文本），基于可识别内容工作。

【简历原文】
${resumeText}`,
      schema: step1Schema,
    }),
    (prev) => ({
      label: '关键词匹配（对照 JD）',
      system: BASE_SYSTEM,
      prompt: `第二步：对照目标 JD 的关键词清单，逐个匹配简历，找 evidence。
匹配度评分 0-100，依据对照 JD 逐项说明。

${jdBaseline}

【简历模块】
${JSON.stringify(prev, null, 2)}`,
      schema: step2Schema,
    }),
    (prev) => ({
      label: '逐模块诊断 + JD 对照 gap 分析',
      system: BASE_SYSTEM,
      prompt: `第三步：逐模块找问题，并对照 JD 各维度做 gap 分析（这是简历拆解对照 JD 的核心）。
- requirement_gaps：对照 JD 的硬性要求（学历/经验/技能/行业）、软性素质、筛选优先级 must-have 项，逐项说满足/部分/缺失 + 简历证据 + 缺口
- module_issues：应届生重点看实习/项目/校园经历 STAR 化，不苛求工作经验
- differentiator 没有就写「无明显差异化」，不硬编
- positioning 要对照 JD 岗位定位，看简历定位是否对准

${jdBaseline}

【前两步结果】
${JSON.stringify(prev, null, 2)}`,
      schema: step3Schema,
    }),
    (prev) => ({
      label: '汇总诊断报告',
      system: BASE_SYSTEM,
      prompt: `第四步：汇总成最终诊断报告。quick_wins 按 ROI 排序（3-5 条改了立刻见效）。
保留前几步的关键结论（requirement_gaps、keyword_hits、module_issues 不丢失），让用户一眼看到对照 JD 的全貌。

【前面所有结果】
${JSON.stringify(prev, null, 2)}`,
      schema: step4Schema,
    }),
  ];
}
