# OfferPilot 安全约定（五条硬规则）

> 这五条是硬门禁（`npm run check`）保护的对象。每条 = 一次已修的真实漏洞。
> 改代码时若触碰对应区域，必须保持规则不被破坏；破坏即安全回归，禁止提交。

| # | 规则 | 保护对象 | 违反后果 |
|---|---|---|---|
| R1 | `auth.js` 的 `JWT_SECRET` 不得有兜底值（`process.env.JWT_SECRET \|\| '...'`）；缺则启动失败 | JWT 签名密钥 | 明文兜底=公开密钥，任何人可伪造任意用户 token |
| R2 | `index.js` 不得 import/use `cors` | CORS 关闭 | 开启 CORS → 第三方网页可跨域调 API 盗用用户 token |
| R3 | `history.js` 不得用裸 `INSERT OR REPLACE INTO history`；upsert 必须带 `WHERE history.user_id = excluded.user_id` | 归属条件 | 裸 OR REPLACE → 他人可提交同 id 覆盖你的历史 |
| R4 | `chat.js` 必须对 user 消息调用 `wrapUserContent`（包 `<user-content>` 边界） | prompt 注入边界 | 用户输入可注入 system 指令 |
| R5 | `index.js` 必须含 `rateLimit` 全站兜底 + `authLimiter` 挂载到 `/api/auth/login` + `/api/auth/register` | 限流 | 登录接口可被暴力破解 / 全站可被滥用 |

## 边界说明

- 这些是**已落地**的硬约束。将来若架构演进（如新增独立前端域名），CORS 需白名单改造——那时先更新本表 + harness-check R2 正则，再改代码。
- 部署到反向代理后需 `app.set('trust proxy', 1)`（见 index.js 注释），否则代理 IP 共享限流桶。
