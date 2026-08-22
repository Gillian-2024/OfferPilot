import { useState } from 'react';
import { Tabs, Button, Badge, Tooltip, Tag, Dropdown, Avatar, Space } from 'antd';
import { SettingOutlined, ThunderboltOutlined, UserOutlined, LogoutOutlined, HistoryOutlined } from '@ant-design/icons';
import { getSettings, setSettings as saveSettings } from '../../store/local';
import { Settings } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import SettingsPanel from '../Settings/SettingsPanel';
import AuthModal from '../Auth/AuthModal';
import JDAnalysis from '../JDAnalysis';
import ResumeAnalysis from '../ResumeAnalysis';
import InterviewReview from '../InterviewReview';

export default function Layout() {
  const [settings, setSettingsState] = useState<Settings>(getSettings());
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
          <ThunderboltOutlined style={{ marginRight: 4 }} />
          JD 拆解
        </span>
      ),
      children: <JDAnalysis settings={settings} />,
    },
    {
      key: 'resume',
      label: '简历拆解',
      children: <ResumeAnalysis settings={settings} onGotoJD={() => setActiveKey('jd')} />,
    },
    {
      key: 'interview',
      label: '面试速通',
      children: <InterviewReview settings={settings} onGotoJD={() => setActiveKey('jd')} />,
    },
  ];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-title">
          校招教练
          <span className="sub">AI 策略 PM 视角</span>
          {hasModel && (
            <Tag color="success" bordered={false} style={{ fontSize: 10, lineHeight: '16px', padding: '0 6px', margin: 0 }}>
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
              style={{ borderRadius: 8 }}
            >
              模型设置
              <Badge count={hasModel ? 0 : 1} size="small" offset={[4, -2]} color="#faad14" />
            </Button>
          </Tooltip>
          {isLoggedIn ? (
            <Dropdown menu={{
              items: [
                { key: 'user-info', label: `${user?.nickname || user?.username}`, disabled: true, style: { fontWeight: 600 } },
                { type: 'divider' },
                { key: 'history', icon: <HistoryOutlined />, label: '历史记录（即将上线）', disabled: true },
                { type: 'divider' },
                { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: logout },
              ],
            }} trigger={['click']}>
              <Avatar
                style={{ cursor: 'pointer', background: 'var(--color-primary)', fontSize: 14 }}
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
              style={{ borderRadius: 8 }}
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
        tabBarStyle={{
          paddingLeft: 24,
          background: 'var(--color-bg-elevated)',
          marginBottom: 0,
          borderBottom: '1px solid var(--color-border-light)',
        }}
      />
      <SettingsPanel open={open} onClose={() => setOpen(false)} settings={settings} onSave={handleSave} />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
