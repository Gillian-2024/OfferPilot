import { useState, useEffect, useRef } from 'react';
import { Button, Space, message, Card, Empty, Alert, Drawer, Input, Typography, Tag, Tooltip, Collapse, Dropdown } from 'antd';
import {
  ThunderboltOutlined,
  ShareAltOutlined,
  EditOutlined,
  FileTextOutlined,
  LinkOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  LoadingOutlined,
  FileProtectOutlined,
  RedoOutlined,
  RightOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  DownOutlined,
} from '@ant-design/icons';
import XMarkdown from '@ant-design/x-markdown';
import FileUpload from '../shared/FileUpload';
import Steps from '../shared/HorizontalSteps';
import { ResumeResultView, JDResultBrief } from '../shared/ResultViews';
import { api } from '../../api/client';
import { Settings, ResumeResult, SSEMessage } from '../../types';
import { getJDResult, getResumeResult, getActiveJob, setResumeResult, setResumeSummary, getResumeSummary, addHistorySynced, getSelfEval, setSelfEval, recordModelResult } from '../../store/local';
import { exportNodeToPdf, reportFilename, exportNodeToPng } from '../../utils/exportPdf';
import { useSidebar } from '../../contexts/SidebarContext';
import { track } from '../../utils/analytics';

export default function ResumeAnalysis({ settings, onGotoJD }: { settings: Settings; onGotoJD?: () => void }) {
  const { activeJobId, refreshJobs } = useSidebar();
  const [text, setText] = useState('');
  const [result, setResult] = useState<ResumeResult | null>(() => getResumeResult());
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<{ label: string; done: boolean }[]>([]);
  const [shareUrl, setShareUrl] = useState('');
  const [exporting, setExporting] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const uploadSource = useRef<'upload' | null>(null);
  // 切岗位 / 刷新后回读该岗位已存的简历诊断（P0 修复：结果区不再会话态丢失）
  useEffect(() => {
    setResult(getResumeResult());
  }, [activeJobId]);

  // P2-2：切岗位/刷新后回读该岗位已存的自评结果（Drawer 重开/切岗自动换绑）
  useEffect(() => {
    setSeOut(getSelfEval(activeJobId ?? 'none'));
  }, [activeJobId]);

  // 改写 Drawer
  const [rwOpen, setRwOpen] = useState(false);
  const [rwText, setRwText] = useState('');
  const [rwOut, setRwOut] = useState('');
  const [rwLoading, setRwLoading] = useState(false);

  // 自我评价 Drawer
  const [seOpen, setSeOpen] = useState(false);
  const [seOut, setSeOut] = useState('');
  const [seLoading, setSeLoading] = useState(false);

  // activeJobId 来自 context：切换岗位触发本组件重渲染，重新读取该岗位的对照 JD
  const jdResult = activeJobId == null ? null : getJDResult();
  const hasBaseline = !!jdResult;
  const jobName = getActiveJob()?.name || '';
  const activeIdx = steps.findIndex((st) => !st.done);
  const displaySteps = steps.map((s, i) => ({ ...s, active: i === activeIdx }));

  const analyze = async () => {
    if (!text.trim()) return message.warning('请先上传或粘贴简历');
    if (uploadSource.current !== 'upload') {
      track('resume_analysis_start', { source: 'paste' });
    }
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
          setResumeResult(msg.data);
          recordModelResult(msg.model || settings.model || '', true);
          setResumeSummary(text.slice(0, 500));
          refreshJobs();
          addHistorySynced('resume', {
            id: Date.now().toString(),
            ts: Date.now(),
            title: `匹配度 ${msg.data.match_score}`,
            data: msg.data,
            provider: msg.provider,
            model: msg.model,
            jobId: activeJobId ?? undefined,
          });
          message.success(`拆解完成，已存入岗位「${getActiveJob()?.name || ''}」`);
          track('resume_analysis_done', { steps: steps.length, provider: msg.provider, model: msg.model });
        } else if (msg.type === 'error') {
          message.error(msg.message);
          recordModelResult(settings.model || '', false);
          track('error_client', { context: 'resume_analyze', message: msg.message });
        }
      }
    } catch (e: any) {
      message.error(e.message);
      recordModelResult(settings.model || '', false);
      track('error_client', { context: 'resume_analyze', message: e.message });
    }
    setLoading(false);
  };

  const share = async () => {
    if (!result) return;
    track('resume_share_click');
    const r = await api.createShare({
      type: 'resume',
      title: `简历拆解 · 匹配度 ${result.match_score}`,
      content: JSON.stringify(result, null, 2),
    });
    setShareUrl(`${location.origin}/share/${r.id}`);
    message.success('分享链接已生成');
    track('resume_share_done', { url: `${location.origin}/share/${r.id}` });
  };

  // P2-3 导出 PDF：结果容器整块截图（导出态隐藏交互元素），A4 分页
  const exportPdf = async () => {
    track('resume_pdf_export');
    const node = resultRef.current;
    if (!node || !result) return;
    setExporting(true);
    try {
      const filename = reportFilename(getActiveJob()?.name || '未命名岗位', '简历拆解');
      await exportNodeToPdf(node, filename, { exportClass: 'pdf-exporting' });
      message.success('PDF 已导出');
      track('resume_pdf_export_done');
    } catch (e: any) {
      message.error(`导出失败：${e?.message || e}`);
      track('error_client', { context: 'resume_pdf_export', message: e.message || String(e) });
    } finally {
      setExporting(false);
    }
  };

  // P2-3 导出 PNG 高清截图：所见即所得，适合发朋友圈/小红书
  const exportPng = async () => {
    track('resume_png_export');
    const node = resultRef.current;
    if (!node || !result) return;
    setExporting(true);
    try {
      const filename = reportFilename(getActiveJob()?.name || '未命名岗位', '简历拆解');
      await exportNodeToPng(node, `${filename.replace(/\.pdf$/, '')}.png`, { exportClass: 'pdf-exporting' });
      message.success('PNG 图片已导出');
      track('resume_png_export_done');
    } catch (e: any) {
      message.error(`导出失败：${e?.message || e}`);
      track('error_client', { context: 'resume_png_export', message: e.message || String(e) });
    } finally {
      setExporting(false);
    }
  };

  // P1-3：诊断区「改写这段」→ 自动带入该模块原文到改写 Drawer（snippet 来自 step1 模块原文映射；旧结果无 modules 时降级提示）
  const onRewriteModule = (module: string, snippet?: string) => {
    setRwText(snippet ? `【${module}】\n${snippet}` : `【${module}】\n（未找到该模块原文片段，请粘贴原文后改写）`);
    setRwOut('');
    setRwOpen(true);
  };

  const doRewrite = async () => {
    if (!rwText.trim()) return message.warning('请粘贴要改写的模块原文');
    setRwLoading(true);
    setRwOut('');
    track('resume_rewrite_start', { module_snippet_length: rwText.length });
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
    track('resume_rewrite_done', { output_length: rwOut.length });
  };

  const doSelfEval = async () => {
    if (!text.trim() && !result) return message.warning('请先拆解简历');
    setSeLoading(true);
    setSeOut('');
    track('resume_self_eval_start');
    const jdCtx = jdResult
      ? `目标岗位：${jdResult.job_profile || '—'}\n硬性要求：${JSON.stringify(jdResult.hard_requirements || {})}\n筛选优先级：${JSON.stringify(jdResult.screening_priority || [])}\n关键词：${(jdResult.keyword_list || []).join('、')}`
      : '未提供 JD（按通用应届生标准）';
    // P2-2 原文优先级：step1「自我评价」模块原文 > 上传原文 text > 岗位已存 resumeSummary（刷新后 text 丢失的兜底）> JSON.stringify 降级
    const seMod =
      result?.modules?.find((x) => x.name === '自我评价') ||
      result?.modules?.find((x) => x.name?.includes('自我评价'));
    const resumeContent = seMod?.content || text || getResumeSummary() || (result ? JSON.stringify(result) : '');
    const messages = [
      {
        role: 'user',
        content: `${jdCtx}\n\n请基于以下简历内容，生成一段针对性自我评价（总分总结构，3-5 个能力点，400-600 字）。\n\n【简历内容】\n${resumeContent}`,
      },
    ];
    let acc = '';
    try {
      for await (const msg of api.selfEval(messages, settings) as AsyncGenerator<SSEMessage>) {
        if (msg.type === 'token') {
          acc += msg.text;
          setSeOut(acc);
        } else if (msg.type === 'error') message.error(msg.message);
      }
      if (acc) setSelfEval(activeJobId ?? 'none', acc); // P2-2 完成即持久化
    } catch (e: any) {
      message.error(e.message);
    }
    setSeLoading(false);
    track('resume_self_eval_done', { output_length: seOut.length });
  };

  const copySelfEval = () => {
    if (!seOut) return;
    navigator.clipboard.writeText(seOut).then(
      () => message.success('已复制'),
      () => message.error('复制失败')
    );
  };

  return (
    <div className="tab-content">
      <div className="ra-cols">
        {/* 左:JD 对照（手机端默认折叠） */}
        <div className="ra-side">
          {hasBaseline ? (
            <Collapse
              ghost
              className="sidebar-collapse"
              items={[
                {
                  key: 'jd',
                  label: (
                    <Space>
                      <ThunderboltOutlined className="icon-primary" />
                      对照 JD{jobName ? ` · ${jobName}` : ''}（只读）
                      <Tag color="success" bordered={false}>已联动</Tag>
                    </Space>
                  ),
                  extra: onGotoJD ? (
                    <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); onGotoJD(); }}>
                      去拆解 <RightOutlined />
                    </Button>
                  ) : null,
                  children: <JDResultBrief data={jdResult} />,
                },
              ]}
            />
          ) : (
            <Card
              size="small"
              className="sidebar-card sidebar-empty"
              title={
                <Space>
                  对照 JD{jobName ? ` · ${jobName}` : ''}（只读）
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
            <FileUpload
              settings={settings}
              onText={setText}
              label="点击或拖拽上传（PDF / Word / HTML / Markdown / TXT）"
              onUpload={(file) => {
                uploadSource.current = 'upload';
                const ext = file.name.split('.').pop()?.toLowerCase() || '';
                track('resume_analysis_start', { source: 'upload', file_type: ext, file_size_bytes: file.size });
              }}
            />
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
                onClick={() => setSeOpen(true)}
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
            <Dropdown menu={{ items: [
              { key: 'pdf', label: '导出 PDF', icon: <FilePdfOutlined /> },
              { key: 'png', label: '导出图片 (PNG)', icon: <FileImageOutlined /> },
            ], onClick: (e) => {
              if (e.key === 'pdf') exportPdf();
              else if (e.key === 'png') exportPng();
            }}} trigger={['click']}>
              <Tooltip title="导出拆解报告为 PDF 或高清图片">
                <Button className="btn-share" disabled={!result || exporting} loading={exporting}>
                  导出 <DownOutlined />
                </Button>
              </Tooltip>
            </Dropdown>
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
          <div className="step-detail-enter" ref={resultRef}>
            {result ? <ResumeResultView data={result} onRewriteModule={onRewriteModule} /> : !loading ? <Empty description="上传简历，让领航员帮你匹配最合适的机会" /> : null}
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
          点击诊断区任一模块的「改写这段」可自动带入原文；也可直接粘贴要改写的模块（一段经历 / 项目描述等），领航员锚定目标 JD 给出改写建议。
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag color="processing" bordered={false}>当前锚定岗位</Tag>
          <Typography.Text strong>{jobName || '未命名岗位'}</Typography.Text>
        </div>
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
            点击下方「生成自我评价」，基于简历原文 + 目标 JD 生成 400-600 字总分总评价（首次生成会消耗一次模型调用）
          </Typography.Text>
        )}
        {seLoading && !seOut && (
          <Typography.Text type="secondary">生成中…</Typography.Text>
        )}
        {!seOut && !seLoading && (
          <Button
            type="primary"
            onClick={doSelfEval}
            disabled={!result}
            icon={<ThunderboltOutlined />}
            className="drawer-action"
          >
            生成自我评价
          </Button>
        )}
        {seOut && (
          <Space>
            <Button
              onClick={() => { setSeOut(''); doSelfEval(); }}
              loading={seLoading}
              disabled={!result}
              icon={<RedoOutlined />}
            >
              重新生成
            </Button>
            <Button onClick={copySelfEval} icon={<CopyOutlined />}>
              复制
            </Button>
          </Space>
        )}
      </Drawer>
    </div>
  );
}
