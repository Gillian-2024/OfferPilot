import { useState } from 'react';
import { Tabs, Button, Badge } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { getSettings, setSettings as saveSettings } from '../../store/local';
import { Settings } from '../../types';
import SettingsPanel from '../Settings/SettingsPanel';
import JDAnalysis from '../JDAnalysis';
import ResumeAnalysis from '../ResumeAnalysis';
import InterviewReview from '../InterviewReview';

export default function Layout() {
  const [settings, setSettingsState] = useState<Settings>(getSettings());
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState('jd');

  const handleSave = (s: Settings) => {
    saveSettings(s);
    setSettingsState(s);
    setOpen(false);
  };

  const items = [
    { key: 'jd', label: 'JD 拆解', children: <JDAnalysis settings={settings} /> },
    { key: 'resume', label: '简历拆解', children: <ResumeAnalysis settings={settings} onGotoJD={() => setActiveKey('jd')} /> },
    { key: 'interview', label: '面试复盘', children: <InterviewReview settings={settings} /> },
  ];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-title">
          校招教练<span className="sub">AI 策略 PM 视角 · 应届生校招</span>
        </div>
        <Button icon={<SettingOutlined />} onClick={() => setOpen(true)}>
          模型设置
          <Badge count={settings.apiKey ? 1 : 0} size="small" offset={[4, -2]} color="#52c41a" />
        </Button>
      </header>
      <Tabs
        items={items}
        activeKey={activeKey}
        onChange={setActiveKey}
        size="large"
        className="app-tabs"
        tabBarStyle={{ paddingLeft: 24, background: '#fff', marginBottom: 0 }}
      />
      <SettingsPanel open={open} onClose={() => setOpen(false)} settings={settings} onSave={handleSave} />
    </div>
  );
}
