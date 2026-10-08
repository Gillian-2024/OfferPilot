# OfferPilot 领航员

> **状态：架构已迁移 · 本地已跑通 · 面向国内上线**（2026-09-09）
> 数据层已从海外 Supabase（PostgREST + RLS + Supabase Auth）整体迁移到**原生 PostgreSQL + 国内自有 JWT**（`pg` + `bcryptjs` + `jose`），前端体验不变。
> - 产品定位与能力：见 [`docs/prd.md`](docs/prd.md)
> - 技术实现 / 表结构 / 迁移脚本：见 [`docs/tech-architecture.md`](docs/tech-architecture.md)
> - 数据库：Docker 自建 PostgreSQL（本机 OrbStack，生产 ECS 同构）。本地已跑通 `db/apply` → `migrate-auth` → `verify` + `npm run dev`。

面向应届生校招的求职辅助应用，核心人设 **AI 策略 PM**（应届生 + 大厂 PM 双视角）：
- 拆 JD = 拆需求文档
- 评简历 = 评审产品方案
- 复盘面试 = 复盘产品答辩

## 核心原则（CORE PRINCIPLE）

**非用户明确说明的技术架构决策，一律按「长期主义 + 一步到位」执行**：直接做最终形态，不写"先上线再迁移"的桥接、不留半成品脚手架、不并置多套单一真相（如两份 prompt / 双 DB 后端）。凡用户没有明确说「先用 X / 先跑通」，默认选长期正确的那一项，一步到位做好；删死代码、合并多套实现到唯一来源。变更仍遵守破坏性 / 删前确认护栏。

产品面向**国内校招用户**，故基础架构以**国内数据落地**为最终形态（国内数据库 + 国内认证），不选用海外免费方案的"先跑通再迁"路径。

## 四大能力

| 能力 | 形态 | prompt 链 |
|---|---|---|
| JD 拆解 | 一次性结构化输出 | 3 节点（岗位识别 → 需求拆解 → 考点预测+应届校准） |
| 简历拆解 | 一次性结构化 + 逐段改写对话 | 4 节点（结构化 → 关键词匹配 → 逐模块诊断+JD对照gap → 汇总） |
| 面试准备 | 对话式面试前准备 | streamText + 8 个快捷能力（预测面试题 / 公司定向 / 概念辨析 / 场景分析 / 反问技巧 / 自我介绍 / HR面准备 / 薪资谈判） |
| 面试复盘 | 对话式逐题复盘 | streamText + 混合模式（逐题粘贴 / 模拟追问） |

> ⚙️ **新增第五能力时**触发 harness 收拢 STEP 2（能力注册表：{名字, system 拼法, 输入抽取, 输出格式}，加能力 = 加一行不动 run.js），见 [`docs/harness/verify.md`](docs/harness/verify.md)。

## 技术栈

- 前端：Next.js 16 App Router 包裹（`app/` 提供 `/api/*`、`/login`、分享页）；主界面为 Vite + React + TypeScript + AntD（`client/`，经 Next catch-all 挂载）
- 后端：Next.js Route Handlers（Node.js runtime）+ `pg`（node-postgres）原生参数化 SQL
- 数据库：PostgreSQL（Docker 自建，本机 OrbStack / 生产 ECS 同构 `db/docker-compose.yml`）；JSON 列用 `jsonb`
- 认证：**国内自有** `jose` HS256 JWT（httpOnly cookie `op_session`）+ `bcryptjs` 密码哈希；弃用 Supabase Auth / RLS
- AI：Vercel AI SDK（`ai` + `@ai-sdk/anthropic` / `@ai-sdk/openai` / `@ai-sdk/openai-compatible`），多模型可切换，`generateObject` + zod 强制 JSON 契约
- 文件解析：`unpdf`（PDF）+ `mammoth`（Word）+ `cheerio`（HTML）
- 流式：SSE（fetch streaming 消费，POST + header 透传）
- 分享：PostgreSQL `shares` 表持久化（短链，未登录可读）

## 目录结构

