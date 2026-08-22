import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, Button, Badge, Tooltip, Tag, Dropdown, Avatar, Space } from 'antd';
import { SettingOutlined, ThunderboltOutlined, FileTextOutlined, RocketOutlined, BookOutlined, UserOutlined, LogoutOutlined, HistoryOutlined } from '@ant-design/icons';
import { getSettings, setSettings as saveSettings } from '../../store/local';
import { Settings } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import SettingsPanel from '../Settings/SettingsPanel';
import AuthModal from '../Auth/AuthModal';
import JDAnalysis from '../JDAnalysis';
import ResumeAnalysis from '../ResumeAnalysis';
import InterviewReview from '../InterviewReview';

export default function Layout() {
  const navigate = useNavigate();
  const [settings, setSettingsState] = useState(getSettings);
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState('jd');
  const [authOpen, setAuthOpen] = useState(false);

  const { user, isLoggedIn, logout } = useAuth();

  const handleSave = (s: Settings) => {
    saveSettings(s);
    setSettingsState(s);
    setOpen(false);
  };

  const hasModel = !!settings.apiKey;

  const items = [
    {
      key: 'jd',
      label: (
        <span>
          <ThunderboltOutlined className="mr-4" />
          职位拆解
        </span>
      ),
      children: <JDAnalysis settings={settings} />,
    },
    {
      key: 'resume',
      label: (
        <span>
          <FileTextOutlined className="mr-4" />
          简历拆解
        </span>
      ),
      children: <ResumeAnalysis settings={settings} onGotoJD={() => setActiveKey('jd')} />,
    },
    {
      key: 'interview-prep',
      label: (
        <span>
          <RocketOutlined className="mr-4" />
          面试准备
        </span>
      ),
      children: <InterviewReview settings={settings} onGotoJD={() => setActiveKey('jd')} viewMode="prep" />,
    },
    {
      key: 'interview-review',
      label: (
        <span>
          <BookOutlined className="mr-4" />
          面试复盘
        </span>
      ),
      children: <InterviewReview settings={settings} onGotoJD={() => setActiveKey('jd')} viewMode="review" />,
    },
  ];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-title">
          <img src="/logo.svg" alt="" className="app-logo" />
          OfferPilot 领航员
          <span className="sub">聚焦：AI 策略 PM</span>
          {hasModel && (
            <Tag color="success" bordered={false} className="tag-tight">
              已配置
            </Tag>
          )}
        </div>
        <Space size={8}>
          <Tooltip title={hasModel ? `模型：${settings.model || '默认'}` : '点击配置模型'}>
            <Button
              icon={<SettingOutlined />}
              onClick={() => setOpen(true)}
              type="text"
            >
              模型配置
              <Badge count={hasModel ? 0 : 1} size="small" offset={[4, -2]} color="var(--color-gold)" />
            </Button>
          </Tooltip>
          {isLoggedIn ? (
            <Dropdown menu={{
              items: [
                { key: 'user-info', label: `${user?.nickname || user?.username}`, disabled: true, className: 'menu-user-name' },
                { type: 'divider' },
                { key: 'history', icon: <HistoryOutlined />, label: '历史记录', onClick: () => navigate('/history') },
                { type: 'divider' },
                { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: logout },
              ],
            }} trigger={['click']}>
              <Avatar
                className="header-avatar"
                size={32}
              >
                {(user?.nickname || user?.username || '?')[0].toUpperCase()}
              </Avatar>
            </Dropdown>
          ) : (
            <Button
              type="primary"
              ghost
              size="small"
              icon={<UserOutlined />}
              onClick={() => setAuthOpen(true)}
            >
              登录
            </Button>
          )}
        </Space>
      </header>
      <Tabs
        items={items}
        activeKey={activeKey}
        onChange={setActiveKey}
        size="large"
        className="app-tabs"
      />
      <SettingsPanel open={open} onClose={() => setOpen(false)} settings={settings} onSave={handleSave} />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
