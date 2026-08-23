import { useState } from 'react';
import { Button, Space, message, Card, Empty, Alert, Drawer, Input, Typography, Tag, Tooltip, Collapse } from 'antd';
import {
  ThunderboltOutlined,
  ShareAltOutlined,
  EditOutlined,
  FileTextOutlined,
  LinkOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  FileProtectOutlined,
  RedoOutlined,
  RightOutlined,
} from '@ant-design/icons';
import XMarkdown from '@ant-design/x-markdown';
import FileUpload from '../shared/FileUpload';
import Steps from '../shared/HorizontalSteps';
import { ResumeResultView, JDResultView } from '../shared/ResultViews';
import { api } from '../../api/client';
import { Settings, ResumeResult, SSEMessage } from '../../types';
import { getJDResult, setResumeSummary, addHistorySynced } from '../../store/local';

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
  const displaySteps = steps.map((s, i) => ({ ...s, active: i === activeIdx }));

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
      <div className="ra-cols">
        {/* 左:JD 对照（手机端默认折叠） */}
        <div className="ra-side">
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
                      <ThunderboltOutlined className="icon-primary" />
                      对照 JD（只读）
                      <Tag color="success" bordered={false}>已联动</Tag>
                      <Typography.Text strong className="fs-13">{jdResult.job_profile}</Typography.Text>
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

        {/* 右:简历拆解工作流 */}
        <div className="ra-main">
          {/* 上传区 */}
          <Card size="small" className="mb-16 compact-upload-card" title={
            <Space>
              <FileProtectOutlined className="icon-primary" />
              上传 / 粘贴简历
            </Space>
          }>
            <FileUpload settings={settings} onText={setText} label="点击或拖拽上传（PDF / Word / HTML / Markdown / TXT）" />
          </Card>

          {/* 分析步骤 — 横向排列 */}
          {steps.length > 0 && (
            <Card size="small" className="thought-chain-card" title={
              <Space>
                {activeIdx >= 0 ? <LoadingOutlined className="step-icon--active" /> : <CheckCircleOutlined className="step-icon--done" />}
                {activeIdx >= 0 ? `分析中 (${activeIdx + 1}/${steps.length})` : '全部完成'}
              </Space>
            } extra={
              activeIdx < 0 && <Tag color="success" icon={<CheckCircleOutlined />} bordered={false}>完成</Tag>
            }>
              <Steps steps={displaySteps} />
            </Card>
          )}

          {/* 操作按钮 */}
          <div className="ra-actions">
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              loading={loading}
              onClick={analyze}
              size="large"
            >
              开始拆解
            </Button>
            <Tooltip title="锚定 JD 逐段改写简历模块">
              <Button
                disabled={!result}
                icon={<EditOutlined />}
                onClick={() => setRwOpen(true)}
              >
                逐段改写
              </Button>
            </Tooltip>
            <Tooltip title="总分总结构，400-600 字">
              <Button
                disabled={!result}
                icon={<FileTextOutlined />}
                onClick={() => { setSeOpen(true); doSelfEval(); }}
              >
                自我评价
              </Button>
            </Tooltip>
            <Button
              className="btn-share"
              disabled={!result}
              icon={<ShareAltOutlined />}
              onClick={share}
            >
              一键分享
            </Button>
          </div>

          {/* 分享结果 */}
          {shareUrl && (
            <Alert
              type="success"
              showIcon
              closable
              icon={<LinkOutlined />}
              className="ra-share-alert"
              message={
                <a href={shareUrl} target="_blank" rel="noreferrer">
                  {shareUrl}
                </a>
              }
            />
          )}

          {/* 结果 */}
          <div className="step-detail-enter">
            {result ? <ResumeResultView data={result} /> : !loading ? <Empty description="上传简历，让领航员帮你匹配最合适的机会" /> : null}
          </div>
        </div>
      </div>

      {/* 改写 Drawer */}
      <Drawer
        open={rwOpen}
        onClose={() => setRwOpen(false)}
        className="coach-drawer"
        title={
          <Space>
            <EditOutlined className="icon-primary" />
            逐段改写
            <Tag color="processing" bordered={false}>锚定 JD</Tag>
          </Space>
        }
        width={560}
      >
        <Typography.Text type="secondary" className="fs-13">
          粘贴要改写的简历模块（一段经历 / 项目描述等），领航员锚定目标 JD 逐段给出改写建议。
        </Typography.Text>
        <Input.TextArea
          value={rwText}
          onChange={(e) => setRwText(e.target.value)}
          rows={6}
          placeholder="如：在XX公司实习期间，负责XX，做了XX…"
        />
        <Button
          type="primary"
          loading={rwLoading}
          onClick={doRewrite}
          icon={<ThunderboltOutlined />}
          className="drawer-action"
        >
          生成改写建议
        </Button>
        {rwOut && (
          <Card size="small" className="out-card">
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
        className="coach-drawer"
        title={
          <Space>
            <FileTextOutlined className="icon-purple" />
            自我评价生成
            <Tag color="processing" bordered={false}>总分总结构</Tag>
          </Space>
        }
        width={560}
      >
        <Typography.Text type="secondary" className="fs-13">
          基于简历 + 目标 JD 生成针对性自我评价（400-600 字，3-5 个能力点）
        </Typography.Text>
        {seOut && (
          <Card size="small" className="out-card">
            <div className="chat-markdown">
              <XMarkdown>{seOut}</XMarkdown>
            </div>
            {seLoading && <span className="cursor" />}
          </Card>
        )}
        {!seOut && !seLoading && (
          <Typography.Text type="secondary" className="drawer-placeholder">
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
          className="drawer-action"
        >
          重新生成
        </Button>
      </Drawer>
    </div>
  );
}