```
OfferPilot/
├── package.json            # Next 16 入口；dev/build/start/typecheck + build:client
├── proxy.ts                # 路由保护（Next 16 middleware 替代）：jose 校验 op_session，未登录跳 /login 或 401
├── app/                    # Next App Router 全栈
│   ├── api/                # 业务路由（analyze/chat/upload/share/auth/billing/pay/admin/folders/projects/history/invites/orders/payload/growth/model...）
│   ├── login/  register/  privacy/  terms/   # 无 JS 壳页（交给 client）
│   └── [[...path]]/        # catch-all：其他路径挂载 client 构建产物
├── client/                 # 前端 SPA（Vite + React + AntD），四 Tab + 设置 + 分享
├── lib/
│   ├── ai/                 # AI SDK 封装（providers/harness/schemaShape/jsonExtract/entitlements/sse/analytics/contentBoundary）
│   ├── auth/               # jwt.ts(jose 签/验) · password.ts(bcryptjs)
│   ├── db/                 # 原生 pg 数据层：pool/user/guards/credits/entitlement/auth(会话 cookie)
│   ├── kb/                 # 提示词知识库（jd/resume/interview/growth/base）+ 隔离加载
│   └── parsers.ts  id.ts   # 多格式解析 · id 生成
├── db/                     # 数据库自建 + 迁移脚本
│   ├── docker-compose.yml  # Docker 自建 PG16（127.0.0.1:5432，pgdata 卷，healthcheck）
│   ├── schema.sql          # 面向普通 PG 的建表 DDL（无 RLS/policy）
│   ├── apply.mjs           # 应用 schema.sql（幂等 create if not exists）
│   ├── migrate-auth.mjs    # 加 password_hash 列 + 从 auth.users 镜像 bcrypt 哈希
│   ├── verify.mjs          # 只读验收（8 表 + password_hash 列 + SKU 种子）
│   └── backup.sh restore.sh # pg_dump / psql 本机容器备份恢复
├── server/                 # 仅存历史数据：offer-pilot.db（旧 SQLite）+ share-store（Express 实现已于 2026-10-08 删除）
├── scripts/                # 校验脚本（test-knowledge-loader/multi-format/verify-knowledge-prod/harness-check）
└── docs/                   # prd.md · tech-architecture.md · harness/ · legal/
```

## 启动

### 1. 装依赖

```bash
cd OfferPilot
npm install                 # root（Next + libs）
cd client && npm install && cd ..   # Vite SPA
```

### 2. 配置环境变量（.env.local）

至少填：`DATABASE_URL`、`JWT_SECRET`、`DEFAULT_PROVIDER` + 一个 provider 的 key。

