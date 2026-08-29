import { useState, useEffect, useRef } from 'react';
import { Button, Space, message, Card, Empty, Alert, Tag, Tooltip, Dropdown } from 'antd';
import {
  ThunderboltOutlined,
  ShareAltOutlined,
  ArrowRightOutlined,
  LinkOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  FileSearchOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  DownOutlined,
} from '@ant-design/icons';
import FileUpload from '../shared/FileUpload';
import Steps from '../shared/HorizontalSteps';
import { JDResultView } from '../shared/ResultViews';
import { api } from '../../api/client';
import { Settings, JDResult } from '../../types';
import { getActiveJob, getJDResult, setJDResult, addHistorySynced, recordModelResult } from '../../store/local';
import { exportNodeToPdf, reportFilename, exportNodeToPng } from '../../utils/exportPdf';
import { useSidebar } from '../../contexts/SidebarContext';
import { track } from '../../utils/analytics';

export default function JDAnalysis({ settings, onGotoResume }: { settings: Settings; onGotoResume?: () => void }) {
  const { activeJobId, refreshJobs } = useSidebar();
  const [text, setText] = useState('');
  const [result, setResult] = useState<JDResult | null>(() => getJDResult());
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<{ label: string; done: boolean }[]>([]);
  const [shareUrl, setShareUrl] = useState('');
  const [exporting, setExporting] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const uploadSource = useRef<'upload' | null>(null);
  // 切岗位 / 刷新后回读该岗位已存的 JD 拆解（P0 修复：结果区不再会话态丢失）
  useEffect(() => {
    setResult(getJDResult());
  }, [activeJobId]);
  // P2-3 导出 PDF：结果容器整块截图（导出态隐藏交互元素），A4 分页
  const exportPdf = async () => {
    track('jd_pdf_export');
    const node = resultRef.current;
    if (!node || !result) return;
    setExporting(true);
    try {
      const filename = reportFilename(getActiveJob()?.name || '未命名岗位', 'JD拆解');
      await exportNodeToPdf(node, filename, { exportClass: 'pdf-exporting' });
      message.success('PDF 已导出');
      track('jd_pdf_export_done');
    } catch (e: any) {
      message.error(`导出失败：${e?.message || e}`);
      track('error_client', { context: 'jd_pdf_export', message: e.message || String(e) });
    } finally {
      setExporting(false);
    }
  };

  // P2-3 导出 PNG 高清截图：所见即所得，适合发朋友圈/小红书
  const exportPng = async () => {
    track('jd_png_export');
    const node = resultRef.current;
    if (!node || !result) return;
    setExporting(true);
    try {
      const filename = reportFilename(getActiveJob()?.name || '未命名岗位', 'JD拆解');
      await exportNodeToPng(node, `${filename.replace(/\.pdf$/, '')}.png`, { exportClass: 'pdf-exporting' });
      message.success('PNG 图片已导出');
      track('jd_png_export_done');
    } catch (e: any) {
      message.error(`导出失败：${e?.message || e}`);
      track('error_client', { context: 'jd_png_export', message: e.message || String(e) });
    } finally {
      setExporting(false);
    }
  };

  const analyze = async () => {
    if (!text.trim()) return message.warning('请先上传或粘贴 JD');
    if (uploadSource.current !== 'upload') {
      // Only track start for paste uploads; file uploads already fired jd_analysis_start in onUpload
      track('jd_analysis_start', { source: 'paste' });
    }
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
          recordModelResult(msg.model || settings.model || '', true);
          refreshJobs();
          addHistorySynced('jd', {
            id: Date.now().toString(),
            ts: Date.now(),
            title: text.slice(0, 30),
            data: msg.data,
            provider: msg.provider,
            model: msg.model,
            jobId: activeJobId ?? undefined,
          });
          const jobName = getActiveJob()?.name || '';
          message.success(`拆解完成，已存入岗位「${jobName}」`);
          track('jd_analysis_done', { steps: steps.length, provider: msg.provider, model: msg.model });
        } else if (msg.type === 'error') {
          message.error(msg.message);
          recordModelResult(settings.model || '', false);
          track('error_client', { context: 'jd_analyze', message: msg.message });
        }
      }
    } catch (e: any) {
      message.error(e.message);
      recordModelResult(settings.model || '', false);
      track('error_client', { context: 'jd_analyze', message: e.message });
    } finally {
      setLoading(false);
    }
  };

  const share = async () => {
    if (!result) return;
    track('jd_share_click');
    const r = await api.createShare({
      type: 'jd',
      title: `JD拆解 · ${result.job_type || ''}`,
      content: JSON.stringify(result, null, 2),
    });
    setShareUrl(`${location.origin}/share/${r.id}`);
    message.success('分享链接已生成');
    track('jd_share_done', { url: `${location.origin}/share/${r.id}` });
  };

  // P2-3 导出下拉菜单点击处理
  const handleExportMenuClick = (e: { key: string }) => {
    if (e.key === 'pdf') exportPdf();
    else if (e.key === 'png') exportPng();
  };

  const activeIdx = steps.findIndex((st) => !st.done);
  const displaySteps = steps.map((s, i) => ({ ...s, active: i === activeIdx }));

  return (
    <div className="tab-content">
      {/* 上传区 */}
      <Card size="small" className="mb-16 compact-upload-card" title={
        <Space>
          <FileSearchOutlined className="icon-primary" />
          上传 / 粘贴 JD
          <Tag color="default" bordered={false} style={{ fontSize: '10px', opacity: 0.65 }}>温馨提示：JD 即职位描述 + 职位要求</Tag>
        </Space>
      }>
        <FileUpload
          settings={settings}
          onText={setText}
          label="点击或拖拽上传（PDF / Word / HTML / Markdown / TXT）"
          onUpload={(file) => {
            const ext = file.name.split('.').pop()?.toLowerCase() || '';
            track('jd_analysis_start', { source: 'upload', file_type: ext, file_size_bytes: file.size });
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
        <Tooltip title="生成只读分享链接，对方无需登录">
          <Button
            className="btn-share"
            disabled={!result}
            icon={<ShareAltOutlined />}
            onClick={share}
          >
            一键分享
          </Button>
        </Tooltip>
        <Dropdown menu={{ items: [
          { key: 'pdf', label: '导出 PDF', icon: <FilePdfOutlined /> },
          { key: 'png', label: '导出图片 (PNG)', icon: <FileImageOutlined /> },
        ], onClick: handleExportMenuClick }} trigger={['click']}>
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
          icon={<LinkOutlined />}
          closable
          className="ra-share-alert"
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
          className="ra-share-alert"
          message={
            <span>
              已存入岗位「{getActiveJob()?.name || '未命名岗位'}」的上下文，切换到{' '}
              <a role="link" className="goto-resume" onClick={() => onGotoResume?.()}>
                简历拆解 <ArrowRightOutlined className="ml-4" />
              </a>{' '}
              Tab 将自动联动岗位画像 + 关键词
            </span>
          }
        />
      )}

      {/* 结果 */}
      <div className="step-detail-enter" ref={resultRef}>
        {result ? <JDResultView data={result} /> : !loading ? <Empty description="上传JD，让领航员帮你4 步拆出岗位画像与关键词" /> : null}
      </div>
    </div>
  );
}
