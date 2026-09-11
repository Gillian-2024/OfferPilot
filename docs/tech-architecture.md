# OfferPilot 领航员 — 技术实现（当前架构）

> 状态：**已迁移 · 面向国内上线**（2026-09-08）
> 早期「Vite+Express+localStorage」与「Next+Supabase+RLS」蓝图已被**原生 PostgreSQL + 国内自有 JWT** 取代。本文反映现库真实结构，Supabase 方案仅留作历史备注（见文末）。
> 产品定位/能力见 [`prd.md`](prd.md)。

---

## 1. 架构总览

```
┌─ Next.js 16 App Router（Node.js runtime）──────────────┐
│  proxy.ts            路由保护（jose 验 op_session cookie）│
│  app/api/*           Route Handlers（原生 pg 参数化 SQL） │
│  app/[[...path]]     catch-all → 挂载 Vite SPA 构建产物   │
└──────────────┬─────────────────────────────────────────┘
               │  node:postgres (pg)
┌──────────────▼─────────────────────────────────────────┐
│  PostgreSQL（Docker 自建：本机 OrbStack + ECS 同构/或 RDS）│
│  users / folders / projects / history / invites         │
│  analytics_events / skus / orders / shares              │
│  无 RLS：所有行级隔离在 SQL 里显式 WHERE user_id = $1     │
└─────────────────────────────────────────────────────────┘
               ▲
┌──────────────┴─────────────────────────────────────────┐
│  认证：jose HS256 JWT（cookie op_session）+ bcryptjs     │
│  AI：Vercel AI SDK 多模型（glm-5.2 等）+ generateObject │
└────────────────────────────────────────────────────────┘
```

**一句话**：数据层弃用 PostgREST / RLS / Supabase Auth，改用 `pg` 原生参数化 SQL + `jose` 自签 JWT + `bcryptjs`；数据库换到国产 PG（Docker 自建 / 阿里云 RDS）只改连接串，无查询层改动。

---

## 2. 数据模型（schema.sql §1–§9）

全部业务 id 为 `text`（`nanoid(12)`）；`analytics_events.id` 自增 `bigint`。JSON 列用 `jsonb`。

| 表 | 主键 | 关键字段 | 说明 |
|---|---|---|---|
| users | id | username(存email, unique), **password_hash**(bcrypt), nickname, credits, capabilities(jsonb), plan_expires_at | 权益+登录凭证合一 |
| folders | id | name, user_id, sort_order | 侧边栏文件夹 |
| projects | id | name, folder_id, user_id | 项目/文件夹归属 |
| history | id | user_id, type, title, data(jsonb), provider, model, project_id | 分析产物 |
| invites | id | **code(unique)**, user_id, click_count | 邀请码+点击数 |
| analytics_events | id | device_id, user_id, event, path, extra(jsonb), ts, ua, screen | 打点 |
| skus | id(code) | name, price_cents, credits, capabilities(jsonb), duration_days, active, sort_order | 3 种子：single/monthly/jobpass |
| orders | id | user_id, sku_code, amount_cents, status, channel, out_trade_no, paid_at | 订单 |
| shares | id | type, title, content(jsonb), user_id, created_at | 分享短链 |

> **无 RLS**：弃用 Supabase 行级授权，行隔离在业务 SQL 显式 `WHERE user_id = $1`。见 §5 各路由做法。

---

## 3. 认证（jose + bcryptjs）

- **会话 cookie**：`op_session`（httpOnly / sameSite lax / secure(prod) / maxAge 30d），载荷 `{ userId, email }`，`jose` HS256 签名（`JWT_SECRET`）。
- **密码**：`bcryptjs` 哈希存 `users.password_hash`；兼容 Supabase `auth.users.encrypted_password` 的 `$2a/$2b/$2y`，可原样镜像。
- **密钥映射**：JWT 载荷 key 为 `userId`；应用层 `getAppUser`/`ensureAppUser` 期望 `{ id, email? }` → 数据层读取处做一次映射 `{ id: session.userId, email }`。
- **路由保护**：`proxy.ts` 校验 cookie；非公共路径未登录 → API 返 401 JSON / 页面跳 `/login`；守卫 `lib/db/guards.ts`（`requireAuthRoute` / `requireAdminRoute`，管理员 = `ADMIN_USERNAMES` 白名单）。
- **公共路径**（免登）：`/api/auth/*`、`/api/billing/skus`、`/api/analytics/batch`、`/api/share/:id GET`、`/share/*`、`/login`、`/register`、`/privacy`、`/terms`。
- 认证路由：`/api/auth/{login,register,me,logout}`（无邮件确认，注册即写 `password_hash`）。

