import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import './styles/global.css';

const theme = {
  token: {
    colorPrimary: '#14273f',
    borderRadius: 10,
    controlHeightSM: 28,
    lineHeight: 1.6,
    paddingXXS: 4,
    paddingXS: 8,
    padding: 12,
    paddingLG: 16,
    paddingMD: 16,
    paddingSM: 16,
    paddingXL: 32,
  },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={theme}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ConfigProvider>
  </React.StrictMode>
);
