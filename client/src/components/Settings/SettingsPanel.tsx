import { useEffect } from 'react';
import { Form, Select, Input, Button, Space, Alert, Typography, Modal } from 'antd';
import { Settings, Provider } from '../../types';

const PROVIDERS: { value: Provider; label: string; hint: { baseUrl: string; model: string } }[] = [
  {
    value: 'claude',
    label: 'Anthropic（Claude Opus / Sonnet / Haiku）',
    hint: { baseUrl: 'https://api.anthropic.com', model: '' },
  },
  {
    value: 'openai',
    label: 'OpenAI（GPT）',
    hint: { baseUrl: 'https://api.openai.com/v1', model: '' },
  },
  {
    value: 'google',
    label: 'Google（Gemini）',
    hint: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: '' },
  },
  {
    value: 'deepseek',
    label: '深度求索（DeepSeek）',
    hint: { baseUrl: 'https://api.deepseek.com', model: '' },
  },
  {
    value: 'tongyi',
    label: '阿里-通义千问（Qwen）',
    hint: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '' },
  },
  {
    value: 'doubao',
    label: '字节-豆包（Seed）',
    hint: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: '' },
  },
  {
    value: 'moonshot',
    label: '月之暗面 （Kimi）',
    hint: { baseUrl: 'https://api.moonshot.cn/v1', model: '' },
  },
  {
    value: 'zhipu',
    label: '智谱（GLM）',
    hint: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: '' },
  },
  {
    value: 'minimax',
    label: 'MiniMax',
    hint: { baseUrl: 'https://api.minimax.chat/v1', model: '' },
  },
];

export default function SettingsPanel({
  open,
  onClose,
  settings,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (s: Settings) => void;
}) {
  const [form] = Form.useForm<Settings>();

  useEffect(() => {
    if (open) form.setFieldsValue(settings);
  }, [open, settings, form]);

  const onProviderChange = (v: Provider) => {
    const hint = PROVIDERS.find((p) => p.value === v)?.hint;
    if (hint) form.setFieldsValue({ baseUrl: hint.baseUrl, model: hint.model });
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={420}
      centered
      destroyOnClose
      title="模型设置"
    >
      <Alert
        type="info"
        showIcon
        message="API Key 仅存于本机浏览器"
        className="mb-16"
      />
      <Form form={form} layout="vertical" onFinish={onSave} initialValues={settings}>
        <Form.Item label="Provider（必选）" name="provider">
          <Select options={PROVIDERS.map((p) => ({ value: p.value, label: p.label }))} onChange={onProviderChange} />
        </Form.Item>
        <Form.Item label="API Key（必填）" name="apiKey">
          <Input.Password placeholder="留空 = 用服务端 .env" autoComplete="off" />
        </Form.Item>
        <Form.Item label="Base URL（默认）" name="baseUrl">
          <Input placeholder="可自定义修改" />
        </Form.Item>
        <Form.Item label="Model（必填）" name="model">
          <Input placeholder="必填，如 qwen-plus、glm-4-flash" />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit">
            保存
          </Button>
          <Button onClick={onClose}>取消</Button>
        </Space>
      </Form>
    </Modal>
  );
}
