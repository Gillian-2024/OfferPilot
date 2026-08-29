import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// 诊断报告导出 PDF / PNG（P2-3）：html2canvas 全量截图 + jsPDF A4 分页切片；一键保存 PNG 单张
// 选型理由：报告含彩色 chip / 卡片 / 雷达，截图比打印样式可预期；用户已拍板不用 window.print

/** 文件名净化：非法字符（含空白）→ _，去掉首尾 _，空则 unnamed */
export function sanitize(name: string): string {
  const cleaned = (name || '')
    .replace(/[\s\\/:*?"<>|]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .trim();
  return cleaned || 'unnamed';
}

/** 今天 YYYYMMDD（文件名日期戳，本地时区） */
export function todayStamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** 统一 PDF 文件名：OfferPilot_{岗位}_{报告类型}_{YYYYMMDD}.pdf */
export function reportFilename(jobName: string, type: string, d: Date = new Date()): string {
  return `OfferPilot_${sanitize(jobName)}_${type}_${todayStamp(d)}.pdf`;
}

interface ExportPdfOpts {
  /** 导出态 class：挂到 <html>（如 .pdf-exporting），供 CSS 隐藏交互元素；finally 移除 */
  exportClass?: string;
}

/* ── html2canvas 1.4.1 的 CSS Color 4 兼容层 ───────────────────────────
   global.css 的 color-mix() 被 Chrome 序列化为 color(srgb R G B / A)，
   html2canvas 的 color$1.parse 不认 color(...) → 直接抛「unsupported color function」，
   整份导出失败。canvas fillStyle 虽接受该字符串，但 getImageData 返回全透明黑
   （实测 [0,0,0,0]），故手动解析 sRGB 插值结果（color-mix 默认在 sRGB 空间插值，
   通道数直接映射）。项目无 oklch/lab 等其它现代函数字面量，只处理 color(srgb)。
   作用于 html2canvas 的 onclone 克隆（内联覆盖优先级最高，渲染读克隆样式即取 rgba），
   不改源 DOM、无需 restore。 */

/** 单个 color(srgb R G B [/ A]) 片段 → rgba(r,g,b,a)；非 srgb 或解析失败返回 null（保留原样） */
function resolveColor4(m: string): string | null {
  const g = /^color\(\s*srgb\s+([^/\s)]+)\s+([^/\s)]+)\s+([^/\s)]+)(?:\s*\/\s*([^)]+))?\s*\)$/.exec(m.trim());
  if (!g) return null;
  const num = (s: string) => (s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s));
  const r = num(g[1]);
  const gg = num(g[2]);
  const b = num(g[3]);
  const a = g[4] !== undefined ? num(g[4]) : 1;
  if ([r, gg, b].some((n) => Number.isNaN(n))) return null;
  const ch = (n: number) => Math.max(0, Math.min(255, Math.round(n * 255)));
  return `rgba(${ch(r)}, ${ch(gg)}, ${ch(b)}, ${Math.max(0, Math.min(1, a))})`;
}

/** 扫描节点子树：computed 值含 color(...)/var(...) 片段的属性，补内联解析值覆盖。
   color(srgb…) 由 resolveColor4 解析；SVG 呈现属性（fill/stroke/stop-color…）的
   getPropertyValue 会返回未解析的 var()，序列化成独立 SVG 文档时 var() 失效 → 用
   CSSStyleDeclaration 的 camelCase 属性访问器取解析后的 rgb() 写入内联。 */
