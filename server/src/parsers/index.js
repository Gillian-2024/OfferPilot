import { extractText } from 'unpdf';
import mammoth from 'mammoth';
import * as cheerio from 'cheerio';

// 统一文件解析入口：buffer + mimetype/originalname → 纯文本
// 这层质量决定 prompt 上限，解析喂垃圾 prompt 再好也废
export async function parseFile(buffer, mimetype, originalname = '') {
  const name = originalname.toLowerCase();

  if (mimetype === 'application/pdf' || name.endsWith('.pdf')) {
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
    return text.trim();
  }

  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value.trim();
  }

  if (mimetype === 'application/msword' || name.endsWith('.doc')) {
    throw new Error('暂不支持 .doc 旧格式，请另存为 .docx 或 PDF 后上传');
  }

  if (mimetype === 'text/html' || name.endsWith('.html') || name.endsWith('.htm')) {
    const $ = cheerio.load(buffer.toString('utf-8'));
    $('script,style,noscript').remove();
    return $('body').text().replace(/\s+/g, ' ').trim();
  }

  if (mimetype === 'text/plain' || name.endsWith('.txt')) {
    return buffer.toString('utf-8').trim();
  }

  // 兜底当文本
  return buffer.toString('utf-8').trim();
}
