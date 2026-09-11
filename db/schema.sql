-- OfferPilot 领航员 · 数据层初始化迁移 (P3 版本，面向国内 PG / 阿里云 RDS)
-- 移植自 server/src/db/index.js (better-sqlite3 → Postgres)；P5 起原生 pg 直连，不再走 PostgREST/RLS
-- 幂等可重跑；JSON 列用 jsonb。所有业务 id 为 TEXT（nanoid(12)）；analytics_events.id 自增 bigint
-- 建表顺序按外键依赖排：users → folders → projects → history → invites → analytics → skus → orders
-- 鉴权：jose 签/验 HS256 JWT 存 httpOnly cookie；密码 bcryptjs 存 users.password_hash（替代 Supabase Auth）

-- ============================================================
-- 1. users —— 用户档案 + 付费权益字段 + 登录凭证
--    id 由应用层生成（nanoid(12)）；username 存 email（沿用既有约定）；password 为弃用列，已移除
-- ============================================================
create table if not exists public.users (
  id               text primary key,
  username         text unique not null,
  password_hash    text not null default '',        -- bcrypt 哈希（jose 登录校验用）；旧 Supabase 迁移原样拷贝
  nickname         text,
  credits          integer      not null default 3,
  capabilities     jsonb        not null default '[]',
  plan_expires_at  bigint,                          -- epoch ms；null=无订阅
  created_at       bigint       not null,
  updated_at       bigint       not null
);

-- ============================================================
-- 2. folders —— 侧边栏文件夹
-- ============================================================
create table if not exists public.folders (
  id         text primary key,
  name       text not null default '默认',
  user_id    text not null references public.users(id) on delete cascade,
  sort_order integer not null default 0,
  created_at bigint not null
);

create index if not exists idx_folders_user on public.folders(user_id);

-- ============================================================
-- 3. projects —— 项目（可归属文件夹；history.project_id 引用它）
-- ============================================================
create table if not exists public.projects (
  id         text primary key,
  name       text not null,
  folder_id  text references public.folders(id) on delete set null,
  user_id    text not null references public.users(id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null
);

create index if not exists idx_projects_user   on public.projects(user_id);
create index if not exists idx_projects_folder on public.projects(folder_id);

-- ============================================================
-- 4. history —— 历史记录（JD/简历/面试 等分析产物）
-- ============================================================
create table if not exists public.history (
  id         text primary key,
  user_id    text not null references public.users(id) on delete cascade,
  type       text not null,
  title      text not null default '',
  data       jsonb not null default '{}',
  provider   text,
  model      text,
  project_id text references public.projects(id) on delete set null,
  created_at bigint not null
);

create index if not exists idx_history_user_type   on public.history(user_id, type);
create index if not exists idx_history_user_created on public.history(user_id, created_at desc);

-- ============================================================
-- 5. invites —— 邀请码（click_count 计点击）
-- ============================================================
create table if not exists public.invites (
  id          text primary key,
  code        text unique not null,
  user_id     text not null references public.users(id) on delete cascade,
  click_count integer not null default 0,
  created_at  bigint not null
);

create index if not exists idx_invites_user on public.invites(user_id);

-- ============================================================
-- 6. analytics_events —— 产品打点（原生 pg 写入；device_id 兜底匿名）
-- ============================================================
create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  device_id   text not null default '',
  user_id     text references public.users(id) on delete set null,
  event       text not null,
  path        text,
  extra       jsonb not null default '{}',
  ts          bigint not null,
  ua          text,
  screen      text,
  created_at  bigint not null
);

create index if not exists idx_analytics_device_ts on public.analytics_events(device_id, ts desc);
create index if not exists idx_analytics_event_ts  on public.analytics_events(event, ts desc);
create index if not exists idx_analytics_extra     on public.analytics_events(extra);

-- ============================================================
-- 7. skus —— SKU 定义 + 种子（数值按 2026-08 定价定稿）
-- ============================================================
create table if not exists public.skus (
  code          text primary key,
  name          text not null,
  price_cents   integer not null,
  credits       integer not null default 0,
  capabilities  jsonb   not null default '[]',
  duration_days integer,
  active        integer not null default 1,
  sort_order    integer not null default 0
);

insert into public.skus (code, name, price_cents, credits, capabilities, duration_days, active, sort_order)
values
  ('single',  '单次卡', 499,   1, '[]',          null, 1, 1),
  ('monthly', '月卡',   2900,  0, '["monthly"]', 30,   1, 2),
  ('jobpass', '求职通', 19900, 0, '["jobpass"]', null, 1, 3)
on conflict (code) do nothing;

-- ============================================================
-- 8. orders —— 订单（channel/out_trade_no 预留支付渠道字段）
-- ============================================================
create table if not exists public.orders (
  id           text primary key,
  user_id      text not null references public.users(id) on delete cascade,
  sku_code     text not null,
  amount_cents integer not null,
  status       text not null default 'pending',
  channel      text,
  out_trade_no text,
  created_at   bigint not null,
  paid_at      bigint
);

create index if not exists idx_orders_user on public.orders(user_id, created_at desc);

-- ============================================================
-- 9. shares —— 分享（原版文件 store，表持久）
--    select 公开（分享链接可被未登录访客打开）；insert 需登录且 user_id 归属本人
-- ============================================================
create table if not exists public.shares (
  id          text primary key,
  type        text not null default 'generic',
  title       text not null default 'OfferPilot 领航员分析报告',
  content     jsonb not null default '{}',
  user_id     text references public.users(id) on delete set null,
  created_at  bigint not null
);

create index if not exists idx_shares_created on public.shares(created_at desc);