- `DATABASE_URL`：PostgreSQL 连接串（本地 Docker 自建 = `postgres://****@127.0.0.1:5432/offerpilot`；生产 = 自建容器或阿里云 RDS）
- `JWT_SECRET`：jose 签/验 HS256 会话 cookie 用（务必随机长串）
- `ADMIN_USERNAMES`：管理员邮箱白名单（逗号分隔，空=无人有权限）
- provider：`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `DOMESTIC_API_KEY`（智谱/通义/DeepSeek，OpenAI 兼容协议），`DEFAULT_PROVIDER` 决定默认

### 3. 初始化 / 迁移数据库

```bash
node db/apply.mjs            # 建表（幂等）+ SKU 种子
node db/migrate-auth.mjs     # 加 public.users.password_hash；有 auth.users 则镜像 bcrypt 哈希
node db/verify.mjs           # 只读验收：8 表 + password_hash 列 + SKU 种子
```

### 4. 启动

```bash
npm run dev
# Next（含 /api）：http://localhost:3000
```

浏览器打开 http://localhost:3000 即可使用。`npm run build` = `build:client && next build`（Vite 产物由 Next catch-all 托管）。

## 双轨制 Key

- 默认读服务端 `.env`
- 前端「模型配置」面板可覆盖（Provider / API Key / Base URL / Model），覆盖值存 localStorage，随请求 header 透传（`x-provider` / `x-api-key` 等）
- 覆盖时不影响服务端 `.env`，纯本机覆盖

## 模型状态三态（顶栏）

顶栏状态标签实时反映**生效配置**（前端覆盖 > 服务端 `.env`）：
- 🟢 模型已配置 —— 探测通过
- 🔴 模型未配置 —— 完全没填 key
- 🟠 模型配置出错了 —— 填了但用不了（Key 错 / 网关不通 / 配额不足）

探测走 `POST /api/model/check`：1-token 最小调用 + 15s 超时；启动与保存设置后自动重探。标签可点击直达「模型配置」面板，hover 显示具体错误。

## 硬约束（不可违背）

- **知识库隔离**：所有路由必须通过 `lib/kb/base.ts`（loader）加载提示词，禁止直接 import `lib/kb/jd.ts` / `resume.ts` / `interview.ts` / `growth.ts` 等业务模块。
  - 验证：`node scripts/test-knowledge-loader.js`（自动检查 + 导出完整性校验）
  - 部署前门禁：`node scripts/verify-knowledge-prod.js`（生产模式解密后函数 / zod / analyze 全链验证，需 `KNOWLEDGE_KEY`）
  - 或：`grep -r "from \"@/lib/kb/jd\"" app lib --include='*.ts'` → 除 `lib/kb/base.ts` 外必须空输出
- **多格式上传**：`/api/upload` 支持 PDF、Word(.docx)、HTML、Markdown(.md)、TXT 五种格式解析。
  - 验证：`node scripts/test-multi-format.js`（5 格式提取 + MIME→extension 回退）

## JD ↔ 简历 对照（核心关系）

JD 拆解和简历拆解**不是彼此独立**——简历拆解以 JD 拆解结果为**对照基准**：
1. **JD 拆解** → 结果存 store（岗位画像 / 硬性要求 / 软素质 / 筛选优先级 / 关键词 / 应届校招校准）
2. **简历拆解** → 自动读**完整 JD 拆解结果**作对照基准，逐维度 gap 分析：
   - 关键词匹配（对照 JD 关键词清单）
   - **JD 对照 gap 分析**（对照硬性要求 / 软素质 / 筛选优先级，逐项标 满足/部分/缺失 + 简历证据 + 缺口）← 核心
   - 逐模块诊断、定位对照 JD 岗位定位
   - 简历摘要存 store
3. **面试复盘** → 自动读岗位画像 + 简历摘要 + 关键词作为上下文

简历拆解 Tab 顶部显示当前对照的 JD 基准；未拆解 JD 时降级为通用应届生标准（非对照模式）。切 Tab 即联动，无需手动复制。

## 分享链接

- 任意结果/对话可生成分享链接（`/share/<id>`）
- 对方无需登录、无需安装，只读查看
- 后端用本地文件存储（`server/data/share-store/<id>.json`）

## 混合模式（面试复盘）

- 默认 A：逐题粘贴（题目 + 你的回答 → 领航员复盘）
- 点「帮我想想还会问什么」切到 B：领航员基于岗位+简历生成 3-5 个可能追问题目（模拟面试官追问）

## 面试 Tab 顶栏

面试准备 / 面试复盘共用同一组件（`viewMode` 区分）与同一顶栏：Welcome 提示语左对齐，右侧同一行三个按钮（均 icon + 文字）：**一键分享 / 清空会话 / 历史会话**（历史会话带条数 badge，面板标题「历史会话」）。

## prompt 设计要点

见 `lib/kb/*.ts`，每个能力的分步链都在注释里。核心是：
- 共享底座注入 AI 策略 PM 人设 + 铁律（防 injection / 不编造 / 去虚词化 / 应届生特殊）
- 每步 `generateObject` + zod schema 强制 JSON 契约
- 推断标 `[推测]`、数据存疑标 `[需本人确认]`

## 国内上线（进行中）

- 部署：Next 16 托管 API + 主界面；Vite SPA 构建产物由 Next catch-all 托管。
- 数据库：Docker 自建 PostgreSQL（本机 OrbStack 跑通；生产 ECS 同 `db/docker-compose.yml` 或换阿里云 RDS）——`DATABASE_URL` 重指 + 数据拷贝；无查询层改动，只换连接串。
- 认证：国内自有 `jose` JWT + `bcryptjs`，不依赖 Supabase Auth / 邮件确认。
- 域名：面向国内需 ICP 备案（备案墙为产品核心原则，见上方 CORE PRINCIPLE）。

> 本地自用无需部署，`npm run dev` 即可；数据库已是本地 Docker 自建（见顶部状态）。
