import { useState } from 'react';
import { Button, Space, Steps, message, Card, Empty, Alert, Drawer, Input, Typography, Tag, Collapse } from 'antd';
import { ThunderboltOutlined, ShareAltOutlined, EditOutlined, FileTextOutlined, LinkOutlined, RightOutlined } from '@ant-design/icons';
import FileUpload from '../shared/FileUpload';
import { ResumeResultView, JDResultView } from '../shared/ResultViews';
import { api } from '../../api/client';
import { Settings, ResumeResult, SSEMessage } from '../../types';
import { getJDKeywords, getJDResult, setResumeSummary, addHistory } from '../../store/local';

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

  // 对照基准：完整 JD 拆解结果（不是只关键词——简历拆解对照 JD 全画像做 gap 分析）
  const jdResult = getJDResult();
  const jdKeywords = jdResult?.keyword_list || [];
  const hasBaseline = !!jdResult;

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
          setResumeSummary(text.slice(0, 500)); // 联动：面试复盘读简历摘要
          addHistory('resume', {
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
        {/* 左:JD 对照(只读钉住,同屏对照) */}
        <div
          style={{
            width: '40%',
            minWidth: 300,
            position: 'sticky',
            top: 72,
            maxHeight: 'calc(100vh - 96px)',
            overflowY: 'auto',
          }}
        >
          {hasBaseline ? (
            <Collapse
              defaultActiveKey={['jd']}
              ghost
              items={[
                {
                  key: 'jd',
                  label: (
                    <Space>
                      对照 JD（只读）
                      <Tag color="green">已联动</Tag>
                      <strong>{jdResult.job_profile}</strong>
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
              title={
                <Space>
                  对照 JD（只读）
                  <Tag color="orange">未拆解</Tag>
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
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未拆解 JD">
                {onGotoJD && (
                  <Button type="primary" size="small" onClick={onGotoJD}>
                    先去拆 JD
                  </Button>
                )}
              </Empty>
            </Card>
          )}
        </div>

        {/* 右:简历拆解工作流 */}
        <div style={{ flex: 1, minWidth: 320 }}>
          <Card size="small" title="1. 上传 / 粘贴简历" style={{ marginBottom: 16 }}>
            <FileUpload settings={settings} onText={setText} label="上传简历文件（PDF / Word / HTML）或粘贴文本" />
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
            <Button disabled={!result} icon={<EditOutlined />} onClick={() => setRwOpen(true)}>
              逐段改写
            </Button>
            <Button disabled={!result} icon={<FileTextOutlined />} onClick={() => { setSeOpen(true); doSelfEval(); }}>
              生成自我评价
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
            />
          )}

          {result ? <ResumeResultView data={result} /> : !loading ? <Empty description="上传简历后点击开始拆解" /> : null}
        </div>
      </div>

      <Drawer
        open={rwOpen}
        onClose={() => setRwOpen(false)}
        title="逐段改写"
        width={520}
        styles={{ body: { display: 'flex', flexDirection: 'column', gap: 12 } }}
      >
        <Typography.Text type="secondary">粘贴要改写的简历模块（一段经历 / 项目描述等）</Typography.Text>
        <Input.TextArea value={rwText} onChange={(e) => setRwText(e.target.value)} rows={6} placeholder="如：在XX公司实习期间，负责XX，做了XX…" />
        <Button type="primary" loading={rwLoading} onClick={doRewrite}>
          生成改写建议
        </Button>
        {rwOut && (
          <div className="markdown" style={{ background: '#fafafa', padding: 16, borderRadius: 8, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
            {rwOut}
            {rwLoading && <span className="cursor" />}
          </div>
        )}
      </Drawer>

      <Drawer
        open={seOpen}
        onClose={() => setSeOpen(false)}
        title="自我评价生成"
        width={520}
        styles={{ body: { display: 'flex', flexDirection: 'column', gap: 12 } }}
      >
        <Typography.Text type="secondary">
          基于简历 + 目标 JD 生成针对性自我评价（总分总结构，400-600 字）
        </Typography.Text>
        {seOut && (
          <div className="markdown" style={{ background: '#fafafa', padding: 16, borderRadius: 8, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
            {seOut}
            {seLoading && <span className="cursor" />}
          </div>
        )}
        {!seOut && !seLoading && (
          <Typography.Text type="secondary">点击按钮后自动生成...</Typography.Text>
        )}
        {seLoading && !seOut && <Typography.Text>生成中...</Typography.Text>}
        <Button onClick={() => { setSeOut(''); doSelfEval(); }} loading={seLoading} disabled={!result}>
          重新生成
        </Button>
      </Drawer>
    </div>
  );
}
