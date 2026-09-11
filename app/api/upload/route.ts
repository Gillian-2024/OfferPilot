// POST /api/upload —— 上传文件解析为文本（PDF/docx/html/txt），API Key 不暴露。
// 移植自 server/src/routes/upload.js。Next 用 Web FormData 读文件（无需 multer）。
// body: multipart/form-data, field: file
import { NextRequest } from "next/server";
import { requireAuthRoute, toRouteError } from "@/lib/db/guards";
import { parseFile } from "@/lib/parsers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireAuthRoute(req);

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return Response.json({ error: "请求不是 multipart/form-data" }, { status: 400 });
    }
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return Response.json({ error: "缺少 file 字段" }, { status: 400 });
    }

    try {
      const buffer = await file.arrayBuffer();
      const text = await parseFile(buffer, file.type, file.name);
      if (!text || text.length < 10) {
        return Response.json(
          { error: "解析结果为空或过短，可能文件内容缺失、是扫描件（需 OCR，暂不支持）或格式异常" },
          { status: 400 }
        );
      }
      return Response.json({ text, name: file.name, size: file.size, chars: text.length });
    } catch (e) {
      console.error("[upload] error:", (e as Error).message || e);
      return Response.json({ error: (e as Error).message || String(e) }, { status: 400 });
    }
  } catch (e) {
    return toRouteError(e);
  }
}
