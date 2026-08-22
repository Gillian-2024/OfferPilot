import { useState } from 'react';
import { Button, Space, message, Card, Empty, Alert, Drawer, Input, Typography, Tag, Collapse, Tooltip } from 'antd';
import {
  ThunderboltOutlined,
  ShareAltOutlined,
  EditOutlined,
  FileTextOutlined,
  LinkOutlined,
  RightOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  ClockCircleOutlined,
  FileProtectOutlined,
  SearchOutlined,
  AimOutlined,
  StarOutlined,
  RedoOutlined,
} from '@ant-design/icons';
import { ThoughtChain } from '@ant-design/x';
import XMarkdown from '@ant-design/x-markdown';
import FileUpload from '../shared/FileUpload';
import { ResumeResultView, JDResultView } from '../shared/ResultViews';
import { api } from '../../api/client';
import { Settings, ResumeResult, SSEMessage } from '../../types';
import { getJDResult, setResumeSummary, addHistorySynced } from '../../store/local';

const STEP_META = [
  { icon: <FileProtectOutlined />, color: '#1677ff' },
  { icon: <SearchOutlined />, color: '#722ed1' },
  { icon: <AimOutlined />, color: '#fa8c16' },
  { icon: <StarOutlined />, color: '#52c41a' },
];

