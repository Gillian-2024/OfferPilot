import { useState, useEffect, useRef } from 'react';
import { Tabs } from 'antd';
import { ThunderboltOutlined, FileTextOutlined, RocketOutlined, BookOutlined } from '@ant-design/icons';
import { getSettings, setSettings as saveSettings } from '../../store/local';
import { Settings } from '../../types';
import { useSidebar } from '../../contexts/SidebarContext';
import { api } from '../../api/client';
import SettingsPanel from '../Settings/SettingsPanel';
import AuthModal from '../Auth/AuthModal';
import Sidebar from '../Sidebar';
import JDAnalysis from '../JDAnalysis';
import ResumeAnalysis from '../ResumeAnalysis';
import InterviewReview from '../InterviewReview';
import { track } from '../../utils/analytics';

export default function Layout() {
  const [settings, setSettingsState] = useState(getSettings);
  const [activeKey, setActiveKey] = useState('jd');
  const [modelStatus, setModelStatus] = useState<'checking' | 'ok' | 'missing' | 'error'>('checking');
  const [modelError, setModelError] = useState('');
  const [modelChecked, setModelChecked] = useState('');
  const checkSeq = useRef(0);

  const { settingsOpen, closeSettings, authModalOpen, closeAuthModal } = useSidebar();

  const handleSave = (s: Settings) => {
    saveSettings(s);
    setSettingsState(s);
    closeSettings();
  };

  // 启动 / 保存设置后探测模型配置（服务端 1-token 最小调用，验证 Key / 网关 / 配额）
  useEffect(() => {
    const seq = ++checkSeq.current;
    setModelStatus('checking');
    api.checkModel(settings)
      .then((r) => {
        if (seq !== checkSeq.current) return;
        setModelStatus(r.status);
        setModelError(r.status === 'error' ? r.error || '未知错误' : '');
        setModelChecked(r.status === 'ok' ? r.model || '' : '');
      })
      .catch((e) => {
        if (seq !== checkSeq.current) return;
        setModelStatus('error');
        setModelError(e.message || '检测服务不可用');
      });
  }, [settings]);

  const items = [
    {
      key: 'jd',
      label: (
        <span>
          <ThunderboltOutlined className="mr-4" />
          职位拆解
        </span>
      ),
      children: null,
    },
    {
      key: 'resume',
      label: (
        <span>
          <FileTextOutlined className="mr-4" />
          简历拆解
        </span>
      ),
      children: null,
    },
    {
      key: 'interview-prep',
      label: (
        <span>
          <RocketOutlined className="mr-4" />
          面试准备
        </span>
      ),
      children: null,
    },
    {
      key: 'interview-review',
      label: (
        <span>
          <BookOutlined className="mr-4" />
          面试复盘
        </span>
      ),
      children: null,
    },
  ];

  return (
    <div className="app-shell">
      <nav className="sidebar-nav">
        <Sidebar modelStatus={modelStatus} modelChecked={modelChecked} modelError={modelError} />
      </nav>
      <div className="right-side">
        <Tabs
          items={items}
          activeKey={activeKey}
          onChange={(key) => { track('tab_switch', { from_tab: activeKey, to_tab: key }); setActiveKey(key); }}
          size="large"
          className="app-tabs"
        />
        <main className="main-content">
          {activeKey === 'jd' && <JDAnalysis settings={settings} onGotoResume={() => setActiveKey('resume')} />}
          {activeKey === 'resume' && <ResumeAnalysis settings={settings} onGotoJD={() => setActiveKey('jd')} />}
          {activeKey === 'interview-prep' && <InterviewReview settings={settings} onGotoJD={() => setActiveKey('jd')} viewMode="prep" />}
          {activeKey === 'interview-review' && <InterviewReview settings={settings} onGotoJD={() => setActiveKey('jd')} viewMode="review" />}
        </main>
      </div>
      <SettingsPanel open={settingsOpen} onClose={closeSettings} settings={settings} onSave={handleSave} />
      <AuthModal open={authModalOpen} onClose={closeAuthModal} />
    </div>
  );
}
