import { useState } from 'react';
import { Button, Space, message, Card, Empty, Alert, Tag, Typography, Tooltip } from 'antd';
import {
  ThunderboltOutlined,
  ShareAltOutlined,
  ArrowRightOutlined,
  LinkOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  ClockCircleOutlined,
  FileSearchOutlined,
  KeyOutlined,
  FlagOutlined,
  AimOutlined,
} from '@ant-design/icons';
import { ThoughtChain } from '@ant-design/x';
import FileUpload from '../shared/FileUpload';
import { JDResultView } from '../shared/ResultViews';
import { api } from '../../api/client';
import { Settings, JDResult } from '../../types';
import { setJDResult, addHistorySynced } from '../../store/local';

const STEP_META = [
  { icon: <FileSearchOutlined />, color: '#1677ff' },
  { icon: <KeyOutlined />, color: '#722ed1' },
  { icon: <FlagOutlined />, color: '#fa8c16' },
  { icon: <AimOutlined />, color: '#52c41a' },
];

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
          setJDResult(msg.data);
          addHistorySynced('jd', {
            id: Date.now().toString(),
            ts: Date.now(),
            title: text.slice(0, 30),
            data: msg.data,
            provider: msg.provider,
            model: msg.model,
          });
          message.success('拆解完成，已存入会话上下文');
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

  const activeIdx = steps.findIndex((st) => !st.done);

  return (
    <div className="tab-content">
      {/* 上传区 */}
      <Card size="small" title={
        <Space>
          <FileSearchOutlined style={{ color: 'var(--color-primary)' }} />
          上传 / 粘贴 JD
        </Space>
      } style={{ marginBottom: 16 }}>
        <FileUpload settings={settings} onText={setText} label="上传 JD 文件（PDF / Word / HTML）或粘贴文本" />
      </Card>

      {/* ThoughtChain — 增强版 */}
      {steps.length > 0 && (
        <Card size="small" className="thought-chain-card" title={
          <Space>
            <LoadingOutlined style={{ color: activeIdx >= 0 ? undefined : 'var(--color-accent-green)' }} />
            {activeIdx >= 0 ? `分析中 (${activeIdx + 1}/${steps.length})` : '全部完成'}
          </Space>
        } extra={
          activeIdx < 0 && <Tag color="success" icon={<CheckCircleOutlined />} bordered={false}>完成</Tag>
        }>
          <ThoughtChain
            size="small"
            collapsible
            items={steps.map((s, i) => ({
              key: String(i),
              title: s.label,
              status: s.done ? 'success' as const : i === activeIdx ? 'pending' as const : 'pending' as const,
              icon: s.done
                ? <CheckCircleOutlined style={{ color: STEP_META[i]?.color }} />
                : i === activeIdx
                  ? <LoadingOutlined style={{ color: STEP_META[i]?.color }} />
                  : <ClockCircleOutlined style={{ color: 'var(--color-text-tertiary)' }} />,
              description: s.done
                ? <Typography.Text type="success" style={{ fontSize: 12 }}>✓ 已完成</Typography.Text>
                : i === activeIdx
                  ? <Typography.Text style={{ fontSize: 12, color: STEP_META[i]?.color }}>处理中…</Typography.Text>
                  : <Typography.Text type="secondary" style={{ fontSize: 12 }}>等待</Typography.Text>,
            }))}
          />
        </Card>
      )}

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          loading={loading}
          onClick={analyze}
          size="large"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          开始拆解（4 步链）
        </Button>
        <Tooltip title="生成只读分享链接，对方无需登录">
          <Button
            disabled={!result}
            icon={<ShareAltOutlined />}
            onClick={share}
            style={{ borderRadius: 'var(--radius-md)' }}
          >
            生成分享链接
          </Button>
        </Tooltip>
      </div>

      {/* 分享结果 */}
      {shareUrl && (
        <Alert
          type="success"
          showIcon
          icon={<LinkOutlined />}
          closable
          style={{ marginBottom: 16, borderRadius: 'var(--radius-md)' }}
          message={
            <a href={shareUrl} target="_blank" rel="noreferrer">
              {shareUrl}
            </a>
          }
          description="对方无需登录即可查看只读报告"
        />
      )}

      {/* 联动提示 */}
      {result && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16, borderRadius: 'var(--radius-md)' }}
          message={
            <span>
              已存入会话上下文，切换到 <Tag color="processing" bordered={false}>简历拆解</Tag> Tab 将自动联动岗位画像 + 关键词
              <ArrowRightOutlined style={{ marginLeft: 4 }} />
            </span>
          }
        />
      )}

      {/* 结果 */}
      <div className="step-detail-enter">
        {result ? <JDResultView data={result} /> : !loading ? <Empty description="上传 JD 后点击开始拆解" /> : null}
      </div>
    </div>
  );
}
