// 原生密码哈希（bcryptjs，纯 JS 零原生编译，兼容 2C2G 服务器）。替代 Supabase Auth 存储的 bcrypt 密码。
// 兼容性：bcryptjs 能验证 Supabase auth.users 中 $2a$/$2b$/$2y$ 的 bcrypt 哈希，故迁移可原样拷贝哈希。
import { hash, compare } from "bcryptjs";

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, 10);
}

// 校验明文 vs 存储哈希；哈希字段为空/格式非法 → false（防误判）。
export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  if (!hashed.trim()) return false;
  try {
    return await compare(plain, hashed);
  } catch {
    return false;
  }
}
