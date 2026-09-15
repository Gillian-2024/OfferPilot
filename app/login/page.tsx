"use client";

// 登录 / 注册页。调用 /api/auth/login | /register，成功后整页跳转（cookie 生效 + SSR 重读会话）。
// P4 最小实现：纯表单、无 antd，后续 P5 再统一样式。
import { useState } from "react";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setErr("");
    setLoading(true);
    try {
      const r = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || "操作失败，请重试");
        setLoading(false);
        return;
      }
      if (d.requiresEmailConfirm) {
        setErr(d.message || "请查收确认邮件后再登录");
        setLoading(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setErr("无法连接服务器");
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <form
        onSubmit={submit}
        style={{ width: 320, display: "flex", flexDirection: "column", gap: 12 }}
      >
        <h1 style={{ margin: 0, fontSize: 22, textAlign: "center" }}>OfferPilot 领航员</h1>
        <p style={{ margin: 0, textAlign: "center", color: "#666", fontSize: 13 }}>
          {mode === "login" ? "登录你的求职助手" : "创建账号"}
        </p>

        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button type="button" onClick={() => { setMode("login"); setErr(""); }} style={{ cursor: "pointer" }}>
            登录
          </button>
          <button type="button" onClick={() => { setMode("register"); setErr(""); }} style={{ cursor: "pointer" }}>
            注册
          </button>
        </div>

        {/* 与 SPA 内 AuthModal 同口径：邮箱只作账号名，无邮箱找回能力。
            两个注册入口都要写明，否则用户在其中一个入口会得到错误预期。 */}
        {mode === "register" && (
          <p
            style={{
              margin: 0,
              padding: "8px 10px",
              background: "#f0f5ff",
              border: "1px solid #adc6ff",
              borderRadius: 6,
              color: "#333",
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            邮箱仅作为账号名使用。当前暂不支持通过邮箱找回密码，请妥善保管你的密码。
          </p>
        )}

        <input
          type="email"
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: 10, border: "1px solid #ddd", borderRadius: 6 }}
        />
        <input
          type="password"
          placeholder="密码（至少 6 位）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          style={{ padding: 10, border: "1px solid #ddd", borderRadius: 6 }}
        />

        {err && <p style={{ margin: 0, color: "#d33", fontSize: 13 }}>{err}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 10,
            borderRadius: 6,
            border: "none",
            background: "#1677ff",
            color: "#fff",
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "处理中…" : mode === "login" ? "登录" : "注册并登录"}
        </button>
      </form>
    </main>
  );
}
