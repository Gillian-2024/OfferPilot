# OfferPilot 验证清单

## 改代码前自检（三关）

1. `npm test` —— 服务端测试全绿（root 已挂 `cd server && node --test`，裸跑自动发现全部测试文件；`node --test test/` 目录参数会 MODULE_NOT_FOUND，勿改回）
2. `npm run check` —— 安全回归硬门禁 exit 0
3. `cd client && npx tsc --noEmit` —— 前端类型检查（**勿在 server/ 跑 npx tsc**，会拉到废弃 tsc@2.0.4 假 PASS）

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
