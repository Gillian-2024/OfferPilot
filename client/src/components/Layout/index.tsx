import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Tabs } from 'antd';
import { ThunderboltOutlined, FileTextOutlined, RocketOutlined, BookOutlined, RobotOutlined } from '@ant-design/icons';
import { getSettings } from '../../store/local';
import { useSidebar } from '../../contexts/SidebarContext';
import SettingsPanel from '../Settings/SettingsPanel';
import AuthModal from '../Auth/AuthModal';
import PaywallModal from '../Pricing/PaywallModal';
import GlobalFeedback from '../Feedback/GlobalFeedback';
import CoachingTab from '../CoachingTab';
import Sidebar from '../Sidebar';
import JDAnalysis from '../JDAnalysis';
import ResumeAnalysis from '../ResumeAnalysis';
import InterviewReview from '../InterviewReview';
import { track } from '../../utils/analytics';

export default function Layout() {
  const [settings] = useState(getSettings);
  const [activeKey, setActiveKey] = useState('jd');

  const { settingsOpen, closeSettings, authModalOpen, closeAuthModal } = useSidebar();

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
    {
      key: 'coaching',
      label: (
        <span>
          <RobotOutlined className="mr-4" />
          专属陪练
        </span>
      ),
      children: null,
    },
  ];

  return (
    <div className="app-shell">
      <nav className="sidebar-nav">
        <Sidebar />
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
          {activeKey === 'coaching' && <CoachingTab />}
        </main>
        <footer className="app-footer">
          <Link to="/privacy">隐私政策</Link>
          <span className="app-footer-sep">·</span>
          <Link to="/terms">用户协议</Link>
        </footer>
      </div>
      <SettingsPanel open={settingsOpen} onClose={closeSettings} settings={settings} />
      <AuthModal open={authModalOpen} onClose={closeAuthModal} />
      <PaywallModal />
      <GlobalFeedback />
    </div>
  );
}
