import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 生产同源托管:前端 + /api 都在这一个 Next 应用里,不跨域。
  // 阶段二国内如果走备案 + 国内服务器,再考虑拆分或用 Vercel 国内接入。
  reactStrictMode: true,
  // 服务器构建期内存保护:ECS 1.6G 内存,Next 默认 4 个工作线程会把内存打满,
  // 这里强制单线程构建压缩峰值。仅影响构建线程数,生产运行时性能无影响。
  experimental: {
    cpus: 1,
  },
};

export default nextConfig;
