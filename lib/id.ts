// 无依赖 id 生成器。业务 id 用 nanoid 风格短串（原 server 用 nanoid(12)），
// 邀请码需要大写 A-Z/0-9。使用全局 crypto.getRandomValues（Node 24 + Edge 均可用），不引额外包。
const ALPHABET = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_TQZfghjklqvwyzrict"; // nanoid 默认字母表（url-safe）

export function nanoid(size = 12): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let id = "";
  for (let i = 0; i < size; i++) {
    id += ALPHABET[bytes[i] & 63];
  }
  return id;
}

// 生成一个大小写字母/数字/下划线组成的邀请码（3-16 位，默认 12），复用 nanoid 随机源。
export function nanoidUppercase(size = 12): string {
  return nanoid(size).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, Math.max(3, size));
}
