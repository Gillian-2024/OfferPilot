// Catch-all：用 Vite（client/dist）构建的 SPA 兜底 /、/share/:id、/history、/admin 等非 /api、非 /login 的路由。
// 服务静态文件 + SPA fallback（不存在的路径回 index.html）。/api/* 与 /login 由更具体的路由优先匹配。
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIST = path.join(process.cwd(), "client", "dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

export async function GET(_req: NextRequest, ctx: any) {
  const raw = await ctx.params;
  const parts: string[] = Array.isArray(raw?.path) ? raw.path : [raw?.path].filter(Boolean);
  const rel = parts.filter(Boolean).join("/") || "index.html";
  let filePath = path.join(DIST, rel);

  // 防路径穿越：解析后必须仍在 DIST 之下，否则回退 index.html
  if (!filePath.startsWith(DIST)) filePath = path.join(DIST, "index.html");

  try {
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const isHtml = ext === ".html";
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        // Vite 产物带 hash 可长缓存；index.html 与无 hash 的 html 不缓存，避免发版后旧页面
        "Cache-Control": isHtml ? "no-cache" : "public, max-age=31536000, immutable",
      },
    });
  } catch {
    // SPA fallback——路由在客户端处理
    const index = await fs.readFile(path.join(DIST, "index.html"));
    return new NextResponse(index, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  }
}
