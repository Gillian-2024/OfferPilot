# AGENTS.md — OfferPilot 领航员 项目宪法

> 面向 AI 协作的工程约定。知识内容保密铁律不在此文件（不在仓库任何被跟踪文件），仅存本机 memory。
> 引用请查阅 `docs/harness/`（术语表 / 安全约定 / 验证清单）。

## 项目一句话

应届生校招求职辅助 web app（AI 策略 PM 人设）。四大能力：JD 拆解 / 简历拆解 / 面试准备 / 面试复盘。
生产架构：Next.js 16 + Vite SPA + 原生 PostgreSQL + 自有 JWT，单机部署（2026-09-11 迁移完成；早期 Vite+Express+SQLite 已删除）。

## 技术栈

- 前端：`client/` React + Vite + AntD（TS），构建产物 `client/dist` 由 Next catch-all 托管
- 后端：`app/api/*` Next.js Route Handlers（Node runtime）+ `pg` 原生参数化 SQL + `jose` + `bcryptjs`
- 数据库：PostgreSQL 16（`db/docker-compose.yml`，仅绑 127.0.0.1）
- 模型：Vercel AI SDK v7（`ai`），多 provider，默认读根 `.env.local`
- 运行时：Node >= 22

## 目录约定

| 路径 | 装什么 |
|---|---|
| `app/api/` | 业务路由 |
| `lib/` | ai / auth / db / kb（提示词）/ parsers |
| `client/src/` | React 前端 |
| `db/` | schema + 幂等迁移脚本 + 备份恢复 |
| `deploy/` · `scripts/pack.sh` | 服务器部署与打包 |
| `test/` | 单元测试（Node 内置 node:test） |
| `docs/harness/` | 术语表 + 安全约定 + 验证清单 |

## 关键命令

```bash
npm run dev                      # Next（含 /api + SPA）：http://localhost:3000
npm run build                    # build:client && next build
npm run typecheck                # 根 tsc --noEmit
cd client && npx tsc --noEmit    # 前端类型检查
node --test test/*.test.mjs      # 单元测试（需 Node 22.6+ 直接加载 .ts）
```

## 工程约束（硬门禁）

- **提交前必须过**：根 `npm run typecheck` + 前端 `tsc --noEmit` + 单元测试。
- **安全回归规则**（JWT 无兜底 / 不开 CORS / user-content 边界 / history 写入带归属条件）适用于 `app/api/*` 与 `lib/`，见 docs/harness/safety.md（该表的文件名与 Express 时代一致，规则本身不变）。
- **测试门禁（B，渐进方向）**：后续每个服务端改动需带/更新测试，当前存量无测试阶段只要求新逻辑补测。
- **架构检查（C，渐进方向）**：dependency-cruiser 依赖方向检查等"真迁移再上"，本阶段不启用。

## 开发流程

- **存量修复**：改代码 → typecheck + 测试 → 提交。
- **新功能**：spec-first（设计文档 → 实施计划）→ TDD（先红后绿）→ 测试 → 三关 → 提交。spec 落 `docs/superpowers/specs/`，计划落 `docs/superpowers/plans/`。
- **测试金字塔**：70% 单元 / 20% 集成 / 10% E2E。纯函数优先单元测，跨模块用集成测，全链路用 E2E（Playwright）。

## 安全五铁律（速查，详见 docs/harness/safety.md）

1. JWT_SECRET 无兜底（缺则启动失败）
2. CORS 关闭（无跨域合法流量）
3. user 消息必须包 `<user-content>` 注入边界
4. history upsert 必须带归属条件（不覆盖他人）
5. 全站限流 + 登录/注册严限 —— ⚠️ **Next 迁移后未落地**：目前只有 `/api/analytics/batch` 有进程内限流，登录/注册无限流（Express 时代的 rateLimit 未移植）。重新上线前须补。

## 渐进演进

harness 是错误驱动的：规则从真实踩坑沉淀，不预建。新安全洞修复后 → 记入 safety.md / verify.md 变更记录。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
