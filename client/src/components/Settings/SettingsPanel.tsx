import { useEffect, useState } from 'react';
import { Modal, Alert, Tag, Typography } from 'antd';
import { Settings } from '../../types';
import { api, ModelCheckResult } from '../../api/client';

const { Text } = Typography;

export default function SettingsPanel({
  open,
  onClose,
  settings,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ModelCheckResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setResult(null);
    api
      .checkModel(settings)
      .then(setResult)
      .catch((e) => setResult({ status: 'error', error: e.message || '检测失败' }))
      .finally(() => setLoading(false));
  }, [open, settings]);

  const statusTag = loading ? (
    <Tag color="processing">检测中</Tag>
  ) : result?.status === 'ok' ? (
    <Tag color="success">服务正常</Tag>
  ) : result?.status === 'missing' ? (
    <Tag color="default">未配置</Tag>
  ) : result?.status === 'error' ? (
    <Tag color="error">服务异常</Tag>
  ) : (
    <Tag color="default">待检测</Tag>
  );

  const modelLine =
    result?.status === 'ok' && (result.provider || result.model)
      ? `${result.provider || ''}${result.provider && result.model ? ' · ' : ''}${result.model || ''}`
      : result?.status === 'missing'
        ? '服务端尚未配置模型'
        : '由服务端默认配置';

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={420} centered title="AI 模型状态">
      <Alert
        type="info"
        showIcon
        message="模型由 OfferPilot 服务端统一托管,无需上传 API Key。"
        style={{ marginBottom: 16 }}
      />
      <div style={{ marginBottom: 8 }}>当前状态:{' '}{statusTag}</div>
      <div style={{ marginBottom: 8 }}>
        <Text type="secondary">当前模型:</Text>{' '}
        <Text strong>{loading ? '检测中…' : modelLine}</Text>
      </div>
      {result?.status === 'error' && result.error && (
        <Alert type="error" showIcon message="服务异常" description={result.error} />
      )}
    </Modal>
  );
}
