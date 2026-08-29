# Harness 搭建设计文档

- 日期：2026-08-29
- 状态：proposed
- 路径：docs/superpowers/specs/2026-08-29-harness-design.md

## 1. 目标

给自己搭开发 harness——把"优秀项目的纪律"（架构、流程、质量、测试、护栏、上下文）放进代码库，变成可复用的模板 + 可验证的机制。双交付物：

1. **通用 harness skill**：抽成可复用模板，补进 `~/.claude/skills/AI-Native-Handbook/`，未来每个项目直接套
2. **OfferPilot 实搭验证**：在本项目实搭 harness，产出可复用的真实经验，反哺 skill

## 2. 四项约束（已与用户拍板）

| # | 决策 | 含义 |
|---|---|---|
| Q1 | **结构层解耦** | skill 里结构层 = DDD+Clean 通用原则 + 示例骨架，OfferPilot **本次不重构目录**（技术栈保留 Vite+Express+SQLite，08-28 国内云生产化路线不变） |
| Q2 | **轻量真跑** | 骨架文件 + 硬门禁脚本 + 挑一件已存在小改进走完整 SDD→apply→verify 循环，硬门禁真实触发至少一次；不造无谓功能 |
| Q3 | **载体 = 安全收口工作** | 工作树未提交的 11 文件安全/健壮性收口（零测试），作为 harness 介入对象 |
| Q4 | **硬门禁第一版 = A** | 安全回归规则（零依赖 node script 扫源码）；**B 测试门禁、C 工具化架构检查**记为后续渐进方向 |

## 3. 交付物一：通用 harness skill（AI-Native-Handbook）

### 3.1 形态

`~/.claude/skills/AI-Native-Handbook/harness-template/` 独立子目录，README 只加一行索引。不并入 74KB README 正文（防膨胀，且模板"可复制"属性优于成章）。

### 3.2 六组件模板

| # | 组件 | skill 里放什么 |
|---|---|---|
| 1 | **项目架构**（结构层） | DDD+Clean 混合架构通用原则 + 目录骨架示例（Adapter/Application/Domain/Infrastructure 四层）；明确"纯 CRUD 用传统分层，DDD 只用于核心域" |
| 2 | **SDD+TDD 流程** | 引用既有 OpenSpec 工作流（第 2 章）+ superpowers 三档 SDD + TDD 先红后绿 |
| 3 | **代码质量检查** | eslint/tsc 配置基准 + `npm run check` 约定 |
| 4 | **金字塔测试规则** | 70/20/10（单元/集成/E2E），AI 成熟度越高层级越低 |
| 5 | **架构护栏**（硬门禁层） | harness-check.js 模板（可复制的安全回归规则骨架）+ dependency-cruiser 示例（标注"真迁移再上"） |
| 6 | **上下文管理** | AGENTS.md + glossary + safety + verify 四件套模板 + 自检清单 |

### 3.3 自检清单

每项目套用后逐项核对：骨架文件就位？硬门禁能跑且 exit 0？测试能跑？新功能走 spec-first？

## 4. 交付物二：OfferPilot 实搭

### 4.1 骨架布局

```
campus-job-coach/
├── AGENTS.md                  ← 项目宪法（<150 行）：技术栈/目录约定/测试与硬门禁入口/渐进规则
├── docs/harness/
│   ├── glossary.md            ← 术语表：JD拆解/简历对照/面试复盘/安全收口相关术语
│   ├── safety.md              ← 安全约定：JWT强制/CORS关闭/注入边界/upsert归属/限流 五条硬规则
│   └── verify.md              ← 验证清单：改代码前自检（跑测试→harness-check→tsc）+ 安全收口变更记录
├── scripts/harness-check.js   ← 硬门禁：安全回归扫描（零依赖 node script）
└── server/test/               ← 安全收口测试（Node 内置 node:test，零新依赖）
```

全部入 git。AGENTS.md 只写工程约定，不碰知识内容（🔒 知识保密铁律只存 memory，不落仓库任何被跟踪文件）。

### 4.2 硬门禁：安全回归规则集（harness-check.js）

零依赖，`fs.readFileSync` + 正则扫源码。每条规则保护一次刚修的洞：

| # | 规则 | 保护修复 | 类型 |
|---|---|---|---|
| R1 | `auth.js` 不得出现 `JWT_SECRET` 兜底（`|| '`） | JWT 无明文兜底密钥 | 禁止 |
| R2 | `index.js` 不得 import/use `cors` | CORS 关闭（防第三方跨域调 API） | 禁止 |
| R3 | `history.js` 不得用裸 `INSERT OR REPLACE INTO history` | upsert 归属条件（不覆盖他人） | 禁止 |
| R4 | `chat.js` 必须调用 `wrapUserContent` | 洞1 注入边界（`<user-content>`） | 必须 |
| R5 | `index.js` 必须含 `rateLimit` + `authLimiter` | 全站限流 + 登录严限 | 必须 |

失败行为：`exit 1` + 逐条打印「哪条规则被违反 / 保护什么修复 / 可能的安全后果」。挂 `server/package.json` `"check": "node scripts/harness-check.js"`。

### 4.3 测试计划（server/test/）

Node 内置 `node:test`，零新依赖，临时 DB 文件隔离（不碰开发库）：

| 文件 | 测什么 |
|---|---|
| `auth.test.js` | JWT 签发/验证往返 · 无 `JWT_SECRET` 启动即抛错 · 未带 token 访问受保护端点 401 |
| `cors.test.js` | 带跨域 `Origin` 头请求 → 响应无 `Access-Control-Allow-Origin` |
| `ratelimit.test.js` | 登录接口连打超限 → 429 |
| `chat.test.js` | user 消息被包 `<user-content>` 边界（单测 `wrapUserContent` + 集成验证 chat 路由调用） |
| `history.test.js` | user B 提交同 id 数据，user A 记录不被覆盖（upsert 归属） |

**边界**：载体是"已实现未验证"代码 → 测试是**补测确认行为**（回归保护），非严格 TDD 先行；**新功能**才走严格 TDD。写进 verify.md。

### 4.4 执行流程

| 步骤 | 动作 | 验收 |
|---|---|---|
| 1 | 建骨架：AGENTS.md + docs/harness/ 四件套 | 四件套就位，AGENTS.md <150 行 |
| 2 | 补测试：server/test/ 五文件 | `node --test` 全绿 |
| 3 | 硬门禁：scripts/harness-check.js + `"check"` script | R1-R5 全过，`npm run check` exit 0 |
| 4 | verify：tsc --noEmit + 测试 + harness-check 三关 | 三关全绿 |
| 5 | 提交：两个 commit（① 安全收口已有改动 ② harness 骨架新文件） | 工作树 clean |
| 6 | 反抽 skill：六组件模板 → AI-Native-Handbook | skill 就位 |

**SDD 处理**：载体是已实现无 spec 的存量工作，不伪造 spec；在 verify.md 留**轻量变更记录**（这批安全收口修复什么、为什么、验收标准）。新功能才严格 spec-first。

## 5. 不做（YAGNI 边界）

- ❌ 不重构 OfferPilot 目录（Q1）
- ❌ 不一次性上测试门禁 / dependency-cruiser（Q4，记 B/C 为后续）
- ❌ 不为演练造新功能（Q2）
- ❌ 不碰知识内容 / 不把保密铁律写进仓库
