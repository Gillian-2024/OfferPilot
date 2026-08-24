import { defineConfig } from '@playwright/test';

/**
 * E2E 测试依赖两个本地服务:
 *   - Express 后端:  http://localhost:8787
 *   - Vite dev 前端: http://localhost:5173(已配置 /api 等代理到 8787)
 * 运行前先手动启动两者,再执行 `npx playwright test`。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
  },
});
