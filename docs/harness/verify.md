# OfferPilot 验证清单

## 改代码前自检（三关）

1. `node --test test/*.test.mjs` —— 单元测试全绿（用 glob；`node --test test/` 目录参数会 MODULE_NOT_FOUND）
2. `npm run typecheck` —— 根目录类型检查（Next 侧 `app/` `lib/`）
3. `cd client && npx tsc --noEmit` —— 前端类型检查

> 2026-10-08 Express 实现删除后，原 `npm test`（server/test）与 `npm run check`（harness-check 静态扫描）已随之失效；下方变更记录中的 `auth.js` / `index.js` 等文件名为 Express 时代历史。

## 安全收口变更记录（2026-08-29）

> 这批是 harness 载体的轻量变更记录（存量已实现无 spec，不伪造 spec）。后续新功能走 spec-first，不写在此表。

| 变更 | 修复什么 | 为什么 | 验收标准 |
|---|---|---|---|
| auth.js JWT_SECRET 无兜底启动失败 | 明文兜底密钥=公开密钥 | 任何人可伪造 token | 缺 JWT_SECRET 时启动抛错 |
| index.js 移除 cors | CORS 全开 → 第三方跨域调 API | 盗用 token / 刷接口 | 跨域请求无 ACAO 头 |
| index.js 全站限流 + 登录严限 | 无限流 → 撞库/滥用 | 暴力破解 | 登录连打超限 429 |
| chat.js 洞1 注入边界 | user 消息无边界 → 注入 system | prompt 注入 | user 消息被包 `<user-content>` |
| chat.js 洞2 登录态兜底落库 | 登录态流式结束不落库（客户端 debounce 会丢） | 历史丢失 | 登录态 chat/rewrite 完成自动写 history |
| history.js upsert 归属条件 | 裸 OR REPLACE → 覆盖他人 | 越权覆盖 | 他人同 id 提交不覆盖本人记录 |
| db/index.js prepared statement 缓存 | 瞬时 Statement 触发 Node24 断言崩溃 | 运行时稳定性 | 复用 getStatement 不崩 |
| client 全端点带 JWT | 前端接口缺鉴权头 | 登录态不生效 | 登录后请求带 Bearer token |

## 测试边界说明（2026-08-29）

- cors/ratelimit 测试构造**同样的中间件配置**验证行为（index.js 不导出 app、启动即 listen，不为此重构）；index.js 真实内容由 harness-check R2/R5 静态锁定。两层互补。
- chat 路由集成测试由 harness-check R4 静态断言承担（chat.js 顶层 loadKnowledge 依赖 .knowledge.enc，import 过重）；wrapUserContent 纯函数走单元测试。

## Harness 收拢计划状态（2026-08-30）

> 收拢计划三步：STEP 0 补洞 → STEP 1 抽 run.js → STEP 2 能力注册表。STEP 0/1 完成；STEP 2 按 onepaper 决策延期。

| 步骤 | 状态 | 说明 |
|---|---|---|
| STEP 0 安全补洞 | ✅ 完成（2026-08-29） | 见上方「安全收口变更记录」 |
| STEP 1 抽 `harness/run.js` | ✅ 完成（`f036116`） | 纯重构，三关全绿 |
| STEP 2 能力注册表 | ⏸️ 延期 | **触发条件：新增第五能力时**。把四能力登记成表 {名字, system 怎么拼, 输入怎么抽, 输出什么格式}，加第五能力 = 加一行，不动 run.js。现在不建 = 避免预先设计扩展点。 |
