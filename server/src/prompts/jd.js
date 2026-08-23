import { z } from 'zod';
import { BASE_SYSTEM } from './base.js';

// JD 拆解：4 节点分步链，generateText + schemaShape 注入 + zod 校验
// （generateObject tool mode 对内网 reasoning 模型失效，走文本直出 + 手动 parse）
// 每步接收上一步输出，逐步注入上下文

const step1Schema = z.object({
  job_profile: z.string().describe('一句话岗位定位：什么岗位、解决什么问题'),
  job_type: z.string().describe('技术|产品|运营|市场|设计|HR|其他'),
  campus_viable: z.string().describe('初判应届是否可行 + 依据'),
});

const step2Schema = z.object({
  hard_requirements: z.object({
    education: z.string().describe('学历要求 + 是否硬性'),
    experience: z.string().describe('经验要求 + 应届是否可行'),
    must_skills: z.array(z.string()).describe('必备技能'),
    industry: z.string().describe('行业经验要求'),
  }),
  soft_competencies: z.array(z.string()).describe('仅从原文提炼的软性素质，禁止补全'),
  keyword_list: z.array(z.string()).describe('简历筛选用核心词，按重要性排序'),
  screening_priority: z.array(
    z.object({
      item: z.string(),
      tier: z.string().describe('must-have | nice-to-have'),
      note: z.string().describe('为什么'),
    })
  ),
});

const step3Schema = z.object({
  interview_focus: z.array(
    z.object({
      topic: z.string().describe('预测考点'),
      probability: z.string().describe('高 | 中 | 低'),
      prep: z.string().describe('备考建议'),
    })
  ),
  campus_channel: z.object({
    viable: z.boolean(),
    loosen: z.string().describe('哪些表面要求对应届生可放宽'),
    blocker: z.string().describe('哪些是硬门槛不可绕过'),
  }),
  red_flags: z.array(z.string()).describe('JD 里值得警惕的信号：加班暗示、模糊职责等'),
});

// Step 4：岗位深解读（来自用户真实 prompt 归纳）
// - "详细分析工作职责，解读深层含义" → real_work_scenario
// - "该行业上下游工作流全景" → industry_workflow
// - "exit 可能性 / 还适合什么岗位" → career_path
// - "KPI 指标 / 壁垒能力" → kpi_and_barrier
const step4Schema = z.object({
  real_work_scenario: z.string().describe('翻译 JD → 真实工作场景：日常做什么、和谁协作、核心挑战是什么'),
  industry_workflow: z.string().describe('行业上下游工作流全景：这个岗位在价值链的哪个位置、上游谁给输入、下游谁消费输出'),
  career_path: z.object({
    exits: z.array(z.string()).describe('未来可转向的岗位方向（3-5 个）'),
    also_fit: z.array(z.string()).describe('当前也适合的相关岗位（2-3 个）'),
  }),
  kpi_and_barrier: z.object({
    kpis: z.array(z.string()).describe('该岗位核心 KPI 指标（3-5 个）'),
    barriers: z.array(z.string()).describe('做这行能成为壁垒的能力（2-3 个，别人不容易替代你的）'),
  }),
});

// 返回步骤数组：每步是 (prev) => {label, system, prompt, schema}
// prev = 上一步输出（首步为 null）
export function buildJDSteps(jdText) {
  return [
    () => ({
      label: '岗位识别',
      system: BASE_SYSTEM,
      prompt: `把下面的 JD 当产品需求文档来拆。第一步：识别岗位基本信息。
只基于原文，推断项加 [推测]。缺失字段写「未提及」。

【JD 原文】
${jdText}`,
      schema: step1Schema,
    }),
    (prev) => ({
      label: '需求拆解',
      system: BASE_SYSTEM,
      prompt: `第二步：基于上一步的岗位信息，拆解硬要求和关键词。
去虚词化：把「结果导向」「owner 意识」翻译成可考察的具体行为。
软性素质仅从原文提炼，禁止补全。

【上一步岗位信息】
${JSON.stringify(prev, null, 2)}

【JD 原文】
${jdText}`,
      schema: step2Schema,
    }),
    (prev) => ({
      label: '考点预测 + 应届校准',
      system: BASE_SYSTEM,
      prompt: `第三步：基于拆解结果预测面试考点（高/中/低概率），并做应届校招校准。
red_flags 只找真正值得警惕的信号（加班暗示、模糊职责、画大饼）。

【拆解结果】
${JSON.stringify(prev, null, 2)}`,
      schema: step3Schema,
    }),
    (prev) => ({
      label: '岗位深解读',
      system: BASE_SYSTEM,
      prompt: `第四步：把 JD 翻译成应届生能懂的真实工作场景。每节 2-3 句话，不要冗长段落。
- real_work_scenario：日常做什么、和谁协作、核心挑战
- industry_workflow：岗位在价值链的位置——上游谁给输入、下游谁消费输出（一句话）
- career_path：exits（3个可转向方向）+ also_fit（2个相关岗位）
- kpi_and_barrier：kpis（3个核心指标）+ barriers（2个壁垒能力）

只基于 JD 原文 + 行业通识推断，推断标 [推测]。

【前三步拆解结果】
${JSON.stringify(prev, null, 2)}`,
      schema: step4Schema,
    }),
  ];
}
