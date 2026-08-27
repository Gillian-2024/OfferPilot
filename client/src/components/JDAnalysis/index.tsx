import { useState, useEffect, useRef } from 'react';
import { Button, Space, message, Card, Empty, Alert, Tag, Tooltip } from 'antd';
import {
  ThunderboltOutlined,
  ShareAltOutlined,
  ArrowRightOutlined,
  LinkOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  FileSearchOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import FileUpload from '../shared/FileUpload';
import Steps from '../shared/HorizontalSteps';
import { JDResultView } from '../shared/ResultViews';
import { api } from '../../api/client';
import { Settings, JDResult } from '../../types';
import { getActiveJob, getJDResult, setJDResult, addHistorySynced } from '../../store/local';
import { exportNodeToPdf, reportFilename } from '../../utils/exportPdf';
import { useSidebar } from '../../contexts/SidebarContext';

export default function JDAnalysis({ settings }: { settings: Settings }) {
  const { activeJobId, refreshJobs } = useSidebar();
  const [text, setText] = useState('');
  const [result, setResult] = useState<JDResult | null>(() => getJDResult());
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<{ label: string; done: boolean }[]>([]);
  const [shareUrl, setShareUrl] = useState('');
  const [exporting, setExporting] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  // 切岗位 / 刷新后回读该岗位已存的 JD 拆解（P0 修复：结果区不再会话态丢失）
  useEffect(() => {
    setResult(getJDResult());
  }, [activeJobId]);

  // P2-3 导出 PDF：结果容器整块截图（导出态隐藏交互元素），A4 分页
  const exportPdf = async () => {
    const node = resultRef.current;
    if (!node || !result) return;
    setExporting(true);
    try {
      const filename = reportFilename(getActiveJob()?.name || '未命名岗位', 'JD拆解');
      await exportNodeToPdf(node, filename, { exportClass: 'pdf-exporting' });
      message.success('PDF 已导出');
    } catch (e: any) {
      message.error(`导出失败：${e?.message || e}`);
    } finally {
      setExporting(false);
    }
  };

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
        <Tooltip title="导出当前拆解报告为 A4 PDF">
          <Button
            className="btn-share"
            disabled={!result || exporting}
            loading={exporting}
            icon={<FilePdfOutlined />}
            onClick={exportPdf}
          >
            导出 PDF
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
              已存入岗位「{getActiveJob()?.name || '未命名岗位'}」的上下文，切换到 <Tag color="processing" bordered={false}>简历拆解</Tag> Tab 将自动联动岗位画像 + 关键词
              <ArrowRightOutlined className="ml-4" />
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
