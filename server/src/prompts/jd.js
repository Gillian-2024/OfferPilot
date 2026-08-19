import { z } from 'zod';
import { BASE_SYSTEM } from './base.js';

// JD 拆解：3 节点分步链，每步 generateObject + zod schema 强制契约
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

// 返回步骤数组：每步是 (prev) => {label, system, prompt, schema}
// prev = 上一步 generateObject 的输出（首步为 null）
export function buildJDSteps(jdText) {
  return [
    () => ({
      label: '岗位识别',
      system: BASE_SYSTEM,
      prompt: `把下面的 JD 当产品需求文档来拆。第一步：识别岗位基本信息。
只基于原文，推断项加 [推测] 前缀。原文缺失字段输出「未提及」。

【JD 原文】
${jdText}`,
      schema: step1Schema,
    }),
    (prev) => ({
      label: '需求拆解',
      system: BASE_SYSTEM,
      prompt: `第二步：基于上一步的岗位信息，拆解硬性/软性要求和简历关键词。
去虚词化：把「结果导向」「owner 意识」等翻译成可考察的具体行为。
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
      prompt: `第三步：基于拆解结果预测面试考点，并做应届校招校准。
考点按概率排序；red_flags 找加班暗示、模糊职责等信号。

【拆解结果】
${JSON.stringify(prev, null, 2)}`,
      schema: step3Schema,
    }),
  ];
}
