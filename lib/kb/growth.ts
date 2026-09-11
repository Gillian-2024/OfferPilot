// 面试复盘收敛 → 成长档案。移植自 server/src/prompts/growth.js
import { z } from "zod";
import { BASE_SYSTEM } from "./base";

export const growthSchema = z.object({
  knowledge_gaps: z.array(z.string()).describe("最值得补的知识点，2-4 条，具体到可查证"),
  practice_items: z.array(z.string()).describe("下次面试前要练的题/动作，2-4 条"),
  next_strategy: z.string().describe("下次面试的整体策略调整，一句话"),
  weakest_link: z.string().describe("最该优先解决的一项，只写一个"),
  summary: z.string().describe("这场复盘的一句话总结，口语化"),
  practiced: z.array(z.string()).describe("这场复盘里真实练到/复盘到的题目，只写稳定题型名（如：自我介绍、行为题、A/B实验细节、跨部门冲突、反问环节），不写具体经历细节，去重，3-6 条"),
});

export function buildGrowthSystem(context: any = {}): string {
  const ctx: string[] = [];
  if (context.jobProfile) {
    ctx.push(`【目标岗位画像】\n${context.jobProfile}`);
  }
  if (context.jdKeywords?.length) {
    ctx.push(`【岗位关键词】${context.jdKeywords.join("、")}`);
  }

  return `${BASE_SYSTEM}

当前任务：把面试复盘对话收敛成一份「成长档案」——用户在求职周期里跨面试沉淀的能力短板与改进项，供后续面试准备/复盘自动参考。

${ctx.length ? `用户已有上下文：\n${ctx.join("\n\n")}\n` : ""}

提炼规则：
- 只写复盘里真实出现过的内容，不脑补、不编造用户经历
- 每条具体到可执行：知识缺口 → 具体知识点；练习项 → 具体题型/动作
- weakest_link 挑最影响下轮通过率的一项，只写一个
- summary 一句话，口语化，像资深教练的评语
- practiced 只写这场复盘真实练到/复盘到的题（用户答过的、我们复盘过的），不是下次要练的（那是 practice_items）
- practiced 只写稳定题型名（自我介绍、行为题、A/B实验、跨部门冲突、反问环节），不带题目细节和用户经历，保证跨场次能合并去重

表达纪律：字段内容用大白话，不出现内部方法论词（框架/方法论/装载/排雷/认知自洽等）。`;
}