export default function ResumeAnalysis({ settings, onGotoJD }: { settings: Settings; onGotoJD?: () => void }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ResumeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<{ label: string; done: boolean }[]>([]);
  const [shareUrl, setShareUrl] = useState('');

  // 改写 Drawer
  const [rwOpen, setRwOpen] = useState(false);
  const [rwText, setRwText] = useState('');
  const [rwOut, setRwOut] = useState('');
  const [rwLoading, setRwLoading] = useState(false);

  // 自我评价 Drawer
  const [seOpen, setSeOpen] = useState(false);
  const [seOut, setSeOut] = useState('');
  const [seLoading, setSeLoading] = useState(false);

  const jdResult = getJDResult();
  const hasBaseline = !!jdResult;
  const activeIdx = steps.findIndex((st) => !st.done);

  const analyze = async () => {
    if (!text.trim()) return message.warning('请先上传或粘贴简历');
    setLoading(true);
    setResult(null);
    setSteps([]);
    try {
      for await (const msg of api.analyzeResume(text, jdResult, settings)) {
        if (msg.type === 'step') setSteps((s) => [...s, { label: msg.label, done: false }]);
        else if (msg.type === 'step_done')
          setSteps((s) => s.map((it, i) => (i === msg.index - 1 ? { ...it, done: true } : it)));
        else if (msg.type === 'result') {
          setResult(msg.data);
          setResumeSummary(text.slice(0, 500));
          addHistorySynced('resume', {
            id: Date.now().toString(),
            ts: Date.now(),
            title: `匹配度 ${msg.data.match_score}`,
            data: msg.data,
            provider: msg.provider,
            model: msg.model,
          });
          message.success('拆解完成');
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
      type: 'resume',
      title: `简历拆解 · 匹配度 ${result.match_score}`,
      content: JSON.stringify(result, null, 2),
    });
    setShareUrl(`${location.origin}/share/${r.id}`);
    message.success('分享链接已生成');
  };

  const doRewrite = async () => {
    if (!rwText.trim()) return message.warning('请粘贴要改写的模块原文');
    setRwLoading(true);
    setRwOut('');
    const jdCtx = jdResult
      ? `目标岗位：${jdResult.job_profile || '—'}\n硬性要求：${JSON.stringify(jdResult.hard_requirements || {})}\n筛选优先级：${JSON.stringify(jdResult.screening_priority || [])}\n关键词：${(jdResult.keyword_list || []).join('、')}`
      : '未提供 JD（按通用应届生标准）';
    const messages = [
      {
        role: 'user',
        content: `${jdCtx}\n\n请改写以下简历模块，输出：改前建议 + 改写示例 + 为什么这么改。锚定上面 JD，不做通用美化。\n\n【模块原文】\n${rwText}`,
      },
    ];
    try {
      for await (const msg of api.rewrite(messages, settings) as AsyncGenerator<SSEMessage>) {
        if (msg.type === 'token') setRwOut((o) => o + msg.text);
        else if (msg.type === 'error') message.error(msg.message);
      }
    } catch (e: any) {
      message.error(e.message);
    }
    setRwLoading(false);
  };

  const doSelfEval = async () => {
    if (!text.trim() && !result) return message.warning('请先拆解简历');
    setSeLoading(true);
    setSeOut('');
    const jdCtx = jdResult
      ? `目标岗位：${jdResult.job_profile || '—'}\n硬性要求：${JSON.stringify(jdResult.hard_requirements || {})}\n筛选优先级：${JSON.stringify(jdResult.screening_priority || [])}\n关键词：${(jdResult.keyword_list || []).join('、')}`
      : '未提供 JD（按通用应届生标准）';
    const resumeContent = text || (result ? JSON.stringify(result) : '');
    const messages = [
      {
        role: 'user',
        content: `${jdCtx}\n\n请基于以下简历内容，生成一段针对性自我评价（总分总结构，3-5 个能力点，400-600 字）。\n\n【简历内容】\n${resumeContent}`,
      },
    ];
    try {
      for await (const msg of api.selfEval(messages, settings) as AsyncGenerator<SSEMessage>) {
        if (msg.type === 'token') setSeOut((o) => o + msg.text);
        else if (msg.type === 'error') message.error(msg.message);
      }
    } catch (e: any) {
      message.error(e.message);
    }
    setSeLoading(false);
  };

  return (
    <div className="tab-content">
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* 左：JD 对照 */}
        <div
          style={{
            width: '40%',
            minWidth: 300,
            position: 'sticky',
            top: 72,
            maxHeight: 'calc(100vh - 96px)',
            overflowY: 'auto',
            scrollbarWidth: 'thin',
          }}
        >
          {hasBaseline ? (
            <Collapse
              defaultActiveKey={['jd']}
              ghost
              className="sidebar-collapse"
              items={[
                {
                  key: 'jd',
                  label: (
                    <Space>
                      <ThunderboltOutlined style={{ color: 'var(--color-primary)' }} />
                      对照 JD（只读）
                      <Tag color="success" bordered={false}>已联动</Tag>
                      <Typography.Text strong style={{ fontSize: 13 }}>{jdResult.job_profile}</Typography.Text>
                    </Space>
                  ),
                  extra: onGotoJD ? (
                    <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); onGotoJD(); }}>
                      去拆解 <RightOutlined />
                    </Button>
                  ) : null,
                  children: <JDResultView data={jdResult} />,
                },
              ]}
            />
          ) : (
            <Card
              size="small"
              className="sidebar-card sidebar-empty"
              title={
                <Space>
                  对照 JD（只读）
                  <Tag color="warning" bordered={false}>未拆解</Tag>
                </Space>
              }
              extra={
                onGotoJD ? (
                  <Button type="link" size="small" onClick={onGotoJD}>
                    去拆解 <RightOutlined />
                  </Button>
                ) : null
              }
            >
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未拆解 JD，无法做精准对照">
                {onGotoJD && (
                  <Button type="primary" size="small" onClick={onGotoJD} icon={<ThunderboltOutlined />}>
                    先去拆 JD
                  </Button>
                )}
              </Empty>
            </Card>
          )}
        </div>

        {/* 右：简历拆解工作流 */}
        <div style={{ flex: 1, minWidth: 320 }}>
          {/* 上传区 */}
          <Card size="small" title={
            <Space>
              <FileProtectOutlined style={{ color: 'var(--color-primary)' }} />
              上传 / 粘贴简历
            </Space>
          } style={{ marginBottom: 16 }}>
            <FileUpload settings={settings} onText={setText} label="上传简历文件（PDF / Word / HTML）或粘贴文本" />
          </Card>

          {/* ThoughtChain — 增强版 */}
          {steps.length > 0 && (
            <Card size="small" className="thought-chain-card" title={
              <Space>
                {activeIdx >= 0 ? <LoadingOutlined style={{ color: STEP_META[activeIdx]?.color }} /> : <CheckCircleOutlined style={{ color: 'var(--color-accent-green)' }} />}
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
                  status: s.done ? 'success' as const : 'pending' as const,
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
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
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
            <Tooltip title="锚定 JD 逐段改写简历模块">
              <Button
                disabled={!result}
                icon={<EditOutlined />}
                onClick={() => setRwOpen(true)}
                style={{ borderRadius: 'var(--radius-md)' }}
              >
                逐段改写
              </Button>
            </Tooltip>
            <Tooltip title="总分总结构，400-600 字">
              <Button
                disabled={!result}
                icon={<FileTextOutlined />}
                onClick={() => { setSeOpen(true); doSelfEval(); }}
                style={{ borderRadius: 'var(--radius-md)' }}
              >
                自我评价
              </Button>
            </Tooltip>
            <Button
              disabled={!result}
              icon={<ShareAltOutlined />}
              onClick={share}
              style={{ borderRadius: 'var(--radius-md)' }}
            >
              分享
            </Button>
          </div>

          {/* 分享结果 */}
          {shareUrl && (
            <Alert
              type="success"
              showIcon
              closable
              icon={<LinkOutlined />}
              style={{ marginBottom: 16, borderRadius: 'var(--radius-md)' }}
              message={
                <a href={shareUrl} target="_blank" rel="noreferrer">
                  {shareUrl}
                </a>
              }
            />
          )}

          {/* 结果 */}
          <div className="step-detail-enter">
            {result ? <ResumeResultView data={result} /> : !loading ? <Empty description="上传简历后点击开始拆解" /> : null}
          </div>
        </div>
      </div>

      {/* 改写 Drawer */}
      <Drawer
        open={rwOpen}
        onClose={() => setRwOpen(false)}
        title={
          <Space>
            <EditOutlined style={{ color: 'var(--color-primary)' }} />
            逐段改写
            <Tag color="processing" bordered={false}>锚定 JD</Tag>
          </Space>
        }
        width={560}
        styles={{
          body: { display: 'flex', flexDirection: 'column', gap: 12, padding: 20 },
          header: { borderBottom: '1px solid var(--color-border-light)' },
        }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          粘贴要改写的简历模块（一段经历 / 项目描述等），教练锚定目标 JD 逐段给出改写建议。
        </Typography.Text>
        <Input.TextArea
          value={rwText}
          onChange={(e) => setRwText(e.target.value)}
          rows={6}
          placeholder="如：在XX公司实习期间，负责XX，做了XX…"
          style={{ borderRadius: 'var(--radius-md)' }}
        />
        <Button
          type="primary"
          loading={rwLoading}
          onClick={doRewrite}
          icon={<ThunderboltOutlined />}
          style={{ borderRadius: 'var(--radius-md)', alignSelf: 'flex-start' }}
        >
          生成改写建议
        </Button>
        {rwOut && (
          <Card size="small" style={{ borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border-light)' }}>
            <div className="chat-markdown">
              <XMarkdown>{rwOut}</XMarkdown>
            </div>
            {rwLoading && <span className="cursor" />}
          </Card>
        )}
      </Drawer>

      {/* 自我评价 Drawer */}
      <Drawer
        open={seOpen}
        onClose={() => setSeOpen(false)}
        title={
          <Space>
            <FileTextOutlined style={{ color: 'var(--color-accent-purple)' }} />
            自我评价生成
            <Tag color="processing" bordered={false}>总分总结构</Tag>
          </Space>
        }
        width={560}
        styles={{
          body: { display: 'flex', flexDirection: 'column', gap: 12, padding: 20 },
          header: { borderBottom: '1px solid var(--color-border-light)' },
        }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          基于简历 + 目标 JD 生成针对性自我评价（400-600 字，3-5 个能力点）
        </Typography.Text>
        {seOut && (
          <Card size="small" style={{ borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border-light)' }}>
            <div className="chat-markdown">
              <XMarkdown>{seOut}</XMarkdown>
            </div>
            {seLoading && <span className="cursor" />}
          </Card>
        )}
        {!seOut && !seLoading && (
          <Typography.Text type="secondary" style={{ padding: '24px 0', textAlign: 'center', display: 'block' }}>
            点击按钮后自动生成…
          </Typography.Text>
        )}
        {seLoading && !seOut && (
          <Typography.Text type="secondary">生成中…</Typography.Text>
        )}
        <Button
          onClick={() => { setSeOut(''); doSelfEval(); }}
          loading={seLoading}
          disabled={!result}
          icon={<RedoOutlined />}
          style={{ borderRadius: 'var(--radius-md)', alignSelf: 'flex-start' }}
        >
          重新生成
        </Button>
      </Drawer>
    </div>
  );
}

