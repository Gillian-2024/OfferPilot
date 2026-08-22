import { useState } from 'react';
import { Button, Space, Steps, message, Card, Empty, Alert, Input, Tag } from 'antd';
import {
  ThunderboltOutlined,
  ShareAltOutlined,
  ArrowRightOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import FileUpload from '../shared/FileUpload';
import { JDResultView } from '../shared/ResultViews';
import { api } from '../../api/client';
import { Settings, JDResult } from '../../types';
import { setJDResult, addHistory } from '../../store/local';

export default function JDAnalysis({ settings }: { settings: Settings }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<JDResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<{ label: string; done: boolean }[]>([]);
  const [shareUrl, setShareUrl] = useState('');

  const analyze = async () => {
    if (!text.trim()) return message.warning('请先上传或粘贴 JD');
    setLoading(true);
    setResult(null);
    setSteps([]);
    try {
      for await (const msg of api.analyzeJD(text, settings)) {
        if (msg.type === 'step') setSteps((s) => [...s, { label: msg.label, done: false }]);
        else if (msg.type === 'step_done')
          setSteps((s) => s.map((it, i) => (i === msg.index - 1 ? { ...it, done: true } : it)));
        else if (msg.type === 'result') {
          setResult(msg.data);
          setJDResult(msg.data); // 联动：写入 store，简历拆解自动读
          addHistory('jd', {
            id: Date.now().toString(),
            ts: Date.now(),
            title: text.slice(0, 30),
            data: msg.data,
            provider: msg.provider,
            model: msg.model,
          });
          message.success('拆解完成，已存入会话上下文（简历拆解将自动联动）');
        } else if (msg.type === 'error') message.error(msg.message);
      }
    } catch (e: any) {
      message.error(e.message);
    }
    setLoading(false);
  };

  const share = async () => {
    if (!result) return;
    const r = await api.createShare({
      type: 'jd',
      title: `JD拆解 · ${result.job_type || ''}`,
      content: JSON.stringify(result, null, 2),
    });
    setShareUrl(`${location.origin}/share/${r.id}`);
    message.success('分享链接已生成');
  };

  return (
    <div className="tab-content">
      <Card size="small" title="1. 上传 / 粘贴 JD" style={{ marginBottom: 16 }}>
        <FileUpload settings={settings} onText={setText} label="上传 JD 文件（PDF / Word / HTML）或粘贴文本" />
      </Card>

      {steps.length > 0 && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Steps
            size="small"
            current={steps.filter((s) => s.done).length - 1}
            items={steps.map((s) => ({ title: s.label, status: s.done ? ('finish' as const) : ('process' as const) }))}
          />
        </Card>
      )}

      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" icon={<ThunderboltOutlined />} loading={loading} onClick={analyze}>
          开始拆解（4 步链）
        </Button>
        <Button disabled={!result} icon={<ShareAltOutlined />} onClick={share}>
          生成分享链接
        </Button>
      </Space>

      {shareUrl && (
        <Alert
          type="success"
          showIcon
          icon={<LinkOutlined />}
          style={{ marginBottom: 16 }}
          message={
            <a href={shareUrl} target="_blank" rel="noreferrer">
              {shareUrl}
            </a>
          }
          description="对方无需登录即可查看只读报告"
        />
      )}

      {result && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <span>
              已存入会话上下文，切换到 <Tag color="blue">简历拆解</Tag> Tab 将自动联动岗位画像 + 关键词
              <ArrowRightOutlined />
            </span>
          }
        />
      )}

      {result ? <JDResultView data={result} /> : !loading ? <Empty description="上传 JD 后点击开始拆解" /> : null}
    </div>
  );
}
