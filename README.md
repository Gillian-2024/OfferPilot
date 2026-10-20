# OfferPilot 领航员

> **状态：暂停开发**（2026-10-08 起）。架构为 Next.js 16 + Vite SPA + 原生 PostgreSQL + 自有 JWT，本地可完整运行。
> - 新手部署：见 [从 GitHub SSH 拉取到独立网站 SOP](docs/guides/deploy-from-github-sop.md)
> - 产品定位与能力：见 [`docs/prd.md`](docs/prd.md)
> - 技术实现 / 表结构 / 迁移脚本：见 [`docs/tech-architecture.md`](docs/tech-architecture.md)
> - 数据库：Docker 自建 PostgreSQL（`db/docker-compose.yml`，本机与服务器同构）。

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
- AI：Vercel AI SDK（`ai` + `@ai-sdk/anthropic` / `@ai-sdk/openai` / `@ai-sdk/openai-compatible`），多模型可切换；结构化输出走 `generateText` + prompt 内 schema 骨架 + `extractAndParse`（zod 校验），不依赖模型 tool_use
- 文件解析：`unpdf`（PDF）+ `mammoth`（Word）+ `cheerio`（HTML）
- 流式：SSE（fetch streaming 消费，POST + header 透传）
- 分享：PostgreSQL `shares` 表持久化（短链，未登录可读）

## 目录结构

```
OfferPilot/
├── package.json            # Next 16 入口；dev/build/start/typecheck + build:client
├── proxy.ts                # 路由保护（Next 16 middleware 替代）：页面全部放行，仅 /api/* 校验 op_session，未登录返回 401
├── app/                    # Next App Router 全栈
│   ├── api/                # 业务路由（analyze/chat/upload/share/auth/billing/pay/admin/folders/projects/history/invites/orders/payload/growth/model...）
│   ├── login/              # 独立登录页（站内主入口是 SPA 的登录/注册弹窗）
│   └── [[...path]]/        # catch-all：其他路径（含 /privacy /terms）挂载 client 构建产物
├── client/                 # 前端 SPA（Vite + React + AntD），四 Tab + 设置 + 分享
├── lib/
│   ├── ai/                 # AI SDK 封装（providers/harness/schemaShape/jsonExtract/entitlements/sse/analytics/contentBoundary）
│   ├── auth/               # jwt.ts(jose 签/验) · password.ts(bcryptjs)
│   ├── db/                 # 原生 pg 数据层：pool/user/guards/credits/entitlement/auth(会话 cookie)
│   ├── kb/                 # 提示词（base 共享底座 + jd/resume/interview/growth 各能力分步链）
│   └── parsers.ts  id.ts   # 多格式解析 · id 生成
├── db/                     # 数据库自建 + 迁移脚本
│   ├── docker-compose.yml  # Docker 自建 PG16（127.0.0.1:5432，pgdata 卷，healthcheck）
│   ├── schema.sql          # 面向普通 PG 的建表 DDL（无 RLS/policy）
│   ├── apply.mjs           # 应用 schema.sql（幂等 create if not exists）
│   ├── migrate-auth.mjs    # 加 password_hash 列 + 从 auth.users 镜像 bcrypt 哈希
│   ├── verify.mjs          # 只读验收（8 表 + password_hash 列 + SKU 种子）
│   └── backup.sh restore.sh # pg_dump / psql 本机容器备份恢复
├── deploy/                 # 服务器部署：deploy.sh（幂等）· nginx.conf · offerpilot.service · 生产 env 模板
├── scripts/pack.sh         # 本机打包 deploy.zip（构建 client/dist + 敏感文件检查）
├── test/                   # 单元测试（node:test）
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
- provider：按需填一家的 key，`DEFAULT_PROVIDER` 决定默认。国产：`ZHIPU_API_KEY`（+ `ZHIPU_BASE_URL` / `ZHIPU_MODEL`，线上默认）、`DEEPSEEK_API_KEY`、`TONGYI_API_KEY`、`MOONSHOT_API_KEY`、`DOUBAO_API_KEY`、`MINIMAX_API_KEY`；海外：`ANTHROPIC_API_KEY`（+ `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL`）、`OPENAI_API_KEY`、`GOOGLE_API_KEY`。完整清单见 `lib/ai/config.ts`

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

- **提示词单一来源**：各能力的 system prompt 与分步链只在 `lib/kb/*.ts` 定义，路由直接 import 对应模块（如 `app/api/analyze` → `lib/kb/jd`、`lib/kb/resume`）；不在路由内另写 prompt。
- **多格式上传**：`/api/upload` 支持 PDF、Word(.docx)、HTML、Markdown(.md)、TXT 五种格式解析（实现见 `lib/parsers.ts`）。
- **提交前**：根目录 `npm run typecheck` + `cd client && npx tsc --noEmit` + `node --test test/*.test.mjs` 全过。

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
- 存于 PostgreSQL `shares` 表

## 混合模式（面试复盘）

- 默认 A：逐题粘贴（题目 + 你的回答 → 领航员复盘）
- 点「帮我想想还会问什么」切到 B：领航员基于岗位+简历生成 3-5 个可能追问题目（模拟面试官追问）

## 面试 Tab 顶栏

面试准备 / 面试复盘共用同一组件（`viewMode` 区分）与同一顶栏：Welcome 提示语左对齐，右侧同一行三个按钮（均 icon + 文字）：**一键分享 / 清空会话 / 历史会话**（历史会话带条数 badge，面板标题「历史会话」）。

## prompt 设计要点

见 `lib/kb/*.ts`，每个能力的分步链都在注释里。核心是：
- 共享底座注入 AI 策略 PM 人设 + 铁律（防 injection / 不编造 / 去虚词化 / 应届生特殊）
- 每步 zod schema 定义 JSON 契约，schema 骨架注入 prompt，输出经 `extractAndParse` 校验
- 推断标 `[推测]`、数据存疑标 `[需本人确认]`

## 部署

- 形态：单机 Nginx（HTTPS）→ `next start`（127.0.0.1:3000，systemd `offerpilot`）+ 同机 Docker PostgreSQL（仅绑 127.0.0.1）。
- 流程：本机 `bash scripts/pack.sh` 生成 `deploy.zip` → 上传服务器解压 → `bash deploy/deploy.sh`（幂等：起 PG → 迁移 → `next build` → 重启服务）。服务器不拉 git，只推 git 不会上线。
- 数据库换 RDS 只改 `DATABASE_URL`，无查询层改动。
- 面向国内正式收费上线需 ICP 备案与经营主体，见 `docs/tech-architecture.md`。

> 本地自用无需部署，`npm run dev` 即可。
