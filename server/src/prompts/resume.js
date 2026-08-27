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
      module: z.string().describe('与 step1 的 modules[].name 完全一致：教育|实习|项目|校园|技能|自我评价（无法识别则按原文命名）'),
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
      module: z.string().describe('与 step1 的 modules[].name 完全一致：教育|实习|项目|校园|技能|自我评价（无法识别则按原文命名）'),
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

简历写作核心原则（内化到改写建议中）：
- STAR 中 A(Action)和 R(Result)最重要，篇幅有限时优先保这两项
- 用数据说话但数据≠数字：多视角量化（公司业绩、客户、领导、业界）+ 多种类佐证（评价、反馈、获奖、报道）
- 要有故事性、电影感——发现/解决问题的战斗故事，步步深入留悬念
- 每段经历三维度阐释；月报写苦劳，简历写功劳和成就
- 自我评价要 show 不要 tell；模仿目标 JD 的专业术语
- 关键词是给分点，强调核心技能（商务+技术），给分词要专业、具体、特异性
- 体现事业上升和专业成长（数字提高趋势）
- 黄金开场：自我总结置顶做开场，四要素——核心竞争力（一句话与岗位最匹配的优势）+ 业务特质（与 JD 相关的技能/数据成果）+ 岗位特质（匹配 JD 软性要求）+ 职业素养（沟通/抗压/学习）；学历不占优时后置教育背景，避免开场暴露短板
- 友好故事：对 HR 友好（10-30 秒能看懂、人话不说内部术语）+ 对业务友好（呈现思考深度与培养价值）；从「我有什么」单向陈述，转为「业务要什么 × 我有什么」双向匹配
- 主线叙事：不按维度/模块罗列，提炼一条成长主线（如「某产品 DAU 从 X 做到 Y」）串联所有经历；岗位 Title 统一垂直化（同职能用同一 Title，强化垂直专业形象）
- 钩子留白：结果量化但关键行动不展开，刻意留白当面试钩子，诱导面试官追问

铁律：优化表达不编造经历；数据存疑标 [需本人确认]；锚定目标 JD，不做通用美化。`;

// 自我评价生成：基于 JD + 简历，输出针对性自我评价
// 来自用户真实 prompt："结合简历和意向岗位，写针对性自我评价（500字，总分总，3-5 能力点）"
export const SELF_EVAL_SYSTEM = `${BASE_SYSTEM}

当前任务：生成针对性自我评价。基于用户的简历和目标岗位，输出一段可直接用于简历的自我评价。

输出要求：
1. 格式：总分总结构（黄金开场 = 置顶定位）
   - 开头一句：定位总结（你是谁 + 求职意向），一句话亮出与岗位最匹配的核心竞争力——这是 HR 最先看到的「黄金开场」
   - 中间 3-5 个能力点：每个能力点 = 能力名 + 简历证据（1-2 句）+ 与目标岗位的契合（覆盖业务特质/岗位特质/职业素养）
   - 结尾一句：求职动机 + 工作兴趣
2. 字数：400-600 字
3. 风格：简明有力、有逻辑、突出优势、抓重点
4. 体现求职意向和工作兴趣（不是泛泛而谈，要锚定目标岗位）

铁律：
- 所有能力点必须有简历证据支撑，不凭空捏造
- 数据存疑标 [需本人确认]
- 不做通用美化（如"性格开朗、吃苦耐劳"这种空话），每个点都要有具体经历佐证
- 如果简历经历不足以支撑 3 个能力点，如实说明缺口，不硬编
- show 不要 tell：能力点用具体成就证明，不用形容词堆砌
- 职业画像和品牌（"是什么"）优于求职意向（"求什么"）`;

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
匹配度评分 0-100，依据对照 JD 逐项说明（2-3句话）。

${jdBaseline}

【简历模块】
${JSON.stringify(prev, null, 2)}`,
      schema: step2Schema,
    }),
    (prev) => ({
      label: '逐模块诊断 + JD 对照 gap 分析',
      system: BASE_SYSTEM,
      prompt: `第三步：逐模块找问题，并对照 JD 各维度做 gap 分析。
只写真实差距，不要编造：
- requirement_gaps：硬要求/软性素质/优先级 must-have 项，逐项满足/部分/缺失+证据+缺口（精简到核心条目）
- module_issues：应届生重点看实习/项目 STAR 化；每条 issue 只需一句话
- differentiator：最值钱的点，没有就写「无明显差异化」
- positioning：一句话评价定位是否对准 JD

${jdBaseline}

【前两步结果】
${JSON.stringify(prev, null, 2)}`,
      schema: step3Schema,
    }),
    (prev) => ({
      label: '汇总诊断报告',
      system: BASE_SYSTEM,
      prompt: `第四步：汇总成简洁的诊断报告。quick_wins 按 ROI 排 3-5 条，每条一句说完。
若简历可能卡在初筛，用漏斗视角点出最可能的卡点：AI 机筛（硬性条件不符）→ HR 初筛（10-30 秒抓不住眼、术语太多 HR 看不懂）→ 业务复筛（没有激发兴趣的钩子）。
保留关键结论但不重复前文——用户需要一眼看到全貌，不是长篇大论。

【前面所有结果】
${JSON.stringify(prev, null, 2)}`,
      schema: step4Schema,
    }),
  ];
}