function patchColor4InClone(el: HTMLElement): void {
  const win = el.ownerDocument?.defaultView;
  if (!win) return;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const COLOR_FN = /color\([^)]*\)/; // 检测（无 g，避免 lastIndex 状态）
  const COLOR_FN_G = /color\([^)]*\)/g; // 替换
  const VAR_FN = /var\(/;
  const toCamel = (p: string) => p.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const nodes: HTMLElement[] = [el, ...(Array.from(el.querySelectorAll('*')) as HTMLElement[])];
  for (const node of nodes) {
    const style = win.getComputedStyle(node);
    const isSvg = node.namespaceURI === SVG_NS;
    for (let i = 0; i < style.length; i++) {
      const prop = style.item(i);
      if (prop.startsWith('--')) continue;
      const val = style.getPropertyValue(prop);
      if (COLOR_FN.test(val)) {
        const fixed = val.replace(COLOR_FN_G, (m) => resolveColor4(m) ?? m);
        if (fixed !== val) node.style.setProperty(prop, fixed);
      } else if (isSvg && VAR_FN.test(val)) {
        // getPropertyValue 返回未解析的 var()，属性访问器给解析后的 rgb()
        const direct = (style as any)[toCamel(prop)];
        if (typeof direct === 'string' && direct && !VAR_FN.test(direct) && direct !== val) {
          node.style.setProperty(prop, direct);
        }
      }
    }
  }
}

/**
 * DOM 节点 → A4 多页 PDF。
 * 内容区 = A4 减 8mm 边距 → 宽 194mm × 高 281mm；整宽等比映射，逐页竖切。
 * 返回页数；异常向上抛（调用方 toast）。
 * 注：固定用默认渲染器（CanvasRenderer）。曾试 foreignObjectRendering 渲染离屏容器
 * （.pdf-export-report left:-9999px），实测双盲失效：SVG-as-image 沙箱不加载外部样式表，
 * 且元素负偏移被 ForeignObjectRenderer 的 translate + drawImage 双倍平移推出画布 → 空白。
 * 默认渲染器克隆整个文档、样式表正常加载，负偏移由内部 translate 补偿（JD/简历导出已验）。
 */
export async function exportNodeToPdf(node: HTMLElement, filename: string, opts: ExportPdfOpts = {}): Promise<number> {
  const { exportClass } = opts;
  if (exportClass) document.documentElement.classList.add(exportClass);
  try {
    // 等字体与导出态 settle，避免首帧空白/字体回退
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      windowWidth: Math.max(window.innerWidth, node.scrollWidth + 48),
      logging: false,
      // 兼容层：color-mix() 计算值序列化为 color(srgb …)，html2canvas 不认，克隆内补内联 rgba 覆盖
      onclone: (_doc, element) => patchColor4InClone(element),
    });

    const pxPerMm = canvas.width / 194; // 内容宽 194mm
    const pagePx = Math.floor(281 * pxPerMm); // 每页 281mm 高
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    let pages = 0;
    for (let y = 0; y < canvas.height; y += pagePx) {
      const sliceH = Math.min(pagePx, canvas.height - y);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      }
      if (pages > 0) doc.addPage();
      doc.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 8, 8, 194, (sliceH * 194) / canvas.width);
      pages += 1;
    }

    doc.save(filename);
    return pages;
  } finally {
    if (exportClass) document.documentElement.classList.remove(exportClass);
  }
}

/**
 * DOM 节点 → PNG 单张高清截图。
 * 使用与 PDF 相同的 color-mix / var() 兼容层（patchColor4InClone），确保所见即所得。
 * 文件名格式：OfferPilot_{岗位}_{报告类型}_{YYYYMMDD}.png
 */
export async function exportNodeToPng(node: HTMLElement, filename: string, opts: ExportPdfOpts = {}): Promise<void> {
  const { exportClass } = opts;
  if (exportClass) document.documentElement.classList.add(exportClass);
  try {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      windowWidth: Math.max(window.innerWidth, node.scrollWidth + 48),
      logging: false,
      onclone: (_doc, element) => patchColor4InClone(element),
    });

    // canvas.toDataURL('image/png') 直接导出无损 PNG
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename.replace(/\.pdf$/, '')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    if (exportClass) document.documentElement.classList.remove(exportClass);
  }
}
