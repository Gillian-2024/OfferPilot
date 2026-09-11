import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/projects': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/invites': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // D：拆分 vendor，避免 antd / jspdf / html2canvas 全压进 main 导致 2MB 主包
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/node_modules\/(antd|@ant-design|dayjs|rc-[^/]+|@rc-component)/.test(id)) return "antd";
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)/.test(id)) return "react";
          if (/node_modules\/jspdf/.test(id)) return "pdf";
          if (/node_modules\/html2canvas/.test(id)) return "canvas";
        },
      },
    },
  },
});
