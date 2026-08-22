# OfferPilot 领航员 App 技术实现文档（施工蓝图 v1）

> 状态：draft · 2026-08-22
> 定位：自用工具 + 简历项目条目，架构**预留上线全栈完整**（鉴权 + DB + 部署），分享可用；**不做**商业化 / 获客 / 支付 / 多租户 / 合规。
> 迁移路径：A（Vite+Express → Next.js App Router + Supabase + Vercel）。

---

## 1. 产品定位与技术目标

### 1.1 产品定位
- **自用 + 简历项目**。分享可用（别人能登录用）。不商业化、不获客、无支付 / 多租户 / 合规。
- 三能力（JD 拆解 / 简历拆解 / 面试复盘）**各自做深**。
- 差异点：个人 AI 策略 PM 知识 + 记忆，在垂类（应届校招求职辅导）的不可替代性。

### 1.2 技术目标
- 架构对标"可上线 App"：鉴权 + 持久化 DB + 文件存储 + 部署，全栈完整。
- 功能边界 demo 级：三能力做深即可，不扩商业化能力。
- 预留性：选主流生产范式（Next.js + Supabase + RLS + Vercel），未来若转产品不需重做架构。

---

## 2. 技术架构总览

```
┌─ Client（Next.js App Router，部署于 Vercel）─────────────┐
│  React 19 + TypeScript + AntD 5                           │
│  Supabase JS SDK（auth + db + storage + realtime）        │
│  RLS 直连 DB（省手写后端 API）                             │
└──────────────────┬────────────────────────────────────────┘
                   │ Route Handlers（app/api/*）
                   │   /api/analyze   AI：JD / 简历拆解
                   │   /api/chat      AI：面试复盘 SSE
                   │   /api/upload    → Supabase Storage
┌─ Server-side ────┴────────────────────────────────────────┐
│  Vercel AI SDK v7（generateText + schemaShape + extract）  │ ← 直接搬现有
│  模型：glm-5.2（server env，不暴露前端）                    │
│  Supabase（PostgreSQL + Auth + Storage + RLS）             │
└────────────────────────────────────────────────────────────┘
```

四件套各解一痛：Next.js 全栈一体 · Vercel AI SDK 统一多模型 · Supabase 省 BaaS · Vercel 部署零配置。

---

## 3. 现有 MVP 资产盘点（2195 行）

| 资产 | 现位置 | 迁移处置 |
|---|---|---|
| prompts/\*.js（jd / resume / interview / base） | server/src/prompts/ | **直接搬**（纯逻辑，无框架依赖）|
| providers/index.js（自建网关 fetch wrapper） | server/src/providers/ | **直接搬** |
| utils/schemaShape.js + jsonExtract.js | server/src/utils/ | **直接搬**（绕 tool_use 的核心资产）|
| routes/analyze.js（generateText 调用） | server/src/routes/ | 改 Route Handler，逻辑搬 |
| routes/chat.js（SSE） | server/src/routes/ | 改 Route Handler streaming |
| routes/upload.js（multer） | server/src/routes/ | 改 Supabase Storage |
| routes/share.js（短链） | server/src/routes/ | 改 Supabase DB |
| store/local.ts（localStorage） | client/src/store/ | **重写** → Supabase DB + RLS |
| 组件（JD / Resume / Interview / Layout / Settings） | client/src/components/ | 加 `'use client'` 复用 |
| types/index.ts | client/src/types/ | 搬 + 加 DB schema 类型 |

**核心判断**：可搬资产占大头（prompts / providers / utils / 组件），真正重写的是数据层 + 路由层。generateText / schemaShape 绕 tool_use 的坑（端到端打通要点，见 auto-memory `project-campus-job-coach`）在新框架行为一致（纯函数），仅 streaming 写法变。

---

## 4. 数据模型设计（Supabase PostgreSQL + RLS）

### 4.1 表

| 表 | 主键 | 关键字段 | RLS 策略 |
|---|---|---|---|
| profiles | id（FK→auth.users） | email, created_at | 用户读自己 |
| jd_analyses | id | user_id, input_text, result_json, created_at | `user_id = auth.uid()` |
| resume_analyses | id | user_id, jd_analysis_id, input_text, result_json, requirement_gaps, created_at | `user_id = auth.uid()` |
| interview_sessions | id | user_id, messages_json, created_at, updated_at | `user_id = auth.uid()` |
| share_links | id | user_id, resource_type, resource_id, slug(nanoid), created_at | 创建者写；持 slug 者读关联资源 |

### 4.2 RLS 原则
- 业务表 `user_id = auth.uid()` 才能读写（用户数据隔离）。
- share_links 持 slug 可读关联资源（分享能力）。
- service_role key 仅服务端（已落 server/.env，不入前端），绕 RLS 做管理操作。

---

## 5. 鉴权设计
- Supabase Auth（邮箱 magic link 或 GitHub OAuth）。
- 登录才能用三能力（demo 不做匿名）。
- middleware 保护 `/jd` `/resume` `/interview`，未登录跳 `/login`。
- session 走 Supabase cookie（SSR 友好）。

