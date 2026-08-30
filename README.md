# OfferPilot 领航员

> **状态：WIP · 进行中**（2026-08-23）
> 当前为端到端跑通的 MVP（Vite + Express + localStorage），正在迁移到 Next.js + Supabase + Vercel 上线全栈架构。
> - 产品定位与能力：见 [`docs/prd.md`](docs/prd.md)
> - 迁移施工蓝图（P1-P7 路线图）：见 [`docs/tech-architecture.md`](docs/tech-architecture.md)
> 下方「技术栈 / 部署」描述的是**当前 MVP**，迁移完成后会更新。

面向应届生校招的求职辅助应用，核心人设 **AI 策略 PM**（应届生 + 大厂 PM 双视角）：
- 拆 JD = 拆需求文档
- 评简历 = 评审产品方案
- 复盘面试 = 复盘产品答辩

## 四大能力

| 能力 | 形态 | prompt 链 |
|---|---|---|
| JD 拆解 | 一次性结构化输出 | 3 节点（岗位识别 → 需求拆解 → 考点预测+应届校准） |
| 简历拆解 | 一次性结构化 + 逐段改写对话 | 4 节点（结构化 → 关键词匹配 → 逐模块诊断+JD对照gap → 汇总） |
| 面试准备 | 对话式面试前准备 | streamText + 8 个快捷能力（预测面试题 / 公司定向 / 概念辨析 / 场景分析 / 反问技巧 / 自我介绍 / HR面准备 / 薪资谈判） |
| 面试复盘 | 对话式逐题复盘 | streamText + 混合模式（逐题粘贴 / 模拟追问） |

> ⚙️ **新增第五能力时**触发 harness 收拢 STEP 2（能力注册表：{名字, system 拼法, 输入抽取, 输出格式}，加能力 = 加一行不动 run.js），见 [`docs/harness/verify.md`](docs/harness/verify.md)。

## 技术栈

- 前端：React + Vite + TypeScript + Ant Design + React Router
- 后端：Node.js + Express（ESM）
- AI：Vercel AI SDK（`ai` + `@ai-sdk/openai` / `@ai-sdk/anthropic` / `@ai-sdk/openai-compatible`），多模型可切换，`generateObject` + zod 强制 JSON 契约
- 文件解析：`unpdf`（PDF）+ `mammoth`（Word）+ `cheerio`（HTML）
- 流式：SSE（fetch streaming 消费，POST + header 透传）
- 存储：浏览器 localStorage（结果 + 对话 + 设置，无后端数据库）
- 分享：后端轻量文件存储 + 短链

## 目录结构

```
OfferPilot/
├── package.json            # root：concurrently 同时跑前后端
├── .env.example
├── server/                 # 后端
│   └── src/
│       ├── index.js        # Express 入口
│       ├── providers/      # 多模型 Provider 工厂（AI SDK 统一）
│       ├── parsers/        # 文件解析（PDF/Word/HTML/TXT/Markdown）
│       ├── prompts/        # 分步 prompt 链 + zod schema
│       │   ├── base.js     # 共享 System 底座（AI 策略 PM 人设）
│       │   ├── jd.js       # JD 拆解 3 节点
│       │   ├── resume.js   # 简历拆解 4 节点 + 改写
│       │   └── interview.js# 面试复盘 system + 混合模式
│       ├── routes/         # analyze/chat/upload/share/model(配置探测)
│       ├── store/          # 分享存储
│       └── utils/          # config(双轨制) + sse
└── client/                 # 前端
    └── src/
        ├── api/            # API client + SSE 流消费
        ├── store/          # localStorage + 四 Tab 联动
        ├── types/          # JSON 契约类型
        ├── components/     # Layout / Settings / shared / 四 Tab
        └── pages/          # SharePage
```

## 启动

### 1. 装依赖

```bash
cd OfferPilot
npm run install:all   # 装 server + client 依赖
npm install          # 装 root 的 concurrently
```

### 2. 配置 API Key

```bash
cp .env.example server/.env
# 编辑 server/.env，至少填一个 provider 的 key
```

支持三个 provider，任选其一（也可在前端「模型配置」面板覆盖）：
- `openai`：`OPENAI_API_KEY`
- `claude`：`ANTHROPIC_API_KEY`
- `domestic`：`DOMESTIC_API_KEY`（智谱/通义/DeepSeek，OpenAI 兼容协议）

`DEFAULT_PROVIDER` 决定默认用哪个。

### 3. 启动

```bash
npm run dev
# 前端：http://localhost:5173
# 后端：http://localhost:8787
```

浏览器打开 http://localhost:5173 即可使用。

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

- **知识库隔离**：所有路由必须通过 `knowledge-loader.js` 加载提示词，禁止直接 import `prompts/*.js`。
  - 验证：`node scripts/test-knowledge-loader.js`（自动检查 + 导出完整性校验）
  - 或：`grep -r "from '../prompts/" server/src/routes/` → 必须空输出
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

见 `server/src/prompts/*.js`，每个能力的分步链都在注释里。核心是：
- 共享底座注入 AI 策略 PM 人设 + 铁律（防 injection / 不编造 / 去虚词化 / 应届生特殊）
- 每步 `generateObject` + zod schema 强制 JSON 契约
- 推断标 `[推测]`、数据存疑标 `[需本人确认]`

## 生产部署（可选）

```bash
cd client && npm run build   # 产物在 client/dist
cd ../server && npm start    # 后端自动托管 client/dist
# 访问 http://localhost:8787
```

仅本地自用时无需部署，`npm run dev` 即可。
