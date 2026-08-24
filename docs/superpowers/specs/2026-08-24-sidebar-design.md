# Sidebar App Shell Design (方案 B v2)

- 日期:2026-08-24
- 状态:accepted
- 决策人:Gillian

## Y-Statement

In the context of OfferPilot's app shell evolution, facing the need to consolidate identity/model-config/history/project/invite management into a unified navigation layer, we decided on an inline-expanded sidebar with a "项目历史树" nav item that reveals project tree and recent sessions tabs within the sidebar itself (not a separate drawer), over single-column flat sidebar or external-drawer approach, to achieve clean IA that scales to future capabilities (+6 deepening items), accepting the cost of ~3 new files and one DB schema migration.

## Context

OfferPilot 当前是「顶部 header + 四大能力 Tab」单页结构，身份在头像下拉、模型配置是弹窗、历史是独立路由。用户需要更完善的导航外壳来容纳未来扩展（JD/简历/面试各做深方向 + 项目概念）。之前探索两套候选（A:紧凑单栏 / B:分段式双面板），选定 B 并迭代为侧边栏内展开方案：取消独立 Drawer，所有内容收在侧边栏自身内部展开区域。

## Decision

采用侧边栏内展开：一级侧边栏做轻量菜单（图标模式可收起），「项目历史树」点击后在侧边栏下方**内联展开**，包含「项目树管理 / 最近会话历史」Tab 分页。

## 数据流

### 状态管理（SidebarProvider Context）

```
用户点击 ☰ → SidebarContext.setOpen(true)
    ↓
Sidebar 滑入（Ant Drawer open）
    ↓
用户选择一级菜单项：
    ├─ 「项目历史树」  → setExpandedSection('project-history')
    │   └→ sidebar 底部展开区域出现 Tab [项目树管理 | 最近会话历史]
    ├─ 「模型配置」   → SettingsPanel.open = true
    ├─ 「邀请好友」   → InvitesDialog Modal 弹出
    └─ 头像下拉
        ├─ 「我的项目」 → setExpandedSection('project-history'), setHistoryTab('tree')
        ├─ 「设置」     → SettingsPanel.open = true
        └─ 「退出登录」 → auth.logout()
```

### 数据库变更

新建三表 + 扩展现有分析表：

| 表 | 字段 |
|---|---|
| `folders` | id, name, user_id, sort_order, created_at |
| `projects` | id, name, folder_id(nullable), user_id, created_at, updated_at |
| `invites` | id, code(unique), user_id, click_count, created_at |
| `analyses`（扩展） | ADD project_id → FK → projects.id (nullable) |

级联删除：`DELETE projects → CASCADE → analyses`（一个项目下所有分析记录随之清除）。

## 组件清单

### 新建

| 文件 | 职责 |
|---|---|
| `client/src/contexts/SidebarContext.tsx` | 面板开合、expanded section state、history tab state |
| `client/src/components/Sidebar/index.tsx` | 一级侧边栏菜单（身份区 + 导航区 + 底部区 + **内联展开区域**） |
| `client/src/components/Sidebar/InviteDialog.tsx` | 邀请码弹窗（Modal） |
| `server/src/routes/projects.ts` | 项目 CRUD API（POST/GET/PATCH/DELETE） |
| `server/src/routes/invite.ts` | 邀请码生成/校验 API |

**已删除的文件（v1→v2 移除）：**
- ~~`client/src/components/Sidebar/ProjectDrawer.tsx`~~ — 不再有独立 Drawer，改为 sidebar 内联展开

### 改造

| 文件 | 改动 |
|---|---|
| `App.tsx` | 包裹 SidebarProvider |
| `Layout/index.tsx` | 去身份区块、加 ☰ 触发器、调整 header/Tab 位置 |
| `api/client.ts` | 加 `/projects` `/invite` 方法 |
| `db/index.js` | 建 folders/projects/invites 表 + 扩 analyses |
| `types/index.ts` | 新增 Project/Folder/Invite 类型定义 |

### 不变

四大能力组件、SettingsPanel、AuthModal、HistoryPage 均不改动（暂保留 HistoryPage，后续评估是否精简）。

## 错误处理

| 场景 | 策略 |
|---|---|
| 项目 API 401 | AuthModal 弹出，提示「请先登录」 |
| 项目 API 5xx/超时 | message.error 提示，不阻断主流程 |
| 空名称重命名 | 前端 Form rule required 阻止发请求 |
| 项目名称 >50 字符 | 前端 maxlength=50 + Zod max(50) |
| 删除有记录的项目 | 后端 CASCADE 级联删，返回 deleted_count |
| 邀请码唯一性冲突 | 重试 3 次，仍失败则 warning |

## 测试策略

| 层 | 覆盖 |
|---|---|
| Playwright | ①☰ 打开侧边栏 ②点「项目历史树」→ 内联展开显示两个 Tab ③切 Tab 切换 ④模型配置弹出 ⑤未登录态鉴权 |
| Server test | projects CRUD + invite 生成 + 非法访问 401 |

验收标准：核心流程绿即过——打开侧边栏→展开项目历史树→管理项目。

## Consequences

- **正向**：统一导航入口、可扩展至未来 6+ 能力、项目概念使产品从工具升级为工作台；侧边栏内展开比独立 Drawer 更直觉、少一层交互
- **负向**：侧边栏内容多时需要滚动；~3 个新文件 + 3 张新表 + schema 迁移
- **后续触发的 ADR**：§6 三能力做深的 6 个功能项需基于新侧边栏重新规划入口

## Sources

- Ant Design Drawer + Tabs + Tree + Dropdown 组件模式
- CCDS: schema migrations first → data ops second
- Vercel AI SDK patterns: Context as state manager for UI shell