---

## 6. 三能力"做深"方向（⚠️ 待你拍板，不阻塞 P1–P3）

> 你说三能力各自做深，具体方向未给。下面是基于业务理解列出的候选，标 ⚠️ 待确认。

### 6.1 JD 拆解做深
- ⚠️ A：一次性结构化 → 支持多 JD 横向对比岗位差异
- ⚠️ B：JD 关键词 → 岗位画像沉淀（用户积累的 JD 库做趋势分析）
- ⚠️ C：JD ↔ 简历对照更细（requirement_gaps 已有，加改写建议优先级）

### 6.2 简历拆解做深
- ⚠️ A：逐段改写 1 版 → 多版本对比（A/B/C 改写 + 评分）
- ⚠️ B：简历版本管理（同岗位多版沉淀）
- ⚠️ C：ATS 优化评分（关键词命中率量化）

### 6.3 面试复盘做深
- ⚠️ A：模拟追问单轮 → 多轮深挖（追问树）
- ⚠️ B：复盘报告沉淀（弱点清单 + 再练推荐）
- ⚠️ C：岗位题库（基于 JD 生成针对性问题）

### 6.4 差异点落地（个人知识 + 记忆注入）
候选路径：
- (1) system prompt 注入个人方法论（如需求分析方法论）
- (2) RAG 个人知识库（Supabase pgvector）
- (3) few-shot 个人案例
⚠️ 待确认走哪条 / 组合。

---

## 7. 迁移路线图（分阶段）

| 阶段 | 内容 | 验收 | 预估 |
|---|---|---|---|
| P1 骨架 | 初始化 Next.js 16 + Supabase client + Vercel AI SDK，跑通 hello | 本地 dev 起 | 0.5 session |
| P2 搬逻辑 | prompts / providers / utils / schemaShape / extract 搬入，analyze Route Handler 跑通 JD 3 步 | 端到端 JD 拆解绿 | 1 session |
| P3 数据层 | 建 Supabase 表 + RLS，store/local → DB，简历 4 步 + 对照持久化 | 登录后数据落库 | 1 session |
| P4 Auth | Supabase Auth + middleware，路由保护 | 未登录跳登录 | 0.5 session |
| P5 面试复盘 | chat Route Handler streaming 搬入 | SSE 对话跑通 | 0.5 session |
| P6 部署 | Vercel 部署 + env + 域名 | 公网可访问 | 0.5 session |
| P7 三能力做深 | 按你拍板的方向逐项 | 逐项验收 | 待定 |

---

## 8. 部署方案

- **Vercel**（免费 tier 够 demo）：关联 GitHub `Gillian-2024/campus-job-coach`，main 自动部署。
- 环境变量配置（双轨）：
  - **本机自用**（本地 `.env.local`，不入 git）：网关 key + `ANTHROPIC_BASE_URL=llm-gateway.example.com/anthropic` + `ANTHROPIC_MODEL=tencent/glm-5.2`
  - **上线 Vercel**（dashboard 配，不入 git）：`ZHIPU_API_KEY` + `ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4` + `ZHIPU_MODEL=glm-5.2`
  - Supabase 三项（URL / anon / service_role）本机与上线都配
- ✅ **provider 已定（2026-08-22）**：上线走**智谱官方 API**（公网可达），自建网关 仅本机自用。
  - 关键利好：智谱官方端点直接提供 `glm-5.2` 模型 ID（与 自建网关 映射的 `tencent/glm-5.2` 同源），**provider 切换无缝**——仅端点 + key 变，模型名不变，现有 prompt / schemaShape 调用链零改动。
  - 智谱 API 为 OpenAI 兼容端点（`/chat/completions` + Bearer auth），用 `@ai-sdk/openai-compatible` 接入（现有 server 已有此包）。
  - 升级可选：GLM-5.3 已于 2026-08-19 上线 API（编程 / 智能体更强，定价与 5.2 一致）；保守沿用 5.2 上线，验证后再升。

---

## 9. 安全边界
- API key / service_role key 仅 server env，不进前端 bundle、不进 git。
- RLS 用户数据隔离。
- 限流 demo 简化（Vercel 自然限流 + 后续可加 Upstash）。
- AI 调用烧钱：登录态 + 基础频控（demo 不做严格商用限流）。

---

## 10. 不做清单（边界）
- ❌ 支付 / 订阅
- ❌ 多租户 / 团队
- ❌ 商业化获客
- ❌ 合规审计（demo 级）
- ❌ 监控告警（Vercel dashboard 够 demo）

---

## 待你确认（不阻塞 P1–P3 施工）
1. 三能力做深具体方向（§6.1/6.2/6.3 各选 1–2 个）。
2. 差异点（个人知识 + 记忆）注入方式（§6.4）。

✅ 已定（2026-08-22）：
- §8 provider：上线走智谱官方 API（`glm-5.2` 无缝），自建网关 仅本机自用。
