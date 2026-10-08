# AGENTS.md — OfferPilot 领航员 项目宪法

> 面向 AI 协作的工程约定。知识内容保密铁律不在此文件（不在仓库任何被跟踪文件），仅存本机 memory。
> 引用请查阅 `docs/harness/`（术语表 / 安全约定 / 验证清单）。

## 项目一句话

应届生校招求职辅助 web app（AI 策略 PM 人设）。四大能力：JD 拆解 / 简历拆解 / 面试准备 / 面试复盘。
生产架构：Vite+Express+SQLite 国内云生产化（不迁 Next/Supabase/Vercel，2026-08-28 定）。

## 技术栈

- 前端：client/ React + Vite + AntD（TS）
- 后端：server/ Node Express ESM（type: module）+ better-sqlite3 + jose + bcryptjs
- 模型：Vercel AI SDK v7（`ai`），多 provider，默认走 server/.env
- 运行时：Node >= 24（prepared statement 缓存为 Node 24 兼容而存在，勿回退）

## 目录约定

| 路径 | 装什么 |
|---|---|
| `client/src/` | React 前端 |
| `docs/harness/` | 术语表 + 安全约定 + 验证清单 |
| `scripts/` | 根级工具脚本（pack.sh 部署打包） |
| `server/test/` | 服务端测试（Node 内置 node:test） |

## 关键命令（root package.json）

```bash
npm run dev            # 前后端并行（前端 5173 / 后端 8787）
npm run build          # client 构建
npm test               # 服务端测试（cd server && node --test test/）
cd client && npx tsc --noEmit   # 前端类型检查（勿在 server/ 跑 npx tsc，会拉到废弃 tsc@2.0.4）
```

## 工程约束（硬门禁）

- **提交前必须过**：根 `tsc --noEmit` + 前端 `tsc --noEmit`。
- **安全回归规则 R1-R5** 的约束对象已随 Express 实现移除；规则本身（JWT 无兜底 / 不开 CORS / user-content 边界 / upsert 带归属条件）仍适用于 `app/api/*` 与 `lib/`，见 docs/harness/safety.md。
- **测试门禁（B，渐进方向）**：后续每个服务端改动需带/更新测试，当前存量无测试阶段只要求新逻辑补测。
- **架构检查（C，渐进方向）**：dependency-cruiser 依赖方向检查等"真迁移再上"，本阶段不启用。

## 开发流程

- **存量修复**：改代码 → `tsc --noEmit` → 提交。
- **新功能**：spec-first（设计文档 → 实施计划）→ TDD（先红后绿）→ 测试 → 三关 → 提交。spec 落 `docs/superpowers/specs/`，计划落 `docs/superpowers/plans/`。
- **测试金字塔**：70% 单元 / 20% 集成 / 10% E2E。纯函数优先单元测，跨模块用集成测，全链路用 E2E（Playwright）。

## 安全五铁律（速查，详见 docs/harness/safety.md）

1. JWT_SECRET 无兜底（缺则启动失败）
2. CORS 关闭（无跨域合法流量）
3. user 消息必须包 `<user-content>` 注入边界
4. history upsert 必须带归属条件（不覆盖他人）
5. 全站限流 + 登录/注册严限

## 渐进演进

harness 是错误驱动的：规则从真实踩坑沉淀，不预建。新安全洞修复后 → 记入 safety.md / verify.md 变更记录。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
