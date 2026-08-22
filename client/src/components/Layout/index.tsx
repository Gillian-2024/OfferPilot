import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, Button, Badge, Tooltip, Tag, Dropdown, Avatar, Space } from 'antd';
import { SettingOutlined, ThunderboltOutlined, FileTextOutlined, RocketOutlined, BookOutlined, UserOutlined, LogoutOutlined, HistoryOutlined, CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { getSettings, setSettings as saveSettings } from '../../store/local';
import { Settings } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
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
  const [modelStatus, setModelStatus] = useState<'checking' | 'ok' | 'missing' | 'error'>('checking');
  const [modelError, setModelError] = useState('');
  const [modelChecked, setModelChecked] = useState(''); // 探测成功时服务端实际生效的 model
  const checkSeq = useRef(0);

  const { user, isLoggedIn, logout } = useAuth();

  const handleSave = (s: Settings) => {
    saveSettings(s);
    setSettingsState(s);
    setOpen(false);
  };

  // 启动 / 保存设置后探测模型配置（服务端 1-token 最小调用，验证 Key / 网关 / 配额）
  useEffect(() => {
    const seq = ++checkSeq.current;
    setModelStatus('checking');
    api.checkModel(settings)
      .then((r) => {
        if (seq !== checkSeq.current) return; // 已有更新的探测，丢弃过期结果
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

  const STATUS_UI: Record<'ok' | 'missing' | 'error', { color: string; icon: JSX.Element; text: string; tip: string }> = {
    ok: {
      color: 'success',
      icon: <CheckCircleOutlined />,
      text: '模型已配置',
      tip: `模型可用：${modelChecked || settings.model || '服务端默认'}`,
    },
    missing: {
      color: 'error',
      icon: <CloseCircleOutlined />,
      text: '模型未配置',
      tip: '尚未配置模型，点击右上角「模型配置」填写 API Key',
    },
    error: {
      color: 'warning',
      icon: <ExclamationCircleOutlined />,
      text: '模型配置出错了',
      tip: `配置无法使用：${modelError}。请检查 API Key / 网关地址 / 配额，点击修改配置`,
    },
  };
  const statusUI = modelStatus !== 'checking' ? STATUS_UI[modelStatus] : null;

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
          {statusUI && (
            <Tooltip title={statusUI.tip}>
              <Tag
                color={statusUI.color}
                icon={statusUI.icon}
                bordered={false}
                className="tag-tight model-status-tag"
                onClick={() => setOpen(true)}
              >
                {statusUI.text}
              </Tag>
            </Tooltip>
          )}
        </div>
        <Space size={8}>
          <Tooltip title={modelStatus === 'ok' ? `模型：${modelChecked || settings.model || '默认'}` : '点击配置模型'}>
            <Button
              icon={<SettingOutlined />}
              onClick={() => setOpen(true)}
              type="text"
            >
              模型配置
              <Badge count={modelStatus === 'missing' || modelStatus === 'error' ? 1 : 0} size="small" offset={[4, -2]} color="var(--color-gold)" />
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