---

## 4. 数据层（原生 pg）

- `lib/db/pool.ts`：`pg` 连接池单例 `getPool()` + `q<T>` / `qOne<T>` 封装；`PGSSL=disable` 可关 ssl（本地 Docker PG 无 SSL 时置 `disable`；生产 RDS 用 `require` 或删除该行）。
- **写 JSON 列**：payload `JSON.stringify` + `::jsonb` 强转；pg 读回为对象。
- **迁移脚本（`db/`）**：
  | 脚本 | 作用 | 幂等 |
  |---|---|---|
  | `docker-compose.yml` | Docker 自建 Postgres 16（`127.0.0.1:5432`，`pgdata` 卷，healthcheck） | ✅ |
  | `schema.sql` | 建表 DDL（`create table if not exists`）+ SKU 种子（`on conflict do nothing`） | ✅ |
  | `apply.mjs` | 应用 schema.sql + 8 表/SKU 自检 | ✅ |
  | `migrate-auth.mjs` | 加 `users.password_hash` 列；有 `auth.users` 则镜像 bcrypt 哈希；报告无哈希用户 | ✅ |
  | `verify.mjs` | 只读验收：8 表 count + password_hash 列 + SKU 种子 | ✅（只读）|
  | `backup.sh` / `restore.sh` | `pg_dump`/`psql` 本机容器备份恢复（cron 示例见脚本头） | ⏭️ 手动 |
- 脚本从 `.env.local` 按行读 `DATABASE_URL`，不经 shell source，避免特殊字符被 zsh 展开。

---

## 5. 行级隔离做法（替代 RLS）

| 场景 | 做法 |
|---|---|
| 用户自己的行 | `WHERE user_id = $1`（user 传 `appUser.id`）|
| 邀请码跨用户唯一 | `SELECT user_id FROM invites WHERE code=$1`；被他人占用→409 |
| 订单/历史/项目/文件夹 | 一律 `user_id = $1` + 排序+limit |
| 公开读 | 仅 `skus(active=1)`、`shares(id)`、`analytics/batch`（匿名埋点）不加 user 条件 |
| 管理端 | 单一 LEFT JOIN 聚合并按白名单 `isAdmin` 守卫 |

---

## 6. 部署（国内上线）

- **Next 16** 托管 API + 主 UI；Vite SPA `build:client` 产物由 catch-all 托管。
- **数据库**：Docker 自建 PostgreSQL（本机 OrbStack + 生产 ECS 同构 `db/docker-compose.yml`）——用 `db/.env` 的 `POSTGRES_*` + 端口仅绑 `127.0.0.1`；生产可换阿里云 RDS，纯连接串更换 + 数据拷贝；无查询层改动。
- **认证**：国内自有 jose JWT + bcryptjs，不依赖 Supabase Auth。
- **域名**：面向国内需 ICP 备案（备案墙 = 产品核心原则）。

---

## 7. 当前状态 / 下一步

- ✅ **已跑通（2026-09-09）**：数据层全路由切原生 `pg`（23 文件/54 查询点）；`jose` 认证贯穿 proxy/guards/auth（17 认证点）；`@supabase/*` 依赖移除；schema.sql 改普通 PG（无 RLS）；tsc `--noEmit` 干净（exit 0）。
- ✅ **本地数据库已就绪**：Docker 自建 Postgres 16（OrbStack），`db/apply → migrate-auth → verify` 全绿；`PGSSL=disable` 适配本地无 SSL 容器。`npm run dev` 启动无错，`/login` 200，注册接口 200（bcrypt 60 字符落 `password_hash`，积分 `credits` 默认 3）。
- 🔜 **待办**：#20 国内合法上线链路（备案/域名）；生产 DB 实例（ECS 自建 `db/docker-compose.yml` 或阿里云 RDS）+ 数据拷贝。

---

## 附：Supabase 方案（已废弃，仅历史）

早期蓝图（Vite+Express+localStorage；及 Next+Supabase+RLS+Supabase Auth+邮件确认）已被上文本地 JWT + RDS 方案取代。弃用原因：面向国内数据落地（国内库+国内认证），Supabase 海外免费方案属"先跑通再迁"路径，与「长期主义+一步到位」原则相悖。所需 `auth.users.encrypted_password` 的 bcrypt 哈希已由 `migrate-auth.mjs` 镜像到 `users.password_hash`。
