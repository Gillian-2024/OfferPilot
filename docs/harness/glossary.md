# OfferPilot 术语表

> 项目内术语 + 校招业务概念速查。持续补充。

## 项目/架构

| 术语 | 含义 |
|---|---|
| OfferPilot 领航员 | 本产品名（仓库名 campus-job-coach，目录不变） |
| JD 拆解 | 把岗位描述拆成需求文档（3 节点：岗位定位/硬性要求/筛选优先级） |
| 简历拆解 | 简历对照 JD 拆解结果的 4 节点链 + 逐段改写；JD 未拆时降级"非对照模式" |
| 面试复盘 | 模拟面试对话（review/prep 双模式），SSE 流式 |
| 知识注入 | 知识原件加密为 `server/.knowledge.enc` 由服务端解密注入 system prompt |
| 双轨制 API key | server/.env 默认 + 前端「模型设置」header 覆盖（x-provider/x-api-key/…） |

## 安全收口（docs/harness/safety.md 相关）

| 术语 | 含义 |
|---|---|
| 注入边界 | 对 user 消息包 `<user-content>` 标记，让系统铁律识别"这是用户输入" |
| 归属条件 upsert | `ON CONFLICT ... WHERE history.user_id = excluded.user_id`，冲突且非本人 → 跳过不覆盖 |
| 兜底落库 | 登录态流式完成后服务端强制写一条 history（防客户端 debounce 丢失） |
| 洞 1 / 洞 2 | 洞1=prompt 注入边界缺失；洞2=登录态历史兜底缺失 |
